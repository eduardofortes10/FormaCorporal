import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {makeTransport} from './supabase-transport.js';
import {validRecord,prepareRecord} from '../dist/calculations.js';
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
