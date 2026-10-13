import {fields,legacyFields,prepareRecord,estimateBF,days} from './calculations.js';
export function assessChange(start,end,{direction='neutral',target=null,comparable=true}={}){
  if(!Number.isFinite(start)||!Number.isFinite(end))return {status:'missing',change:null,relative:null};
  const change=end-start,relative=start?change/start*100:null;
  if(!comparable)return {status:'incompatible',change,relative};
  if(Math.abs(change)<1e-9)return {status:'maintained',change:0,relative:0};
  let improvement=null;
  if(Number.isFinite(target))improvement=Math.abs(start-target)-Math.abs(end-target);
  else if(direction==='increase')improvement=change;
  else if(direction==='decrease')improvement=-change;
  else if(direction==='maintain')improvement=-Math.abs(change);
  return {status:improvement===null?'unrated':Math.abs(improvement)<1e-9?'equal-distance':improvement>0?'improved':'worsened',change,relative};
}
export function journeyComparison(records,goals=[],directions={}){
  const sorted=[...records].sort((a,b)=>a.date.localeCompare(b.date));
  if(sorted.length<2||sorted[0].date>=sorted.at(-1).date)return null;
  const first=prepareRecord(sorted[0]),last=prepareRecord(sorted.at(-1)),aBF=estimateBF(first),bBF=estimateBF(last);
  const bfComparable=aBF.status==='ok'&&bBF.status==='ok'&&first.sex===last.sex;
  const specs=Object.entries(fields).filter(([key])=>!Object.hasOwn(legacyFields,key)||first[key]!=null||last[key]!=null).map(([key,[label,unit]])=>({key,label,unit,start:first[key],end:last[key],comparable:key!=='fat'||bfComparable}));
  for(const [key,label,factor] of [['fatMass','Massa de gordura estimada',1],['fatFreeMass','Massa livre de gordura estimada',-1]]){
    const value=(r,result)=>Number.isFinite(r.weight)&&result.status==='ok'?r.weight*(factor===1?result.fat/100:1-result.fat/100):null;
    specs.push({key,label,unit:'kg',start:value(first,aBF),end:value(last,bBF),comparable:bfComparable});
  }
  const rows=specs.map(row=>{const goal=goals.filter(g=>g.metric===row.key).at(-1),choice=directions[row.key]||'goal';const target=choice==='goal'?goal?.target:null,direction=choice==='goal'?'neutral':choice;
    return {...row,choice,target,...assessChange(row.start,row.end,{target,direction,comparable:row.comparable})};
  });
  return {first,last,duration:days(first.date,last.date),rows};
}
