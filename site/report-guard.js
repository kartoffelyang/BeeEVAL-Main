// Browser-level reading controls are deterrents, not DRM or a substitute for server authorization.
const en=document.documentElement.lang.startsWith('en');
const style=document.createElement('style');style.textContent=`
.bee-reading-watermark{position:fixed;inset:0;z-index:2147483646;pointer-events:none;display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr);overflow:hidden}.bee-reading-watermark span{align-self:center;justify-self:center;transform:rotate(-25deg);font:12px/1.6 sans-serif;color:rgba(96,88,70,.12);white-space:nowrap}.bee-reading-notice{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:2147483647;padding:12px 20px;background:#292620;color:white;border-radius:4px;font:14px/1.5 sans-serif;box-shadow:0 4px 20px #0002}.bee-reading-notice[hidden]{display:none!important}@media print{html body>*{display:none!important}html body::before{display:block!important;content:'BeeEVAL · Online reading only / 仅限在线阅读';font:20px sans-serif;padding:60px}}`;
document.head.append(style);
const notice=document.createElement('div');notice.className='bee-reading-notice';notice.setAttribute('role','status');notice.hidden=true;notice.textContent=en?'Online reading only. Printing and saving are unavailable.':'本报告仅限在线阅读，不提供打印或保存。';document.body.append(notice);
let timer;const inform=()=>{notice.hidden=false;clearTimeout(timer);timer=setTimeout(()=>notice.hidden=true,2600)};
document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&['s','p'].includes(event.key.toLowerCase())){event.preventDefault();event.stopImmediatePropagation();inform()}},true);
document.addEventListener('contextmenu',event=>{event.preventDefault();inform()});
document.addEventListener('dragstart',event=>{if(event.target.closest('img,a,svg'))event.preventDefault()});
document.querySelectorAll('[download]').forEach(el=>el.removeAttribute('download'));
window.print=inform;
const mark=document.createElement('div');mark.className='bee-reading-watermark';mark.setAttribute('aria-hidden','true');document.body.append(mark);
function watermark(name){mark.replaceChildren(...Array.from({length:9},()=>{const span=document.createElement('span');span.textContent=`BeeEVAL · ${name} · ${new Date().toISOString().slice(0,10)}`;return span}))}
watermark('Online reading');
fetch('/api/session',{credentials:'same-origin',cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json()}).then(({user})=>{if(!user){location.replace('/preview.html?path='+encodeURIComponent(location.pathname));return}watermark(user.username)}).catch(()=>{notice.hidden=false;notice.textContent=en?'Unable to verify your session. Please refresh.':'登录状态暂时无法验证，请刷新页面。'});

{const miniNav=document.createElement('script');miniNav.src='/mini-report-nav.js';miniNav.defer=true;document.head.append(miniNav);}
