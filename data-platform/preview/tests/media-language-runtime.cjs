const assert=require('node:assert/strict'),path=require('node:path');
const {JSDOM}=require('jsdom');
const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/data/benchmark'});
Object.assign(global,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,
  HTMLMediaElement:dom.window.HTMLMediaElement,Event:dom.window.Event,IS_REACT_ACT_ENVIRONMENT:true});
const React=require('react'),{act}=React,{createRoot}=require('react-dom/client');
let plays=0,pauses=0,translations=[],signs=0,now=Date.now(),timerId=0;
const timers=new Map(),systemNow=Date.now;
Date.now=()=>now;
window.setInterval=(fn,delay)=>{const id=++timerId;timers.set(id,{fn,delay});return id};
window.clearInterval=id=>timers.delete(id);
HTMLMediaElement.prototype.play=function(){plays++;this._paused=false;this.dispatchEvent(new Event('play'));return Promise.resolve()};
HTMLMediaElement.prototype.pause=function(){if(!this._paused){pauses++;this._paused=true;this.dispatchEvent(new Event('pause'))}};
Object.defineProperty(HTMLMediaElement.prototype,'paused',{get(){return this._paused!==false}});
global.__lang='en';
global.__mediaApi={signVideo:async()=>({url:'/signed-video?attempt='+(++signs),quality:'proxy',proxy_ready:true}),
  getMetricsMap:async()=>({}),getDomainsMap:async()=>({}),getTaskDetailMap:async()=>({}),getBrandMap:async()=>({}),
  translateText:text=>new Promise(resolve=>translations.push({text,resolve}))};
(async()=>{
 const output=path.resolve('node_modules/.tmp/media-language.cjs');
 await require('esbuild').build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import React from 'react';import {useMetricsTranslation} from './src/hooks/useMetricsTranslation';
 import {formatMetricValue} from './src/utils/formatMetricValue';
 export {default as Video} from './src/components/VideoPlayerModal';
 export {default as Content} from './src/components/TranslatedText';
 export {videoBuffer} from './src/hooks/useBufferedPlayback';
 export {default as en} from './src/locales/en';
 export const Labels=()=>{const {tm,tv,td}=useMetricsTranslation();return <div>{tv('小鹏GX')} / {tv('小米澎程N90')} / {tv('魏牌二代蓝山')} / {tv('大众与众08')} / {tv('红旗EH7')} / {tv('领克900')} / {tm('C2-知识推理')} / {tm('A1-执行质量')} / {td('出行域')} / {formatMetricValue('speed',24.6,'en')}</div>};`},
  outfile:output,bundle:true,platform:'node',format:'cjs',external:['react','react-dom','react-dom/client'],plugins:[{name:'fixtures',setup(b){
   b.onLoad({filter:/\/api\.ts$/},()=>({loader:'ts',contents:Object.keys(global.__mediaApi).map(k=>`export const ${k}=(...a)=>globalThis.__mediaApi.${k}(...a);`).join('\n')}));
   b.onLoad({filter:/AuthContext\.tsx$/},()=>({loader:'ts',contents:`export const useAuth=()=>({user:{role:'viewer',membership_tier:'trial'}});`}));
   b.onLoad({filter:/LanguageContext\.tsx$/},()=>({loader:'ts',contents:`export const useLanguage=()=>({language:globalThis.__lang,t:globalThis.__mediaT});`}));
   b.onLoad({filter:/\/config\.ts$/},()=>({loader:'ts',contents:`export const SERVER_URL='';`}));
   b.onResolve({filter:/^react-i18next$/},()=>({path:'i18n',namespace:'fixture'}));
   b.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'ts',contents:`export const useTranslation=()=>({t:globalThis.__mediaT,i18n:{language:globalThis.__lang}});`}));
  }}]});
 const {Video,Labels,Content,videoBuffer,en}=require(output);
 global.__mediaT=(key,args={})=>String(en[key]||key).replace(/{{(\w+)}}/g,(_,k)=>args[k]??'');
 const root=createRoot(document.getElementById('root'));
 const render=async element=>act(async()=>root.render(element));
 const source='/volume1/private/testing/1001-理想i8-基础能力.mp4';
 await render(React.createElement(Video,{open:true,videoPath:source,onClose:()=>{}}));
 let video=document.querySelector('video');assert.ok(video);
 let ahead=0,position=0,ready=0;
 Object.defineProperties(video,{duration:{get:()=>60},currentTime:{get:()=>position,set:v=>position=v},readyState:{get:()=>ready},
  buffered:{get:()=>({length:1,start:()=>0,end:()=>position+ahead})}});
 const fire=event=>act(async()=>video.dispatchEvent(new Event(event)));
 await fire('canplay');await fire('loadeddata');
 assert.equal(plays,0,'Opening or canplay must never autoplay');
 assert.equal(video.autoplay,false);
 assert.ok(!document.body.textContent.includes('/volume1'));
 assert.ok(!/[一-鿿]/.test(document.body.textContent));
 assert.ok([...document.querySelectorAll('[title]')].every(n=>!n.title.includes('/volume1')));
 const playButton=()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Play video');
 await act(async()=>playButton().click());
 assert.equal(video.paused,false,'Zero-buffer startup must not pause the native fetch request');
 await fire('waiting');assert.equal(video.paused,false,'Initial waiting must keep the media fetch active');
 ready=3;ahead=9;await fire('progress');await fire('playing');assert.equal(plays,1);
 await act(async()=>video.pause());
 await fire('canplay');await fire('progress');assert.equal(plays,1,'Manual pause must survive canplay/progress');
 await act(async()=>playButton().click());
 await fire('playing');ahead=0;ready=2;await fire('waiting');assert.ok(video.paused);
 const before=plays;ahead=1;await fire('progress');assert.equal(plays,before);
 ahead=6;await fire('progress');assert.equal(plays,before+1,'Stall recovery uses a larger buffer');
 await fire('playing');ahead=0;await fire('waiting');const held=plays;
 now+=4500;await fire('progress');assert.equal(plays,held+1,'A stalled paused preload must release its hold after four seconds');
 const disjoint={buffered:{length:2,start:i=>i?30:0,end:i=>i?55:5},currentTime:10,duration:60,playbackRate:1,readyState:3};
 assert.equal(videoBuffer(disjoint,6).ready,false,'A distant downloaded range cannot satisfy current playback');
 await render(React.createElement(Video,{open:false,videoPath:source,onClose:()=>{}}));
 assert.equal(document.querySelector('video'),null);assert.ok(video.paused);
 // A zero-byte request can hang without emitting error: retry one fresh URL,
 // preserve requested playback, then expose a manual retry instead of spinning.
 await render(React.createElement(Video,{open:true,videoPath:'/volume1/hanging/3128.mp4',onClose:()=>{}}));
 video=document.querySelector('video');ahead=0;position=0;ready=0;
 Object.defineProperties(video,{duration:{get:()=>60},currentTime:{get:()=>position},readyState:{get:()=>ready},buffered:{get:()=>({length:0})}});
 await act(async()=>playButton().click());const baseline=signs;
 const tick=async ms=>{now+=ms;await act(async()=>{for(const [id,timer] of [...timers])if(timers.has(id))timer.fn()})};
 await tick(6000);await fire('progress');await tick(6000);
 assert.equal(signs,baseline,'Real byte progress before metadata must not restart the download');
 await tick(6001);assert.equal(signs,baseline+1,'No media progress must re-sign once');
 assert.equal(video.paused,false,'Retry must resume only the playback already requested by the user');
 await tick(12001);assert.match(document.body.textContent,/connection stalled/);
 const reload=[...document.querySelectorAll('button')].find(b=>b.textContent==='Reload video');assert.ok(reload);
 await tick(12001);assert.equal(signs,baseline+1,'Automatic retry must be bounded');
 await act(async()=>reload.click());assert.equal(signs,baseline+2);
 await render(React.createElement(Video,{open:false,videoPath:source,onClose:()=>{}}));
 await render(React.createElement(Labels));
 assert.ok(!/[一-鿿]/.test(document.body.textContent));assert.match(document.body.textContent,/XPENG GX/);assert.match(document.body.textContent,/HONGQI EH7/);assert.match(document.body.textContent,/Lynk & Co 900/);assert.match(document.body.textContent,/Xiaomi N90/);assert.match(document.body.textContent,/24.6 chars\/s/);
 await render(React.createElement(Content,{text:'全部窗户开一半'}));
 assert.ok(!/[一-鿿]/.test(document.body.textContent));
 await render(React.createElement(Content,{text:'请导航到上海南站'}));
 await act(async()=>translations.find(t=>t.text==='全部窗户开一半').resolve({translated:'Open all windows halfway.'}));
 assert.ok(!document.body.textContent.includes('halfway'),'Late translation cannot overwrite a new case');
 await act(async()=>translations.find(t=>t.text==='请导航到上海南站').resolve({translated:'Navigate to Shanghai South Railway Station.'}));
 assert.match(document.body.textContent,/Shanghai South/);
 await act(async()=>root.unmount());
 Date.now=systemNow;
 console.log('PASS: no autoplay or visible NAS path; zero-buffer startup never paused; bounded stall hold; one fresh-URL retry, explicit retry after timeout; manual pause/close; English labels and translation races');
})().catch(e=>{console.error(e);process.exit(1)});
