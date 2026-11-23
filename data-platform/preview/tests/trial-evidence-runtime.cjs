const assert=require('node:assert/strict'),path=require('node:path');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
(async()=>{
 const out=path.resolve('node_modules/.tmp/trial-evidence.cjs');
 await require('esbuild').build({stdin:{contents:`export {ResultDetailContent} from './src/components/ResultDetailModal';export {default as Video} from './src/components/VideoPlayerModal';`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'cjs',outfile:out,external:['react','react-dom','react-dom/server'],plugins:[{name:'fixture',setup(b){
 b.onLoad({filter:/AuthContext\.tsx$/},()=>({loader:'ts',contents:`export const useAuth=()=>({user:globalThis.__evidenceUser});`}));
 b.onLoad({filter:/useMetricsTranslation\.ts$/},()=>({loader:'ts',contents:`export const useMetricsTranslation=()=>({tm:x=>x,td:x=>x,tv:x=>x});`}));
 b.onLoad({filter:/TranslatedText\.tsx$/},()=>({loader:'tsx',contents:`export default ({text})=>text;`}));
 b.onLoad({filter:/\/config\.ts$/},()=>({loader:'ts',contents:`export const SERVER_URL='';export const getScreenshotUrl=()=>'';export const getVideoPosterUrl=()=>'';`}));
 b.onLoad({filter:/\/api\.ts$/},()=>({loader:'ts',contents:`export const preloadNasVideo=()=>{};export const signVideo=async()=>({url:'/stream'});`}));
 b.onResolve({filter:/^react-i18next$/},()=>({path:'i18n',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'ts',contents:`export const useTranslation=()=>({t:k=>k,i18n:{language:'zh'}});`}));
 }}]});
 const {ResultDetailContent,Video}=require(out);
 const detail=domain=>renderToStaticMarkup(React.createElement(ResultDetailContent,{result:{function_domain:domain,video_name:'trial.mp4',metadata:{path:'/trial.mp4'},evaluation_scores:[]},onPlayVideo:()=>{}}));
 const video=()=>renderToStaticMarkup(React.createElement(Video,{open:true,videoPath:'/travel.mp4',onClose:()=>{}}));
 global.__evidenceUser={role:'viewer',membership_tier:'trial'};
 assert.ok(!detail('出行域').includes('trial_locked_video'));
 assert.ok(detail('车控域').includes('trial_locked_video'));
 assert.ok(!video().includes('trial_locked_video'));
 global.__evidenceUser={role:'viewer',membership_tier:null};
 assert.ok(detail('出行域').includes('trial_locked_video'));
 assert.ok(video().includes('trial_locked_video'));
 global.__evidenceUser={role:'viewer',membership_tier:'plus'};
 assert.ok(!detail('车控域').includes('trial_locked_video'));
 assert.ok(!video().includes('trial_locked_video'));
 console.log('PASS actual detail and player: Trial travel allowed, other-domain detail locked, legacy and Plus permissions preserved');
})().catch(e=>{console.error(e);process.exit(1)});
