'use strict';

const moonLabels={
  report_new:'周新增（周报合计）', report_dau:'周均 DAU（周报）',
  daily_new:'日新增', monthly_new:'月新增', dau:'DAU', mau:'MAU',
  platform_week_avg_dau:'平台周均 DAU（周一至周日）', month_avg_dau:'月均 DAU', quarter_avg_dau:'季均 DAU'
};
let moonSnapshot, moonReader, moonProblem='', moonPending;
function teamId(){
  const incoming=params.get('team');
  if(incoming!==null)return incoming;
  try{return sessionStorage.getItem('moonfox.team')||'';}catch{return '';}
}
async function openTeamData(id,url,domain){
  if (!/^[\w-]{43}$/.test(id)) throw Error('这条团队链接不完整，请打开收到的完整链接。');
  const response=await stationFetch(url,{cache:'no-store'});
  if(!response.ok)throw Error('暂时无法读取数据，请刷新重试。');
  const bytes=new Uint8Array(await response.arrayBuffer());
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(domain+id));
  const key=await crypto.subtle.importKey('raw',hash,'AES-GCM',false,['decrypt']);
  let payload;
  try {
    payload=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.subarray(0,12)},key,bytes.subarray(12));
  }catch{throw Error('这条团队链接无法打开当前数据，请使用最新的团队链接。');}
  return JSON.parse(new TextDecoder().decode(payload));
}
function loadMoonView(){
  let owner=reviewAccess;
  if(!owner)try{owner=sessionStorage.getItem('weekly-review')||'';}catch{}
  const team=teamId(),id=team|| (owner?'owner':'');
  if(id!==moonReader){
    moonReader=id;moonSnapshot=null;moonProblem='';moonPending=null;
    if(id){
      const source=team?openTeamData(id,'/api/app-snapshot','moonfox-team-v1/'):
        stationFetch('/api/moonfox/series',{headers:{Authorization:'Bearer '+owner},cache:'no-store'}).then(r=>{
          if(!r.ok)throw Error('请从个人审阅入口重新打开。');return r.json();
        });
      moonPending=source.then(snapshot=>{
        if(moonReader!==id)return;
        moonSnapshot=withDailyAverages(snapshot);
        if(team)try{sessionStorage.setItem('moonfox.team',id);}catch{}
      }).catch(e=>{if(moonReader===id)moonProblem=e.message;}).finally(()=>{
        if(moonReader!==id)return;
        moonPending=null;
        if(page==='moonfox'){renderControls();renderResults();}
      });
    }
  }
}
function withDailyAverages(series){
  const days=Object.keys(series.dau).sort(),through=days.at(-1);
  for(const [source,metric] of [['daily_new','report_new'],['dau','report_dau']]){
    const values=series[source],allDays=Object.keys(values).sort(),latest=allDays.at(-1);
    const groups={};
    for(const day of allDays){
      const end=weekFriday(day);
      if(end>latest||dayShift(end,-6)<allDays[0]||Object.hasOwn(groups,end))continue;
      const apps=Object.keys(values[day]),row={};
      for(const name of apps){
        const obs=Array.from({length:7},(_,i)=>values[dayShift(end,-i)]?.[name]).filter(Number.isFinite);
        const sum=obs.reduce((a,b)=>a+b,0);
        row[name]=obs.length===7?(metric==='report_new'?sum:Math.round(sum/7)):null;
        if(metric==='report_new'&&name.includes('EleBank')&&obs.length===6){
          const estimate=sum*7/6,low=Math.floor(estimate);
          row[name]=estimate-low===0.5&&low%2===0?low:Math.round(estimate);
        }
      }
      groups[end]=row;
    }
    series[metric]=groups;
  }
  const spans=new Map(),dayText=d=>d.toISOString().slice(0,10);
  for(const date of days){
    const d=new Date(date+'T00:00:00Z'),y=d.getUTCFullYear(),m=d.getUTCMonth(),dow=(d.getUTCDay()+6)%7;
    const start=new Date(d.getTime()-dow*86400000),end=new Date(start.getTime()+6*86400000);
    const q=Math.floor(m/3);
    for(const [metric,id,first,last] of [
      ['platform_week_avg_dau',dayText(start)+'~'+dayText(end),dayText(start),dayText(end)],
      ['month_avg_dau',date.slice(0,7),date.slice(0,7)+'-01',dayText(new Date(Date.UTC(y,m+1,0)))],
      ['quarter_avg_dau',y+'-Q'+(q+1),dayText(new Date(Date.UTC(y,q*3,1))),dayText(new Date(Date.UTC(y,q*3+3,0)))]
    ]){
      if(!spans.has(id))spans.set(id,{metric,first,last,dates:[]});
      spans.get(id).dates.push(date);
    }
  }
  for(const [id,{metric,first,last,dates}] of spans){
    const stop=last<through?last:through;
    if(dates[0]!==first||dates.length!==(Date.parse(stop)-Date.parse(first))/86400000+1)continue;
    series[metric][id]=Object.fromEntries(Object.keys(series.dau[through]).map(app=>{
      const values=dates.map(d=>series.dau[d][app]);
      return [app,values.every(Number.isFinite)?Math.round(values.reduce((a,b)=>a+b,0)/values.length):null];
    }));
  }
  return series;
}
function moonMetric(){
  return Object.hasOwn(moonLabels,params.get('metric'))?params.get('metric'):'report_new';
}
function moonControls(){
  if(!moonSnapshot)return '';
  const options=Object.entries(moonLabels).map(([k,v])=>'<option value="'+k+'"'+(k===moonMetric()?' selected':'')+'>'+v+'</option>').join('');
  const apps=Object.keys(Object.values(moonSnapshot.dau).at(-1)||{});
  return '<select aria-label="App 指标" name="metric">'+options+'</select>'+select('app','全部 App',apps)+periodDateForm('appDate');
}
let redSnapshot,redPending,redProblem='';
function loadRedView(){
  if(redSnapshot||redPending||redProblem)return;
  redPending=stationFetch('/api/xhs',{cache:'no-store'}).then(r=>{
    if(!r.ok)throw Error('小红书资料暂时无法读取，请刷新重试。');
    return r.json();
  }).then(data=>{redSnapshot=data;}).catch(error=>{redProblem=error.message;}).finally(()=>{
    redPending=null;if(page==='xhs')renderResults();
  });
}
function moonTrend(){
  const rows=moonSnapshot[moonMetric()];
  const selection=dateSelection('appDate'),report=moonMetric().startsWith('report_');
  const dates=Object.keys(rows).filter(d=>dateMatch(interval(d,report),selection)).sort(),app=params.get('app');
  const names=Object.keys(Object.values(rows).at(-1)||{});
  return {dates,series:(names.includes(app)?[app]:names).map(label=>({label,values:dates.map(d=>rows[d][label]??null)})),unit:'人',customRange:selection.some(Boolean)};
}
function moonView(){
  $('count').textContent='';
  loadMoonView();
  if(!moonSnapshot){
    if(moonPending)return empty('正在读取 App 指标…');
    return empty(moonProblem||'请使用公司团队链接查看月狐 App 指标。');
  }
  const metric=moonMetric(),rows=moonSnapshot[metric];
  const trend=moonTrend(),dates=trend.dates.slice().reverse();
  if(!dates.length)return empty('所选日期没有这项指标。');
  const allApps=Object.keys(rows[dates[0]]);
  const app=params.get('app'),apps=allApps.includes(app)?[app]:allApps;
  const day=Object.keys(moonSnapshot.daily_new).sort().at(-1);
  const month=Object.keys(moonSnapshot.mau).sort().at(-1);
  const fmt=n=>Number.isFinite(n)?n.toLocaleString('zh-HK'):'—';
  const headers=apps.map(a=>'<th scope="col">'+esc(a)+'</th>').join('');
  const report=metric.startsWith('report_'),daily=metric==='daily_new'||metric==='dau';
  const contents=periodRows(dates.slice(0,limit),date=>apps.map(a=>'<td>'+fmt(rows[date][a])+'</td>').join(''),date=>report?dayShift(date,-6)+' 至 '+date:daily?reportingWeekLabel(date):'');
  $('count').textContent=dates.length+' 个时段';
  const teamURL=location.origin+location.pathname+'#moonfox?team='+encodeURIComponent(moonReader);
  return '<p class="notice">MoonFox iAPP · 日度截至 '+esc(day)+'，月度截至 '+esc(month)+'。周报从周六算至周五，周新增为七天合计，周均 DAU 为七天平均。'+
    (moonReader==='owner'?'':' <a class="link" href="'+esc(teamURL)+'">团队查看链接</a>')+'</p>'+marketTrendHTML(trend)+(report?weeklyComparison(rows,dates[0],apps):'')+'<div class="wrap"><table><thead><tr><th scope="col">日期 / 周期</th>'+headers+'</tr></thead><tbody>'+contents+'</tbody></table></div>'+
    (limit<dates.length?'<button id="more" class="more">查看更多</button>':'');
}
