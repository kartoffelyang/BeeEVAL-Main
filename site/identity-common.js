export const $=s=>document.querySelector(s);
export const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const validPassword=value=>typeof value==='string'&&value.length>=10&&value.length<=128&&/[A-Za-z]/.test(value)&&/[0-9]/.test(value);
export async function call(path,body){
 const response=await fetch('/api/'+path,{method:body!==undefined?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:body!==undefined?{'Content-Type':'application/json'}:undefined,body:body!==undefined?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
 let data;try{data=await response.json()}catch{throw Error('账号服务暂时不可用，请稍后重试。')}
 if(!response.ok)throw Error(typeof data.error==='string'?data.error:typeof data.detail==='string'?data.detail:'操作未完成，请检查填写内容后重试。');return data;
}
export function safeReturn(value){
 if(!value)return null;
 try{const u=new URL(value,location.origin);if(u.origin!==location.origin||!/^https?:$/.test(u.protocol)||u.pathname==='/login.html'||u.username||u.password)return null;return u.pathname+u.search+u.hash}catch{return null}
}
export function destination(user){
 let saved;try{saved=JSON.parse(sessionStorage.getItem('beeeval-login-origin')||'null')}catch{}
 const path=safeReturn(new URLSearchParams(location.search).get('return'))||safeReturn(saved?.url)||'/';
 if(/^\/data(?:\/|$)/.test(path)&&!user?.capabilities?.benchmark)return '/preview.html?product=platform';
 if(/^\/scenes(?:\/|$)/.test(path)&&!user?.capabilities?.scenarios)return '/preview.html?product=scenes';
 return path;
}
export function passwordField(id,label,autocomplete='new-password',minlength=10){return `<div class="identity-field"><label for="${id}">${label}</label><div class="input-password"><input id="${id}" name="${id}" type="password" autocomplete="${autocomplete}" ${minlength?`minlength="${minlength}"`:''} maxlength="128" required><button type="button" data-show-password="${id}" aria-label="显示${label}" aria-pressed="false">显示</button></div></div>`}
export function bindPasswords(root=document){root.querySelectorAll('[data-show-password]').forEach(button=>button.onclick=()=>{const input=document.getElementById(button.dataset.showPassword),show=input.type==='password';input.type=show?'text':'password';button.textContent=show?'隐藏':'显示';button.setAttribute('aria-pressed',String(show));button.setAttribute('aria-label',(show?'隐藏':'显示')+(input.autocomplete==='current-password'?'密码':'设置的密码'))})}
export function status(id,message,state='error'){const el=document.getElementById(id);if(el){el.textContent=message;el.dataset.state=state}}
export async function busy(form,label,action){const b=form.querySelector('[type=submit]'),original=b.textContent;b.disabled=true;b.textContent=label;try{await action()}finally{b.disabled=false;b.textContent=original}}
document.querySelector('.menu')?.addEventListener('click',event=>{const nav=document.querySelector('.header nav'),open=nav.classList.toggle('open');event.currentTarget.setAttribute('aria-expanded',String(open))});
