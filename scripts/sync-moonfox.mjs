import fs from 'node:fs/promises';
import {open,seal,validateTeam} from './crypto.mjs';
import {collect,completeThrough} from './moonfox.mjs';
const path=new URL('../site/data/',import.meta.url);
const read=name=>fs.readFile(new URL(name,path));
const write=async(name,body)=>{const target=new URL(name,path),temp=new URL(name+'.tmp',path);await fs.writeFile(temp,body);await fs.rename(temp,target);};
const status=JSON.parse(await read('status.json'));
status.lastAttempt=new Date().toISOString();
try{
  const team=validateTeam(process.env.TEAM_ACCESS_KEY),key=process.env.MOONFOX_DEV_KEY,secret=process.env.MOONFOX_DEV_SECRET;
  if(!key||!secret)throw Error('MOONFOX_CONFIGURATION_MISSING');
  const original=await read('app.enc');
  const current=JSON.parse(open(original,team,'moonfox-team-v1/'));
  const fresh=await collect(current,{key,secret});
  const dailyThrough=[completeThrough(fresh,'daily_new'),completeThrough(fresh,'dau')].sort()[0];
  if(!dailyThrough)throw Error('No complete observation date');
  const serialized=JSON.stringify(fresh);
  const changed=serialized!==JSON.stringify(current);
  if(changed)await write('app.enc',seal(Buffer.from(serialized),team,'moonfox-team-v1/'));
  Object.assign(status,{state:'complete',lastSuccess:new Date().toISOString(),dailyThrough,monthlyThrough:completeThrough(fresh,'mau'),changed,mode:'hourly-api',message:null});
  await write('status.json',JSON.stringify(status,null,2)+'\n');
  console.log('MoonFox checked successfully; daily through '+dailyThrough+'; data changed: '+changed);
}catch(error){
  const missing=error.message==='MOONFOX_CONFIGURATION_MISSING'||error.message==='Missing or invalid TEAM_ACCESS_KEY';
  Object.assign(status,{state:missing?'not-configured':'error',mode:'hourly-api',message:missing?'月狐自动更新密钥尚未配齐，当前显示迁移时的归档数据。':'本次月狐同步失败，已保留最近一次成功的数据。'});
  await write('status.json',JSON.stringify(status,null,2)+'\n');
  // Never print responses, credentials, or raw exceptions in public Actions logs.
  console.error(missing?'Required repository secrets are missing.':'MoonFox refresh failed. Previous observations have been preserved.');
  process.exitCode=1;
}
