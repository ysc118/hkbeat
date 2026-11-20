import fs from 'node:fs/promises';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {seal,validateTeam} from './crypto.mjs';
import {completeThrough} from './moonfox.mjs';
const [source,linkFile]=process.argv.slice(2);
if(!source||!linkFile)throw Error('Usage: node scripts/export-local.mjs <local-reader-folder> <team-link-file>');
const match=(await fs.readFile(linkFile,'utf8')).match(/[?&]team=([A-Za-z0-9_-]{43})(?:\s|$|&)/);
const team=validateTeam(match?.[1]);
const root=new URL('../site/',import.meta.url);
const read=async name=>JSON.parse(await fs.readFile(path.join(source,'data',name+'.json'),'utf8'));
const payload={};
for(const name of ['xhs','market','library','lingxi'])payload[name]=await read(name);
payload.notes={};
for(const file of await fs.readdir(path.join(source,'data','notes'))){
  if(/^\d{4}-\d{2}-\d{2}\.json$/.test(file))payload.notes[file.slice(0,-5)]=await read('notes/'+file.slice(0,-5));
}
const app=await read('app');
await fs.mkdir(new URL('data/pdf/',root),{recursive:true});
await fs.writeFile(new URL('data/catalog.enc',root),seal(gzipSync(JSON.stringify(payload)),team,'hkbeat-catalog-v1/'));
await fs.writeFile(new URL('data/app.enc',root),seal(Buffer.from(JSON.stringify(app)),team,'moonfox-team-v1/'));
for(const row of payload.library.files){
  const route=[row.kind,row.start,row.end].join('/');
  if(!/^(weekly|lingxi)\/\d{4}-\d{2}-\d{2}\/\d{4}-\d{2}-\d{2}$/.test(route))throw Error('Invalid archive route');
  const pdf=await fs.readFile(path.join(source,'library',route+'.pdf'));
  if(!pdf.subarray(0,5).equals(Buffer.from('%PDF-')))throw Error('Invalid PDF');
  await fs.writeFile(new URL('data/pdf/'+route.replaceAll('/','_')+'.enc',root),Buffer.concat([Buffer.from('TEAMPDF1'),seal(pdf,team,'team-report-pdf/v1/'+route+'/')]));
}
const status={state:'not-configured',mode:'hourly-api',dailyThrough:completeThrough(app,'dau'),monthlyThrough:completeThrough(app,'mau'),lastSuccess:null,lastAttempt:null,importedAt:new Date().toISOString(),message:'当前为迁移归档数据，月狐后台密钥配置完成后启用自动同步。'};
await fs.writeFile(new URL('data/status.json',root),JSON.stringify(status,null,2)+'\n');
console.log(JSON.stringify({encryptedPdfs:payload.library.files.length,noteWeeks:Object.keys(payload.notes).length,searchThrough:Object.keys(payload.xhs.search_index.daily).sort().at(-1),dailyThrough:status.dailyThrough,marketEvents:payload.market.events.length}));
