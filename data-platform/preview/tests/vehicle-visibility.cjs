const assert = require('node:assert/strict');
const esbuild = require('esbuild');
(async () => {
  await esbuild.build({entryPoints:['src/utils/vehicleVisibility.ts'],bundle:true,platform:'node',format:'cjs',outfile:'node_modules/.tmp/vehicle-visibility.cjs'});
  await esbuild.build({entryPoints:['local-server/case-search.ts'],bundle:true,platform:'node',format:'cjs',outfile:'node_modules/.tmp/visibility-search.cjs'});
  const {isHiddenVehicle, visibleVehicleData} = require('../../node_modules/.tmp/vehicle-visibility.cjs');
  const {queryCases} = require('../../node_modules/.tmp/visibility-search.cjs');
  for (const model of ['大众ID.ERA 9X','Volkswagen ID.ERA 9X','VW ID.4']) assert.equal(isHiddenVehicle(model),false);
  const rows = [{id:'vw',case_id:'1',brand_model:'大众ID.ERA 9X'},{id:'li',case_id:'2',brand_model:'理想i8'}];
  const original = JSON.stringify(rows);
  assert.deepEqual(visibleVehicleData(rows).map(x=>x.id),['vw','li']);
  assert.deepEqual(visibleVehicleData({brand_models:['大众ID.ERA 9X','理想i8']}).brand_models,['大众ID.ERA 9X','理想i8']);
  const result = queryCases(rows,new URLSearchParams('hide_volkswagen=true&offset=0&limit=1'));
  assert.equal(result.total,2); assert.equal(result.data[0].id,'vw');
  assert.equal(queryCases(rows,new URLSearchParams()).total,2);
  assert.equal(JSON.stringify(rows),original);
  console.log('PASS: Volkswagen retained in display, facets and search even for legacy filter requests; source records unchanged.');
})();
