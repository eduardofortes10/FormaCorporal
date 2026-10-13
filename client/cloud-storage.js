import {createClient} from '@supabase/supabase-js';
import {createStorage as createUI} from '../dist/storage.js';
import {validRecord,prepareRecord} from '../dist/calculations.js';
import {makeTransport} from './supabase-transport.js';
const url=__SUPABASE_URL__,key=__SUPABASE_PUBLIC_KEY__;
export function createStorage(callbacks){
  const client=url&&key?createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}):null;
  return createUI({...callbacks,transport:makeTransport(client,{validRecord,prepareRecord,redirectTo:window.location.origin})});
}
