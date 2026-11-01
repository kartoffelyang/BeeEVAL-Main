import assert from 'node:assert/strict';
globalThis.document={querySelector:()=>null};globalThis.location={origin:'http://localhost:8790',search:'?return=%2Freports.html%23travel'};
globalThis.sessionStorage={getItem:()=>JSON.stringify({url:'/reports.html#research'})};
const {safeReturn,destination,validPassword}=await import('../site/identity-common.js');
for(const path of ['https://evil.example/path','//evil.example/path','javascript:alert(1)','/login.html?return=/login.html','https://www.beeeval.com/data'])assert.equal(safeReturn(path),null,path);
assert.equal(safeReturn('/account.html'),'/account.html');assert.equal(destination({}),'/reports.html#travel');
location.search='?return=%2Fdata%2Fbenchmark';assert.equal(destination({capabilities:{benchmark:false}}),'/preview.html?product=platform');assert.equal(destination({capabilities:{benchmark:true}}),'/data/benchmark');
assert.equal(validPassword('short'),false);assert.equal(validPassword('LocalTest2026'),true);
console.log('PASS safe origin return, original hash preservation, account-center return and permission-aware product entry');
