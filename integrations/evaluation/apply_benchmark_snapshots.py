"""Install durable snapshots on a copy of the CURRENT evaluation API source."""
import ast
from pathlib import Path
import shutil
import sys


def decorate(path, functions):
    text = path.read_text()
    lines = text.splitlines(True)
    found = set()
    for node in reversed(ast.parse(text).body):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) or node.name not in functions:
            continue
        found.add(node.name)
        if any(isinstance(d, ast.Call) and isinstance(d.func, ast.Name) and d.func.id == 'snapshot_read' for d in node.decorator_list):
            continue
        for decorator in node.decorator_list:
            if isinstance(decorator, ast.Call) and isinstance(decorator.func, ast.Name) and decorator.func.id == 'cached_read':
                assert decorator.end_lineno == decorator.lineno
                lines[decorator.lineno-1] = ''
        schema = functions[node.name]
        namespace = path.stem + '.' + node.name
        lines.insert(node.lineno-1, '@snapshot_read(' + repr(namespace) + (', schema=' + schema if schema else '') + ')\n')
    assert found == set(functions), 'Missing snapshot targets: ' + repr(set(functions)-found)
    result = ''.join(lines)
    if 'from api.services.benchmark_snapshots import snapshot_read' not in result:
        parts = result.splitlines(True)
        tree = ast.parse(result)
        insertion = max([n.end_lineno for n in tree.body if isinstance(n, ast.ImportFrom) and n.module == '__future__'] or [0])
        parts.insert(insertion, 'from api.services.benchmark_snapshots import snapshot_read\n')
        result = ''.join(parts)
    compile(result, str(path), 'exec')
    path.write_text(result)


def patch(root):
    root = Path(root)
    here = Path(__file__).resolve().parent
    shutil.copyfile(here / 'benchmark_snapshots.py', root / 'api/services/benchmark_snapshots.py')
    decorate(root / 'api/routers/aggregation.py', {
        'list_vehicles': 'List[VehicleListItem]',
        'get_vehicle_scores': 'VehicleScoreSnapshot',
        'all_vehicle_scores': 'List[VehicleScoreSnapshot]',
        'get_vehicle_acceptance_completion': None,
    })
    decorate(root / 'api/services/website_analytics.py', {
        'get_criteria_by_domain': 'List[DomainCriteriaItem]',
        'get_vehicle_task_completion': None,
        'get_vehicle_acceptance_task_detail': None,
        'get_metrics_baseline': None,
        'get_metric_domain_breakdown': None,
    })
    # Do not allow the former identity-specific 20s cache to hide a new revision.
    path = root / 'api/services/read_performance.py'
    text = path.read_text()
    text = text.replace('@cached_read(ttl=20)\ndef analytics_read(', 'def analytics_read(')
    compile(text, str(path), 'exec')
    path.write_text(text)
    path = root / 'api/main.py'
    text = path.read_text()
    if 'async def _prepare_benchmark_snapshots' not in text:
        text += '''\n\n@app.on_event("startup")
async def _prepare_benchmark_snapshots():
    from api.services.benchmark_snapshots import start_prewarm_worker
    start_prewarm_worker()


@app.on_event("shutdown")
async def _stop_benchmark_snapshots():
    from api.services.benchmark_snapshots import stop_prewarm_worker
    stop_prewarm_worker()
'''
        compile(text, str(path), 'exec')
        path.write_text(text)


if __name__ == '__main__':
    patch(sys.argv[1])
