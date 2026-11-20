'use strict';

const monitoredBanks=['众安银行','中银香港','汇丰银行','恒生银行'];
const feedback=['好评','中评','差评'];
const rankFields={engage:'总互动',comments:'评论',likes:'点赞',saves:'收藏',negative:'差评占比'};

function bankNoteStats(notes){
  const rows=new Map(monitoredBanks.map(bank=>[bank,{bank,raw:0,count:0,engage:0,comments:0,likes:0,saves:0,missingSaves:false,rated:0,好评:0,中评:0,差评:0}]));
  const seen=new Set();
  for(const n of notes){
    const row=rows.get(n.bank),key=n.bank+'|'+n.id;
    if(!row||seen.has(key))continue;
    seen.add(key);row.raw++;
    if(n.theme==='不相关')continue;
    row.count++;
    for(const field of ['engage','comments','likes'])row[field]+=n[field];
    if(Number.isFinite(n.saves))row.saves+=n.saves;else row.missingSaves=true;
    if(feedback.includes(n.sentiment)){row[n.sentiment]++;row.rated++;}
  }
  return [...rows.values()].map(r=>({...r,saves:r.missingSaves?null:r.saves,negative:r.rated?r.差评/r.rated:null}));
}
function weekBankSummary(week){
  const all=bankNoteStats(week.notes);
  const num=n=>Number.isFinite(n)?n.toLocaleString('zh-HK'):'—';
  const pct=n=>(100*n).toFixed(1).replace(/\.0$/,'')+'%';
  const field=Object.hasOwn(rankFields,params.get('rankBy'))?params.get('rankBy'):'engage';
  const rows=all.slice().sort((a,b)=>(b[field]??-1)-(a[field]??-1));
  const top=rows[0][field],winners=rows.filter(r=>r[field]===top).map(r=>r.bank);
  const leading=Number.isFinite(top)&&top>0?winners.join('、')+'的'+rankFields[field]+'最高（'+(field==='negative'?pct(top):num(top))+'）。':'';
  const summary=rows.map(r=>{
    const portions=feedback.map((key,i)=>r.rated?'<i class="feedback-'+i+'" style="width:'+r[key]/r.rated*100+'%"></i>':'').join('');
    const countLabel=feedback.map(key=>key+' '+num(r[key])+' 篇').join('、');
    const distribution=feedback.map(key=>'<span>'+key+' '+(r.rated?num(r[key])+' <small>('+pct(r[key]/r.rated)+')</small>':'—')+'</span>').join('');
    const rank=Number.isFinite(r[field])?1+all.filter(other=>Number.isFinite(other[field])&&other[field]>r[field]).length:null;
    return '<tr><td>'+num(rank)+'</td><th scope="row">'+esc(r.bank)+'</th><td>'+num(r.count)+' / '+num(r.raw)+'</td>'+
      '<td class="feedback-cell"><div class="feedback-bar" role="img" aria-label="'+esc(countLabel)+'">'+portions+'</div><div class="feedback-counts">'+distribution+'</div>'+
      (r.rated<r.count?'<small>未标评价 '+num(r.count-r.rated)+' 篇</small>':'')+'</td>'+
      ['engage','comments','likes','saves'].map(key=>'<td>'+num(r[key])+'</td>').join('')+'</tr>';
  }).join('');
  const scope=week.reviewScope==='reviewed'?'主题已逐条复核。':'沿用当期监控原表主题。';
  const total=all.reduce((a,r)=>a+r.count,0),raw=all.reduce((a,r)=>a+r.raw,0);
  return '<section class="week-banks"><div class="weekly-bar"><h3>四行口碑与互动</h3><label>排名依据 <select name="rankBy" aria-label="四行排名依据">'+Object.entries(rankFields).map(([k,v])=>'<option value="'+k+'"'+(k===field?' selected':'')+'>'+v+'</option>').join('')+'</select></label></div>'+
    '<p>'+esc(dayShift(week.end,-6))+' 至 '+esc(week.end)+' · 纳入 '+num(total)+' 条银行记录，共收录 '+num(raw)+' 条。'+esc(leading)+'</p>'+
    '<div class="wrap"><table aria-label="本周各银行评价与互动排名"><thead><tr><th>排名</th><th>银行</th><th>纳入 / 收录</th><th>好中差评 · 篇数及占比</th><th>总互动</th><th>评论</th><th>点赞</th><th>收藏</th></tr></thead><tbody>'+summary+'</tbody></table></div>'+
    '<p class="stats-foot">'+scope+'评价取原表标注，排除已标为「不相关」的记录。每家银行同帖计一次，同帖提及两家可各计一次。互动为快照中的点赞、评论、收藏之和。</p></section>';
}

let sourceIdentity='',sourceRows,sourcePending,sourceMessage='';
function noteOriginalActions(){
  const week=params.get('week')||redSnapshot?.weeks?.[0]?.end,team=teamId();
  const valid=/^[\w-]{43}$/.test(team||''),identity=valid?team+'|'+week:'';
  if(identity!==sourceIdentity){sourceIdentity=identity;sourceRows=null;sourceMessage='';sourcePending=null;}
  const targets=document.querySelectorAll('[data-original-note]');
  if(!targets.length)return;
  if(valid&&!sourceRows&&!sourcePending&&!sourceMessage){
    sourcePending=archiveProof(team).then(async proof=>{
      const r=await stationFetch('/api/team-notes/'+encodeURIComponent(week),{headers:{Authorization:'Bearer '+proof},cache:'no-store',redirect:'error'});
      if(!r.ok)throw Error(r.status===404?'本期未归档采集正文。':r.status===403?'请从完整团队链接重新打开。':'笔记原件暂时无法读取。');
      const data=await r.json();if(data.week!==week)throw Error('收到的笔记周次不符。');
      if(sourceIdentity===identity)sourceRows=new Map(data.notes.map(n=>[n.bank+'|'+n.id,n]));
    }).catch(e=>{if(sourceIdentity===identity)sourceMessage=e.message;}).finally(()=>{
      if(sourceIdentity!==identity)return;
      sourcePending=null;
      if(page==='xhs'&&xhsSection()==='notes')noteOriginalActions();
    });
  }
  for(const target of targets){
    const record=sourceRows?.get(target.dataset.originalBank+'|'+target.dataset.originalNote);
    if(!record){
      target.textContent=!valid?'从公司团队链接可阅读采集正文。':sourceMessage||(sourceRows?'本条未归档原文。':'正在读取原件…');
      if(sourceMessage==='笔记原件暂时无法读取。'){
        const retry=document.createElement('button');retry.type='button';retry.textContent='重试';
        retry.onclick=()=>{sourceMessage='';noteOriginalActions();};target.append(retry);
      }
      continue;
    }
    const details=document.createElement('details'),label=document.createElement('summary'),body=document.createElement('div');
    label.textContent='阅读采集正文';body.className='original-body';body.textContent=record.body;
    details.append(label,body);target.replaceChildren(details);
    if(record.url){
      const link=document.createElement('a');link.className='link';link.href=record.url;link.target='_blank';link.rel='noopener noreferrer';link.referrerPolicy='no-referrer';link.textContent='小红书原帖 ↗';target.append(link);
    }
  }
}
