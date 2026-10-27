const assert=require('node:assert/strict');
(async()=>{
 await require('esbuild').build({entryPoints:['local-server/case-search.ts'],outfile:'node_modules/.tmp/classification.cjs',bundle:true,format:'cjs',platform:'node'});
 const {queryCases}=require('../../node_modules/.tmp/classification.cjs');
 const rows=[{id:'a',case_id:'1001',brand_model:'理想i8',function_domain:'车控域'},
 {id:'b',case_id:'1007',brand_model:'理想i8',function_domain:'车控域'},
 {id:'c',case_id:'unknown',brand_model:'理想i8',function_domain:'出行域',metadata:{task_detail:'多途经点路线规划',acceptance_tag:'进阶验收'}},
 {id:'locked',case_id:'1001',brand_model:'理想i8',function_domain:'车控域',_locked:true},
 {id:'hidden',case_id:'1001',brand_model:'大众ID.ERA 9X',function_domain:'车控域'}];
 const before=JSON.stringify(rows);
 const q=(str)=>queryCases(rows,new URLSearchParams(str));
 const r=q('task_detail=车窗开合控制&acceptance_tag=基础验收&hide_volkswagen=true&limit=1');
 assert.equal(r.total,2);assert.equal(r.data[0].id,'a');
 assert.ok(r.facets.task_types.includes('天窗天幕控制'));
 const domain=q('function_domain=出行域');assert.deepEqual(domain.facets.task_types,['多途经点路线规划']);
 assert.deepEqual(domain.facets.difficulties,['进阶验收']);
 assert.equal(q('function_domain=出行域&task_detail=车窗开合控制').total,0);
 assert.equal(JSON.stringify(rows),before);
 console.log('PASS: official taxonomy, metadata fallback, task + difficulty intersection, scoped options, pagination, locked/hidden exclusions, source records unchanged.');
})();
