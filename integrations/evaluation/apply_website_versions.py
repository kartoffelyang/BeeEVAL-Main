"""Install website-only V1 visibility on a copy of the deployed Evaluation API."""
from pathlib import Path
import shutil
import sys


def patch(root):
    root = Path(root) / 'api'
    shutil.copyfile(Path(__file__).with_name('website_versions.py'), root/'services/website_versions.py')

    def edit(name, old, new, count=1):
        path = root / name
        text = path.read_text()
        if new in text:
            return
        if text.count(old) != count:
            raise ValueError(f'Unexpected source in {name}: {old!r}')
        text = text.replace(old, new)
        compile(text, str(path), 'exec')
        path.write_text(text)

    edit('main.py', 'def _cors_origins()', "from api.services.website_versions import website_scope, check_thumbnail\n"
         "from starlette.concurrency import run_in_threadpool\napp.middleware('http')(website_scope)\n\n\ndef _cors_origins()")
    edit('main.py', '    local_path = os.path.join(screenshots_dir, filename)',
         '    await run_in_threadpool(check_thumbnail, filename)\n    local_path = os.path.join(screenshots_dir, filename)')
    for name in ('local_db_client', 'readonly_db_client'):
        path = f'services/{name}.py'
        edit(path, '    def _get_connection(self):',
             '    def _get_connection(self):\n'
             '        from api.services.website_versions import scope_connection\n'
             '        conn = self._checkout_connection()\n'
             '        try:\n            return scope_connection(conn)\n'
             '        except Exception:\n            self._put_connection(conn, close=True)\n            raise\n\n'
             '    def _checkout_connection(self):')
    edit('services/benchmark_snapshots.py', '            version = fingerprint()',
         "            from api.services.website_versions import website_read\n"
         "            if website_read.get():\n                scope['website_versions'] = 'exclude-v1'\n"
         "            version = fingerprint()")
    edit('services/benchmark_snapshots.py', '        def watch():', '        def watch():\n            from api.services.website_versions import website_read\n            website_read.set(True)')
    edit('services/benchmark_snapshots.py', "    ready_key = 'warm:' + version",
         "    from api.services.website_versions import website_read\n    ready_key = ('warm:website:' if website_read.get() else 'warm:') + version")
    edit('services/website_preview.py', "return dict(report_version='live-v1',as_of=",
         "return dict(report_version='live-v1',visibility_policy='exclude-v1',as_of=")
    edit('routers/aggregation.py', '    _assert_brand_visible(brand_model, current_user)\n    ver_clause, ver_params = _build_version_filter("system_version", system_version)',
         '    _assert_brand_visible(brand_model, current_user)\n    from api.services.website_versions import check_vehicle_version\n'
         '    check_vehicle_version(brand_model, system_version)\n    ver_clause, ver_params = _build_version_filter("system_version", system_version)')
    edit('services/read_performance.py', 'key = json.dumps([args, kwargs]',
         'from api.services.website_versions import website_read\n            key = json.dumps([website_read.get(), args, kwargs]')
    edit('routers/aggregation.py', '    for planned in PLANNED_VEHICLES:',
         "    from api.services.website_versions import website_read\n"
         "    if website_read.get():\n"
         "        seen_models.update(r['brand_model'] for r in supabase.raw_sql(\n"
         "            'SELECT DISTINCT brand_model FROM beeeval_web.v1_versions').data)\n"
         "    for planned in PLANNED_VEHICLES:")
    edit('services/website_preview.py', 'if item.brand_model not in PUBLIC_MODELS or item.overall_score is None:',
         "if item.eval_version == 'V1' or item.brand_model not in PUBLIC_MODELS or item.overall_score is None:")
    edit('services/trial_domain_access.py', 'def authorize_video(user, path):',
         'def authorize_video(user, path):\n    from api.services.website_versions import exclude_hidden_media\n'
         '    exclude_hidden_media(path)')
    invalid_token = '        raise HTTPException(status_code=401, detail="invalid_or_expired_video_token")'
    for name, count in [('video', 1), ('nas', 2)]:
        edit(f'routers/{name}.py', invalid_token,
             invalid_token+'\n    from api.services.website_versions import check_stream\n    await check_stream(path)', count)


if __name__ == '__main__':
    patch(sys.argv[1])
