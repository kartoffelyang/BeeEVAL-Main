// A public, finite aggregate projection. Never forward credentials or raw evidence.
export async function loadBenchmarkPreview(origin,fetcher=fetch){
  const response=await fetcher(origin+'/api/public/benchmark-preview',{signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw new Error('Benchmark preview unavailable');
  const data=await response.json();
  if(data.visibility_policy!=='exclude-v1'||data.report_version!=='live-v1'||!Array.isArray(data.statistics?.vehicles)||!data.statistics.vehicles.length)
    throw new Error('Invalid benchmark preview');
  return data;
}
