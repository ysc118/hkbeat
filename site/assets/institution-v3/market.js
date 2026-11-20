'use strict';
const titles={moonfox:'App 指标',xhs:'小红书相关',reports:'历史周报',drafts:'我的待审周报',feed:'市场动态'};
const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function source(url,label){
  if(!/^https?:\/\//.test(url||''))return '';
  return '<a class="link outer" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">'+esc(label)+' ↗</a>';
}
function tag(label,extra=''){return '<span class="tag '+extra+'">'+esc(label)+'</span>';}
const empty=msg=>'<div class="blank">'+esc(msg)+'</div>';
let data,registry,page,params,limit;
function route(){
  const [key,query]=location.hash.slice(1).split('?');
  params=new URLSearchParams(query);limit=15;
  const retired=['terms','directory','sources','mix','compare'].includes(key);
  page=retired?'feed':['xhsindex','xhsnotes'].includes(key)?'xhs':Object.hasOwn(titles,key)?key:'moonfox';
  if(retired){
    const institution=params.get('institution')||params.get('bank');
    const team=params.get('team');
    params=new URLSearchParams();
    if(registry.has(institution))params.set('institution',institution);
    if(team)params.set('team',team);
    history.replaceState(null,'','#feed'+(params.size?'?'+params:''));
  }
  if(key==='xhsindex'||key==='xhsnotes')params.set('section',key==='xhsnotes'?'notes':'search');
  if(page==='xhs'&&!params.has('section')&&['week','noteBank','noteDay','noteSent','theme','notesRows','sort','q'].some(k=>params.has(k)))params.set('section','notes');
  if(page==='reports'&&params.has('review'))page='drafts';
  if(page==='drafts')captureReviewAccess();
  if(page!=='reports')releaseLibraryPDF();
  if(/^[\w-]{43}$/.test(params.get('team')||''))try{sessionStorage.setItem('moonfox.team',params.get('team'));}catch{}
  renderNavigation();
  $('title').textContent=['xhs','reports'].includes(page)?researchSections[xhsSection()][2]:titles[page];
  const asOf=page==='feed'&&data.marketCheckedAt
    ?new Date(Date.parse(data.marketCheckedAt)+8*3600000).toISOString().slice(0,10):data.asOf;
  $('asof').textContent=asOf.replaceAll('-','.');
  renderControls();renderResults();
}
function target(tab,values={}){
  const query=new URLSearchParams(values).toString();
  return '#'+tab+(query?'?'+esc(query):'');
}
const researchSections={
  app:['moonfox',{},'App 指标'],
  search:['xhs',{section:'search'},'搜索指数'],
  notes:['xhs',{section:'notes'},'笔记'],
  lingxi:['reports',{kind:'lingxi'},'灵犀赛道报告'],
  reports:['reports',{},'小红书洞察周报']
};
function xhsSection(){
  if(page==='reports')return params.get('kind')==='lingxi'?'lingxi':'reports';
  return params.get('section')==='notes'?'notes':'search';
}
const appNames={
  'ZA Bank':'众安银行（ZA Bank）','Schwab Mobile':'嘉信理财（Schwab Mobile）',
  '蚂蚁银行':'蚂蚁银行','大象银行 EleBank（原天星银行）':'大象银行（EleBank）',
  'HSBC Mobile Banking':'汇丰香港','BOCHK Zhong Yin Xiang Gang':'中银香港'
};
const searchBrands=['众安银行','汇丰银行','中银香港','蚂蚁银行','大象银行','恒生银行','富途','盈立','致富','老虎','长桥'];
function teamTarget(tab,values={}){
  const team=teamId();
  return target(tab,/^[\w-]{43}$/.test(team)?{...values,team}:values);
}
function renderCoverage(){
  const element=$('coverage');
  element.hidden=page==='drafts';
  if(element.hidden)return;
  const groups=[];
  if(page==='moonfox'){
    const last=Object.values(moonSnapshot?.dau||{}).at(-1);
    const apps=last?Object.keys(last):Object.keys(appNames);
    groups.push(['监测 App',apps.map(name=>appNames[name]||name)]);
  }else if(page==='feed'){
    for(const group of new Set(data.institutions.map(i=>i.segment))){
      groups.push([group,data.institutions.filter(i=>i.segment===group).map(i=>i.name)]);
    }
  }else{
    const section=xhsSection();
    if(section==='lingxi'){
      groups.push(['跟踪赛道',['香港银行','港股券商']]);
      const brands=new Set();
      for(const edition of lingxiSummaries.values())
        for(const row of edition.brand_voice||[])
          if(row.type==='监控清单'&&row.brand)brands.add(row.brand);
      if(brands.size)groups.push(['已归档监控品牌',[...brands]]);
      groups.push(['每期范围',['当期上榜品牌见报告内的品牌榜单']]);
    }else{
      if(section!=='notes')groups.push(['品牌搜索',redSnapshot?.search_index?.brands||searchBrands]);
      if(section!=='search')groups.push(['笔记监控',monitoredBanks]);
      if(section==='reports'){
        groups.push(['灵犀赛道',['香港银行','港股券商']]);
        groups.push(['含 App 指标的期数',Object.values(appNames)]);
      }
    }
  }
  element.innerHTML='<h3>覆盖范围</h3><dl>'+groups.map(([label,names])=>
    '<div><dt>'+esc(label)+'</dt><dd>'+names.map(esc).join('、')+'</dd></div>').join('')+'</dl>';
}
function renderNavigation(){
  const group=page==='reports'?'xhs':page;
  const tabs=[['moonfox','App 指标'],['xhs','小红书相关'],['feed','市场动态']];
  $('nav').innerHTML=tabs.map(([key,label])=>{
    const selected=key===group;
    return '<a class="category-tab'+(selected?' is-selected':'')+'" href="'+teamTarget(key)+'"'+
      (selected?' aria-current="location"':'')+'>'+label+'</a>';
  }).join('');
  document.querySelector('.brand')?.setAttribute('href',teamTarget('moonfox'));
  const nav=$('subnav');
  nav.hidden=group!=='xhs';
  nav.innerHTML=nav.hidden?'':['search','notes','lingxi','reports'].map(key=>{
    const [tab,values,label]=researchSections[key];
    return '<a href="'+teamTarget(tab,values)+'"'+(key===xhsSection()?' class="current" aria-current="page"':'')+'>'+label+'</a>';
  }).join('');
  $('en').textContent=({xhs:'XIAOHONGSHU',reports:'WEEKLY ARCHIVE',drafts:'WEEKLY REVIEW',moonfox:'APP PERFORMANCE',feed:'MARKET UPDATES'})[page];
}
function update(key,value){
  params.delete('appPage');params.delete('indexPage');
  if(page==='moonfox'&&['appMetric','appPeriod','weekEnd'].includes(key)){
    const current=moonSelection();
    params.set('appMetric',current.metric);params.set('appPeriod',current.period);params.set('weekEnd',String(current.weekEnd));
    params.delete('metric');
  }
  if(value)params.set(key,value);else params.delete(key);
  history.replaceState(null,'','#'+page+(params.size?'?'+params:''));
  limit=15;renderNavigation();if(page==='moonfox'||(page==='feed'&&key!=='q'))renderControls();renderResults();
}
const nameOf=id=>registry.get(id)?.name||id;
function select(key,label,options){
  const list=options.map(o=>Array.isArray(o)?o:[o,o]);
  return '<select aria-label="'+esc(label)+'" name="'+key+'"><option value="">'+esc(label)+'</option>'+list.map(([v,l])=>'<option value="'+esc(v)+'"'+(params.get(key)===v?' selected':'')+'>'+esc(l)+'</option>').join('')+'</select>';
}
function renderControls(){
  $('controls').classList.toggle('app-filters',page==='moonfox');
  if(['xhs','reports','drafts'].includes(page)){$('controls').innerHTML='';return;}
  if(page==='moonfox'){loadMoonView();$('controls').innerHTML=moonControls();return;}
  $('controls').innerHTML=marketFeedControls();
}
function matches(id,words){
  const query=(params.get('q')||'').trim().toLowerCase();
  return (!params.get('institution')||id===params.get('institution'))&&[nameOf(id),id,...words].join(' ').toLowerCase().includes(query);
}
function card({date,label,tags,title,summary,detail,url}){
  return '<article class="row"><div class="stamp"><div class="date">'+esc(date||'—')+'</div><span class="muted">'+esc(label)+'</span></div><div>'+tags+'<h3>'+esc(title)+'</h3><p class="summary">'+esc(summary)+'</p><small>'+esc(detail)+'</small></div>'+source(url,'原文')+'</article>';
}
function renderList(rows,unit,makeCard){
  $('count').textContent=rows.length+' '+unit;
  if(!rows.length)return empty('当前筛选没有匹配资料。');
  return '<div class="rows">'+rows.slice(0,limit).map(makeCard).join('')+'</div>'+(limit<rows.length?'<button id="more" class="more">查看更多</button>':'');
}
function feed(){
  return marketFeed();
}
function renderResults(){
  renderCoverage();
  if(page==='xhs'){
    loadRedView();
    $('count').textContent='';
    $('view').innerHTML=redSnapshot?redView():empty(redProblem||'正在读取小红书资料…');
    if(redSnapshot)redMount();
    return;
  }
  if(page==='reports'){renderLibrary();return;}
  if(page==='drafts'){renderReview();return;}
  const render=page==='moonfox'?moonView:feed;
  $('view').innerHTML=render();
  if(page==='moonfox'&&moonSnapshot)mountMarketTrend($('view'),moonTrend());
}
async function start(){
  try{
    const response=await stationFetch('./market.json',{cache:'no-store'});if(!response.ok)throw Error();
    data=await response.json();registry=new Map(data.institutions.map(i=>[i.id,i]));
    $('asof').textContent=data.asOf.replaceAll('-','.');
    $('controls').addEventListener('input',e=>{if(e.target.name&&!e.target.closest('form[data-date-range]'))update(e.target.name,e.target.value);});
    $('controls').addEventListener('click',e=>{
      const category=e.target.closest('[data-feed-category]');
      if(category){params.delete('promotion');update('category',category.dataset.feedCategory);}
      const promotion=e.target.closest('[data-feed-promotion]');
      if(promotion){params.set('category','promotion');update('promotion',promotion.dataset.feedPromotion);}
      if(e.target.closest('[data-feed-reset]')){
        for(const key of ['q','institution','channel','category','promotion','business','status','from','to'])params.delete(key);
        update('category','');
      }
    });
    $('view').addEventListener('change',e=>{if(page==='xhs'&&e.target.tagName==='SELECT')update(e.target.name,e.target.value);});
    $('view').addEventListener('change',e=>{if(page==='xhs'&&e.target.type==='search')update(e.target.name,e.target.value);});
    $('view').addEventListener('click',e=>{if(e.target.id==='more'){limit+=15;renderResults();}});
    window.addEventListener('hashchange',route);route();
  }catch{$('view').textContent='资料暂时未能载入，请刷新重试。';}
}
start();
