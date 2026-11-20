/* Team data stays encrypted on GitHub and is unlocked only in the reader's browser. */
(() => {
  const originalFetch=window.fetch.bind(window),base=new URL('./',location.href);
  let snapshot,team='',manifest,started=false;
  const encoder=new TextEncoder(),decoder=new TextDecoder();
  const valid=value=>/^[A-Za-z0-9_-]{43}$/.test(value||'');
  const readTeam=()=>{
    const incoming=new URLSearchParams(location.hash.split('?')[1]||'').get('team');
    if(incoming!==null)return incoming;
    try{return sessionStorage.getItem('moonfox.team')||'';}catch{return '';}
  };
  async function asset(name,hash){
    const url=new URL(name,base);if(hash)url.searchParams.set('v',hash);
    const result=await originalFetch(url,{cache:'no-store',redirect:'error'});
    if(!result.ok)throw Error('资料未能读取，请稍后刷新。');
    return result;
  }
  async function decrypt(bytes,domain){
    const hash=await crypto.subtle.digest('SHA-256',encoder.encode(domain+team));
    const key=await crypto.subtle.importKey('raw',hash,'AES-GCM',false,['decrypt']);
    return crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.subarray(0,12)},key,bytes.subarray(12));
  }
  const json=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
  window.stationFetch=async(input,options={})=>{
    if(!snapshot)throw Error('请先使用团队链接打开资料。');
    if(options.method&&options.method!=='GET')return new Response('',{status:405});
    const route=String(input);
    if(route==='./market.json')return json(snapshot.market);
    if(route==='/api/xhs')return json(snapshot.xhs);
    if(route==='/api/team-library')return json(snapshot.library);
    if(route==='/api/team-library/lingxi-data')return json(snapshot.lingxi);
    if(route==='/api/app-snapshot')return asset('data/app.enc',manifest.hashes['app.enc']);
    if(route.startsWith('/api/team-notes/')){
      const week=route.slice('/api/team-notes/'.length);
      return snapshot.notes[week]?json(snapshot.notes[week]):new Response('',{status:404});
    }
    const pdf=route.match(/^\/api\/team-library\/(weekly|lingxi)\/(\d{4}-\d{2}-\d{2})\/(\d{4}-\d{2}-\d{2})$/);
    if(pdf){
      const record=snapshot.library.files.find(row=>row.kind===pdf[1]&&row.start===pdf[2]&&row.end===pdf[3]);
      if(!record)return new Response('',{status:404});
      const response=await asset('data/pdf/'+pdf.slice(1).join('_')+'.enc');
      return new Response(await response.arrayBuffer(),{headers:{'Content-Type':'application/vnd.market.team-pdf'}});
    }
    return new Response('',{status:404});
  };
  function gate(message){
    document.getElementById('station-gate').hidden=false;
    document.getElementById('station-shell').hidden=true;
    document.getElementById('gate-message').textContent=message;
  }
  function showStatus(status){
    const element=document.getElementById('cloud-status');
    const time=value=>value?new Date(value).toLocaleString('zh-HK',{timeZone:'Asia/Hong_Kong',hour12:false}):'尚未成功连接';
    element.textContent='月狐日度截至 '+(status.dailyThrough||'—')+' · 最近 API 成功同步：'+time(status.lastSuccess)+'（香港时间）。'+
      (status.state==='complete'?'云端计划每小时检查一次；数据以月狐实际发布进度为准。':status.message||'当前为迁移归档数据，自动更新待启用。');
    element.dataset.state=status.state;
  }
  async function start(){
    const candidate=readTeam();
    if(!valid(candidate)){gate('请使用收到的完整团队链接打开，无需登录 GitHub 或 ChatGPT。');return;}
    if(started)return;
    team=candidate;
    try{
      gate('正在读取团队资料…');
      manifest=await (await asset('data/manifest.json')).json();
      const bytes=new Uint8Array(await (await asset('data/catalog.enc',manifest.hashes['catalog.enc'])).arrayBuffer());
      const compressed=await decrypt(bytes,'hkbeat-catalog-v1/');
      const plain=await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
      snapshot=JSON.parse(plain);
      // Verify the App key before revealing the rest of the dashboard.
      const appBytes=new Uint8Array(await (await asset('data/app.enc',manifest.hashes['app.enc'])).arrayBuffer());
      JSON.parse(decoder.decode(await decrypt(appBytes,'moonfox-team-v1/')));
      try{sessionStorage.setItem('moonfox.team',team);}catch{}
      const status=await (await asset('data/status.json',manifest.hashes['status.json'])).json();
      showStatus(status);
      document.getElementById('station-gate').hidden=true;
      document.getElementById('station-shell').hidden=false;
      started=true;
      for(const name of window.STATION_SCRIPTS){
        await new Promise((resolve,reject)=>{
          const script=document.createElement('script');script.src=new URL(name,base);script.onload=resolve;script.onerror=reject;document.body.append(script);
        });
      }
      document.getElementById('cloud-refresh').onclick=()=>location.reload();
      document.getElementById('cloud-lock').onclick=()=>{try{sessionStorage.removeItem('moonfox.team');}catch{}history.replaceState(null,'',base.pathname);location.reload();};
      setInterval(async()=>{
        try{
          const current=await (await asset('data/manifest.json')).json();
          if(current.generation!==manifest.generation){
            const button=document.getElementById('cloud-refresh');button.textContent='有新版本，刷新查看';button.classList.add('new-data');
          }
        }catch{document.getElementById('cloud-status').textContent='更新状态暂时无法检查，当前资料仍可阅读。';}
      },300000);
    }catch{
      started=false;snapshot=null;
      gate('资料未能解锁或网络未连通。请确认使用完整团队链接，然后刷新重试。');
    }
  }
  document.getElementById('gate-form').addEventListener('submit',event=>{
    event.preventDefault();
    let value=document.getElementById('team-link').value.trim();
    try{if(value.startsWith('https://'))value=new URLSearchParams(new URL(value).hash.split('?')[1]||'').get('team')||'';}catch{value='';}
    if(!valid(value)){document.getElementById('gate-message').textContent='这条团队链接不完整。';return;}
    const [section,query]=location.hash.slice(1).split('?'),params=new URLSearchParams(query||'');params.set('team',value);
    history.replaceState(null,'','#'+(section||'moonfox')+'?'+params.toString());
    start();
  });
  window.addEventListener('hashchange',()=>{if(!started)start();});
  start();
})();
