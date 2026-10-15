const path=require('node:path'),assert=require('node:assert/strict');const {JSDOM}=require('jsdom');
const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/'});Object.assign(global,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,IS_REACT_ACT_ENVIRONMENT:true});Object.defineProperty(global,'navigator',{value:dom.window.navigator,configurable:true});
const React=require('react'),{act}=React,{createRoot}=require('react-dom/client'),{Simulate}=require('react-dom/test-utils');global.__queries=[];
(async()=>{
const out=path.join(process.cwd(),'node_modules/.tmp/video-model-picker.cjs');await require('esbuild').build({entryPoints:['src/pages/TestCases.tsx'],outfile:out,bundle:true,platform:'node',format:'cjs',external:['react','react-dom'],loader:{'.css':'empty'},define:{'import.meta.env.VITE_API_BASE_URL':'"/api"','import.meta.env.VITE_SERVER_URL':'""'},plugins:[{name:'isolate',setup(b){
b.onLoad({filter:/\/api\.ts$/},()=>({loader:'ts',contents:`export const getAllResults=p=>{globalThis.__queries.push(p);return Promise.resolve({data:[],total:0})};export const getFilterOptions=()=>Promise.resolve({brand_models:['A'],function_domains:[],case_ids:[]});export const getBatches=()=>Promise.resolve([]);export const deleteResult=()=>{};export const deleteResultsBatch=()=>{};export const translateText=()=>Promise.resolve({translated:''});`}));
b.onLoad({filter:/AuthContext\.tsx$/},()=>({loader:'ts',contents:'export const useAuth=()=>({user:{role:"admin"}})'}));
b.onLoad({filter:/useMetricsTranslation\.ts$/},()=>({loader:'ts',contents:'export const useMetricsTranslation=()=>({tv:v=>v,td:v=>v})'}));
b.onLoad({filter:/LanguageContext\.tsx$/},()=>({loader:'ts',contents:'export const useLanguage=()=>({language:"en"})'}));
b.onResolve({filter:/^react-i18next$/},()=>({path:'translation',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({loader:'ts',contents:'export const useTranslation=()=>({t:k=>k})'}));
b.onLoad({filter:/(TrialMoreHint|VideoPlayerModal|ResultDetailModal)\.tsx$/},()=>({loader:'ts',contents:'export default ()=>null'}));
}}]});
const TestCases=require(out).default,ui=createRoot(document.getElementById('root'));let picked;
await act(async()=>ui.render(React.createElement(TestCases,{embedded:true,lockedModel:'A',lockedVersion:'1',hideBatchFilter:true,modelVersionOptions:[{value:'A||1',label:'A · 1'},{value:'B||2',label:'B · 2'}],selectedModelVersion:'A||1',onModelVersionChange:v=>picked=v})));
const select=[...document.querySelectorAll('select')].find(s=>[...s.options].some(o=>o.value==='A||1'));assert.ok(select);assert.equal(select.disabled,false);assert.equal(select.value,'A||1');
assert.equal(global.__queries.at(-1).brand_model,'A');assert.equal(global.__queries.at(-1).system_version,'1');
await act(async()=>Simulate.change(select,{target:{value:'B||2'}}));assert.equal(picked,'B||2');await act(async()=>ui.unmount());
console.log('PASS: table-header model/version selector is enabled and calls the parent; API queries retain structured model/version values.');
})().catch(e=>{console.error(e);process.exit(1)});
