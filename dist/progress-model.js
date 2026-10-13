import {folds,delta,estimateBF} from './calculations.js';
export function foldTransition(a,b,t){const position=Math.max(0,Math.min(1,Number.isFinite(t)?t:0));return Object.keys(folds).map(key=>{const start=Number.isFinite(a?.[key])?a[key]:null,end=Number.isFinite(b?.[key])?b[key]:null;const change=delta(start,end);return {key,start,end,change,value:change?start+(end-start)*position:position===0?start:position===1?end:null};})}
export function fatMassChange(a,b){if(!a||!b||a.date>=b.date)return null;const left=estimateBF(a),right=estimateBF(b);if(left.status!=='ok'||right.status!=='ok'||a.sex!==b.sex||!Number.isFinite(a.weight)||!Number.isFinite(b.weight))return null;const start=a.weight*left.fat/100,end=b.weight*right.fat/100;return {start,end,change:end-start};}
export function comparisonReady(a,b){return !!(a&&b&&a.id!==b.id&&a.date<b.date)}
// Marker area is proportional to thickness in mm, on a fixed scale across dates.
// This is a data symbol, not the area or volume of fat tissue.
export function markerRadius(mm){return Number.isFinite(mm)&&mm>0?Math.sqrt(mm)*3.1:0;}
