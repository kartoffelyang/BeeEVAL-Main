import {useEffect, useState, type ReactNode} from 'react';
import {useAuth} from '../contexts/AuthContext';
import {useLanguage} from '../contexts/LanguageContext';
import {PlatformDrawer, PlatformAction} from './platform/PlatformUI';
import './trial-access.css';
import {TRIAL_DOMAIN, TRIAL_DOMAINS, isDomainTrial, TrialContext as Context, useTrialAccess} from "../contexts/TrialContext";
export function TrialAccessProvider({children}:{children:ReactNode}) {
 const {user}=useAuth();const {language}=useLanguage();const zh=language==='zh';const trial=isDomainTrial(user);
 const [locked,setLocked]=useState<string|null>(null),[contact,setContact]=useState(false);
 useEffect(()=>{const notify=()=>setLocked('');window.addEventListener('beeeval:upgrade-required',notify);return()=>window.removeEventListener('beeeval:upgrade-required',notify)},[]);
 const upgrade=(domain='')=>{setLocked(domain)};
 const guardDomain=(domain:string)=>{if(!trial||domain===TRIAL_DOMAIN)return true;upgrade(domain);return false};
 return <Context.Provider value={{trial,guardDomain,upgrade}}>{children}
 {trial && locked!==null && <PlatformDrawer centered title={zh?'解锁更多功能域的评测数据':'Unlock more evaluation domains'} eyebrow="BEEEVAL / FULL DATA ACCESS" onClose={()=>setLocked(null)} footer={<><PlatformAction secondary onClick={()=>setLocked(null)}>{zh?'继续试用出行域':'Continue travel trial'}</PlatformAction><PlatformAction onClick={()=>{setLocked(null);setContact(true)}}>{zh?'联系销售':'Contact sales'}</PlatformAction></>}>
 <p>{zh?`${locked&&locked!==TRIAL_DOMAIN?locked+'暂未包含在试用中。':''}当前试用仅开放出行域，不限制车型和系统版本。`:'Your trial includes the travel domain across all models and software versions.'}</p><div className="trial-modal-summary">{zh?'升级 Plus 或 Pro，可查询全部功能域的评测数据、视频证据与车型对标。场景库需单独授权。':'Upgrade to Plus or Pro for all evaluation domains, video evidence and vehicle comparisons. The scenario library is licensed separately.'}</div></PlatformDrawer>}
 {contact && <PlatformDrawer centered title={zh?'联系 BeeEVAL':'Contact BeeEVAL'} onClose={()=>setContact(false)}><p>{zh?'欢迎与我们沟通车型、研究方向及团队使用需求。':'Tell us about your vehicle research and team requirements.'}</p><a className="trial-email" href="mailto:beeeval@xailab.cn">beeeval@xailab.cn ↗</a><img className="trial-qr" src="/assets/xai-lab-wechat.png" alt="XAI Lab 微信公众号"/><p>{zh?'关注 XAI Lab 微信公众号，与我们取得联系。':'Follow XAI Lab on WeChat to get in touch.'}</p></PlatformDrawer>}
 </Context.Provider>;
}
export function TrialNotice(){const {trial,upgrade,guardDomain}=useTrialAccess();const {language}=useLanguage();const zh=language==='zh';const [menu,setMenu]=useState(false);if(!trial)return null;return <section className="trial-notice" aria-label={zh?'试用权限说明':'Trial access'}><div><strong><span className="trial-badge">Trial · {zh?'试用会员':'Trial member'}</span>{zh?'出行域已开放，全部车型与版本可选':'Travel domain · All models and versions'}</strong><p>{zh?'体验出行域的用例查询、车型对标与测试证据。更多功能域需升级会员。':'Explore travel cases, vehicle comparisons and test evidence. Upgrade for other domains.'}</p></div><div className="trial-domain-control"><button className="trial-domain-button" aria-expanded={menu} onClick={()=>setMenu(!menu)}>{zh?'出行域 · 试用开放':'Travel · Trial access'} ⌄</button>{menu&&<div className="trial-domain-menu">{TRIAL_DOMAINS.map((d,i)=><button key={d} onClick={()=>{setMenu(false);guardDomain(d)}}>{zh?d:['Vehicle control','Travel','Vehicle knowledge','Entertainment','Conversation','Creation'][i]}<small>{d===TRIAL_DOMAIN?'✓':zh?'升级解锁':'Upgrade'}</small></button>)}</div>}<button className="trial-upgrade" onClick={()=>upgrade()}>{zh?'了解完整数据权限 ↗':'Explore full access ↗'}</button></div></section>}
