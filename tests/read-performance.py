"""Local regression coverage for pagination, permissions and cache isolation. No network."""
import importlib.util
import inspect
import json
import sys
import types
from pathlib import Path
from unittest.mock import Mock

ROOT = Path(__file__).resolve().parents[1] / 'integrations/evaluation'


def module(name, **attrs):
    value = types.ModuleType(name)
    value.__dict__.update(attrs)
    sys.modules[name] = value
    return value


class HTTPException(Exception):
    def __init__(self, status_code, detail):
        self.status_code, self.detail = status_code, detail


class Router:
    def __init__(self, **kwargs): pass
    def get(self, *args, **kwargs): return lambda fn: fn


module('fastapi', APIRouter=Router, Depends=lambda fn: None, Query=lambda default=None, **kwargs: default, HTTPException=HTTPException)
module('api'); module('api.services'); module('api.auth')
module('api.auth.deps', require_user=lambda: None)
db = Mock()
module('api.services.supabase_client', supabase=db)
tags = {'1001': {'content': '打开天窗', 'task_detail': '天窗控制', 'acceptance_tag': '基础验收'}}
tag_service = types.SimpleNamespace(tags=tags, get_tags=lambda cid: tags.get(cid), get_content=lambda cid: tags.get(cid, {}).get('content'))
module('api.services.test_case_tag_service', test_case_tag_service=tag_service)
module('api.services.trial_domain_access', is_domain_trial=lambda u: u.get('role') != 'admin' and u.get('membership_tier') == 'trial', DOMAIN='出行域', UPGRADE='membership_upgrade_required')
module('api.services.trial_policy', is_trial_user=lambda u: u.get('role') == 'viewer' and not u.get('membership_tier'), TRIAL_VISIBLE_BRAND_MODELS=['车型甲'], TRIAL_VISIBLE_CASE_IDS=['1001'])


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    value = importlib.util.module_from_spec(spec)
    sys.modules[name] = value
    spec.loader.exec_module(value)
    return value


cache = load('api.services.read_performance', ROOT / 'read_performance.py')
search = load('paged_case_search', ROOT / 'paged_case_search.py')
paid = {'id': 1, 'role': 'viewer', 'membership_tier': 'plus'}
trial = {**paid, 'membership_tier': 'trial'}
admin = {**paid, 'role': 'admin'}
where, values, _ = search.base_scope(paid, {'exclude_review': True})
assert 'evaluation_publication_results' in ' '.join(where)
assert "needs_review" in ' '.join(where)
assert 'evaluation_publication_results' not in ' '.join(search.base_scope(admin, {})[0])
where, values, _ = search.base_scope(trial, {'exclude_review': True})
assert '出行域' in values and 'vr.function_domain = %s' in where
try:
    search.base_scope(trial, {'function_domain': '车控域'})
except HTTPException as error:
    assert error.status_code == 403
else:
    raise AssertionError('Trial bypass')
assert search.normalize('ＡＢＣ， 天窗！') == 'abc天窗'
db.raw_sql.return_value.data = [{'total': 31, 'data': [{'id': 'a', 'case_id': '1001', 'metadata': {}}]}]
r = search.case_search(current_user=paid, offset=30, limit=30)
assert r['total'] == 31 and r['data'][0]['case_definition'] == '打开天窗'
sql, args = db.raw_sql.call_args.args
assert args[-2:] == [30, 30] and 'LIMIT %s OFFSET %s' in sql
assert 'NOT MATERIALIZED' in sql and 'evaluation_scores' not in sql
assert db.raw_sql.call_count == 1  # count and page share one snapshot
db.raw_sql.reset_mock()
search.case_search(current_user=paid, search="天窗 %_ ' OR 1=1 --", max_score=4, max_score_exclusive=True)
sql, args = db.raw_sql.call_args.args
assert 'POSITION(%s IN ' in sql and "OR 1=1" not in sql
assert ['1001'] in args and ' < %s' in sql
db.raw_sql.return_value.data = [{'total': 1, 'data': [{'id': 'b', 'case_id': '9999', 'video_name': 'secret', 'metadata': {'user_question': 'secret'}}]}]
r = search.case_search(current_user={'role': 'viewer', 'membership_tier': None})
assert r['data'][0]['_locked'] and 'video_name' not in r['data'][0] and r['data'][0]['metadata'] == {}
sql, args = db.raw_sql.call_args.args
assert ['车型甲'] in args
calls = []
@cache.cached_read(ttl=20)
def read(principal):
    calls.append(principal.copy())
    return {'items': [principal['membership_tier']]}
first = read(paid)
first['items'].append('mutated')
assert read(paid)['items'] == ['plus'] and len(calls) == 1
assert read(trial)['items'] == ['trial'] and len(calls) == 2
assert read({**paid, 'is_active': False})['items'] == ['plus'] and len(calls) == 3
print('PASS: live single-query pagination, publication scope, Trial domain guard, legacy locking, literal keyword filtering, exclusive score bounds, canonical wording, identity-scoped cache and response mutation isolation')
