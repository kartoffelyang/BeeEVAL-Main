"""Read-only output/performance comparison using rolled-back cache tables.

Run in the candidate API image. Real scores/publication/identity are read only.
"""
import asyncio
from contextlib import contextmanager
import json
from statistics import median
from time import perf_counter
import uuid

from fastapi.encoders import jsonable_encoder
from api.routers import aggregation
from api.services import website_analytics as analytics
from api.services import benchmark_snapshots as cache
from api.services.supabase_client import supabase
from api.services.readonly_db_client import readonly_db

schema = 'snapshot_verify_' + uuid.uuid4().hex[:12]
source_reads = []
real_write_sql = supabase.raw_sql
real_read_sql = readonly_db.raw_sql


def watch(function):
    def query(sql, params=None):
        if any(name in sql for name in ('FROM video_results', 'FROM beeeval_benchmark_results',
                                       'JOIN beeeval_benchmark_results', 'FROM vehicle_', 'FROM test_case_pool')):
            source_reads.append(sql)
        return function(sql, params)
    return query


class CacheStorage:
    def raw_sql(self, sql, params=None):
        return supabase.raw_sql(sql.replace('public.beeeval_benchmark_', schema + '.beeeval_benchmark_'), params)

    def __getattr__(self, name):
        return getattr(supabase, name)


def call(function, **params):
    result = function(**params)
    return asyncio.run(result) if asyncio.iscoroutine(result) else result


def timed(function, **params):
    start = perf_counter()
    value = call(function, **params)
    return value, perf_counter() - start


supabase.raw_sql = watch(real_write_sql)
readonly_db.raw_sql = watch(real_read_sql)
cache.supabase = CacheStorage()
principal = {'role': 'admin'}
results = []
try:
    with supabase.transaction():
        supabase.raw_sql('CREATE SCHEMA ' + schema)
        supabase.raw_sql('''CREATE TABLE ''' + schema + '''.beeeval_benchmark_revision
            (singleton boolean PRIMARY KEY, revision bigint);
            INSERT INTO ''' + schema + '''.beeeval_benchmark_revision VALUES (true,1);
            CREATE TABLE ''' + schema + '''.beeeval_benchmark_snapshots
            (cache_key text PRIMARY KEY,namespace text,parameters jsonb,scope jsonb,
             fingerprint text,revision bigint,payload jsonb,computed_at timestamptz DEFAULT clock_timestamp());''')
        inventory = aggregation.list_vehicles.__wrapped__(current_user=principal)
        versions = [v for v in inventory if v.has_cache]
        sample = next(v for v in versions if 'Livis' in v.brand_model)
        params = dict(brand_model=sample.brand_model, system_version=sample.system_version)
        targets = [
            ('inventory', aggregation.list_vehicles, dict(current_user=principal)),
            ('all_scores', aggregation.all_vehicle_scores, dict(current_user=principal)),
            ('acceptance', aggregation.get_vehicle_acceptance_completion, dict(**params, current_user=principal)),
            ('criteria', analytics.get_criteria_by_domain, dict(**params, trial_domain=None)),
            ('scenario', analytics.get_vehicle_task_completion, dict(**params, trial_domain=None)),
            ('metrics', analytics.get_metrics_baseline, dict(**params, trial_domain=None)),
        ]
        for name, function, arguments in targets:
            cache._NESTED.building = True
            try:
                baseline, original_seconds = timed(function.__wrapped__, **arguments)
            finally:
                cache._NESTED.building = False
            cold, cold_seconds = timed(function, **arguments)
            assert jsonable_encoder(cold) == jsonable_encoder(baseline), name + ': cold output changed'
            before = len(source_reads)
            hot_times = []
            for _ in range(5):
                hot, elapsed = timed(function, **arguments)
                assert jsonable_encoder(hot) == jsonable_encoder(baseline), name + ': hot output changed'
                hot_times.append(elapsed)
            assert len(source_reads) == before, name + ': hot read performed source aggregation'
            results.append(dict(name=name, original_ms=round(original_seconds*1000,3),
                                cold_ms=round(cold_seconds*1000,3), hot_median_ms=round(median(hot_times)*1000,3)))
        # Every currently scored model/version, plus the full finite warm matrix.
        for vehicle in versions:
            args = dict(brand_model=vehicle.brand_model, system_version=vehicle.system_version, current_user=principal)
            original = call(aggregation.get_vehicle_scores.__wrapped__, **args)
            cached = call(aggregation.get_vehicle_scores, **args)
            assert jsonable_encoder(original) == jsonable_encoder(cached)
        prepared = cache.warm_snapshots()
        assert prepared > 0
        before = len(source_reads)
        assert cache.warm_snapshots() == 0
        assert before == len(source_reads), 'Ready matrix rebuilt'
        # Explicit Trial shares aggregate results, but legacy brand policy is live.
        trial = {'role': 'viewer', 'membership_tier': 'trial'}
        assert jsonable_encoder(aggregation.list_vehicles(current_user=trial)) == jsonable_encoder(inventory)
        supabase.raw_sql('UPDATE ' + schema + '.beeeval_benchmark_revision SET revision=revision+1')
        before = len(source_reads)
        aggregation.list_vehicles(current_user=principal)
        assert len(source_reads) > before, 'Revision change reused old response'
        total = cache.supabase.raw_sql('SELECT count(*) AS n FROM public.beeeval_benchmark_snapshots').data[0]['n']
        print(json.dumps(dict(vehicles=len(versions), prepared=prepared, snapshots=total,
                              hot_source_queries=0, exact_outputs=True, results=results), ensure_ascii=False))
        raise RuntimeError('__rollback_verification__')
except RuntimeError as error:
    if str(error) != '__rollback_verification__':
        raise
finally:
    supabase.raw_sql = real_write_sql
    readonly_db.raw_sql = real_read_sql
    cache.supabase = supabase
print('PASS: all real vehicle score outputs equal; warm/hot aggregates equal and perform zero source queries; revision invalidation and Trial aggregate scope preserved; verification schema rolled back')
