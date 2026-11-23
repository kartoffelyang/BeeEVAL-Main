"""Run in the API Python environment; mock storage, use real FastAPI/Pydantic.

No account, evaluation record, publication or network is modified by this test.
"""
import asyncio
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
import copy
import importlib.util
import json
import logging
from pathlib import Path
import sys
import threading
import time
import types

from fastapi import HTTPException, Query
from pydantic import BaseModel
import psycopg2

ROOT = Path(__file__).resolve().parents[1] / 'integrations/evaluation'


class Storage:
    def __init__(self):
        self.revision = 1
        self.rows = {}
        self.gate = threading.RLock()
        self.fail = False

    @contextmanager
    def transaction(self):
        with self.gate:
            yield

    def raw_sql(self, sql, params=None):
        if self.fail:
            raise psycopg2.OperationalError('cache offline')
        if 'LEFT JOIN' in sql:
            row = self.rows.get(params[0], {})
            data = [dict(revision=self.revision, snapshot_revision=row.get('revision'), payload=copy.deepcopy(row.get('payload')))]
        elif 'pg_advisory_xact_lock' in sql:
            data = []
        elif 'INSERT INTO' in sql:
            key, namespace, parameters, scope, fingerprint, revision, payload = params
            self.rows[key] = dict(namespace=namespace, parameters=json.loads(parameters), scope=json.loads(scope),
                                  fingerprint=fingerprint, revision=revision, payload=json.loads(payload))
            data = []
        else:
            raise AssertionError(sql)
        return types.SimpleNamespace(data=data)


def module(name, **values):
    value = types.ModuleType(name)
    value.__dict__.update(values)
    sys.modules[name] = value
    return value


db = Storage()
module('api'); module('api.core'); module('api.services')
module('api.core.logger', logger=logging.getLogger('snapshot-test'))
module('api.services.supabase_client', supabase=db)
module('api.services.trial_policy', is_trial_user=lambda u: u.get('role') == 'viewer' and not u.get('membership_tier'),
       TRIAL_VISIBLE_BRAND_MODELS=('Allowed',))
module('api.services.trial_domain_access', domain_scope=lambda u: None)
spec = importlib.util.spec_from_file_location('api.services.benchmark_snapshots', ROOT / 'benchmark_snapshots.py')
snapshots = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = snapshots
spec.loader.exec_module(snapshots)
snapshots.fingerprint = lambda: 'code-and-config-v1'


def _assert_brand_visible(brand, principal):
    if principal.get('role') == 'viewer' and not principal.get('membership_tier') and brand != 'Allowed':
        raise HTTPException(403, 'hidden')


class Vehicle(BaseModel):
    brand: str
    version: str | None
    scores: list[float]


builds = []
@snapshots.snapshot_read('vehicle', schema=Vehicle)
def vehicle(brand_model, system_version=Query(None), current_user=None):
    builds.append((brand_model, system_version))
    time.sleep(.01)
    return Vehicle(brand=brand_model, version=system_version, scores=[db.revision * 1.0])


admin = {'id': 'admin', 'role': 'admin'}
paid = {'id': 'other-user', 'role': 'viewer', 'membership_tier': 'plus'}
trial = {'role': 'viewer', 'membership_tier': 'trial'}
legacy = {'role': 'viewer'}
v = vehicle('Allowed', current_user=admin)
v.scores.append(99)
assert vehicle('Allowed', None, current_user=paid).scores == [1.0]
assert vehicle('Allowed', current_user=trial).scores == [1.0]
assert len(builds) == 1, 'Equivalent aggregate scope must share a durable response'
assert all('id' not in r['scope'] and 'current_user' not in r['parameters'] for r in db.rows.values())
vehicle('Allowed', current_user=legacy)
assert len(builds) == 2, 'Legacy scope must be a separate cache key'
vehicle('Hidden', current_user=admin)
try:
    vehicle('Hidden', current_user=legacy)
except HTTPException as error:
    assert error.status_code == 403
else:
    raise AssertionError('A full-scope cache hit bypassed brand guard')
vehicle('Allowed', 'OTA 1', current_user=paid)
assert builds[-1] == ('Allowed', 'OTA 1')
db.revision += 1
assert vehicle('Allowed', current_user=admin).scores == [2.0]
assert vehicle('Allowed', current_user=paid).scores == [2.0]
before = len(builds)
snapshots.fingerprint = lambda: 'code-and-config-v2'
vehicle('Allowed', current_user=paid)
assert len(builds) == before + 1

# No process memory cache: a new decorator/process can read the stored payload.
@snapshots.snapshot_read('vehicle', schema=Vehicle)
def restarted(brand_model, system_version=None, current_user=None):
    raise AssertionError('Hot snapshot performed source aggregation after restart')
assert restarted('Allowed', current_user=admin).scores == [2.0]

before = len(builds)
db.revision += 1
with ThreadPoolExecutor(max_workers=8) as pool:
    futures = [pool.submit(vehicle, 'Allowed', current_user=paid) for _ in range(8)]
    assert all(f.result().scores == [3.0] for f in futures)
assert len(builds) == before + 1, 'Concurrent cold requests must coalesce'

changes = []
@snapshots.snapshot_read('revision-during-build')
def moving():
    changes.append(db.revision)
    if len(changes) == 1:
        db.revision += 1
    return {'revision': db.revision}
assert moving() == {'revision': 4}
assert len(changes) == 2, 'A snapshot must not be stored against an old revision'
assert moving() == {'revision': 4} and len(changes) == 2

@snapshots.snapshot_read('always-changing')
def unstable():
    db.revision += 1
    return {'partial': True}
unstable()
assert not any(r['namespace'] == 'always-changing' for r in db.rows.values())

@snapshots.snapshot_read('original-error')
def broken():
    raise HTTPException(500, 'source error')
try:
    broken()
except HTTPException:
    pass
else:
    raise AssertionError('Source error was hidden')
assert not any(r['namespace'] == 'original-error' for r in db.rows.values())

db.fail = True
assert vehicle('Allowed', current_user=admin).brand == 'Allowed', 'Cache failure must retain original read'
db.fail = False

@snapshots.snapshot_read('async-nested', schema=list[Vehicle])
async def aggregate(current_user):
    return [vehicle('Allowed', current_user=current_user)]
result = asyncio.run(aggregate(admin))
assert isinstance(result[0], Vehicle)
assert isinstance(asyncio.run(aggregate(paid))[0], Vehicle)
print('PASS: persistent reuse, scope isolation and live guard, exact version identity, response model restoration, mutation isolation, revision/config invalidation, concurrent cold coalescing, revision-race retry, no partial/error snapshots, failure fallback and async nesting')
