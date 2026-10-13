import {createApp} from './app.mjs';
const port=Number(process.env.PORT||3000);
if(!Number.isInteger(port)||port<1||port>65535)throw Error('PORT inválida.');
const {server}=await createApp({databasePath:process.env.DATABASE_PATH||'./data/forma.sqlite',origin:process.env.APP_ORIGIN||'http://localhost:3000',production:process.env.NODE_ENV==='production',allowRegistration:process.env.ALLOW_REGISTRATION!=='false'});
server.listen(port,process.env.HOST||'127.0.0.1',()=>console.log(`Forma disponível em ${process.env.APP_ORIGIN||'http://localhost:3000'}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),10000).unref();});
