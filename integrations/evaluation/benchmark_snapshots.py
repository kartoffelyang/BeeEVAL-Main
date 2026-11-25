"""Persistent snapshots for explicitly selected, published aggregate reads only.

Auth dependencies and per-model guards run on every request. Never apply this to
identities, questions, evidence, video signing or write handlers. All builders
are the original read functions, not evaluation/recalculation jobs.
"""
import asyncio
import functools
import hashlib
import inspect
import json
import threading
from pathlib import Path

import psycopg2
from fastapi.concurrency import run_in_threadpool
from fastapi.encoders import jsonable_encoder
from pydantic import TypeAdapter

from api.core.logger import logger
from api.services.supabase_client import supabase

_worker = None
_stop = threading.Event()
_worker_lock = threading.Lock()
_LEADER_LOCK = 718298314550377
_NESTED = threading.local()


def _json(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':'))


@functools.lru_cache(maxsize=1)
def fingerprint():
    """A deployment's Python/config inputs; config edits require worker restart."""
    root = Path(__file__).resolve().parents[1]
    files = list((root / 'data').rglob('*.json'))
    files += list((root / 'services').glob('*.py'))
    files += [root / 'routers/aggregation.py', root / 'core/constants.py']
    digest = hashlib.sha256(b'benchmark-snapshots-v1')
    for path in sorted(files):
        digest.update(str(path.relative_to(root)).encode())
        digest.update(path.read_bytes())
    return digest.hexdigest()


def _scope(principal):
    from api.services.trial_policy import is_trial_user, TRIAL_VISIBLE_BRAND_MODELS
    from api.services.trial_domain_access import domain_scope
    # These are ALL principal-dependent predicates used by the selected reads.
    # Explicit Trial has full aggregate scope. Its evidence remains travel-only.
    return {'brands': sorted(TRIAL_VISIBLE_BRAND_MODELS) if is_trial_user(principal) else None,
            'domain': domain_scope(principal)}


def _lookup(key):
    rows = supabase.raw_sql('''
        SELECT r.revision, s.revision AS snapshot_revision, s.payload
        FROM public.beeeval_benchmark_revision r
        LEFT JOIN public.beeeval_benchmark_snapshots s ON s.cache_key=%s
        WHERE r.singleton
    ''', [key]).data
    if not rows:
        raise RuntimeError('Benchmark snapshot revision is not installed')
    row = rows[0]
    return row['revision'], row['payload'], row['snapshot_revision'] == row['revision']


def _store(key, namespace, parameters, scope, version, revision, payload):
    supabase.raw_sql('''
        INSERT INTO public.beeeval_benchmark_snapshots
            (cache_key,namespace,parameters,scope,fingerprint,revision,payload)
        VALUES (%s,%s,%s::jsonb,%s::jsonb,%s,%s,%s::jsonb)
        ON CONFLICT(cache_key) DO UPDATE SET revision=EXCLUDED.revision,
            payload=EXCLUDED.payload,computed_at=clock_timestamp()
    ''', [key, namespace, _json(parameters), _json(scope), version, revision, _json(payload)])


def snapshot_read(namespace, schema=None):
    """Cross-worker response cache, checked against a transactional data revision."""
    adapter = TypeAdapter(schema) if schema else None

    def decorate(function):
        # Resolve postponed annotations in the endpoint module before FastAPI inspects the wrapper.
        signature = inspect.signature(function, eval_str=True)
        asynchronous = inspect.iscoroutinefunction(function)

        def execute(args, kwargs):
            bound = signature.bind(*args, **kwargs)
            bound.apply_defaults()
            for name, value in list(bound.arguments.items()):
                # Direct warm calls and HTTP calls must share the same key.
                if type(value).__module__ == 'fastapi.params' and hasattr(value, 'default'):
                    bound.arguments[name] = value.default
            principal = bound.arguments.get('current_user')
            if 'current_user' in bound.arguments and not isinstance(principal, dict):
                raise TypeError('Snapshot reads require a resolved principal')
            if principal is not None and 'brand_model' in bound.arguments:
                # Never bypass the existing guard, even on a cache hit.
                function.__globals__['_assert_brand_visible'](bound.arguments['brand_model'], principal)
            parameters = {k: v for k, v in bound.arguments.items() if k != 'current_user'}
            scope = _scope(principal) if principal is not None else {}
            version = fingerprint()
            key = hashlib.sha256(_json([namespace, parameters, scope, version]).encode()).hexdigest()
            restore = adapter.validate_python if adapter else lambda value: value

            def build():
                value = function(*bound.args, **bound.kwargs)
                return asyncio.run(value) if asynchronous else value

            # Builders may call other decorated reads (e.g. the bulk ranking).
            # Run these within the outer revision check without another thread.
            if getattr(_NESTED, 'building', False):
                return build()
            try:
                revision, payload, valid = _lookup(key)
                if valid:
                    return restore(payload)
                with supabase.transaction():
                    # One build per key across users/processes, not one per login.
                    lock = int(key[:16], 16) - (1 << 63)
                    supabase.raw_sql('SELECT pg_advisory_xact_lock(%s)', [lock])
                    for _ in range(2):
                        revision, payload, valid = _lookup(key)
                        if valid:
                            return restore(payload)
                        _NESTED.building = True
                        try:
                            value = build()
                        finally:
                            _NESTED.building = False
                        current_revision, _, _ = _lookup(key)
                        if current_revision == revision:
                            _store(key, namespace, parameters, scope, version, revision, jsonable_encoder(value))
                            return value
                    # Data changed twice while reading: return the original read,
                    # but never publish that mixed response as a reusable snapshot.
                    return value
            except psycopg2.Error:
                # A cache failure is not an authorization bypass or an outage of
                # the original source. Its live filters/guards remain in force.
                logger.warning('Benchmark snapshot storage unavailable; using original aggregate read')
                return build()

        if asynchronous:
            @functools.wraps(function)
            async def async_read(*args, **kwargs):
                if getattr(_NESTED, 'building', False):
                    return await function(*args, **kwargs)
                return await run_in_threadpool(execute, args, kwargs)
            async_read.__signature__ = signature
            return async_read

        @functools.wraps(function)
        def sync_read(*args, **kwargs):
            return execute(args, kwargs)
        sync_read.__signature__ = signature
        return sync_read
    return decorate


def warm_snapshots():
    """Prepare the finite benchmark matrix once per published revision/deployment."""
    from api.routers import aggregation
    from api.services import website_analytics as analytics
    from api.services.metric_service import metric_service
    from api.core.constants import STANDARD_FUNCTION_DOMAINS

    version = fingerprint()
    ready_key = 'warm:' + version
    revision, _, ready = _lookup(ready_key)
    if ready:
        return 0
    # Dedicated session lock does not hold a DB transaction over the whole warm.
    # Each response commits separately and is immediately available to readers.
    connection = supabase._get_connection()
    acquired = False
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT pg_try_advisory_lock(%s)', [_LEADER_LOCK])
            acquired = cursor.fetchone()[0]
        connection.commit()
        if not acquired:
            return 0
        revision, _, ready = _lookup(ready_key)
        if ready:
            return 0
        count = 0
        principal = {'role': 'admin'}  # Internal aggregate scope; creates no account/session.
        inventory = aggregation.list_vehicles(current_user=principal)
        asyncio.run(aggregation.all_vehicle_scores(current_user=principal))
        for vehicle in inventory:
            if _stop.is_set() or _lookup(ready_key)[0] != revision:
                return count
            if not vehicle.has_cache:
                continue
            params = dict(brand_model=vehicle.brand_model, system_version=vehicle.system_version)
            asyncio.run(aggregation.get_vehicle_scores(**params, current_user=principal))
            aggregation.get_vehicle_acceptance_completion(**params, current_user=principal)
            for name in ('get_criteria_by_domain', 'get_vehicle_task_completion', 'get_metrics_baseline'):
                asyncio.run(getattr(analytics, name)(**params, trial_domain=None))
                count += 1
            for domain in STANDARD_FUNCTION_DOMAINS:
                asyncio.run(analytics.get_vehicle_acceptance_task_detail(**params, function_domain=domain, trial_domain=None))
                count += 1
            for metric in metric_service.get_core_metrics():
                asyncio.run(analytics.get_metric_domain_breakdown(**params, metric_code=metric['code'], trial_domain=None))
                count += 1
        # Legacy viewer inventory is separately filtered, never shared with full scope.
        legacy = {'role': 'viewer'}
        aggregation.list_vehicles(current_user=legacy)
        asyncio.run(aggregation.all_vehicle_scores(current_user=legacy))
        if _lookup(ready_key)[0] == revision and not _stop.is_set():
            _store(ready_key, '__warm__', {}, {}, version, revision, {'ready': True})
            # Keep current deployments plus a bounded rollback window of old inputs.
            supabase.raw_sql('''DELETE FROM public.beeeval_benchmark_snapshots
                WHERE fingerprint<>%s AND computed_at<clock_timestamp()-interval '7 days' ''', [version])
            logger.info(f'Benchmark snapshots prepared: revision={revision} responses={count}')
        return count
    finally:
        try:
            connection.rollback()
            if acquired:
                with connection.cursor() as cursor:
                    cursor.execute('SELECT pg_advisory_unlock(%s)', [_LEADER_LOCK])
                connection.commit()
        finally:
            supabase._put_connection(connection, close=bool(connection.closed))


def start_prewarm_worker():
    global _worker
    with _worker_lock:
        if _worker and _worker.is_alive():
            return
        _stop.clear()

        def watch():
            # Do not delay API startup/health or compete with initial imports.
            while not _stop.wait(5):
                try:
                    warm_snapshots()
                except Exception:
                    logger.exception('Benchmark snapshot preparation failed; reads remain available')
                if _stop.wait(10):
                    break

        _worker = threading.Thread(target=watch, name='benchmark-snapshots', daemon=True)
        _worker.start()


def stop_prewarm_worker():
    _stop.set()


if __name__ == '__main__':
    print('Prepared aggregate responses:', warm_snapshots())
