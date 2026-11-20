import {test} from 'node:test';
import assert from 'node:assert/strict';
import {seal,open} from '../scripts/crypto.mjs';
import {apps,parseResult,mergeSeries,collect,completeThrough,hkDay} from '../scripts/moonfox.mjs';
const team='a'.repeat(43);
const fixture=pkg=>({code:2000,data:{app:{pkg},userRise:[{date:'20261118',value:0}],dau:[{date:'20261118',value:100}],riseMonth:[{date:'202611',value:50}],mau:[{date:'202611',value:250}]}});
const seed=()=>Object.fromEntries(['daily_new','dau','monthly_new','mau'].map(metric=>[metric,{[metric==='dau'||metric==='daily_new'?'2026-11-17':'2026-10']:Object.fromEntries(Object.keys(apps).map(name=>[name,10]))}]));
test('encrypted content authenticates key, domain and ciphertext',()=>{
  const original=Buffer.from('private financial observations');const packed=seal(original,team,'test/');
  assert.deepEqual(open(packed,team,'test/'),original);
  assert.throws(()=>open(packed,'b'.repeat(43),'test/'));assert.throws(()=>open(packed,team,'wrong/'));
  packed[12]^=1;assert.throws(()=>open(packed,team,'test/'));
});
test('MoonFox validates identity, date and count, and preserves observed zero',()=>{
  const result=fixture('test.pkg');const parsed=parseResult(result,'test.pkg','2026-11-01','2026-11-19');assert.equal(parsed.daily_new['2026-11-18'],0);
  assert.throws(()=>parseResult(result,'wrong.pkg','2026-11-01','2026-11-19'));
  result.data.userRise[0].value=-1;assert.throws(()=>parseResult(result,'test.pkg','2026-11-01','2026-11-19'));
  result.data.userRise[0]={date:'20261301',value:1};assert.throws(()=>parseResult(result,'test.pkg','2026-11-01','2026-12-31'));
});
test('partial daily coverage is not called complete and history is retained',()=>{
  const current=seed(),name=Object.keys(apps)[0],part=parseResult(fixture(apps[name]),apps[name],'2026-11-01','2026-11-19');
  const merged=mergeSeries(current,[[name,part]]);
  assert.equal(completeThrough(merged,'dau'),'2026-11-17');assert.deepEqual(current,seed());
  assert.equal(merged.dau['2026-11-17'][name],10);assert.equal(merged.dau['2026-11-18'][Object.keys(apps)[1]],null);
});
test('one failed app aborts the batch without mutating history',async()=>{
  const current=seed();let calls=0;
  await assert.rejects(collect(current,{key:'test',secret:'test',day:'2026-11-20',sleep:async()=>{},fetcher:async url=>{
    if(++calls===3)throw Error('upstream timeout');
    return {ok:true,json:async()=>fixture(new URL(url).searchParams.get('pkg'))};
  }}));assert.deepEqual(current,seed());
});
test('Hong Kong calendar rolls over independently of runner timezone',()=>{
  assert.equal(hkDay(new Date('2026-11-19T16:01:00Z')),'2026-11-20');
});
