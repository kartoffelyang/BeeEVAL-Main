"""Public homepage aggregates for the existing seven-model preview, never evidence."""
import asyncio
from collections import defaultdict
from datetime import datetime, timezone
from statistics import median

from fastapi import APIRouter
from api.services.benchmark_snapshots import snapshot_read

router = APIRouter(prefix='/api/public', tags=['Website preview'])
PUBLIC_MODELS = ('吉利银河M9', '小米Yu7', '极氪9X', '理想L9 Livis', '萤火虫', '蔚来ET5', '问界M9')
SAMPLE_METRICS = {'文化伦理','安全性','交通知识','汽车知识','用车技巧','直接指令识别','复杂指令识别',
    '模糊意图识别','通识知识','跨语言理解能力','语言推理能力','自然语言理解（NLU）准确率',
    '回答质量','图像生成质量','模态丰富性','情感响应能力','人设鲜明度','表达拟人度',
    '上下文记忆','信息架构与呈现','出行生态信息','生活生态信息','在线搜索',
    '跨域协作能力','信息提取能力','决策可解释性'}


def merge_tasks(detail):
    tasks = {}
    for grade in detail['by_grade']:
        for row in grade['task_details']:
            task = tasks.setdefault(row['task_detail'], dict(success=0, failed=0, unknown=0, n=0, score_sum=0, score_count=0))
            for key in ('success','failed','unknown'):
                task[key] += row.get(key, 0)
            task['n'] += row.get('case_count', 0)
            if row.get('score') is not None:
                task['score_sum'] += row['score'] * row.get('score_count', 0)
                task['score_count'] += row.get('score_count', 0)
    return tasks


@router.get('/benchmark-preview')
@snapshot_read('website.public_benchmark_preview')
def benchmark_preview():
    from api.routers import aggregation
    from api.services import website_analytics
    from api.core.constants import STANDARD_FUNCTION_DOMAINS

    # Reuse published/stored scoring reads, then explicitly project public fields.
    # There is no caller-controlled model/query parameter or raw-evidence access.
    snapshots = asyncio.run(aggregation.all_vehicle_scores(current_user={'role':'admin'}))
    latest = {}
    for item in snapshots:
        if item.eval_version == 'V1' or item.brand_model not in PUBLIC_MODELS or item.overall_score is None:
            continue
        previous = latest.get(item.brand_model)
        if previous is None or (item.last_computed_at or '') > (previous.last_computed_at or ''):
            latest[item.brand_model] = item
    registry = {row['name']: row['category'] for row in aggregation.get_metrics_registry()}
    vehicles, scenarios, sample_scenes = [], defaultdict(list), []
    sample_name = '极氪9X' if '极氪9X' in latest else next(iter(latest), None)
    sample_metrics = []
    for name in PUBLIC_MODELS:
        item = latest.get(name)
        if item is None:
            continue
        vehicles.append(dict(name=name, version=item.system_version,
            overall=dict(overall_score=item.overall_score, domain_count=sum(d.dimension_key in STANDARD_FUNCTION_DOMAINS for d in item.function_domain_scores),
                         sample_count=item.overall_sample_count, computed_at=item.last_computed_at,
                         scoring_version=item.scoring_version, eval_version=item.eval_version),
            domains={d.dimension_key:dict(key=d.dimension_key,avg_score=d.avg_score,sample_count=d.sample_count)
                     for d in item.function_domain_scores if d.dimension_key in STANDARD_FUNCTION_DOMAINS},
            criteria={m.dimension_key:dict(key=m.dimension_key,avg_score=m.avg_score,sample_count=m.sample_count)
                      for m in item.criteria_scores}))
        if name == sample_name:
            for metric in item.criteria_scores:
                if metric.dimension_key in SAMPLE_METRICS:
                    category = (registry.get(metric.dimension_key) or '其它').split('/')[-1].strip()
                    sample_metrics.append(dict(name=metric.dimension_key,category=category,value=metric.avg_score,
                                               sample_count=metric.sample_count))
        for domain in STANDARD_FUNCTION_DOMAINS:
            detail = asyncio.run(website_analytics.get_vehicle_acceptance_task_detail(
                brand_model=name,system_version=item.system_version,function_domain=domain,trial_domain=None))
            for task_name, task in merge_tasks(detail).items():
                judged = task['success'] + task['failed']
                if not judged:
                    continue
                score = task['score_sum']/task['score_count'] if task['score_count'] else None
                row = dict(domain=domain,task=task_name,success=task['success'],failed=task['failed'],
                           completion=task['success']/judged,n=task['n'],score=score)
                scenarios[(domain,task_name)].append(row)
                if name == sample_name:
                    sample_scenes.append({k:row[k] for k in ('domain','task','success','failed','completion','n')})
    as_of = max((v['overall']['computed_at'] or '' for v in vehicles),default='')[:10]
    return dict(report_version='live-v1',visibility_policy='exclude-v1',as_of=as_of,generated_at=datetime.now(timezone.utc).isoformat(),
        source='BeeEVAL published scoring snapshots',score_scale=[1,5],
        statistics=dict(vehicles=vehicles,sample_count=sum(v['overall']['sample_count'] or 0 for v in vehicles),
            scenarios=[dict(domain=domain,task=task,vehicles=len(rows),sample_count=sum(r['n'] for r in rows),
                            completion_median=median(r['completion'] for r in rows),
                            score_median=median(scores) if (scores:=[r['score'] for r in rows if r['score'] is not None]) else None)
                       for (domain,task),rows in sorted(scenarios.items())]),
        anonymous=dict(as_of=(latest[sample_name].last_computed_at or '')[:10] if sample_name else '',
                       sample='匿名样本 A',metrics=sample_metrics,scenes=sample_scenes))
