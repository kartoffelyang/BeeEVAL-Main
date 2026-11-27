"""Read-only integration check. Run inside the patched Evaluation API image."""
import asyncio
from fastapi import HTTPException
from api.services.local_db_client import supabase
from api.services.readonly_db_client import readonly_db
from api.services.website_versions import website_read, exclude_hidden_media
from api.services import website_preview
from api.routers import aggregation, video

admin = {"role": "admin"}
get = lambda name, **kw: asyncio.run(getattr(aggregation, name)(current_user=admin, **kw))
inventory = lambda: aggregation.list_vehicles(current_user=admin)
pair = lambda v: (v.brand_model, v.system_version)
baseline = inventory()
hidden = {pair(v) for v in baseline if v.eval_version == 'V1'}
visible = {pair(v) for v in baseline if v.has_cache and v.eval_version != 'V1'}
assert hidden and visible
sample = supabase.raw_sql("""SELECT vr.metadata->>'path' AS path FROM beeeval_benchmark_results vr
    JOIN beeeval_web.v1_versions h USING (brand_model, system_version)
    WHERE vr.metadata->>'path' IS NOT NULL LIMIT 1""").data[0]['path']
token = website_read.set(True)
try:
    for client in (supabase, readonly_db):
        assert client.raw_sql("SELECT 'video_results'::regclass::oid='beeeval_web.video_results'::regclass::oid AS ok").data[0]['ok']
    shown = inventory()
    assert hidden.isdisjoint(map(pair, shown))
    assert visible == {pair(v) for v in shown if v.has_cache}
    scores = get('all_vehicle_scores')
    assert hidden.isdisjoint(map(pair, scores)) and visible <= {pair(v) for v in scores}
    for model, version in hidden:
        try:
            get('get_vehicle_scores', brand_model=model, system_version=version)
        except HTTPException as exc:
            assert exc.status_code == 404
        else:
            raise AssertionError('Hidden profile returned')
        result = video.get_all_results(brand_model=model, system_version=version, current_user=admin)
        assert not result['data'] and result['total']==0
    try:
        exclude_hidden_media(sample)
    except HTTPException as exc:
        assert exc.status_code == 404
    else:
        raise AssertionError('Hidden video still available')
    p = website_preview.benchmark_preview()
    assert p['visibility_policy']=='exclude-v1'
    assert all((v['name'],v['version']) in visible for v in p['statistics']['vehicles'])
    assert all(s['vehicles']<=len(p['statistics']['vehicles']) for s in p['statistics']['scenarios'])
    print('website: hidden=%s visible_scored=%s homepage=%s' % (len(hidden),len(visible),len(p['statistics']['vehicles'])))
finally:
    website_read.reset(token)
for client in (supabase, readonly_db):
    assert client.raw_sql("SELECT 'video_results'::regclass::oid='public.video_results'::regclass::oid AS ok").data[0]['ok']
assert hidden <= {pair(v) for v in inventory()}
print('PASS: inventory, aggregate scores, direct evidence, original records and connection reuse')
