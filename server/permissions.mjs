import {readFileSync} from 'node:fs';
export function membership(user){if(!user)return 'visitor';if(user.role==='admin')return 'admin';return ['free','base','plus','pro','trial'].includes(user.membership_tier)?user.membership_tier:'legacy'}
export function capabilities(user){const level=membership(user),admin=level==='admin';return {level,reports:admin||['base','plus','pro'].includes(level),freeReports:!!user,scenarios:admin||['base','plus','pro'].includes(level)||level==='legacy',benchmark:admin||['plus','pro','trial','legacy'].includes(level)}}
export function reportAccess(user,id,catalog){return !!user&&!!catalog[id]&&(capabilities(user).reports||catalog[id].access==='free'||user.report_entitlements?.includes(id))}
export function loadCatalog(){try{return JSON.parse(readFileSync(new URL('../dist/assets/report-previews.json',import.meta.url)))}catch{return JSON.parse(readFileSync(new URL('../site/assets/report-previews.json',import.meta.url)))}}
