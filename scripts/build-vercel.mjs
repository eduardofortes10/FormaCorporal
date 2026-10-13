import {build} from 'esbuild';
import {cp,mkdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const url=process.env.SUPABASE_URL||'',key=process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY||'';
if(Boolean(url)!==Boolean(key))throw Error('Configure SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY juntas.');
if(url&&new URL(url).protocol!=='https:')throw Error('SUPABASE_URL deve usar HTTPS.');
if(key&&!key.startsWith('sb_publishable_')){
  let role;try{role=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString()).role;}catch{}
  if(role!=='anon')throw Error('Use somente chave pública publishable ou anon. Chaves secretas/service_role nunca podem entrar no frontend.');
}
const output=path.join(root,'vercel-dist');await mkdir(output,{recursive:true});
await cp(path.join(root,'dist'),output,{recursive:true});
await build({entryPoints:[path.join(root,'client/cloud-storage.js')],bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,outfile:path.join(output,'storage.js'),define:{__SUPABASE_URL__:JSON.stringify(url),__SUPABASE_PUBLIC_KEY__:JSON.stringify(key)},legalComments:'eof'});
await readFile(path.join(output,'index.html'));
console.log(url?'Build Vercel pronto com integração Supabase.':'Build Vercel pronto. Supabase ainda não configurado: a interface exibirá a configuração pendente.');
