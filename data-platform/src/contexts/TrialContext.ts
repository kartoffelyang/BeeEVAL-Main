import {createContext,useContext} from 'react';
export const TRIAL_DOMAIN = '出行域';
export const TRIAL_DOMAINS = ['车控域','出行域','车书域','娱乐域','闲聊域','创作域'];
export const isDomainTrial = (user: {role?:string;membership_tier?:string|null}|null) => user?.role !== 'admin' && user?.membership_tier === 'trial';
export function isEvidenceView(pathname:string, search='') {
 const params=new URLSearchParams(search);
 return pathname==='/' || pathname==='/evidence' || (pathname==='/benchmark' && (['compare','videos'].includes(params.get('tab')||'') || params.get('view')==='videos'));
}
export const TrialContext = createContext({trial:false,restricted:false,guardEvidence:(_domain:string):boolean=>true,guardDomain:(_domain:string):boolean=>true,upgrade:(_domain?:string)=>{}});
export const useTrialAccess = () => useContext(TrialContext);
