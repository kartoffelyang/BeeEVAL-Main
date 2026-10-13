import http from 'node:http';
const upstream=process.env.BEEEVAL_AUTH_ORIGIN||'https://open.beeeval.com';
const cookieName='beeeval_session';
const trusted=new Set(['https://www.beeeval.com','https://beeeval.com','https://open.beeeval.com']);
const cookie=value=>`${cookieName}=${value}; Domain=.beeeval.com; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${value?604800:0}`;
function token(req){if((req.headers.cookie||'').split(';').some(s=>s.trim()==='beeeval_signed_out=1'))return undefined;return (req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1)}
export function capabilities(user){const full=user?.role==='admin';return {reports:full,scenarios:!!user,benchmark:!!user,level:full?'full':'member'}}
const attempts=new Map();
async function remote(path,options={}){return fetch(upstream+'/api/auth/'+path,{...options,signal:AbortSignal.timeout(10000)})}
http.createServer(async(req,res)=>{
 const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data))};
 try{
  const url=new URL(req.url,'http://localhost'),route=url.pathname;
  if(req.method==='POST'){
   if(!trusted.has(req.headers.origin))return send(403,{error:'请求来源不匹配'});
   if(!String(req.headers['content-type']||'').startsWith('application/json'))return send(415,{error:'请使用 JSON 请求'});
   if(route==='/main/api/logout'){
    res.setHeader('Set-Cookie',[cookie(''),'beeeval_signed_out=1; Domain=.beeeval.com; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800','beescene_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0']);return send(200,{ok:true});
   }
   if(route!=='/main/api/login')return send(404,{error:'接口不存在'});
   const ip=req.headers['x-real-ip']||req.socket.remoteAddress,now=Date.now(),recent=(attempts.get(ip)||[]).filter(t=>now-t<900000);
   if(recent.length>=20)return send(429,{error:'尝试过于频繁，请稍后再试'});recent.push(now);attempts.set(ip,recent);
   let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>4096)return send(413,{error:'内容过长'})}
   let credentials;try{credentials=JSON.parse(body)}catch{return send(400,{error:'无效请求'})}
   const {username,password}=credentials;if(typeof username!=='string'||typeof password!=='string'||username.length>64||password.length>200)return send(400,{error:'请输入用户名和密码'});
   const response=await remote('login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});
   const result=await response.json();if(!response.ok)return send(response.status,{error:result.detail==='account_expired'?'账号已到期':result.detail==='account_disabled'?'账号已停用':'用户名或密码不正确'});
   if(result.user.must_reset_pwd)return send(403,{error:'请先在 BeeEVAL 平台完成账号密码初始化'});
   res.setHeader('Set-Cookie',[cookie(result.access_token),'beeeval_signed_out=; Domain=.beeeval.com; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0']);return send(200,{user:{...result.user,capabilities:capabilities(result.user)}});
  }
  const value=token(req);let user=null;
  if(value){const response=await remote('me',{headers:{Authorization:'Bearer '+value}});if(response.ok)user=await response.json();else if(response.status>=500)return send(503,{error:'账号服务暂时不可用'})}
  if(route==='/main/api/session')return send(200,{user:user?{...user,capabilities:capabilities(user)}:null});
  if(route==='/auth'){res.writeHead(!user?401:url.searchParams.get('kind')==='report'&&!capabilities(user).reports?403:204,{'Cache-Control':'no-store'});return res.end()}
  send(404,{error:'接口不存在'});
 }catch{send(503,{error:'账号服务暂时不可用，请稍后重试'})}
}).listen(Number(process.env.PORT||5190),'127.0.0.1');
