import {handleContact} from './contact.mjs';
import http from 'node:http';
import {createMiniContent} from './mini-content.mjs';
import {createMiniReportBridge} from './mini-report-session.mjs';
const upstream=process.env.BEEEVAL_AUTH_ORIGIN||'https://open.beeeval.com';
const cookieName='beeeval_session';
const trusted=new Set(['https://www.beeeval.com','https://beeeval.com','https://open.beeeval.com']);
const cookie=(value,remember=true)=>`${cookieName}=${value}; Domain=.beeeval.com; Path=/; HttpOnly; Secure; SameSite=Lax${!value?'; Max-Age=0':remember?'; Max-Age=604800':''}`;
function token(req){if((req.headers.cookie||'').split(';').some(s=>s.trim()==='beeeval_signed_out=1'))return undefined;return (req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1)}
export {capabilities} from './permissions.mjs';
import {capabilities,reportAccess,loadCatalog} from './permissions.mjs';
const attempts=new Map();
async function remote(path,options={}){return fetch(upstream+'/api/auth/'+path,{...options,signal:AbortSignal.timeout(10000)})}
const miniReportBridge=createMiniReportBridge({remote,cookie,token,reportAccess,loadCatalog});
const miniContent=createMiniContent({remote,token,capabilities});
http.createServer(async(req,res)=>{
 const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data))};
 try{
  const url=new URL(req.url,'http://localhost'),route=url.pathname;
  if(route==='/api/contact')return await handleContact(req,res);
  if(route==='/api/mini/home'){
   if(req.method!=='GET')return send(405,{error:'请使用 GET 请求'});
   if(url.search)return send(403,{error:'首页预览不支持搜索或翻页，请升级会员'});
   const value=token(req);if(!value)return send(401,{error:'请先登录'});
   const response=await remote('mini-home',{headers:{Authorization:'Bearer '+value}});
   const result=await response.json();if(response.ok){for(const key of ['vehicles','records'])if(Array.isArray(result[key]))result[key]=result[key].filter(row=>!/^理想\s*i8$/i.test(row.brand_model||row.name||''));}return send(response.status,response.ok?result:{error:typeof result.detail==='string'?result.detail:'首页暂时不可用'});
  }
  if(['/api/mini/scenes','/api/mini/preview-case','/api/mini/preview-vehicle'].includes(route))return await miniContent(req,route,url,send);
  if(route==='/api/registration-options'){const response=await remote('registration-options');return send(response.status,await response.json())}
  if(['/api/profile','/api/register','/api/register-code','/api/change-password','/api/password-reset-code','/api/password-reset'].includes(route)){
   if(!trusted.has(req.headers.origin)&&req.method!=='GET')return send(403,{error:'请求来源不匹配'});
   if(!['GET','POST'].includes(req.method))return send(405,{error:'请求方式不支持'});
   if(route!='/api/profile'&&req.method!=='POST')return send(405,{error:'请求方式不支持'});
   if(req.method==='POST'&&!String(req.headers['content-type']||'').startsWith('application/json'))return send(415,{error:'请使用 JSON 请求'});
   let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>4096)return send(413,{error:'内容过长'})}
   const value=token(req),path=route.split('/').at(-1),headers={'Content-Type':'application/json'};if(value)headers.Authorization='Bearer '+value;
   const response=await remote(path,{method:req.method,headers,...(req.method==='POST'?{body}:{})});const result=await response.json();
   if(path==='register'&&response.ok){res.setHeader('Set-Cookie',[cookie(result.access_token,false),'beeeval_signed_out=; Domain=.beeeval.com; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0']);return send(200,{user:{...result.user,capabilities:capabilities(result.user)}})}
   if(path==='password-reset'&&response.ok)res.setHeader('Set-Cookie',cookie(''));
   if(!response.ok)return send(response.status,{error:result.detail||'账号操作失败'});return send(200,result);
  }
  if(req.method==='POST'){
   if(!trusted.has(req.headers.origin))return send(403,{error:'请求来源不匹配'});
   if(!String(req.headers['content-type']||'').startsWith('application/json'))return send(415,{error:'请使用 JSON 请求'});
   if(route==='/api/logout'){
    res.setHeader('Set-Cookie',[cookie(''),'beeeval_signed_out=1; Domain=.beeeval.com; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800','beescene_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0']);return send(200,{ok:true});
   }
   if(route==='/api/mini/report-link'||route==='/api/mini/report-session'){await miniReportBridge(req,route,send,res);return;}
   if(route==='/api/wechat-login'){
    let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>2048)return send(413,{error:'内容过长'})}
    let credentials;try{credentials=JSON.parse(body)}catch{return send(400,{error:'无效请求'})}
    if(typeof credentials.code!=='string'||!credentials.code||credentials.code.length>256)return send(400,{error:'微信登录凭证无效'});
    const response=await remote('wechat-login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:credentials.code})});
    const result=await response.json();if(!response.ok)return send(response.status,{error:typeof result.detail==='string'?result.detail:'微信注册暂未开通，请先使用现有 BeeEVAL 账号登录'});
    if(!result.access_token||!result.user)return send(502,{error:'微信登录未返回有效账号'});
    res.setHeader('Set-Cookie',[cookie(result.access_token),'beeeval_signed_out=; Domain=.beeeval.com; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0']);return send(200,{user:{...result.user,capabilities:capabilities(result.user)},registered:!!result.registered});
   }
   if(route!=='/api/login')return send(404,{error:'接口不存在'});
   const ip=req.headers['x-real-ip']||req.socket.remoteAddress,now=Date.now(),recent=(attempts.get(ip)||[]).filter(t=>now-t<900000);
   if(recent.length>=20)return send(429,{error:'尝试过于频繁，请稍后再试'});recent.push(now);attempts.set(ip,recent);
   let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>4096)return send(413,{error:'内容过长'})}
   let credentials;try{credentials=JSON.parse(body)}catch{return send(400,{error:'无效请求'})}
   const {username,password}=credentials;if(typeof username!=='string'||typeof password!=='string'||username.length>64||password.length>200)return send(400,{error:'请输入用户名和密码'});
   const response=await remote('login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});
   const result=await response.json();if(!response.ok)return send(response.status,{error:result.detail==='account_expired'?'账号已到期':result.detail==='account_disabled'?'账号已停用':'用户名或密码不正确'});
   if(result.user.must_reset_pwd)return send(403,{error:'该账号需要更新密码，请通过“忘记密码”完成更新，或联系账号支持。'});
   res.setHeader('Set-Cookie',[cookie(result.access_token,credentials.remember_me===true),'beeeval_signed_out=; Domain=.beeeval.com; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0']);return send(200,{user:{...result.user,capabilities:capabilities(result.user)}});
  }
  const value=token(req);let user=null;
  if(value){const response=await remote('me',{headers:{Authorization:'Bearer '+value}});if(response.ok)user=await response.json();else if(response.status>=500)return send(503,{error:'账号服务暂时不可用'})}
  if(route==='/api/session')return send(200,{user:user?{...user,capabilities:capabilities(user)}:null});
  if(route==='/auth'){const kind=url.searchParams.get('kind'),path=url.searchParams.get('path')||'',id=path.match(/^\/reports\/([a-z0-9-]+)\//)?.[1];const allowed=!!user&&(kind==='report'?reportAccess(user,id,loadCatalog()):kind==='scene'?capabilities(user).scenarios:kind==='data'?capabilities(user).benchmark:false);res.writeHead(!user?401:allowed?204:403,{'Cache-Control':'no-store'});return res.end()}
  send(404,{error:'接口不存在'});
 }catch{send(503,{error:'账号服务暂时不可用，请稍后重试'})}
}).listen(Number(process.env.PORT||5190),'127.0.0.1');
