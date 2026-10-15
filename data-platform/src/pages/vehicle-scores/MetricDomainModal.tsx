import React, { useEffect, useMemo, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { useComparison, parseVehicleKey } from './ComparisonContext';
import { getMetricDomainBreakdown, getMetricsRegistry, type MetricDomainBreakdown, type MetricRegistryItem } from '../../api';
import { useMetricsTranslation } from '../../hooks/useMetricsTranslation';

// 6 个规范功能域，固定顺序（与 OverviewTab 一致）
const STANDARD_DOMAINS = ['车控域', '出行域', '车书域', '娱乐域', '闲聊域', '创作域'];

const scoreHsl = (s: number): string => {
    const v = Math.max(1, Math.min(5, s));
    const hue = ((v - 1) / 4) * 130;
    return `hsl(${hue}, 68%, 46%)`;
};

interface Props {
    /** 指标展示名（criteria_scores 的 dimension_key） */
    metricName: string;
    onClose: () => void;
}

/**
 * 指标下钻弹窗：某指标在各功能域下的均分。
 * - 支持已选中的多车并排对比（本品 + 竞品）
 * - 每个域一组柱子；顶部额外给出「平均分」（各域有效值的算术平均）
 */
const MetricDomainModal: React.FC<Props> = ({ metricName, onClose }) => {
    const { tm, td } = useMetricsTranslation();
    const { allSelectedKeys, getColor, getVehicleLabel } = useComparison();
    const keys = allSelectedKeys();

    const [metricCode, setMetricCode] = useState<string | null>(null);
    const [data, setData] = useState<Record<string, MetricDomainBreakdown>>({});
    const [loading, setLoading] = useState(true);

    // name → code
    useEffect(() => {
        getMetricsRegistry()
            .then((items: MetricRegistryItem[]) => {
                const hit = items.find((it) => it.name === metricName);
                setMetricCode(hit?.code ?? null);
            })
            .catch(() => setMetricCode(null));
    }, [metricName]);

    useEffect(() => {
        if (!metricCode) return;
        let cancelled = false;
        setLoading(true);
        (async () => {
            const out: Record<string, MetricDomainBreakdown> = {};
            await Promise.all(keys.map(async (k) => {
                const { brand_model, system_version } = parseVehicleKey(k);
                try {
                    out[k] = await getMetricDomainBreakdown(brand_model, metricCode, system_version);
                } catch { /* skip */ }
            }));
            if (!cancelled) { setData(out); setLoading(false); }
        })();
        return () => { cancelled = true; };
    }, [metricCode, keys.join('|')]);

    // 每车：域 → 值
    const valueOf = (key: string, domain: string): number | null => {
        const d = data[key]?.domains.find((x) => x.function_domain === domain);
        return d && d.value != null ? d.value : null;
    };
    // 每车平均分（各域有效值算术平均）
    const avgOf = (key: string): number | null => {
        const vals = STANDARD_DOMAINS.map((dm) => valueOf(key, dm)).filter((v): v is number => v != null);
        if (!vals.length) return null;
        return vals.reduce((a, b) => a + b, 0) / vals.length;
    };

    const maxVal = 5; // 5 分制

    const columns = useMemo(() => keys.map((k) => ({ key: k, label: getVehicleLabel(k), color: getColor(k) })), [keys.join('|')]);

    return (
        <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div
                className="bg-surface-raised rounded-2xl shadow-2xl shadow-ink/50 border border-ink/[0.08] w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* 头部 */}
                <div className="px-6 py-4 border-b border-ink/[0.08] flex items-center justify-between bg-surface/50">
                    <div className="flex items-baseline gap-2.5 min-w-0">
                        {metricCode && <span className="text-xs font-mono text-text-muted shrink-0">{metricCode}</span>}
                        <h2 className="text-lg font-bold text-text-primary truncate">{tm(metricName)}</h2>
                        <span className="text-sm text-text-muted shrink-0">· 各功能域细分</span>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-ink/[0.05] text-text-muted hover:text-text-primary shrink-0">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* 图例 */}
                <div className="px-6 py-3 flex flex-wrap items-center gap-4 border-b border-ink/[0.06]">
                    {columns.map((c) => (
                        <div key={c.key} className="flex items-center gap-1.5 text-sm">
                            <span className="w-3.5 h-3.5 rounded-sm" style={{ background: c.color }} />
                            <span className="text-text-secondary">{c.label}</span>
                        </div>
                    ))}
                </div>

                {/* 内容 */}
                <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-ink/10">
                    {loading ? (
                        <div className="flex items-center justify-center h-48 text-text-muted gap-2">
                            <Loader2 className="w-5 h-5 animate-spin" /> 加载中...
                        </div>
                    ) : (
                        <>
                            {/* 平均分卡 */}
                            <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {columns.map((c) => {
                                    const avg = avgOf(c.key);
                                    return (
                                        <div key={c.key} className="rounded-xl border border-ink/[0.08] bg-surface p-3 flex items-center gap-3">
                                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.color }} />
                                            <div className="min-w-0 flex-1">
                                                <div className="text-xs text-text-muted truncate">{c.label}</div>
                                                <div className="text-[11px] text-text-muted">平均分</div>
                                            </div>
                                            <span className="text-2xl font-black tabular-nums" style={{ color: avg != null ? scoreHsl(avg) : '#64748b' }}>
                                                {avg != null ? avg.toFixed(2) : '—'}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* 各域柱状 */}
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-7">
                                {STANDARD_DOMAINS.map((dm) => (
                                    <div key={dm}>
                                        {/* 数值行 */}
                                        <div className="flex items-end justify-center gap-3 h-8 mb-1.5">
                                            {columns.map((c) => {
                                                const v = valueOf(c.key, dm);
                                                return (
                                                    <span key={c.key} className="text-sm font-bold tabular-nums" style={{ color: v != null ? c.color : '#475569' }}>
                                                        {v != null ? v.toFixed(1) : '—'}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                        {/* 柱子 */}
                                        <div className="flex items-end justify-center gap-3 h-32 border-b border-ink/[0.1]">
                                            {columns.map((c) => {
                                                const v = valueOf(c.key, dm);
                                                const h = v != null ? Math.max(4, (v / maxVal) * 100) : 0;
                                                return (
                                                    <div
                                                        key={c.key}
                                                        className="w-7 rounded-t-md transition-all"
                                                        style={{ height: `${h}%`, background: c.color, opacity: v != null ? 1 : 0.15 }}
                                                        title={v != null ? v.toFixed(2) : '无数据'}
                                                    />
                                                );
                                            })}
                                        </div>
                                        {/* 域名 */}
                                        <div className="text-center text-sm text-text-secondary mt-2">{td(dm)}</div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MetricDomainModal;
