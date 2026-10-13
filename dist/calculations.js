import {validContext} from './experience-model.js';
export const bodyFields = {weight:['Peso','kg'],height:['Altura','cm'],neck:['Pescoço','cm'],shoulders:['Ombros','cm'],chest:['Tórax / peitoral','cm'],waist:['Cintura','cm'],abdomen:['Abdômen','cm'],hip:['Quadril','cm'],armRelaxedRight:['Braço direito relaxado','cm'],armRelaxedLeft:['Braço esquerdo relaxado','cm'],armFlexedRight:['Braço direito contraído','cm'],armFlexedLeft:['Braço esquerdo contraído','cm'],forearmRight:['Antebraço direito','cm'],forearmLeft:['Antebraço esquerdo','cm'],thighRight:['Coxa direita','cm'],thighLeft:['Coxa esquerda','cm'],calfRight:['Panturrilha direita','cm'],calfLeft:['Panturrilha esquerda','cm']};
export const legacyFields = {arm:['Braço — lado e condição não informados','cm'],forearm:['Antebraço — lado não informado','cm'],thigh:['Coxa — lado não informado','cm'],calf:['Panturrilha — lado não informado','cm']};
export const folds = {sfChest:['Dobra peitoral','mm'],sfAxillary:['Dobra axilar média','mm'],sfTriceps:['Dobra tricipital','mm'],sfSubscapular:['Dobra subescapular','mm'],sfAbdomen:['Dobra abdominal','mm'],sfSuprailiac:['Dobra suprailíaca','mm'],sfThigh:['Dobra da coxa','mm']};
export const fields = {...bodyFields,...legacyFields,...folds,fat:['BF / gordura corporal','%']};
export function estimateBF(r){
  const provided=Object.keys(folds).filter(k=>r[k]!=null);
  if(!provided.length)return {status:'empty',message:'Preencha as sete dobras para estimar o BF.'};
  if(provided.some(k=>!Number.isFinite(r[k])||r[k]<=0||r[k]>100))return {status:'invalid',message:'Cada dobra deve ser maior que 0 e no máximo 100 mm. Confira a unidade e o adipômetro.'};
  if(provided.length<7)return {status:'incomplete',message:`${provided.length} de 7 dobras registradas. Complete todas para calcular o BF.`};
  if(!['male','female'].includes(r.sex)||!Number.isInteger(r.age))return {status:'incomplete',message:'Informe o sexo usado na equação e a idade em anos completos na data da avaliação.'};
  const maxAge=r.sex==='male'?61:55;
  if(r.age<18||r.age>maxAge)return {status:'unsupported',message:`BF não calculado: esta equação usa a faixa de 18 a ${maxAge} anos. As medidas podem ser salvas.`};
  const sum=Object.keys(folds).reduce((s,k)=>s+r[k],0);
  const density=r.sex==='male'?1.112-.00043499*sum+.00000055*sum*sum-.00028826*r.age:1.097-.00046971*sum+.00000056*sum*sum-.00012828*r.age;
  const fat=495/density-450;
  if(!Number.isFinite(fat)||fat<=0||fat>=100)return {status:'invalid',message:'O resultado está fora do intervalo válido. Confira as medidas; elas não permitem uma estimativa por este método.'};
  return {status:'ok',fat,sum,density,method:'jp7-siri-v1'};
}
export function prepareRecord(r){const result=estimateBF(r);return {...r,fat:result.status==='ok'?result.fat:(Object.keys(folds).some(k=>r[k]!=null)?null:r.fat??null),bfMethod:result.status==='ok'?result.method:(Object.keys(folds).some(k=>r[k]!=null)?null:r.fat!=null?'reported':null)}}
export function delta(a,b){return Number.isFinite(a)&&Number.isFinite(b)?{absolute:b-a,relative:a===0?null:(b-a)/a*100}:null}
export function days(a,b){return Math.round((Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/86400000)}
export function validRecord(r){if(!r||!validContext(r.context)||typeof r.id!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(r.date))return false;const time=Date.parse(r.date+'T00:00:00Z');return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===r.date&&Object.keys(fields).every(k=>r[k]==null||(Number.isFinite(r[k])&&r[k]>0&&(k!=='fat'||r[k]<100)&&(!(k in folds)||r[k]<=100)))&&(r.sex==null||r.sex===''||['male','female'].includes(r.sex))&&(r.age==null||(Number.isInteger(r.age)&&r.age>0&&r.age<=120))&&typeof r.notes==='string'&&r.notes.length<=1000;}
