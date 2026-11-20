'use strict';
const dayShift=(day,offset)=>new Date(Date.parse(day.slice(0,10)+'T00:00:00Z')+offset*86400000).toISOString().slice(0,10);
function weekFriday(day){
  return dayShift(day,(5-new Date(day+'T00:00:00Z').getUTCDay()+7)%7);
}
function interval(key,weeklyEnd=false){
  if(key.includes('~'))return key.split('~');
  if(key.includes('-Q')||key.length===7){
    const year=Number(key.slice(0,4)),quarter=key.includes('-Q');
    const month=quarter?(Number(key.at(-1))-1)*3:Number(key.slice(5))-1;
    const iso=d=>d.toISOString().slice(0,10);
    return [iso(new Date(Date.UTC(year,month,1))),iso(new Date(Date.UTC(year,month+(quarter?3:1),0)))];
  }
  return [weeklyEnd?dayShift(key,-6):key,key];
}
function dateSelection(prefix){
  return [params.get(prefix+'From')||'',params.get(prefix+'To')||''];
}
function dateMatch(bounds,range){
  return (!range[0]||bounds[1]>=range[0])&&(!range[1]||bounds[0]<=range[1]);
}
function periodDateForm(prefix){
  const [from,to]=dateSelection(prefix);
  return '<form class="date-range" data-date-range="'+prefix+'"><label>开始日期<input type="date" name="from" aria-label="开始日期" value="'+esc(from)+'"></label><span aria-hidden="true">—</span><label>结束日期<input type="date" name="to" aria-label="结束日期" value="'+esc(to)+'"></label><button type="submit">应用日期</button>'+
    (from||to?'<button type="button" data-reset-dates>清除日期</button>':'')+'</form>';
}
function commitDates(prefix,start,end){
  params.delete('appPage');params.delete('indexPage');
  for(const [key,value] of [[prefix+'From',start],[prefix+'To',end]]){
    if(value)params.set(key,value);else params.delete(key);
  }
  limit=15;history.replaceState(null,'','#'+page+(params.size?'?'+params:''));
  renderControls();renderResults();
}
document.addEventListener('submit',event=>{
  const form=event.target.closest('form[data-date-range]');
  if(!form)return;
  event.preventDefault();
  const start=form.elements.from.value,end=form.elements.to.value;
  if(start&&end&&start>end){form.elements.to.setCustomValidity('结束日期须在开始日期当天或之后');form.elements.to.reportValidity();return;}
  commitDates(form.dataset.dateRange,start,end);
});
document.addEventListener('input',event=>{
  const form=event.target.closest('form[data-date-range]');
  if(form)form.elements.to.setCustomValidity('');
});
document.addEventListener('click',event=>{
  const form=event.target.closest('[data-reset-dates]')?.closest('form[data-date-range]');
  if(form)commitDates(form.dataset.dateRange,'','');
});
function periodRows(keys,build,weekOf){
  let last='';
  return keys.map(key=>{
    const week=weekOf(key),first=week!==last;last=week;
    const caption=week?week.split(' 至 ').map(part=>'<span>'+esc(part)+'</span>').join(' 至 '):'';
    return '<tr'+(first?' class="week-break"':'')+'><th scope="row">'+esc(key)+(first&&week?'<small class="table-period">'+caption+'</small>':'')+'</th>'+build(key)+'</tr>';
  }).join('');
}
function reportingWeekLabel(day){const end=weekFriday(day);return dayShift(end,-6).slice(5)+' 至 '+end.slice(5);}

const pagedTables=new Map(),tablePageSize=15;
function tablePageState(total,key){
  const pages=Math.max(1,Math.ceil(total/tablePageSize));
  const requested=Number(params.get(key));
  const current=Math.min(pages,Number.isSafeInteger(requested)&&requested>0?requested:1);
  return {total,pages,current,start:(current-1)*tablePageSize,end:Math.min(current*tablePageSize,total)};
}
function tablePager(state,label){
  const {total,pages,current,start,end}=state;
  const button=(target,text,disabled=false)=>'<button type="button" data-table-page="'+target+'"'+(disabled?' disabled':'')+'>'+text+'</button>';
  const numbers=[...new Set([1,pages,current-1,current,current+1])].filter(n=>n>=1&&n<=pages).sort((a,b)=>a-b);
  let last=0;
  const choices=numbers.map(n=>{
    const gap=last&&n-last>1?'<span class="page-gap" aria-hidden="true">…</span>':'';last=n;
    return gap+'<button type="button" data-table-page="'+n+'" aria-label="第 '+n+' 页"'+(n===current?' aria-current="page"':'')+'>'+n+'</button>';
  }).join('');
  return '<nav class="table-pagination" aria-label="'+esc(label)+'分页"><span class="page-total" role="status">第 '+(total?start+1:0)+'–'+end+' 条 / 共 '+total+' 条</span><div class="page-buttons">'+
    button(current-1,'上一页',current===1)+choices+button(current+1,'下一页',current===pages)+'</div><span class="page-position">'+current+' / '+pages+' 页</span></nav>';
}
function pagedTableBody(model){
  const state=tablePageState(model.rows.length,model.key);
  return '<div class="wrap"><table class="equal-columns" aria-label="'+esc(model.label)+'" style="--table-columns:'+model.columns+'"><thead><tr>'+model.headers+'</tr></thead><tbody>'+
    model.renderRows(model.rows.slice(state.start,state.end))+'</tbody></table></div>'+tablePager(state,model.label);
}
function pagedTable(key,label,rows,headers,columns,renderRows){
  const model={key,label,rows,headers,columns,renderRows};pagedTables.set(key,model);
  return '<section class="paged-table" data-table-key="'+key+'" aria-label="'+esc(label)+'">'+pagedTableBody(model)+'</section>';
}
document.addEventListener('click',event=>{
  const button=event.target.closest('[data-table-page]'),panel=button?.closest('[data-table-key]');
  if(!panel||button.disabled)return;
  const key=panel.dataset.tableKey,model=pagedTables.get(key),requested=Number(button.dataset.tablePage);
  if(!model||!Number.isSafeInteger(requested))return;
  const current=Math.max(1,Math.min(Math.ceil(model.rows.length/tablePageSize),requested));
  if(current===1)params.delete(key);else params.set(key,String(current));
  history.replaceState(null,'','#'+page+(params.size?'?'+params:''));
  // Only replace the table so graph ranges and selected series remain unchanged.
  panel.innerHTML=pagedTableBody(model);
  panel.querySelector('[aria-current="page"]')?.focus({preventScroll:true});
});
function weeklyComparison(rows,end,labels,caption='周报对比'){
  if(!end)return '';
  const current=rows[end]||{},prior=rows[dayShift(end,-7)]||{},old=rows[dayShift(end,-21)]||{};
  const delta=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&b!==0?((a-b)/b*100).toLocaleString('zh-HK',{maximumFractionDigits:1,signDisplay:'exceptZero'})+'%':'—';
  const sorted=labels.filter(name=>Number.isFinite(current[name])).sort((a,b)=>current[b]-current[a]);
  if(!sorted.length)return '';
  return '<details class="weekly-compare" open><summary>'+esc(end)+' '+esc(caption)+'</summary><div class="wrap"><table><thead><tr><th>机构</th><th>本周</th><th>周环比</th><th>四周变化</th><th>排名</th></tr></thead><tbody>'+
    sorted.map(name=>'<tr><th>'+esc(name)+'</th><td>'+current[name].toLocaleString('zh-HK')+'</td><td>'+delta(current[name],prior[name])+'</td><td>'+delta(current[name],old[name])+'</td><td>'+String(1+Object.values(current).filter(v=>Number.isFinite(v)&&v>current[name]).length)+'</td></tr>').join('')+'</tbody></table></div></details>';
}
