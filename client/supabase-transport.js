export function makeTransport(client,{validRecord,prepareRecord,redirectTo}){
  const checked=result=>{if(result.error){if(['42P01','PGRST202','PGRST205'].includes(result.error.code))throw Error('Banco ainda não preparado. Execute a migração SQL do Forma no Supabase.');throw Error(result.error.message||'Falha no Supabase. Tente novamente.');}return result.data;};
  async function current(){return checked(await client.auth.getUser()).user;}
  return async(route,options={},expectedUser)=>{
    if(!client)throw Error('Configuração pendente: crie o projeto no Supabase e configure SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY na Vercel. Depois faça um novo deploy.');
    const data=options.body?JSON.parse(options.body):{};
    if(route==='/api/session'){
      const session=checked(await client.auth.getSession()).session;
      return {user:session?await current():null,allowRegistration:true};
    }
    if(route==='/api/register'){
      const result=checked(await client.auth.signUp({email:data.email,password:data.password,options:{emailRedirectTo:redirectTo}}));
      return {user:result.user,pendingConfirmation:!result.session};
    }
    if(route==='/api/login')return {user:checked(await client.auth.signInWithPassword(data)).user};
    const user=await current();if(!user)throw Error('Entre na sua conta para continuar.');
    if(!expectedUser||user.id!==expectedUser.id)throw Error('A conta mudou em outra aba. Recarregue a página antes de continuar.');
    if(route==='/api/logout'){checked(await client.auth.signOut({scope:'local'}));return {ok:true};}
    if(route==='/api/assessments'&&options.method==='PUT'){
      if(!Array.isArray(data.records)||data.records.length>1000||!data.records.every(validRecord))throw Error('Confira as avaliações. O limite é de 1.000 registros.');
      const records=data.records.map(prepareRecord);
      const result=checked(await client.rpc('save_assessments',{expected_revision:data.revision,new_records:records}));
      return {...result,records:result.records.map(prepareRecord)};
    }
    if(route==='/api/assessments'){
      const result=checked(await client.from('assessment_collections').select('records,revision').eq('user_id',user.id).maybeSingle());
      return result?{...result,records:result.records.map(prepareRecord)}:{records:[],revision:0};
    }
    throw Error('Operação não disponível.');
  };
}
