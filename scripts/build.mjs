import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const root=new URL('../',import.meta.url),site=new URL('site/',root),dist=new URL('dist/',root);
async function files(dir){const out=[];for(const e of await fs.readdir(dir,{withFileTypes:true}))out.push(...(e.isDirectory()?await files(path.join(dir,e.name)):[path.join(dir,e.name)]));return out;}
const {fileURLToPath}=await import('node:url');
const paths=await files(fileURLToPath(site));
if(paths.some(p=>/\.(pdf|xlsx|env)$/i.test(p)))throw Error('Unencrypted source file in website output');
if(paths.some(p=>p.endsWith('.tmp')))throw Error('Interrupted write; build refused');
await fs.mkdir(dist,{recursive:true});
await fs.cp(site,dist,{recursive:true});
const hashes={};
for(const name of ['catalog.enc','app.enc','status.json'])hashes[name]=createHash('sha256').update(await fs.readFile(new URL('data/'+name,site))).digest('hex');
const manifest={version:1,hashes,publishedAt:new Date().toISOString()};
manifest.generation=createHash('sha256').update(JSON.stringify(hashes)).digest('hex').slice(0,24);
await fs.writeFile(new URL('data/manifest.json',dist),JSON.stringify(manifest));
console.log('Built '+paths.length+' website files; generation '+manifest.generation);
