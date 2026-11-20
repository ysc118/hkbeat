import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
export function validateTeam(team){
  if(!/^[A-Za-z0-9_-]{43}$/.test(team||''))throw Error('Missing or invalid TEAM_ACCESS_KEY');
  return team;
}
export function keyFor(team,domain){return createHash('sha256').update(domain+validateTeam(team)).digest();}
export function seal(bytes,team,domain){
  const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',keyFor(team,domain),nonce);
  return Buffer.concat([nonce,cipher.update(bytes),cipher.final(),cipher.getAuthTag()]);
}
export function open(bytes,team,domain){
  if(bytes.length<28)throw Error('Incomplete encrypted file');
  const decipher=createDecipheriv('aes-256-gcm',keyFor(team,domain),bytes.subarray(0,12));
  decipher.setAuthTag(bytes.subarray(-16));
  return Buffer.concat([decipher.update(bytes.subarray(12,-16)),decipher.final()]);
}
