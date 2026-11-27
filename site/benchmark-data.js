let pending;
export function loadBenchmarkData(){
  if(!pending)pending=fetch('/api/benchmark-preview',{cache:'no-store',signal:AbortSignal.timeout(15000)})
    .then(async response=>{
      if(!response.ok)throw Error('preview unavailable');
      const data=await response.json();
      if(data.visibility_policy!=='exclude-v1'||data.report_version!=='live-v1'||!data.statistics?.vehicles?.length)throw Error('invalid preview');
      return {...data,isStale:false};
    }).catch(async()=>{
      const [response,anonymous]=await Promise.all([fetch('/assets/benchmark.json',{cache:'no-store'}),fetch('/assets/anonymous-profile.json',{cache:'no-store'}).then(r=>r.json())]);
      if(!response.ok)throw Error('no preview available');
      const archived=await response.json();
      if(archived.visibility_policy!=='exclude-v1'||anonymous.visibility_policy!=='exclude-v1')throw Error('invalid archived preview');
      return {...archived,anonymous,isStale:true};
    });
  return pending;
}

function bilingual(node,zh,en){
  if(!node)return;
  node.dataset.zh=zh;node.dataset.en=en;
  node.textContent=localStorage.getItem('beeeval-site-language')==='en'?en:zh;
}

export function updateBenchmarkLabels(data,vehicle){
  const date=vehicle?.overall.computed_at?.slice(0,10)||data.as_of||'—';
  const stale=Boolean(data.isStale);
  bilingual(document.querySelector('[data-benchmark-source]'),
    stale?`历史报告快照 · ${date}；当前数据服务暂不可用。`:`BeeEVAL 已发布评分 · 更新于 ${date}。评分对应所示车型与软件版本。`,
    stale?`Archived report snapshot · ${date}. Current data is temporarily unavailable.`:`Published BeeEVAL scores · updated ${date}. Results apply to the model and software version shown.`);
  if(vehicle){const count=document.querySelector('[data-benchmark-domain-count]');if(count)count.textContent=String(Object.keys(vehicle.domains).length).padStart(2,'0')}
  document.querySelectorAll('[data-benchmark-updated]').forEach(node=>{
    const updated=node.dataset.benchmarkUpdated==='scenes'?(data.generated_at?.slice(0,10)||data.as_of):(data.anonymous?.as_of||data.as_of);
    bilingual(node,`${stale?'历史报告快照':'已发布评测数据'} · ${updated||date}`,
      `${stale?'Archived report snapshot':'Published evaluation data'} · ${updated||date}`);
  });
  const baselineDate=data.generated_at?.slice(0,10)||data.as_of||date;
  const modelCount=data.statistics.vehicles.length;
  bilingual(document.querySelector('[data-benchmark-baseline-source]'),
    `BeeEVAL · ${stale?'历史报告快照':'公开预览车型样本'}（${modelCount} 款）· ${baselineDate} · 每个点为一个任务类别的车型版本统计中位数。`,
    `BeeEVAL · ${stale?'Archived snapshot':'Public preview sample'} (${modelCount} models) · ${baselineDate}. Each point shows the median across tested model versions for one task category.`);
}
