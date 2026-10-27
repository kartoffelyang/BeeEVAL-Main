import {useLocation, Link} from "react-router-dom";
import {useEffect, useState, type ReactNode} from 'react';
import {useAuth} from '../contexts/AuthContext';
import {useLanguage} from '../contexts/LanguageContext';
import {PlatformDrawer, PlatformAction} from './platform/PlatformUI';
import './trial-access.css';
import {TRIAL_DOMAIN, TRIAL_DOMAINS, isDomainTrial, isEvidenceView, TrialContext as Context, useTrialAccess} from "../contexts/TrialContext";
export function TrialAccessProvider({children}:{children:ReactNode}) {
 const {user}=useAuth();const {language}=useLanguage();const zh=language==='zh';const trial=isDomainTrial(user);
 const location=useLocation();const restricted=trial && isEvidenceView(location.pathname,location.search);
 const [locked,setLocked]=useState<string|null>(null),[contact,setContact]=useState(false);
 useEffect(()=>{const notify=()=>setLocked('');window.addEventListener('beeeval:upgrade-required',notify);return()=>window.removeEventListener('beeeval:upgrade-required',notify)},[]);
 const upgrade=(domain='')=>{setLocked(domain)};
 const guardEvidence=(domain:string)=>{if(!trial||domain===TRIAL_DOMAIN)return true;upgrade(domain);return false};
 const guardDomain=(domain:string)=>!restricted||guardEvidence(domain);
 return <Context.Provider value={{trial,restricted,guardDomain,guardEvidence,upgrade}}>{children}
 {trial && locked!==null && <PlatformDrawer centered title={zh?'解锁更多功能域的用例与视频':'Unlock more cases and videos'} eyebrow="BEEEVAL / FULL DATA ACCESS" onClose={()=>setLocked(null)} footer={<><PlatformAction secondary onClick={()=>setLocked(null)}>{zh?'继续试用出行域':'Continue travel trial'}</PlatformAction><PlatformAction onClick={()=>{setLocked(null);setContact(true)}}>{zh?'联系销售':'Contact sales'}</PlatformAction></>}>
 <p>{zh?`${locked&&locked!==TRIAL_DOMAIN?locked+'的题目和视频暂未开放。':''}车型得分、指标和排行榜全量开放；题目、具体用例和视频仅开放出行域，不限制车型与系统版本。`:'All aggregate scores, metrics and rankings are available. Questions, cases and videos are limited to the travel domain across all vehicles.'}</p><div className="trial-modal-summary">{zh?'升级 Plus 或 Pro，可查看全部功能域的题目、用例对比与视频证据。场景库需单独授权。':'Upgrade to Plus or Pro for questions, case comparisons and video evidence across all domains. The scenario library is licensed separately.'}</div></PlatformDrawer>}
 {contact && <PlatformDrawer centered title={zh?'联系 BeeEVAL':'Contact BeeEVAL'} onClose={()=>setContact(false)}><p>{zh?'欢迎与我们沟通车型、研究方向及团队使用需求。':'Tell us about your vehicle research and team requirements.'}</p><a className="trial-email" href="mailto:beeeval@xailab.cn">beeeval@xailab.cn ↗</a><img className="trial-qr" src="/assets/xai-lab-wechat.png" alt="XAI Lab 微信公众号"/><p>{zh?'关注 XAI Lab 微信公众号，与我们取得联系。':'Follow XAI Lab on WeChat to get in touch.'}</p></PlatformDrawer>}
 </Context.Provider>;
}
export function TrialNotice(){const {trial,restricted,upgrade,guardDomain}=useTrialAccess();const {language}=useLanguage();const zh=language==='zh';const [menu,setMenu]=useState(false);if(!trial)return null;return <section className="trial-notice" aria-label={zh?'试用权限说明':'Trial access'}><div><strong><span className="trial-badge">Trial · {zh?'试用会员':'Trial member'}</span>{zh?'汇总指标全量开放，用例与视频试用出行域':'Full aggregate access · Travel case trial'}</strong><p>{zh?'车型得分、指标、排行榜及汇总分析可查看所有功能域。题目、用例对比与视频仅开放出行域。':'View scores, metrics, rankings and summaries across every domain. Questions, case comparisons and videos are limited to travel.'}</p></div><div className="trial-domain-control">{restricted && <><button className="trial-domain-button" aria-expanded={menu} onClick={()=>setMenu(!menu)}>{zh?'出行域 · 试用开放':'Travel · Trial access'} ⌄</button>{menu&&<div className="trial-domain-menu">{TRIAL_DOMAINS.map((d,i)=><button key={d} onClick={()=>{setMenu(false);guardDomain(d)}}>{zh?d:['Vehicle control','Travel','Vehicle knowledge','Entertainment','Conversation','Creation'][i]}<small>{d===TRIAL_DOMAIN?'✓':zh?'升级解锁':'Upgrade'}</small></button>)}</div>}</>}{!restricted && <Link className="trial-upgrade" to="/benchmark?tab=compare">{zh?'进入用例对比 ↗':'Compare cases ↗'}</Link>}<button className="trial-upgrade" onClick={()=>upgrade()}>{zh?'了解完整数据权限 ↗':'Explore full access ↗'}</button></div></section>}
