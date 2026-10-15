const {createServer}=require('node:http'),{spawn}=require('node:child_process'),assert=require('node:assert/strict');
(async()=>{
const upstream=createServer((req,res)=>{
 if(req.url==='/api/auth/me'){res.writeHead(401,{'content-type':'application/json'});res.end('{"detail":"unauthorized"}');}
 else if(req.url==='/api/video/stream'){assert.equal(req.headers.range,'bytes=0-3');res.writeHead(206,{'Content-Type':'video/mp4','Content-Range':'bytes 0-3/8'});res.end('test');}
 else if(req.url==='/api/admin/users'){assert.equal(req.method,'POST');assert.equal(req.headers.authorization,'Bearer mock-only');assert.equal(req.headers.origin,'https://www.beeeval.com');assert.equal(req.headers.referer,'https://www.beeeval.com/light/');let s='';req.on('data',c=>s+=c);req.on('end',()=>{assert.equal(s,'{}');res.writeHead(403);res.end('{}');});}
 else {res.writeHead(404);res.end();}
});await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
const child=spawn(process.execPath,['server/dist/index.mjs'],{env:{...process.env,PORT:String(port),BEEEVAL_UPSTREAM:`http://127.0.0.1:${upstream.address().port}`},stdio:'ignore'});
try {
let ready=false;for(let i=0;i<50;i++){try{const r=await fetch(`http://127.0.0.1:${port}/health`);if(r.ok){ready=true;break;}}catch{} await new Promise(r=>setTimeout(r,50));}assert.ok(ready);
const base=`http://127.0.0.1:${port}`;
let r=await fetch(base+'/api/video/stream',{headers:{Range:'bytes=0-3'}});assert.equal(r.status,206);assert.equal(r.headers.get('content-range'),'bytes 0-3/8');assert.equal(await r.text(),'test');
r=await fetch(base+'/api/admin/users',{method:'POST',headers:{Authorization:'Bearer mock-only','Content-Type':'application/json',Origin:'https://www.beeeval.com',Referer:'https://www.beeeval.com/light/'},body:'{}'});assert.equal(r.status,403);
r=await fetch(base+'/api/cases/search');assert.equal(r.status,401);
r=await fetch(base+'/api/cases/search',{method:'POST',body:'{}'});assert.equal(r.status,405);
r=await fetch(base+'/not-a-proxy');assert.equal(r.status,404);
console.log('PASS: production proxy Range/206, streaming bytes, authenticated method/body forwarding, search authentication and route isolation.');
}finally{child.kill();await new Promise(r=>upstream.close(r));}
})().catch(e=>{console.error(e);process.exit(1)});
