import assert from 'node:assert/strict';
import {capabilities,reportAccess} from '../server/permissions.mjs';
for(const membership_tier of ['free','base','plus','pro','trial','legacy']){
 const user={role:'viewer',membership_tier};
 assert.equal(capabilities(user).scenarios,false,`${membership_tier}: requires separate purchase`);
 assert.equal(capabilities({...user,report_entitlements:['scenarios']}).scenarios,true,`${membership_tier}: no membership gate`);
 assert.equal(reportAccess({...user,report_entitlements:['whitepaper']},'whitepaper',{whitepaper:{access:'admin'}}),false);
}
assert.equal(capabilities(null).scenarios,false);
assert.equal(capabilities({role:'admin'}).scenarios,true);
assert.equal(reportAccess({role:'admin'},'whitepaper',{whitepaper:{access:'admin'}}),true);
console.log('PASS: separate scene entitlement at every tier, default denial, admin access, whitepaper restriction');
