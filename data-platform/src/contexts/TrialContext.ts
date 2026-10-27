import {createContext,useContext} from 'react';
export const TRIAL_DOMAIN = '出行域';
export const TRIAL_DOMAINS = ['车控域','出行域','车书域','娱乐域','闲聊域','创作域'];
export const isDomainTrial = (user: {role?:string;membership_tier?:string|null}|null) => user?.role !== 'admin' && user?.membership_tier === 'trial';
export const TrialContext = createContext({trial:false,guardDomain:(_domain:string):boolean=>true,upgrade:(_domain?:string)=>{}});
export const useTrialAccess = () => useContext(TrialContext);
