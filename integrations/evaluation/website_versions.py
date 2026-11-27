"""Evaluation generation visibility for the BeeEVAL website read surface."""
import re
from contextvars import ContextVar

from fastapi import HTTPException
from starlette.concurrency import run_in_threadpool

website_read = ContextVar('beeeval_website_read', default=False)


async def website_scope(request, call_next):
    path = request.url.path
    applies = path == '/api/public/benchmark-preview' or (
        request.headers.get('x-beeeval-website') == '1' and (
            request.method in ('GET', 'HEAD') or path in ('/api/aggregation/compare', '/api/video/stream/sign')))
    token = website_read.set(applies)
    try:
        return await call_next(request)
    finally:
        website_read.reset(token)


def scope_connection(conn):
    # SET LOCAL disappears on commit/rollback, including before pool reuse.
    if website_read.get():
        with conn.cursor() as cursor:
            cursor.execute('SET LOCAL search_path = pg_catalog, beeeval_web, public')
    return conn


def exclude_hidden_media(path):
    """Honor the website visibility setting for new and already-signed media URLs."""
    if not website_read.get():
        return
    from api.services.readonly_db_client import readonly_db
    # The compact metadata table keeps this check independent of transcript size.
    rows = readonly_db.raw_sql("""
        SELECT EXISTS(SELECT 1 FROM public.beeeval_benchmark_results
                      WHERE metadata->>'path'=%s) AS known,
               EXISTS(SELECT 1 FROM beeeval_web.beeeval_benchmark_results
                      WHERE metadata->>'path'=%s) AS visible
    """, [path, path]).data
    if rows[0]['known'] and not rows[0]['visible']:
        raise HTTPException(404, detail='Video unavailable')


async def check_stream(path):
    if website_read.get():
        await run_in_threadpool(exclude_hidden_media, path)


def check_thumbnail(filename):
    if not website_read.get():
        return
    from api.services.readonly_db_client import readonly_db
    nas = re.fullmatch(r'nas_(.+[.]mp4)_\d+[.]jpg', filename, re.I)
    if nas:
        predicate, value = 'video_name=%s', nas[1]
    else:
        predicate = ("metadata->>'screenshot_path' IS NOT NULL AND "
                     "regexp_replace(metadata->>'screenshot_path','_[0-9]+[.]jpg$','.jpg')=%s")
        value = '/screenshots/' + re.sub(r'_\d+[.]jpg$', '.jpg', filename)
    row = readonly_db.raw_sql(
        f'SELECT EXISTS (SELECT 1 FROM public.video_results WHERE {predicate}) AS known, '
        f'EXISTS (SELECT 1 FROM beeeval_web.video_results WHERE {predicate}) AS visible',
        [value, value]).data[0]
    if row['known'] and not row['visible']:
        raise HTTPException(404, detail='Thumbnail unavailable')


def check_vehicle_version(model, version):
    if not website_read.get():
        return
    from api.services.readonly_db_client import readonly_db
    # A page opened from an old bookmark should explicitly report unavailability.
    hidden = readonly_db.raw_sql("""
        SELECT 1 FROM beeeval_web.v1_versions WHERE brand_model=%s
        AND NULLIF(system_version,'') IS NOT DISTINCT FROM NULLIF(%s,'') LIMIT 1
    """, [model, version]).data
    if hidden:
        raise HTTPException(404, detail='Vehicle evaluation unavailable')
