const assert = require('node:assert/strict'), path = require('node:path'), fs = require('node:fs');
const {JSDOM} = require('jsdom');
const dom = new JSDOM('<div id="root"></div>', {url:'http://localhost/data/benchmark'});
Object.assign(global, {window:dom.window, document:dom.window.document, HTMLElement:dom.window.HTMLElement,
  Element:dom.window.Element, Event:dom.window.Event, sessionStorage:dom.window.sessionStorage,
  localStorage:dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT:true});
Object.defineProperty(global,'navigator',{value:dom.window.navigator,configurable:true});
const React=require('react'), {act}=React, {createRoot}=require('react-dom/client'), {MemoryRouter}=require('react-router-dom');
const vehicles=[{brand_model:'车型甲',system_version:'1',has_cache:true,video_count:10,overall_score:4},
  {brand_model:'车型乙',system_version:'2',has_cache:true,video_count:8,overall_score:3}];
const ctx={vehicles,primaryKey:null,competitorKeys:[],snapshots:{},setVehicles:()=>{},setPrimaryKey:()=>{},
  fetchSnapshot:async()=>{},getVehicleLabel:k=>k,getColor:()=>'',allSelectedKeys:()=>[]};
global.__benchmarkContext=ctx;
const apiNames=[...fs.readFileSync('src/api.ts','utf8').matchAll(/export\s+(?:const|(?:async\s+)?function)\s+(\w+)/g)].map(m=>m[1]);
const calls=[]; let pendingList, pendingDetail;
global.__benchmarkAPI=(name,...args)=>{
  calls.push({name,args});
  if(name==='listVehiclesForAggregation')return new Promise((_,reject)=>pendingList=reject);
  if(name==='getAllVehicleScores')return Promise.resolve(vehicles.map(v=>({...v,function_domain_scores:[{dimension_key:'出行域',avg_score:v.overall_score}]})));
  if(name==='getVehicleAcceptanceCompletion')return Promise.resolve({by_domain:[]});
  if(name==='getFilterOptions')return Promise.resolve({brand_models:[],function_domains:[]});
  if(name==='getAllResults'){
    if(args[0].result_id)return new Promise(resolve=>pendingDetail=resolve);
    assert.equal(args[0].index_only,true);
    return Promise.resolve({data:[{id:'case-1',case_id:'1001',video_name:'test.mp4',brand_model:'车型甲',
      _index_only:true,function_domain:'出行域',created_at:'2026-01-01T00:00:00Z',metadata:{path:'/travel.mp4',response_quality_score:4}}],total:1});
  }
  return Promise.resolve({});
};
async function bundle(file,name){
  const outfile=path.resolve('node_modules/.tmp/'+name+'.cjs');
  await require('esbuild').build({entryPoints:[file],outfile,bundle:true,platform:'node',format:'cjs',external:['react','react-dom','react-router-dom'],
    loader:{'.css':'empty'},define:{'import.meta.env':JSON.stringify({BASE_URL:'/data/'})},plugins:[{name:'benchmark-fixture',setup(b){
      b.onLoad({filter:/\/api\.ts$/},()=>({loader:'ts',contents:apiNames.map(n=>`export const ${n}=(...a)=>globalThis.__benchmarkAPI('${n}',...a);`).join('\n')}));
      b.onLoad({filter:/ComparisonContext\.tsx$/},()=>({loader:'ts',contents:`export const useComparison=()=>globalThis.__benchmarkContext;export const vehicleKey=v=>v.brand_model+'||'+(v.system_version||'');export const parseVehicleKey=k=>({brand_model:k.split('||')[0],system_version:k.split('||')[1]});`}));
      b.onLoad({filter:/AuthContext\.tsx$/},()=>({loader:'ts',contents:`export const useAuth=()=>({user:{id:1,role:'admin',membership_tier:'pro'}});`}));
      b.onLoad({filter:/LanguageContext\.tsx$/},()=>({loader:'ts',contents:`export const useLanguage=()=>({language:'zh'});`}));
      b.onLoad({filter:/useMetricsTranslation\.ts$/},()=>({loader:'ts',contents:`export const useMetricsTranslation=()=>({tm:x=>x,td:x=>x,tv:x=>x,tt:x=>x});`}));
      b.onLoad({filter:/ResultDetailModal\.tsx$/},()=>({loader:'tsx',contents:`import React from 'react';export const ResultDetailContent=({result})=><div data-testid="full-evidence">{result.metadata.marker}</div>;export default ResultDetailContent;`}));
      b.onLoad({filter:/VideoPlayerModal\.tsx$/},()=>({loader:'tsx',contents:`export default ()=>null;`}));
      b.onLoad({filter:/TranslatedText\.tsx$/},()=>({loader:'tsx',contents:`export default ({text})=>text;`}));
      b.onLoad({filter:/\/config\.ts$/},()=>({loader:'ts',contents:`export const SERVER_URL='';export const getVideoPosterUrl=()=>'';export const getScreenshotUrl=()=>'';export const getVideoStreamUrl=()=>'';export const getNasStreamUrl=()=>'';`}));
      b.onResolve({filter:/^react-i18next$/},()=>({path:'i18n',namespace:'fixture'}));
      b.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'ts',contents:`export const useTranslation=()=>({t:k=>k,i18n:{language:'zh'}});`}));
    }}]});
  return require(outfile).default;
}
async function mount(Component,props={}){
  document.getElementById('root').innerHTML='';const app=createRoot(document.getElementById('root'));
  await act(async()=>app.render(React.createElement(MemoryRouter,null,React.createElement(Component,props))));
  return app;
}
(async()=>{
  let app=await mount(await bundle('src/pages/Benchmark.tsx','benchmark-loading'));
  assert.equal(document.querySelectorAll('.bm-row').length,2,'Existing cards must survive background refresh');
  await act(async()=>pendingList(new Error('temporary')));
  assert.equal(document.querySelectorAll('.bm-row').length,2,'A refresh failure must preserve known cards');
  await act(async()=>app.unmount());
  calls.length=0;
  app=await mount(await bundle('src/pages/vehicle-scores/RankingTab.tsx','ranking-loading'));
  assert.equal(calls.filter(c=>c.name==='getAllVehicleScores').length,1);
  assert.equal(calls.filter(c=>c.name==='getVehicleAcceptanceCompletion').length,0,'Metric ranking must not wait for acceptance requests');
  assert.ok(document.querySelector('.ranking-workspace'));
  const acceptance=[...document.querySelectorAll('button')].find(b=>b.textContent==='ranking_acceptance_title');
  await act(async()=>acceptance.click());
  assert.equal(calls.filter(c=>c.name==='getVehicleAcceptanceCompletion').length,2);
  assert.ok(document.querySelector('.ranking-workspace'),'Acceptance ranking must finish loading');
  await act(async()=>app.unmount());
  calls.length=0;
  app=await mount(await bundle('src/pages/TestCases.tsx','video-list-loading'),{embedded:true,hideBatchFilter:true});
  assert.equal(calls.filter(c=>c.name==='getAllResults').length,1);
  const card=document.querySelector('.group.cursor-pointer');assert.ok(card);
  await act(async()=>card.click());
  assert.equal(calls.filter(c=>c.name==='getAllResults').at(-1).args[0].result_id,'case-1');
  assert.equal(document.querySelector('[data-testid="full-evidence"]'),null);
  await act(async()=>pendingDetail({data:[{id:'case-1',metadata:{marker:'full-only-on-click'}}],total:1}));
  assert.equal(document.querySelector('[data-testid="full-evidence"]').textContent,'full-only-on-click');
  await act(async()=>app.unmount());
  console.log('PASS: cached vehicle cards survive refresh/errors, metric ranking uses one summary without loading acceptance, acceptance is on-demand, video list is lightweight and full evidence loads only on click');
})().catch(e=>{console.error(e);process.exit(1)});
