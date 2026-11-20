import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const context=vm.createContext({document:{addEventListener(){}},URLSearchParams});
for(const file of ['periods.js','moonfox.js'])vm.runInContext(readFileSync(new URL('../site/assets/institution-v3/'+file,import.meta.url),'utf8'),context);
const {moonSelection,moonPeriodRows,dayShift}=vm.runInContext('({moonSelection,moonPeriodRows,dayShift})',context);
const plain=value=>JSON.parse(JSON.stringify(value));
function fixture(first,last){
  const series={daily_new:{},dau:{},monthly_new:{},mau:{}};
  let value=1;
  for(let day=first;day<=last;day=dayShift(day,1),value++){
    series.daily_new[day]={Bank:value,Zero:0};
    series.dau[day]={Bank:value*10,Zero:0};
  }
  return series;
}

test('every weekday is an inclusive week end, including weeks across New Year',()=>{
  const series=fixture('2025-12-22','2026-01-13');
  for(let weekEnd=0;weekEnd<7;weekEnd++){
    const rows=moonPeriodRows(series,{metric:'new',period:'week',weekEnd});
    const ends=Object.keys(rows);
    assert.equal(ends.length,weekEnd<=2?3:2);
    for(const end of ends){
      assert.equal(new Date(end+'T00:00:00Z').getUTCDay(),weekEnd);
      const expected=Array.from({length:7},(_,i)=>series.daily_new[dayShift(end,-i)].Bank).reduce((a,b)=>a+b,0);
      assert.equal(rows[end].Bank,expected);
      assert.equal(rows[end].Zero,0);
      assert.ok(dayShift(end,-6)>='2025-12-22');
      assert.ok(end<='2026-01-13');
    }
  }
});

test('weekly new users are summed and DAU is averaged over exactly seven dates',()=>{
  const series=fixture('2026-11-02','2026-11-15');
  const selected={period:'week',weekEnd:0};
  assert.equal(moonPeriodRows(series,{...selected,metric:'new'})['2026-11-08'].Bank,28);
  assert.equal(moonPeriodRows(series,{...selected,metric:'dau'})['2026-11-08'].Bank,40);
  assert.equal(moonPeriodRows(series,{...selected,metric:'new'})['2026-11-15'].Bank,77);
  assert.equal(moonPeriodRows(series,{...selected,metric:'dau'})['2026-11-15'].Bank,110);
});

test('missing observations stay unavailable, never estimated or treated as zero',()=>{
  const series=fixture('2026-11-02','2026-11-10');
  series.daily_new['2026-11-04'].Bank=null;
  delete series.dau['2026-11-04'];
  assert.equal(moonPeriodRows(series,{metric:'new',period:'week',weekEnd:0})['2026-11-08'].Bank,null);
  assert.equal(moonPeriodRows(series,{metric:'new',period:'week',weekEnd:0})['2026-11-08'].Zero,0);
  assert.equal(moonPeriodRows(series,{metric:'dau',period:'week',weekEnd:0})['2026-11-08'].Bank,null);
  assert.deepEqual(Object.keys(moonPeriodRows(series,{metric:'new',period:'week',weekEnd:0})),['2026-11-08']);
});

test('monthly and quarterly DAU use full calendar periods including leap day',()=>{
  const series=fixture('2024-01-01','2024-04-08');
  for(const row of Object.values(series.dau))row.Bank=10;
  series.dau['2024-02-29'].Bank=300;
  const months=moonPeriodRows(series,{metric:'dau',period:'month',weekEnd:5});
  assert.equal(months['2024-02'].Bank,20);
  assert.equal(months['2024-04'],undefined);
  const quarters=moonPeriodRows(series,{metric:'dau',period:'quarter',weekEnd:5});
  assert.equal(quarters['2024-Q1'].Bank,Math.round((90*10+300)/91));
  assert.equal(quarters['2024-Q2'],undefined);
});

test('monthly new users retain provider values and quarter totals require all three months',()=>{
  const series=fixture('2026-01-01','2026-04-15');
  series.monthly_new={'2026-01':{Bank:100},'2026-02':{Bank:200},'2026-03':{Bank:300},'2026-04':{Bank:999}};
  series.mau={'2026-01':{Bank:98765}};
  const months=moonPeriodRows(series,{metric:'new',period:'month',weekEnd:5});
  assert.equal(months['2026-01'].Bank,100);
  assert.equal(months['2026-04'],undefined);
  assert.deepEqual(plain(moonPeriodRows(series,{metric:'new',period:'quarter',weekEnd:5})),{'2026-Q1':{Bank:600}});
  const incomplete=structuredClone(series);delete incomplete.monthly_new['2026-02'];
  assert.deepEqual(plain(moonPeriodRows(incomplete,{metric:'new',period:'quarter',weekEnd:5})),{});
});

test('selection defaults to Friday, supports Sunday zero and migrates old metric links',()=>{
  assert.deepEqual(plain(moonSelection(new URLSearchParams())),{metric:'new',period:'week',weekEnd:5});
  assert.deepEqual(plain(moonSelection(new URLSearchParams('appMetric=dau&appPeriod=week&weekEnd=0'))),{metric:'dau',period:'week',weekEnd:0});
  assert.deepEqual(plain(moonSelection(new URLSearchParams('metric=platform_week_avg_dau'))),{metric:'dau',period:'week',weekEnd:0});
  assert.deepEqual(plain(moonSelection(new URLSearchParams('metric=monthly_new'))),{metric:'new',period:'month',weekEnd:5});
  assert.deepEqual(plain(moonSelection(new URLSearchParams('appMetric=invalid&appPeriod=invalid&weekEnd=7'))),{metric:'new',period:'week',weekEnd:5});
});
