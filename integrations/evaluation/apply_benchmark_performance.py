"""Patch only named benchmark reads, preserving SQL, score and access semantics."""
import ast
import re
from pathlib import Path
import sys


def replace_reads(path, names):
    text = path.read_text()
    lines = text.splitlines(True)
    for node in reversed(ast.parse(text).body):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) or node.name not in names:
            continue
        segment = ''.join(lines[node.lineno-1:node.end_lineno])
        segment = re.sub(r'\bvideo_results\s+vr\b', 'beeeval_benchmark_results vr', segment)
        lines[node.lineno-1:node.end_lineno] = [segment]
    result = ''.join(lines)
    compile(result, str(path), 'exec')
    path.write_text(result)


def patch(root):
    root = Path(root)
    replace_reads(root/'api/routers/aggregation.py', {'list_vehicles', 'get_vehicle_acceptance_completion'})
    replace_reads(root/'api/services/website_analytics.py', {
        'get_criteria_by_domain','get_vehicle_task_completion','get_vehicle_acceptance_task_detail',
        'get_metrics_baseline','get_metric_domain_breakdown'})
    replace_reads(root/'api/routers/video.py', {'get_pk_cases'})
    path = root/'api/routers/video.py'
    text = path.read_text()
    anchor = "'response_quality_score', vr.metadata->'response_quality_score'"
    if "'path', vr.metadata->'path', 'screenshot_path'" not in text:
        assert text.count(anchor) == 1
        text = text.replace(anchor, anchor + ", 'path', vr.metadata->'path', 'screenshot_path', vr.metadata->'screenshot_path'")
        compile(text, str(path), 'exec')
        path.write_text(text)


if __name__ == '__main__':
    patch(sys.argv[1])
