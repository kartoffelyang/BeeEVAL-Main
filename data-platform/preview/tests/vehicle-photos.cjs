const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const models=['Freelander','吉利银河M9','大众ID.ERA 9X','大众与众08','小米Yu7','小米澎程N90','小鹏GX','极氪9X','理想L9 Livis','理想i8','萤火虫','蔚来ET5','长安启源Q06','问界M9','魏牌二代蓝山','红旗EH7','魏牌 V9X'];
for(const name of models){const bytes=fs.readFileSync(path.join('public/vehicles',name+'.webp'));assert.equal(bytes.subarray(8,12).toString(),'WEBP',name);assert.ok(bytes.length>1000,name)}
const source=fs.readFileSync('src/pages/Benchmark.tsx','utf8');assert.match(source,/\["webp", "png", "jpg", "jpeg"\]/);
console.log('PASS: all 17 current model names resolve to valid local WebP photos before legacy fallbacks');
