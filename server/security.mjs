import {randomBytes,scrypt as scryptCallback,timingSafeEqual,createHash} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(scryptCallback);
const options={N:32768,r:8,p:3,maxmem:64*1024*1024};
export async function hashPassword(password){const salt=randomBytes(16).toString('hex');const hash=await scrypt(password,salt,64,options);return `scrypt-v1:${salt}:${hash.toString('hex')}`;}
export async function checkPassword(password,stored){const [,salt,expected]=stored.split(':');const hash=await scrypt(password,salt,64,options);const decoded=Buffer.from(expected,'hex');return hash.length===decoded.length&&timingSafeEqual(hash,decoded);}
export const tokenHash=value=>createHash('sha256').update(value).digest('hex');
export const newToken=()=>randomBytes(32).toString('hex');
export function validPassword(value){return typeof value==='string'&&value.length>=12&&value.length<=128;}
export function normalizeEmail(value){if(typeof value!=='string'||value.length>254)return null;const email=value.trim().toLowerCase();return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)?email:null;}
export function createLimiter(limit=20,windowMs=15*60*1000){
  const attempts=new Map();
  return key=>{const now=Date.now();for(const [id,entry] of attempts)if(entry.until<=now)attempts.delete(id);let entry=attempts.get(key);if(!entry){if(attempts.size>=10000)return false;entry={count:0,until:now+windowMs};attempts.set(key,entry);}entry.count++;return entry.count<=limit;};
}
