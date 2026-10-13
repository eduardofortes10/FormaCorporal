import {test} from 'node:test';
import assert from 'node:assert/strict';
import {delta,days,validRecord} from './dist/calculations.js';
test('diferenças preservam precisão e sinal',()=>{assert.equal(delta(80,78).absolute,-2);assert.equal(delta(80,78).relative,-2.5);assert.equal(delta(20,18).absolute,-2);assert.equal(delta(null,18),null);assert.equal(delta(0,18).relative,null)});
test('intervalos usam datas de calendário',()=>{assert.equal(days('2024-02-01','2024-03-01'),29);assert.equal(days('2026-08-01','2026-09-01'),31)});
test('registros válidos e valores ausentes',()=>{assert.ok(validRecord({id:'a',date:'2026-01-01',weight:75.5,notes:''}));assert.ok(!validRecord({id:'a',date:'2026-02-30',weight:75,notes:''}));assert.ok(!validRecord({id:'a',date:'2026-01-01',weight:-2,notes:''}));assert.ok(!validRecord({id:'a',date:'2026-01-01',fat:100,notes:''}));assert.ok(!validRecord({id:'a',date:'2026-01-01',notes:''}))});
