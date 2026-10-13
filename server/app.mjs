import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {openDatabase} from './database.mjs';
import {hashPassword,checkPassword,validPassword,normalizeEmail,tokenHash,newToken,createLimiter} from './security.mjs';
import {fields,validRecord,prepareRecord,estimateBF} from '../dist/calculations.js';

import {emptyPreferences,validPreferences,validPhoto,photoName} from '../dist/experience-model.js';

const publicDir=fileURLToPath(new URL('../dist/',import.meta.url));
const MAX_BODY=2*1024*1024;
const SESSION_AGE=7*24*60*60;
const fail=(status,message)=>Object.assign(new Error(message),{status});
const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};

async function body(req){
  if(!req.headers['content-type']?.toLowerCase().startsWith('application/json'))throw fail(415,'Envie os dados como JSON.');
  if(Number(req.headers['content-length'])>MAX_BODY)throw fail(413,'Arquivo muito grande. Limite: 2 MB.');
  let bytes=0;const chunks=[];
  for await(const chunk of req){bytes+=chunk.length;if(bytes>MAX_BODY)throw fail(413,'Arquivo muito grande. Limite: 2 MB.');chunks.push(chunk);}
  try{const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!value||typeof value!=='object'||Array.isArray(value))throw Error();return value;}catch{throw fail(400,'JSON inválido.');}
}

export function cleanRecords(records){
  if(!Array.isArray(records)||records.length>1000)throw fail(400,'O limite é de 1.000 avaliações por conta.');
  const keys=['id','date','notes','context','sex','age',...Object.keys(fields)];
  const result=records.map(record=>{
    if(!record||typeof record!=='object')throw fail(400,'Avaliação inválida.');
    const safe=Object.fromEntries(keys.filter(k=>Object.hasOwn(record,k)).map(k=>[k,record[k]]));
    if(!validRecord(safe)||!/^[-a-zA-Z0-9_]{1,100}$/.test(safe.id)||estimateBF(safe).status==='invalid')throw fail(400,'Confira as datas, as medidas e os identificadores das avaliações.');
    return prepareRecord(safe);
  });
  if(new Set(result.map(r=>r.id)).size!==result.length||new Set(result.map(r=>r.date)).size!==result.length)throw fail(400,'Há avaliações com identificador ou data repetidos.');
  return result.sort((a,b)=>a.date.localeCompare(b.date));
}

export async function createApp({databasePath='./data/forma.sqlite',origin='http://localhost:3000',production=false,allowRegistration=true,authLimit=20}={}){
  const canonical=new URL(origin);if(canonical.origin!==origin||!['http:','https:'].includes(canonical.protocol)||canonical.username||canonical.password)throw Error('APP_ORIGIN deve conter somente a origem, sem caminho ou barra final.');
  if(production&&canonical.protocol!=='https:')throw Error('APP_ORIGIN deve usar HTTPS em produção.');
  const db=openDatabase(databasePath),cookieName=production?'__Host-forma_session':'forma_session';
  const dummyHash=await hashPassword(newToken());
  const limitIP=createLimiter(authLimit),limitEmail=createLimiter(authLimit);let activeHashes=0;
  function cookie(res,token,maxAge=SESSION_AGE){res.setHeader('Set-Cookie',`${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${production?'; Secure':''}`);}
  function session(req){const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1);if(!token||!/^\w{64}$/.test(token))return null;return db.prepare('SELECT users.id,users.email,users.revision,sessions.token_hash FROM sessions JOIN users ON users.id=sessions.user_id WHERE token_hash=? AND expires_at>?').get(tokenHash(token),Date.now());}
  function startSession(res,user){const token=newToken();db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(Date.now());db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(tokenHash(token),user.id,Date.now()+SESSION_AGE*1000);cookie(res,token);}
  function assessments(user){return {records:db.prepare('SELECT payload FROM assessments WHERE user_id=? ORDER BY date').all(user.id).map(row=>prepareRecord(JSON.parse(row.payload))),revision:db.prepare('SELECT revision FROM users WHERE id=?').get(user.id).revision};}
  const server=createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    if(production)res.setHeader('Strict-Transport-Security','max-age=31536000');
    try{
      const route=new URL(req.url,origin).pathname;
      if(route==='/healthz'&&req.method==='GET'){db.prepare('SELECT 1').get();return json(res,200,{ok:true});}
      if(route.startsWith('/api/')){
        if(!['GET','POST','PUT'].includes(req.method))throw fail(405,'Método não permitido.');
        if(req.method!=='GET'&&req.headers.origin!==origin)throw fail(403,'Origem da requisição não permitida. Reabra o endereço configurado do site.');
        if(req.method==='GET'&&route==='/api/session'){const user=session(req);return json(res,200,{user:user?{id:user.id,email:user.email}:null,allowRegistration});}
        if(req.method==='POST'&&['/api/register','/api/login'].includes(route)){
          if(!limitIP(req.socket.remoteAddress||'unknown'))throw fail(429,'Muitas tentativas. Aguarde 15 minutos.');
          const data=await body(req),email=normalizeEmail(data.email);
          if(!email||!validPassword(data.password))throw fail(400,'Informe um e-mail válido e uma senha de 12 a 128 caracteres.');
          if(!limitEmail(email))throw fail(429,'Muitas tentativas. Aguarde 15 minutos.');
          if(activeHashes>=2)throw fail(503,'O servidor está ocupado. Tente novamente em instantes.');
          activeHashes++;
          try{
            if(route==='/api/register'){
              if(!allowRegistration)throw fail(403,'Novos cadastros estão desativados.');
              const passwordHash=await hashPassword(data.password);
              if(db.prepare('SELECT id FROM users WHERE email=?').get(email))throw fail(409,'Não foi possível criar a conta com estes dados. Tente entrar.');
              const user={id:randomUUID(),email};db.prepare('INSERT INTO users (id,email,password_hash,created_at) VALUES (?,?,?,?)').run(user.id,email,passwordHash,Date.now());startSession(res,user);return json(res,201,{user});
            }
            const user=db.prepare('SELECT * FROM users WHERE email=?').get(email);
            const correct=await checkPassword(data.password,user?.password_hash||dummyHash);
            if(!user||!correct)throw fail(401,'E-mail ou senha incorretos.');
            startSession(res,user);return json(res,200,{user:{id:user.id,email:user.email}});
          }finally{activeHashes--;}
        }
        const user=session(req);if(!user)throw fail(401,'Entre na sua conta para continuar.');
        if(route==='/api/logout'&&req.method==='POST'){db.prepare('DELETE FROM sessions WHERE token_hash=?').run(user.token_hash);cookie(res,'',0);return json(res,200,{ok:true});}
        if(['/api/assessments','/api/preferences','/api/photos','/api/photos/read','/api/photos/remove'].includes(route)&&req.headers['x-forma-user']!==user.id)throw fail(409,'A conta mudou em outra aba. Recarregue a página antes de continuar.');
        if(route==='/api/assessments'&&req.method==='GET')return json(res,200,assessments(user));
        if(route==='/api/assessments'&&req.method==='PUT'){
          const data=await body(req);if(!Number.isSafeInteger(data.revision)||data.revision<0)throw fail(400,'Versão de dados inválida.');
          const records=cleanRecords(data.records);
          db.exec('BEGIN IMMEDIATE');
          try{
            const updated=db.prepare('UPDATE users SET revision=revision+1 WHERE id=? AND revision=?').run(user.id,data.revision);
            if(updated.changes!==1)throw fail(409,'Outra aba ou dispositivo atualizou suas avaliações. Exporte seu histórico atual e recarregue a página antes de tentar novamente.');
            db.prepare('DELETE FROM assessments WHERE user_id=?').run(user.id);
            const insert=db.prepare('INSERT INTO assessments VALUES (?,?,?,?)');for(const r of records)insert.run(user.id,r.id,r.date,JSON.stringify(r));db.exec('COMMIT');
          }catch(error){db.exec('ROLLBACK');throw error;}
          return json(res,200,{records,revision:data.revision+1});
        }
        if(route==='/api/preferences'){
          const row=db.prepare('SELECT payload,revision FROM preferences WHERE user_id=?').get(user.id);
          if(req.method==='GET')return json(res,200,{preferences:row?JSON.parse(row.payload):emptyPreferences(),revision:row?.revision||0});
          if(req.method==='PUT'){
            const data=await body(req);if(!validPreferences(data.preferences))throw fail(400,'Metas ou lembrete inválidos.');
            const current=db.prepare('SELECT revision FROM preferences WHERE user_id=?').get(user.id);
            if(data.revision!==(current?.revision||0))throw fail(409,'Outra aba atualizou suas metas. Recarregue antes de salvar.');
            db.prepare('INSERT INTO preferences VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET payload=excluded.payload,revision=excluded.revision').run(user.id,JSON.stringify(data.preferences),data.revision+1);
            return json(res,200,{preferences:data.preferences,revision:data.revision+1});
          }
        }
        if(route==='/api/photos'&&req.method==='GET')return json(res,200,{photos:db.prepare('SELECT name FROM photos WHERE user_id=? ORDER BY name').all(user.id)});
        if(route.startsWith('/api/photos')&&req.method==='POST'){
          const data=await body(req);if(!photoName.test(data.name||''))throw fail(400,'Foto inválida.');
          if(route==='/api/photos'){
            if(!validPhoto(data))throw fail(400,'Envie uma imagem JPEG de até 1 MB.');
            if(db.prepare('SELECT count(*) AS count FROM photos WHERE user_id=?').get(user.id).count>=40)throw fail(400,'Limite de 40 fotos. Exclua uma antes de enviar outra.');
            db.prepare('INSERT INTO photos VALUES (?,?,?)').run(user.id,data.name,data.data);return json(res,200,{ok:true});
          }
          if(route==='/api/photos/remove'){db.prepare('DELETE FROM photos WHERE user_id=? AND name=?').run(user.id,data.name);return json(res,200,{ok:true});}
          if(route==='/api/photos/read'){const photo=db.prepare('SELECT data FROM photos WHERE user_id=? AND name=?').get(user.id,data.name);if(!photo)throw fail(404,'Foto não encontrada.');return json(res,200,{url:photo.data});}
        }
        throw fail(404,'Rota não encontrada.');
      }
      if(!['GET','HEAD'].includes(req.method))throw fail(405,'Método não permitido.');
      const allowed=new Set(['index.html','app.js','calculations.js','progress.js','progress-model.js','style.css','progress.css','storage.js','auth.css','refresh.css','experience.js','experience-model.js','experience.css']);
      const filename=route==='/'?'index.html':route.slice(1);if(!allowed.has(filename))throw fail(404,'Arquivo não encontrado.');
      const data=await readFile(path.join(publicDir,filename));res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'})[path.extname(filename)]);res.writeHead(200);res.end(req.method==='HEAD'?undefined:data);
    }catch(error){if(res.headersSent){res.end();return;}if(!error.status)console.error('Falha interna:',error.code||error.name);json(res,error.status||500,{error:error.status?error.message:'Não foi possível concluir a operação. Tente novamente.'});}
  });
  server.requestTimeout=15000;server.headersTimeout=10000;
  server.on('close',()=>db.close());
  return {server,db};
}
