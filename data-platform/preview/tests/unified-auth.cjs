const assert=require('node:assert/strict'),path=require('node:path');
(async()=>{
 const out=path.join(process.cwd(),'node_modules/.tmp/unified-auth.cjs');
 await require('esbuild').build({stdin:{contents:"export * from './local-server/session-auth';export * from './src/utils/unifiedAuth'",resolveDir:process.cwd(),loader:'ts'},outfile:out,bundle:true,platform:'node',format:'cjs',define:{'import.meta.env.BASE_URL':'"/light/"'}});
 const {requestAuthorization,usesUnifiedSession,unifiedLoginUrl}=require(out);
 assert.equal(requestAuthorization({headers:{cookie:'beeeval_session=mock-only-cookie'}}),'Bearer mock-only-cookie');
 assert.equal(requestAuthorization({headers:{cookie:'beeeval_session=mock-only-cookie; beeeval_signed_out=1'}}),undefined);
 assert.equal(requestAuthorization({headers:{authorization:'Bearer mock-only-legacy'}}),'Bearer mock-only-legacy');
 assert.equal(requestAuthorization({headers:{authorization:'Bearer stale',cookie:'beeeval_session=mock-only-cookie'}}),'Bearer mock-only-cookie');
 assert.equal(requestAuthorization({headers:{}}),undefined);
 for(const host of ['www.beeeval.com','open.beeeval.com','beeeval.com'])assert.equal(usesUnifiedSession(host),true);
 for(const host of ['127.0.0.1','localhost','fakebeeeval.com','beeeval.com.evil.invalid'])assert.equal(usesUnifiedSession(host),false);
 const target=new URL(unifiedLoginUrl('/benchmark?tab=baseline'));assert.equal(target.origin,'https://www.beeeval.com');assert.equal(target.searchParams.get('return'),'https://www.beeeval.com/light/benchmark?tab=baseline');
 assert.equal(new URL(unifiedLoginUrl('//evil.invalid')).searchParams.get('return'),'https://www.beeeval.com/light/');
 console.log('PASS: original shared cookies, explicit sign-out, legacy token compatibility, trusted hosts and scoped login return URLs.');
})().catch(e=>{console.error(e);process.exit(1)});
