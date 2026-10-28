import {randomBytes} from 'node:crypto';
export function createMiniReportBridge({remote,cookie,token,reportAccess,loadCatalog}){
 const tickets=new Map(),ttl=60000;
 async function body(req){let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>1024)throw Error('body');}return JSON.parse(text||'{}');}
 function collect(){const now=Date.now();for(const [key,value]of tickets)if(value.expires<=now)tickets.delete(key);}
 async function identity(value){if(!value)return null;const r=await remote('me',{headers:{Authorization:'Bearer '+value}});return r.ok?await r.json():null;}
 function permitted(user,id){const catalog=loadCatalog();return Object.prototype.hasOwnProperty.call(catalog,id)&&reportAccess(user,id,catalog);}
 return async(req,route,send,res)=>{
  if(req.method!=='POST')return send(405,{error:'请使用 POST 请求'});
  let input;try{input=await body(req);}catch{return send(400,{error:'请求格式错误'});}
  collect();
  if(route==='/api/mini/report-link'){
   const id=input.id;if(typeof id!=='string'||!/^[a-z0-9-]{1,64}$/.test(id))return send(400,{error:'报告编号无效'});
   const value=token(req),user=await identity(value);if(!user)return send(401,{error:'请重新登录小程序'});
   if(!permitted(user,id))return send(403,{error:'当前账号没有这份报告的阅读权限'});
   const pending=[...tickets].filter(([,t])=>t.userId===user.id);for(const [key]of pending.slice(0,Math.max(0,pending.length-2)))tickets.delete(key);
   if(tickets.size>=1024)return send(429,{error:'阅读请求较多，请稍后重试'});
   const ticket=randomBytes(32).toString('base64url');tickets.set(ticket,{value,id,userId:user.id,expires:Date.now()+ttl});
   // Fragment is not sent to access logs; the page clears it before exchanging.
   return send(200,{url:'https://www.beeeval.com/mini-report-entry.html?beeeval_mini=1#ticket='+ticket});
  }
  if(route==='/api/mini/report-session'){
   const ticket=input.ticket;if(typeof ticket!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(ticket))return send(401,{error:'阅读会话无效，请返回报告列表重新打开'});
   const item=tickets.get(ticket);tickets.delete(ticket);
   if(!item||item.expires<=Date.now())return send(401,{error:'阅读会话已过期，请返回报告列表重新打开'});
   const user=await identity(item.value);if(!user)return send(401,{error:'登录已失效，请返回小程序重新登录'});
   if(!permitted(user,item.id))return send(403,{error:'当前账号没有这份报告的阅读权限'});
   res.setHeader('Set-Cookie',[cookie(item.value),'beeeval_signed_out=; Domain=.beeeval.com; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0']);
   return send(200,{url:'/reports/'+encodeURIComponent(item.id)+'/?beeeval_mini=1'});
  }
  return send(404,{error:'接口不存在'});
 };
}
