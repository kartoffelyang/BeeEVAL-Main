"""Live, authorized case pagination. A first page never downloads the full bank.

Facets are a separate optional read so taxonomy scans cannot block visible cases.
Actual evidence remains in the existing per-result endpoint and signing flow.
"""
import json
import re
import unicodedata
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from api.auth.deps import require_user
from api.services.supabase_client import supabase
from api.services.test_case_tag_service import test_case_tag_service
from api.services.trial_domain_access import is_domain_trial, DOMAIN, UPGRADE
from api.services.trial_policy import is_trial_user, TRIAL_VISIBLE_BRAND_MODELS, TRIAL_VISIBLE_CASE_IDS
from api.services.read_performance import cached_read

router = APIRouter(prefix='/api/video', tags=['video'])
FIELDS = ('user_question', 'system_response', 'dialogue', 'summary', 'content',
          'task_detail', 'task_family', 'intent_label', 'labels', 'case_tags', 'scenario_tags')
INVALID_MODELS = ['-', '—', '–', 'null', 'undefined', 'none', 'n/a', 'unknown', '未知', '未知车型', '车型未提供', '未提供']


def normalize(value):
    return ''.join(c for c in unicodedata.normalize('NFKC', str(value or '')).lower()
                   if not c.isspace() and not unicodedata.category(c).startswith(('P', 'Z')))


def classification(row):
    meta = row.get('metadata') or {}
    tag = test_case_tag_service.get_tags(row.get('case_id')) or {}
    return {key: row.get(key) or meta.get(key) or tag.get(key) or '未分类'
            for key in ('task_detail', 'acceptance_tag')}


def base_scope(user, filters):
    where = ["NULLIF(BTRIM(vr.brand_model), '') IS NOT NULL", "LOWER(BTRIM(vr.brand_model)) <> ALL(%s)"]
    params = [INVALID_MODELS]
    if user.get('role') not in ('admin', 'analyst'):
        where.append('EXISTS (SELECT 1 FROM evaluation_publication_results ep WHERE ep.result_id=vr.id)')
    domain = filters.get('function_domain')
    if is_domain_trial(user):
        if domain and domain != DOMAIN:
            raise HTTPException(403, detail=UPGRADE)
        filters = {**filters, 'function_domain': DOMAIN}
    legacy = is_trial_user(user)
    if legacy:
        where.append('vr.brand_model = ANY(%s)')
        params.append(list(TRIAL_VISIBLE_BRAND_MODELS))
    for key in ('brand_model', 'system_version', 'function_domain', 'case_id', 'video_name'):
        if filters.get(key):
            where.append('vr.' + key + ' = %s')
            params.append(filters[key])
    if filters.get('status'):
        where.append("vr.metadata->>'status' = %s")
        params.append(filters['status'])
    elif not filters.get('include_failed'):
        where.extend(["vr.metadata->>'status' IS DISTINCT FROM 'failed'", "vr.metadata->>'status' IS DISTINCT FROM 'invalid'"])
    if filters.get('exclude_review'):
        where.append("COALESCE((vr.metadata->>'needs_review')::boolean, false) = false")
    return where, params, legacy


@cached_read(ttl=30, max_entries=64)
def facets(user, filters):
    # Same live publication and membership scope as the rows. No global/shared bank.
    scoped = {k: v for k, v in filters.items() if k in ('brand_model', 'system_version', 'function_domain', 'status', 'include_failed', 'exclude_review')}
    where, values, legacy = base_scope(user, scoped)
    if legacy:
        where.append('vr.case_id = ANY(%s)')
        values.append(list(TRIAL_VISIBLE_CASE_IDS))
    rows = supabase.raw_sql("SELECT DISTINCT vr.case_id, cs.task_detail, cs.acceptance_tag FROM video_results vr LEFT JOIN video_case_search_text cs ON cs.result_id=vr.id WHERE " + ' AND '.join(where), values).data
    tags = [classification(row) for row in rows]
    return {out: sorted({tag[key] for tag in tags}) for out, key in [('task_types', 'task_detail'), ('difficulties', 'acceptance_tag')]}


@router.get('/case-search')
def case_search(
    offset: int = Query(0, ge=0), limit: int = Query(30, ge=1, le=100),
    brand_model: Optional[str] = None, system_version: Optional[str] = None,
    function_domain: Optional[str] = None, case_id: Optional[str] = None,
    video_name: Optional[str] = None, search: Optional[str] = Query(None, max_length=500),
    task_detail: Optional[str] = None, acceptance_tag: Optional[str] = None,
    min_score: Optional[float] = None, max_score: Optional[float] = None,
    max_score_exclusive: bool = False, exclude_review: bool = True,
    include_failed: bool = False, status: Optional[str] = None,
    sort_by: str = 'case_id', sort_order: str = 'asc', facets_only: bool = False,
    group_by_case: bool = False, current_user: dict = Depends(require_user()),
):
    filters = dict(brand_model=brand_model, system_version=system_version, function_domain=function_domain,
                   case_id=case_id, video_name=video_name, exclude_review=exclude_review,
                   include_failed=include_failed, status=status)
    if facets_only:
        return {'facets': facets(current_user, filters)}
    where, values, legacy = base_scope(current_user, filters)
    tags = test_case_tag_service.tags
    for key, value in [('task_detail', task_detail), ('acceptance_tag', acceptance_tag)]:
        if value:
            tag_map = {cid: tag.get(key) for cid, tag in tags.items() if tag.get(key)}
            where.append("COALESCE(NULLIF(cs." + key + ", ''), %s::jsonb->>vr.case_id, '未分类') = %s")
            values.extend([json.dumps(tag_map, ensure_ascii=False), value])
    for bound, comparator in [(min_score, '>='), (max_score, '<' if max_score_exclusive else '<=')]:
        if bound is not None:
            where.append("CASE WHEN vr.metadata->>'response_quality_score' ~ '^[0-9]+([.][0-9]+)?$' THEN (vr.metadata->>'response_quality_score')::numeric END " + comparator + ' %s')
            values.append(bound)
    terms = [normalize(term) for term in (search or '').split() if normalize(term)]
    search_join = ' LEFT JOIN video_case_search_text cs ON cs.result_id=vr.id' if terms or task_detail or acceptance_tag else ''
    if legacy and (terms or task_detail or acceptance_tag or min_score is not None or max_score is not None):
        where.append('vr.case_id = ANY(%s)')
        values.append(list(TRIAL_VISIBLE_CASE_IDS))
    if terms:
        # Flatten only the same case-content fields used by the former JS index.
        # Canonical questions are looked up from the server's authoritative taxonomy.
        # The synchronous trigger and pre-release backfill guarantee a projection
        # for every visible source row in the same transaction/snapshot. Keeping
        # metadata out of the predicate permits an index-only eligibility scan.
        text = 'cs.content'
        for term in terms:
            official_ids = [cid for cid, tag in tags.items() if term in normalize(tag.get('content'))]
            # POSITION treats %, _ and backslashes as literal content, not SQL wildcards.
            where.append('(POSITION(%s IN ' + text + ') > 0 OR vr.case_id = ANY(%s))')
            values.extend([term, official_ids])
    clause = ' WHERE ' + ' AND '.join(where)
    field = 'created_at' if sort_by == 'created_at' else 'case_id'
    direction = 'DESC' if sort_order == 'desc' else 'ASC'
    columns = ','.join("'" + key + "',vr.metadata->'" + key + "'" for key in FIELDS + ('task_success', 'response_quality_score'))
    # One SQL statement gives count and rows the same MVCC snapshot while evaluation
    # jobs are publishing/updating records. No fragile 70-page index rebuild.
    sql = f"""WITH filtered AS NOT MATERIALIZED (SELECT vr.id, vr.case_id, vr.video_name,
        vr.brand_model, vr.system_version, vr.function_domain, vr.created_at, vr.metadata
        FROM video_results vr{search_join} {clause}), page AS MATERIALIZED (
        SELECT * FROM filtered vr ORDER BY vr.{field} {direction} NULLS LAST, vr.id DESC LIMIT %s OFFSET %s), cards AS (
        SELECT vr.id,vr.case_id,vr.video_name,vr.brand_model,vr.system_version,vr.function_domain,vr.created_at,
        jsonb_strip_nulls(jsonb_build_object({columns})) AS metadata, TRUE AS _index_only
        FROM page vr ORDER BY vr.{field} {direction} NULLS LAST, vr.id DESC)
        SELECT (SELECT COUNT(*) FROM filtered) AS total,
        COALESCE((SELECT json_agg(cards) FROM cards), '[]'::json) AS data"""
    if group_by_case:
        # Select complete case groups after all visibility and search filters. Fetch
        # only the fields the picker displays; full evidence is read on selection.
        sql = f"""WITH filtered AS MATERIALIZED (
            SELECT vr.id, COALESCE(NULLIF(vr.case_id, ''), vr.id::text) AS group_key,
                   NULLIF(vr.case_id, '') IS NULL AS unassigned
            FROM video_results vr{search_join}{clause}
        ), groups AS MATERIALIZED (
            SELECT DISTINCT unassigned, group_key FROM filtered
        ), page AS (
            SELECT * FROM groups ORDER BY unassigned, group_key {direction} LIMIT %s OFFSET %s
        ), cards AS (
            SELECT f.unassigned, f.group_key, vr.id, vr.case_id, vr.brand_model, vr.system_version,
                   vr.function_domain, vr.video_name, jsonb_strip_nulls(jsonb_build_object(
                       'user_question', vr.metadata->'user_question',
                       'task_success', vr.metadata->'task_success',
                       'response_quality_score', vr.metadata->'response_quality_score')) AS metadata
            FROM page JOIN filtered f USING (unassigned, group_key) JOIN video_results vr ON vr.id=f.id
        )
        SELECT (SELECT COUNT(*) FROM filtered) AS total, (SELECT COUNT(*) FROM groups) AS total_cases,
               COALESCE((SELECT jsonb_agg(to_jsonb(c) - 'group_key' - 'unassigned'
                   ORDER BY unassigned, group_key {direction}, brand_model, system_version, id DESC)
                   FROM cards c), '[]'::jsonb) AS data"""
    result = supabase.raw_sql(sql, values + [limit, offset]).data[0]
    rows = result.get('data') or []
    for row in rows:
        if legacy and str(row.get('case_id')) not in set(TRIAL_VISIBLE_CASE_IDS):
            for key in list(row):
                if key not in ('id', 'case_id', 'brand_model', 'system_version', 'function_domain', 'created_at'):
                    row.pop(key, None)
            row.update(_locked=True, metadata={}, evaluation_scores=[])
        else:
            row.update(classification(row))
            row['case_definition'] = test_case_tag_service.get_content(row.get('case_id'))
    response = {'data': rows, 'total': result['total'], 'offset': offset, 'limit': limit}
    if group_by_case:
        response['total_cases'] = result['total_cases']
    return response
