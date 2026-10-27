"""Explicit Trial membership: full aggregate scores, travel-only questions and video.

Legacy viewer sampling remains separate. No user records are migrated here.
"""
from fastapi import HTTPException
DOMAIN = '出行域'
UPGRADE = 'membership_upgrade_required'

def is_domain_trial(user):
    return bool(user and user.get('role') != 'admin' and user.get('membership_tier') == 'trial')

def domain_scope(user):
    # Aggregated scores and metrics are available across all domains.
    return None

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
    evidence = path.startswith('/api/video/') or path == '/api/aggregation/vehicle/task-detail-cases'
    if not evidence:
        return
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
