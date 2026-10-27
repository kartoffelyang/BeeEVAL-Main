import {useTrialAccess} from "../../contexts/TrialContext";
import React, { useEffect, useRef, useState } from 'react';
import { ClipboardCheck, Star } from 'lucide-react';
import clsx from 'clsx';
import { useComparison, parseVehicleKey } from './ComparisonContext';
import { useTranslation } from 'react-i18next';
import { useMetricsTranslation } from '../../hooks/useMetricsTranslation';
import {
    getVehicleAcceptanceCompletion,
    type VehicleAcceptanceCompletion,
    type AcceptanceGradeStat,
} from '../../api';

// 验收梯度固定展示顺序（由易到难）。后端也回传 grades，这里作为兜底/排序基准。
const GRADES_ORDER = ['基础验收', '中等验收', '进阶验收'];

// 6 个规范功能域展示顺序，与后端 STANDARD_FUNCTION_DOMAINS 一致。
const STANDARD_FUNCTION_DOMAINS = ['车控域', '出行域', '车书域', '娱乐域', '闲聊域', '创作域'];

// 验收梯度名 → i18n 键（英文模式下翻译，中文模式回落原名）。
const GRADE_I18N_KEY: Record<string, string> = {
    '基础验收': 'acceptance_grade_basic',
    '中等验收': 'acceptance_grade_medium',
    '进阶验收': 'acceptance_grade_advanced',
};

const gradeLabel = (grade: string, t: (k: string) => string): string => {
    const key = GRADE_I18N_KEY[grade];
    if (!key) return grade;
    const translated = t(key);
    return translated === key ? grade : translated;
};

// 梯度标题左侧的小色块配色（仅装饰，柱子颜色代表车辆）。
const GRADE_COLORS: Record<string, string> = {
    '基础验收': '#36715a', // emerald
    '中等验收': '#a17b35', // amber
    '进阶验收': '#786d83', // violet
};
const gradeColor = (grade: string) => GRADE_COLORS[grade] ?? '#64748b';

// 把一台车的 by_domain 数组转成 { 功能域 -> { 梯度 -> stat } } 便于查表。
const toDomainMap = (data: VehicleAcceptanceCompletion): Record<string, Record<string, AcceptanceGradeStat>> => {
    const m: Record<string, Record<string, AcceptanceGradeStat>> = {};
    for (const d of data.by_domain) m[d.function_domain] = d.grades;
    return m;
};

const hasAnySample = (grades?: Record<string, AcceptanceGradeStat> | null) =>
    !!grades && Object.values(grades).some(s => s.case_count > 0);

// 参与对比的一台车：颜色 + 该场景(overall / 某功能域)下的梯度统计。
interface VehicleSeries {
    key: string;
    label: string;
    color: string;
    isPrimary: boolean;
    stats: Record<string, AcceptanceGradeStat> | null;
}

const AcceptanceTab: React.FC = () => {
    const {trial}=useTrialAccess();
    const { t } = useTranslation();
    const { td } = useMetricsTranslation();
    const {
        primaryKey,
        allSelectedKeys,
        getColor,
        getVehicleLabel,
    } = useComparison();

    const selectedKeys = allSelectedKeys();
    const selectedSig = selectedKeys.join(',');

    // 每台选中车各自的验收数据（独立端点，不在 snapshot 里）。按 key 缓存。
    const [dataMap, setDataMap] = useState<Record<string, VehicleAcceptanceCompletion>>({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fetchingRef = useRef<Set<string>>(new Set());

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
            .catch((e: any) => setError(e?.message || t('acceptance_load_failed')))
            .finally(() => setLoading(false));
    }, [selectedSig]);

    if (!primaryKey) {
        return (
            <div className="bg-blue-100 border border-blue-200 text-blue-700 px-4 py-6 rounded-lg text-center">
                {t('select_vehicle_hint')}
            </div>
        );
    }

    // 只保留有数据的选中车，保持选择顺序（主车在前）。
    const vehiclesWithData = selectedKeys.filter(k => dataMap[k]);

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

    const anyOverall = vehiclesWithData.some(k => hasAnySample(dataMap[k].overall));
    if (vehiclesWithData.length === 0 || !anyOverall) {
        return (
            <div className="bg-blue-100 border border-blue-200 text-blue-700 px-4 py-6 rounded-lg text-center">
                {t('acceptance_no_data')}
            </div>
        );
    }

    // 梯度顺序：以任一车回传的 grades 为准，兜底用固定顺序。
    const grades = dataMap[vehiclesWithData[0]]?.grades?.length
        ? dataMap[vehiclesWithData[0]].grades
        : GRADES_ORDER;

    // 构造某场景（overall 或指定功能域）下各车的 series。
    const buildSeries = (domain: string | null): VehicleSeries[] =>
        vehiclesWithData.map(k => ({
            key: k,
            label: getVehicleLabel(k),
            color: getColor(k),
            isPrimary: k === primaryKey,
            stats: domain === null
                ? dataMap[k].overall
                : toDomainMap(dataMap[k])[domain] ?? null,
        }));

    // 参与「各功能域」展示的域：任一车在该域有样本即列出，保持规范顺序。
    const domainSet = new Set<string>();
    for (const k of vehiclesWithData) {
        for (const d of dataMap[k].by_domain) {
            if (hasAnySample(d.grades)) domainSet.add(d.function_domain);
        }
    }
    const orderedDomains = [
        ...STANDARD_FUNCTION_DOMAINS.filter(d => domainSet.has(d)),
        ...[...domainSet].filter(d => !STANDARD_FUNCTION_DOMAINS.includes(d)),
    ];

    return (
        <div className="space-y-6">
            {/* 说明 + 车辆图例 */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <ClipboardCheck className="w-5 h-5 text-secondary" />
                    <h2 className="text-lg font-bold text-text-primary">{t('acceptance_title')}</h2>
                </div>
                <VehicleLegend series={buildSeries(null)} />
            </div>
            <p className="text-xs text-text-muted -mt-3">{t('acceptance_desc')}</p>

            {/* 全功能域平均：各梯度分组，组内并排各车 */}
            <div className="bg-surface-raised p-5 rounded-xl border border-ink/[0.08] shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 mb-4">
                    <h3 className="font-bold text-text-primary flex items-center gap-2">
                        {trial ? td('出行域') : t('acceptance_overall')}
                    </h3>
                    <VehicleLegend series={buildSeries(null)} />
                </div>
                <GradeCompareChart grades={grades} series={buildSeries(null)} />
            </div>

            {/* 按验收梯度分组：每个梯度一个区块，区块内横排各功能域，功能域内并排各车 */}
            <div className="space-y-6">
                {grades.map(g => (
                    <div key={g} className="bg-surface-raised p-5 rounded-xl border border-ink/[0.08] shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 mb-4">
                            <h3 className="font-bold text-text-primary flex items-center gap-2">
                                <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: gradeColor(g) }} />
                                {gradeLabel(g, t)}
                            </h3>
                            <VehicleLegend series={buildSeries(null)} />
                        </div>
                        <DomainCompareChart
                            grade={g}
                            domains={orderedDomains}
                            domainLabel={td}
                            series={domain => buildSeries(domain)}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
};

// 车辆图例：色块 + 车名（本品带 ★）。每个区块都放一份，滚动后仍能对上颜色。
const VehicleLegend: React.FC<{ series: VehicleSeries[] }> = ({ series }) => (
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

// 按验收梯度分组的多车对比柱状图。每个梯度一组，组内每台车一根柱：
// 柱高 = 完成率百分比，柱顶标完成率，柱悬浮显示用例数，梯度下方标各车用例数。
const GradeCompareChart: React.FC<{
    grades: string[];
    series: VehicleSeries[];
    compact?: boolean;
}> = ({ grades, series, compact }) => {
    const { t } = useTranslation();
    const barH = compact ? 'h-40' : 'h-52';
    return (
        <div className={clsx('flex items-stretch', compact ? 'gap-4' : 'gap-6')}>
            {grades.map(g => (
                <div key={g} className="flex-1 flex flex-col min-w-0">
                    {/* 柱区 */}
                    <div className={clsx('flex items-end justify-center gap-1.5 pt-6', barH)}>
                        {series.map(sv => {
                            const s = sv.stats?.[g];
                            const rate = s?.completion_rate ?? null;
                            const pct = rate != null ? rate * 100 : null;
                            const heightPct = pct != null ? Math.max(2, pct) : 0;
                            const count = s?.case_count ?? 0;
                            return (
                                <div
                                    key={sv.key}
                                    className="flex-1 max-w-[36px] h-full flex flex-col items-center justify-end"
                                    title={`${sv.label}\n${gradeLabel(g, t)}\n${pct != null ? pct.toFixed(1) + '%' : t('no_data_hint')} · ${t('acceptance_case_count', { count })}`}
                                >
                                    <div className="text-[10px] font-bold tabular-nums mb-0.5 leading-none" style={{ color: sv.color }}>
                                        {pct != null ? `${pct.toFixed(0)}%` : '—'}
                                    </div>
                                    <div className="w-full flex-1 flex items-end">
                                        <div
                                            className="w-full rounded-t transition-all duration-500"
                                            style={{
                                                height: `${heightPct}%`,
                                                backgroundColor: sv.color,
                                                opacity: pct != null ? 1 : 0.15,
                                            }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    {/* 梯度名（用例数见柱子悬浮） */}
                    <div className="mt-2 pt-2 border-t border-ink/[0.06] text-center">
                        <div className="text-xs font-medium text-text-secondary truncate">{gradeLabel(g, t)}</div>
                    </div>
                </div>
            ))}
        </div>
    );
};

// 固定某个验收梯度，横排各功能域，功能域内并排各车对比。
// 柱高 = 该车在「该功能域 × 该梯度」的完成率，柱顶标完成率，功能域下标各车用例数。
const DomainCompareChart: React.FC<{
    grade: string;
    domains: string[];
    domainLabel: (d: string) => string;
    series: (domain: string) => VehicleSeries[];
}> = ({ grade, domains, domainLabel, series }) => {
    const { t } = useTranslation();
    return (
        <div className="flex items-stretch gap-4 overflow-x-auto pb-1">
            {domains.map(domain => {
                const sv = series(domain);
                return (
                    <div key={domain} className="flex-1 min-w-[120px] flex flex-col">
                        {/* 柱区 */}
                        <div className="flex items-end justify-center gap-1.5 pt-6 h-40">
                            {sv.map(v => {
                                const s = v.stats?.[grade];
                                const rate = s?.completion_rate ?? null;
                                const pct = rate != null ? rate * 100 : null;
                                const heightPct = pct != null ? Math.max(2, pct) : 0;
                                const count = s?.case_count ?? 0;
                                return (
                                    <div
                                        key={v.key}
                                        className="flex-1 max-w-[36px] h-full flex flex-col items-center justify-end"
                                        title={`${v.label}\n${domainLabel(domain)} · ${gradeLabel(grade, t)}\n${pct != null ? pct.toFixed(1) + '%' : t('no_data_hint')} · ${t('acceptance_case_count', { count })}`}
                                    >
                                        <div className="text-[10px] font-bold tabular-nums mb-0.5 leading-none" style={{ color: v.color }}>
                                            {pct != null ? `${pct.toFixed(0)}%` : '—'}
                                        </div>
                                        <div className="w-full flex-1 flex items-end">
                                            <div
                                                className="w-full rounded-t transition-all duration-500"
                                                style={{
                                                    height: `${heightPct}%`,
                                                    backgroundColor: v.color,
                                                    opacity: pct != null ? 1 : 0.15,
                                                }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        {/* 功能域名（用例数见柱子悬浮） */}
                        <div className="mt-2 pt-2 border-t border-ink/[0.06] text-center">
                            <div className="text-xs font-medium text-text-secondary truncate" title={domainLabel(domain)}>
                                {domainLabel(domain)}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default AcceptanceTab;
