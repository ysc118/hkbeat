'use strict';
let libraryFiles,libraryIdentity='',libraryPending,libraryMessage='',pdfURL='',libraryProof,lingxiSummaries=new Map();
async function archiveProof(team){
  const hex=async str=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(str))),b=>b.toString(16).padStart(2,'0')).join('');
  return hex('team-library-v1/'+await hex('moonfox-team-v1/'+team));
}
async function readLibrary(path,proof){
  const r=await stationFetch(path,{headers:{Authorization:'Bearer '+proof},cache:'no-store',redirect:'error'});
  if(!r.ok)throw Error(r.status===403?'请用收到的完整公司团队链接重新打开。':'资料未能载入，请重试。');
  return r;
}
function releaseLibraryPDF(){if(pdfURL){URL.revokeObjectURL(pdfURL);pdfURL='';}}
async function reportBlob(response,team,row){
  if(response.headers.get('content-type')?.split(';')[0]!=='application/vnd.market.team-pdf'){
    return response.blob();
  }
  const packed=new Uint8Array(await response.arrayBuffer());
  if(new TextDecoder().decode(packed.slice(0,8))!=='TEAMPDF1')throw Error('周报文件不完整。');
  const path=[row.kind,row.start,row.end].join('/');
  const material=new TextEncoder().encode('team-report-pdf/v1/'+path+'/'+team);
  const hash=await crypto.subtle.digest('SHA-256',material);
  const key=await crypto.subtle.importKey('raw',hash,'AES-GCM',false,['decrypt']);
  const pdf=await crypto.subtle.decrypt({name:'AES-GCM',iv:packed.slice(8,20)},key,packed.slice(20));
  return new Blob([pdf],{type:'application/pdf'});
}
function renderLibrary(){
  const team=teamId(),kind=params.get('kind')==='lingxi'?'lingxi':'weekly';
  const typeName=researchSections[xhsSection()][2];
  const label=kind==='weekly'?'周报原件':'灵犀原件';
  const view=$('view');
  $('count').textContent='';
  releaseLibraryPDF();
  if(team!==libraryIdentity){libraryIdentity=team;libraryFiles=null;libraryPending=null;libraryMessage='';}
  if(!/^[\w-]{43}$/.test(team)){view.innerHTML=empty('从公司团队链接进入，即可免登录打开历期周报和灵犀原件。');return;}
  if(!libraryFiles&&!libraryMessage&&!libraryPending){
    libraryPending=archiveProof(team).then(async proof=>{
      const [result,lingxi]=await Promise.all(['/api/team-library','/api/team-library/lingxi-data'].map(async path=>(await readLibrary(path,proof)).json()));
      if(libraryIdentity===team){libraryProof=proof;libraryFiles=result.files;lingxiSummaries=new Map(lingxi.map(r=>[r.start+'/'+r.end,r]));try{sessionStorage.setItem('moonfox.team',team);}catch{}}
    }).catch(e=>{if(libraryIdentity===team)libraryMessage=e.message;}).finally(()=>{
      if(libraryIdentity===team){libraryPending=null;if(page==='reports'){renderCoverage();renderLibrary();}}
    });
  }
  if(!libraryFiles){view.innerHTML=empty(libraryMessage||'正在读取历史归档…');return;}
  const matches=libraryFiles.filter(f=>f.kind===kind&&dateMatch([f.start,f.end],dateSelection('archive')));
  $('count').textContent=matches.length+' 期';
  let month='';
  const list=matches.map((f,i)=>{
    const newMonth=f.end.slice(0,7),heading=month===newMonth?'':'<h3 class="archive-month">'+newMonth.replace('-',' 年 ')+' 月</h3>';month=newMonth;
    const stats=kind==='lingxi'?lingxiSummaries.get(f.start+'/'+f.end):null;
    const metrics=stats?'<p>本周浏览 '+esc(stats.week_views)+'（'+esc(stats.week_views_wow)+'） · 本周互动 '+esc(stats.week_engage)+'（'+esc(stats.week_engage_wow)+'）</p>':'';
    return heading+'<article class="row"><div class="date">'+esc(f.end)+'</div><div><h3>'+typeName+'</h3><small>'+esc(f.start)+' 至 '+esc(f.end)+'</small>'+metrics+'</div><button type="button" class="more" data-library="'+i+'">打开 PDF</button></article>';
  }).join('');
  view.innerHTML=periodDateForm('archive')+'<div id="library-preview"></div><div class="archive-list">'+(list||empty('所选日期没有归档的'+typeName+'。'))+'</div>';
  const preview=$('library-preview');let active;
  view.querySelectorAll('[data-library]').forEach(button=>button.onclick=async()=>{
    const row=matches[Number(button.dataset.library)];const task={};active=task;
    preview.textContent='正在打开 '+row.start+' 至 '+row.end+' 的'+label+'…';
    preview.scrollIntoView({behavior:'smooth',block:'start'});
    try{
      const response=await readLibrary('/api/team-library/'+[row.kind,row.start,row.end].join('/'),libraryProof);
      const blob=await reportBlob(response,team,row);
      if(active!==task||!preview.isConnected)return;
      releaseLibraryPDF();pdfURL=URL.createObjectURL(blob);
      const frame=document.createElement('iframe');frame.title=typeName+' '+row.end;frame.className='pdf-frame';frame.src=pdfURL;
      const open=document.createElement('a');open.textContent=row.start+' 至 '+row.end+' · 在新窗口打开 PDF ↗';open.className='station-link';open.href=pdfURL;open.target='_blank';open.rel='noopener';
      preview.replaceChildren(open,frame);
    }catch(e){if(preview.isConnected&&active===task)preview.textContent=e.message;}
  });
}
