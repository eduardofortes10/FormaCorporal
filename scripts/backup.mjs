import {DatabaseSync,backup} from 'node:sqlite';
import {mkdirSync,existsSync} from 'node:fs';
import path from 'node:path';
const source=path.resolve(process.env.DATABASE_PATH||'./data/forma.sqlite');
const destination=path.resolve(process.argv[2]||`./backups/forma-${new Date().toISOString().replace(/[:.]/g,'-')}.sqlite`);
if(!existsSync(source))throw Error('Banco não encontrado. Inicie o servidor antes de gerar um backup.');
if(existsSync(destination))throw Error('O arquivo de destino já existe. Escolha um novo nome.');
mkdirSync(path.dirname(destination),{recursive:true,mode:0o700});
const db=new DatabaseSync(source,{readOnly:true});
try{await backup(db,destination);console.log(`Backup criado: ${destination}`);}finally{db.close();}
