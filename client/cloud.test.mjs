import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {makeTransport} from './supabase-transport.js';
import {validRecord,prepareRecord} from '../dist/calculations.js';

test('migração nova preserva avaliações, valida contexto e isola metas e objetos privados',async()=>{
const db=new PGlite();try{
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated,anon;insert into auth.users values ('${a}'),('${b}');
create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(bucket_id text,name text,primary key(bucket_id,name));alter table storage.objects enable row level security;create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;grant usage on schema storage to authenticated,anon;grant select,insert,delete on storage.objects to authenticated;`);
await db.exec(await readFile(new URL('../supabase/migrations/001_assessments.sql',import.meta.url),'utf8'));
await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${a}',false);select public.save_assessments(0,'[{"id":"old","date":"2026-01-01","notes":"preserved","weight":80}]');reset role;`);
const sql=await readFile(new URL('../supabase/migrations/002_experience.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
assert.equal((await db.query("select public from storage.buckets where id='progress-photos'")).rows[0].public,false);
await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${a}',false)`);
assert.equal((await db.query('select records from public.assessment_collections')).rows[0].records[0].notes,'preserved');
const r={id:'old',date:'2026-01-01',notes:'preserved',context:{time:'08:30',training:'rest',conditions:'Same tape'}};
await db.query('select public.save_assessments(1,$1::jsonb)',[JSON.stringify([r])]);
await assert.rejects(db.query('select public.save_assessments(2,$1::jsonb)',[JSON.stringify([{...r,context:{time:'25:00'}}])]),/Horário/);
await assert.rejects(db.query('select public.save_assessments(2,$1::jsonb)',[JSON.stringify([{...r,context:{script:'invalid'}}])]),/contexto/);
const preferences={goals:[{id:'goal',metric:'weight',target:75,date:'2027-01-01',startDate:'2026-01-01',baseline:80}],reminder:'2026-12-01'};
await db.query('select public.save_preferences(0,$1::jsonb)',[JSON.stringify(preferences)]);
await assert.rejects(db.query('select public.save_preferences(0,$1::jsonb)',[JSON.stringify(preferences)]),/Outra aba/);
await assert.rejects(db.query('select public.save_preferences(1,$1::jsonb)',[JSON.stringify({...preferences,goals:[{...preferences.goals[0],target:-1}]})]),/Valor/);
const name=`${a}/2026-01-01_front_11111111-1111-4111-8111-111111111111.jpg`;
await db.query("insert into storage.objects values('progress-photos',$1)",[name]);
await assert.rejects(db.query("insert into storage.objects values('progress-photos',$1)",[name.replace(a+'/',b+'/')]),/row-level security/);
await db.query("select set_config('request.jwt.claim.sub',$1,false)",[b]);
assert.equal((await db.query('select * from public.user_preferences')).rows.length,0);
assert.equal((await db.query('select * from storage.objects')).rows.length,0);
await db.query('delete from storage.objects where name=$1',[name]);
await assert.rejects(db.query('update public.user_preferences set revision=99'),/permission denied/);
await db.query("select set_config('request.jwt.claim.sub',$1,false)",[a]);
assert.equal((await db.query('select * from storage.objects')).rows.length,1);
for(let i=1;i<40;i++)await db.query("insert into storage.objects values('progress-photos',$1)",[`${a}/2026-01-01_front_11111111-1111-4111-8111-${String(i).padStart(12,'0')}.jpg`]);
await assert.rejects(db.query("insert into storage.objects values('progress-photos',$1)",[`${a}/2026-01-01_front_11111111-1111-4111-8111-999999999999.jpg`]),/row-level security/);
await db.exec('reset role;set role anon');await assert.rejects(db.query('select * from public.user_preferences'),/permission denied/);await assert.rejects(db.query('select * from storage.objects'),/permission denied/);
}finally{await db.close();}
});

test('transport photos limits every operation to the authenticated folder and short signed links',async()=>{
const calls=[],id='11111111-1111-4111-8111-111111111111',name='2026-01-01_front_11111111-1111-4111-8111-111111111111.jpg';
const client={auth:{getUser:async()=>({data:{user:{id}}})},storage:{from:bucket=>{assert.equal(bucket,'progress-photos');return {list:async folder=>{calls.push(folder);return {data:[{name}]}},createSignedUrl:async(path,seconds)=>{calls.push(path,seconds);return {data:{signedUrl:'https://example.test/photo'}}},remove:async paths=>{calls.push(...paths);return {data:{}}},upload:async(path,bytes,opts)=>{calls.push(path);assert.equal(opts.upsert,false);assert.equal(bytes[0],255);return {data:{}}}}}}};
const transport=makeTransport(client,{validRecord,prepareRecord,redirectTo:'https://example.test'});
await transport('/api/photos',{}, {id});await transport('/api/photos/read',{method:'POST',body:JSON.stringify({name})},{id});await transport('/api/photos/remove',{method:'POST',body:JSON.stringify({name})},{id});await transport('/api/photos',{method:'POST',body:JSON.stringify({name,data:'data:image/jpeg;base64,/9j/AAAA'})},{id});
assert.deepEqual(calls,[id,id+'/'+name,60,id+'/'+name,id+'/'+name]);
await assert.rejects(transport('/api/photos/read',{method:'POST',body:JSON.stringify({name:'../other.jpg'})},{id}),/Foto inválida/);
await assert.rejects(transport('/api/photos',{}, {id:'other'}),/conta mudou/);
});
test('migração PostgreSQL isola usuários e bloqueia gravação direta, dados inválidos e revisões antigas',async()=>{
  const db=new PGlite();try{
    await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated,anon;insert into auth.users values ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');`);
    await db.exec(await readFile(new URL('../supabase/migrations/001_assessments.sql',import.meta.url),'utf8'));
    const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
    await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[a]);
    const records=[{id:'one',date:'2026-10-13',notes:'Privado',weight:75}];
    const result=await db.query('select public.save_assessments($1,$2::jsonb) as value',[0,JSON.stringify(records)]);assert.equal(result.rows[0].value.revision,1);
    await assert.rejects(db.query('select public.save_assessments(0,$1::jsonb)',[JSON.stringify([])]),/Outra aba/);
    await assert.rejects(db.query('select public.save_assessments(1,$1::jsonb)',[JSON.stringify([{...records[0],id:null}])]),/identificação/);
    await assert.rejects(db.query('select public.save_assessments(1,$1::jsonb)',[JSON.stringify([{...records[0],weight:-1}])]),/positivas/);
    await assert.rejects(db.query('select public.save_assessments(1,$1::jsonb)',[JSON.stringify([{...records[0],user_id:b}])]),/reconhecido/);
    await assert.rejects(db.query('select public.save_assessments(1,$1::jsonb)',[JSON.stringify([{...records[0],date:'2026-02-30'}])]),/date/);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[b]);
    assert.equal((await db.query('select * from public.assessment_collections')).rows.length,0);
    await assert.rejects(db.query('update public.assessment_collections set revision=99'),/permission denied/);
    await db.query('select public.save_assessments(0,$1::jsonb)',[JSON.stringify([])]);
    assert.equal((await db.query('select user_id from public.assessment_collections')).rows[0].user_id,b);
    await db.exec('reset role;set role anon');await assert.rejects(db.query('select * from public.assessment_collections'),/permission denied/);await assert.rejects(db.query("select public.save_assessments(0,'[]'::jsonb)"),/permission denied/);
  }finally{await db.close();}
});
test('adaptador trata configuração ausente, confirmação de e-mail e troca de conta',async()=>{
  const helpers={validRecord,prepareRecord,redirectTo:'https://forma.example'};
  await assert.rejects(makeTransport(null,helpers)('/api/session'),/Configuração pendente/);
  const client={auth:{getSession:async()=>({data:{session:null}}),getUser:async()=>({data:{user:{id:'a'}}}),signUp:async()=>({data:{user:{id:'a'},session:null}})}};
  const transport=makeTransport(client,helpers);assert.equal((await transport('/api/session')).user,null);assert.equal((await transport('/api/register',{body:'{}'})).pendingConfirmation,true);await assert.rejects(transport('/api/assessments',{}, {id:'b'}),/conta mudou/);
});
