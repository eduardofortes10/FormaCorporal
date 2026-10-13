import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {createApp} from './app.mjs';
const origin='http://localhost:3000',password='UmaSenhaDeTeste123!';
async function launch(options={}){const app=await createApp({origin,databasePath:':memory:',...options});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${app.server.address().port}`;return {...app,url,close:()=>new Promise(r=>app.server.close(r))};}
async function call(app,route,{method='GET',data,cookie,user,headers={}}={}){const res=await fetch(app.url+route,{method,headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...(user?{'X-Forma-User':user}:{}),...headers},body:data===undefined?undefined:JSON.stringify(data)});return {status:res.status,body:await res.json(),cookie:res.headers.get('set-cookie'),headers:res.headers};}
async function register(app,email){const result=await call(app,'/api/register',{method:'POST',data:{email,password}});assert.equal(result.status,201);return {cookie:result.cookie.split(';')[0],user:result.body.user.id};}

test('contas isoladas, origem, revisão e validação no servidor',async()=>{
  const app=await launch();try{
    assert.equal((await call(app,'/api/assessments')).status,401);
    assert.equal((await call(app,'/api/register',{method:'POST',headers:{Origin:'https://outro.example'},data:{email:'x@example.com',password}})).status,403);
    const a=await register(app,'a@example.com'),b=await register(app,'b@example.com');
    const saved=await call(app,'/api/assessments',{...a,method:'PUT',data:{revision:0,records:[{id:'a1',date:'2026-01-01',notes:'somente A',forearmRight:30,user_id:b.user}]}});
    assert.equal(saved.status,200);assert.equal(saved.body.revision,1);assert.equal(saved.body.records[0].user_id,undefined);
    assert.equal((await call(app,'/api/assessments',b)).body.records.length,0);
    assert.equal((await call(app,'/api/assessments',{...b,user:a.user})).status,409);
    assert.equal((await call(app,'/api/assessments',{...b,user:a.user,method:'PUT',data:{revision:0,records:[]}})).status,409);
    assert.equal((await call(app,'/api/assessments',{...a,method:'PUT',data:{revision:0,records:[]}})).status,409);
    assert.equal((await call(app,'/api/assessments',a)).body.records[0].notes,'somente A');
    assert.equal((await call(app,'/api/assessments',{...a,method:'PUT',data:{revision:1,records:[{id:'x',date:'2026-01-01',notes:'',weight:-1}]}})).status,400);
    assert.equal((await call(app,'/api/assessments',{...a,method:'PUT',data:{revision:1,records:[{id:'x',date:'2026-01-01',notes:''},{id:'y',date:'2026-01-01',notes:''}]}})).status,400);
    const empty=await call(app,'/api/assessments',{...a,method:'PUT',data:{revision:1,records:[{id:'x',date:'2026-01-01',notes:''}]}});assert.equal(empty.status,200);
    const clear=await call(app,'/api/assessments',{...a,method:'PUT',data:{revision:2,records:[]}});assert.equal(clear.status,200);assert.equal((await call(app,'/api/assessments',a)).body.records.length,0);
    assert.equal((await fetch(app.url+'/server/app.mjs')).status,404);assert.equal((await fetch(app.url+'/.env')).status,404);assert.equal((await fetch(app.url+'/data/forma.sqlite')).status,404);
  }finally{await app.close();}
});

test('senha protegida, login, sessão e logout',async()=>{const app=await launch();try{
  const a=await register(app,'case@example.com');const row=app.db.prepare('SELECT * FROM users').get();assert.ok(row.password_hash.startsWith('scrypt-v1:'));assert.ok(!row.password_hash.includes(password));
  assert.equal((await call(app,'/api/login',{method:'POST',data:{email:'case@example.com',password:'SenhaErrada12345'}})).status,401);
  const login=await call(app,'/api/login',{method:'POST',data:{email:'CASE@EXAMPLE.COM',password}});assert.equal(login.status,200);assert.match(login.cookie,/HttpOnly/);assert.match(login.cookie,/SameSite=Lax/);assert.ok(!app.db.prepare('SELECT token_hash FROM sessions').all().some(s=>s.token_hash===login.cookie.split(';')[0].split('=')[1]));
  assert.equal((await call(app,'/api/logout',{...a,method:'POST',data:{}})).status,200);assert.equal((await call(app,'/api/assessments',a)).status,401);
}finally{await app.close();}});

test('registros e sessão persistem após reiniciar o servidor',async()=>{const directory=await mkdtemp(path.join(os.tmpdir(),'forma-test-'));let app;try{const databasePath=path.join(directory,'test.sqlite');app=await launch({databasePath});const a=await register(app,'restart@example.com');await call(app,'/api/assessments',{...a,method:'PUT',data:{revision:0,records:[{id:'r',date:'2026-03-01',notes:'persistido',weight:78}]}});await app.close();app=await launch({databasePath});const data=await call(app,'/api/assessments',a);assert.equal(data.status,200);assert.equal(data.body.records[0].weight,78);assert.equal(data.body.revision,1);}finally{await app?.close();await rm(directory,{recursive:true,force:true});}});

test('BF é recalculado no servidor e campos desconhecidos não são armazenados',async()=>{const app=await launch();try{const a=await register(app,'bf@example.com');const r={id:'bf',date:'2026-01-01',notes:'',sfChest:10,sfAxillary:12,sfTriceps:14,sfSubscapular:16,sfAbdomen:18,sfSuprailiac:20,sfThigh:10,age:30,sex:'male',fat:99};const result=await call(app,'/api/assessments',{...a,method:'PUT',data:{revision:0,records:[r]}});assert.equal(result.status,200);assert.ok(Math.abs(result.body.records[0].fat-14.634639479188706)<1e-9);}finally{await app.close();}});

test('cadastro pode ser fechado e tentativas são limitadas',async()=>{const app=await launch({allowRegistration:false,authLimit:2});try{const data={email:'closed@example.com',password};assert.equal((await call(app,'/api/session')).body.allowRegistration,false);assert.equal((await call(app,'/api/register',{method:'POST',data})).status,403);await call(app,'/api/login',{method:'POST',data});assert.equal((await call(app,'/api/login',{method:'POST',data})).status,429);}finally{await app.close();}});

test('produção exige HTTPS e cookies seguros',async()=>{await assert.rejects(createApp({production:true,origin,databasePath:':memory:'}),/HTTPS/);const app=await launch({production:true,origin:'https://forma.example'});try{const result=await call(app,'/api/register',{method:'POST',headers:{Origin:'https://forma.example'},data:{email:'secure@example.com',password}});assert.equal(result.status,201);assert.match(result.cookie,/^__Host-forma_session=/);assert.match(result.cookie,/; Secure/);assert.equal(result.headers.get('cache-control'),'no-store');}finally{await app.close();}});

test('backup online restaura contas e avaliações sem perder gravações em WAL',async()=>{const directory=await mkdtemp(path.join(os.tmpdir(),'forma-backup-test-'));let app,restored;try{const source=path.join(directory,'source.sqlite'),target=path.join(directory,'backup.sqlite');app=await launch({databasePath:source});const a=await register(app,'backup@example.com');await call(app,'/api/assessments',{...a,method:'PUT',data:{revision:0,records:[{id:'backup',date:'2026-02-01',notes:'backup online',weight:80}]}});await promisify(execFile)(process.execPath,[fileURLToPath(new URL('../scripts/backup.mjs',import.meta.url)),target],{env:{...process.env,DATABASE_PATH:source}});restored=await launch({databasePath:target});const response=await call(restored,'/api/assessments',a);assert.equal(response.status,200);assert.equal(response.body.records[0].notes,'backup online');assert.equal(response.body.revision,1);}finally{await app?.close();await restored?.close();await rm(directory,{recursive:true,force:true});}});
