-- Execute após 001_assessments.sql. Não apaga avaliações.
begin;
create or replace function public.save_assessments(expected_revision integer, new_records jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  current_revision integer;
  item jsonb;
  pair record;
  dates text[] := array[]::text[];
  ids text[] := array[]::text[];
  allowed text[] := array['id','date','notes','context','sex','age','bfMethod','weight','height','neck','shoulders','chest','waist','abdomen','hip','armRelaxedRight','armRelaxedLeft','armFlexedRight','armFlexedLeft','forearmRight','forearmLeft','thighRight','thighLeft','calfRight','calfLeft','arm','forearm','thigh','calf','sfChest','sfAxillary','sfTriceps','sfSubscapular','sfAbdomen','sfSuprailiac','sfThigh','fat'];
begin
  if actor is null then raise exception 'Entre na sua conta para continuar.'; end if;
  if expected_revision is null or expected_revision < 0 or new_records is null or jsonb_typeof(new_records) <> 'array' then raise exception 'Dados inválidos.'; end if;
  if jsonb_array_length(new_records) > 1000 or octet_length(new_records::text) > 2097152 then raise exception 'Limite de avaliações ou tamanho excedido.'; end if;
  for item in select value from jsonb_array_elements(new_records) loop
    if jsonb_typeof(item) <> 'object' or not (item ?& array['id','date','notes']) then raise exception 'Avaliação inválida.'; end if;
    if jsonb_typeof(item->'id') is distinct from 'string' or (item->>'id') !~ '^[-a-zA-Z0-9_]{1,100}$' or jsonb_typeof(item->'date') is distinct from 'string' or (item->>'date') !~ '^\d{4}-\d{2}-\d{2}$' or jsonb_typeof(item->'notes') is distinct from 'string' or length(item->>'notes') > 1000 then raise exception 'Confira identificação, data e observações.'; end if;
    if to_char((item->>'date')::date,'YYYY-MM-DD') <> item->>'date' then raise exception 'Data inválida.'; end if;
    if (item->>'id') = any(ids) or (item->>'date') = any(dates) then raise exception 'Avaliações duplicadas.'; end if;
    ids := array_append(ids,item->>'id'); dates := array_append(dates,item->>'date');
    for pair in select * from jsonb_each(item) loop
      if not pair.key = any(allowed) then raise exception 'Campo não reconhecido.'; end if;
      if pair.key = 'context' then
        if pair.value <> 'null'::jsonb and (jsonb_typeof(pair.value) <> 'object' or octet_length(pair.value::text)>1500) then raise exception 'Contexto inválido.'; end if;
        if pair.value <> 'null'::jsonb then
          if (pair.value - array['time','training','conditions']) <> '{}'::jsonb then raise exception 'Campo de contexto inválido.'; end if;
          if pair.value->>'time' is not null and (jsonb_typeof(pair.value->'time') <> 'string' or (pair.value->>'time'<>'' and (pair.value->>'time') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')) then raise exception 'Horário inválido.'; end if;
          if pair.value->>'training' is not null and (pair.value->>'training') not in ('','rest','before','after') then raise exception 'Treino inválido.'; end if;
          if pair.value->>'conditions' is not null and (jsonb_typeof(pair.value->'conditions')<>'string' or length(pair.value->>'conditions')>300) then raise exception 'Condições inválidas.'; end if;
        end if;
        continue;
      end if;
      if pair.key in ('id','date','notes','bfMethod') or pair.value = 'null'::jsonb then continue; end if;
      if pair.key = 'sex' then
        if pair.value not in ('"male"'::jsonb,'"female"'::jsonb,'""'::jsonb) then raise exception 'Sexo da equação inválido.'; end if;
      else
        if jsonb_typeof(pair.value) <> 'number' then raise exception 'Medidas devem ser números.'; end if;
        if pair.value::text::numeric <= 0 then raise exception 'Medidas devem ser positivas.'; end if;
        if pair.key = 'age' and (pair.value::text::numeric > 120 or trunc(pair.value::text::numeric) <> pair.value::text::numeric) then raise exception 'Idade inválida.'; end if;
        if pair.key = 'fat' and pair.value::text::numeric >= 100 then raise exception 'BF inválido.'; end if;
        if pair.key like 'sf%' and pair.value::text::numeric > 100 then raise exception 'Dobra inválida.'; end if;
      end if;
    end loop;
  end loop;
  insert into public.assessment_collections(user_id) values(actor) on conflict do nothing;
  select revision into current_revision from public.assessment_collections where user_id=actor for update;
  if current_revision <> expected_revision then raise exception 'Outra aba ou dispositivo atualizou as avaliações. Recarregue antes de salvar.'; end if;
  update public.assessment_collections set records=new_records, revision=revision+1, updated_at=now() where user_id=actor;
  return jsonb_build_object('records',new_records,'revision',current_revision+1);
end;
$$;
revoke all on function public.save_assessments(integer,jsonb) from public, anon;
grant execute on function public.save_assessments(integer,jsonb) to authenticated;

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferences jsonb not null default '{"goals":[],"reminder":null}',
  revision integer not null default 0,
  constraint preferences_size check(octet_length(preferences::text)<=12000)
);
alter table public.user_preferences enable row level security;
revoke all on public.user_preferences from anon,authenticated;
grant select on public.user_preferences to authenticated;
drop policy if exists own_preferences on public.user_preferences;
create policy own_preferences on public.user_preferences for select to authenticated using ((select auth.uid())=user_id);
create or replace function public.save_preferences(expected_revision integer,new_preferences jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); current_revision integer; goal jsonb; identifiers text[]:=array[]::text[];
begin
  if actor is null then raise exception 'Entre na sua conta.'; end if;
  if expected_revision is null or expected_revision<0 or new_preferences is null or jsonb_typeof(new_preferences) is distinct from 'object' or octet_length(new_preferences::text)>12000 then raise exception 'Preferências inválidas.'; end if;
  if jsonb_typeof(new_preferences->'goals') is distinct from 'array' or jsonb_array_length(new_preferences->'goals')>6 then raise exception 'Limite de seis metas.'; end if;
  if new_preferences->>'reminder' is not null then
    if (new_preferences->>'reminder') !~ '^\d{4}-\d{2}-\d{2}$' or to_char((new_preferences->>'reminder')::date,'YYYY-MM-DD')<>new_preferences->>'reminder' then raise exception 'Data inválida.'; end if;
  end if;
  for goal in select value from jsonb_array_elements(new_preferences->'goals') loop
    if jsonb_typeof(goal) is distinct from 'object' or not(goal ?& array['id','metric','target','date','startDate','baseline']) then raise exception 'Meta inválida.'; end if;
    if jsonb_typeof(goal->'id') is distinct from 'string' or (goal->>'id') !~ '^[-a-zA-Z0-9_]{1,100}$' or (goal->>'id')=any(identifiers) then raise exception 'Identificação inválida.'; end if;
    identifiers:=array_append(identifiers,goal->>'id');
    if (goal->>'metric') is null or (goal->>'metric') not in ('weight','height','neck','shoulders','chest','waist','abdomen','hip','armRelaxedRight','armRelaxedLeft','armFlexedRight','armFlexedLeft','forearmRight','forearmLeft','thighRight','thighLeft','calfRight','calfLeft','arm','forearm','thigh','calf','sfChest','sfAxillary','sfTriceps','sfSubscapular','sfAbdomen','sfSuprailiac','sfThigh','fat') then raise exception 'Medida inválida.'; end if;
    if jsonb_typeof(goal->'target') is distinct from 'number' or (goal->>'target')::numeric<=0 or ((goal->>'metric')='fat' and (goal->>'target')::numeric>=100) then raise exception 'Valor inválido.'; end if;
    if goal->'baseline'<>'null'::jsonb and (jsonb_typeof(goal->'baseline') is distinct from 'number' or (goal->>'baseline')::numeric<=0) then raise exception 'Base inválida.'; end if;
    if jsonb_typeof(goal->'date') is distinct from 'string' or jsonb_typeof(goal->'startDate') is distinct from 'string' or (goal->>'date')!~'^\d{4}-\d{2}-\d{2}$' or (goal->>'startDate')!~'^\d{4}-\d{2}-\d{2}$' or to_char((goal->>'date')::date,'YYYY-MM-DD')<>goal->>'date' or to_char((goal->>'startDate')::date,'YYYY-MM-DD')<>goal->>'startDate' or (goal->>'date')::date<(goal->>'startDate')::date then raise exception 'Prazo inválido.'; end if;
  end loop;
  insert into public.user_preferences(user_id) values(actor) on conflict do nothing;
  select revision into current_revision from public.user_preferences where user_id=actor for update;
  if current_revision<>expected_revision then raise exception 'Outra aba atualizou suas metas. Recarregue antes de salvar.'; end if;
  update public.user_preferences set preferences=new_preferences,revision=revision+1 where user_id=actor;
  return jsonb_build_object('preferences',new_preferences,'revision',current_revision+1);
end; $$;
revoke all on function public.save_preferences(integer,jsonb) from public,anon;
grant execute on function public.save_preferences(integer,jsonb) to authenticated;

-- Fotos privadas. O nome começa pelo UUID da conta autenticada.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('progress-photos','progress-photos',false,1048576,array['image/jpeg'])
on conflict(id) do update set public=false,file_size_limit=1048576,allowed_mime_types=array['image/jpeg'];
drop policy if exists forma_photos_read on storage.objects;
drop policy if exists forma_photos_insert on storage.objects;
drop policy if exists forma_photos_delete on storage.objects;
create policy forma_photos_read on storage.objects for select to authenticated
using(bucket_id='progress-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);
create or replace function public.forma_photo_quota() returns boolean
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); total integer;
begin
  if actor is null then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
  select count(*) into total from storage.objects where bucket_id='progress-photos' and (storage.foldername(name))[1]=actor::text;
  return total<40;
end; $$;
revoke all on function public.forma_photo_quota() from public,anon;
grant execute on function public.forma_photo_quota() to authenticated;
create policy forma_photos_insert on storage.objects for insert to authenticated
with check(bucket_id='progress-photos' and (storage.foldername(name))[1]=(select auth.uid())::text and name ~ '^[a-f0-9-]{36}/[0-9]{4}-[0-9]{2}-[0-9]{2}_(front|side|back)_[a-f0-9-]{36}\.jpg$' and public.forma_photo_quota());
create policy forma_photos_delete on storage.objects for delete to authenticated
using(bucket_id='progress-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);
commit;
