const dictionary = await fetch('/languages.json', {cache:'no-store'}).then(r=>r.json()).catch(()=>({}));
let language = localStorage.getItem('beeeval-site-language') === 'en' ? 'en' : 'zh';
const originals=new WeakMap(), rendered=new WeakMap(), attributes=new WeakMap();
const ignored='script,style,.language-switch,textarea,[data-zh][data-en]';
function translate(text){
 const key=text.trim();let result=dictionary[key];
 if(result===undefined&&/[↗→←↓↑]$/.test(key)){const label=key.replace(/\s*[↗→←↓↑]$/,'');if(dictionary[label])result=dictionary[label]+' '+key.slice(-1)}
 if(result===undefined&&/^有效期：/.test(key))result='Expires: '+(dictionary[key.slice(4)]||key.slice(4));
 if(result===undefined&&/^(Free|Base|Plus|Pro|Trial) 会员$/.test(key))result=key.replace(' 会员',' member');
 if(result===undefined&&/^\d+ 秒后重发$/.test(key))result='Resend in '+key.match(/^\d+/)[0]+'s';
 if(result===undefined){if(/^全部报告\s*\d+$/.test(key))result='All reports '+key.match(/\d+$/)[0];else if(/ · 会员中心$/.test(key))result=key.replace(' · 会员中心',' · My account');else if(/ · 示例$/.test(key))result=(dictionary[key.replace(' · 示例','')]||key.replace(' · 示例',''))+' · Example';else if(/^0[123]　/.test(key))result=key.slice(0,3)+(dictionary[key.slice(3)]||key.slice(3));}
 return result===undefined?text:text.replace(key,result);
}
function apply(){
 observer.disconnect();
 const locale=language==='en'?'en':'zh-CN';if(document.documentElement.lang!==locale)document.documentElement.lang=locale;
 document.querySelectorAll('[data-zh][data-en]').forEach(el=>{const next=el.dataset[language];if(el.textContent!==next)el.textContent=next});
 const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let node;
 while(node=walker.nextNode()){
  if(node.parentElement.closest(ignored))continue;
  const current=node.nodeValue;if(!originals.has(node)||current!==rendered.get(node))originals.set(node,current);
  const next=language==='en'?translate(originals.get(node)):originals.get(node);if(current!==next)node.nodeValue=next;rendered.set(node,next);
 }
 document.querySelectorAll('[placeholder],[aria-label],[title],[alt]').forEach(el=>{
  if(el.closest('.language-switch'))return;const saved=attributes.get(el)||{};
  for(const name of ['placeholder','aria-label','title','alt']){if(!el.hasAttribute(name))continue;const value=el.getAttribute(name);if(!saved[name]||value!==saved[name].rendered)saved[name]={original:value};const explicit=el.getAttribute(`data-contact-${name}-${language}`);const next=explicit??(language==='en'?translate(saved[name].original):saved[name].original);if(value!==next)el.setAttribute(name,next);saved[name].rendered=next}attributes.set(el,saved);
 });
 document.querySelectorAll('[data-language]').forEach(b=>{b.setAttribute('aria-checked',String(b.dataset.language===language));b.setAttribute('aria-pressed',String(b.dataset.language===language));b.tabIndex=-1});
 document.querySelectorAll('.language-current').forEach(el=>el.textContent=language==='en'?'English':'中文');
 document.querySelectorAll('.language-trigger').forEach(el=>el.setAttribute('aria-label',language==='en'?'Change language':'切换语言'));
 document.querySelectorAll('.header .member-entry').forEach(el=>el.textContent=language==='en'?'Log in':'登录');
 const titles={'/':'BeeEVAL | Evidence for better automotive AI','/index.html':'BeeEVAL | Evidence for better automotive AI','/reports.html':'Research & insights | BeeEVAL','/membership.html':'Plans & services | BeeEVAL','/login.html':'Your BeeEVAL account','/account.html':'My account | BeeEVAL'};
 if(!attributes.has(document))attributes.set(document,{title:document.title});
 const chineseTitles={'/membership.html':'会员与服务 · BeeEVAL','/login.html':'登录与注册 · BeeEVAL','/account.html':'会员中心 · BeeEVAL','/reports.html':'洞察报告 · BeeEVAL'};
 if(titles[location.pathname])document.title=language==='en'?titles[location.pathname]:(chineseTitles[location.pathname]||attributes.get(document).title);
 observer.observe(document.body,{childList:true,subtree:true,characterData:true});
}
let pending=false;const observer=new MutationObserver(()=>{if(pending)return;pending=true;queueMicrotask(()=>{pending=false;apply()})});
function setLanguage(value){if(!['zh','en'].includes(value))return;language=value;localStorage.setItem('beeeval-site-language',value);localStorage.setItem('beescene-language',value);apply();window.dispatchEvent(new Event('beeeval:language-change'))}
function mountLanguageMenu(container,index){
 container.removeAttribute('role');container.setAttribute('aria-label','Language');
 const panelId='site-language-options-'+index;
 container.innerHTML=`<button class="language-trigger" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="${panelId}"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z"/></svg><span class="language-current"></span><svg class="language-chevron" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="m3 4.5 3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></button><div class="language-options" role="menu" id="${panelId}" hidden><button type="button" role="menuitemradio" data-language="zh" lang="zh-CN">中文<span class="language-check" aria-hidden="true">✓</span></button><button type="button" role="menuitemradio" data-language="en" lang="en">English<span class="language-check" aria-hidden="true">✓</span></button></div>`;
 const trigger=container.querySelector('.language-trigger'),panel=container.querySelector('.language-options'),choices=[...panel.querySelectorAll('button')];
 const close=(focus=false)=>{panel.hidden=true;trigger.setAttribute('aria-expanded','false');if(focus)trigger.focus()};
 function open(){document.querySelectorAll('.language-trigger[aria-expanded="true"]').forEach(b=>b.click());panel.hidden=false;trigger.setAttribute('aria-expanded','true');choices.find(b=>b.dataset.language===language).focus()}
 trigger.addEventListener('click',()=>panel.hidden?open():close());
 trigger.addEventListener('keydown',e=>{if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();open()}});
 choices.forEach(b=>b.addEventListener('click',()=>{setLanguage(b.dataset.language);close(true)}));
 container.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close(true)}else if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)&&!panel.hidden){e.preventDefault();const i=choices.indexOf(document.activeElement);choices[e.key==='Home'?0:e.key==='End'?choices.length-1:(i+(e.key==='ArrowDown'?1:-1)+choices.length)%choices.length].focus()}});
 document.addEventListener('click',e=>{if(!container.contains(e.target))close()});
 container.addEventListener('focusout',e=>{if(!container.contains(e.relatedTarget))close()});
}
document.querySelectorAll('.language-switch').forEach(mountLanguageMenu);
window.addEventListener('storage',e=>{if(e.key==='beeeval-site-language'&&['en','zh'].includes(e.newValue)){language=e.newValue;apply();window.dispatchEvent(new Event('beeeval:language-change'))}});
apply();document.documentElement.dataset.languageReady='true';
