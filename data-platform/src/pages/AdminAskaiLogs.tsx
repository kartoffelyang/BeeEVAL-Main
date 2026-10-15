import LightSelect from '../components/LightSelect';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle, Loader2, MessageSquareText, RefreshCcw,
    Search, X, BarChart3, ListOrdered, Table2,
} from 'lucide-react';

import {
    AskaiLogFilters, AskaiLogItem, AskaiStatsSummary, AskaiStatsTopN,
    adminListAskaiLogs, adminGetAskaiLog, adminAskaiStatsSummary,
    adminAskaiStatsTopN,
} from '../api';
import { useLanguage } from '../contexts/LanguageContext';

type Tab = 'detail' | 'dashboard' | 'topn';

const STATUS_META: Record<string, { key: string; cls: string }> = {
    ok: { key: 'askai_logs_status_ok', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    no_data: { key: 'askai_logs_status_no_data', cls: 'bg-surface-overlay text-gray-700 border-ink/15/40' },
    content_rejected: { key: 'askai_logs_status_content_rejected', cls: 'bg-red-100 text-red-700 border-red-200' },
    param_error: { key: 'askai_logs_status_param_error', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
    prepare_failed: { key: 'askai_logs_status_prepare_failed', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
    stream_failed: { key: 'askai_logs_status_stream_failed', cls: 'bg-red-100 text-red-700 border-red-200' },
    client_aborted: { key: 'askai_logs_status_client_aborted', cls: 'bg-surface-overlay text-gray-700 border-ink/15/40' },
};

const PAGE_SIZE = 50;

// 与项目其它表单一致的深色输入框样式
const INPUT_CLS = 'px-2 py-1.5 text-sm bg-surface border border-ink/[0.1] rounded-md text-text-primary focus:outline-none focus:border-primary/60';

// 默认查询窗口：最近 30 天（避免后端全表扫描，summary/topn 强制要求 start）
function defaultStart(): string {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
}

function fmtTime(s: string | null): string {
    if (!s) return '-';
    const ts = Date.parse(s);
    return Number.isNaN(ts) ? s : new Date(ts).toLocaleString();
}

function fmtMs(v: number | null | undefined): string {
    if (v == null) return '-';
    return v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${v}ms`;
}

const AdminAskaiLogs: React.FC = () => {
    const { t } = useLanguage();
    const [tab, setTab] = useState<Tab>('detail');

    // 三个 Tab 共享的筛选条件
    const [filters, setFilters] = useState<AskaiLogFilters>({ start: defaultStart() });
    const [draft, setDraft] = useState<AskaiLogFilters>({ start: defaultStart() });

    const applyFilters = useCallback(() => setFilters({ ...draft }), [draft]);
    const resetFilters = useCallback(() => {
        const fresh = { start: defaultStart() };
        setDraft(fresh);
        setFilters(fresh);
    }, []);

    return (
        <div className="p-6 max-w-[1400px] mx-auto">
            <Header tab={tab} filters={filters} />

            <div className="flex items-center gap-2 mb-4 border-b border-border/60">
                <TabButton active={tab === 'detail'} onClick={() => setTab('detail')}
                    icon={Table2} label={t('askai_logs_tab_detail')} />
                <TabButton active={tab === 'dashboard'} onClick={() => setTab('dashboard')}
                    icon={BarChart3} label={t('askai_logs_tab_dashboard')} />
                <TabButton active={tab === 'topn'} onClick={() => setTab('topn')}
                    icon={ListOrdered} label={t('askai_logs_tab_topn')} />
            </div>

            <FilterBar draft={draft} setDraft={setDraft} onApply={applyFilters} onReset={resetFilters} />

            <div className="mt-4">
                {tab === 'detail' && <DetailTab filters={filters} />}
                {tab === 'dashboard' && <DashboardTab filters={filters} />}
                {tab === 'topn' && <TopNTab filters={filters} />}
            </div>
        </div>
    );
};

// ============ Header（标题 + 保留期提示） ============
const Header: React.FC<{ tab: Tab; filters: AskaiLogFilters }> = () => {
    const { t } = useLanguage();
    return (
        <div className="mb-4">
            <div className="flex items-center justify-between">
                <h1 className="text-xl font-semibold text-text-primary flex items-center gap-2">
                    <MessageSquareText className="w-5 h-5 text-primary" />
                    {t('askai_logs_title')}
                </h1>

            </div>
            <div className="mt-3 flex items-start gap-2 px-3 py-2 rounded-md bg-amber-100
                border border-amber-200 text-amber-700/90 text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{t('askai_logs_retention_banner')}</span>
            </div>
        </div>
    );
};

const TabButton: React.FC<{
    active: boolean; onClick: () => void;
    icon: React.ComponentType<{ className?: string }>; label: string;
}> = ({ active, onClick, icon: Icon, label }) => (
    <button onClick={onClick}
        className={`flex items-center gap-1.5 px-4 py-2 text-sm border-b-2 -mb-px transition-colors ${
            active ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-text-secondary'
        }`}>
        <Icon className="w-4 h-4" />
        {label}
    </button>
);

// ============ FilterBar（三 Tab 共享） ============
const STATUS_OPTIONS = ['', 'ok', 'no_data', 'content_rejected', 'param_error', 'prepare_failed', 'stream_failed'];

const FilterBar: React.FC<{
    draft: AskaiLogFilters;
    setDraft: React.Dispatch<React.SetStateAction<AskaiLogFilters>>;
    onApply: () => void;
    onReset: () => void;
}> = ({ draft, setDraft, onApply, onReset }) => {
    const { t } = useLanguage();
    const upd = (patch: Partial<AskaiLogFilters>) => setDraft((d) => ({ ...d, ...patch }));

    return (
        <div className="flex flex-wrap items-end gap-3 p-3 rounded-lg bg-surface-light/40 border border-border/50">
            <Field label={t('askai_logs_filter_start')}>
                <input type="date" value={draft.start || ''}
                    onChange={(e) => upd({ start: e.target.value || undefined })}
                    className={INPUT_CLS} />
            </Field>
            <Field label={t('askai_logs_filter_end')}>
                <input type="date" value={draft.end || ''}
                    onChange={(e) => upd({ end: e.target.value || undefined })}
                    className={INPUT_CLS} />
            </Field>
            <Field label={t('askai_logs_filter_status')}>
                <LightSelect value={draft.status || ''}
                    onChange={(e) => upd({ status: e.target.value || undefined })}
                    className={INPUT_CLS}>
                    {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>{s ? t(STATUS_META[s]?.key || s) : '—'}</option>
                    ))}
                </LightSelect>
            </Field>
            <Field label={t('askai_logs_filter_model')}>
                <input type="text" value={draft.model_key || ''}
                    onChange={(e) => upd({ model_key: e.target.value || undefined })}
                    className={`${INPUT_CLS} w-28`} placeholder="model_key" />
            </Field>
            <Field label={t('askai_logs_filter_keyword')}>
                <input type="text" value={draft.keyword || ''}
                    onChange={(e) => upd({ keyword: e.target.value || undefined })}
                    onKeyDown={(e) => { if (e.key === 'Enter') onApply(); }}
                    className={`${INPUT_CLS} w-40`} />
            </Field>
            <label className="flex items-center gap-1.5 text-xs text-text-secondary pb-2 cursor-pointer">
                <input type="checkbox" checked={!!draft.low_relevance}
                    onChange={(e) => upd({ low_relevance: e.target.checked || undefined })} />
                {t('askai_logs_filter_low_relevance')}
            </label>
            <button onClick={onApply}
                className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-primary text-text-inverse text-sm hover:bg-primary/90">
                <Search className="w-4 h-4" />{t('askai_logs_filter_apply')}
            </button>
            <button onClick={onReset}
                className="px-3 py-1.5 rounded-md border border-border/60 text-text-muted text-sm hover:text-text-primary">
                {t('askai_logs_filter_reset')}
            </button>
        </div>
    );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div className="flex flex-col gap-1">
        <span className="text-[11px] text-text-muted">{label}</span>
        {children}
    </div>
);

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
    const { t } = useLanguage();
    const meta = STATUS_META[status] || { key: status, cls: 'bg-surface-overlay text-gray-700 border-ink/15/40' };
    return (
        <span className={`inline-block px-2 py-0.5 rounded text-[11px] border ${meta.cls}`}>
            {t(meta.key)}
        </span>
    );
};

// ============ Tab 1: 问答明细表 ============
const DetailTab: React.FC<{ filters: AskaiLogFilters }> = ({ filters }) => {
    const { t } = useLanguage();
    const [items, setItems] = useState<AskaiLogItem[]>([]);
    const [total, setTotal] = useState(0);
    const [offset, setOffset] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);
    const [detailId, setDetailId] = useState<number | null>(null);

    // 筛选条件变了，回到第一页
    useEffect(() => { setOffset(0); }, [filters]);

    const load = useCallback(async () => {
        setLoading(true);
        setError(false);
        try {
            const resp = await adminListAskaiLogs({ ...filters, limit: PAGE_SIZE, offset });
            setItems(resp.items);
            setTotal(resp.total);
        } catch {
            setError(true);
        } finally {
            setLoading(false);
        }
    }, [filters, offset]);

    useEffect(() => { load(); }, [load]);

    if (error) return <ErrorBox onRetry={load} />;

    return (
        <div>
            <div className="flex items-center justify-between mb-2 text-xs text-text-muted">
                <span>{t('askai_logs_total_count', { count: total })}</span>
                <button onClick={load} className="flex items-center gap-1 hover:text-text-primary">
                    <RefreshCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                    {t('askai_logs_refresh')}
                </button>
            </div>
            <div className="overflow-x-auto rounded-lg border border-border/50">
                <table className="w-full text-sm">
                    <thead className="bg-surface-light/40 text-text-muted text-xs">
                        <tr>
                            <Th>{t('askai_logs_col_time')}</Th>
                            <Th>{t('askai_logs_col_user')}</Th>
                            <Th>{t('askai_logs_col_question')}</Th>
                            <Th>{t('askai_logs_col_status')}</Th>
                            <Th>{t('askai_logs_col_model')}</Th>
                            <Th>{t('askai_logs_col_total_latency')}</Th>
                            <Th>{t('askai_logs_col_llm_latency')}</Th>
                            <Th>{t('askai_logs_col_retrieved')}</Th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((it) => (
                            <tr key={it.id} onClick={() => setDetailId(it.id)}
                                className="border-t border-border/40 hover:bg-surface-light/30 cursor-pointer">
                                <Td className="whitespace-nowrap text-text-muted">{fmtTime(it.created_at)}</Td>
                                <Td className="whitespace-nowrap">{it.display_snapshot || it.username_snapshot}</Td>
                                <Td className="max-w-[360px]">
                                    <span className="line-clamp-2" title={it.question}>{it.question}</span>
                                    {it.low_relevance && (
                                        <span className="ml-1 text-[10px] text-amber-700">[{t('askai_logs_low_relevance_tag')}]</span>
                                    )}
                                </Td>
                                <Td><StatusBadge status={it.status} /></Td>
                                <Td className="whitespace-nowrap text-text-muted">{it.model_name || '-'}</Td>
                                <Td className="whitespace-nowrap">{fmtMs(it.total_latency_ms)}</Td>
                                <Td className="whitespace-nowrap">{fmtMs(it.llm_latency_ms)}</Td>
                                <Td>{it.retrieved_count}</Td>
                            </tr>
                        ))}
                        {!loading && items.length === 0 && (
                            <tr><td colSpan={8} className="text-center py-10 text-text-muted">{t('askai_logs_empty')}</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
            <Pagination total={total} offset={offset} setOffset={setOffset} loading={loading} />
            {detailId !== null && <DetailModal id={detailId} onClose={() => setDetailId(null)} />}
        </div>
    );
};

const Th: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <th className="text-left font-medium px-3 py-2">{children}</th>
);
const Td: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
    <td className={`px-3 py-2 align-top ${className}`}>{children}</td>
);

const Pagination: React.FC<{
    total: number; offset: number;
    setOffset: React.Dispatch<React.SetStateAction<number>>; loading: boolean;
}> = ({ total, offset, setOffset, loading }) => {
    const { t } = useLanguage();
    const canPrev = offset > 0;
    const canNext = offset + PAGE_SIZE < total;
    if (total === 0) return null;
    return (
        <div className="flex items-center justify-end gap-2 mt-3 text-sm">
            <button disabled={!canPrev || loading} onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
                className="px-3 py-1 rounded border border-border/60 disabled:opacity-40 hover:text-text-primary">
                {t('askai_logs_prev')}
            </button>
            <span className="text-text-muted text-xs">
                {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} / {total}
            </span>
            <button disabled={!canNext || loading} onClick={() => setOffset((o) => o + PAGE_SIZE)}
                className="px-3 py-1 rounded border border-border/60 disabled:opacity-40 hover:text-text-primary">
                {t('askai_logs_next')}
            </button>
        </div>
    );
};

const ErrorBox: React.FC<{ onRetry: () => void }> = ({ onRetry }) => {
    const { t } = useLanguage();
    return (
        <div className="text-center py-12 text-text-muted">
            <p className="mb-3">{t('askai_logs_load_failed')}</p>
            <button onClick={onRetry} className="px-3 py-1.5 rounded border border-border/60 hover:text-text-primary text-sm">
                {t('askai_logs_refresh')}
            </button>
        </div>
    );
};

// ============ 详情 Modal ============
interface LogDetail {
    id: number;
    username_snapshot?: string;
    display_snapshot?: string;
    question?: string;
    answer?: string | null;
    status?: string;
    no_data_reason?: string | null;
    error_detail?: string | null;
    model_name?: string | null;
    created_at?: string | null;
    total_latency_ms?: number | null;
    llm_latency_ms?: number | null;
    sources?: Array<Record<string, unknown>> | null;
    sources_compressed_at?: string | null;
}

const DetailModal: React.FC<{ id: number; onClose: () => void }> = ({ id, onClose }) => {
    const { t } = useLanguage();
    const [data, setData] = useState<LogDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        let alive = true;
        (async () => {
            setLoading(true);
            setError(false);
            try {
                const d = await adminGetAskaiLog(id);
                if (alive) setData(d as unknown as LogDetail);
            } catch {
                if (alive) setError(true);
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, [id]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
            <div className="bg-surface border border-border/60 rounded-lg max-w-3xl w-full max-h-[85vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-3 border-b border-border/50 sticky top-0 bg-surface">
                    <h3 className="text-text-primary font-semibold">{t('askai_logs_detail_title')}</h3>
                    <button onClick={onClose} className="text-text-muted hover:text-text-primary"><X className="w-5 h-5" /></button>
                </div>
                <div className="p-5 space-y-4 text-sm">
                    {loading && <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>}
                    {error && <ErrorBox onRetry={() => setData(null)} />}
                    {data && !loading && (
                        <>
                            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-text-muted">
                                <span>{data.display_snapshot || data.username_snapshot}</span>
                                <span>{fmtTime(data.created_at || null)}</span>
                                <span>{data.model_name || '-'}</span>
                                <span>{t('askai_logs_col_total_latency')}: {fmtMs(data.total_latency_ms)}</span>
                                <span>{t('askai_logs_col_llm_latency')}: {fmtMs(data.llm_latency_ms)}</span>
                                {data.status && <StatusBadge status={data.status} />}
                            </div>

                            <Section title={t('askai_logs_detail_question')}>
                                <p className="whitespace-pre-wrap text-text-secondary">{data.question}</p>
                            </Section>

                            <Section title={t('askai_logs_detail_answer')}>
                                {data.answer
                                    ? <p className="whitespace-pre-wrap text-text-secondary">{data.answer}</p>
                                    : <p className="text-text-muted italic">{t('askai_logs_detail_no_answer')}</p>}
                            </Section>

                            {data.error_detail && (
                                <Section title={t('askai_logs_detail_error')}>
                                    <p className="whitespace-pre-wrap text-red-700/90 text-xs font-mono">{data.error_detail}</p>
                                </Section>
                            )}

                            <Section title={t('askai_logs_detail_sources')}>
                                {data.sources_compressed_at ? (
                                    <p className="text-text-muted text-xs italic">
                                        {t('askai_logs_detail_sources_compressed', { date: fmtTime(data.sources_compressed_at) })}
                                    </p>
                                ) : (data.sources && data.sources.length > 0) ? (
                                    <div className="space-y-2">
                                        {data.sources.map((s, i) => (
                                            <div key={i} className="px-3 py-2 rounded bg-surface-light/40 border border-border/40 text-xs">
                                                <div className="text-text-secondary font-medium truncate">
                                                    {String(s.video_name ?? `source ${i + 1}`)}
                                                    {s.score != null && <span className="ml-2 text-primary">{Number(s.score).toFixed(3)}</span>}
                                                </div>
                                                {s.summary != null && <div className="text-text-muted mt-1 line-clamp-2">{String(s.summary)}</div>}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-text-muted text-xs italic">{t('askai_logs_empty')}</p>
                                )}
                            </Section>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div>
        <h4 className="text-xs font-semibold text-text-muted uppercase mb-1">{title}</h4>
        {children}
    </div>
);

// ============ Tab 2: 指标仪表盘 ============
const STATUS_COLORS: Record<string, string> = {
    ok: '#36715a', no_data: '#9ca3af', content_rejected: '#f87171',
    param_error: '#a17b35', prepare_failed: '#a17b35', stream_failed: '#f87171',
    client_aborted: '#9ca3af',
};

const DashboardTab: React.FC<{ filters: AskaiLogFilters }> = ({ filters }) => {
    const { t } = useLanguage();
    const [data, setData] = useState<AskaiStatsSummary | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);

    const load = useCallback(async () => {
        if (!filters.start) return;
        setLoading(true);
        setError(false);
        try {
            const d = await adminAskaiStatsSummary({ start: filters.start, end: filters.end, bucket: 'day' });
            setData(d);
        } catch {
            setError(true);
        } finally {
            setLoading(false);
        }
    }, [filters.start, filters.end]);

    useEffect(() => { load(); }, [load]);

    if (error) return <ErrorBox onRetry={load} />;
    if (loading || !data) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

    const okCount = data.by_status.find((s) => s.status === 'ok')?.count ?? 0;
    const successRate = data.total > 0 ? Math.round((okCount / data.total) * 100) : 0;
    const lowRelPct = data.total > 0 ? Math.round((data.low_relevance_count / data.total) * 100) : 0;
    const maxTrend = Math.max(1, ...data.trend.map((b) => b.count));
    const maxStatus = Math.max(1, ...data.by_status.map((s) => s.count));

    return (
        <div className="space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <Kpi label={t('askai_logs_kpi_total')} value={String(data.total)} />
                <Kpi label={t('askai_logs_kpi_success_rate')} value={`${successRate}%`} />
                <Kpi label={t('askai_logs_kpi_low_relevance')} value={`${lowRelPct}%`} />
                <Kpi label={t('askai_logs_kpi_avg_total')} value={fmtMs(data.avg_total_latency_ms)} />
                <Kpi label={t('askai_logs_kpi_avg_llm')} value={fmtMs(data.avg_llm_latency_ms)} />
            </div>

            <Card title={t('askai_logs_chart_trend')}>
                <div className="flex items-end gap-1 h-40 pt-2">
                    {data.trend.map((b) => (
                        <div key={b.bucket} className="flex-1 flex flex-col items-center justify-end group" title={`${b.bucket}: ${b.count}`}>
                            <div className="w-full bg-primary/60 group-hover:bg-primary rounded-t transition-colors"
                                style={{ height: `${(b.count / maxTrend) * 100}%` }} />
                        </div>
                    ))}
                    {data.trend.length === 0 && <span className="text-text-muted text-xs m-auto">{t('askai_logs_empty')}</span>}
                </div>
                {data.trend.length > 0 && (
                    <div className="flex justify-between text-[10px] text-text-muted mt-1">
                        <span>{data.trend[0].bucket}</span>
                        <span>{data.trend[data.trend.length - 1].bucket}</span>
                    </div>
                )}
            </Card>

            <Card title={t('askai_logs_chart_status')}>
                <div className="space-y-2">
                    {data.by_status.map((s) => (
                        <div key={s.status} className="flex items-center gap-3">
                            <span className="text-xs text-text-muted w-28 truncate text-right shrink-0">
                                {t(STATUS_META[s.status]?.key || s.status)}
                            </span>
                            <div className="flex-1 bg-surface-light/40 rounded h-4 overflow-hidden">
                                <div className="h-full rounded" style={{
                                    width: `${Math.max(2, (s.count / maxStatus) * 100)}%`,
                                    backgroundColor: STATUS_COLORS[s.status] || '#60a5fa',
                                }} />
                            </div>
                            <span className="text-xs text-text-secondary w-12">{s.count}</span>
                        </div>
                    ))}
                </div>
            </Card>
        </div>
    );
};

const Kpi: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <div className="px-4 py-3 rounded-lg bg-surface-light/40 border border-border/50">
        <div className="text-[11px] text-text-muted">{label}</div>
        <div className="text-2xl font-semibold text-text-primary mt-1">{value}</div>
    </div>
);

const Card: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div className="p-4 rounded-lg bg-surface-light/40 border border-border/50">
        <h3 className="text-sm font-semibold text-text-secondary mb-3">{title}</h3>
        {children}
    </div>
);

// ============ Tab 3: Top N 排行 ============
const TopNTab: React.FC<{ filters: AskaiLogFilters }> = ({ filters }) => {
    const { t } = useLanguage();
    const [data, setData] = useState<AskaiStatsTopN | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);

    const load = useCallback(async () => {
        if (!filters.start) return;
        setLoading(true);
        setError(false);
        try {
            const d = await adminAskaiStatsTopN({ start: filters.start, end: filters.end, limit: 10 });
            setData(d);
        } catch {
            setError(true);
        } finally {
            setLoading(false);
        }
    }, [filters.start, filters.end]);

    useEffect(() => { load(); }, [load]);

    if (error) return <ErrorBox onRetry={load} />;
    if (loading || !data) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <RankCard title={t('askai_logs_topn_users')}
                rows={data.top_users.map((u) => ({ label: u.username, count: u.count }))} />
            <RankCard title={t('askai_logs_topn_no_data')}
                rows={data.top_no_data_questions.map((q) => ({ label: q.question, count: q.count }))} />
            <RankCard title={t('askai_logs_topn_low_rel')}
                rows={data.top_low_relevance_questions.map((q) => ({ label: q.question, count: q.count }))} />
        </div>
    );
};

const RankCard: React.FC<{ title: string; rows: Array<{ label: string; count: number }> }> = ({ title, rows }) => {
    const { t } = useLanguage();
    const max = Math.max(1, ...rows.map((r) => r.count));
    return (
        <Card title={title}>
            <ol className="space-y-2">
                {rows.map((r, i) => (
                    <li key={i} className="text-xs">
                        <div className="flex items-center gap-2">
                            <span className="text-text-muted w-5 shrink-0">{i + 1}.</span>
                            <span className="flex-1 truncate text-text-secondary" title={r.label}>{r.label}</span>
                            <span className="text-primary shrink-0">{t('askai_logs_topn_count', { count: r.count })}</span>
                        </div>
                        <div className="ml-7 mt-1 bg-surface-light/40 rounded h-1.5 overflow-hidden">
                            <div className="h-full bg-primary/60 rounded" style={{ width: `${(r.count / max) * 100}%` }} />
                        </div>
                    </li>
                ))}
                {rows.length === 0 && <li className="text-text-muted text-center py-4">{t('askai_logs_topn_empty')}</li>}
            </ol>
        </Card>
    );
};

export default AdminAskaiLogs;
