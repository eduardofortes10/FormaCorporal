-- Execute uma vez no SQL Editor do seu projeto Supabase.
-- As contas são gerenciadas pelo Supabase Auth, não pela tabela SQLite antiga.
create table public.assessment_collections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  records jsonb not null default '[]'::jsonb,
  revision integer not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now(),
  constraint records_array check (jsonb_typeof(records) = 'array'),
  constraint records_count check (jsonb_array_length(records) <= 1000),
  constraint records_size check (octet_length(records::text) <= 2097152)
);
alter table public.assessment_collections enable row level security;
revoke all on public.assessment_collections from anon, authenticated;
grant select on public.assessment_collections to authenticated;
create policy own_assessments on public.assessment_collections
  for select to authenticated using ((select auth.uid()) = user_id);

-- Único ponto de gravação: não recebe user_id e usa sempre o usuário autenticado.
create function public.save_assessments(expected_revision integer, new_records jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  current_revision integer;
  item jsonb;
  pair record;
  dates text[] := array[]::text[];
  ids text[] := array[]::text[];
  allowed text[] := array['id','date','notes','sex','age','bfMethod','weight','height','neck','shoulders','chest','waist','abdomen','hip','armRelaxedRight','armRelaxedLeft','armFlexedRight','armFlexedLeft','forearmRight','forearmLeft','thighRight','thighLeft','calfRight','calfLeft','arm','forearm','thigh','calf','sfChest','sfAxillary','sfTriceps','sfSubscapular','sfAbdomen','sfSuprailiac','sfThigh','fat'];
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
