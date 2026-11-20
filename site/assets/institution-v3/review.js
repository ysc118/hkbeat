'use strict';
let reviewAccess='',reviewFiles,reviewRequest,reviewError='';
function captureReviewAccess(){
  const incoming=params.get('review');
  if(incoming){
    if(/^[a-f0-9]{64}$/.test(incoming)){
      reviewAccess=incoming;reviewFiles=null;reviewError='';
      try{sessionStorage.setItem('weekly-review',incoming);}catch{}
    }
    params.delete('review');history.replaceState(null,'','#drafts');
  }
  if(!reviewAccess)try{reviewAccess=sessionStorage.getItem('weekly-review')||'';}catch{}
}
async function getReview(path){
  const response=await stationFetch(path,{headers:{Authorization:'Bearer '+reviewAccess},cache:'no-store',redirect:'error'});
  if(!response.ok)throw Error(response.status===403?'请从桌面「我的竞品周报（审阅）」重新打开。':'暂时无法读取周报，请刷新重试。');
  return response;
}
function renderReview(){
  $('count').textContent='';
  if(!reviewAccess){
    $('view').innerHTML=empty('待审周报可从项目电脑桌面的「我的竞品周报（审阅）」打开。')+
      '<a class="station-link" href="'+teamTarget('reports')+'">查看团队历史周报</a>';return;
  }
  if(!reviewFiles&&!reviewRequest&&!reviewError){
    reviewRequest=getReview('/api/reviews').then(r=>r.json()).then(d=>{reviewFiles=d.reports;})
      .catch(e=>{reviewError=e.message;}).finally(()=>{reviewRequest=null;if(page==='drafts')renderReview();});
  }
  if(!reviewFiles?.length){$('view').innerHTML=empty(reviewError||(reviewFiles?'还没有待审周报。':'正在读取待审周报…'));return;}
  $('count').textContent=new Set(reviewFiles.map(r=>r.week)).size+' 期';
  const rows=reviewFiles.map((r,i)=>'<article class="row"><div class="date">'+esc(r.week)+'</div><div><h3>小红书周报 · 待审稿</h3><small>入库 '+esc(new Date(r.uploaded).toLocaleString('zh-HK',{timeZone:'Asia/Hong_Kong'}))+'</small></div><div>'+
    '<button class="more" data-report="'+i+'" data-format="pdf">查看 PDF</button> <button class="more" data-report="'+i+'" data-format="html">下载可编辑 HTML</button></div></article>').join('');
  $('view').innerHTML='<div class="rows">'+rows+'</div><div id="report-preview"></div>';
  $('view').querySelectorAll('[data-report]').forEach(b=>b.onclick=async()=>{
    const row=reviewFiles[Number(b.dataset.report)],format=b.dataset.format;
    b.disabled=true;
    try{
      const r=await getReview('/api/reviews/'+row.week+'/'+row.version+'/'+format),url=URL.createObjectURL(await r.blob());
      if(format==='pdf'){
        const preview=$('report-preview');if(!preview){URL.revokeObjectURL(url);return;}
        const frame=document.createElement('iframe');frame.title=row.week+' 小红书周报';frame.src=url;frame.style.cssText='width:100%;height:78vh;border:0';
        const old=preview.querySelector('iframe');if(old)URL.revokeObjectURL(old.src);
        preview.replaceChildren(frame);preview.scrollIntoView({behavior:'smooth'});
      }else{
        const a=document.createElement('a');a.href=url;a.download='小红书周报_'+row.week+'.html';a.click();
        setTimeout(()=>URL.revokeObjectURL(url),60000);
      }
    }catch(e){const preview=$('report-preview');if(preview)preview.textContent=e.message;}
    finally{b.disabled=false;}
  });
}
