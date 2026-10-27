"""Explicit Trial membership: published travel-domain data, across all vehicles.

Legacy viewer sampling remains separate. No user records are migrated here.
"""
from fastapi import HTTPException
DOMAIN = '出行域'
UPGRADE = 'membership_upgrade_required'

def is_domain_trial(user):
    return bool(user and user.get('role') != 'admin' and user.get('membership_tier') == 'trial')

def domain_scope(user):
    return DOMAIN if is_domain_trial(user) else None

def restrict_request(user, request):
    if not is_domain_trial(user):
        return
    path = request.url.path
    identity = {'/api/auth/me','/api/auth/profile','/api/auth/change-password','/api/auth/logout','/api/auth/focus-time'}
    metadata = {'/api/aggregation/metrics-map','/api/aggregation/domains-map','/api/aggregation/task-detail-map','/api/aggregation/brand-map','/api/aggregation/metrics-registry','/api/aggregation/domain-weights'}
    reads = {'/api/video/all-results','/api/video/filter-options','/api/video/pk-cases','/api/video/pk-detail','/api/aggregation/vehicles','/api/aggregation/vehicle','/api/aggregation/vehicles/all-scores','/api/aggregation/vehicle/criteria-by-domain','/api/aggregation/vehicle/task-completion','/api/aggregation/vehicle/acceptance-completion','/api/aggregation/vehicle/acceptance-task-detail','/api/aggregation/vehicle/task-detail-cases','/api/aggregation/metrics-baseline','/api/aggregation/metric-domain-breakdown'}
    allowed = path in identity or (request.method in ('GET','HEAD') and path in reads | metadata) or (request.method == 'POST' and path in {'/api/aggregation/compare','/api/video/stream/sign'})
    if not allowed:
        raise HTTPException(403, detail=UPGRADE)
    for key in ('function_domain','domain'):
        if any(value and value != DOMAIN for value in request.query_params.getlist(key)):
            raise HTTPException(403, detail=UPGRADE)

def scope_clause(clause, params, domain):
    if not domain:
        return clause, params
    if domain != DOMAIN:
        raise HTTPException(403, detail=UPGRADE)
    return clause + ' AND vr.function_domain = %s', params + [DOMAIN]

def authorize_video(user, path):
    if not is_domain_trial(user):
        return
    from api.services.readonly_db_client import readonly_db
    rows = readonly_db.raw_sql("""SELECT vr.id FROM video_results vr
        WHERE vr.function_domain=%s AND vr.metadata->>'path'=%s
        AND EXISTS (SELECT 1 FROM evaluation_publication_results ep WHERE ep.result_id=vr.id)
        AND vr.metadata->>'status' IS DISTINCT FROM 'failed'
        AND vr.metadata->>'status' IS DISTINCT FROM 'invalid'
        AND COALESCE((vr.metadata->>'needs_review')::boolean,false)=false LIMIT 1""", [DOMAIN,path]).data
    if not rows:
        raise HTTPException(403, detail=UPGRADE)

async def vehicle_snapshot(brand_model, system_version):
    from api.services.readonly_db_client import readonly_db
    from api.services import website_analytics as analytics
    clause, params = analytics._build_version_filter('vr.system_version', system_version)
    rows = readonly_db.raw_sql(f"""SELECT AVG(CASE WHEN vr.metadata->>'response_quality_score' ~ '^[0-9]+([.][0-9]+)?$'
        THEN (vr.metadata->>'response_quality_score')::numeric END) AS score,
        COUNT(*) AS samples, COUNT(DISTINCT vr.case_id) AS cases
        FROM video_results vr WHERE vr.brand_model=%s {clause} AND vr.function_domain=%s
        AND vr.metadata->>'analysis_source' IN ('mimo-v2.5','mimo-split-v1') {analytics.TEST_CASE_LIBRARY_FILTER}""", [brand_model]+params+[DOMAIN]).data
    r = rows[0] if rows else {}; score = float(r['score']) if r.get('score') is not None else None
    criteria = await analytics.get_criteria_by_domain(brand_model=brand_model,system_version=system_version,trial_domain=DOMAIN)
    return dict(brand_model=brand_model,system_version=system_version,last_computed_at=None,
        criteria_scores=[item.model_dump() for item in criteria[0].criteria] if criteria else [],
        function_domain_scores=[dict(dimension_key=DOMAIN,avg_score=score,sample_count=int(r['samples']))] if score is not None else [],
        overall_score=None,overall_domain_count=1,overall_sample_count=int(r.get('samples',0)),
        case_avg_score=score,case_count=int(r.get('cases',0)))

async def vehicle_list():
    from api.services.readonly_db_client import readonly_db
    from api.services.website_analytics import TEST_CASE_LIBRARY_FILTER
    rows = readonly_db.raw_sql(f"""SELECT vr.brand_model,vr.system_version,COUNT(DISTINCT vr.case_id) AS video_count
        FROM video_results vr WHERE vr.function_domain=%s
        AND NULLIF(TRIM(vr.brand_model),'') IS NOT NULL
        AND vr.metadata->>'analysis_source' IN ('mimo-v2.5','mimo-split-v1') {TEST_CASE_LIBRARY_FILTER}
        GROUP BY vr.brand_model,vr.system_version ORDER BY vr.brand_model,vr.system_version""", [DOMAIN]).data
    return [dict(brand_model=r['brand_model'],system_version=r.get('system_version'),video_count=int(r['video_count']),
        pool_total=0,has_cache=True,last_computed_at=None,overall_score=None,case_avg_score=None,capture_date=None) for r in rows]
