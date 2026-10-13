import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export function openDatabase(filename){
  if(filename!==':memory:')mkdirSync(path.dirname(path.resolve(filename)),{recursive:true,mode:0o700});
  const db=new DatabaseSync(filename,{timeout:5000});
  db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  db.exec('CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL) STRICT;');
  const directory=fileURLToPath(new URL('./migrations/',import.meta.url));
  for(const name of readdirSync(directory).filter(n=>n.endsWith('.sql')).sort()){
    if(db.prepare('SELECT name FROM migrations WHERE name=?').get(name))continue;
    db.exec('BEGIN IMMEDIATE');
    try{db.exec(readFileSync(path.join(directory,name),'utf8'));db.prepare('INSERT INTO migrations VALUES (?,?)').run(name,Date.now());db.exec('COMMIT');}
    catch(error){db.exec('ROLLBACK');db.close();throw error;}
  }
  return db;
}
