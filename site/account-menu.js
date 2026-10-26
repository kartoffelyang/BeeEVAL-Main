let identitySignature;
const signature=user=>JSON.stringify(user?[user.id,user.username,user.display_name,user.membership_tier,user.capabilities]:null);
// Keep the return URL and scroll position within this tab, including hash anchors.
document.addEventListener('click',event=>{
 const link=event.target.closest('a[href]');if(!link)return;
 const url=new URL(link.href,location.href);
 if(url.origin!==location.origin||url.pathname!=='/login.html'||url.searchParams.has('account')||url.searchParams.has('logout')||location.pathname==='/login.html')return;
 const back=location.pathname+location.search+location.hash;
 sessionStorage.setItem('beeeval-login-origin',JSON.stringify({url:back,scroll:window.scrollY}));
 if(!url.searchParams.has('return')){url.searchParams.set('return',back);link.href=url.href}
},true);
try{
 const saved=JSON.parse(sessionStorage.getItem('beeeval-login-origin')||'null');
 if(saved?.url===location.pathname+location.search+location.hash){
  const restore=()=>requestAnimationFrame(()=>requestAnimationFrame(()=>{const previous=document.documentElement.style.scrollBehavior;document.documentElement.style.scrollBehavior='auto';window.scrollTo({top:saved.scroll||0,behavior:'instant'});sessionStorage.removeItem('beeeval-login-origin');requestAnimationFrame(()=>{document.documentElement.style.scrollBehavior=previous})}));
  if(document.readyState==='complete')restore();else window.addEventListener('load',restore,{once:true});
 }
}catch{}
let syncing=false;
async function refreshIdentity(){
 if(syncing||identitySignature===undefined||document.visibilityState==='hidden'||location.pathname==='/login.html')return;
 syncing=true;try{const response=await fetch('/api/session',{credentials:'same-origin',cache:'no-store'});if(response.ok&&signature((await response.json()).user)!==identitySignature)location.reload()}catch{}finally{syncing=false}
}
window.addEventListener('focus',refreshIdentity);document.addEventListener('visibilitychange',refreshIdentity);
// Shared header account control for every company page.
export function mountAccountMenu(user){
 identitySignature=signature(user);
 if(!user)return;
 document.querySelectorAll('.member-entry,.mobile-member').forEach(entry=>{
  if(entry.matches('.mobile-member')){entry.textContent='会员中心';entry.href='/login.html?account=1';return}
  entry.hidden=true;
  let menu=entry.parentElement.querySelector('.account-menu');
  if(!menu){
   menu=document.createElement('div');menu.className='account-menu';
   menu.innerHTML='<button class="account-avatar" type="button" aria-haspopup="true" aria-expanded="false" aria-label="账号菜单"></button><div class="account-dropdown" hidden><strong class="account-name"></strong><span class="account-tier"></span><a href="/login.html?account=1">会员中心</a><button type="button" class="account-signout">退出登录</button><p role="status" aria-live="polite"></p></div>';
   entry.after(menu);
   const toggle=menu.querySelector('.account-avatar'),panel=menu.querySelector('.account-dropdown');
   const close=()=>{panel.hidden=true;toggle.setAttribute('aria-expanded','false')};
   toggle.addEventListener('click',()=>{const open=panel.hidden;panel.hidden=!open;toggle.setAttribute('aria-expanded',String(open))});
   document.addEventListener('click',event=>{if(!menu.contains(event.target))close()});
   menu.addEventListener('keydown',event=>{if(event.key==='Escape'){close();toggle.focus()}});
   menu.querySelector('.account-signout').addEventListener('click',async event=>{
    const button=event.currentTarget,status=menu.querySelector('[role=status]');button.disabled=true;
    try{const response=await fetch('/api/logout',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:'{}'});if(!response.ok)throw Error();location.reload()}
    catch{status.textContent='退出失败，请重试。';button.disabled=false}
   });
  }
  let adminLink=menu.querySelector('.admin-permissions-entry');
  if(user.role==='admin'&&!adminLink){adminLink=document.createElement('a');adminLink.className='admin-permissions-entry';adminLink.href='/data/admin/users';adminLink.textContent='账号权限管理';adminLink.target='_blank';adminLink.rel='noopener';menu.querySelector('.account-signout').before(adminLink)}
  if(user.role!=='admin')adminLink?.remove();
  const name=user.display_name||user.username||'U';
  menu.querySelector('.account-avatar').textContent=Array.from(name)[0].toUpperCase();
  menu.querySelector('.account-avatar').title=name;
  menu.querySelector('.account-name').textContent=name;
  menu.querySelector('.account-tier').textContent=({admin:'管理员',free:'Free',base:'Base',plus:'Plus',pro:'Pro',max:'Max',trial:'试用会员'})[user.capabilities?.level||user.membership_tier]||'会员';
 });
}
