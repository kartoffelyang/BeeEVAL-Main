import {mountAccountMenu} from '/account-menu.js';
const menu=document.querySelector('.menu'),nav=document.querySelector('.header nav');menu?.addEventListener('click',()=>{const open=nav.classList.toggle('open');menu.setAttribute('aria-expanded',String(open))});nav?.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{nav.classList.remove('open');menu?.setAttribute('aria-expanded','false')}));
fetch('/api/session',{credentials:'same-origin'}).then(r=>r.ok?r.json():{}).then(({user})=>{mountAccountMenu(user)}).catch(()=>{});

document.querySelectorAll('[data-contact]').forEach(button=>button.addEventListener('click',()=>window.dispatchEvent(new CustomEvent('beeeval:contact',{detail:{subject:document.documentElement.lang==='en'?(button.dataset.contactEn||button.textContent.trim()):button.dataset.contact}}))));
function contactLabels(){const lang=document.documentElement.lang==='en'?'en':'zh';document.querySelectorAll('[data-contact-placeholder-zh],[data-contact-aria-label-zh]').forEach(el=>{for(const attr of ['placeholder','aria-label']){const value=el.getAttribute('data-contact-'+attr+'-'+lang);if(value)el.setAttribute(attr,value)}})}
new MutationObserver(contactLabels).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});contactLabels();
