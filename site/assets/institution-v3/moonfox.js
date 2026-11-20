'use strict';

const moonWeekdays=['周日','周一','周二','周三','周四','周五','周六'];
const moonRowsCache=new WeakMap();
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
        moonSnapshot=snapshot;
        if(team)try{sessionStorage.setItem('moonfox.team',id);}catch{}
      }).catch(e=>{if(moonReader===id)moonProblem=e.message;}).finally(()=>{
        if(moonReader!==id)return;
        moonPending=null;
        if(page==='moonfox'){renderControls();renderResults();}
      });
    }
  }
}
function moonSelection(query=params){
  const legacy={
    report_new:['new','week',5],report_dau:['dau','week',5],
    daily_new:['new','day',5],monthly_new:['new','month',5],dau:['dau','day',5],
    mau:['dau','month',5],platform_week_avg_dau:['dau','week',0],
    month_avg_dau:['dau','month',5],quarter_avg_dau:['dau','quarter',5]
  };
  const old=Object.hasOwn(legacy,query.get('metric'))?legacy[query.get('metric')]:['new','week',5];
  const requestedEnd=query.get('weekEnd');
  return {
    metric:['new','dau'].includes(query.get('appMetric'))?query.get('appMetric'):old[0],
    period:['day','week','month','quarter'].includes(query.get('appPeriod'))?query.get('appPeriod'):old[1],
    weekEnd:requestedEnd!==null&&/^[0-6]$/.test(requestedEnd)?Number(requestedEnd):old[2]
  };
}
function moonWeekEnd(day,weekday){
  return dayShift(day,(weekday-new Date(day+'T00:00:00Z').getUTCDay()+7)%7);
}
function moonPeriodRows(series,selection){
  const {metric,period,weekEnd}=selection,key=[metric,period,weekEnd].join('/');
  let cache=moonRowsCache.get(series);
  if(!cache){cache=new Map();moonRowsCache.set(series,cache);}
  if(cache.has(key))return cache.get(key);
  const daily=series[metric==='new'?'daily_new':'dau']||{};
  const days=Object.keys(daily).sort(),first=days[0],through=days.at(-1);
  let rows={};
  if(period==='day')rows=daily;
  else if(metric==='new'&&(period==='month'||period==='quarter')){
    // The provider's monthly new-user measure is retained; do not substitute DAU or daily sums.
    const months=Object.keys(series.monthly_new||{}).filter(month=>through&&interval(month)[1]<=through).sort();
    if(period==='month')rows=Object.fromEntries(months.map(month=>[month,series.monthly_new[month]]));
    else for(const month of months){
      const year=Number(month.slice(0,4)),q=Math.floor((Number(month.slice(5))-1)/3),id=year+'-Q'+(q+1);
      if(Object.hasOwn(rows,id))continue;
      const keys=Array.from({length:3},(_,i)=>year+'-'+String(q*3+i+1).padStart(2,'0'));
      if(!keys.every(k=>months.includes(k)))continue;
      const apps=[...new Set(keys.flatMap(k=>Object.keys(series.monthly_new[k])))];
      rows[id]=Object.fromEntries(apps.map(app=>{
        const values=keys.map(k=>series.monthly_new[k][app]);
        return [app,values.every(Number.isFinite)?values.reduce((a,b)=>a+b,0):null];
      }));
    }
  }else if(days.length){
    const apps=[...new Set(days.flatMap(day=>Object.keys(daily[day])))],periods=new Map();
    for(const day of days){
      const id=period==='week'?moonWeekEnd(day,weekEnd):period==='month'?day.slice(0,7):day.slice(0,4)+'-Q'+Math.ceil(Number(day.slice(5,7))/3);
      if(!periods.has(id))periods.set(id,interval(id,period==='week'));
    }
    for(const [id,[start,end]] of periods){
      if(start<first||end>through)continue;
      const length=(Date.parse(end)-Date.parse(start))/86400000+1;
      rows[id]=Object.fromEntries(apps.map(app=>{
        const values=Array.from({length},(_,i)=>daily[dayShift(start,i)]?.[app]);
        if(!values.every(Number.isFinite))return [app,null];
        const sum=values.reduce((a,b)=>a+b,0);
        return [app,metric==='new'?sum:Math.round(sum/length)];
      }));
    }
  }
  cache.set(key,rows);return rows;
}
function moonWeekText(weekEnd){return moonWeekdays[(weekEnd+1)%7]+'至'+moonWeekdays[weekEnd];}
function moonControls(){
  if(!moonSnapshot)return '';
  const {metric,period,weekEnd}=moonSelection();
  const field=(name,label,choices,value)=>'<label class="filter-field">'+label+'<select aria-label="'+label+'" name="'+name+'">'+choices.map(([key,text])=>'<option value="'+key+'"'+(String(key)===String(value)?' selected':'')+'>'+text+'</option>').join('')+'</select></label>';
  const apps=[...new Set(Object.values(moonSnapshot.dau||{}).flatMap(row=>Object.keys(row)))];
  return '<div class="app-filter-main'+(period==='week'?' has-week':'')+'">'+
    field('appMetric','App 指标',[['new','新增'],['dau','DAU']],metric)+
    field('appPeriod','时间维度',[['day','日'],['week','周'],['month','月'],['quarter','季']],period)+
    (period==='week'?field('weekEnd','每周截至',[[1,'周一'],[2,'周二'],[3,'周三'],[4,'周四'],[5,'周五'],[6,'周六'],[0,'周日']],weekEnd):'')+
    '<label class="filter-field">App'+select('app','全部 App',apps)+'</label></div><div class="app-filter-dates">'+periodDateForm('appDate')+'</div>';
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
  const selection=moonSelection(),rows=moonPeriodRows(moonSnapshot,selection);
  const range=dateSelection('appDate');
  const dates=Object.keys(rows).filter(d=>dateMatch(interval(d,selection.period==='week'),range)).sort(),app=params.get('app');
  const names=[...new Set(Object.values(rows).flatMap(row=>Object.keys(row)))];
  return {dates,series:(names.includes(app)?[app]:names).map(label=>({label,values:dates.map(d=>rows[d][label]??null)})),unit:'人',customRange:range.some(Boolean)};
}
function moonNotice(selection){
  const {metric,period,weekEnd}=selection;
  const daily=moonSnapshot[metric==='new'?'daily_new':'dau']||{};
  const through=Object.keys(daily).sort().at(-1)||'暂无';
  const months=Object.keys(moonSnapshot.monthly_new||{}).sort().at(-1)||'暂无';
  const measure=period==='day'?(metric==='new'?'新增为当天新增人数。':'DAU 为当天活跃人数。'):
    period==='week'?'周期为'+moonWeekText(weekEnd)+'，以'+moonWeekdays[weekEnd]+'为最后一天。'+(metric==='new'?'新增为七天合计。':'DAU 为七天日均值，四舍五入至整数。'):
    metric==='new'?(period==='month'?'新增采用月狐月度新增原值。':'新增为三个完整月份的月狐新增合计。'):
    'DAU 为'+(period==='month'?'自然月':'自然季')+'内每日活跃人数的平均值，四舍五入至整数。';
  return '<p class="notice">MoonFox iAPP · 日度截至 '+esc(through)+(metric==='new'&&['month','quarter'].includes(period)?'，月度截至 '+esc(months):'')+'。'+measure+
    (period==='day'?'':' 仅展示完整周期；缺失数据以「—」标示，不补估。')+'</p>';
}
function moonView(){
  $('count').textContent='';
  loadMoonView();
  if(!moonSnapshot){
    if(moonPending)return empty('正在读取 App 指标…');
    return empty(moonProblem||'请使用公司团队链接查看月狐 App 指标。');
  }
  const selection=moonSelection(),rows=moonPeriodRows(moonSnapshot,selection),notice=moonNotice(selection);
  const trend=moonTrend(),dates=trend.dates.slice().reverse();
  if(!dates.length)return notice+empty('所选日期没有完整的指标周期。');
  const apps=trend.series.map(series=>series.label);
  const fmt=n=>Number.isFinite(n)?n.toLocaleString('zh-HK'):'—';
  const headers=apps.map(a=>'<th scope="col">'+esc(a)+'</th>').join('');
  const weekly=selection.period==='week',daily=selection.period==='day';
  const details=pagedTable('appPage','App 指标明细',dates,'<th scope="col">'+(weekly?'周截至 / 周期':'日期 / 周期')+'</th>'+headers,apps.length+1,
    selected=>periodRows(selected,date=>apps.map(a=>'<td>'+fmt(rows[date][a])+'</td>').join(''),date=>weekly?dayShift(date,-6)+' 至 '+date:daily?reportingWeekLabel(date):''));
  $('count').textContent=dates.length+' 个时段';
  return notice+marketTrendHTML(trend)+(weekly?weeklyComparison(rows,dates[0],apps,'周度对比 · '+moonWeekText(selection.weekEnd)):'')+details;
}
