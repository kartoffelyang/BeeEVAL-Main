import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    AlertCircle,
    ArrowLeft,
    Bot,
    Clock,
    Loader2,
    PlayCircle,
    RefreshCw,
    Repeat,
    Sparkles,
    Trash2,
} from 'lucide-react';

import {
    DrBeeQueryResponse,
    DrBeeSessionDetail,
    DrBeeSessionListItem,
    deleteDrBeeSession,
    getDrBeeSession,
    listDrBeeSessions,
    replayDrBeeSession,
} from '../api';
import VideoPlayerModal from '../components/VideoPlayerModal';
import { MarkdownAnswer } from '../components/MarkdownAnswer';
import { useMetricsTranslation } from '../hooks/useMetricsTranslation';

const DrBeeSessions: React.FC = () => {
    const { t } = useTranslation();
    const [sessions, setSessions] = useState<DrBeeSessionListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [detail, setDetail] = useState<DrBeeSessionDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);

    const [replay, setReplay] = useState<DrBeeQueryResponse | null>(null);
    const [replayLoading, setReplayLoading] = useState(false);
    const [replayError, setReplayError] = useState<string | null>(null);

    const [videoModalPath, setVideoModalPath] = useState<string | null>(null);
    const [videoModalTitle, setVideoModalTitle] = useState<string | null>(null);

    const refreshList = async () => {
        setLoading(true);
        setError(null);
        try {
            const list = await listDrBeeSessions({ limit: 200 });
            setSessions(list);
            if (list.length > 0 && selectedId === null) {
                setSelectedId(list[0].id);
            }
        } catch (err: any) {
            setError(err?.response?.data?.detail || err?.message || 'Failed to load');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        refreshList();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (selectedId === null) {
            setDetail(null);
            return;
        }
        let mounted = true;
        setDetailLoading(true);
        setReplay(null);
        setReplayError(null);
        getDrBeeSession(selectedId)
            .then((d) => mounted && setDetail(d))
            .catch((err) => mounted && setError(err?.response?.data?.detail || err?.message || 'Failed to load detail'))
            .finally(() => mounted && setDetailLoading(false));
        return () => {
            mounted = false;
        };
    }, [selectedId]);

    const handleDelete = async (id: number) => {
        if (!window.confirm(t('drbee_confirm_delete'))) return;
        try {
            await deleteDrBeeSession(id);
            setSessions((prev) => prev.filter((s) => s.id !== id));
            if (selectedId === id) {
                setSelectedId(null);
                setDetail(null);
            }
        } catch (err: any) {
            alert(err?.response?.data?.detail || err?.message || 'Delete failed');
        }
    };

    const handleReplay = async () => {
        if (!detail) return;
        setReplayLoading(true);
        setReplayError(null);
        setReplay(null);
        try {
            const res = await replayDrBeeSession(detail.id);
            setReplay(res);
        } catch (err: any) {
            setReplayError(err?.response?.data?.detail || err?.message || 'Replay failed');
        } finally {
            setReplayLoading(false);
        }
    };

    const formattedSessions = useMemo(() => {
        return sessions.map((s) => ({
            ...s,
            shortQ: s.user_question.length > 60 ? s.user_question.slice(0, 60) + '…' : s.user_question,
            timeStr: s.created_at?.replace('T', ' ').split('.')[0] ?? '',
        }));
    }, [sessions]);

    const openVideo = (path: string, title: string) => {
        setVideoModalPath(path);
        setVideoModalTitle(title);
    };

    return (
        <div className="p-6 lg:p-8 max-w-[1500px] mx-auto">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <Link
                        to="/drbee"
                        className="text-text-muted hover:text-primary p-2 rounded-lg hover:bg-ink/[0.05] transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <div className="bg-gradient-to-br from-primary to-secondary p-2.5 rounded-xl shadow-lg shadow-primary/20">
                        <Bot className="w-6 h-6 text-text-primary" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-text-primary font-sans">
                            {t('drbee_history')}
                        </h1>
                        <p className="text-sm text-text-muted">
                            {t('drbee_history_desc')}
                        </p>
                    </div>
                </div>
                <button
                    onClick={refreshList}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-raised border border-ink/[0.08] text-text-secondary hover:bg-ink/[0.05] hover:text-primary transition-colors text-sm"
                >
                    <RefreshCw className="w-4 h-4" />
                    {t('refresh')}
                </button>
            </div>

            {error && (
                <div className="flex items-start gap-2 text-red-700 bg-red-100 border border-red-200 rounded-lg p-3 mb-4 text-sm">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <div>{error}</div>
                </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-6">
                {/* List */}
                <div className="bg-surface-raised rounded-2xl border border-ink/[0.08] shadow-sm overflow-hidden flex flex-col max-h-[calc(100vh-180px)]">
                    <div className="px-4 py-2.5 border-b border-ink/[0.08] text-xs font-medium text-text-muted bg-surface/50">
                        {(t('drbee_total_sessions')) + ' ' + sessions.length + ' ' + (t('drbee_sessions_unit'))}
                    </div>
                    <div className="overflow-auto flex-1">
                        {loading && (
                            <div className="flex items-center justify-center text-text-muted py-12">
                                <Loader2 className="w-5 h-5 animate-spin" />
                            </div>
                        )}
                        {!loading && sessions.length === 0 && (
                            <div className="text-center text-sm text-text-muted py-12 px-4">
                                {t('drbee_no_sessions')}
                            </div>
                        )}
                        {formattedSessions.map((s) => (
                            <button
                                key={s.id}
                                onClick={() => setSelectedId(s.id)}
                                className={
                                    'w-full text-left px-4 py-3 border-b border-ink/[0.08] hover:bg-ink/[0.05] transition-colors ' +
                                    (selectedId === s.id ? 'bg-primary/5 border-l-4 border-l-primary' : '')
                                }
                            >
                                <div className="flex items-center justify-between gap-2 mb-1">
                                    <span className="font-medium text-sm text-text-primary truncate">
                                        {s.title || (t('drbee_untitled'))}
                                    </span>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDelete(s.id);
                                        }}
                                        className="text-text-muted hover:text-red-500 shrink-0"
                                        title={t('cancel')}
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                                <div className="text-xs text-text-muted truncate" title={s.user_question}>
                                    {s.shortQ}
                                </div>
                                <div className="flex items-center gap-2 mt-1.5 text-[10px] text-text-muted font-mono flex-wrap">
                                    <span>{s.model_name}</span>
                                    {s.total_latency_ms !== null && (
                                        <span className="inline-flex items-center gap-0.5">
                                            <Clock className="w-3 h-3" />
                                            {s.total_latency_ms}ms
                                        </span>
                                    )}
                                    {/* 检索模式 + 阈值徽标（老记录默认 manual） */}
                                    {(s.selection_mode || 'manual') === 'auto' ? (
                                        <span
                                            className={
                                                'px-1.5 py-0.5 rounded font-sans font-medium ' +
                                                (s.low_relevance
                                                    ? 'bg-amber-100 text-amber-700 border border-amber-200'
                                                    : 'bg-emerald-100 text-emerald-700 border border-emerald-200')
                                            }
                                            title={(t('drbee_mode_auto'))}
                                        >
                                            auto · {s.min_score !== null ? `≥${s.min_score.toFixed(2)}` : '—'}
                                            {s.top_score !== null && (
                                                <span className="ml-1 opacity-70">top {s.top_score.toFixed(2)}</span>
                                            )}
                                            {s.low_relevance && (
                                                <span className="ml-1">⚠</span>
                                            )}
                                        </span>
                                    ) : (
                                        <span className="px-1.5 py-0.5 rounded bg-surface-overlay text-text-muted border border-ink/[0.08] font-sans">
                                            manual · K={s.top_k ?? '-'}
                                        </span>
                                    )}
                                </div>
                                <div className="text-[10px] text-text-muted mt-0.5">{s.timeStr}</div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Detail */}
                <div className="space-y-4">
                    {!selectedId && (
                        <div className="bg-surface-raised border border-ink/[0.08] rounded-2xl p-12 text-center text-text-muted text-sm">
                            {t('drbee_select_a_session')}
                        </div>
                    )}

                    {detailLoading && (
                        <div className="bg-surface-raised border border-ink/[0.08] rounded-2xl p-12 text-center text-text-muted">
                            <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                        </div>
                    )}

                    {detail && !detailLoading && (
                        <>
                            {/* Meta + replay */}
                            <div className="bg-surface-raised rounded-2xl border border-ink/[0.08] shadow-sm p-5">
                                <div className="flex items-start justify-between gap-3 mb-3">
                                    <div className="flex-1">
                                        <h2 className="font-semibold text-text-primary">
                                            {detail.title || (t('drbee_untitled'))}
                                        </h2>
                                        <div className="text-xs text-text-muted mt-1 font-mono">
                                            #{detail.id} · {detail.model_name} ·{' '}
                                            {(detail.selection_mode || 'manual') === 'auto' ? (
                                                <>
                                                    <span className={detail.low_relevance ? 'text-amber-700' : 'text-emerald-700'}>
                                                        auto
                                                    </span>{' '}
                                                    · {(t('drbee_threshold'))}=
                                                    {detail.min_score !== null ? detail.min_score.toFixed(2) : '—'}
                                                    {detail.top_score !== null && (
                                                        <> · top_score={detail.top_score.toFixed(2)}</>
                                                    )}
                                                    {' '}· N={detail.top_k ?? '-'}
                                                </>
                                            ) : (
                                                <>manual · top_k={detail.top_k ?? '-'}</>
                                            )}{' '}
                                            ·{' '}
                                            {(t('drbee_llm_latency')) + ' ' + (detail.llm_latency_ms ?? '-') + 'ms'} ·{' '}
                                            {(t('drbee_total_latency')) + ' ' + (detail.total_latency_ms ?? '-') + 'ms'}
                                        </div>
                                        {detail.low_relevance && (
                                            <div className="mt-2 inline-flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                                                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                                <span>
                                                    {t('drbee_low_relevance_warn')}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        onClick={handleReplay}
                                        disabled={replayLoading}
                                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-text-inverse text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                                    >
                                        {replayLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Repeat className="w-4 h-4" />}
                                        {t('drbee_replay')}
                                    </button>
                                </div>

                                <div className="space-y-3">
                                    <Section title={t('drbee_question')}>
                                        <pre className="whitespace-pre-wrap text-sm text-text-secondary">{detail.user_question}</pre>
                                    </Section>
                                    <details className="text-sm">
                                        <summary className="text-xs font-medium text-text-muted cursor-pointer hover:text-primary">
                                            {t('drbee_view_prompt')}
                                        </summary>
                                        <pre className="mt-2 px-3 py-2 rounded-lg bg-surface border border-ink/[0.08] text-xs font-mono text-text-secondary leading-relaxed whitespace-pre-wrap max-h-72 overflow-auto">
                                            {detail.prompt_template}
                                        </pre>
                                    </details>
                                </div>
                            </div>

                            {/* Original answer */}
                            <div className="bg-surface-raised rounded-2xl border border-ink/[0.08] shadow-sm p-5">
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="font-semibold text-text-primary">{t('drbee_original_answer')}</h3>
                                </div>
                                <MarkdownAnswer text={detail.answer} onPlay={openVideo} />
                                {detail.retrieved_sources?.length > 0 && (
                                    <details className="mt-4 pt-4 border-t border-ink/[0.08]">
                                        <summary className="text-xs font-medium text-text-muted cursor-pointer hover:text-primary">
                                            {(t('drbee_sources_label')) + ` (${detail.retrieved_sources.length})`}
                                        </summary>
                                        <SourceMini sources={detail.retrieved_sources} onPlay={openVideo} />
                                    </details>
                                )}
                            </div>

                            {/* Replay result */}
                            {replayError && (
                                <div className="flex items-start gap-2 text-red-700 bg-red-100 border border-red-200 rounded-lg p-3 text-sm">
                                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                                    <div>{replayError}</div>
                                </div>
                            )}
                            {replay && (
                                <div className="bg-surface-raised rounded-2xl border-2 border-primary/30 shadow-sm p-5">
                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className="font-semibold text-text-primary flex items-center gap-2">
                                            <Repeat className="w-4 h-4 text-primary" />
                                            {t('drbee_replay_answer')}
                                        </h3>
                                        <div className="text-xs text-text-muted font-mono flex gap-2">
                                            <span>LLM {replay.llm_latency_ms}ms</span>
                                            <span>{t('total_ms', { ms: replay.total_latency_ms })}</span>
                                        </div>
                                    </div>
                                    <MarkdownAnswer text={replay.answer} onPlay={openVideo} />
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            <VideoPlayerModal
                open={!!videoModalPath}
                videoPath={videoModalPath}
                title={videoModalTitle}
                onClose={() => {
                    setVideoModalPath(null);
                    setVideoModalTitle(null);
                }}
            />
        </div>
    );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div>
        <div className="text-xs font-medium text-text-muted mb-1">{title}</div>
        <div className="px-3 py-2 rounded-lg bg-surface border border-ink/[0.08]">{children}</div>
    </div>
);

const SourceMini: React.FC<{
    sources: any[];
    onPlay: (path: string, title: string) => void;
}> = ({ sources, onPlay }) => {
    const { t } = useTranslation();
    const { tv } = useMetricsTranslation();
    return (
    <div className="mt-2 space-y-1.5 max-h-72 overflow-auto">
        {sources.map((s, i) => {
            const isSummary = s.doc_type === 'vehicle_summary';
            return (
                <div
                    key={i}
                    className={
                        'text-xs px-2 py-1.5 rounded border ' +
                        (isSummary
                            ? 'border-violet-200 bg-violet-50/40'
                            : 'border-ink/[0.08] hover:bg-ink/[0.05]')
                    }
                >
                    <div className="flex items-center gap-1.5">
                        {isSummary ? (
                            <span className="inline-flex items-center gap-1 text-violet-700 truncate">
                                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                                <span className="truncate">
                                    {`${s.brand_model ? tv(s.brand_model) : '—'}${s.system_version ? ` (V${s.system_version})` : ''} · ${t('vehicle_summary_card')}`}
                                </span>
                            </span>
                        ) : s.video_path ? (
                            <button
                                onClick={() => onPlay(s.video_path, s.video_name || s.video_path)}
                                className="text-primary hover:text-primary/80 inline-flex items-center gap-1 truncate"
                            >
                                <PlayCircle className="w-3.5 h-3.5 shrink-0" />
                                <span className="truncate">{s.video_name || s.video_path}</span>
                            </button>
                        ) : (
                            <span className="text-text-secondary truncate">{s.video_name || '—'}</span>
                        )}
                    </div>
                    <div className={(isSummary ? 'text-violet-700/70' : 'text-text-muted') + ' line-clamp-1 mt-0.5'}>
                        {s.summary || s.user_question || ''}
                    </div>
                </div>
            );
        })}
    </div>
    );
};

export default DrBeeSessions;
