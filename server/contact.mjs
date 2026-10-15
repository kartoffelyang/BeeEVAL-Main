import nodemailer from 'nodemailer';
const mailbox='beeeval@xailab.cn';
const trusted=new Set(['https://www.beeeval.com','https://beeeval.com']);
export function validateContact(body){
 const clean={};for(const key of ['name','email','message']){if(typeof body?.[key]!=='string')return null;clean[key]=body[key].trim()}
 if(clean.name.length<1||clean.name.length>80||clean.email.length>254||! /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(clean.email)||/[\r\n]/.test(clean.name+clean.email)||clean.message.length<5||clean.message.length>4000)return null;
 return clean;
}
export function createContactHandler({transport,env=process.env,now=Date.now}={}){
 const attempts=new Map();let smtp=transport;
 return async(req,res)=>{
 const send=(status,code)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(status===200?{ok:true}:{code}))};
 if(req.method!=='POST')return send(405,'method_not_allowed');
 if(!trusted.has(req.headers.origin))return send(403,'invalid_origin');
 if(!String(req.headers['content-type']||'').startsWith('application/json'))return send(415,'invalid_content_type');
 let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>20000)return send(413,'message_too_large')}
 let body;try{body=JSON.parse(raw)}catch{return send(400,'invalid_message')}
 const clean=validateContact(body);if(!clean||body.website)return send(400,'invalid_message');
 const time=now();for(const [key,times]of attempts)if(times.every(t=>time-t>3600000))attempts.delete(key);
 const ip=String(req.headers['x-real-ip']||req.socket.remoteAddress),recent=(attempts.get(ip)||[]).filter(t=>time-t<3600000);
 if(recent.length>=5)return send(429,'rate_limited');attempts.set(ip,[...recent,time]);
 if(!smtp){if(!env.SMTP_HOST||!env.SMTP_USER||!env.SMTP_PASSWORD||!env.SMTP_FROM)return send(503,'mail_unconfigured');
 smtp=nodemailer.createTransport({host:env.SMTP_HOST,port:Number(env.SMTP_PORT||465),secure:String(env.SMTP_PORT||465)==='465',requireTLS:String(env.SMTP_PORT||465)!=='465',auth:{user:env.SMTP_USER,pass:env.SMTP_PASSWORD},connectionTimeout:8000,greetingTimeout:8000,socketTimeout:12000,disableFileAccess:true,disableUrlAccess:true})}
 try{const sent=await smtp.sendMail({from:env.SMTP_FROM||mailbox,to:mailbox,replyTo:{name:clean.name,address:clean.email},subject:'BeeEVAL 官网合作留言',text:`姓名：${clean.name}\n邮箱：${clean.email}\n\n${clean.message}`,disableFileAccess:true,disableUrlAccess:true});if(!sent.accepted?.some(a=>String(a).toLowerCase()===mailbox))return send(502,'send_failed');return send(200)}catch{return send(502,'send_failed')}
 };
}
export const handleContact=createContactHandler();
