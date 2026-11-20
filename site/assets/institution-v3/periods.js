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
    return '<tr'+(first?' class="week-break"':'')+'><th scope="row">'+esc(key)+(first&&week?'<small class="table-period">'+esc(week)+'</small>':'')+'</th>'+build(key)+'</tr>';
  }).join('');
}
function reportingWeekLabel(day){const end=weekFriday(day);return dayShift(end,-6).slice(5)+' 至 '+end.slice(5);}
function weeklyComparison(rows,end,labels){
  if(!end)return '';
  const current=rows[end]||{},prior=rows[dayShift(end,-7)]||{},old=rows[dayShift(end,-21)]||{};
  const delta=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&b!==0?((a-b)/b*100).toLocaleString('zh-HK',{maximumFractionDigits:1,signDisplay:'exceptZero'})+'%':'—';
  const sorted=labels.filter(name=>Number.isFinite(current[name])).sort((a,b)=>current[b]-current[a]);
  if(!sorted.length)return '';
  return '<details class="weekly-compare" open><summary>'+esc(end)+' 周报对比</summary><div class="wrap"><table><thead><tr><th>机构</th><th>本周</th><th>周环比</th><th>四周变化</th><th>排名</th></tr></thead><tbody>'+
    sorted.map(name=>'<tr><th>'+esc(name)+'</th><td>'+current[name].toLocaleString('zh-HK')+'</td><td>'+delta(current[name],prior[name])+'</td><td>'+delta(current[name],old[name])+'</td><td>'+String(1+Object.values(current).filter(v=>Number.isFinite(v)&&v>current[name]).length)+'</td></tr>').join('')+'</tbody></table></div></details>';
}
