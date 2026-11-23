"""Install read optimizations against the current API source, preserving live changes.

Only named GET handlers without awaits move to FastAPI's worker thread pool.
Auth, writes, evaluation jobs and video stream handlers are left in place.
"""
import ast
from pathlib import Path
import shutil
import sys

AGGREGATES = {'list_vehicles', 'get_vehicle_acceptance_completion',
              'get_vehicle_task_detail_cases', 'get_metrics_map',
              'get_domains_map', 'get_task_detail_map', 'get_brand_map', 'get_metrics_registry'}
VIDEO_READS = {'get_pk_cases', 'get_pk_detail'}


def optimize_handlers(path, names, cache_names):
    text = path.read_text()
    tree = ast.parse(text)
    lines = text.splitlines(True)
    for node in reversed(tree.body):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) or node.name not in names:
            continue
        if any(isinstance(child, ast.Await) for child in ast.walk(node)):
            raise RuntimeError('Unexpected await in read handler ' + node.name)
        if not any(isinstance(d, ast.Call) and isinstance(d.func, ast.Attribute) and d.func.attr == 'get' for d in node.decorator_list):
            raise RuntimeError('Not a GET handler: ' + node.name)
        at = node.lineno - 1
        lines[at] = lines[at].replace('async def ', 'def ', 1)
        if node.name in cache_names and not any(isinstance(d, ast.Call) and isinstance(d.func, ast.Name) and d.func.id == 'cached_read' for d in node.decorator_list):
            lines.insert(at, '@cached_read(ttl=20)\n')
    result = ''.join(lines)
    if cache_names and 'from api.services.read_performance import cached_read' not in result:
        # Preserve __future__ imports if present.
        tree = ast.parse(result)
        insertion = max([n.end_lineno for n in tree.body if isinstance(n, ast.ImportFrom) and n.module == '__future__'] or [0])
        parts = result.splitlines(True)
        parts.insert(insertion, 'from api.services.read_performance import cached_read\n')
        result = ''.join(parts)
    compile(result, str(path), 'exec')
    path.write_text(result)


def patch(root):
    root = Path(root)
    here = Path(__file__).resolve().parent
    for name in ('read_performance.py', 'paged_case_search.py'):
        shutil.copyfile(here / name, root / 'api/services' / name)
    optimize_handlers(root / 'api/routers/aggregation.py', AGGREGATES, AGGREGATES - {'get_vehicle_task_detail_cases'})
    optimize_handlers(root / 'api/routers/video.py', VIDEO_READS, set())
    path = root / 'api/routers/aggregation.py'
    text = path.read_text()
    if 'from api.services.read_performance import analytics_read' not in text:
        text = 'from api.services.read_performance import analytics_read\nfrom fastapi.concurrency import run_in_threadpool\n' + text
        names = ('get_criteria_by_domain', 'get_vehicle_task_completion', 'get_vehicle_acceptance_task_detail', 'get_metrics_baseline', 'get_metric_domain_breakdown')
        for name in names:
            anchor = 'return await website_analytics.' + name + '('
            assert text.count(anchor) == 1
            text = text.replace(anchor, 'return await run_in_threadpool(analytics_read, ' + repr(name) + ', current_user, ')
        compile(text, str(path), 'exec')
        path.write_text(text)
    path = root / 'api/main.py'
    text = path.read_text()
    anchor = 'app.include_router(video.router)'
    if 'app.include_router(paged_case_search.router)' not in text:
        assert text.count(anchor) == 1
        text = text.replace(anchor, 'from api.services import paged_case_search\napp.include_router(paged_case_search.router)\n' + anchor)
        compile(text, str(path), 'exec')
        path.write_text(text)
    path = root / 'api/services/trial_domain_access.py'
    text = path.read_text()
    if "'/api/video/case-search'" not in text:
        anchor = "reads = {'/api/video/all-results',"
        assert text.count(anchor) == 1
        text = text.replace(anchor, "reads = {'/api/video/case-search','/api/video/all-results',")
        compile(text, str(path), 'exec')
        path.write_text(text)
    path = root / 'api/routers/video.py'
    text = path.read_text()
    if 'await run_in_threadpool(authorize_video, current_user, req.path)' not in text:
        anchor = '    authorize_video(current_user, req.path)'
        assert text.count(anchor) == 1
        text = text.replace(anchor, '    from fastapi.concurrency import run_in_threadpool\n    await run_in_threadpool(authorize_video, current_user, req.path)')
        compile(text, str(path), 'exec')
        path.write_text(text)


if __name__ == '__main__':
    patch(sys.argv[1])
