import {mkdtemp,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import assert from 'node:assert/strict';
const directory=await mkdtemp(join(tmpdir(),'beeeval-scene-release-'));
const probe=createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(r=>probe.close(r));
await symlink(resolve('scenario-library/server'),join(directory,'current'));
const child=spawn(process.execPath,[join(directory,'current/index.mjs')],{env:{...process.env,API_PORT:String(port),DATABASE_PATH:join(directory,'scenes.sqlite')},stdio:'ignore'});
try{
 let ready=false;
 for(let attempt=0;attempt<50;attempt++){
  try{const r=await fetch('http://127.0.0.1:'+port+'/api/session');assert.equal(r.status,200);assert.equal((await r.json()).user,null);ready=true;break}catch{await new Promise(r=>setTimeout(r,50))}
 }
 assert(ready,'scenario service must listen when started through the current-release symlink');
 console.log('PASS: scenario service starts through a release symlink');
}finally{child.kill('SIGTERM');await once(child,'exit');await rm(directory,{recursive:true,force:true})}
