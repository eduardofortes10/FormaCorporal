import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validContext,validPreferences,goalStatus,unusualChanges,validPhoto,validDate} from './dist/experience-model.js';
test('contexto, datas e metas rejeitam dados inválidos e preservam ausências',()=>{
assert.equal(validDate('2026-02-30'),false);assert.equal(validDate('2024-02-29'),true);
assert.equal(validContext({time:'25:00'}),false);assert.equal(validContext({conditions:'x'.repeat(301)}),false);assert.equal(validContext({time:'09:30',training:'rest',conditions:'Mesma fita'}),true);
const goal={id:'goal',metric:'weight',target:75,date:'2026-12-01',startDate:'2026-01-01',baseline:80};
assert.ok(validPreferences({goals:[goal],reminder:null}));assert.equal(validPreferences({goals:[{...goal,metric:'password'}],reminder:null}),false);
assert.equal(validPreferences({goals:[goal,goal],reminder:null}),false);assert.equal(validPreferences({goals:[{...goal,target:NaN}],reminder:null}),false);
assert.equal(goalStatus(goal,[{date:'2026-02-01',weight:77.5}]).progress,50);
assert.equal(goalStatus(goal,[{date:'2026-02-01',weight:83}]).progress,0);
assert.equal(goalStatus(goal,[{date:'2026-02-01',weight:74}]).progress,100);
assert.equal(goalStatus(goal,[{date:'2026-02-01',weight:null}]),null);
assert.equal(goalStatus({...goal,baseline:null},[{date:'2026-02-01',weight:77}]).progress,null);
assert.equal(unusualChanges({id:'b',date:'2026-02-01',weight:110},[{id:'a',date:'2026-01-01',weight:80}]).length,1);
assert.equal(unusualChanges({id:'b',date:'2026-02-01',weight:null},[{id:'a',date:'2026-01-01',weight:80}]).length,0);
assert.equal(validPhoto({name:'../outside.jpg',data:'data:image/jpeg;base64,/9j/AAAA'}),false);
});
