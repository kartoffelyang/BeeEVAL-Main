import {useTrialAccess, TRIAL_DOMAIN} from "../../contexts/TrialContext";
import React, { useEffect, useMemo, useState } from 'react';
import { Trophy, Layers, Car, Clock, Film, Star, CheckCircle2 } from 'lucide-react';
import clsx from 'clsx';
import { useComparison, parseVehicleKey } from './ComparisonContext';
import MetricDomainModal from './MetricDomainModal';
import { useTranslation } from 'react-i18next';
import {
    getCriteriaByDomain,
    getMetricsRegistry,
    getVehicleTaskCompletion,
    getVehicleMetricsBaseline,
    type DimensionScore,
    type DomainCriteriaItem,
    type MetricRegistryItem,
    type VehicleTaskCompletion,
    type CoreMetricBaseline,
} from '../../api';
import { useMetricsTranslation } from '../../hooks/useMetricsTranslation';
import { formatMetricValue } from '../../utils/formatMetricValue';

// 6 个规范功能域，与后端 STANDARD_FUNCTION_DOMAINS 一致。
const STANDARD_FUNCTION_DOMAINS = ['车控域', '出行域', '车书域', '娱乐域', '闲聊域', '创作域'];

// ── 分值 → 颜色：1 分红、3 分黄、5 分绿，连续渐变（HSL 色相 0→130）。──
// 足球经理风格：用颜色表达高低，数字保留 1 位小数。
const scoreHsl = (score: number): string => {
    const s = Math.max(1, Math.min(5, score));
    const hue = ((s - 1) / 4) * 130; // 1→0(红) 3→65(黄) 5→130(绿)
    return `hsl(${hue}, 34%, 34%)`;
};
const scoreText = (score: number | null | undefined): string => {
    if (score == null) return '#64748b';
    return scoreHsl(score);
};

// ── 差异 → 箭头颜色/方向：本品 - 竞品。──
// 阈值（5 分制）：|d|<0.15 视为持平（灰 -）；否则按幅度分级。
const DELTA_EPS = 0.15;
const DELTA_BIG = 0.5;
type DeltaKind = 'flat' | 'up-small' | 'up-big' | 'down-small' | 'down-big';
const deltaKind = (d: number, eps: number = DELTA_EPS, big: number = DELTA_BIG): DeltaKind => {
    if (Math.abs(d) < eps) return 'flat';
    if (d >= big) return 'up-big';
    if (d > 0) return 'up-small';
    if (d <= -big) return 'down-big';
    return 'down-small';
};
// 好很多=绿，好一点=浅绿，差不多=灰，差一点=黄，差很多=红。
const DELTA_COLOR: Record<DeltaKind, string> = {
    'up-big': '#36715a',
    'up-small': '#52795f',
    'flat': '#64748b',
    'down-small': '#a17b35',
    'down-big': '#b34840',
};
const DeltaArrow: React.FC<{
    primary: number | null;
    other: number | null;
    /** 差异幅度阈值（默认 5 分制：持平 0.15、大差异 0.5） */
    eps?: number;
    big?: number;
    /** true 表示"数值越低越好"（如失败数、响应时长），据此翻转好坏配色 */
    lowerBetter?: boolean;
    /** true 表示纯计数无好坏（如总用例），只显示方向不配色 */
    neutral?: boolean;
    /** 差值显示的小数位 */
    digits?: number;
}> = ({ primary, other, eps = DELTA_EPS, big = DELTA_BIG, lowerBetter, neutral, digits = 1 }) => {
    if (primary == null || other == null) return <span className="text-text-primary/20 w-3 inline-block text-center">·</span>;
    // 先按显示精度四舍五入两边，再比较：与格子里看到的数字口径一致。
    // 例如 4.54 与 4.55 都显示 4.5，就视为相等（−），而非用原始差画出箭头。
    const f = Math.pow(10, digits);
    const pv = Math.round(primary * f) / f;
    const ov = Math.round(other * f) / f;
    const d = pv - ov;
    // 好坏方向：lowerBetter 时把差值取反再判级（值更低=更好=绿）。
    const kind = deltaKind(lowerBetter ? -d : d, eps, big);
    const color = neutral ? '#64748b' : DELTA_COLOR[kind];
    // 只有显示值完全相等才用「−」；任何差异都显示方向箭头（颜色按幅度分级）。
    const glyph = d === 0 ? '−' : d > 0 ? '▲' : '▼';
    return (
        <span
            className="inline-block w-3 text-center text-[10px] leading-none font-bold"
            style={{ color }}
            title={`Δ ${d > 0 ? '+' : ''}${d.toFixed(digits)}`}
        >
            {glyph}
        </span>
    );
};

const OverviewTab: React.FC = () => {
    const {restricted:trial,guardDomain}=useTrialAccess();
    const { t, i18n } = useTranslation();
    const { tm, td } = useMetricsTranslation();
    const {
        primaryKey,
        competitorKeys,
        snapshots,
        getColor,
        getVehicleLabel,
        setPrimaryKey,
        vehicles,
    } = useComparison();

    // 只支持两车对比：本品 + 第一个竞品（若有）。
    const compKey = competitorKeys[0] ?? null;
    const primarySnap = primaryKey ? snapshots[primaryKey] : null;
    const compSnap = compKey ? snapshots[compKey] : null;

    // 指标网格：功能域切换（overall = 总体）。
    const [domainTab, setDomainTab] = useState<string>(trial ? TRIAL_DOMAIN : 'overall');
    useEffect(()=>{if(trial && domainTab!==TRIAL_DOMAIN)setDomainTab(TRIAL_DOMAIN)},[trial,domainTab]);
    // 指标下钻弹窗：存被点击的指标名（criteria dimension_key）
    const [drillMetric, setDrillMetric] = useState<string | null>(null);

    // name → 二级指标(subcategory) 映射，用于指标网格分组。category = "一级 / 二级"。
    const [subcatByName, setSubcatByName] = useState<Record<string, string>>({});
    useEffect(() => {
        getMetricsRegistry()
            .then((items: MetricRegistryItem[]) => {
                const map: Record<string, string> = {};
                for (const it of items) {
                    const parts = (it.category || '').split('/');
                    map[it.name] = (parts[1] || parts[0] || '其它').trim();
                }
                setSubcatByName(map);
            })
            .catch(() => setSubcatByName({}));
    }, []);

    // 各车「功能域 → 指标明细」。总体用 snapshot.criteria_scores。
    const [critByDomain, setCritByDomain] = useState<Record<string, DomainCriteriaItem[]>>({});
    useEffect(() => {
        const keys = [primaryKey, compKey].filter(Boolean) as string[];
        keys.forEach(k => {
            if (critByDomain[k]) return;
            const { brand_model, system_version } = parseVehicleKey(k);
            getCriteriaByDomain(brand_model, system_version)
                .then(res => setCritByDomain(prev => ({ ...prev, [k]: res })))
                .catch(() => setCritByDomain(prev => ({ ...prev, [k]: [] })));
        });
    }, [primaryKey, compKey]);

    // 各车 MiMo 任务完成率（A11）：完成率 / 成功 / 失败 / 总用例。
    const [taskComp, setTaskComp] = useState<Record<string, VehicleTaskCompletion>>({});
    useEffect(() => {
        const keys = [primaryKey, compKey].filter(Boolean) as string[];
        keys.forEach(k => {
            if (taskComp[k]) return;
            const { brand_model, system_version } = parseVehicleKey(k);
            getVehicleTaskCompletion(brand_model, system_version)
                .then(res => setTaskComp(prev => ({ ...prev, [k]: res })))
                .catch(() => { /* 无 MiMo 数据则不展示 */ });
        });
    }, [primaryKey, compKey]);

    // 各车 AI 核心指标基线（含非 5 分制：延时/输出速度/完成率等）。
    const [metricsBaseline, setMetricsBaseline] = useState<Record<string, CoreMetricBaseline[]>>({});
    useEffect(() => {
        const keys = [primaryKey, compKey].filter(Boolean) as string[];
        keys.forEach(k => {
            if (metricsBaseline[k]) return;
            const { brand_model, system_version } = parseVehicleKey(k);
            getVehicleMetricsBaseline(brand_model, system_version)
                .then(res => setMetricsBaseline(prev => ({ ...prev, [k]: res.metrics || [] })))
                .catch(() => { /* 无数据则不展示 */ });
        });
    }, [primaryKey, compKey]);

    // 非 5 分制特殊指标（延时/输出速度）。A11 完成率已在「任务执行表现」四项里展示，此处排除避免重复。
    const specialMetrics = useMemo(() => {
        const primList = (primaryKey && metricsBaseline[primaryKey]) || [];
        return primList.filter(m => m.kind !== 'score' && m.code !== 'A11');
    }, [primaryKey, metricsBaseline]);
    const specialValue = (key: string | null, code: string): number | null => {
        if (!key) return null;
        const list = metricsBaseline[key];
        if (!list) return null;
        const hit = list.find(m => m.code === code);
        return hit ? hit.value : null;
    };

    // 取某车在当前 domainTab 下的指标列表（DimensionScore[]）。snapshot 缺失时空数组。
    const metricsFor = (key: string | null): DimensionScore[] => {
        if (!key) return [];
        if (domainTab === 'overall') {
            return snapshots[key]?.criteria_scores ?? [];
        }
        const list = critByDomain[key] ?? [];
        return list.find(d => d.function_domain === domainTab)?.criteria ?? [];
    };

    // 当前网格：合并本品/竞品指标，按二级指标分组。
    const primaryMetrics = metricsFor(primaryKey);
    const compMetrics = compKey ? metricsFor(compKey) : [];
    const compScoreByName: Record<string, number> = {};
    compMetrics.forEach(m => { compScoreByName[m.dimension_key] = m.avg_score; });

    const grouped = useMemo(() => {
        const groups: Record<string, DimensionScore[]> = {};
        for (const m of primaryMetrics) {
            const sub = subcatByName[m.dimension_key] || '其它';
            (groups[sub] ||= []).push(m);
        }
        // 组内按分降序
        Object.values(groups).forEach(arr => arr.sort((a, b) => b.avg_score - a.avg_score));
        return Object.entries(groups).map(([sub, metrics]) => ({ sub, metrics }));
    }, [primaryMetrics, subcatByName]);

    // 可切换的功能域（本品有数据的）。
    const availableDomains = useMemo(() => {
        const scored = primarySnap?.function_domain_scores.map(d => d.dimension_key) ?? [];
        return [
            ...STANDARD_FUNCTION_DOMAINS.filter(d => scored.includes(d)),
            ...scored.filter(d => !STANDARD_FUNCTION_DOMAINS.includes(d)),
        ];
    }, [primarySnap]);

    if (!primarySnap) {
        return (
            <div className="bg-blue-100 border border-blue-200 text-blue-700 px-4 py-6 rounded-lg text-center">
                {t('no_aggregated_yet')}
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* ── 区域一：车型介绍 ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <VehicleCard snapshot={primarySnap} color={getColor(primaryKey!)} label={getVehicleLabel(primaryKey!)} isPrimary />
                {compSnap
                    ? <VehicleCard snapshot={compSnap} color={getColor(compKey!)} label={getVehicleLabel(compKey!)} compareTo={primarySnap.overall_score} />
                    : <EmptyCompareCard />}
            </div>

            {/* ── 区域一.5：任务执行表现（MiMo 任务完成率 A11 + 特殊指标） ── */}
            {(() => {
                const pTc = primaryKey ? taskComp[primaryKey] : null;
                const cTc = compKey ? taskComp[compKey] : null;
                const hasComp = !!compSnap;
                const hasTask = (pTc && pTc.total > 0) || (cTc && cTc.total > 0);
                const hasSpecial = specialMetrics.length > 0;
                if (!hasTask && !hasSpecial) return null;
                return (
                    <div className="bg-surface-raised rounded-xl border border-ink/[0.08] shadow-sm p-5">
                        <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
                            <h2 className="font-bold text-text-primary flex items-center gap-2">
                                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                                {t('task_performance_title')}
                            </h2>
                            {hasComp && (
                                <div className="flex items-center gap-2 text-xs text-text-muted">
                                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: getColor(primaryKey!) }} />{getVehicleLabel(primaryKey!)}</span>
                                    <span>vs</span>
                                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: getColor(compKey!) }} />{getVehicleLabel(compKey!)}</span>
                                </div>
                            )}
                        </div>

                        {/* 一排统一展示：完成率 · 成功 · 失败 · 总用例 · 特殊指标(延时/速度) */}
                        <div className="task-stat-grid">
                            {/* 完成率：高=好 */}
                            <TaskStatTile
                                label={t('task_completion_rate')}
                                primary={pTc?.completion_rate != null ? pTc.completion_rate * 100 : null}
                                comp={hasComp ? (cTc?.completion_rate != null ? cTc.completion_rate * 100 : null) : undefined}
                                fmt={v => v != null ? `${v.toFixed(1)}%` : '-'}
                                eps={2} big={10} digits={1} valueColor="#20221f"
                            />
                            {/* 成功数：高=好 */}
                            <TaskStatTile
                                label={t('task_success')}
                                primary={pTc?.success ?? null}
                                comp={hasComp ? (cTc?.success ?? null) : undefined}
                                fmt={v => v != null ? String(v) : '-'}
                                eps={0.5} big={1} digits={0} valueColor="#36715a"
                            />
                            {/* 失败数：低=好（反转） */}
                            <TaskStatTile
                                label={t('task_failed')}
                                primary={pTc?.failed ?? null}
                                comp={hasComp ? (cTc?.failed ?? null) : undefined}
                                fmt={v => v != null ? String(v) : '-'}
                                eps={0.5} big={1} digits={0} lowerBetter valueColor="#b34840"
                            />
                            {/* 总用例：纯样本量，无好坏 */}
                            <TaskStatTile
                                label={t('task_total')}
                                primary={pTc?.total ?? null}
                                comp={hasComp ? (cTc?.total ?? null) : undefined}
                                fmt={v => v != null ? String(v) : '-'}
                                eps={0.5} big={1} digits={0} neutral valueColor="#4e554b"
                            />
                            {/* 特殊指标（延时/输出速度）：与四项同款瓦片，凑成一排 5 个 */}
                            {specialMetrics.map(m => {
                                const p = specialValue(primaryKey, m.code);
                                const c = compKey ? specialValue(compKey, m.code) : null;
                                const lowerBetter = m.kind === 'latency';
                                return (
                                    <TaskStatTile
                                        key={m.code}
                                        label={tm(m.name)}
                                        primary={p}
                                        comp={hasComp ? c : undefined}
                                        fmt={v => formatMetricValue(m.kind, v, i18n.language)}
                                        eps={m.kind === 'latency' ? 50 : 0.3} big={m.kind === 'latency' ? 300 : 2} digits={0}
                                        lowerBetter={lowerBetter} valueColor="#4f6247"
                                    />
                                );
                            })}
                        </div>
                    </div>
                );
            })()}

            {/* ── 区域二：功能域总分 ── */}
            <div className="bg-surface-raised p-5 rounded-xl border border-ink/[0.08] shadow-sm">
                <h2 className="font-bold text-text-primary flex items-center gap-2 mb-4">
                    <Layers className="w-5 h-5 text-purple-500" />
                    {t('function_domain_scores')}
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    {availableDomains.map(dom => {
                        const p = primarySnap.function_domain_scores.find(d => d.dimension_key === dom)?.avg_score ?? null;
                        const c = compSnap?.function_domain_scores.find(d => d.dimension_key === dom)?.avg_score ?? null;
                        return <DomainStat key={dom} name={td(dom)} primary={p} comp={compSnap ? c : undefined} />;
                    })}
                </div>
            </div>

            {/* ── 区域三：指标网格（FM 风格） ── */}
            <div className="bg-surface-raised p-5 rounded-xl border border-ink/[0.08] shadow-sm">
                <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
                    <h2 className="font-bold text-text-primary">{t('criteria_scores')}</h2>
                    {compSnap && (
                        <div className="flex items-center gap-2 text-xs text-text-muted">
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: getColor(primaryKey!) }} />{getVehicleLabel(primaryKey!)}</span>
                            <span>vs</span>
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: getColor(compKey!) }} />{getVehicleLabel(compKey!)}</span>
                        </div>
                    )}
                </div>

                {/* 功能域卡片式切换 */}
                <div className="flex flex-wrap gap-2 mb-5">
                    <DomainChip label={t('overview_overall')} active={domainTab === 'overall'} onClick={() => {if(guardDomain('全部功能域'))setDomainTab('overall')}} />
                    {availableDomains.map(dom => (
                        <DomainChip key={dom} label={td(dom)} active={domainTab === dom} onClick={() => {if(guardDomain(dom))setDomainTab(dom)}} />
                    ))}
                </div>

                {/* 指标网格：按二级指标分组 */}
                {grouped.length === 0 ? (
                    <div className="text-sm text-text-muted text-center py-8">{t('no_metric_data')}</div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-5">
                        {grouped.map(g => (
                            <div key={g.sub}>
                                <div className="text-xs font-bold text-text-muted uppercase tracking-wide mb-1.5 border-b border-ink/[0.08] pb-1">
                                    {tm(g.sub)}
                                </div>
                                <div className="divide-y divide-ink/[0.04]">
                                    {g.metrics.map(m => (
                                        <MetricRow
                                            key={m.dimension_key}
                                            name={tm(m.dimension_key)}
                                            primary={m.avg_score}
                                            comp={compSnap ? (compScoreByName[m.dimension_key] ?? null) : undefined}
                                            onDrill={() => setDrillMetric(m.dimension_key)}
                                        />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* 指标下钻弹窗：某指标各功能域细分 */}
            {drillMetric && (
                <MetricDomainModal metricName={drillMetric} onClose={() => setDrillMetric(null)} />
            )}
        </div>
    );
};

// ── 车型介绍卡片：总分环 + 基本信息。──
const VehicleCard: React.FC<{
    snapshot: any;
    color: string;
    label: string;
    isPrimary?: boolean;
    compareTo?: number | null;
}> = ({ snapshot, color, label, isPrimary, compareTo }) => {
    const { t } = useTranslation();
    const { tv } = useMetricsTranslation();
    const overall = snapshot.overall_score as number | null;
    const delta = compareTo != null && overall != null ? overall - compareTo : null;
    return (
        <div className="bg-surface-raised rounded-xl border border-ink/[0.08] shadow-sm p-5 flex flex-col sm:flex-row items-center gap-5">
            {/* 总分环 */}
            <div className="shrink-0 flex flex-col items-center">
                <div className="flex flex-col items-center justify-center w-24 h-24 rounded-full border-4" style={{ borderColor: overall != null ? scoreHsl(overall) : '#475569' }}>
                    <span className="text-2xl font-black tabular-nums" style={{ color: overall != null ? scoreHsl(overall) : '#656a61' }}>
                        {overall != null ? overall.toFixed(1) : '—'}
                    </span>
                    <span className="text-[10px] text-text-muted">/ 5.0</span>
                </div>
                {delta != null && (
                    <span className="mt-1.5 text-xs font-bold" style={{ color: DELTA_COLOR[deltaKind(delta)] }}>
                        {delta > 0 ? '+' : ''}{delta.toFixed(1)}
                    </span>
                )}
            </div>
            {/* 基本信息 */}
            <div className="min-w-0 w-full flex-1">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                    {isPrimary
                        ? <Star className="w-4 h-4 text-amber-700 shrink-0" />
                        : <Car className="w-4 h-4 text-text-muted shrink-0" />}
                    <h2 className="text-lg font-bold text-text-primary truncate">{tv(snapshot.brand_model)}</h2>
                    {snapshot.system_version && (
                        <span className="text-xs font-medium px-1.5 py-0.5 rounded border border-ink/[0.15] text-text-secondary break-all">
                            V{snapshot.system_version}
                        </span>
                    )}
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                    <InfoLine icon={<Trophy className="w-3.5 h-3.5" />} label={t('vehicle_case_avg_score')} value={snapshot.case_avg_score != null ? snapshot.case_avg_score.toFixed(1) : '—'} />
                    <InfoLine icon={<Layers className="w-3.5 h-3.5" />} label={t('domains')} value={String(snapshot.overall_domain_count ?? 0)} />
                    <InfoLine icon={<Film className="w-3.5 h-3.5" />} label={t('samples')} value={String(snapshot.overall_sample_count ?? snapshot.case_count ?? 0)} />
                    <InfoLine icon={<Clock className="w-3.5 h-3.5" />} label={t('last_computed_at')} value={snapshot.last_computed_at ? new Date(snapshot.last_computed_at).toLocaleDateString() : '—'} />
                </div>
            </div>
        </div>
    );
};

const InfoLine: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
    <div className="flex items-center gap-1.5 text-text-muted min-w-0">
        <span className="text-text-muted shrink-0">{icon}</span>
        <span className="text-xs truncate">{label}</span>
        <span className="ml-auto font-bold text-text-secondary tabular-nums shrink-0">{value}</span>
    </div>
);

const EmptyCompareCard: React.FC = () => {
    const { t } = useTranslation();
    return (
        <div className="bg-surface rounded-xl border border-dashed border-ink/[0.12] p-5 flex items-center justify-center text-center">
            <div className="text-sm text-text-muted">
                <Car className="w-6 h-6 mx-auto mb-2 opacity-40" />
                {t('overview_pick_competitor')}
            </div>
        </div>
    );
};

// ── 任务完成率单项小卡：与功能域/指标同款「箭头 + 本品 + 竞品」表达。──
const TaskStatTile: React.FC<{
    label: string;
    primary: number | null;
    comp?: number | null;
    fmt: (v: number | null) => string;
    eps: number;
    big: number;
    digits: number;
    lowerBetter?: boolean;
    neutral?: boolean;
    valueColor: string;
}> = ({ label, primary, comp, fmt, eps, big, digits, lowerBetter, neutral, valueColor }) => (
    <div className="task-stat-tile rounded-lg border border-ink/[0.08] bg-surface p-3 text-center">
        <div className="text-xs text-text-muted mb-1.5 truncate" title={label}>{label}</div>
        <div className="task-stat-values flex items-center justify-center gap-1.5">
            {comp !== undefined && (
                <DeltaArrow primary={primary} other={comp ?? null} eps={eps} big={big} digits={digits} lowerBetter={lowerBetter} neutral={neutral} />
            )}
            <span className="text-xl font-black tabular-nums" style={{ color: valueColor }}>
                {fmt(primary)}
            </span>
            {comp !== undefined && (
                <span className="text-sm font-bold tabular-nums text-text-muted">
                    {fmt(comp ?? null)}
                </span>
            )}
        </div>
    </div>
);

// ── 功能域总分小卡：颜色表达高低，双车时并列 + 箭头。──
const DomainStat: React.FC<{ name: string; primary: number | null; comp?: number | null }> = ({ name, primary, comp }) => (
    <div className="rounded-lg border border-ink/[0.08] bg-surface p-3 text-center">
        <div className="text-xs text-text-muted mb-1.5 truncate" title={name}>{name}</div>
        <div className="flex items-center justify-center gap-1.5">
            {comp !== undefined && <DeltaArrow primary={primary} other={comp ?? null} />}
            <span className="text-xl font-black tabular-nums" style={{ color: scoreText(primary) }}>
                {primary != null ? primary.toFixed(1) : '—'}
            </span>
            {comp !== undefined && (
                <span className="text-sm font-bold tabular-nums" style={{ color: scoreText(comp) }}>
                    {comp != null ? comp.toFixed(1) : '—'}
                </span>
            )}
        </div>
    </div>
);

const DomainChip: React.FC<{ label: string; active: boolean; onClick: () => void }> = ({ label, active, onClick }) => (
    <button
        onClick={onClick}
        className={clsx(
            'px-3 py-1.5 text-sm rounded-lg border transition-colors',
            active
                ? 'border-secondary text-secondary bg-secondary/10 font-semibold'
                : 'border-ink/[0.12] text-text-muted hover:text-text-primary hover:border-ink/[0.25]'
        )}
    >
        {label}
    </button>
);

// ── 指标行：指标名 + 本品数字（左侧箭头）+ 竞品数字。数字用颜色表达高低。──
// onDrill 存在时整行可点，下钻到「该指标各功能域细分」。
const MetricRow: React.FC<{ name: string; primary: number; comp?: number | null; onDrill?: () => void }> = ({ name, primary, comp, onDrill }) => {
    const { t } = useTranslation();
    return (
    <div
        className={clsx(
            'flex items-center gap-2 py-1.5 rounded-md',
            onDrill && 'cursor-pointer hover:bg-ink/[0.04] -mx-1.5 px-1.5 transition-colors group',
        )}
        onClick={onDrill}
        title={onDrill ? `${name} · ${t('metric_baseline_drill')}` : name}
    >
        <span className={clsx('text-sm truncate flex-1', onDrill ? 'text-text-secondary group-hover:text-text-primary' : 'text-text-secondary')}>{name}</span>
        {comp !== undefined && <DeltaArrow primary={primary} other={comp ?? null} />}
        <span className="text-sm font-bold tabular-nums w-9 text-right" style={{ color: scoreText(primary) }}>
            {primary.toFixed(1)}
        </span>
        {comp !== undefined && (
            <span className="text-sm font-bold tabular-nums w-9 text-right" style={{ color: scoreText(comp) }}>
                {comp != null ? comp.toFixed(1) : '—'}
            </span>
        )}
    </div>
    );
};

// ── 特殊指标数值格式化（按 kind）。──
// ── 特殊指标差异箭头：本品 vs 竞品，只显示方向。lowerBetter 时翻转好坏配色。──
const SpecialDelta: React.FC<{ primary: number | null; other: number | null; lowerBetter?: boolean }> = ({ primary, other, lowerBetter }) => {
    const { i18n } = useTranslation();
    const english = i18n.language.startsWith('en');
    if (primary == null || other == null || other === 0) return null;
    const diff = primary - other;
    const rel = Math.abs(diff) / Math.abs(other); // 相对差
    if (rel < 0.03) return <span className="text-text-muted text-sm" title={english ? 'Comparable' : '持平'}>≈</span>;
    const primaryBetter = lowerBetter ? diff < 0 : diff > 0;
    const big = rel >= 0.2;
    const color = primaryBetter ? (big ? '#36715a' : '#52795f') : (big ? '#b34840' : '#a17b35');
    // 箭头方向按数值大小（不按好坏）：本品数值更大 = ▲
    const up = diff > 0;
    return (
        <span className="text-base font-bold" style={{ color }} title={english
            ? `Primary is ${(rel * 100).toFixed(0)}% ${up ? 'higher' : 'lower'} than the comparison model`
            : `本品 ${up ? '高于' : '低于'} 竞品 ${(rel * 100).toFixed(0)}%`}>
            {up ? '▲' : '▼'}
        </span>
    );
};

export default OverviewTab;
