export const apps={
  'ZA Bank':'com.zhongan.ibank',
  'Schwab Mobile':'com.schwab.mobile',
  '蚂蚁银行':'com.alipay.antbank.hk.portal',
  '大象银行 EleBank（原天星银行）':'com.airstarbank.mobilebanking',
  'HSBC Mobile Banking':'hk.com.hsbc.hsbchkmobilebanking',
  'BOCHK Zhong Yin Xiang Gang':'com.bochk.app.aos'
};
export const fields={daily_new:'userRise',dau:'dau',monthly_new:'riseMonth',mau:'mau'};
export const shiftDay=(day,n)=>new Date(Date.parse(day+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
export const hkDay=(now=new Date())=>new Date(now.getTime()+8*3600000).toISOString().slice(0,10);
function dateOf(raw,monthly){
  raw=String(raw);
  if(!(monthly?/^\d{6}$/:/^\d{8}$/).test(raw))throw Error('Unexpected MoonFox date');
  const date=raw.slice(0,4)+'-'+raw.slice(4,6)+(monthly?'':'-'+raw.slice(6));
  const check=monthly?date+'-01':date;
  if(new Date(check+'T00:00:00Z').toISOString().slice(0,10)!==check)throw Error('Invalid MoonFox date');
  return date;
}
export function parseResult(result,pkg,start,end){
  if(Number(result?.code)!==2000||result?.data?.app?.pkg!==pkg)throw Error('MoonFox returned an unexpected application or business code');
  const parsed={};
  for(const [metric,field] of Object.entries(fields)){
    const monthly=['mau','monthly_new'].includes(metric),rows=result.data[field];
    if(!Array.isArray(rows))throw Error('MoonFox missing '+field);
    parsed[metric]={};
    for(const row of rows){
      const day=dateOf(row.date,monthly);
      if(day<(monthly?start.slice(0,7):start)||day>(monthly?end.slice(0,7):end))continue;
      if(row.value===null)continue;
      if(!Number.isSafeInteger(row.value)||row.value<0)throw Error('MoonFox returned an invalid metric');
      if(Object.hasOwn(parsed[metric],day)&&parsed[metric][day]!==row.value)throw Error('MoonFox returned conflicting duplicate dates');
      parsed[metric][day]=row.value;
    }
    if(!monthly&&!Object.keys(parsed[metric]).length)throw Error('MoonFox returned no daily observations');
  }
  return parsed;
}
export function mergeSeries(current,parts){
  const result=structuredClone(current);
  for(const [name,part] of parts){
    if(!Object.hasOwn(apps,name))throw Error('Unknown application');
    for(const metric of Object.keys(fields))for(const [day,value] of Object.entries(part[metric])){
      result[metric][day]??=Object.fromEntries(Object.keys(apps).map(app=>[app,null]));
      result[metric][day][name]=value;
    }
  }
  return result;
}
export function completeThrough(series,metric){
  return Object.keys(series[metric]).filter(day=>Object.keys(apps).every(name=>Number.isFinite(series[metric][day]?.[name]))).sort().at(-1)||null;
}
export async function fetchApp(name,pkg,start,end,{key,secret,fetcher=fetch}){
  const url=new URL('https://open.iapp.jiguang.cn/v1/app/data/realtime');
  url.search=new URLSearchParams({pkg,start:start.replaceAll('-',''),end:end.replaceAll('-',''),indicators:'APP,USER_RISE,DAU,RISE_MONTH,MAU'});
  const response=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(60000),headers:{Authorization:'Basic '+Buffer.from(key+':'+secret).toString('base64')}});
  if(!response.ok)throw Error(name+' MoonFox HTTP '+response.status);
  return [name,parseResult(await response.json(),pkg,start,end)];
}
export async function collect(current,options){
  const through=completeThrough(current,'dau');
  if(!through)throw Error('Seed data has no complete daily observations');
  const start=shiftDay(through,-35),end=shiftDay(options.day||hkDay(),-1);
  const parts=[];
  for(let first=start;first<=end;first=shiftDay(first,46)){
    const last=shiftDay(first,45)<end?shiftDay(first,45):end;
    for(const [name,pkg] of Object.entries(apps)){
      if(parts.length)await (options.sleep||((ms)=>new Promise(resolve=>setTimeout(resolve,ms))))(1100);
      parts.push(await fetchApp(name,pkg,first,last,options));
    }
  }
  // Merge only after every application and time window succeeds.
  return mergeSeries(current,parts);
}
