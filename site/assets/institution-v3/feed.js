'use strict';
function marketFeedControls() {
  const selected = params.get('category') || '';
  const stories = feedStories(data.events);
  const counts = Object.fromEntries(Object.keys(feedCategories).map(key=>[key,stories.filter(s=>s.editorial.category===key).length]));
  const categories = [['','全部动态',stories.length],...Object.entries(feedCategories).filter(([key])=>key!=='other'||counts[key]).map(([key,label])=>[key,label,counts[key]])];
  const promotions=stories.filter(s=>s.editorial.category==='promotion');
  const promotionCounts=Object.fromEntries(Object.keys(feedPromotionKinds).map(key=>[key,promotions.filter(s=>s.editorial.promotion_type===key).length]));
  const promotionTypes=[['','全部优惠',promotions.length],...Object.entries(feedPromotionKinds).map(([key,label])=>[key,label,promotionCounts[key]])];
  const promotionRow=(!selected||selected==='promotion')?'<div class="feed-classification-row feed-promotion-row"><span class="feed-axis-label">优惠目的</span><div class="feed-categories feed-promotion-types" role="group" aria-label="优惠目的">'+promotionTypes.map(([key,label,count])=>
    '<button type="button" data-feed-promotion="'+key+'" aria-pressed="'+(selected==='promotion'&&key===(params.get('promotion')||''))+'">'+esc(label)+' <span>'+count+'</span></button>').join('')+'</div></div>':'';
  const hint=params.get('promotion')&&feedPromotionHints[params.get('promotion')];
  return '<div class="feed-classification-row"><span class="feed-axis-label">动态类型</span><div class="feed-categories" role="group" aria-label="动态类型">'+categories.map(([key,label,count])=>
    '<button type="button" data-feed-category="'+key+'" aria-pressed="'+(key===selected)+'">'+esc(label)+' <span>'+count+'</span></button>').join('')+'</div>'+
    '</div>'+promotionRow+'<p class="feed-taxonomy-hint">'+esc(hint||'迎新、推荐等按主要参与条件归类；存款、投资等作为业务标签独立筛选。')+'</p>'+
    '<div class="feed-filters"><input aria-label="搜索市场动态" name="q" type="search" placeholder="搜索机构、产品、活动或关键数字" value="'+esc(params.get('q'))+'">'+
    select('institution','全部机构',data.institutions.map(i=>[i.id,i.name]))+
    select('business','全部业务',Object.entries(feedBusinesses))+
    select('channel','全部来源',[['official','机构官网'],['news','公开新闻']])+
    select('status','全部状态',[['active','期限内／即将截止'],['upcoming','尚未开始／待生效'],['ended','已结束'],['unspecified','截止日待确认／已收录'],['effective','已到生效日']])+
    '<label>发布日期 <input type="date" name="from" aria-label="发布日期从" value="'+esc(params.get('from'))+'"></label><label>至 <input type="date" name="to" aria-label="发布日期至" value="'+esc(params.get('to'))+'"></label>'+
    '<button type="button" data-feed-reset>重置</button></div>';
}
function feedSourceLink(event) {
  if (!/^https?:\/\//.test(event.url || '')) return '';
  return '<a href="'+esc(event.url)+'" target="_blank" rel="noopener noreferrer">'+esc(event.publisher || (event.channel==='official'?'官网':'媒体'))+'</a>';
}
function marketStoryCard(story) {
  const p = story.editorial, [status,label] = story.status;
  const facts = (p.facts || []).slice();
  if (p.start_date || p.end_date) facts.push({label:'活动期间',value:(p.start_date || '开始日未披露')+' 至 '+(p.end_date || '截止日未披露')});
  if (p.effective_date) facts.push({label:'生效日期',value:p.effective_date});
  return '<article class="market-story"><div class="story-meta"><span class="story-bank">'+esc(nameOf(story.institution))+'</span><span class="story-category category-'+p.category+'">'+esc(feedCategories[p.category])+'</span>'+
    (p.promotion_type?'<span class="story-promotion">'+esc(feedPromotionKinds[p.promotion_type])+'</span>':'')+
    (p.business_lines || []).map(t=>'<span class="story-topic">'+esc(feedBusinesses[t])+'</span>').join('')+'<span class="story-status status-'+status+'">'+esc(label)+'</span></div>'+
    '<h3>'+esc(p.headline)+'</h3><p class="story-summary">'+esc(p.summary)+'</p>'+
    (facts.length?'<dl class="story-facts">'+facts.map(f=>'<div><dt>'+esc(f.label)+'</dt><dd>'+esc(f.value)+'</dd></div>').join('')+'</dl>':'')+
    (p.evidence_note?'<p class="story-caveat">'+esc(p.evidence_note)+'</p>':'')+
    '<div class="story-footer"><span>'+(story.published?'发布 '+esc(story.published):'发布日期未披露 · 首次收录 '+esc(story.collected))+'</span><span>核实 '+esc(story.verified || '日期待补充')+'</span></div>'+
    '<details class="story-sources"><summary>'+story.sources.length+' 个来源'+(story.sources.length>1?' · 同一事件已合并':'')+'</summary>'+story.sources.map(e=>
      '<div>'+feedSourceLink(e)+'<span>'+esc(e.kind)+' · '+esc(e.published_at || '发布日期未披露')+'</span><p>'+esc(e.summary)+'</p></div>').join('')+'</details></article>';
}
function marketFeed() {
  const all = feedStories(data.events);
  const rows = all.filter(story=>{
    const p=story.editorial;
    return matches(story.institution,[p.headline,p.summary,feedCategories[p.category],feedPromotionKinds[p.promotion_type],...(p.business_lines||[]).map(k=>feedBusinesses[k]),...(p.topics||[]),...(p.facts || []).map(f=>f.value),...story.sources.map(e=>e.publisher)]) &&
      (!params.get('category') || p.category===params.get('category')) &&
      (!params.get('promotion') || p.promotion_type===params.get('promotion')) &&
      (!params.get('business') || p.business_lines.includes(params.get('business'))) &&
      (!params.get('channel') || story.sources.some(e=>e.channel===params.get('channel'))) &&
      (!params.get('status') || (params.get('status')==='active'?['active','ending'].includes(story.status[0]):story.status[0]===params.get('status'))) &&
      (!params.get('from') || story.published && story.published>=params.get('from')) &&
      (!params.get('to') || story.published && story.published<=params.get('to'));
  });
  rows.sort((a,b)=>(b.published || b.collected).localeCompare(a.published || a.collected));
  $('count').textContent=rows.length+' 件动态';
  const selectedRange=params.get('from') || params.get('to');
  const note='<p class="feed-note">每件动态归入一个主类型，官网与媒体报道合并展示；上方分类计数涵盖全部归档，业务标签可交叉筛选。'+(selectedRange?'当前按原文发布日期筛选。':'日期不明的资料按首次收录排序。')+'活动状态按香港日期及已核实期限计算。</p>';
  if (!rows.length) return note+empty('当前筛选没有匹配动态。');
  const groups=[];
  for(const story of rows.slice(0,limit)) {
    const label=story.published || '发布日期未披露 · 收录 '+story.collected;
    if(groups.at(-1)?.label!==label)groups.push({label,rows:[]});
    groups.at(-1).rows.push(story);
  }
  return note+groups.map(group=>'<section class="market-day"><h3 class="market-day-title">'+esc(group.label)+'</h3><div class="market-story-grid">'+group.rows.map(marketStoryCard).join('')+'</div></section>').join('')+
    (limit<rows.length?'<button id="more" class="more">查看更多动态</button>':'');
}
