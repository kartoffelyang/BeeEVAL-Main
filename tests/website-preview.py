"""Public projection contract: fixed model scope, current versions and no evidence."""
import importlib.util
import json
from pathlib import Path
import sys
import types


def module(name, **values):
    item=types.ModuleType(name);item.__dict__.update(values);sys.modules[name]=item;return item


def snapshot(name,version,date):
    return types.SimpleNamespace(brand_model=name,system_version=version,last_computed_at=date,overall_score=4.1,
        overall_sample_count=50,scoring_version='current',
        function_domain_scores=[types.SimpleNamespace(dimension_key='出行域',avg_score=4.2,sample_count=50)],
        criteria_scores=[types.SimpleNamespace(dimension_key='回答质量',avg_score=4.1,sample_count=50)],
        metadata={'path':'/volume1/private/file.mp4'},user_question='PRIVATE QUESTION')


rows=[snapshot('极氪9X','old','2026-10-07'),snapshot('极氪9X','new','2026-11-23'),
      snapshot('理想L9 Livis','9.0.2','2026-11-20'),snapshot('理想i8','v8','2026-11-23'),snapshot('Private model','secret','2026-11-23')]
async def scores(**kwargs):return rows
async def detail(**kwargs):
    return {'by_grade':[{'task_details':[dict(task_detail='直接指令导航',success=3,failed=1,unknown=1,case_count=5,score=4,score_count=4)]},
                        {'task_details':[dict(task_detail='直接指令导航',success=2,failed=0,unknown=0,case_count=2,score=5,score_count=2)]}]}


module('api');module('api.routers');module('api.services');module('api.core')
module('api.services.benchmark_snapshots',snapshot_read=lambda name:lambda fn:fn)
module('api.core.constants',STANDARD_FUNCTION_DOMAINS=['出行域'])
module('api.routers.aggregation',all_vehicle_scores=scores,
       get_metrics_registry=lambda:[dict(name='回答质量',category='Action / A1-执行质量')])
module('api.services.website_analytics',get_vehicle_acceptance_task_detail=detail)
path=Path(__file__).resolve().parents[1]/'integrations/evaluation/website_preview.py'
spec=importlib.util.spec_from_file_location('website_preview',path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
data=m.benchmark_preview();raw=json.dumps(data,ensure_ascii=False)
assert [v['name'] for v in data['statistics']['vehicles']]==['极氪9X','理想L9 Livis']
assert data['statistics']['vehicles'][0]['version']=='new'
assert data['as_of']=='2026-11-23'
assert '/volume1' not in raw and 'PRIVATE QUESTION' not in raw and 'Private model' not in raw and '理想i8' not in raw
assert data['anonymous']['metrics'][0]['category']=='A1-执行质量'
scene=data['anonymous']['scenes'][0]
assert scene['success']==5 and scene['failed']==1 and scene['n']==7 and scene['completion']==5/6
assert data['statistics']['scenarios'][0]['vehicles']==2
print('PASS: fixed public models, newest exact software version, current dates, weighted task merging, anonymous aggregates; no hidden models, questions, users or media paths')
