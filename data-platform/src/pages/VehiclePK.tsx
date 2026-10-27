import {useTrialAccess, TRIAL_DOMAIN} from "../contexts/TrialContext";
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Swords, Clock, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, ArrowUpDown, SlidersHorizontal } from 'lucide-react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { useMetricsTranslation } from '../hooks/useMetricsTranslation';
import { getPKCases, getFilterOptions, type PKCaseItem } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { useComparison, vehicleKey, parseVehicleKey } from './vehicle-scores/ComparisonContext';
import VehicleSelector from './vehicle-scores/VehicleSelector';
import PKCompareModal from './vehicle-scores/PKCompareModal';

const PAGE_SIZE_OPTIONS = [20, 50, 100];

// 得分色阶（1 位小数由调用处 toFixed(1)）
const scoreClass = (s: number | null | undefined) =>
    s == null ? 'text-text-muted'
        : s >= 4 ? 'bg-emerald-100 text-emerald-700'
            : s >= 3 ? 'bg-amber-100 text-amber-700'
                : 'bg-rose-100 text-rose-700';

type SortKey = string; // 'case_id' | 'function_domain' | `score:<brand_model>`
type SortDir = 'asc' | 'desc';

const VehiclePK: React.FC = () => {
    const {trial,guardDomain}=useTrialAccess();
    const { t } = useTranslation();
    const { td, tv } = useMetricsTranslation();
    const { user } = useAuth();
    const { primaryKey, competitorKeys } = useComparison();

    // 体验员（viewer）内测期禁用车型 PK：保留入口，进入渲染占位提示。
    if (user?.role === 'viewer') {
        return (
            <div className="p-8 max-w-7xl mx-auto">
                <div className="bg-surface-raised rounded-2xl border border-ink/[0.08] shadow-sm
                                py-20 px-8 flex flex-col items-center justify-center text-center
                                space-y-4 min-h-[60vh]">
                    <div className="w-16 h-16 rounded-2xl bg-purple-100 border border-purple-200
                                    flex items-center justify-center">
                        <Swords className="w-8 h-8 text-purple-700" />
                    </div>
                    <h1 className="text-2xl font-bold text-text-primary">{t('vehicle_pk')}</h1>
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full
                                    bg-amber-100 border border-amber-200 text-amber-700 text-sm">
                        <Clock className="w-4 h-4" />
                        {t('vehicle_pk_coming_soon')}
                    </div>
                    <p className="text-text-muted text-sm max-w-md mt-2">{t('vehicle_pk_coming_soon_desc')}</p>
                </div>
            </div>
        );
    }

    // 选中车型 = 本品 + 竞品（本品排首列），最多 5 款。
    const selectedKeys = useMemo(() => {
        const keys: string[] = [];
        if (primaryKey) keys.push(primaryKey);
        for (const k of competitorKeys) if (!keys.includes(k)) keys.push(k);
        return keys;
    }, [primaryKey, competitorKeys]);

    const [domains, setDomains] = useState<string[]>([]);
    const [domainFilter, setDomainFilter] = useState(trial ? TRIAL_DOMAIN : '');
    useEffect(()=>{if(trial && domainFilter!==TRIAL_DOMAIN)setDomainFilter(TRIAL_DOMAIN)},[trial,domainFilter]);
    const [cases, setCases] = useState<PKCaseItem[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState(50);
    const [loading, setLoading] = useState(false);
    const [sortBy, setSortBy] = useState<SortKey>('case_id');
    const [sortDir, setSortDir] = useState<SortDir>('asc');

    // 点击得分弹出的对比：baseKey 为本品，compareKey 为竞品（相同则单开）。
    const [compare, setCompare] = useState<{ caseId: string; baseKey: string; compareKey: string } | null>(null);

    useEffect(() => {
        getFilterOptions().then(opts => setDomains(opts.function_domains || [])).catch(() => {});
    }, []);

    const fetchCases = useCallback(async (pageNum: number) => {
        if (selectedKeys.length < 2) { setCases([]); setTotal(0); return; }
        setLoading(true);
        try {
            const brandModels = selectedKeys.map(k => parseVehicleKey(k).brand_model).join(',');
            const params: any = {
                brand_models: brandModels,
                offset: pageNum * pageSize,
                limit: pageSize,
                sort_by: sortBy,
                sort_dir: sortDir,
            };
            if (domainFilter) params.function_domain = domainFilter;
            const res = await getPKCases(params);
            setCases(res.data || []);
            setTotal(res.total || 0);
        } catch { setCases([]); setTotal(0); }
        finally { setLoading(false); }
    }, [selectedKeys, domainFilter, pageSize, sortBy, sortDir]);

    // 选择 / 筛选 / 排序 / 页大小变化 → 回到首页重新拉。
    useEffect(() => { setPage(0); fetchCases(0); }, [fetchCases]);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    // 点击表头排序：同键切方向，异键换键并给默认方向。
    const toggleSort = (key: SortKey) => {
        if (sortBy === key) {
            setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortBy(key);
            // 得分默认降序（先看高分），ID/域默认升序
            setSortDir(key.startsWith('score:') ? 'desc' : 'asc');
        }
    };

    const SortIcon: React.FC<{ active: boolean }> = ({ active }) =>
        !active ? <ArrowUpDown className="w-3 h-3 opacity-40" />
            : sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />;

    // 点击得分格：本品列 → 单开；竞品列 → 本品 vs 该竞品。
    const onScoreClick = (caseId: string, colKey: string) => {
        if (!primaryKey) return;
        setCompare({ caseId, baseKey: primaryKey, compareKey: colKey });
    };

    const getLabel = (key: string) => {
        const { brand_model, system_version } = parseVehicleKey(key);
        const name = tv(brand_model);
        return system_version ? `${name} · V${system_version}` : name;
    };

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-6">
            {/* 顶部：本品/竞品选择（与其他模块统一） */}
            <div className="bg-surface-raised p-5 rounded-2xl border border-ink/[0.08] shadow-sm space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-text-secondary">
                    <span>{t('pk_select_hint')}</span>
                    <span className="text-xs text-text-muted font-normal">{t('pk_select_limit')}</span>
                </div>
                <VehicleSelector maxCompetitors={4} />
            </div>

            {/* 功能域筛选：大号 pill 按钮 */}
            <div className="flex items-start gap-3 flex-wrap">
                <span className="text-sm text-text-muted inline-flex items-center gap-1.5 mt-2">
                    <SlidersHorizontal className="w-4 h-4" /> {t('filter_domain')}:
                </span>
                <div className="flex flex-wrap gap-2">
                    <DomainPill active={domainFilter === ''} onClick={() => {if(guardDomain('全部功能域'))setDomainFilter('')}}>
                        {t('all_domains')}
                    </DomainPill>
                    {domains.map(d => (
                        <DomainPill key={d} active={domainFilter === d} onClick={() => {if(guardDomain(d))setDomainFilter(d)}}>
                            {td(d)}
                        </DomainPill>
                    ))}
                </div>
            </div>

            {/* 主体：用例矩阵表 */}
            {selectedKeys.length < 2 ? (
                <div className="bg-secondary/[0.08] border border-secondary/[0.25] text-secondary px-4 py-10 rounded-xl text-center text-sm">
                    {t('pk_need_two')}
                </div>
            ) : loading ? (
                <div className="text-center py-16 text-text-muted">{t('loading')}</div>
            ) : cases.length === 0 ? (
                <div className="text-center py-16 text-text-muted border border-dashed border-ink/[0.08] rounded-xl">
                    {t('no_data')}
                </div>
            ) : (
                <div className="bg-surface-raised rounded-2xl border border-ink/[0.08] shadow-sm overflow-hidden">
                    {/* 工具条：总数 + 每页数量 */}
                    <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-ink/[0.08] flex-wrap">
                        <span className="text-xs text-text-muted">{t('total_cases', { count: total })}</span>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-text-muted">{t('pk_per_page')}:</span>
                            {PAGE_SIZE_OPTIONS.map(sz => (
                                <button
                                    key={sz}
                                    onClick={() => setPageSize(sz)}
                                    className={clsx(
                                        'px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors border',
                                        pageSize === sz
                                            ? 'bg-secondary text-text-inverse border-secondary'
                                            : 'border-ink/[0.1] text-text-muted hover:text-text-primary hover:border-ink/[0.25]',
                                    )}
                                >
                                    {sz}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-ink/[0.08] bg-surface">
                                    <th className="px-3 py-3 text-left w-24">
                                        <button onClick={() => toggleSort('case_id')} className="inline-flex items-center gap-1 text-xs font-semibold text-text-muted hover:text-text-primary transition-colors">
                                            {t('col_case_id')} <SortIcon active={sortBy === 'case_id'} />
                                        </button>
                                    </th>
                                    <th className="px-3 py-3 text-left text-xs font-semibold text-text-muted">{t('col_question')}</th>
                                    <th className="px-3 py-3 text-left w-28">
                                        <button onClick={() => toggleSort('function_domain')} className="inline-flex items-center gap-1 text-xs font-semibold text-text-muted hover:text-text-primary transition-colors">
                                            {t('col_domain')} <SortIcon active={sortBy === 'function_domain'} />
                                        </button>
                                    </th>
                                    {selectedKeys.map(k => {
                                        const isPrimary = k === primaryKey;
                                        const sk = `score:${parseVehicleKey(k).brand_model}`;
                                        return (
                                            <th key={k} className="px-3 py-3 text-center w-28">
                                                <button onClick={() => toggleSort(sk)} className="inline-flex flex-col items-center gap-0.5 mx-auto group">
                                                    <span className={clsx(
                                                        'inline-flex items-center gap-1 text-xs font-semibold transition-colors',
                                                        isPrimary ? 'text-secondary' : 'text-text-muted group-hover:text-text-primary',
                                                    )}>
                                                        {isPrimary && '★ '}{tv(parseVehicleKey(k).brand_model)}
                                                        <SortIcon active={sortBy === sk} />
                                                    </span>
                                                    <span className="text-[10px] text-text-muted font-normal">
                                                        {isPrimary ? t('pk_primary_tag') : t('pk_competitor_tag')}
                                                    </span>
                                                </button>
                                            </th>
                                        );
                                    })}
                                </tr>
                            </thead>
                            <tbody>
                                {cases.map(c => (
                                    <tr key={c.case_id} className="border-b border-ink/[0.04] hover:bg-ink/[0.02]">
                                        <td className="px-3 py-2.5 text-xs text-text-secondary font-mono">{c.case_id}</td>
                                        <td className="px-3 py-2.5 text-xs text-text-secondary max-w-[320px]">
                                            <span className="truncate block" title={c.user_question || ''}>{c.user_question || '-'}</span>
                                        </td>
                                        <td className="px-3 py-2.5 text-xs text-text-muted">{td(c.function_domain || '-')}</td>
                                        {selectedKeys.map(k => {
                                            // Explicit versions must not fall back to records whose version is unknown.
                                            const entry = c.scores[k];
                                            const score = entry?.score;
                                            const clickable = score != null;
                                            return (
                                                <td key={k} className="px-3 py-2.5 text-center">
                                                    {clickable ? (
                                                        <button
                                                            onClick={() => onScoreClick(c.case_id, k)}
                                                            className={clsx(
                                                                'px-2.5 py-1 rounded-lg text-xs font-bold transition-transform hover:scale-110 cursor-pointer',
                                                                scoreClass(score),
                                                            )}
                                                            title={k === primaryKey ? t('pk_click_single') : t('pk_click_compare')}
                                                        >
                                                            {Number(score).toFixed(1)}
                                                        </button>
                                                    ) : (
                                                        <span className="text-text-muted text-xs">-</span>
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* 分页 */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-center gap-3 py-3 border-t border-ink/[0.08]">
                            <button onClick={() => { const p = page - 1; setPage(p); fetchCases(p); }} disabled={page === 0}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-ink/[0.1] text-xs hover:bg-ink/[0.05] disabled:opacity-30">
                                <ChevronLeft className="w-3.5 h-3.5" />
                            </button>
                            <span className="text-xs text-text-secondary font-mono">{page + 1} / {totalPages}</span>
                            <button onClick={() => { const p = page + 1; setPage(p); fetchCases(p); }} disabled={page + 1 >= totalPages}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-ink/[0.1] text-xs hover:bg-ink/[0.05] disabled:opacity-30">
                                <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* 对比 / 单开弹窗 */}
            {compare && (
                <PKCompareModal
                    caseId={compare.caseId}
                    baseKey={compare.baseKey}
                    compareKey={compare.compareKey}
                    getLabel={getLabel}
                    onClose={() => setCompare(null)}
                />
            )}
        </div>
    );
};

// 功能域大号按钮
const DomainPill: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
    <button
        onClick={onClick}
        className={clsx(
            'px-4 py-2 rounded-xl text-sm font-semibold transition-all border',
            active
                ? 'bg-secondary text-text-inverse border-secondary shadow-sm'
                : 'bg-surface-raised border-ink/[0.1] text-text-secondary hover:text-text-primary hover:border-ink/[0.25]',
        )}
    >
        {children}
    </button>
);

export default VehiclePK;
