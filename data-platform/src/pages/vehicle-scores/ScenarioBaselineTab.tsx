import React, { useEffect, useRef, useState } from 'react';
import { Grid3x3, Star } from 'lucide-react';
import clsx from 'clsx';
import { useComparison, parseVehicleKey } from './ComparisonContext';
import { useTranslation } from 'react-i18next';
import { useMetricsTranslation } from '../../hooks/useMetricsTranslation';
import {
    getVehicleAcceptanceCompletion,
    getVehicleAcceptanceTaskDetail,
    type VehicleAcceptanceCompletion,
    type VehicleAcceptanceTaskDetail,
    type AcceptanceGradeStat,
} from '../../api';
import TaskDetailCasesModal from './TaskDetailCasesModal';

// 验收梯度固定顺序（由易到难）。
const GRADES_ORDER = ['基础验收', '中等验收', '进阶验收'];

// 6 个规范功能域展示顺序，与后端 STANDARD_FUNCTION_DOMAINS 一致。
const STANDARD_FUNCTION_DOMAINS = ['车控域', '出行域', '车书域', '娱乐域', '闲聊域', '创作域'];

// 梯度名 → 短标签 i18n 键（表格行头用「基础/中等/进阶」这类短名）。
const GRADE_SHORT_KEY: Record<string, string> = {
    '基础验收': 'baseline_grade_basic',
    '中等验收': 'baseline_grade_medium',
    '进阶验收': 'baseline_grade_advanced',
};

const gradeShort = (grade: string, t: (k: string) => string): string => {
    const key = GRADE_SHORT_KEY[grade];
    if (!key) return grade;
    const r = t(key);
    return r === key ? grade : r;
};

// 把一台车的 by_domain 转成 { 功能域 -> { 梯度 -> stat } }。
const toDomainMap = (d: VehicleAcceptanceCompletion): Record<string, Record<string, AcceptanceGradeStat>> => {
    const m: Record<string, Record<string, AcceptanceGradeStat>> = {};
    for (const x of d.by_domain) m[x.function_domain] = x.grades;
    return m;
};

// 单台车在某功能域下、指定梯度集合的合并完成率（成功数之和 / 已判定数之和）。
// grades 传单个梯度即为该梯度完成率；传全部三梯度即为该域 Avg。
// 无已判定样本返回 null。
const mergedRate = (
    domainGrades: Record<string, AcceptanceGradeStat> | undefined,
    grades: string[],
): number | null => {
    if (!domainGrades) return null;
    let success = 0;
    let judged = 0;
    for (const g of grades) {
        const s = domainGrades[g];
        if (!s) continue;
        success += s.success;
        judged += s.success + s.failed;
    }
    return judged > 0 ? success / judged : null;
};

// 各竞品在同一格的完成率算术平均（跳过 null）。无竞品或全 null 返回 null。
const avgOfRates = (rates: (number | null)[]): number | null => {
    const valid = rates.filter((r): r is number => r != null);
    if (valid.length === 0) return null;
    return valid.reduce((a, b) => a + b, 0) / valid.length;
};

// 完成率 → 色温背景色（按本品值上色，0~1）。红(低)→橙→黄→绿(高) 连续渐变。
// 用实色的 HSL 色相条：色相 0°(红)→140°(绿) 随完成率线性升高，
// 饱和度/明度固定，保证是「颜色变化」而非「深浅变化」，一眼看懂高低。
// 色温红色下限：完成率 ≤30% 一律纯红；30%→100% 走红→黄→绿。
const HEAT_RED_FLOOR = 0.3;
const heatBg = (rate: number | null): string => {
    if (rate == null) return 'transparent';
    const r = Math.max(0, Math.min(1, rate));
    // 把 [0.3, 1] 线性映射到色相 [0(红), 140(绿)]；≤0.3 钳到 0（红）。
    const norm = Math.max(0, (r - HEAT_RED_FLOOR) / (1 - HEAT_RED_FLOOR));
    const hue = norm * 140;          // 0=红, 60=黄, 140=绿
    return `hsl(${hue}, 62%, 42%)`;
};

// 色温格子的文字统一用白色（中低色相偏暗、高色相绿也够深，白字都清晰）。
const heatText = (rate: number | null): string =>
    rate == null ? 'inherit' : '#20221f';

const fmtPct = (rate: number | null): string =>
    rate == null ? '—' : `${(rate * 100).toFixed(0)}%`;

// 完成率差异箭头：本品 - 竞品（百分点）。阈值 3pp 内视为持平。只显示箭头方向，不显示数字。
const DeltaPct: React.FC<{ primary: number | null; other: number | null }> = ({ primary, other }) => {
    if (primary == null || other == null) return <span className="text-text-muted text-xs">—</span>;
    const d = (primary - other) * 100; // 百分点
    const abs = Math.abs(d);
    if (abs < 3) return <span className="text-text-muted text-xs" title="持平">≈</span>;
    const up = d > 0;
    const color = up ? (abs >= 15 ? '#36715a' : '#52795f') : (abs >= 15 ? '#b34840' : '#a17b35');
    return (
        <span className="text-xs font-bold" style={{ color }} title={`本品-竞品 ${d > 0 ? '+' : ''}${d.toFixed(0)}pp`}>
            {up ? '▲' : '▼'}
        </span>
    );
};

// 从某车某域的 task detail 里取指定任务类型的完成率。
const taskRateOf = (dd: VehicleAcceptanceTaskDetail | undefined, grade: string, task: string): number | null => {
    if (!dd) return null;
    const g = dd.by_grade.find(x => x.grade === grade);
    const tk = g?.task_details.find(x => x.task_detail === task);
    return tk ? tk.completion_rate : null;
};

const ScenarioBaselineTab: React.FC = () => {
    const { t } = useTranslation();
    const { td, tt } = useMetricsTranslation();
    const {
        primaryKey,
        competitorKeys,
        allSelectedKeys,
        getVehicleLabel,
    } = useComparison();

    const selectedKeys = allSelectedKeys();
    const selectedSig = selectedKeys.join(',');

    const [dataMap, setDataMap] = useState<Record<string, VehicleAcceptanceCompletion>>({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fetchingRef = useRef<Set<string>>(new Set());

    // 任务类型细分：本品每个功能域的 task_detail 数据（按功能域缓存）。
    const [taskByDomain, setTaskByDomain] = useState<Record<string, VehicleAcceptanceTaskDetail>>({});
    const [taskLoading, setTaskLoading] = useState(false);
    // 竞品（取第一个竞品）的任务类型细分，用于双车对比 + 差异箭头。
    const [compTaskByDomain, setCompTaskByDomain] = useState<Record<string, VehicleAcceptanceTaskDetail>>({});

    // 点击某任务类型后打开的用例弹窗（记录功能域 + 任务类型）。
    const [caseModal, setCaseModal] = useState<{ domain: string; task: string } | null>(null);

    // 本品有数据的功能域列表，保持规范顺序。
    const primaryDomains = React.useMemo(() => {
        const pd = dataMap[primaryKey ?? ''];
        if (!pd) return [];
        const set = new Set<string>();
        for (const x of pd.by_domain) {
            if (Object.values(x.grades).some(s => s.case_count > 0)) set.add(x.function_domain);
        }
        return [
            ...STANDARD_FUNCTION_DOMAINS.filter(d => set.has(d)),
            ...[...set].filter(d => !STANDARD_FUNCTION_DOMAINS.includes(d)),
        ];
    }, [dataMap, primaryKey]);

    // 任务类型细分对比车：取第一个竞品。
    const compTaskKey = competitorKeys[0] ?? null;

    // 本品（+竞品）所有功能域依次拉取任务类型细分（并发），换车后重置。
    const domainsSig = primaryDomains.join(',');
    const fetchTaskDetail = (key: string, doms: string[]) => {
        const { brand_model, system_version } = parseVehicleKey(key);
        return Promise.all(
            doms.map(async dom => {
                try {
                    const d = await getVehicleAcceptanceTaskDetail(brand_model, dom, system_version);
                    return [dom, d] as const;
                } catch {
                    return [dom, null] as const;
                }
            })
        ).then(pairs => {
            const next: Record<string, VehicleAcceptanceTaskDetail> = {};
            for (const [dom, d] of pairs) if (d) next[dom] = d;
            return next;
        });
    };
    useEffect(() => {
        setTaskByDomain({});
        setCompTaskByDomain({});
        if (!primaryKey || primaryDomains.length === 0) return;
        setTaskLoading(true);
        let cancelled = false;
        Promise.all([
            fetchTaskDetail(primaryKey, primaryDomains),
            compTaskKey ? fetchTaskDetail(compTaskKey, primaryDomains) : Promise.resolve({}),
        ])
            .then(([primary, comp]) => {
                if (cancelled) return;
                setTaskByDomain(primary);
                setCompTaskByDomain(comp);
            })
            .finally(() => { if (!cancelled) setTaskLoading(false); });
        return () => { cancelled = true; };
    }, [primaryKey, domainsSig, compTaskKey]);

    useEffect(() => {
        const missing = selectedKeys.filter(k => !dataMap[k] && !fetchingRef.current.has(k));
        if (missing.length === 0) return;
        missing.forEach(k => fetchingRef.current.add(k));
        setLoading(true);
        setError(null);
        Promise.all(
            missing.map(async k => {
                const { brand_model, system_version } = parseVehicleKey(k);
                try {
                    const d = await getVehicleAcceptanceCompletion(brand_model, system_version);
                    return [k, d] as const;
                } catch {
                    return [k, null] as const;
                } finally {
                    fetchingRef.current.delete(k);
                }
            })
        )
            .then(pairs => {
                const next: Record<string, VehicleAcceptanceCompletion> = {};
                for (const [k, d] of pairs) if (d) next[k] = d;
                if (Object.keys(next).length > 0) setDataMap(prev => ({ ...prev, ...next }));
            })
            .catch((e: any) => setError(e?.message || t('baseline_load_failed')))
            .finally(() => setLoading(false));
    }, [selectedSig]);

    if (!primaryKey) {
        return (
            <div className="bg-blue-100 border border-blue-200 text-blue-700 px-4 py-6 rounded-lg text-center">
                {t('select_vehicle_hint')}
            </div>
        );
    }

    const primaryData = dataMap[primaryKey];

    if (loading && !primaryData) {
        return <div className="text-sm text-text-muted px-4 py-6">{t('loading')}</div>;
    }
    if (error && !primaryData) {
        return (
            <div className="bg-rose-100 border border-rose-200 text-rose-700 px-4 py-6 rounded-lg text-center">
                {error}
            </div>
        );
    }
    if (!primaryData) {
        return (
            <div className="bg-blue-100 border border-blue-200 text-blue-700 px-4 py-6 rounded-lg text-center">
                {t('acceptance_no_data')}
            </div>
        );
    }

    // 有数据的竞品（不含本品；本品不计入均值）。
    const competitorsWithData = competitorKeys.filter(k => dataMap[k]);
    const hasCompetitors = competitorsWithData.length > 0;

    const primaryDomainMap = toDomainMap(primaryData);
    const competitorDomainMaps = competitorsWithData.map(k => toDomainMap(dataMap[k]));

    // 参与展示的功能域：本品或任一竞品在该域有样本即列出，保持规范顺序。
    const domainSet = new Set<string>();
    const collect = (dm: Record<string, Record<string, AcceptanceGradeStat>>) => {
        for (const [dom, grades] of Object.entries(dm)) {
            if (Object.values(grades).some(s => s.case_count > 0)) domainSet.add(dom);
        }
    };
    collect(primaryDomainMap);
    competitorDomainMaps.forEach(collect);
    const domains = [
        ...STANDARD_FUNCTION_DOMAINS.filter(d => domainSet.has(d)),
        ...[...domainSet].filter(d => !STANDARD_FUNCTION_DOMAINS.includes(d)),
    ];

    // 行定义：Avg（三梯度合并）+ 各单梯度。
    const rows: Array<{ key: string; label: string; grades: string[] }> = [
        { key: 'avg', label: t('baseline_row_avg'), grades: GRADES_ORDER },
        ...GRADES_ORDER.map(g => ({ key: g, label: gradeShort(g, t), grades: [g] })),
    ];

    // 计算某格的本品率与竞品均值。
    const cellValue = (domain: string, grades: string[]) => {
        const primaryRate = mergedRate(primaryDomainMap[domain], grades);
        const compRates = competitorDomainMaps.map(dm => mergedRate(dm[domain], grades));
        const compAvg = avgOfRates(compRates);
        return { primaryRate, compAvg };
    };

    if (domains.length === 0) {
        return (
            <div className="bg-blue-100 border border-blue-200 text-blue-700 px-4 py-6 rounded-lg text-center">
                {t('acceptance_no_data')}
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* 标题 + 说明 */}
            <div className="flex flex-wrap items-center gap-2">
                <Grid3x3 className="w-5 h-5 text-secondary" />
                <h2 className="text-lg font-bold text-text-primary">{t('baseline_title')}</h2>
            </div>
            <p className="text-xs text-text-muted -mt-1">{t('baseline_desc')}</p>

            {/* 本品 / 竞品均值 说明 */}
            <div className="flex flex-wrap items-center gap-4 text-xs">
                <span className="flex items-center gap-1.5 text-text-secondary">
                    <Star className="w-3.5 h-3.5 text-amber-700" />
                    {t('baseline_primary')}：{getVehicleLabel(primaryKey)}
                </span>
                <span className="text-text-muted">
                    {hasCompetitors
                        ? t('baseline_legend', { count: competitorsWithData.length })
                        : t('baseline_no_competitor')}
                </span>
                {/* 色温刻度：低→高 = 红→黄→绿 */}
                <span className="flex items-center gap-2 text-text-muted">
                    <span>0%</span>
                    <span
                        className="h-2.5 w-28 rounded-full"
                        style={{
                            background: `linear-gradient(to right, ${heatBg(0)}, ${heatBg(0.25)}, ${heatBg(0.5)}, ${heatBg(0.75)}, ${heatBg(1)})`,
                        }}
                    />
                    <span>100%</span>
                </span>
            </div>

            {/* 热力图表格 */}
            <div className="overflow-x-auto rounded-xl border border-ink/[0.08]">
                <table className="w-full border-collapse text-sm">
                    <thead>
                        <tr className="bg-surface-raised">
                            <th className="sticky left-0 z-10 bg-surface-raised px-4 py-3 text-left font-semibold text-text-secondary border-b border-r border-ink/[0.08] min-w-[96px]">
                                <div>{t('baseline_scene')}</div>
                                <div className="text-[10px] font-normal text-text-muted mt-0.5">
                                    {hasCompetitors ? t('baseline_cell_hint') : t('baseline_cell_hint_solo')}
                                </div>
                            </th>
                            {domains.map(d => (
                                <th key={d} className="px-4 py-3 text-center font-semibold text-text-primary border-b border-ink/[0.08] min-w-[120px]">
                                    {td(d)}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(row => (
                            <tr key={row.key} className={clsx(row.key === 'avg' && 'font-semibold')}>
                                <td className="sticky left-0 z-10 bg-surface px-4 py-3 text-left text-text-secondary border-b border-r border-ink/[0.08]">
                                    {row.label}
                                </td>
                                {domains.map(d => {
                                    const { primaryRate, compAvg } = cellValue(d, row.grades);
                                    return (
                                        <td
                                            key={d}
                                            className="px-4 py-3 text-center border-b border-ink/[0.06] tabular-nums"
                                            style={{ backgroundColor: heatBg(primaryRate), color: heatText(primaryRate) }}
                                            title={`${td(d)} · ${row.label}\n${t('baseline_primary')}: ${fmtPct(primaryRate)}${hasCompetitors ? `\n${t('baseline_comp_avg')}: ${fmtPct(compAvg)}` : ''}`}
                                        >
                                            <span className="font-semibold">{fmtPct(primaryRate)}</span>
                                            {hasCompetitors && (
                                                <span className={primaryRate == null ? 'text-text-muted' : 'text-text-primary/70'}> / {fmtPct(compAvg)}</span>
                                            )}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* 各功能域依次展示：每域内三梯度按任务类型细分的完成率（仅本品） */}
            <div className="bg-surface-raised p-5 rounded-xl border border-ink/[0.08] shadow-sm space-y-6">
                <h3 className="font-bold text-text-primary flex items-center gap-2 flex-wrap">
                    {t('baseline_task_title')}
                    <span className="text-xs font-normal text-text-muted inline-flex items-center gap-1">
                        <Star className="w-3 h-3 text-amber-700" />{getVehicleLabel(primaryKey)}
                    </span>
                    {compTaskKey && (
                        <span className="text-xs font-normal text-emerald-700/80">vs {getVehicleLabel(compTaskKey)}</span>
                    )}
                </h3>

                {taskLoading && Object.keys(taskByDomain).length === 0 ? (
                    <div className="text-sm text-text-muted py-4">{t('loading')}</div>
                ) : primaryDomains.every(d => {
                    const dd = taskByDomain[d];
                    return !dd || dd.by_grade.every(g => g.task_details.length === 0);
                }) ? (
                    <div className="text-sm text-text-muted py-4">{t('acceptance_no_data')}</div>
                ) : (
                    primaryDomains.map(domain => {
                        const dd = taskByDomain[domain];
                        const cdd = compTaskByDomain[domain];
                        if (!dd || dd.by_grade.every(g => g.task_details.length === 0)) return null;
                        return (
                            <div key={domain} className="space-y-3">
                                {/* 功能域标题 */}
                                <div className="text-sm font-semibold text-text-secondary border-l-2 border-secondary pl-2">
                                    {td(domain)}
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {dd.by_grade.map(group => {
                                        const compGrade = cdd?.by_grade.find(x => x.grade === group.grade);
                                        const compGradeRate = compGrade?.grade_stat.completion_rate ?? null;
                                        return (
                                        <div key={group.grade} className="rounded-lg border border-ink/[0.08] overflow-hidden">
                                            {/* 梯度小标题：基础 80% (竞品 + 箭头) */}
                                            <div
                                                className="px-4 py-2.5 flex items-center justify-between gap-2"
                                                style={{ backgroundColor: heatBg(group.grade_stat.completion_rate), color: heatText(group.grade_stat.completion_rate) }}
                                            >
                                                <span className="font-semibold">{gradeShort(group.grade, t)}</span>
                                                <span className="flex items-center gap-2">
                                                    {compTaskKey && <DeltaPct primary={group.grade_stat.completion_rate} other={compGradeRate} />}
                                                    <span className="font-bold tabular-nums">{fmtPct(group.grade_stat.completion_rate)}</span>
                                                    {compTaskKey && (
                                                        <span className="text-xs tabular-nums opacity-70">/ {fmtPct(compGradeRate)}</span>
                                                    )}
                                                </span>
                                            </div>
                                            {/* 任务类型列表 */}
                                            <div className="divide-y divide-ink/[0.06]">
                                                {group.task_details.length === 0 ? (
                                                    <div className="px-4 py-3 text-xs text-text-muted">{t('no_data_hint')}</div>
                                                ) : (
                                                    group.task_details.map(tk => {
                                                        const compRate = taskRateOf(cdd, group.grade, tk.task_detail);
                                                        return (
                                                        <button
                                                            key={tk.task_detail}
                                                            onClick={() => setCaseModal({ domain, task: tk.task_detail })}
                                                            className="w-full px-4 py-2.5 flex items-center justify-between gap-2 text-left hover:bg-ink/[0.04] transition-colors cursor-pointer group/task"
                                                            title={`${tt(tk.task_detail)}\n${t('baseline_primary')}: ${fmtPct(tk.completion_rate)}${compTaskKey ? `\n${t('baseline_comp_avg')}: ${fmtPct(compRate)}` : ''}\n${t('baseline_view_cases')}`}
                                                        >
                                                            <span className="text-sm text-text-secondary truncate flex-1 group-hover/task:text-text-primary transition-colors">{tt(tk.task_detail)}</span>
                                                            {compTaskKey && <DeltaPct primary={tk.completion_rate} other={compRate} />}
                                                            <span
                                                                className="text-sm font-semibold tabular-nums shrink-0 px-2 py-0.5 rounded"
                                                                style={{ backgroundColor: heatBg(tk.completion_rate), color: heatText(tk.completion_rate) }}
                                                            >
                                                                {fmtPct(tk.completion_rate)}
                                                            </span>
                                                            {compTaskKey && (
                                                                <span className="text-xs text-text-muted tabular-nums shrink-0 w-9 text-right">{fmtPct(compRate)}</span>
                                                            )}
                                                        </button>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* 用例弹窗：左侧该任务下所有用例，右侧复用用例详情卡片 */}
            {caseModal && primaryKey && (() => {
                const { brand_model, system_version } = parseVehicleKey(primaryKey);
                return (
                    <TaskDetailCasesModal
                        brandModel={brand_model}
                        systemVersion={system_version}
                        functionDomain={caseModal.domain}
                        taskDetail={caseModal.task}
                        vehicleLabel={getVehicleLabel(primaryKey)}
                        onClose={() => setCaseModal(null)}
                    />
                );
            })()}
        </div>
    );
};

export default ScenarioBaselineTab;
