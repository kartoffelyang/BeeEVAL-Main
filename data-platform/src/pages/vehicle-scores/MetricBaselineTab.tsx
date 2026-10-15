import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, Star, Gauge, ChevronRight, X } from 'lucide-react';
import clsx from 'clsx';
import { useComparison, parseVehicleKey } from './ComparisonContext';
import { useTranslation } from 'react-i18next';
import { useMetricsTranslation } from '../../hooks/useMetricsTranslation';
import {
    getVehicleMetricsBaseline,
    getMetricDomainBreakdown,
    type VehicleMetricsBaseline,
    type CoreMetricBaseline,
    type MetricDomainBreakdown,
} from '../../api';

// 二级指标展示顺序（与指标库一致；未列出的按出现顺序补后）。
const SUBCAT_ORDER = [
    'C1-自然语言', 'C3-意图识别', 'A1-执行质量', 'A2-执行效率',
    'F2-信任', 'F3-负荷', 'E1-记忆',
];

// 5 分制柱颜色（按分值）。
const scoreBarColor = (v: number) => (v >= 4 ? '#36715a' : v >= 3 ? '#a17b35' : '#b34840');

// 单车基线数据里，按 code 取某指标。
type MetricMap = Record<string, CoreMetricBaseline>;
const toMap = (d: VehicleMetricsBaseline): MetricMap => {
    const m: MetricMap = {};
    for (const x of d.metrics) m[x.code] = x;
    return m;
};

// 参与对比的一台车。
interface Series {
    key: string;
    label: string;
    color: string;
    isPrimary: boolean;
    map: MetricMap;
}

const MetricBaselineTab: React.FC = () => {
    const { t } = useTranslation();
    const { tm } = useMetricsTranslation();
    const {
        primaryKey,
        allSelectedKeys,
        getColor,
        getVehicleLabel,
    } = useComparison();

    const selectedKeys = allSelectedKeys();
    const selectedSig = selectedKeys.join(',');

    const [dataMap, setDataMap] = useState<Record<string, VehicleMetricsBaseline>>({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fetchingRef = useRef<Set<string>>(new Set());

    // 点击某指标后下钻：记录 code + name + kind，打开功能域细分弹窗。
    const [drill, setDrill] = useState<{ code: string; name: string; kind: string } | null>(null);

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
                    const d = await getVehicleMetricsBaseline(brand_model, system_version);
                    return [k, d] as const;
                } catch {
                    return [k, null] as const;
                } finally {
                    fetchingRef.current.delete(k);
                }
            })
        )
            .then(pairs => {
                const next: Record<string, VehicleMetricsBaseline> = {};
                for (const [k, d] of pairs) if (d) next[k] = d;
                if (Object.keys(next).length > 0) setDataMap(prev => ({ ...prev, ...next }));
            })
            .catch((e: any) => setError(e?.message || t('baseline_load_failed')))
            .finally(() => setLoading(false));
    }, [selectedSig]);

    const vehiclesWithData = selectedKeys.filter(k => dataMap[k]);

    // 各车 series（保持选择顺序，主车在前）。
    const series: Series[] = useMemo(
        () => vehiclesWithData.map(k => ({
            key: k,
            label: getVehicleLabel(k),
            color: getColor(k),
            isPrimary: k === primaryKey,
            map: toMap(dataMap[k]),
        })),
        [selectedSig, dataMap]
    );

    // 指标定义顺序取任一车（后端顺序一致）。5分制 与 特殊 分开。
    const allMetrics = vehiclesWithData.length ? dataMap[vehiclesWithData[0]].metrics : [];
    const scoreMetrics = allMetrics.filter(m => m.kind === 'score');
    const specialMetrics = allMetrics.filter(m => m.kind !== 'score');

    // 5分制指标按二级指标分组。
    const groupedBySubcat = useMemo(() => {
        const groups: Record<string, CoreMetricBaseline[]> = {};
        for (const m of scoreMetrics) (groups[m.subcategory] ||= []).push(m);
        const keys = [
            ...SUBCAT_ORDER.filter(s => groups[s]),
            ...Object.keys(groups).filter(s => !SUBCAT_ORDER.includes(s)),
        ];
        return keys.map(k => ({ subcategory: k, metrics: groups[k] }));
    }, [scoreMetrics]);

    if (!primaryKey) {
        return (
            <div className="bg-blue-100 border border-blue-200 text-blue-700 px-4 py-6 rounded-lg text-center">
                {t('select_vehicle_hint')}
            </div>
        );
    }
    if (loading && vehiclesWithData.length === 0) {
        return <div className="text-sm text-text-muted px-4 py-6">{t('loading')}</div>;
    }
    if (error && vehiclesWithData.length === 0) {
        return (
            <div className="bg-rose-100 border border-rose-200 text-rose-700 px-4 py-6 rounded-lg text-center">
                {error}
            </div>
        );
    }
    if (vehiclesWithData.length === 0 || allMetrics.length === 0) {
        return (
            <div className="bg-blue-100 border border-blue-200 text-blue-700 px-4 py-6 rounded-lg text-center">
                {t('acceptance_no_data')}
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* 标题 + 车辆图例 */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-secondary" />
                    <h2 className="text-lg font-bold text-text-primary">{t('metric_baseline_title')}</h2>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-purple-100 text-purple-700 border border-purple-200">AI核心指标</span>
                </div>
                <VehicleLegend series={series} />
            </div>
            <p className="text-xs text-text-muted -mt-3">{t('metric_baseline_desc')}</p>

            {/* 5 分制核心指标：按二级指标分组 */}
            <div className="space-y-6">
                {groupedBySubcat.map(group => (
                    <div key={group.subcategory} className="bg-surface-raised p-5 rounded-xl border border-ink/[0.08] shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-bold text-text-primary flex items-center gap-2">
                                <span className="text-secondary text-sm font-mono">{group.subcategory.split('-')[0]}</span>
                                {group.subcategory.split('-').slice(1).join('-')}
                            </h3>
                            <VehicleLegend series={series} />
                        </div>
                        <div className="space-y-5">
                            {group.metrics.map(m => (
                                <ScoreMetricBar
                                    key={m.code}
                                    code={m.code}
                                    name={tm(m.name)}
                                    series={series}
                                    onOpen={() => setDrill({ code: m.code, name: tm(m.name), kind: m.kind })}
                                />
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {/* 特殊指标（不同量纲，单独数值对比） */}
            {specialMetrics.length > 0 && (
                <div className="bg-surface-raised p-5 rounded-xl border border-ink/[0.08] shadow-sm">
                    <h3 className="font-bold text-text-primary flex items-center gap-2 mb-4">
                        <Gauge className="w-5 h-5 text-amber-700" />
                        {t('metric_baseline_special')}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {specialMetrics.map(m => (
                            <SpecialMetricCard
                                key={m.code}
                                code={m.code}
                                name={tm(m.name)}
                                kind={m.kind}
                                series={series}
                                onOpen={() => setDrill({ code: m.code, name: tm(m.name), kind: m.kind })}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* 指标下钻：各功能域细分 */}
            {drill && (
                <MetricDomainModal
                    metricCode={drill.code}
                    metricName={drill.name}
                    kind={drill.kind}
                    series={series}
                    onClose={() => setDrill(null)}
                />
            )}
        </div>
    );
};

// 车辆图例：色块 + 车名（本品带 ★）。
const VehicleLegend: React.FC<{ series: Series[] }> = ({ series }) => (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {series.map(v => (
            <div key={v.key} className="flex items-center gap-1.5 text-xs text-text-secondary">
                <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: v.color }} />
                {v.isPrimary && <Star className="w-3 h-3 text-amber-700 shrink-0" />}
                {v.label}
            </div>
        ))}
    </div>
);

// 一个 5 分制指标：指标名 + 每台车一根横向柱（0-5），柱尾标分值。点击指标名下钻。
const ScoreMetricBar: React.FC<{ code: string; name: string; series: Series[]; onOpen: () => void }> = ({ code, name, series, onOpen }) => {
    const { t } = useTranslation();
    return (
        <div>
            <button
                onClick={onOpen}
                className="flex items-center gap-2 mb-1.5 group/metric cursor-pointer"
                title={t('metric_baseline_drill')}
            >
                <span className="text-xs font-mono text-text-muted">{code}</span>
                <span className="text-sm text-text-secondary group-hover/metric:text-secondary group-hover/metric:underline transition-colors">{name}</span>
                <ChevronRight className="w-3.5 h-3.5 text-text-muted opacity-0 group-hover/metric:opacity-100 transition-opacity" />
            </button>
            <div className="space-y-1.5">
                {series.map(v => {
                    const m = v.map[code];
                    const val = m?.value ?? null;
                    const pct = val != null ? Math.max(2, (val / 5) * 100) : 0;
                    return (
                        <div key={v.key} className="flex items-center gap-2" title={`${v.label}: ${val != null ? val.toFixed(2) : '—'} / 5`}>
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: v.color }} />
                            <div className="flex-1 h-4 bg-ink/[0.05] rounded overflow-hidden">
                                <div
                                    className="h-full rounded transition-all duration-500"
                                    style={{ width: `${pct}%`, backgroundColor: val != null ? v.color : 'transparent', opacity: val != null ? 1 : 0.2 }}
                                />
                            </div>
                            <span className="text-xs font-bold tabular-nums w-10 text-right" style={{ color: val != null ? scoreBarColor(val) : undefined }}>
                                {val != null ? val.toFixed(2) : '—'}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// 特殊指标数值格式化（按 kind）。
const fmtSpecial = (kind: string, val: number | null): string => {
    if (val == null) return '—';
    if (kind === 'percent') return `${(val * 100).toFixed(0)}%`;
    if (kind === 'latency') return `${val.toFixed(0)} ms`;
    if (kind === 'speed') return `${val.toFixed(1)} 字/秒`;
    return String(val);
};

// 特殊指标卡片：指标名 + 每台车数值（量纲不同，仅列数值，不画统一柱）。点击标题下钻。
const SpecialMetricCard: React.FC<{ code: string; name: string; kind: string; series: Series[]; onOpen: () => void }> = ({ code, name, kind, series, onOpen }) => {
    const { t } = useTranslation();
    return (
        <div className="rounded-lg border border-ink/[0.08] p-4 hover:border-ink/[0.2] transition-colors">
            <button onClick={onOpen} className="flex items-center gap-2 mb-3 group/metric cursor-pointer w-full" title={t('metric_baseline_drill')}>
                <span className="text-xs font-mono text-text-muted">{code}</span>
                <span className="text-sm font-medium text-text-secondary group-hover/metric:text-secondary group-hover/metric:underline transition-colors">{name}</span>
                <ChevronRight className="w-3.5 h-3.5 text-text-muted opacity-0 group-hover/metric:opacity-100 transition-opacity ml-auto" />
            </button>
            <div className="space-y-2">
                {series.map(v => {
                    const m = v.map[code];
                    return (
                        <div key={v.key} className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1.5 text-xs text-text-muted truncate">
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: v.color }} />
                                {v.label}
                            </span>
                            <span className="text-sm font-bold tabular-nums text-text-primary shrink-0">
                                {fmtSpecial(kind, m?.value ?? null)}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// 指标下钻弹窗：某指标在各功能域的细分，横排功能域、组内并排各车。
const MetricDomainModal: React.FC<{
    metricCode: string;
    metricName: string;
    kind: string;
    series: Series[];
    onClose: () => void;
}> = ({ metricCode, metricName, kind, series, onClose }) => {
    const { t } = useTranslation();
    const { td } = useMetricsTranslation();
    const [dataByVehicle, setDataByVehicle] = useState<Record<string, MetricDomainBreakdown>>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        Promise.all(
            series.map(async v => {
                const { brand_model, system_version } = parseVehicleKey(v.key);
                try {
                    const d = await getMetricDomainBreakdown(brand_model, metricCode, system_version);
                    return [v.key, d] as const;
                } catch {
                    return [v.key, null] as const;
                }
            })
        ).then(pairs => {
            if (cancelled) return;
            const next: Record<string, MetricDomainBreakdown> = {};
            for (const [k, d] of pairs) if (d) next[k] = d;
            setDataByVehicle(next);
        }).finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [metricCode, series.map(s => s.key).join(',')]);

    // 汇总所有车出现的功能域（规范顺序）。
    const domains = useMemo(() => {
        const set = new Set<string>();
        Object.values(dataByVehicle).forEach(d => d.domains.forEach(x => set.add(x.function_domain)));
        const STD = ['车控域', '出行域', '车书域', '娱乐域', '闲聊域', '创作域'];
        return [...STD.filter(d => set.has(d)), ...[...set].filter(d => !STD.includes(d))];
    }, [dataByVehicle]);

    // 某车某域的值。
    const valOf = (vehKey: string, domain: string): { value: number | null; n: number } => {
        const d = dataByVehicle[vehKey];
        const item = d?.domains.find(x => x.function_domain === domain);
        return { value: item?.value ?? null, n: item?.sample_count ?? 0 };
    };

    // 柱高归一化：score 用 0-5；其它 kind 用当前所有值的最大值。
    const maxVal = useMemo(() => {
        if (kind === 'score') return 5;
        let mx = 0;
        Object.values(dataByVehicle).forEach(d => d.domains.forEach(x => { if (x.value != null && x.value > mx) mx = x.value; }));
        return mx || 1;
    }, [dataByVehicle, kind]);

    const fmt = (v: number | null): string => {
        if (v == null) return '—';
        if (kind === 'percent') return `${(v * 100).toFixed(0)}%`;
        if (kind === 'latency') return `${v.toFixed(0)} ms`;
        if (kind === 'speed') return `${v.toFixed(1)} 字/秒`;
        return v.toFixed(2);
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={onClose}>
            <div className="bg-surface-raised rounded-2xl shadow-2xl shadow-ink/40 w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden border border-ink/[0.08] animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                {/* 头 */}
                <div className="px-5 py-3.5 border-b border-ink/[0.08] flex items-center justify-between bg-surface shrink-0">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-mono text-text-muted">{metricCode}</span>
                        <span className="font-bold text-text-primary truncate">{metricName}</span>
                        <span className="text-xs text-text-muted shrink-0">· {t('metric_baseline_by_domain')}</span>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-ink/[0.05] rounded-full text-text-muted shrink-0"><X className="w-5 h-5" /></button>
                </div>

                {/* 车辆图例 */}
                <div className="px-5 py-2.5 border-b border-ink/[0.08] shrink-0">
                    <VehicleLegend series={series} />
                </div>

                {/* 内容 */}
                <div className="flex-1 overflow-y-auto p-5">
                    {loading && Object.keys(dataByVehicle).length === 0 ? (
                        <div className="text-sm text-text-muted py-8 text-center">{t('loading')}</div>
                    ) : domains.length === 0 ? (
                        <div className="text-sm text-text-muted py-8 text-center">{t('acceptance_no_data')}</div>
                    ) : (
                        <div className="flex items-stretch gap-4 overflow-x-auto pb-1">
                            {domains.map(domain => (
                                <div key={domain} className="flex-1 min-w-[110px] flex flex-col">
                                    {/* 柱区 */}
                                    <div className="flex items-end justify-center gap-1.5 pt-6 h-44">
                                        {series.map(v => {
                                            const { value, n } = valOf(v.key, domain);
                                            const h = value != null ? Math.max(2, (value / maxVal) * 100) : 0;
                                            return (
                                                <div
                                                    key={v.key}
                                                    className="flex-1 max-w-[34px] h-full flex flex-col items-center justify-end"
                                                    title={`${v.label}\n${td(domain)}: ${fmt(value)} · n=${n}`}
                                                >
                                                    <div className="text-[10px] font-bold tabular-nums mb-0.5 leading-none" style={{ color: v.color }}>
                                                        {value != null ? (kind === 'percent' ? `${(value * 100).toFixed(0)}%` : kind === 'score' ? value.toFixed(1) : value.toFixed(0)) : '—'}
                                                    </div>
                                                    <div className="w-full flex-1 flex items-end">
                                                        <div className="w-full rounded-t transition-all duration-500" style={{ height: `${h}%`, backgroundColor: v.color, opacity: value != null ? 1 : 0.15 }} />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className="mt-2 pt-2 border-t border-ink/[0.06] text-center">
                                        <div className="text-xs font-medium text-text-secondary truncate" title={td(domain)}>{td(domain)}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MetricBaselineTab;
