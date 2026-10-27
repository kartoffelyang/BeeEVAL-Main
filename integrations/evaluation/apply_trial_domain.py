"""Apply the explicit Trial-domain policy to current API sources; no account mutation."""
from pathlib import Path
import ast, shutil, sys
root=Path(sys.argv[1]);src=Path(__file__).parent
shutil.copy2(src/'trial_domain_access.py',root/'api/services/trial_domain_access.py')

def edit(file, transform):
 p=root/file;s=p.read_text();s=transform(s);ast.parse(s);p.write_text(s)
def section(s,name,transform):
 tree=ast.parse(s);node=next(n for n in tree.body if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef)) and n.name==name)
 lines=s.splitlines(keepends=True);start=node.lineno-1;end=node.end_lineno
 return ''.join(lines[:start])+transform(''.join(lines[start:end]))+''.join(lines[end:])
def after_doc(body,addition):
 n=ast.parse(body).body[0];stmt=n.body[0];line=stmt.end_lineno if isinstance(stmt,ast.Expr) and isinstance(stmt.value,ast.Constant) and isinstance(stmt.value.value,str) else n.body[0].lineno-1
 lines=body.splitlines(keepends=True);return ''.join(lines[:line])+addition+''.join(lines[line:])
def aggregate_boundary(s):
 s=s.replace('is_domain_trial, domain_scope, scope_clause, vehicle_snapshot, vehicle_list','is_domain_trial, domain_scope, scope_clause, DOMAIN')
 s=section(s,'list_vehicles',lambda b:b.replace('    if is_domain_trial(current_user):\n        return await vehicle_list()\n',''))
 s=section(s,'get_vehicle_scores',lambda b:b.replace('    if is_domain_trial(current_user):\n        return VehicleScoreSnapshot(**await vehicle_snapshot(brand_model, system_version))\n',''))
 s=section(s,'get_vehicle_task_detail_cases',lambda b:b.replace('scope_clause(ver_clause, ver_params, domain_scope(current_user))','scope_clause(ver_clause, ver_params, DOMAIN if is_domain_trial(current_user) else None)'))
 return s
markers = {
 'api/auth/deps.py': 'restrict_request(user, req)',
 'api/services/trial_policy.py': '"max", "trial")',
 'api/services/website_analytics.py': 'scope_clause(ver_clause, ver_params, trial_domain)',
 'api/routers/aggregation.py': 'trial_domain=domain_scope(current_user)',
 'api/routers/video.py': 'authorize_video(current_user, req.path)',
}
present=[text in (root/file).read_text() for file,text in markers.items()]
if all(present):
 edit('api/routers/aggregation.py',aggregate_boundary)
 print('Trial policy refreshed: full aggregates; travel-only questions and video. No accounts changed.')
 sys.exit(0)
assert not any(present), 'Partial Trial policy detected: restore the source backup before applying.'

def deps(s):
 needle='        # Self-registered free members may only use identity endpoints.'
 assert needle in s
 return s.replace(needle,'        from api.services.trial_domain_access import restrict_request\n        restrict_request(user, req)\n\n'+needle,1)
edit('api/auth/deps.py',deps)
def legacy(s):
 needle='    if user.get("membership_tier") in ("plus", "pro", "max"):';assert needle in s
 return s.replace(needle,needle.replace('"max")','"max", "trial")'),1)
edit('api/services/trial_policy.py',legacy)
def analytics(s):
 s='from api.services.trial_domain_access import scope_clause\n'+s
 for name in ['get_criteria_by_domain','get_vehicle_task_completion','get_vehicle_acceptance_task_detail','get_metrics_baseline','get_metric_domain_breakdown']:
  def transform(body):
   body=body.replace('):\n','    trial_domain: Optional[str] = None,\n):\n',1)
   needle='    ver_clause, ver_params = _build_version_filter("vr.system_version", system_version)';assert needle in body
   return body.replace(needle,needle+'\n    ver_clause, ver_params = scope_clause(ver_clause, ver_params, trial_domain)',1)
  s=section(s,name,transform)
 return s
edit('api/services/website_analytics.py',analytics)
def aggregation(s):
 s='from api.services.trial_domain_access import is_domain_trial, domain_scope, scope_clause, DOMAIN\n'+s
 for name in ['get_criteria_by_domain','get_vehicle_task_completion','get_vehicle_acceptance_task_detail','get_metrics_baseline','get_metric_domain_breakdown']:
  s=section(s,name,lambda b:b.replace('system_version=system_version)','system_version=system_version, trial_domain=domain_scope(current_user))',1))
 for name in ['get_vehicle_acceptance_completion','get_vehicle_task_detail_cases']:
  def transform(b):
   needle='    ver_clause, ver_params = _build_version_filter("vr.system_version", system_version)';assert needle in b
   return b.replace(needle,needle+'\n    ver_clause, ver_params = scope_clause(ver_clause, ver_params, domain_scope(current_user))',1)
  s=section(s,name,transform)
 # All-scores may enumerate all published vehicles, but each snapshot is scoped above.
 return s
edit('api/routers/aggregation.py',lambda s:aggregate_boundary(aggregation(s)))
def video(s):
 s='from api.services.trial_domain_access import is_domain_trial, DOMAIN, authorize_video\n'+s
 for name in ['get_all_results','get_pk_cases']:
  s=section(s,name,lambda b:after_doc(b,'    if is_domain_trial(current_user):\n        function_domain = DOMAIN\n'))
 def filters(b):
  return b.replace('        if is_trial_user(current_user):','        if is_domain_trial(current_user):\n            where = " WHERE function_domain = %s"\n            params.append(DOMAIN)\n        elif is_trial_user(current_user):',1)
 s=section(s,'get_filter_options',filters)
 def detail(b):
  needle='            where_parts = ["vr.case_id = %s", "vr.brand_model = %s"]';assert needle in b
  return b.replace(needle,needle+'\n            if is_domain_trial(current_user):\n                where_parts.append("vr.function_domain = \'出行域\'")',1)
 s=section(s,'get_pk_detail',detail)
 def sign(b):
  b=b.replace('async def sign_video_stream(req: VideoSignRequest):','async def sign_video_stream(req: VideoSignRequest, current_user: dict = Depends(get_current_user)):')
  return after_doc(b,'    authorize_video(current_user, req.path)\n')
 return section(s,'sign_video_stream',sign)
edit('api/routers/video.py',video)
print('Trial domain policy applied. No user accounts changed.')
