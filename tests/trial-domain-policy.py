"""Trial policy regression: request gates, scoped SQL, media and paid/admin isolation."""
import ast, asyncio, importlib.util, sys, types
from pathlib import Path
from unittest.mock import Mock
from fastapi import HTTPException
from starlette.requests import Request
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('trial_domain_access',ROOT/'integrations/evaluation/trial_domain_access.py');policy=importlib.util.module_from_spec(spec);spec.loader.exec_module(policy)
trial={'role':'viewer','membership_tier':'trial'}
def request(path,method='GET',query=''):
 return Request({'type':'http','path':path,'method':method,'query_string':query.encode(),'headers':[]})
def denied(fn):
 try:fn()
 except HTTPException as e:assert e.status_code==403 and e.detail==policy.UPGRADE
 else:raise AssertionError('Expected 403')
assert policy.is_domain_trial(trial)
for u in [None,{'role':'admin','membership_tier':'trial'},{'role':'viewer','membership_tier':'plus'},{'role':'viewer','membership_tier':'pro'},{'role':'viewer','membership_tier':None}]:
 assert not policy.is_domain_trial(u)
 policy.restrict_request(u,request('/api/admin/users'))
for path in ['/api/video/all-results','/api/aggregation/vehicles','/api/aggregation/vehicle/criteria-by-domain','/api/video/pk-detail']:
 policy.restrict_request(trial,request(path))
 denied(lambda:policy.restrict_request(trial,request(path,query='function_domain=%E8%BD%A6%E6%8E%A7%E5%9F%9F')))
 denied(lambda:policy.restrict_request(trial,request(path,query='function_domain=%E5%87%BA%E8%A1%8C%E5%9F%9F&function_domain=%E8%BD%A6%E6%8E%A7%E5%9F%9F')))
for path,method in [('/api/admin/users','GET'),('/api/video/all-results','POST'),('/api/nas/list','POST'),('/api/aggregation/recompute','POST')]:
 denied(lambda:policy.restrict_request(trial,request(path,method)))
policy.restrict_request(trial,request('/api/video/stream/sign','POST'))
assert policy.scope_clause('AND x=%s',[1],None)==('AND x=%s',[1])
clause,params=policy.scope_clause('AND x=%s',[1],policy.DOMAIN);assert clause.endswith('vr.function_domain = %s') and params==[1,'出行域']
denied(lambda:policy.scope_clause('',[],'车控域'))
# Media paths must resolve to published travel records; a copied non-travel path fails.
db=Mock();db.raw_sql.return_value.data=[]
sys.modules['api']=types.ModuleType('api');sys.modules['api.services']=types.ModuleType('api.services')
m=types.ModuleType('api.services.readonly_db_client');m.readonly_db=db;sys.modules[m.__name__]=m
policy.authorize_video({'role':'admin'},'/unrelated')
denied(lambda:policy.authorize_video(trial,'/control/video.mp4'))
sql,args=db.raw_sql.call_args.args;assert args==['出行域','/control/video.mp4'] and 'evaluation_publication_results' in sql
db.raw_sql.return_value.data=[{'id':'travel'}];policy.authorize_video(trial,'/travel/video.mp4')
# Analytics and router score classes are separate Pydantic models: cross the boundary as dictionaries.
analytics=types.ModuleType('api.services.website_analytics');analytics.TEST_CASE_LIBRARY_FILTER=' AND published=true'
analytics._build_version_filter=lambda field,value:('AND '+field+' IS NOT DISTINCT FROM %s',[value])
class ForeignScore:
 def model_dump(self):return {'dimension_key':'任务理解','avg_score':4.0,'sample_count':12}
async def criteria(**kwargs):
 assert kwargs['trial_domain']=='出行域'
 return [types.SimpleNamespace(criteria=[ForeignScore()])]
analytics.get_criteria_by_domain=criteria;sys.modules[analytics.__name__]=analytics
sys.modules['api.services'].website_analytics=analytics
db.raw_sql.return_value.data=[{'score':4.0,'samples':12,'cases':12}]
snapshot=asyncio.run(policy.vehicle_snapshot('大众ID.ERA 9X','real-version'))
assert isinstance(snapshot['criteria_scores'][0],dict) and snapshot['overall_score'] is None
assert snapshot['function_domain_scores'][0]['dimension_key']=='出行域'
# Check the applied router functions, not just the integration text.
if len(sys.argv)>1:
 root=Path(sys.argv[1]);video=ast.parse((root/'api/routers/video.py').read_text());agg=ast.parse((root/'api/routers/aggregation.py').read_text());analytics=ast.parse((root/'api/services/website_analytics.py').read_text())
 def body(tree,name):return ast.unparse(next(n for n in tree.body if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef)) and n.name==name))
 for name in ['get_all_results','get_pk_cases']:
  assert 'function_domain = DOMAIN' in body(video,name)
 assert 'authorize_video(current_user, req.path)' in body(video,'sign_video_stream')
 assert "vr.function_domain = '出行域'" in body(video,'get_pk_detail')
 for name in ['get_criteria_by_domain','get_vehicle_task_completion','get_vehicle_acceptance_task_detail','get_metrics_baseline','get_metric_domain_breakdown']:
  assert 'scope_clause(ver_clause, ver_params, trial_domain)' in body(analytics,name)
  assert 'trial_domain=domain_scope(current_user)' in body(agg,name)
 for name in ['get_vehicle_acceptance_completion','get_vehicle_task_detail_cases']:
  assert 'scope_clause(ver_clause, ver_params, domain_scope(current_user))' in body(agg,name)
 assert 'vehicle_snapshot(brand_model, system_version)' in body(agg,'get_vehicle_scores')
 assert 'vehicle_list()' in body(agg,'list_vehicles')
print('PASS: Trial read-only request boundaries, duplicate-domain bypass denial, scoped SQL, signed-video access, patched router coverage, paid/admin and legacy isolation')
