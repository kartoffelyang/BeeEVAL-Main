import LightSelect from '../components/LightSelect';
import React, { useEffect, useState, useCallback } from 'react';
import { getAllResults, updateResult, deleteResult, deleteResultsBatch, getMetricsRegistry, getDomainWeights, reanalyzeResults, getBatches, getResultsOverview, batchReviewResults, getReviewTriage, recomputeReviewTriage, getResultCompare, getQualityCheck, recomputeQualityCheck, getQualityCheckProgress, getFilterOptions, batchFixCaseId, getQualityDuplicates, recomputeQualityDuplicates, getQualityDuplicatesProgress, confirmQualityConsistent, getReviewTriageProgress, getTriagePairs, getCaseIdOverview, approveTriageGroup, reverifyFailedBatch, getReverifyFailedProgress, PaginatedResponse, MetricRegistryItem, AnalysisBatch, ResultsOverview, ReviewTriage, CompareRecord, OfficialCase, QualityCheckRow, QCProgress, DuplicateGroup, TriagePair } from '../api';
import { getScreenshotUrl } from '../config';
import { Loader2, Search, Trash2, Edit2, X, Save, PlayCircle, CheckSquare, Square, Info, ArrowUpDown, Tag, Cpu, GitBranch, Gauge, Filter, ChevronLeft, ChevronRight, AlertTriangle, Plus, RefreshCw, CheckCircle2, Database as DatabaseIcon, ClipboardCheck, Copy, LayoutGrid, Eye, ShieldCheck, GitCompare, ChevronDown, Check, Car } from 'lucide-react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import TranslatedText from '../components/TranslatedText';
import VideoPlayerModal from '../components/VideoPlayerModal';
import ResultDetailModal from '../components/ResultDetailModal';
import { useMetricsTranslation } from '../hooks/useMetricsTranslation';
import VehicleUpdateDialog from './vehicle-scores/VehicleUpdateDialog';
import { format } from 'date-fns';

// 批次标签：分析时间 + 来源(重分析标注) + 条数。例：「06-21 03:49 · 49条」
// 条数用 db_count（本页实际显示数：排除 failed/invalid，保留待审核），与列表 total 一致。
const fmtBatchLabel = (b: { created_at: string; source: string; folder_path: string; db_count: number }) => {
    let timeStr = b.created_at;
    try { timeStr = format(new Date(b.created_at), 'MM-dd HH:mm'); } catch { /* 保底用原值 */ }
    const reAnalyzed = b.folder_path === 'mimo-reanalyze' ? '重分析 · ' : '';
    return `${reAnalyzed}${timeStr} · ${b.db_count}条`;
};

// 仅时间，用于每行的批次小标签
const fmtBatchTime = (createdAt?: string) => {
    if (!createdAt) return '';
    try { return format(new Date(createdAt), 'MM-dd HH:mm'); } catch { return createdAt; }
};

// Sort types
type SortConfig = {
    key: 'case_id' | 'brand_model' | 'system_version' | 'function_domain' | 'score' | 'latency' | null;
    direction: 'asc' | 'desc';
};

// Filter types
type FilterConfig = {
    case_id: string;
    brand_model: string;
    system_version: string;
    function_domain: string;
    score_min: string;
    score_max: string;
};

const PAGE_SIZE = 20;

// 分诊四分组的视觉配置：图标 + 配色
const TRIAGE_GROUP_UI: Record<string, { icon: any; color: string; ring: string }> = {
    unique_keep:            { icon: ShieldCheck,color: 'text-emerald-700', ring: 'border-emerald-200 bg-emerald-100' },
    completed_duplicate:    { icon: Copy,       color: 'text-rose-700',    ring: 'border-rose-200 bg-rose-100' },
    content_differs:        { icon: Eye,        color: 'text-amber-700',   ring: 'border-amber-200 bg-amber-100' },
    unclassified:           { icon: AlertTriangle, color: 'text-text-muted', ring: 'border-ink/[0.1] bg-surface-raised' },
};

// Parse video name to extract structured info
// Format: {case_id}-{brand_model}-{system_version}-{function_domain}-{scenario}-{sequence}.mp4
// Example: 1002-理想 i8-v8.0.1-车控域-NULL-1.mp4
const parseVideoName = (filename: string) => {
    const parts = filename.split('-');
    if (parts.length >= 4) {
        return {
            case_id: parts[0] || '',
            brand_model: parts[1] || '',
            system_version: parts[2] || '',
            function_domain: parts[3] || '',
            parsed: true
        };
    }
    return {
        case_id: '',
        brand_model: '',
        system_version: '',
        function_domain: '',
        parsed: false
    };
};

// Image Modal Component
const ImageModal = ({ src, onClose }: { src: string; onClose: () => void }) => {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm" onClick={onClose}>
            <div className="relative max-w-7xl max-h-[90vh] p-4" onClick={e => e.stopPropagation()}>
                <button
                    onClick={onClose}
                    className="absolute top-0 right-0 -mt-12 text-text-primary/70 hover:text-text-primary transition-colors"
                >
                    <X className="w-8 h-8" />
                </button>
                <img
                    src={src}
                    alt="Full size"
                    className="w-full h-full object-contain rounded-lg shadow-2xl shadow-ink/40"
                />
            </div>
        </div>
    );
};

// 对比弹窗：并排展示「待审核」这条 vs 库里同ID「已通过」记录，供人工直观判断留/删
const CompareRecordCard = ({ rec, label, tone, officialContent, metricNames, onViewCard, onDelete, deleteDisabled, deleteLabel, onKeep, keepDisabled, keepLabel }: {
    rec: CompareRecord; label: string; tone: 'pending' | 'approved' | 'candidate';
    officialContent?: string | null;
    metricNames?: Record<string, string>;
    onViewCard?: () => void;
    onDelete?: () => void; deleteDisabled?: boolean; deleteLabel?: string;
    onKeep?: () => void; keepDisabled?: boolean; keepLabel?: string;
}) => {
    const meta = rec.metadata || {};
    const scoreColor = (s: number) => s >= 4 ? 'text-emerald-700' : s >= 3 ? 'text-amber-700' : 'text-rose-700';
    // 归一化后与官方诉求比对：不同则提示"识别话术与官方题库不一致"，帮判断是否用错了用例
    const norm = (s?: string | null) => (s || '').replace(/[\s，。、；：？！,.;:?!"'（）()【】\[\]{}<>《》~`\-_]+/g, '').toLowerCase();
    const mismatchOfficial = officialContent != null && norm(meta.user_question) !== norm(officialContent);
    const border = tone === 'pending' ? "border-orange-200 bg-orange-100"
        : tone === 'candidate' ? "border-sky-200 bg-sky-100"
        : "border-emerald-200 bg-emerald-100";
    const badge = tone === 'pending' ? "bg-orange-100 text-orange-700"
        : tone === 'candidate' ? "bg-sky-100 text-sky-700"
        : "bg-emerald-100 text-emerald-700";
    return (
        <div className={clsx("flex-1 min-w-0 rounded-xl border p-4 overflow-auto", border)}>
            <div className="flex items-center justify-between mb-3">
                <span className={clsx("text-xs font-bold px-2 py-0.5 rounded-full", badge)}>
                    {label}
                </span>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] text-text-muted font-mono truncate max-w-[120px]" title={rec.video_name}>{rec.video_name}</span>
                    {onViewCard && (
                        <button onClick={onViewCard}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border border-ink/[0.12] text-text-secondary hover:bg-ink/[0.06]"
                            title="查看完整卡片（含视频和评价）">
                            <PlayCircle className="w-3 h-3" /> 完整卡片
                        </button>
                    )}
                    {onKeep && (
                        <button onClick={onKeep} disabled={keepDisabled}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border border-emerald-600/50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-40"
                            title={keepLabel}>
                            <CheckCircle2 className="w-3 h-3" /> {keepLabel}
                        </button>
                    )}
                    {onDelete && (
                        <button onClick={onDelete} disabled={deleteDisabled}
                            className="p-1 rounded text-text-muted hover:text-rose-700 hover:bg-rose-100 disabled:opacity-40"
                            title={deleteLabel}>
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
            </div>
            <div className="space-y-2 text-sm">
                <div className="flex items-center gap-3">
                    <span className={clsx("text-2xl font-bold", scoreColor(Number(meta.response_quality_score) || 0))}>
                        {meta.response_quality_score ?? '-'}
                    </span>
                    <div className="text-[11px] text-text-muted">
                        <div>轮次: {meta.dialogue_turns ?? '-'} · 延迟: {meta.latency_ms ? `${meta.latency_ms}ms` : '-'}</div>
                        <div>任务: {meta.task_success === true ? '成功' : meta.task_success === false ? '失败' : '未判定'}</div>
                    </div>
                </div>
                <div>
                    <div className="text-[11px] text-text-muted mb-0.5 flex items-center gap-1">
                        用户问题（识别）
                        {mismatchOfficial && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-700" title="识别话术与官方题库诉求不一致，可能用错了用例">
                                <AlertTriangle className="w-3 h-3" /> 与官方不一致
                            </span>
                        )}
                    </div>
                    <div className={clsx("text-text-secondary bg-surface-overlay rounded p-2 text-xs whitespace-pre-wrap",
                        mismatchOfficial && "ring-1 ring-amber-700/40")}>{meta.user_question || '-'}</div>
                </div>
                <div>
                    <div className="text-[11px] text-text-muted mb-0.5">系统回答</div>
                    <div className="text-text-secondary bg-surface-overlay rounded p-2 text-xs whitespace-pre-wrap max-h-40 overflow-auto">{meta.system_response || '-'}</div>
                </div>
                <div>
                    <div className="text-[11px] text-text-muted mb-0.5">评估总结</div>
                    <div className="text-text-secondary bg-surface-overlay rounded p-2 text-xs whitespace-pre-wrap max-h-28 overflow-auto">{meta.summary || '-'}</div>
                </div>
                {rec.evaluation_scores && rec.evaluation_scores.length > 0 && (
                    <div>
                        <div className="text-[11px] text-text-muted mb-1">指标评分</div>
                        <div className="space-y-1.5">
                            {rec.evaluation_scores.filter((e: any) => (e.metric_code || '') !== 'C11').map((e: any, i: number) => {
                                const code = e.metric_code || '';
                                const name = (metricNames && code && metricNames[code]) || e.criteria || code;
                                return (
                                    <div key={i} className="bg-ink/[0.04] rounded p-1.5">
                                        <div className="flex items-center gap-1.5 text-[11px]">
                                            {code && <span className="font-mono text-text-muted">{code}</span>}
                                            <span className="text-text-primary font-medium">{name}</span>
                                            <span className={clsx("ml-auto font-bold", scoreColor(Number(e.score) || 0))}>{e.score}</span>
                                        </div>
                                        {e.feedback && <div className="text-[10px] text-text-secondary mt-0.5 leading-snug">{e.feedback}</div>}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

const CompareModal = ({ resultId, metricNames, onClose, onDeleted, onApproved }: {
    resultId: string;
    metricNames: Record<string, string>;
    onClose: () => void;
    onDeleted: () => void;
    onApproved: () => void;
}) => {
    const { t } = useTranslation();
    const [data, setData] = useState<{ target: CompareRecord; approved_same_id: CompareRecord[]; pending_same_id: CompareRecord[]; official_case: OfficialCase | null } | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    // 嵌套：查看完整卡片（ResultDetailModal）+ 视频播放
    const [detailRec, setDetailRec] = useState<any | null>(null);
    const [videoModal, setVideoModal] = useState<{ open: boolean; path: string; title: string }>({ open: false, path: '', title: '' });

    const reload = () => {
        setLoading(true);
        getResultCompare(resultId).then(setData).catch(() => setData(null)).finally(() => setLoading(false));
    };
    useEffect(reload, [resultId]);

    const doDelete = async () => {
        if (!window.confirm(t('triage_compare_delete_confirm'))) return;
        setBusy(true);
        try { await deleteResult(resultId); onDeleted(); }
        catch { alert(t('delete_failed')); } finally { setBusy(false); }
    };
    const doApprove = async () => {
        setBusy(true);
        try { await batchReviewResults([resultId], true); onApproved(); }
        catch { alert(t('batch_review_failed')); } finally { setBusy(false); }
    };
    // 删除库内已通过记录（当年可能批准错了）。删完刷新对比，弹窗不关（待审核这条还要处理）。
    const doDeleteApproved = async (id: string) => {
        if (!window.confirm(t('triage_compare_delete_approved_confirm'))) return;
        setBusy(true);
        try { await deleteResult(id); onDeleted(); }
        catch { alert(t('delete_failed')); } finally { setBusy(false); }
    };

    const approvedList = data?.approved_same_id || [];
    const pendingList = data?.pending_same_id || [];   // 同组其它待审核候选
    const hasApproved = approvedList.length > 0;
    // 四选项组合动作（待审核 vs 库里同ID）——仅当库里已有同ID已通过记录时用
    // 1 保留待审核+删库里  2 保留库里+删待审核  3 都删  4 都保留(待审核校验通过)
    const doOpt = async (opt: 1 | 2 | 3 | 4) => {
        const labels: Record<number, string> = {
            1: t('review_opt1_confirm'), 2: t('review_opt2_confirm'),
            3: t('review_opt3_confirm'), 4: t('review_opt4_confirm'),
        };
        if (!window.confirm(labels[opt])) return;
        setBusy(true);
        try {
            if (opt === 1) { // 保留待审核(通过) + 删库里全部同ID
                await batchReviewResults([resultId], true);
                if (approvedList.length) await deleteResultsBatch(approvedList.map(a => a.id));
            } else if (opt === 2) { // 保留库里 + 删待审核
                await deleteResult(resultId);
            } else if (opt === 3) { // 都删
                await deleteResultsBatch([resultId, ...approvedList.map(a => a.id)]);
            } else if (opt === 4) { // 都保留(待审核校验通过)
                await batchReviewResults([resultId], true);
            }
            onApproved();
        } catch { alert(t('batch_review_failed')); }
        finally { setBusy(false); }
    };

    // 整组都还在待审核时：择一入库。keepId=保留并入库的记录，同组其余待审核全部删除。
    const doKeepOne = async (keepId: string) => {
        const others = [resultId, ...pendingList.map(p => p.id)].filter(id => id !== keepId);
        if (!window.confirm(t('triage_keep_one_confirm', { count: others.length }))) return;
        setBusy(true);
        try {
            await batchReviewResults([keepId], true);
            if (others.length) await deleteResultsBatch(others);
            onApproved();
        } catch { alert(t('batch_review_failed')); }
        finally { setBusy(false); }
    };

    const approved = data?.approved_same_id?.[0];
    const official = data?.official_case;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6" onClick={onClose}>
            <div className="relative bg-surface rounded-2xl border border-ink/[0.1] w-full max-w-5xl max-h-[88vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between p-4 border-b border-ink/[0.08]">
                    <h3 className="text-lg font-bold text-text-primary flex items-center gap-2">
                        <GitCompare className="w-5 h-5 text-amber-700" />
                        {t('triage_compare_title')}
                    </h3>
                    <button onClick={onClose} className="text-text-muted hover:text-text-primary"><X className="w-5 h-5" /></button>
                </div>
                <div className="p-4 overflow-auto flex-1">
                    {loading ? (
                        <div className="p-12 text-center text-text-muted"><Loader2 className="w-8 h-8 animate-spin mx-auto" /></div>
                    ) : !data ? (
                        <div className="p-12 text-center text-text-muted">{t('triage_compare_load_failed')}</div>
                    ) : (
                        <>
                            {/* 官方题库基准：核对测试时是否用了正确的用例 */}
                            <div className="mb-4 p-3 rounded-xl border border-blue-200 bg-blue-100">
                                <div className="flex items-center gap-2 mb-2">
                                    <ClipboardCheck className="w-4 h-4 text-blue-700" />
                                    <span className="text-xs font-bold text-blue-700">{t('triage_compare_official')}</span>
                                    {official && <span className="text-[10px] font-mono text-text-muted">#{official.case_id}</span>}
                                </div>
                                {official ? (
                                    <>
                                        <div className="text-sm text-text-primary bg-surface-overlay rounded p-2 mb-2 whitespace-pre-wrap">
                                            {official.content || t('triage_compare_official_no_content')}
                                        </div>
                                        <div className="flex flex-wrap gap-1.5 text-[10px]">
                                            {official.function_domain && <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">{official.function_domain}</span>}
                                            {official.task_detail && <span className="px-2 py-0.5 rounded-full bg-ink/[0.06] text-text-secondary">{official.task_detail}</span>}
                                            {official.acceptance_tag && <span className="px-2 py-0.5 rounded-full bg-ink/[0.06] text-text-secondary">{official.acceptance_tag}</span>}
                                        </div>
                                    </>
                                ) : (
                                    <div className="text-xs text-text-muted">{t('triage_compare_official_missing')}</div>
                                )}
                            </div>

                            {/* 整组都还在待审核时的提示：这些记录同ID，需择一入库 */}
                            {!hasApproved && pendingList.length > 0 && (
                                <div className="mb-3 text-xs text-sky-700 bg-sky-100 border border-sky-200 rounded-lg px-3 py-2">
                                    {t('triage_all_pending_hint', { count: pendingList.length + 1 })}
                                </div>
                            )}
                            <div className="flex flex-wrap gap-4">
                                <CompareRecordCard rec={data.target}
                                    label={hasApproved ? t('triage_compare_pending') : t('triage_candidate_current')}
                                    tone="pending" officialContent={official?.content}
                                    metricNames={metricNames} onViewCard={() => setDetailRec(data.target)}
                                    onKeep={hasApproved ? undefined : () => doKeepOne(data.target.id)}
                                    keepDisabled={busy} keepLabel={t('triage_keep_this')} />
                                {hasApproved ? (
                                    <CompareRecordCard rec={approved!} label={t('triage_compare_approved')} tone="approved" officialContent={official?.content}
                                        metricNames={metricNames} onViewCard={() => setDetailRec(approved!)}
                                        onDelete={() => doDeleteApproved(approved!.id)} deleteDisabled={busy} deleteLabel={t('triage_compare_delete_approved')} />
                                ) : pendingList.length > 0 ? (
                                    pendingList.map(c => (
                                        <CompareRecordCard key={c.id} rec={c} label={t('triage_candidate_other')} tone="candidate" officialContent={official?.content}
                                            metricNames={metricNames} onViewCard={() => setDetailRec(c)}
                                            onKeep={() => doKeepOne(c.id)} keepDisabled={busy} keepLabel={t('triage_keep_this')} />
                                    ))
                                ) : (
                                    <div className="flex-1 flex items-center justify-center text-text-muted text-sm border border-dashed border-ink/[0.1] rounded-xl">
                                        {t('triage_compare_no_approved')}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
                <div className="flex items-center flex-wrap justify-end gap-2 p-4 border-t border-ink/[0.08]">
                    {busy && <Loader2 className="w-4 h-4 animate-spin text-text-muted mr-1" />}
                    {hasApproved ? (
                        <>
                            <button onClick={() => doOpt(1)} disabled={busy}
                                className="px-3 py-2 border border-emerald-200 text-emerald-700 rounded-lg hover:bg-emerald-100 disabled:opacity-50 text-xs font-medium">
                                {t('review_opt1')}
                            </button>
                            <button onClick={() => doOpt(2)} disabled={busy}
                                className="px-3 py-2 border border-sky-200 text-sky-700 rounded-lg hover:bg-sky-100 disabled:opacity-50 text-xs font-medium">
                                {t('review_opt2')}
                            </button>
                            <button onClick={() => doOpt(3)} disabled={busy}
                                className="px-3 py-2 bg-rose-600 text-text-inverse rounded-lg hover:bg-rose-700 disabled:opacity-50 text-xs font-medium">
                                {t('review_opt3')}
                            </button>
                            <button onClick={() => doOpt(4)} disabled={busy}
                                className="px-3 py-2 border border-ink/[0.15] text-text-secondary rounded-lg hover:bg-ink/[0.05] disabled:opacity-50 text-xs font-medium">
                                {t('review_opt4')}
                            </button>
                        </>
                    ) : pendingList.length > 0 ? (
                        // 整组都在待审核：用每张卡片上的「保留这条」择一入库；底部只留删除当前这条
                        <>
                            <span className="text-xs text-text-muted mr-auto">{t('triage_keep_one_footer_hint')}</span>
                            <button onClick={doDelete} disabled={busy}
                                className="flex items-center gap-2 px-4 py-2 bg-rose-600 text-text-inverse rounded-lg hover:bg-rose-700 disabled:opacity-50 text-sm font-medium">
                                <Trash2 className="w-4 h-4" /> {t('triage_compare_delete_pending')}
                            </button>
                        </>
                    ) : (
                        // 库里无同ID对应记录时，退回单条通过/删除
                        <>
                            <button onClick={doApprove} disabled={busy}
                                className="flex items-center gap-2 px-4 py-2 border border-emerald-200 text-emerald-700 rounded-lg hover:bg-emerald-100 disabled:opacity-50 text-sm font-medium">
                                <CheckCircle2 className="w-4 h-4" /> {t('triage_compare_keep_pending')}
                            </button>
                            <button onClick={doDelete} disabled={busy}
                                className="flex items-center gap-2 px-4 py-2 bg-rose-600 text-text-inverse rounded-lg hover:bg-rose-700 disabled:opacity-50 text-sm font-medium">
                                <Trash2 className="w-4 h-4" /> {t('triage_compare_delete_pending')}
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* 嵌套：完整卡片（含视频与完整评价） */}
            {detailRec && (
                <div onClick={e => e.stopPropagation()}>
                    <ResultDetailModal
                        result={detailRec}
                        onClose={() => setDetailRec(null)}
                        onPlayVideo={(path, title) => setVideoModal({ open: true, path, title })}
                    />
                </div>
            )}
            <div onClick={e => e.stopPropagation()}>
                <VideoPlayerModal
                    open={videoModal.open}
                    videoPath={videoModal.path}
                    title={videoModal.title}
                    onClose={() => setVideoModal(v => ({ ...v, open: false }))}
                />
            </div>
        </div>
    );
};

// EditModal
const EditModal = ({
    result,
    onClose,
    onSave,
    onReanalyze
}: {
    result: any;
    onClose: () => void;
    onSave: (id: string, data: any) => Promise<void>;
    onReanalyze: (id: string) => Promise<void>;
}) => {
    const { t } = useTranslation();
    const { tv, td, tm } = useMetricsTranslation();
    const videoInfo = parseVideoName(result.video_name);
    const [formData, setFormData] = useState({
        user_question: result.metadata?.user_question || '',
        system_response: result.metadata?.system_response || '',
        summary: result.metadata?.summary || '',
        video_name: result.video_name,
        // 系统ID(case_id 数据库列)，可人工修正；文件名不受影响
        case_id: result.case_id || '',
        latency_ms: result.metadata?.latency_ms || 0,
        path: result.metadata?.path || '',
        // 校验通过开关：勾上即把 needs_review 置 false，记录随即进入测试用例库。
        reviewed: !result.metadata?.needs_review,
        // 任务成败：case 是否正确响应并执行了指令需求（三态：true 成功 / false 失败 / '' 未判定）。
        // 注意与 status（分析处理成败）无关。用字符串承载，避免 false 和 null 混淆。
        task_success: result.metadata?.task_success === true ? 'true'
                      : result.metadata?.task_success === false ? 'false' : '',
        task_success_reason: result.metadata?.task_success_reason || '',
    });
    const [saving, setSaving] = useState(false);

    // 指标评分编辑：从 row.evaluation_scores 初始化一份可编辑副本
    type MetricRow = {
        metric_code: string;
        criteria: string;
        category: string;
        score: number;
        feedback: string;
        selection_reason: string;
    };
    const [metrics, setMetrics] = useState<MetricRow[]>(
        (result.evaluation_scores || []).map((s: any) => ({
            metric_code: s.metric_code || '',
            criteria: s.criteria || s.metric_name || '',
            category: s.category || '',
            score: Number(s.score) || 0,
            feedback: s.feedback || '',
            selection_reason: s.selection_reason || '',
        }))
    );
    // 功能域权重映射(code->weight) + 完整指标库 + 选择器开关
    const [weightMap, setWeightMap] = useState<Record<string, number>>({});
    const [registry, setRegistry] = useState<MetricRegistryItem[]>([]);
    const [showPicker, setShowPicker] = useState(false);
    const [pickerSearch, setPickerSearch] = useState('');
    // 视频播放弹窗：审核员边看视频边核对分数
    const [showVideo, setShowVideo] = useState(false);
    const videoPath = result.metadata?.path || '';
    // 重新分析（删旧换新，覆盖人工编辑）
    const [reanalyzing, setReanalyzing] = useState(false);
    const handleReanalyze = async () => {
        if (!window.confirm(t('confirm_reanalyze_single'))) return;
        setReanalyzing(true);
        try {
            await onReanalyze(result.id);
            onClose();
        } catch (e) {
            console.error(e);
            alert(t('reanalyze_failed'));
        } finally {
            setReanalyzing(false);
        }
    };

    useEffect(() => {
        const fd = videoInfo.function_domain;
        getDomainWeights(fd || undefined)
            .then(res => {
                const map: Record<string, number> = {};
                (res.weights || []).forEach(w => { map[w.metric_code] = w.weight; });
                setWeightMap(map);
            })
            .catch(() => setWeightMap({}));
        getMetricsRegistry().then(setRegistry).catch(() => setRegistry([]));
    }, [videoInfo.function_domain]);

    // 综合评分实时重算：与后端 recompute_quality_score 同口径
    // 有权重命中→加权平均；否则→有效分(>0)算术平均；都没有→null
    const computeComposite = (): { score: number | null; method: string } => {
        let num = 0, den = 0;
        const validScores: number[] = [];
        for (const m of metrics) {
            const s = Number(m.score);
            if (!s || s <= 0) continue;
            validScores.push(s);
            const w = weightMap[m.metric_code];
            if (w != null) { num += s * w; den += w; }
        }
        if (den > 0) return { score: Math.round((num / den) * 100) / 100, method: 'weighted' };
        if (validScores.length > 0) {
            const avg = validScores.reduce((a, b) => a + b, 0) / validScores.length;
            return { score: Math.round(avg * 100) / 100, method: 'arithmetic' };
        }
        return { score: null, method: 'none' };
    };
    const composite = computeComposite();

    const handleSave = async () => {
        setSaving(true);
        try {
            await onSave(result.id, {
                video_name: formData.video_name,
                case_id: formData.case_id,
                metadata: {
                    user_question: formData.user_question,
                    system_response: formData.system_response,
                    summary: formData.summary,
                    latency_ms: parseInt(formData.latency_ms),
                    path: formData.path,
                    // 勾选「校验通过」→ needs_review=false（进入测试用例库）；否则保持待审核。
                    needs_review: !formData.reviewed,
                    // 任务成败（case 业务层面）：三态字符串转回 true/false/null。
                    task_success: formData.task_success === 'true' ? true
                                  : formData.task_success === 'false' ? false : null,
                    task_success_reason: formData.task_success_reason,
                },
                // 完整指标列表：后端删旧插新，并据此重算综合分（response_quality_score 由后端落库）。
                evaluation_scores: metrics.map(m => ({
                    metric_code: m.metric_code,
                    criteria: m.criteria,
                    category: m.category,
                    score: Number(m.score) || 0,
                    feedback: m.feedback,
                    selection_reason: m.selection_reason,
                })),
            });
            onClose();
        } catch (error) {
            console.error(error);
            alert(t('save_failed'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-surface-raised rounded-xl shadow-2xl shadow-ink/40 w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-bold text-text-primary">{t('edit_result')}</h3>
                    <button onClick={onClose}><X className="w-5 h-5 text-text-muted" /></button>
                </div>

                {/* Structured Info (Read-only) */}
                <div className="mb-6 p-4 bg-surface rounded-lg border border-ink/[0.08]">
                    <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-bold text-text-secondary flex items-center gap-2">
                            <Info className="w-4 h-4" />
                            {t('video_info_parsed')}
                        </h4>
                        <button
                            onClick={() => setShowVideo(true)}
                            disabled={!videoPath}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-ink/90 text-text-inverse text-xs font-medium hover:bg-ink disabled:opacity-40 disabled:cursor-not-allowed"
                            title={videoPath ? t('play_video') : t('no_video_path')}
                        >
                            <PlayCircle className="w-4 h-4" />
                            {t('play_video')}
                        </button>
                    </div>
                    <div className="grid grid-cols-4 gap-3">
                        <div>
                            <label className="block text-xs text-text-muted mb-1">{t('system_id')}</label>
                            <input
                                type="text"
                                value={formData.case_id}
                                onChange={e => setFormData({ ...formData, case_id: e.target.value })}
                                className="w-full px-2 py-1 border border-ink/[0.1] rounded text-sm bg-surface font-mono text-text-primary focus:ring-2 focus:ring-blue-500 outline-none"
                                title={t('system_id')}
                            />
                            {videoInfo.case_id && videoInfo.case_id !== formData.case_id && (
                                <div className="text-[10px] text-text-muted mt-0.5">文件名: {videoInfo.case_id}</div>
                            )}
                        </div>
                        <div>
                            <label className="block text-xs text-text-muted mb-1">{t('brand_model')}</label>
                            <div className="text-sm font-medium text-text-primary">{videoInfo.brand_model ? tv(videoInfo.brand_model) : 'N/A'}</div>
                        </div>
                        <div>
                            <label className="block text-xs text-text-muted mb-1">{t('system_version')}</label>
                            <div className="text-sm font-medium text-text-primary">{videoInfo.system_version || 'N/A'}</div>
                        </div>
                        <div>
                            <label className="block text-xs text-text-muted mb-1">{t('function_domain')}</label>
                            <div className="text-sm font-medium text-text-primary">{videoInfo.function_domain ? td(videoInfo.function_domain) : 'N/A'}</div>
                        </div>
                    </div>
                </div>

                {/* 待审核提示 + 校验通过开关：仅对模型标了 needs_review 的记录显示 */}
                {result.metadata?.needs_review && (
                    <div className="mb-6 p-4 bg-orange-100 rounded-lg border border-orange-200">
                        <div className="flex items-start gap-2 mb-3">
                            <AlertTriangle className="w-4 h-4 text-orange-700 mt-0.5 shrink-0" />
                            <div className="min-w-0">
                                <h4 className="text-sm font-bold text-orange-700">{t('needs_review_title')}</h4>
                                <p className="text-xs text-text-secondary mt-1 leading-relaxed">
                                    {result.metadata?.review_reason || t('needs_review_no_reason')}
                                </p>
                            </div>
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer select-none pl-6">
                            <input
                                type="checkbox"
                                className="w-4 h-4 accent-emerald-500"
                                checked={formData.reviewed}
                                onChange={e => setFormData({ ...formData, reviewed: e.target.checked })}
                            />
                            <span className="text-sm text-text-secondary">{t('mark_reviewed')}</span>
                        </label>
                    </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                        <label className="block text-sm font-medium text-text-secondary mb-1">{t('video_name_label')}</label>
                        <input
                            type="text"
                            className="w-full p-2 border rounded-lg text-sm bg-surface"
                            value={formData.video_name}
                            onChange={e => setFormData({ ...formData, video_name: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-text-secondary mb-1">{t('latency_ms_label')}</label>
                        <input
                            type="number"
                            className="w-full p-2 border rounded-lg text-sm"
                            value={formData.latency_ms}
                            onChange={e => setFormData({ ...formData, latency_ms: e.target.value })}
                        />
                    </div>
                    <div className="col-span-2">
                        <label className="block text-sm font-medium text-text-secondary mb-1">{t('video_path_label')}</label>
                        <input
                            type="text"
                            className="w-full p-2 border rounded-lg text-sm font-mono text-text-secondary"
                            value={formData.path}
                            onChange={e => setFormData({ ...formData, path: e.target.value })}
                        />
                    </div>
                    <div className="col-span-2">
                        <label className="block text-sm font-medium text-text-secondary mb-1">{t('user_question_label')}</label>
                        <textarea
                            className="w-full p-2 border rounded-lg text-sm"
                            rows={2}
                            value={formData.user_question}
                            onChange={e => setFormData({ ...formData, user_question: e.target.value })}
                        />
                    </div>
                    <div className="col-span-2">
                        <label className="block text-sm font-medium text-text-secondary mb-1">{t('system_response_label')}</label>
                        <textarea
                            className="w-full p-2 border rounded-lg text-sm"
                            rows={3}
                            value={formData.system_response}
                            onChange={e => setFormData({ ...formData, system_response: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-text-secondary mb-1">{t('score_label')}</label>
                        <div className="w-full p-2 border rounded-lg text-sm bg-surface flex items-center gap-2">
                            {composite.score != null ? (
                                <>
                                    <span className={clsx(
                                        "font-bold text-base",
                                        composite.score >= 4 ? "text-emerald-700" :
                                            composite.score >= 3 ? "text-amber-700" : "text-rose-700"
                                    )}>{composite.score}</span>
                                    <span className="text-text-muted text-xs">/ 5</span>
                                    <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-ink/[0.06] text-text-muted">
                                        {composite.method === 'weighted' ? t('score_method_weighted') : t('score_method_arithmetic')}
                                    </span>
                                </>
                            ) : (
                                <span className="text-text-muted text-xs italic">{t('score_auto_none')}</span>
                            )}
                        </div>
                        <p className="text-[10px] text-text-muted mt-1">{t('score_auto_hint')}</p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-text-secondary mb-1">{t('task_success_label')}</label>
                        <LightSelect
                            value={formData.task_success}
                            onChange={e => setFormData({ ...formData, task_success: e.target.value })}
                            className="w-full p-2 border rounded-lg text-sm bg-surface"
                        >
                            <option value="true">{t('task_success_yes')}</option>
                            <option value="false">{t('task_success_no')}</option>
                            <option value="">{t('task_success_unknown')}</option>
                        </LightSelect>
                        <p className="text-[10px] text-text-muted mt-1">{t('task_success_hint')}</p>
                    </div>
                    <div className="col-span-2">
                        <label className="block text-sm font-medium text-text-secondary mb-1">{t('task_success_reason_label')}</label>
                        <input
                            type="text"
                            className="w-full p-2 border rounded-lg text-sm"
                            value={formData.task_success_reason}
                            onChange={e => setFormData({ ...formData, task_success_reason: e.target.value })}
                            placeholder={t('task_success_reason_ph')}
                        />
                    </div>
                    <div className="col-span-2">
                        <label className="block text-sm font-medium text-text-secondary mb-1">{t('summary_label')}</label>
                        <textarea
                            className="w-full p-2 border rounded-lg text-sm"
                            rows={4}
                            value={formData.summary}
                            onChange={e => setFormData({ ...formData, summary: e.target.value })}
                        />
                    </div>
                </div>

                {/* 指标评分编辑区：改分 / 删除 / 增加；综合分随之自动重算 */}
                <div className="mt-6 pt-4 border-t border-ink/[0.08]">
                    <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-bold text-text-secondary flex items-center gap-2">
                            <Gauge className="w-4 h-4" />
                            {t('metrics_section_title')}
                            <span className="text-xs text-text-muted font-normal">({metrics.length})</span>
                        </h4>
                        <button
                            onClick={() => { setShowPicker(true); setPickerSearch(''); }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-ink/[0.1] text-xs text-text-secondary hover:bg-ink/[0.05]"
                        >
                            <Plus className="w-3.5 h-3.5" /> {t('add_metric')}
                        </button>
                    </div>
                    {metrics.length === 0 ? (
                        <p className="text-xs text-text-muted italic py-3">{t('no_metrics')}</p>
                    ) : (
                        <div className="space-y-2">
                            {metrics.map((m, idx) => {
                                // C11 由系统按意图识别指标分派生，不在编辑弹窗展示/编辑；
                                // 但保留在 metrics state 里，保存时随 payload 回传，不被 delete+insert 删除。
                                if ((m.metric_code || '') === 'C11') return null;
                                const hasWeight = weightMap[m.metric_code] != null;
                                return (
                                    <div key={`${m.metric_code}-${idx}`} className="p-3 rounded-lg border border-ink/[0.08] bg-surface">
                                        <div className="flex items-start gap-2">
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="text-sm font-medium text-text-primary">{tm(m.criteria || m.metric_code)}</span>
                                                    {m.metric_code && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-ink/[0.06] text-text-muted">{m.metric_code}</span>}
                                                    {hasWeight && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 border border-blue-200" title={`权重 ${weightMap[m.metric_code]}`}>{t('weighted_tag')}</span>}
                                                </div>
                                                {m.category && <div className="text-[10px] text-text-muted mt-0.5">{m.category}</div>}
                                            </div>
                                            <div className="flex items-center gap-1 shrink-0">
                                                <input
                                                    type="number" min={1} max={5} step={1}
                                                    value={m.score || ''}
                                                    onChange={e => {
                                                        const v = Math.max(0, Math.min(5, parseInt(e.target.value) || 0));
                                                        setMetrics(prev => prev.map((x, i) => i === idx ? { ...x, score: v } : x));
                                                    }}
                                                    className="w-14 px-2 py-1 rounded border border-ink/[0.1] bg-transparent text-center text-sm"
                                                />
                                                <span className="text-xs text-text-muted">/5</span>
                                                <button
                                                    onClick={() => setMetrics(prev => prev.filter((_, i) => i !== idx))}
                                                    className="p-1.5 rounded text-text-muted hover:text-rose-700 hover:bg-rose-100"
                                                    title={t('delete')}
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                        <textarea
                                            value={m.feedback}
                                            onChange={e => setMetrics(prev => prev.map((x, i) => i === idx ? { ...x, feedback: e.target.value } : x))}
                                            rows={2}
                                            placeholder={t('metric_feedback_placeholder')}
                                            className="w-full mt-2 p-2 border border-ink/[0.08] rounded text-xs bg-transparent text-text-secondary"
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="mt-6 flex items-center gap-3 pt-4 border-t border-ink/[0.08]">
                    <button
                        onClick={handleReanalyze}
                        disabled={reanalyzing || !videoPath}
                        title={videoPath ? t('reanalyze_hint') : t('no_video_path')}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-amber-200 text-amber-700 font-medium hover:bg-amber-100 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {reanalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        {t('reanalyze')}
                    </button>
                    <div className="ml-auto flex items-center gap-3">
                        <button onClick={onClose} className="px-4 py-2 text-text-secondary font-medium hover:bg-ink/[0.05] rounded-lg">{t('cancel')}</button>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="px-6 py-2 bg-ink text-text-inverse font-medium rounded-lg hover:bg-ink/85 disabled:opacity-50 flex items-center gap-2"
                        >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            {t('save_changes')}
                        </button>
                    </div>
                </div>
            </div>

            {/* 增加指标选择器 */}
            {showPicker && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowPicker(false)}>
                    <div className="bg-surface-raised rounded-xl shadow-2xl w-full max-w-lg max-h-[70vh] flex flex-col p-5" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="text-base font-bold text-text-primary">{t('add_metric')}</h3>
                            <button onClick={() => setShowPicker(false)}><X className="w-5 h-5 text-text-muted" /></button>
                        </div>
                        <div className="relative mb-3">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                            <input
                                autoFocus
                                value={pickerSearch}
                                onChange={e => setPickerSearch(e.target.value)}
                                placeholder={t('metric_search_placeholder')}
                                className="w-full pl-9 pr-3 py-2 border border-ink/[0.1] rounded-lg text-sm bg-transparent"
                            />
                        </div>
                        <div className="overflow-y-auto flex-1 space-y-1">
                            {registry
                                .filter(r => {
                                    const q = pickerSearch.trim().toLowerCase();
                                    if (!q) return true;
                                    return (r.name || '').toLowerCase().includes(q) || (r.code || '').toLowerCase().includes(q) || (r.category || '').toLowerCase().includes(q);
                                })
                                .map(r => {
                                    const already = metrics.some(m => m.metric_code === r.code);
                                    return (
                                        <button
                                            key={r.code}
                                            disabled={already}
                                            onClick={() => {
                                                setMetrics(prev => [...prev, {
                                                    metric_code: r.code,
                                                    criteria: r.name,
                                                    category: r.category,
                                                    score: 3,
                                                    feedback: '',
                                                    selection_reason: '人工添加',
                                                }]);
                                                setShowPicker(false);
                                            }}
                                            className={clsx(
                                                "w-full text-left p-2.5 rounded-lg border transition-colors",
                                                already ? "border-ink/[0.05] opacity-40 cursor-not-allowed" : "border-ink/[0.08] hover:bg-ink/[0.05]"
                                            )}
                                        >
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm text-text-primary">{r.name}</span>
                                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-ink/[0.06] text-text-muted">{r.code}</span>
                                                {weightMap[r.code] != null && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 border border-blue-200">{t('weighted_tag')}</span>}
                                                {already && <span className="ml-auto text-[10px] text-text-muted">{t('already_added')}</span>}
                                            </div>
                                            <div className="text-[10px] text-text-muted mt-0.5">{r.category}</div>
                                        </button>
                                    );
                                })}
                        </div>
                    </div>
                </div>
            )}

            {/* 视频播放弹窗：复用全局播放器，z-[100] 叠在编辑弹窗之上 */}
            <VideoPlayerModal
                open={showVideo}
                videoPath={videoPath}
                title={result.video_name}
                onClose={() => setShowVideo(false)}
            />
        </div>
    );
};

const Database = () => {
    const { t } = useTranslation();
    const { tv, td } = useMetricsTranslation();
    const { user } = useAuth();
    // 批次筛选仅管理员可见可用
    const isAdmin = user?.role === 'admin';
    // 管理员「更新评分」弹窗（车型评分板块重算入口）
    const [showUpdateDialog, setShowUpdateDialog] = useState(false);
    const [results, setResults] = useState<any[]>([]);
    const [total, setTotal] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(PAGE_SIZE);  // 每页条数，可选 20/40/60
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [searchDebounced, setSearchDebounced] = useState('');
    const [editingResult, setEditingResult] = useState<any | null>(null);
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [deletingBatch, setDeletingBatch] = useState(false);
    const [reanalyzingBatch, setReanalyzingBatch] = useState(false);
    const [sortConfig, setSortConfig] = useState<SortConfig>({ key: null, direction: 'asc' });
    const [filters, setFilters] = useState<FilterConfig>({
        case_id: '',
        brand_model: '',
        system_version: '',
        function_domain: '',
        score_min: '',
        score_max: ''
    });
    const [showFilters, setShowFilters] = useState(false);
    // 分析批次筛选
    const [batches, setBatches] = useState<AnalysisBatch[]>([]);
    const [batchFilter, setBatchFilter] = useState<string>('');
    // 顶部看板统计
    const [overview, setOverview] = useState<ResultsOverview | null>(null);
    // 只看待审核 + 按原因过滤（''=不按原因）
    const [onlyReview, setOnlyReview] = useState(false);
    const [reviewReason, setReviewReason] = useState<'' | 'duplicate' | 'model_flagged'>('');
    // 批量校验通过
    const [reviewingBatch, setReviewingBatch] = useState(false);
    // 看板车型分布展开/收起
    const [showVehicles, setShowVehicles] = useState(false);
    // 待审核分诊
    const [triage, setTriage] = useState<ReviewTriage | null>(null);
    const [triageLoading, setTriageLoading] = useState(false);
    const [triageGroup, setTriageGroup] = useState<string>('');  // 当前进入的分组明细
    // 当前是否处于「分诊首页」视图（卡片为主）；进入分组明细则切到表格
    const [showAllData, setShowAllData] = useState(false);
    // 首页视图模式：triage=分诊卡片首页 | all=全部数据表 | reviewed=已通过表 | invalid=无效表
    const [dataView, setDataView] = useState<'triage' | 'all' | 'reviewed' | 'invalid' | 'caseids'>('triage');
    // 视频ID总览
    const [caseIdOv, setCaseIdOv] = useState<import('../api').CaseIdOverview | null>(null);
    const [caseIdLoading, setCaseIdLoading] = useState(false);
    // 第一层车型筛选（与批次并列）
    const [vehicleFilter, setVehicleFilter] = useState<string>('');
    // 已通过表里按任务标注筛选：''=全部 | 'unlabeled' | 'success' | 'failed'
    const [taskLabelFilter, setTaskLabelFilter] = useState<'' | 'unlabeled' | 'success' | 'failed'>('');
    // 已通过板块内的正交子筛选：只看 Claude 硬订正过的 case
    const [claudeOnly, setClaudeOnly] = useState(false);
    // 批量重试 Claude 复审(失败/降级的 case)
    const [reverifyBusy, setReverifyBusy] = useState(false);
    const [reverifyMsg, setReverifyMsg] = useState('');
    // 已通过区书签：list=记录列表 | quality=质量检查
    const [reviewedTab, setReviewedTab] = useState<'list' | 'quality'>('list');
    // 质量检查数据
    const [quality, setQuality] = useState<{ counts: { consistent: number; id_mismatch: number; low_similarity: number }; total: number; rows: QualityCheckRow[]; computed_at?: string | null } | null>(null);
    const [qualityLoading, setQualityLoading] = useState(false);
    const [qualityGroup, setQualityGroup] = useState<'' | 'consistent' | 'id_mismatch' | 'low_similarity'>('');
    // 质量检查后台进度
    const [qcProgress, setQcProgress] = useState<QCProgress | null>(null);
    // 分诊分组配对（左待审核 vs 右库内）—— content_differs / completed_duplicate 组用左右对比表
    const [triagePairs, setTriagePairs] = useState<{ total: number; pairs: TriagePair[] } | null>(null);
    const [pairsLoading, setPairsLoading] = useState(false);
    // 分诊进度
    const [triageProgress, setTriageProgress] = useState<QCProgress | null>(null);
    // 质量检查子模式：consistency=一致性检查 | dedup=重复ID去重
    const [qcMode, setQcMode] = useState<'consistency' | 'dedup'>('consistency');
    const [dupData, setDupData] = useState<{ group_count: number; record_count: number; groups: DuplicateGroup[]; computed_at?: string | null; cached?: boolean } | null>(null);
    const [dupLoading, setDupLoading] = useState(false);
    const [dupProgress, setDupProgress] = useState<QCProgress | null>(null);
    // 查看完整卡片（ResultDetailModal，含视频）
    const [detailResult, setDetailResult] = useState<any | null>(null);
    const [detailVideo, setDetailVideo] = useState<{ open: boolean; path: string; title: string }>({ open: false, path: '', title: '' });
    // 车型下拉选项：独立加载全部车型（不随当前筛选变化，避免选了一台就只剩一台）
    const [vehicleOptions, setVehicleOptions] = useState<string[]>([]);
    useEffect(() => {
        if (!isAdmin) return;
        getFilterOptions().then(o => setVehicleOptions(o.brand_models || [])).catch(() => setVehicleOptions([]));
    }, [isAdmin]);
    // 自定义车型下拉的开关
    const [vehicleMenuOpen, setVehicleMenuOpen] = useState(false);
    // 对比弹窗：待审核 vs 库里同ID已通过
    const [compareId, setCompareId] = useState<string | null>(null);
    // 指标 code→名称 映射（对比弹窗显示完整指标名）
    const [metricNames, setMetricNames] = useState<Record<string, string>>({});
    useEffect(() => {
        getMetricsRegistry()
            .then(list => {
                const m: Record<string, string> = {};
                list.forEach(it => { if (it.code) m[it.code] = it.name; });
                setMetricNames(m);
            })
            .catch(() => setMetricNames({}));
    }, []);

    useEffect(() => {
        // 只保留数据库页有记录的批次（db_count>0，即排除全 failed/invalid 的批次）。
        if (isAdmin) getBatches().then(bs => setBatches(bs.filter(b => b.db_count > 0))).catch(() => setBatches([]));
    }, [isAdmin]);

    useEffect(() => {
        const timer = setTimeout(() => setSearchDebounced(search), 400);
        return () => clearTimeout(timer);
    }, [search]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const sortFieldMap: Record<string, string> = {
                score: 'created_at',
                latency: 'created_at',
                case_id: 'video_name',
                brand_model: 'video_name',
                system_version: 'video_name',
                function_domain: 'video_name',
            };
            const params: Record<string, any> = {
                offset: (currentPage - 1) * pageSize,
                limit: pageSize,
            };
            if (onlyReview) {
                // 只看待审核（可再按原因过滤 / 按分诊分组过滤）
                params.only_review = true;
                if (reviewReason) params.review_reason = reviewReason;
                if (triageGroup) params.triage_group = triageGroup;
            } else if (dataView === 'reviewed') {
                // 点「已通过」：只看已入库（排除待审核），MiMo 口径
                params.exclude_review = true;
                params.only_mimo = true;
                if (taskLabelFilter) params.task_label = taskLabelFilter;
                // 已通过内的正交子筛选：只看 Claude 硬订正过的（fix_hard）
                if (claudeOnly) params.claude_corrected = true;
            } else if (dataView === 'invalid') {
                // 点「无效」：只看 status=invalid
                params.status = 'invalid';
            } else {
                // all / 默认：把待审核顶到最前
                params.review_first = true;
            }
            if (sortConfig.key) {
                params.sort_by = sortFieldMap[sortConfig.key] || 'created_at';
                params.sort_order = sortConfig.direction;
            }
            if (searchDebounced) params.search = searchDebounced;
            // 第一层车型筛选优先；筛选面板里的 brand_model 次之
            if (vehicleFilter) params.brand_model = vehicleFilter;
            else if (filters.brand_model) params.brand_model = filters.brand_model;
            if (filters.system_version) params.system_version = filters.system_version;
            if (filters.function_domain) params.function_domain = filters.function_domain;
            if (batchFilter) params.task_id = batchFilter;

            const res = await getAllResults(params);
            setResults(res.data);
            setTotal(res.total);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
        // 注意：fetchData 内部未使用 user，故不放入依赖，避免鉴权对象引用变化导致的无谓重拉。
    }, [currentPage, pageSize, sortConfig, searchDebounced, filters, batchFilter, onlyReview, reviewReason, triageGroup, dataView, vehicleFilter, taskLabelFilter, claudeOnly]);

    // 看板统计：独立于列表分页，加载时和每次审核/删除后刷新（受第一层车型筛选影响）
    const fetchOverview = useCallback(() => {
        getResultsOverview(vehicleFilter || undefined).then(setOverview).catch(() => setOverview(null));
    }, [vehicleFilter]);

    // 分诊分组：读已落库结果（受第一层车型筛选影响）
    const fetchTriage = useCallback(() => {
        if (!isAdmin) return;
        setTriageLoading(true);
        getReviewTriage(false, vehicleFilter || undefined)
            .then(setTriage)
            .catch(() => setTriage(null))
            .finally(() => setTriageLoading(false));
    }, [isAdmin, vehicleFilter]);

    // 质量检查：读【已落库缓存】（秒开，不重算）。受第一层车型筛选影响。
    const fetchQuality = useCallback(() => {
        setQualityLoading(true);
        getQualityCheck(vehicleFilter || undefined)
            .then(setQuality)
            .catch(() => setQuality(null))
            .finally(() => setQualityLoading(false));
    }, [vehicleFilter]);

    // 批量重试 Claude 复审：对失败/降级的 case 后台串行重跑，轮询进度
    const handleReverifyFailed = async () => {
        if (reverifyBusy) return;
        setReverifyBusy(true);
        setReverifyMsg('');
        try {
            const r = await reverifyFailedBatch(vehicleFilter || undefined);
            if (r.status === 'empty') { setReverifyMsg(t('reverify_batch_empty')); setReverifyBusy(false); return; }
            if (r.status === 'already_running') { setReverifyMsg(t('reverify_batch_running')); }
            const poll = setInterval(async () => {
                try {
                    const p = await getReverifyFailedProgress();
                    setReverifyMsg(t('reverify_batch_progress', { done: p.done, total: p.total, ok: p.ok, failed: p.failed }));
                    if (!p.running) {
                        clearInterval(poll);
                        setReverifyBusy(false);
                        fetchOverview();
                        if (dataView === 'reviewed') fetchData();
                    }
                } catch { clearInterval(poll); setReverifyBusy(false); }
            }, 2000);
        } catch (e) {
            console.error(e);
            setReverifyMsg(t('reverify_batch_failed'));
            setReverifyBusy(false);
        }
    };

    // 刷新质量检查：后台重算 + 轮询进度（慢，不阻塞）。完成后读缓存。
    const handleRecomputeQuality = async () => {
        try {
            await recomputeQualityCheck(vehicleFilter || undefined);
            setQcProgress({ status: 'queued', phase: '排队中', done: 0, total: 0 });
        } catch (e) {
            console.error(e);
            alert(t('qc_recompute_failed'));
        }
    };

    // 轮询后台进度：running 时每 1.5s 拉一次，done/error 停止并读缓存
    useEffect(() => {
        if (!qcProgress || qcProgress.status === 'done' || qcProgress.status === 'error' || qcProgress.status === 'idle') return;
        const timer = setInterval(async () => {
            try {
                const p = await getQualityCheckProgress(vehicleFilter || undefined);
                setQcProgress(p);
                if (p.status === 'done') {
                    clearInterval(timer);
                    fetchQuality();
                    setTimeout(() => setQcProgress(null), 1500);
                } else if (p.status === 'error') {
                    clearInterval(timer);
                }
            } catch { /* 忽略单次失败，下次继续 */ }
        }, 1500);
        return () => clearInterval(timer);
    }, [qcProgress, vehicleFilter, fetchQuality]);

    const [batchFixing, setBatchFixing] = useState(false);
    // 质量检查表：一键把系统ID改为建议的官方ID（只改 case_id 列，文件名不动）
    const handleFixCaseId = async (resultId: string, newId: string) => {
        if (!window.confirm(t('qc_fix_id_confirm', { id: newId }))) return;
        try {
            await updateResult(resultId, { case_id: newId });
            fetchQuality();
            fetchOverview();
        } catch (e) { console.error(e); alert(t('qc_fix_id_failed')); }
    };
    // 语义相似度问题：人工确认某条其实与官方一致 → 归入「与官方一致」
    const handleConfirmConsistent = async (resultId: string) => {
        try {
            await confirmQualityConsistent([resultId]);
            fetchQuality();
        } catch (e) { console.error(e); alert(t('qc_confirm_failed')); }
    };
    // 一键批量改ID：把当前「ID号错位」组里所有有建议ID的记录一次改完（按当前车型范围）
    const handleBatchFixCaseId = async () => {
        const fixable = (quality?.rows || []).filter(r => r.group === 'id_mismatch' && r.suggest_id);
        if (fixable.length === 0) { alert(t('qc_batch_fix_none')); return; }
        if (!window.confirm(t('qc_batch_fix_confirm', { count: fixable.length }))) return;
        setBatchFixing(true);
        try {
            const res = await batchFixCaseId({ auto: true, brand_model: vehicleFilter || undefined });
            alert(t('qc_batch_fix_success', { count: res.updated_count }));
            fetchQuality();
            fetchOverview();
        } catch (e) { console.error(e); alert(t('qc_fix_id_failed')); }
        finally { setBatchFixing(false); }
    };
    // 质量检查表：打开某条记录的卡片(detail)或编辑弹窗(edit)。用 compare 接口取完整记录。
    const openResultById = async (resultId: string, mode: 'detail' | 'edit') => {
        try {
            const { target } = await getResultCompare(resultId);
            if (mode === 'edit') setEditingResult(target);
            else setDetailResult(target);
        } catch (e) { console.error(e); }
    };
    const handleDeleteFromQuality = async (resultId: string) => {
        if (!window.confirm(t('confirm_delete_one'))) return;
        try {
            await deleteResult(resultId);
            fetchQuality();
            fetchOverview();
        } catch (e) { console.error(e); alert(t('delete_failed')); }
    };

    // 去重视图：读【缓存】（秒开）。受车型筛选影响。
    const fetchDuplicates = useCallback(() => {
        setDupLoading(true);
        getQualityDuplicates(vehicleFilter || undefined)
            .then(setDupData)
            .catch(() => setDupData(null))
            .finally(() => setDupLoading(false));
    }, [vehicleFilter]);

    // 刷新去重：后台重扫 + 轮询进度
    const handleRecomputeDuplicates = async () => {
        try {
            await recomputeQualityDuplicates(vehicleFilter || undefined);
            setDupProgress({ status: 'queued', phase: '排队中', done: 0, total: 0 });
        } catch (e) { console.error(e); alert(t('qc_recompute_failed')); }
    };
    useEffect(() => {
        if (!dupProgress || ['done', 'error', 'idle'].includes(dupProgress.status)) return;
        const timer = setInterval(async () => {
            try {
                const p = await getQualityDuplicatesProgress(vehicleFilter || undefined);
                setDupProgress(p);
                if (p.status === 'done') { clearInterval(timer); fetchDuplicates(); setTimeout(() => setDupProgress(null), 1500); }
                else if (p.status === 'error') clearInterval(timer);
            } catch { /* 忽略 */ }
        }, 1200);
        return () => clearInterval(timer);
    }, [dupProgress, vehicleFilter, fetchDuplicates]);

    // 进入质量检查书签时按需读缓存
    useEffect(() => {
        if (dataView === 'reviewed' && reviewedTab === 'quality') {
            if (qcMode === 'consistency' && !quality && !qualityLoading) fetchQuality();
            if (qcMode === 'dedup' && !dupData && !dupLoading) fetchDuplicates();
        }
    }, [dataView, reviewedTab, qcMode, quality, qualityLoading, dupData, dupLoading, fetchQuality, fetchDuplicates]);
    // 车型变化时清空去重数据
    useEffect(() => { setDupData(null); }, [vehicleFilter]);
    // 车型切换时清掉三个后台任务的进度态，避免进度条卡在上一个车型的数值上。
    useEffect(() => {
        setQcProgress(null);
        setDupProgress(null);
        setTriageProgress(null);
    }, [vehicleFilter]);
    // 车型筛选变化时清空已加载的质量检查结果（下次进书签重新读该车型的缓存）
    useEffect(() => { setQuality(null); }, [vehicleFilter]);

    // 触发重新分诊（逐条落库，可能耗时），完成后刷新分诊与看板
    const handleRecomputeTriage = async () => {
        try {
            await recomputeReviewTriage();
            setTriageProgress({ status: 'queued', phase: '排队中', done: 0, total: 0 });
        } catch (e) { console.error(e); alert(t('triage_recompute_failed')); }
    };
    const [approvingGroup, setApprovingGroup] = useState(false);
    // 把某分诊分组全部一次性校验通过入库（唯一记录用）
    const handleApproveGroup = async (group: string, count: number) => {
        if (!window.confirm(t('triage_approve_group_confirm', { count }))) return;
        setApprovingGroup(true);
        try {
            const res = await approveTriageGroup(group, vehicleFilter || undefined);
            alert(t('triage_approve_group_success', { count: res.updated_count }));
            fetchTriage(); fetchOverview();
        } catch (e) { console.error(e); alert(t('batch_review_failed')); }
        finally { setApprovingGroup(false); }
    };
    // 分诊后台进度轮询
    useEffect(() => {
        if (!triageProgress || ['done', 'error', 'idle'].includes(triageProgress.status)) return;
        const timer = setInterval(async () => {
            try {
                const p = await getReviewTriageProgress();
                setTriageProgress(p);
                if (p.status === 'done') { clearInterval(timer); fetchTriage(); setTimeout(() => setTriageProgress(null), 1500); }
                else if (p.status === 'error') clearInterval(timer);
            } catch { /* 忽略 */ }
        }, 1500);
        return () => clearInterval(timer);
    }, [triageProgress, fetchTriage]);

    // 该分组是否用「左右对比表」（有库内对应记录的组）
    const isPairGroup = (key: string) => key === 'content_differs' || key === 'completed_duplicate';
    // 加载分诊配对（左待审核 vs 右库内）
    const fetchTriagePairs = useCallback(() => {
        if (!triageGroup || !isPairGroup(triageGroup)) { setTriagePairs(null); return; }
        setPairsLoading(true);
        getTriagePairs({ triage_group: triageGroup, brand_model: vehicleFilter || undefined,
                         offset: (currentPage - 1) * pageSize, limit: pageSize })
            .then(setTriagePairs)
            .catch(() => setTriagePairs(null))
            .finally(() => setPairsLoading(false));
    }, [triageGroup, vehicleFilter, currentPage, pageSize]);
    useEffect(() => { fetchTriagePairs(); }, [fetchTriagePairs]);

    // 分诊卡片首页 / 视频ID总览 不渲染主表，无需拉取列表数据（避免无谓请求与竞态）。
    // 质量检查书签也是独立数据源，主表不显示。
    const needsListData = !(
        (dataView === 'triage' && !showAllData) ||
        dataView === 'caseids' ||
        (dataView === 'reviewed' && reviewedTab === 'quality')
    );
    useEffect(() => {
        if (!needsListData) return;
        fetchData();
    }, [fetchData, needsListData]);

    useEffect(() => {
        fetchOverview();
    }, [fetchOverview]);

    useEffect(() => {
        fetchTriage();
    }, [fetchTriage]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchDebounced, filters, batchFilter, onlyReview, reviewReason, triageGroup, dataView, vehicleFilter, taskLabelFilter]);

    // 进入某分诊分组的明细视图
    const enterTriageGroup = (key: string) => {
        setDataView('triage');
        setOnlyReview(true);
        setReviewReason('');
        setTriageGroup(key);
        setShowAllData(true);
    };
    // 退出分组明细/表格，回到分诊卡片首页
    const backToTriage = () => {
        setTriageGroup('');
        setOnlyReview(false);
        setShowAllData(false);
        setTaskLabelFilter('');
        setDataView('triage');
    };
    // KPI 卡片点击：切到对应表格视图
    const enterAllData = () => { setOnlyReview(false); setTriageGroup(''); setTaskLabelFilter(''); setClaudeOnly(false); setDataView('all'); setShowAllData(true); setShowVehicles(true); };
    const enterReviewed = () => { setOnlyReview(false); setTriageGroup(''); setTaskLabelFilter(''); setClaudeOnly(false); setReviewedTab('list'); setDataView('reviewed'); setShowAllData(true); };
    const enterInvalid = () => { setOnlyReview(false); setTriageGroup(''); setTaskLabelFilter(''); setClaudeOnly(false); setDataView('invalid'); setShowAllData(true); };
    const enterPendingTriage = () => { setOnlyReview(false); setTriageGroup(''); setTaskLabelFilter(''); setClaudeOnly(false); setDataView('triage'); setShowAllData(false); };
    const enterCaseIds = () => { setOnlyReview(false); setTriageGroup(''); setClaudeOnly(false); setDataView('caseids'); setShowAllData(true); };
    // 视频ID总览：读官方题库全部ID + 是否在库（受车型筛选）
    const fetchCaseIdOverview = useCallback(() => {
        setCaseIdLoading(true);
        getCaseIdOverview(vehicleFilter || undefined)
            .then(setCaseIdOv).catch(() => setCaseIdOv(null)).finally(() => setCaseIdLoading(false));
    }, [vehicleFilter]);
    useEffect(() => {
        if (dataView === 'caseids') fetchCaseIdOverview();
    }, [dataView, fetchCaseIdOverview]);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    const handleDelete = async (id: string) => {
        if (!window.confirm(t('confirm_delete_one'))) return;
        try {
            await deleteResult(id);
            setResults(results.filter(r => r.id !== id));
            if (selectedIds.has(id)) {
                const newSet = new Set(selectedIds);
                newSet.delete(id);
                setSelectedIds(newSet);
            }
            fetchOverview();
        } catch (error) {
            console.error(error);
            alert(t('delete_failed'));
        }
    };

    const handleBatchDelete = async () => {
        if (selectedIds.size === 0) return;
        if (!window.confirm(t('confirm_delete_batch', { count: selectedIds.size }))) return;

        setDeletingBatch(true);
        try {
            await deleteResultsBatch(Array.from(selectedIds));
            setResults(results.filter(r => !selectedIds.has(r.id)));
            setSelectedIds(new Set());
            fetchOverview();
            fetchTriage();
        } catch (error) {
            console.error(error);
            alert(t('batch_delete_failed'));
        } finally {
            setDeletingBatch(false);
        }
    };

    // 批量校验通过：选中记录 needs_review→false。含「重复用例」时二次确认，避免误放进用例库。
    const handleBatchReview = async () => {
        if (selectedIds.size === 0) return;
        const selectedRows = results.filter(r => selectedIds.has(r.id));
        const dupRows = selectedRows.filter(r => r.metadata?.is_duplicate);
        if (dupRows.length > 0) {
            const ok = window.confirm(
                t('batch_review_duplicate_warning', { count: dupRows.length, total: selectedIds.size })
            );
            if (!ok) return;
        } else if (!window.confirm(t('batch_review_confirm', { count: selectedIds.size }))) {
            return;
        }
        setReviewingBatch(true);
        try {
            const res = await batchReviewResults(Array.from(selectedIds), true);
            setSelectedIds(new Set());
            alert(t('batch_review_success', { count: res.updated_count }));
            fetchData();
            fetchOverview();
            fetchTriage();
        } catch (error) {
            console.error(error);
            alert(t('batch_review_failed'));
        } finally {
            setReviewingBatch(false);
        }
    };

    const handleUpdate = async (id: string, data: any) => {
        await updateResult(id, data);
        fetchData();
        fetchOverview();
    };

    // 单条重新分析（编辑弹窗调用）：触发后刷新列表
    const handleReanalyzeSingle = async (id: string) => {
        await reanalyzeResults([id]);
        fetchData();
    };

    // 批量重新分析：删旧换新，覆盖人工编辑
    const handleBatchReanalyze = async () => {
        if (selectedIds.size === 0) return;
        if (!window.confirm(t('confirm_reanalyze_batch', { count: selectedIds.size }))) return;
        setReanalyzingBatch(true);
        try {
            const res = await reanalyzeResults(Array.from(selectedIds));
            setSelectedIds(new Set());
            alert(t('reanalyze_submitted', { count: res.total_videos }));
            fetchData();
        } catch (error) {
            console.error(error);
            alert(t('reanalyze_failed'));
        } finally {
            setReanalyzingBatch(false);
        }
    };

    const toggleSelect = (id: string) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setSelectedIds(newSet);
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === filteredThenSortedResults.length && filteredThenSortedResults.length > 0) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredThenSortedResults.map(r => r.id)));
        }
    };

    const handleSort = (key: SortConfig['key']) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const filteredThenSortedResults = results.filter(r => {
        const videoInfo = parseVideoName(r.video_name);
        const score = r.metadata?.response_quality_score || 0;

        const matchesCaseId = !filters.case_id || videoInfo.case_id.toLowerCase().includes(filters.case_id.toLowerCase());
        const matchesScoreMin = !filters.score_min || score >= parseFloat(filters.score_min);
        const matchesScoreMax = !filters.score_max || score <= parseFloat(filters.score_max);

        return matchesCaseId && matchesScoreMin && matchesScoreMax;
    });

    const getSortIcon = (key: SortConfig['key']) => {
        if (sortConfig.key !== key) return <ArrowUpDown className="w-3 h-3 opacity-30" />;
        return sortConfig.direction === 'asc' ?
            <ArrowUpDown className="w-3 h-3 rotate-180" /> :
            <ArrowUpDown className="w-3 h-3" />;
    };

    return (
        <div className="p-8 h-[100dvh] flex flex-col relative overflow-hidden">
            {previewImage && <ImageModal src={previewImage} onClose={() => setPreviewImage(null)} />}

            {isAdmin && showUpdateDialog && (
                <VehicleUpdateDialog
                    onClose={() => setShowUpdateDialog(false)}
                    onDone={() => { fetchData(); fetchOverview(); }}
                />
            )}

            <div className="flex justify-between items-center mb-4 shrink-0">
                <div>
                    <h2 className="text-3xl font-bold text-text-primary">{t('database')}</h2>
                    <p className="text-text-muted mt-1">{t('manage_results')}</p>
                </div>
                <div className="flex items-center gap-4">
                    {isAdmin && (
                    <button
                        onClick={() => setShowUpdateDialog(true)}
                        className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-ink/[0.12] text-text-secondary hover:text-text-primary hover:border-ink/[0.25] hover:bg-ink/[0.05] transition-colors"
                        title="勾选数据完整的车型更新，被更新的车才进入评分板块（对用户可见）"
                    >
                        <RefreshCw className="w-4 h-4" />
                        更新评分
                    </button>
                    )}
                    {isAdmin && (
                    <div className="relative">
                        <button
                            onClick={() => setVehicleMenuOpen(o => !o)}
                            className={clsx(
                                "flex items-center gap-2 px-3 py-2 border rounded-lg text-sm transition-colors min-w-[160px]",
                                vehicleFilter ? "border-blue-600/50 bg-blue-100 text-text-primary" : "border-ink/[0.1] bg-surface-raised text-text-secondary hover:bg-ink/[0.05]"
                            )}
                            title={t('vehicle_filter')}
                        >
                            <Car className="w-4 h-4 shrink-0 opacity-70" />
                            <span className="flex-1 text-left truncate">{vehicleFilter ? tv(vehicleFilter) : t('vehicle_all')}</span>
                            <ChevronDown className={clsx("w-4 h-4 shrink-0 opacity-60 transition-transform", vehicleMenuOpen && "rotate-180")} />
                        </button>
                        {vehicleMenuOpen && (
                            <>
                                <div className="fixed inset-0 z-20" onClick={() => setVehicleMenuOpen(false)} />
                                <div className="absolute left-0 mt-1 z-30 w-56 max-h-80 overflow-auto bg-surface-raised border border-ink/[0.12] rounded-xl shadow-xl shadow-ink/40 p-1 animate-in fade-in slide-in-from-top-1">
                                    <button
                                        onClick={() => { setVehicleFilter(''); setVehicleMenuOpen(false); }}
                                        className={clsx(
                                            "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors",
                                            !vehicleFilter ? "bg-blue-100 text-blue-700" : "text-text-secondary hover:bg-ink/[0.05]"
                                        )}
                                    >
                                        <LayoutGrid className="w-4 h-4 shrink-0 opacity-70" />
                                        <span className="flex-1">{t('vehicle_all')}</span>
                                        {!vehicleFilter && <Check className="w-4 h-4 text-blue-700" />}
                                    </button>
                                    <div className="my-1 border-t border-ink/[0.06]" />
                                    {vehicleOptions.map(v => (
                                        <button
                                            key={v}
                                            onClick={() => { setVehicleFilter(v); setVehicleMenuOpen(false); }}
                                            className={clsx(
                                                "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors",
                                                vehicleFilter === v ? "bg-blue-100 text-blue-700" : "text-text-secondary hover:bg-ink/[0.05]"
                                            )}
                                        >
                                            <Car className="w-4 h-4 shrink-0 opacity-60" />
                                            <span className="flex-1 truncate">{tv(v)}</span>
                                            {vehicleFilter === v && <Check className="w-4 h-4 text-blue-700" />}
                                        </button>
                                    ))}
                                    {vehicleOptions.length === 0 && (
                                        <div className="px-3 py-2 text-xs text-text-muted">{t('vehicle_no_options')}</div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                    )}
                    {isAdmin && (
                    <LightSelect
                        value={batchFilter}
                        onChange={e => setBatchFilter(e.target.value)}
                        className="px-3 py-2 border border-ink/[0.1] rounded-lg text-sm bg-surface-raised text-text-secondary max-w-[220px] focus:ring-2 focus:ring-blue-500 outline-none"
                        title={t('batch_filter')}
                    >
                        <option value="">{t('batch_all')}</option>
                        {batches.map(b => (
                            <option key={b.id} value={b.id}>
                                {fmtBatchLabel(b)}
                            </option>
                        ))}
                    </LightSelect>
                    )}
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={clsx(
                            "flex items-center gap-2 px-4 py-2 border rounded-lg text-sm font-medium transition-colors",
                            showFilters ? "bg-primary/10 text-primary border-primary/30" : "bg-surface-raised text-text-secondary border-ink/[0.1] hover:bg-ink/[0.05]"
                        )}
                    >
                        <Filter className="w-4 h-4" />
                        {t('filters')}
                    </button>
                    {selectedIds.size > 0 && (
                        <button
                            onClick={handleBatchReview}
                            disabled={reviewingBatch}
                            className="flex items-center gap-2 px-4 py-2 border border-emerald-200 text-emerald-700 font-medium rounded-lg hover:bg-emerald-100 disabled:opacity-50 transition-colors animate-in fade-in slide-in-from-right-4"
                        >
                            {reviewingBatch ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardCheck className="w-4 h-4" />}
                            {t('batch_review_selected', { count: selectedIds.size })}
                        </button>
                    )}
                    {selectedIds.size > 0 && (
                        <button
                            onClick={handleBatchReanalyze}
                            disabled={reanalyzingBatch}
                            className="flex items-center gap-2 px-4 py-2 border border-amber-200 text-amber-700 font-medium rounded-lg hover:bg-amber-100 disabled:opacity-50 transition-colors animate-in fade-in slide-in-from-right-4"
                        >
                            {reanalyzingBatch ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                            {t('reanalyze_selected', { count: selectedIds.size })}
                        </button>
                    )}
                    {selectedIds.size > 0 && (
                        <button
                            onClick={handleBatchDelete}
                            disabled={deletingBatch}
                            className="flex items-center gap-2 px-4 py-2 bg-rose-600 text-text-inverse font-medium rounded-lg hover:bg-rose-700 disabled:opacity-50 transition-colors animate-in fade-in slide-in-from-right-4"
                        >
                            {deletingBatch ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                            {t('delete_selected', { count: selectedIds.size })}
                        </button>
                    )}
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted w-4 h-4" />
                        <input
                            type="text"
                            placeholder={t('search_placeholder')}
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="pl-10 pr-4 py-2 border border-ink/[0.1] rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none w-64"
                        />
                    </div>
                </div>
            </div>

            {/* Overview 看板 —— 四张卡片均可点，点击切换下方视图 */}
            {overview && (
                <div className="mb-4 shrink-0 grid grid-cols-1 lg:grid-cols-5 gap-3">
                    <button
                        onClick={enterAllData}
                        className={clsx(
                            "flex items-center gap-3 p-3 rounded-xl border text-left transition-colors",
                            dataView === 'all' ? "bg-blue-100 border-blue-600/50" : "bg-blue-100 border-blue-200 hover:bg-blue-100"
                        )}
                    >
                        <DatabaseIcon className="w-5 h-5 text-blue-700 shrink-0" />
                        <div className="min-w-0">
                            <div className="text-2xl font-bold text-text-primary leading-none">{overview.total}</div>
                            <div className="text-xs text-text-muted mt-1">{t('ov_total')}</div>
                        </div>
                    </button>
                    <button
                        onClick={enterReviewed}
                        className={clsx(
                            "flex items-center gap-3 p-3 rounded-xl border text-left transition-colors",
                            dataView === 'reviewed' ? "bg-emerald-100 border-emerald-600/50" : "bg-emerald-100 border-emerald-200 hover:bg-emerald-100"
                        )}
                    >
                        <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />
                        <div className="min-w-0">
                            <div className="text-2xl font-bold text-emerald-700 leading-none">{overview.reviewed}</div>
                            <div className="text-xs text-text-muted mt-1">{t('ov_reviewed')}</div>
                        </div>
                    </button>
                    <button
                        onClick={enterPendingTriage}
                        className={clsx(
                            "flex items-center gap-3 p-3 rounded-xl border text-left transition-colors",
                            dataView === 'triage' ? "bg-orange-100 border-orange-600/50" : "bg-orange-100 border-orange-200 hover:bg-orange-100"
                        )}
                    >
                        <AlertTriangle className="w-5 h-5 text-orange-700 shrink-0" />
                        <div className="min-w-0">
                            <div className="text-2xl font-bold text-orange-700 leading-none">{overview.pending_review}</div>
                            <div className="text-xs text-text-muted mt-1">{t('ov_pending')}</div>
                        </div>
                    </button>
                    <button
                        onClick={enterInvalid}
                        className={clsx(
                            "flex items-center gap-3 p-3 rounded-xl border text-left transition-colors",
                            dataView === 'invalid' ? "bg-ink/[0.08] border-ink/[0.2]" : "bg-surface-raised border-ink/[0.08] hover:bg-ink/[0.04]"
                        )}
                        title={t('ov_invalid_hint')}
                    >
                        <Info className="w-5 h-5 text-text-muted shrink-0" />
                        <div className="min-w-0">
                            <div className="text-2xl font-bold text-text-primary leading-none">{overview.invalid}</div>
                            <div className="text-xs text-text-muted mt-1">{t('ov_invalid')}{overview.failed ? ` · ${t('ov_failed')} ${overview.failed}` : ''}</div>
                        </div>
                    </button>
                    <button
                        onClick={enterCaseIds}
                        className={clsx(
                            "flex items-center gap-3 p-3 rounded-xl border text-left transition-colors",
                            dataView === 'caseids' ? "bg-indigo-900/20 border-indigo-600/50" : "bg-indigo-900/10 border-indigo-800/30 hover:bg-indigo-900/15"
                        )}
                        title={t('ov_caseids_hint')}
                    >
                        <LayoutGrid className="w-5 h-5 text-indigo-400 shrink-0" />
                        <div className="min-w-0">
                            <div className="text-lg font-bold text-indigo-300 leading-none">{t('ov_caseids')}</div>
                            <div className="text-xs text-text-muted mt-1">{t('ov_caseids_sub')}</div>
                        </div>
                    </button>
                </div>
            )}

            {/* 任务标注统计：点「已通过」的记录列表书签时显示，可点未标注去筛选手动补 */}
            {overview && dataView === 'reviewed' && reviewedTab === 'list' && overview.task_labeling && (
                <div className="mb-4 shrink-0 flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-text-muted">{t('ov_task_label')}:</span>
                    <button onClick={() => setTaskLabelFilter('')}
                        className={clsx("px-3 py-1 rounded-full text-xs border transition-colors",
                            taskLabelFilter === '' ? "bg-ink/[0.1] text-text-primary border-ink/[0.25]" : "text-text-secondary border-ink/[0.1] hover:bg-ink/[0.05]")}>
                        {t('ov_reason_all')} ({overview.reviewed})
                    </button>
                    <button onClick={() => setTaskLabelFilter('success')}
                        className={clsx("px-3 py-1 rounded-full text-xs border transition-colors",
                            taskLabelFilter === 'success' ? "bg-emerald-100 text-emerald-700 border-emerald-600/50" : "text-text-secondary border-ink/[0.1] hover:bg-ink/[0.05]")}>
                        {t('ov_task_success')} ({overview.task_labeling.labeled_success})
                    </button>
                    <button onClick={() => setTaskLabelFilter('failed')}
                        className={clsx("px-3 py-1 rounded-full text-xs border transition-colors",
                            taskLabelFilter === 'failed' ? "bg-rose-100 text-rose-700 border-rose-600/50" : "text-text-secondary border-ink/[0.1] hover:bg-ink/[0.05]")}>
                        {t('ov_task_failed')} ({overview.task_labeling.labeled_failed})
                    </button>
                    <button onClick={() => setTaskLabelFilter('unlabeled')}
                        className={clsx("inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs border transition-colors",
                            taskLabelFilter === 'unlabeled' ? "bg-amber-100 text-amber-700 border-amber-600/50" : "text-amber-700/80 border-amber-200 hover:bg-amber-100")}>
                        <AlertTriangle className="w-3 h-3" /> {t('ov_task_unlabeled')} ({overview.task_labeling.unlabeled})
                    </button>
                    {/* 正交子筛选：只看 Claude 硬订正过的（已通过里被 Claude 改过分的），可与任务标注叠加 */}
                    <span className="mx-1 w-px h-4 bg-ink/[0.12]" />
                    <button onClick={() => setClaudeOnly(v => !v)}
                        title={t('ov_claude_corrected_hint')}
                        className={clsx("inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs border transition-colors",
                            claudeOnly ? "bg-violet-100 text-violet-700 border-violet-500/60" : "text-violet-700/80 border-violet-200 hover:bg-violet-100")}>
                        <ShieldCheck className="w-3 h-3" /> {t('ov_claude_corrected')} ({overview.claude_corrected ?? 0})
                    </button>
                    {isAdmin && (
                        <button onClick={handleReverifyFailed} disabled={reverifyBusy}
                            title={t('reverify_batch_hint')}
                            className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs border border-ink/[0.12] text-text-secondary hover:bg-ink/[0.05] disabled:opacity-50">
                            {reverifyBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                            {t('reverify_batch_btn')}
                        </button>
                    )}
                    {reverifyMsg && <span className="text-xs text-text-muted">{reverifyMsg}</span>}
                </div>
            )}

            {/* 分诊分组卡片区（分诊首页，卡片为主） */}
            {isAdmin && dataView === 'triage' && !showAllData && (
                <div className="mb-4 shrink-0">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-bold text-text-secondary flex items-center gap-2">
                            <ClipboardCheck className="w-4 h-4" />
                            {t('triage_title')}
                            {triage && <span className="text-text-muted font-normal">· {t('triage_total', { count: triage.total_pending })}</span>}
                        </h3>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleRecomputeTriage}
                                disabled={!!triageProgress && !['done', 'error', 'idle'].includes(triageProgress.status)}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-ink/[0.1] text-text-secondary rounded-lg hover:bg-ink/[0.05] disabled:opacity-50 transition-colors"
                                title={t('triage_recompute_hint')}
                            >
                                {(triageProgress && !['done', 'error', 'idle'].includes(triageProgress.status)) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                                {t('triage_recompute')}
                            </button>
                            <button
                                onClick={enterAllData}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-ink/[0.1] text-text-secondary rounded-lg hover:bg-ink/[0.05] transition-colors"
                            >
                                <DatabaseIcon className="w-3.5 h-3.5" />
                                {t('triage_view_all')}
                            </button>
                        </div>
                    </div>
                    {/* 后台重新分诊进度条 */}
                    {triageProgress && triageProgress.status !== 'idle' && triageProgress.status !== 'done' && (
                        <div className={clsx("mb-3 p-3 rounded-xl border",
                            triageProgress.status === 'error' ? "border-rose-200 bg-rose-100" : "border-blue-200 bg-blue-100")}>
                            <div className="flex items-center justify-between text-xs mb-1.5">
                                <span className={clsx("flex items-center gap-1.5", triageProgress.status === 'error' ? "text-rose-700" : "text-blue-700")}>
                                    {triageProgress.status === 'error' ? <AlertTriangle className="w-3.5 h-3.5" /> : <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                    {triageProgress.status === 'error' ? t('triage_recompute_failed') : (triageProgress.phase || t('triage_recompute'))}
                                </span>
                                <span className="text-text-muted font-mono">{triageProgress.total ? `${triageProgress.done || 0} / ${triageProgress.total}` : ''}</span>
                            </div>
                            {triageProgress.status !== 'error' && (
                                <div className="h-1.5 bg-ink/[0.08] rounded-full overflow-hidden">
                                    <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${triageProgress.total ? Math.round(((triageProgress.done || 0) / triageProgress.total) * 100) : 8}%` }} />
                                </div>
                            )}
                        </div>
                    )}
                    {triageLoading && !triage ? (
                        <div className="p-8 text-center text-text-muted"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
                    ) : triage && triage.groups.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                            {triage.groups.map(g => {
                                const ui = TRIAGE_GROUP_UI[g.key] || TRIAGE_GROUP_UI.unclassified;
                                const Icon = ui.icon;
                                return (
                                    <div
                                        key={g.key}
                                        className={clsx("flex flex-col gap-2 p-3 rounded-xl border transition-all", ui.ring)}
                                    >
                                        <button onClick={() => enterTriageGroup(g.key)} className="flex flex-col gap-2 text-left hover:opacity-90">
                                            <div className="flex items-center justify-between">
                                                <Icon className={clsx("w-5 h-5", ui.color)} />
                                                {t(`triage_suggest_${g.suggestion}`) && (
                                                    <span className={clsx("text-[10px] px-1.5 py-0.5 rounded-full border", ui.color, "border-current/30")}>
                                                        {t(`triage_suggest_${g.suggestion}`)}
                                                    </span>
                                                )}
                                            </div>
                                            <div>
                                                <div className={clsx("text-2xl font-bold leading-none", ui.color)}>{g.count}</div>
                                                <div className="text-xs text-text-primary font-medium mt-1">{t(`triage_group_${g.key}`, g.title)}</div>
                                            </div>
                                            <div className="text-[10px] text-text-muted line-clamp-2">
                                                {g.by_vehicle.slice(0, 3).map(v => `${v.brand_model} ${v.count}`).join(' · ')}
                                            </div>
                                        </button>
                                        {/* 唯一记录：一键全部入库 */}
                                        {g.key === 'unique_keep' && g.count > 0 && (
                                            <button
                                                onClick={() => handleApproveGroup(g.key, g.count)}
                                                disabled={approvingGroup}
                                                className="mt-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 text-text-inverse hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                                            >
                                                {approvingGroup ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                                                {t('triage_approve_all', { count: g.count })}
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="p-6 text-center text-text-muted text-sm border border-dashed border-ink/[0.1] rounded-xl">
                            {t('triage_empty_hint')}
                        </div>
                    )}
                </div>
            )}

            {/* 返回条：从任意表格视图回分诊首页 */}
            {isAdmin && showAllData && (
                <div className="mb-3 shrink-0 flex items-center gap-3">
                    <button
                        onClick={backToTriage}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-ink/[0.1] text-text-secondary rounded-lg hover:bg-ink/[0.05] transition-colors"
                    >
                        <ChevronLeft className="w-3.5 h-3.5" />
                        {t('triage_back')}
                    </button>
                    <span className="text-sm text-text-secondary">
                        {triageGroup
                            ? <>{t('triage_current_group')}: <span className="text-text-primary font-medium">{t(`triage_group_${triageGroup}`, triageGroup)}</span></>
                            : <span className="text-text-primary font-medium">{
                                dataView === 'reviewed' ? t('ov_reviewed')
                                : dataView === 'invalid' ? t('ov_invalid')
                                : dataView === 'caseids' ? t('ov_caseids')
                                : t('ov_total')
                              }</span>}
                    </span>
                    {/* 已通过区：记录列表 / 质量检查 书签 */}
                    {dataView === 'reviewed' && (
                        <div className="ml-2 flex items-center gap-1 bg-surface-raised rounded-lg p-0.5 border border-ink/[0.08]">
                            <button
                                onClick={() => setReviewedTab('list')}
                                className={clsx("px-3 py-1 rounded text-xs font-medium transition-colors",
                                    reviewedTab === 'list' ? "bg-ink text-text-inverse" : "text-text-secondary hover:bg-ink/[0.05]")}
                            >
                                {t('qc_tab_list')}
                            </button>
                            <button
                                onClick={() => setReviewedTab('quality')}
                                className={clsx("inline-flex items-center gap-1 px-3 py-1 rounded text-xs font-medium transition-colors",
                                    reviewedTab === 'quality' ? "bg-ink text-text-inverse" : "text-text-secondary hover:bg-ink/[0.05]")}
                            >
                                <ClipboardCheck className="w-3.5 h-3.5" /> {t('qc_tab_quality')}
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* 质量检查面板：已通过区的「质量检查」书签 */}
            {isAdmin && dataView === 'reviewed' && reviewedTab === 'quality' && (
                <div className="flex-1 min-h-0 flex flex-col">
                    {/* 子模式切换：一致性检查 / 重复ID去重 */}
                    <div className="mb-3 shrink-0 flex items-center gap-1 bg-surface-raised rounded-lg p-0.5 border border-ink/[0.08] w-fit">
                        <button onClick={() => setQcMode('consistency')}
                            className={clsx("px-3 py-1 rounded text-xs font-medium transition-colors",
                                qcMode === 'consistency' ? "bg-ink text-text-inverse" : "text-text-secondary hover:bg-ink/[0.05]")}>
                            {t('qc_mode_consistency')}
                        </button>
                        <button onClick={() => setQcMode('dedup')}
                            className={clsx("inline-flex items-center gap-1 px-3 py-1 rounded text-xs font-medium transition-colors",
                                qcMode === 'dedup' ? "bg-ink text-text-inverse" : "text-text-secondary hover:bg-ink/[0.05]")}>
                            <Copy className="w-3.5 h-3.5" /> {t('qc_mode_dedup')}
                        </button>
                    </div>

                    {qcMode === 'consistency' && (<>
                    {/* 顶部：刷新按钮 + 上次计算时间（结果来自缓存，刷新才重算） */}
                    <div className="mb-3 shrink-0 flex items-center justify-between">
                        <span className="text-xs text-text-muted">
                            {quality && quality.total > 0
                                ? t('qc_cached_hint', { time: quality.computed_at ? new Date(quality.computed_at).toLocaleString() : '—' })
                                : t('qc_no_cache_hint')}
                        </span>
                        <button
                            onClick={handleRecomputeQuality}
                            disabled={qualityLoading}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-ink/[0.1] text-text-secondary rounded-lg hover:bg-ink/[0.05] disabled:opacity-50 transition-colors"
                            title={t('qc_recompute_hint')}
                        >
                            {qualityLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                            {t('qc_refresh')}
                        </button>
                    </div>
                    {/* 后台计算进度条 */}
                    {qcProgress && qcProgress.status !== 'idle' && qcProgress.status !== 'done' && (
                        <div className="mb-4 shrink-0 p-3 rounded-xl border border-blue-200 bg-blue-100">
                            <div className="flex items-center justify-between text-xs mb-1.5">
                                <span className="text-blue-700 flex items-center gap-1.5">
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    {qcProgress.status === 'error' ? t('qc_recompute_failed') : (qcProgress.phase || t('qc_computing'))}
                                </span>
                                <span className="text-text-muted font-mono">
                                    {qcProgress.total ? `${qcProgress.done || 0} / ${qcProgress.total}` : ''}
                                </span>
                            </div>
                            <div className="h-1.5 bg-ink/[0.08] rounded-full overflow-hidden">
                                <div className="h-full bg-blue-500 transition-all duration-300"
                                    style={{ width: `${qcProgress.total ? Math.round(((qcProgress.done || 0) / qcProgress.total) * 100) : 8}%` }} />
                            </div>
                        </div>
                    )}
                    {qualityLoading ? (
                        <div className="p-12 text-center text-text-muted"><Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />{t('qc_computing')}</div>
                    ) : !quality || quality.total === 0 ? (
                        <div className="p-12 text-center text-text-muted text-sm border border-dashed border-ink/[0.1] rounded-xl">
                            {t('qc_empty_hint')}
                        </div>
                    ) : (
                        <>
                            {/* 三张分组卡片：一致 / ID号错位 / 语意相似度问题 */}
                            <div className="mb-4 shrink-0 grid grid-cols-3 gap-3">
                                {([
                                    { key: 'consistent', n: quality.counts.consistent, color: 'text-emerald-700', ring: 'border-emerald-200 bg-emerald-100', active: 'border-emerald-600/50 bg-emerald-100' },
                                    { key: 'id_mismatch', n: quality.counts.id_mismatch, color: 'text-amber-700', ring: 'border-amber-200 bg-amber-100', active: 'border-amber-600/50 bg-amber-100' },
                                    { key: 'low_similarity', n: quality.counts.low_similarity, color: 'text-rose-700', ring: 'border-rose-200 bg-rose-100', active: 'border-rose-600/50 bg-rose-100' },
                                ] as const).map(c => (
                                    <button key={c.key}
                                        onClick={() => setQualityGroup(g => g === c.key ? '' : c.key)}
                                        className={clsx("p-3 rounded-xl border text-left transition-colors", qualityGroup === c.key ? c.active : c.ring)}>
                                        <div className={clsx("text-2xl font-bold leading-none", c.color)}>{c.n}</div>
                                        <div className="text-xs text-text-primary font-medium mt-1">{t(`qc_group_${c.key}`)}</div>
                                    </button>
                                ))}
                            </div>
                            {/* 一键批量改ID：ID号错位组有可修记录时显示 */}
                            {quality.counts.id_mismatch > 0 && (
                                <div className="mb-3 shrink-0 flex items-center gap-2">
                                    <button
                                        onClick={handleBatchFixCaseId}
                                        disabled={batchFixing}
                                        className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-text-primary text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
                                    >
                                        {batchFixing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                                        {t('qc_batch_fix', { count: quality.counts.id_mismatch })}
                                    </button>
                                    <span className="text-xs text-text-muted">{t('qc_batch_fix_hint')}</span>
                                </div>
                            )}
                            {/* 明细表 */}
                            <div className="flex-1 min-h-0 bg-surface-raised rounded-xl border border-ink/[0.08] overflow-auto">
                                <table className="w-full text-left text-xs table-fixed">
                                    <colgroup>
                                        <col className="w-[10%]" />{/* 车型/版本 */}
                                        <col className="w-[7%]" />{/* 官方ID */}
                                        <col className="w-[21%]" />{/* 官方用例 */}
                                        <col className="w-[7%]" />{/* 系统ID */}
                                        <col className="w-[21%]" />{/* 提取用例 */}
                                        <col className="w-[22%]" />{/* 问题诊断 */}
                                        <col className="w-[12%]" />{/* 操作 */}
                                    </colgroup>
                                    <thead className="bg-surface text-text-muted sticky top-0 z-10">
                                        <tr>
                                            <th className="px-2 py-2.5">{t('qc_col_vehicle')}</th>
                                            <th className="px-2 py-2.5">{t('qc_col_official_id')}</th>
                                            <th className="px-2 py-2.5">{t('qc_col_official_content')}</th>
                                            <th className="px-2 py-2.5">{t('qc_col_extracted_id')}</th>
                                            <th className="px-2 py-2.5">{t('qc_col_extracted_content')}</th>
                                            <th className="px-2 py-2.5">{t('qc_col_issue')}</th>
                                            <th className="px-2 py-2.5 text-right">{t('actions')}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-ink/[0.06]">
                                        {quality.rows.filter(r => !qualityGroup || r.group === qualityGroup).map(r => (
                                            <tr key={r.result_id} className="hover:bg-ink/[0.03] align-top group">
                                                <td className="px-2 py-2">
                                                    <div className="text-text-primary truncate" title={r.brand_model || ''}>{r.brand_model ? tv(r.brand_model) : '—'}</div>
                                                    <div className="text-[10px] text-text-muted font-mono truncate" title={r.system_version || ''}>{r.system_version || '—'}</div>
                                                </td>
                                                <td className="px-2 py-2 font-mono text-text-secondary">{r.official_case_id || <span className="text-rose-700">—</span>}</td>
                                                <td className="px-2 py-2 text-text-secondary"><div className="line-clamp-3" title={r.official_content || ''}>{r.official_content || '—'}</div></td>
                                                <td className="px-2 py-2 font-mono text-text-primary">{r.extracted_case_id || '—'}</td>
                                                <td className="px-2 py-2 text-text-secondary"><div className="line-clamp-3" title={r.extracted_content}>{r.extracted_content || '—'}</div></td>
                                                <td className="px-2 py-2">
                                                    <div className={clsx("line-clamp-3",
                                                        r.group === 'consistent' ? "text-emerald-700/90" : r.group === 'id_mismatch' ? "text-amber-700/90" : "text-rose-700/90")}
                                                        title={r.issue}>
                                                        {r.group === 'consistent' ? t('qc_ok') : r.issue}
                                                    </div>
                                                    {r.group !== 'consistent' && (
                                                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                                            {r.group === 'id_mismatch' && r.suggest_id && (
                                                                <button
                                                                    onClick={() => handleFixCaseId(r.result_id, r.suggest_id!)}
                                                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border border-amber-600/50 text-amber-700 hover:bg-amber-100">
                                                                    <RefreshCw className="w-3 h-3" /> {t('qc_fix_id', { id: r.suggest_id })}
                                                                </button>
                                                            )}
                                                            <button
                                                                onClick={() => handleConfirmConsistent(r.result_id)}
                                                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border border-emerald-600/50 text-emerald-700 hover:bg-emerald-100"
                                                                title={t('qc_confirm_hint')}>
                                                                <CheckCircle2 className="w-3 h-3" /> {t('qc_confirm_consistent')}
                                                            </button>
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-2 py-2 text-right">
                                                    <div className="flex justify-end items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button onClick={() => openResultById(r.result_id, 'detail')} className="p-1 rounded text-text-muted hover:text-blue-700 hover:bg-blue-100" title={t('qc_view_card')}><PlayCircle className="w-3.5 h-3.5" /></button>
                                                        <button onClick={() => openResultById(r.result_id, 'edit')} className="p-1 rounded text-text-muted hover:text-blue-700 hover:bg-blue-100" title={t('edit')}><Edit2 className="w-3.5 h-3.5" /></button>
                                                        <button onClick={() => handleDeleteFromQuality(r.result_id)} className="p-1 rounded text-text-muted hover:text-rose-700 hover:bg-rose-100" title={t('delete')}><Trash2 className="w-3.5 h-3.5" /></button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                    </>)}

                    {/* 重复ID去重视图 */}
                    {qcMode === 'dedup' && (<>
                        {/* 顶部：状态 + 刷新（结果来自缓存，扫过直接读，刷新才重扫） */}
                        <div className="mb-3 shrink-0 flex items-center justify-between">
                            <span className="text-xs text-text-muted">
                                {dupData?.cached
                                    ? t('qc_dedup_cached', { time: dupData.computed_at ? new Date(dupData.computed_at).toLocaleString() : '—' })
                                    : t('qc_dedup_no_cache')}
                            </span>
                            <button onClick={handleRecomputeDuplicates} disabled={!!dupProgress && !['done','error','idle'].includes(dupProgress.status)}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-ink/[0.1] text-text-secondary rounded-lg hover:bg-ink/[0.05] disabled:opacity-50 transition-colors">
                                <RefreshCw className="w-3.5 h-3.5" /> {t('qc_refresh')}
                            </button>
                        </div>
                        {/* 进度条 */}
                        {dupProgress && !['idle','done'].includes(dupProgress.status) && (
                            <div className={clsx("mb-4 shrink-0 p-3 rounded-xl border",
                                dupProgress.status === 'error' ? "border-rose-200 bg-rose-100" : "border-blue-200 bg-blue-100")}>
                                <div className="flex items-center justify-between text-xs mb-1.5">
                                    <span className={clsx("flex items-center gap-1.5", dupProgress.status === 'error' ? "text-rose-700" : "text-blue-700")}>
                                        {dupProgress.status === 'error' ? <AlertTriangle className="w-3.5 h-3.5" /> : <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                        {dupProgress.status === 'error' ? t('qc_dedup_failed') : (dupProgress.phase || t('qc_computing'))}
                                    </span>
                                    <span className="text-text-muted font-mono">{dupProgress.total ? `${dupProgress.done || 0} / ${dupProgress.total}` : ''}</span>
                                </div>
                                {dupProgress.status !== 'error' && (
                                    <div className="h-1.5 bg-ink/[0.08] rounded-full overflow-hidden">
                                        <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${dupProgress.total ? Math.round(((dupProgress.done || 0) / dupProgress.total) * 100) : 8}%` }} />
                                    </div>
                                )}
                            </div>
                        )}
                        {dupLoading ? (
                            <div className="p-12 text-center text-text-muted"><Loader2 className="w-8 h-8 animate-spin mx-auto" /></div>
                        ) : !dupData || !dupData.cached ? (
                            <div className="p-12 text-center text-text-muted text-sm border border-dashed border-ink/[0.1] rounded-xl">
                                {t('qc_dedup_no_cache_hint')}
                            </div>
                        ) : dupData.group_count === 0 ? (
                            <div className="p-12 text-center text-text-muted text-sm border border-dashed border-ink/[0.1] rounded-xl">
                                {t('qc_dedup_empty')}
                            </div>
                        ) : (
                            <>
                                <div className="mb-3 shrink-0 text-xs text-text-muted">
                                    {t('qc_dedup_summary', { groups: dupData.group_count, records: dupData.record_count })}
                                </div>
                                <div className="flex-1 min-h-0 overflow-auto space-y-4">
                                    {dupData.groups.map(g => (
                                        <div key={`${g.brand_model}-${g.system_version}-${g.case_id}`} className="rounded-xl border border-ink/[0.08] bg-surface-raised p-3">
                                            <div className="flex items-center gap-2 mb-2 text-sm">
                                                <span className="font-mono font-bold text-amber-700">#{g.case_id}</span>
                                                <span className="text-text-primary">{g.brand_model ? tv(g.brand_model) : ''}</span>
                                                <span className="text-text-muted font-mono text-xs">{g.system_version || ''}</span>
                                                <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                                                    {t('qc_dedup_count', { count: g.members.length })}
                                                </span>
                                            </div>
                                            {/* 官方题库标准诉求，供比对 */}
                                            <div className="mb-2 p-2 rounded-lg border border-blue-200 bg-blue-100">
                                                <div className="text-[11px] text-blue-700 mb-0.5 flex items-center gap-1">
                                                    <ClipboardCheck className="w-3 h-3" /> {t('qc_dedup_official')}
                                                </div>
                                                <div className="text-xs text-text-primary">
                                                    {g.official_content || <span className="text-text-muted italic">{t('qc_dedup_official_missing')}</span>}
                                                </div>
                                            </div>
                                            {/* 组内成员并排 */}
                                            <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(g.members.length, 3)}, minmax(0, 1fr))` }}>
                                                {g.members.map(m => (
                                                    <div key={m.result_id} className="rounded-lg border border-ink/[0.08] bg-surface-overlay p-2.5 flex flex-col">
                                                        <div className="flex items-center justify-between mb-1.5">
                                                            <span className={clsx("text-lg font-bold",
                                                                (Number(m.score) || 0) >= 4 ? "text-emerald-700" : (Number(m.score) || 0) >= 3 ? "text-amber-700" : "text-rose-700")}>
                                                                {m.score ?? '-'}
                                                            </span>
                                                            <span className="text-[10px] text-text-muted">{m.created_at ? new Date(m.created_at).toLocaleDateString() : ''}</span>
                                                        </div>
                                                        <div className="text-[11px] text-text-muted mb-0.5">{t('qc_col_extracted_content')}</div>
                                                        <div className="text-xs text-text-secondary line-clamp-2 mb-1" title={m.user_question}>{m.user_question || '—'}</div>
                                                        <div className="text-xs text-text-secondary line-clamp-3 bg-ink/[0.03] rounded p-1.5 mb-2 flex-1" title={m.system_response}>{m.system_response || '—'}</div>
                                                        <div className="flex items-center gap-1 justify-end mt-auto">
                                                            <button onClick={() => openResultById(m.result_id, 'detail')} className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] border border-ink/[0.12] text-text-secondary hover:bg-ink/[0.06]"><PlayCircle className="w-3 h-3" /> {t('qc_view_card')}</button>
                                                            <button onClick={() => openResultById(m.result_id, 'edit')} className="p-1 rounded text-text-muted hover:text-blue-700 hover:bg-blue-100" title={t('edit')}><Edit2 className="w-3.5 h-3.5" /></button>
                                                            <button onClick={async () => { await handleDeleteFromQuality(m.result_id); fetchDuplicates(); }} className="p-1 rounded text-text-muted hover:text-rose-700 hover:bg-rose-100" title={t('delete')}><Trash2 className="w-3.5 h-3.5" /></button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </>)}
                </div>
            )}

            {/* Filter Panel */}
            {showFilters && (
                <div className="mb-6 p-4 bg-surface-raised rounded-xl shadow-sm border border-ink/[0.08]">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold text-text-secondary flex items-center gap-2">
                            <Filter className="w-4 h-4" />
                            {t('filter_by_video_info')}
                        </h3>
                        <button
                            onClick={() => setFilters({ case_id: '', brand_model: '', system_version: '', function_domain: '', score_min: '', score_max: '' })}
                            className="text-sm text-text-muted hover:text-text-primary flex items-center gap-1"
                        >
                            <X className="w-3 h-3" />
                            {t('clear_filters')}
                        </button>
                    </div>
                    <div className="grid grid-cols-5 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-text-secondary mb-1.5 flex items-center gap-1">
                                <Tag className="w-3 h-3" />
                                {t('case_id')}
                            </label>
                            <input
                                type="text"
                                value={filters.case_id}
                                onChange={e => setFilters({ ...filters, case_id: e.target.value })}
                                placeholder="e.g., 1002"
                                className="w-full px-3 py-2 border border-ink/[0.1] rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-text-secondary mb-1.5 flex items-center gap-1">
                                <GitBranch className="w-3 h-3" />
                                {t('brand_model')}
                            </label>
                            <input
                                type="text"
                                value={filters.brand_model}
                                onChange={e => setFilters({ ...filters, brand_model: e.target.value })}
                                placeholder={t('brand_model_placeholder')}
                                className="w-full px-3 py-2 border border-ink/[0.1] rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-text-secondary mb-1.5 flex items-center gap-1">
                                <Cpu className="w-3 h-3" />
                                {t('system_version')}
                            </label>
                            <input
                                type="text"
                                value={filters.system_version}
                                onChange={e => setFilters({ ...filters, system_version: e.target.value })}
                                placeholder="e.g., v8.0.1"
                                className="w-full px-3 py-2 border border-ink/[0.1] rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-text-secondary mb-1.5 flex items-center gap-1">
                                <Gauge className="w-3 h-3" />
                                {t('function_domain')}
                            </label>
                            <input
                                type="text"
                                value={filters.function_domain}
                                onChange={e => setFilters({ ...filters, function_domain: e.target.value })}
                                placeholder={t('function_domain_placeholder')}
                                className="w-full px-3 py-2 border border-ink/[0.1] rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-text-secondary mb-1.5 flex items-center gap-1">
                                <Gauge className="w-3 h-3" />
                                {t('score_range')}
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="number"
                                    min="0"
                                    max="5"
                                    step="0.5"
                                    value={filters.score_min}
                                    onChange={e => setFilters({ ...filters, score_min: e.target.value })}
                                    placeholder="Min"
                                    className="w-full px-3 py-2 border border-ink/[0.1] rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                                <span className="text-text-muted">-</span>
                                <input
                                    type="number"
                                    min="0"
                                    max="5"
                                    step="0.5"
                                    value={filters.score_max}
                                    onChange={e => setFilters({ ...filters, score_max: e.target.value })}
                                    placeholder="Max"
                                    className="w-full px-3 py-2 border border-ink/[0.1] rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* 分诊配对：左待审核 vs 右库内（content_differs / completed_duplicate 组） */}
            {isAdmin && showAllData && triageGroup && isPairGroup(triageGroup) && (
                <div className="bg-surface-raised rounded-xl shadow-sm border border-ink/[0.08] flex-1 overflow-hidden flex flex-col">
                    <div className="overflow-y-auto flex-1">
                        <table className="w-full text-left text-sm table-fixed">
                            <colgroup>
                                <col className="w-[7%]" /><col className="w-[9%]" /><col className="w-[24%]" /><col className="w-[6%]" />
                                <col className="w-[7%]" /><col className="w-[9%]" /><col className="w-[24%]" /><col className="w-[6%]" />
                                <col className="w-[8%]" />
                            </colgroup>
                            <thead className="bg-surface text-text-muted sticky top-0 z-10">
                                <tr>
                                    <th className="px-2 py-2.5 text-orange-700" colSpan={4}>{t('pair_pending')}</th>
                                    <th className="px-2 py-2.5 text-sky-700 border-l border-ink/[0.1]" colSpan={4}>{t('pair_candidate')}</th>
                                    <th className="px-2 py-2.5 text-right">{t('actions')}</th>
                                </tr>
                                <tr className="text-[10px]">
                                    <th className="px-2 pb-2">{t('system_id')}</th><th className="px-2 pb-2">{t('brand_model')}</th><th className="px-2 pb-2">{t('user_question')}</th><th className="px-2 pb-2">{t('score')}</th>
                                    <th className="px-2 pb-2 border-l border-ink/[0.1]">{t('system_id')}</th><th className="px-2 pb-2">{t('brand_model')}</th><th className="px-2 pb-2">{t('user_question')}</th><th className="px-2 pb-2">{t('score')}</th>
                                    <th className="px-2 pb-2"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-ink/[0.06]">
                                {pairsLoading ? (
                                    <tr><td colSpan={9} className="p-8 text-center text-text-muted"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></td></tr>
                                ) : !triagePairs || triagePairs.pairs.length === 0 ? (
                                    <tr><td colSpan={9} className="p-8 text-center text-text-muted">{t('no_results')}</td></tr>
                                ) : triagePairs.pairs.map(p => {
                                    const sc = (s: string | null) => { const n = Number(s) || 0; return n >= 4 ? 'text-emerald-700' : n >= 3 ? 'text-amber-700' : 'text-rose-700'; };
                                    return (
                                        <tr key={p.pending.result_id} className="hover:bg-ink/[0.03] align-top">
                                            <td className="px-2 py-2 font-mono text-text-primary">{p.pending.case_id}</td>
                                            <td className="px-2 py-2 text-text-secondary truncate" title={p.pending.brand_model || ''}>{p.pending.brand_model ? tv(p.pending.brand_model) : '—'}</td>
                                            <td className="px-2 py-2 text-text-secondary"><div className="line-clamp-2" title={p.pending.user_question}>{p.pending.user_question || '—'}</div></td>
                                            <td className={clsx("px-2 py-2 font-bold", sc(p.pending.score))}>{p.pending.score ?? '—'}</td>
                                            <td className="px-2 py-2 font-mono text-text-primary border-l border-ink/[0.08]">
                                                <div className="flex items-center gap-1">
                                                    <span>{p.library?.case_id ?? '—'}</span>
                                                    {p.library && (
                                                        <span className={clsx("px-1 py-0.5 rounded text-[9px] whitespace-nowrap",
                                                            p.library.is_pending ? "bg-sky-100 text-sky-700" : "bg-emerald-100 text-emerald-700")}>
                                                            {p.library.is_pending ? t('pair_tag_pending') : t('pair_tag_approved')}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-2 py-2 text-text-secondary truncate" title={p.library?.brand_model || ''}>{p.library?.brand_model ? tv(p.library.brand_model) : '—'}</td>
                                            <td className="px-2 py-2 text-text-secondary"><div className="line-clamp-2" title={p.library?.user_question || ''}>{p.library?.user_question || '—'}</div></td>
                                            <td className={clsx("px-2 py-2 font-bold", sc(p.library?.score ?? null))}>{p.library?.score ?? '—'}</td>
                                            <td className="px-2 py-2 text-right">
                                                <button onClick={() => setCompareId(p.pending.result_id)}
                                                    className="px-2 py-1 rounded text-xs font-medium border border-amber-200 text-amber-700 hover:bg-amber-100 whitespace-nowrap">
                                                    {t('triage_review_btn')}
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    {/* 配对表分页 */}
                    <div className="p-4 border-t border-ink/[0.08] bg-surface text-xs text-text-muted flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <span>{t('showing_records', { shown: triagePairs?.pairs.length || 0, total: triagePairs?.total || 0, current: currentPage, pages: Math.max(1, Math.ceil((triagePairs?.total || 0) / pageSize)) })}</span>
                            <div className="flex items-center gap-1">
                                <span>{t('per_page')}</span>
                                {[20, 40, 60].map(n => (
                                    <button key={n} onClick={() => { setPageSize(n); setCurrentPage(1); }}
                                        className={clsx("px-2 py-0.5 rounded", pageSize === n ? "bg-ink text-text-inverse" : "hover:bg-ink/[0.05] text-text-secondary")}>{n}</button>
                                ))}
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1} className="p-1.5 rounded hover:bg-ink/[0.05] disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
                            <span className="px-2">{currentPage} / {Math.max(1, Math.ceil((triagePairs?.total || 0) / pageSize))}</span>
                            <button onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage >= Math.ceil((triagePairs?.total || 0) / pageSize)} className="p-1.5 rounded hover:bg-ink/[0.05] disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
                        </div>
                    </div>
                </div>
            )}

            {/* 视频ID总览：官方题库全部ID 网格，绿=库里有，红=缺失 */}
            {isAdmin && dataView === 'caseids' && (
                <div className="bg-surface-raised rounded-xl shadow-sm border border-ink/[0.08] flex-1 overflow-hidden flex flex-col">
                    <div className="p-4 shrink-0 flex items-center gap-4 border-b border-ink/[0.08] text-sm">
                        <span className="text-text-primary font-bold">{t('ov_caseids')}</span>
                        {caseIdOv && (
                            <>
                                <span className="text-text-muted">{t('caseids_total', { count: caseIdOv.total })}</span>
                                <span className="inline-flex items-center gap-1 text-emerald-700"><span className="w-3 h-3 rounded bg-emerald-500/70 inline-block" /> {t('caseids_present', { count: caseIdOv.present_count })}</span>
                                <span className="inline-flex items-center gap-1 text-rose-700"><span className="w-3 h-3 rounded bg-rose-500/70 inline-block" /> {t('caseids_missing', { count: caseIdOv.missing_count })}</span>
                            </>
                        )}
                    </div>
                    <div className="overflow-y-auto flex-1 p-4">
                        {caseIdLoading ? (
                            <div className="p-12 text-center text-text-muted"><Loader2 className="w-8 h-8 animate-spin mx-auto" /></div>
                        ) : !caseIdOv ? (
                            <div className="p-12 text-center text-text-muted">{t('no_results')}</div>
                        ) : (
                            <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))' }}>
                                {caseIdOv.items.map(it => (
                                    <div key={it.case_id}
                                        title={it.present ? t('caseids_have') : t('caseids_miss')}
                                        className={clsx(
                                            "px-1 py-1.5 rounded text-center text-xs font-mono border",
                                            it.present
                                                ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                                                : "bg-rose-100 text-rose-700 border-rose-200"
                                        )}>
                                        {it.case_id}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {(!isAdmin || (showAllData && dataView !== 'caseids' && !(dataView === 'reviewed' && reviewedTab === 'quality') && !(triageGroup && isPairGroup(triageGroup)))) && (
            <div className="bg-surface-raised rounded-xl shadow-sm border border-ink/[0.08] flex-1 overflow-hidden flex flex-col">
                <div className="overflow-y-auto overflow-x-hidden flex-1">
                    <table className="w-full text-left text-sm table-fixed">
                        <colgroup>
                            <col className="w-8" />{/* checkbox */}
                            <col className="w-[7%]" />{/* 用例ID */}
                            <col className="w-[8%]" />{/* 品牌车型 */}
                            <col className="w-[6%]" />{/* 系统版本(窄,预览) */}
                            <col className="w-[6%]" />{/* 功能域 */}
                            <col className="w-[16%]" />{/* 用户问题 */}
                            <col className="w-[18%]" />{/* 系统回答 */}
                            <col className="w-[5%]" />{/* 评分 */}
                            <col className="w-[16%]" />{/* 评估总结 */}
                            <col className="w-[5%]" />{/* 来源 */}
                            <col className="w-[6%]" />{/* 任务状态 */}
                            <col className="w-[6%]" />{/* 视频(窄,预览) */}
                            <col className="w-[9%]" />{/* 操作 */}
                        </colgroup>
                        <thead className="bg-surface text-text-muted font-medium sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th className="px-3 py-3 w-12">
                                    <button
                                        onClick={toggleSelectAll}
                                        className="hover:text-blue-600 flex items-center"
                                    >
                                        {filteredThenSortedResults.length > 0 && selectedIds.size === filteredThenSortedResults.length ?
                                            <CheckSquare className="w-5 h-5 text-blue-600" /> :
                                            <Square className="w-5 h-5" />
                                        }
                                    </button>
                                </th>
                                <th
                                    className="px-3 py-3 cursor-pointer hover:bg-ink/[0.05] transition-colors group whitespace-nowrap"
                                    onClick={() => handleSort('case_id')}
                                >
                                    <div className="flex items-center gap-1">
                                        <Tag className="w-3.5 h-3.5" />
                                        {t('case_id')}
                                        {getSortIcon('case_id')}
                                    </div>
                                </th>
                                <th
                                    className="px-3 py-3 cursor-pointer hover:bg-ink/[0.05] transition-colors group whitespace-nowrap"
                                    onClick={() => handleSort('brand_model')}
                                >
                                    <div className="flex items-center gap-1">
                                        <GitBranch className="w-3.5 h-3.5" />
                                        {t('brand_model')}
                                        {getSortIcon('brand_model')}
                                    </div>
                                </th>
                                <th
                                    className="px-3 py-3 cursor-pointer hover:bg-ink/[0.05] transition-colors group whitespace-nowrap"
                                    onClick={() => handleSort('system_version')}
                                >
                                    <div className="flex items-center gap-1">
                                        <Cpu className="w-3.5 h-3.5" />
                                        {t('system_version')}
                                        {getSortIcon('system_version')}
                                    </div>
                                </th>
                                <th
                                    className="px-3 py-3 cursor-pointer hover:bg-ink/[0.05] transition-colors group whitespace-nowrap"
                                    onClick={() => handleSort('function_domain')}
                                >
                                    <div className="flex items-center gap-1">
                                        <Gauge className="w-3.5 h-3.5" />
                                        {t('function_domain')}
                                        {getSortIcon('function_domain')}
                                    </div>
                                </th>
                                <th className="px-3 py-3 whitespace-nowrap">{t('user_question')}</th>
                                <th className="px-3 py-3 whitespace-nowrap">{t('system_response')}</th>
                                <th
                                    className="px-3 py-3 cursor-pointer hover:bg-ink/[0.05] transition-colors group whitespace-nowrap"
                                    onClick={() => handleSort('score')}
                                >
                                    <div className="flex items-center gap-1">
                                        {t('score')}
                                        {getSortIcon('score')}
                                    </div>
                                </th>
                                <th className="px-3 py-3 whitespace-nowrap">{t('summary')}</th>
                                <th className="px-3 py-3 whitespace-nowrap">{t('source')}</th>
                                <th className="px-3 py-3 whitespace-nowrap">{t('task_status')}</th>
                                <th className="px-3 py-3 whitespace-nowrap">{t('video')}</th>
                                <th className="px-3 py-3 text-right whitespace-nowrap">{t('actions')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-ink/[0.08]">
                            {loading ? (
                                <tr>
                                    <td colSpan={14} className="p-8 text-center text-text-muted">
                                        <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                                        {t('loading_data')}
                                    </td>
                                </tr>
                            ) : filteredThenSortedResults.length === 0 ? (
                                <tr>
                                    <td colSpan={14} className="p-8 text-center text-text-muted">
                                        {search || showFilters ? t('no_filter_results') : t('no_results')}
                                    </td>
                                </tr>
                            ) : (
                                filteredThenSortedResults.map((row) => {
                                    const videoInfo = parseVideoName(row.video_name);
                                    return (
                                        <tr
                                            key={row.id}
                                            className={clsx(
                                                "hover:bg-ink/[0.05] transition-colors group",
                                                selectedIds.has(row.id) && "bg-blue-100"
                                            )}
                                        >
                                            <td className="px-3 py-3 align-top">
                                                <button
                                                    onClick={() => toggleSelect(row.id)}
                                                    className="hover:text-blue-600"
                                                >
                                                    {selectedIds.has(row.id) ?
                                                        <CheckSquare className="w-5 h-5 text-blue-600" /> :
                                                        <Square className="w-5 h-5 text-text-primary/[0.1]" />
                                                    }
                                                </button>
                                            </td>
                                            <td className="px-3 py-3 align-top">
                                                <div className="flex flex-col gap-1.5 items-start">
                                                    <span className="bg-surface-overlay px-2.5 py-1 rounded-md text-xs font-mono font-medium text-text-secondary" title={t('system_id')}>
                                                        {row.case_id || videoInfo.case_id || 'N/A'}
                                                    </span>
                                                    {row.created_at && (
                                                        <span className="text-[10px] text-text-muted" title={t('batch_label')}>
                                                            {fmtBatchTime(row.created_at)}
                                                        </span>
                                                    )}
                                                    {row.metadata?.needs_review && (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] whitespace-nowrap bg-orange-100 text-orange-700 border border-orange-200" title={row.metadata?.review_reason || ''}>
                                                            <AlertTriangle className="w-3 h-3 shrink-0" />
                                                            {t('needs_review')}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-3 py-3 align-top">
                                                <span className="text-sm font-medium text-text-primary truncate block" title={videoInfo.brand_model || ''}>
                                                    {videoInfo.brand_model ? tv(videoInfo.brand_model) : 'N/A'}
                                                </span>
                                            </td>
                                            <td className="px-3 py-3 align-top">
                                                <span className="text-xs font-mono text-text-secondary truncate block" title={videoInfo.system_version || ''}>
                                                    {videoInfo.system_version || 'N/A'}
                                                </span>
                                            </td>
                                            <td className="px-3 py-3 align-top">
                                                <span className="text-xs font-medium text-text-secondary bg-purple-100 px-2 py-1 rounded-full truncate inline-block max-w-full" title={videoInfo.function_domain || ''}>
                                                    {videoInfo.function_domain ? td(videoInfo.function_domain) : 'N/A'}
                                                </span>
                                            </td>
                                            <td className="px-3 py-3 align-top text-text-secondary">
                                                <div className="line-clamp-2 cursor-pointer hover:text-text-primary transition-colors" title={row.metadata?.user_question || ''} onClick={() => setEditingResult(row)}>
                                                    <TranslatedText text={row.metadata?.user_question || 'N/A'} />
                                                </div>
                                            </td>
                                            <td className="px-3 py-3 align-top text-text-secondary">
                                                <div className="line-clamp-2 cursor-pointer hover:text-text-primary transition-colors" title={row.metadata?.system_response || ''} onClick={() => setEditingResult(row)}>
                                                    <TranslatedText text={row.metadata?.system_response || 'N/A'} preTranslated={row.metadata?.system_response_en} />
                                                </div>
                                            </td>
                                            <td className="px-3 py-3 align-top font-bold text-text-secondary">
                                                {row.metadata?.response_quality_score ? (
                                                    <span className={clsx(
                                                        "px-2 py-1 rounded-md text-sm",
                                                        row.metadata.response_quality_score >= 4 ? "bg-emerald-100 text-emerald-700" :
                                                            row.metadata.response_quality_score >= 3 ? "bg-amber-100 text-amber-700" :
                                                                "bg-rose-100 text-rose-700"
                                                    )}>
                                                        {row.metadata.response_quality_score}
                                                    </span>
                                                ) : '-'}
                                            </td>
                                            <td className="px-3 py-3 align-top text-text-secondary text-xs">
                                                <div className="line-clamp-2 cursor-pointer hover:text-text-primary transition-colors" title={row.metadata?.summary || ''} onClick={() => setEditingResult(row)}>
                                                    <TranslatedText text={row.metadata?.summary || 'N/A'} preTranslated={row.metadata?.summary_en} />
                                                </div>
                                            </td>
                                            <td className="px-3 py-3 align-top">
                                                {row.metadata?.analysis_source === 'mimo-v2.5' ? (
                                                    <span className="inline-block px-2 py-0.5 rounded text-[10px] bg-purple-100 text-purple-700 border border-purple-200">多模态</span>
                                                ) : (
                                                    <span className="inline-block px-2 py-0.5 rounded text-[10px] bg-blue-100 text-blue-700 border border-blue-200">ASR+LLM</span>
                                                )}
                                            </td>
                                            <td className="px-3 py-3 align-top">
                                                {row.metadata?.task_success === true ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-emerald-100 text-emerald-700 border border-emerald-200" title={row.metadata?.task_success_reason || ''}>
                                                        {t('task_success')}
                                                    </span>
                                                ) : row.metadata?.task_success === false ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-rose-100 text-rose-700 border border-rose-200" title={row.metadata?.task_success_reason || ''}>
                                                        {t('task_failed')}
                                                    </span>
                                                ) : (
                                                    <span className="text-text-muted italic text-xs">-</span>
                                                )}
                                            </td>
                                            <td className="px-3 py-3 align-top font-medium text-text-primary">
                                                <div className="text-xs font-mono truncate" title={row.video_name}>
                                                    {row.video_name}
                                                </div>
                                            </td>
                                            <td className="px-3 py-3 align-top text-right">
                                                <div className="flex justify-end items-center gap-1">
                                                    {/* 审核按钮：仅在分诊分组明细视图下、且该记录有配对目标时显示 */}
                                                    {showAllData && dataView === 'triage' && triageGroup && row.metadata?.triage?.anchor_id && (
                                                        <button
                                                            onClick={() => setCompareId(row.id)}
                                                            className="px-2 py-1 rounded text-xs font-medium border border-amber-200 text-amber-700 hover:bg-amber-100 whitespace-nowrap shrink-0"
                                                            title={t('triage_compare')}
                                                        >
                                                            {t('triage_review_btn')}
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => setEditingResult(row)}
                                                        className="p-1 hover:bg-blue-100 text-text-muted hover:text-blue-700 rounded opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                                                    >
                                                        <Edit2 className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(row.id)}
                                                        className="p-1 hover:bg-red-100 text-text-muted hover:text-rose-600 rounded opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
                <div className="p-4 border-t border-ink/[0.08] bg-surface text-xs text-text-muted flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <span>{t('showing_records', { shown: filteredThenSortedResults.length, total, current: currentPage, pages: totalPages })}</span>
                        {/* 每页条数选择 */}
                        <div className="flex items-center gap-1">
                            <span>{t('per_page')}</span>
                            {[20, 40, 60].map(n => (
                                <button key={n}
                                    onClick={() => { setPageSize(n); setCurrentPage(1); }}
                                    className={clsx("px-2 py-0.5 rounded text-xs transition-colors",
                                        pageSize === n ? "bg-ink text-text-inverse" : "hover:bg-ink/[0.05] text-text-secondary")}>
                                    {n}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage <= 1}
                            className="p-1.5 rounded hover:bg-ink/[0.05] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                            let page: number;
                            if (totalPages <= 5) {
                                page = i + 1;
                            } else if (currentPage <= 3) {
                                page = i + 1;
                            } else if (currentPage >= totalPages - 2) {
                                page = totalPages - 4 + i;
                            } else {
                                page = currentPage - 2 + i;
                            }
                            return (
                                <button
                                    key={page}
                                    onClick={() => setCurrentPage(page)}
                                    className={clsx(
                                        "w-8 h-8 rounded text-xs font-medium transition-colors",
                                        page === currentPage
                                            ? "bg-ink text-text-inverse"
                                            : "hover:bg-ink/[0.05] text-text-secondary"
                                    )}
                                >
                                    {page}
                                </button>
                            );
                        })}
                        <button
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage >= totalPages}
                            className="p-1.5 rounded hover:bg-ink/[0.05] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>
            )}

            {editingResult && (
                <EditModal
                    result={editingResult}
                    onClose={() => setEditingResult(null)}
                    onSave={handleUpdate}
                    onReanalyze={handleReanalyzeSingle}
                />
            )}

            {compareId && (
                <CompareModal
                    resultId={compareId}
                    metricNames={metricNames}
                    onClose={() => setCompareId(null)}
                    onDeleted={() => { setCompareId(null); fetchData(); fetchOverview(); fetchTriage(); fetchTriagePairs(); }}
                    onApproved={() => { setCompareId(null); fetchData(); fetchOverview(); fetchTriage(); fetchTriagePairs(); }}
                />
            )}

            {/* 质量检查表打开的完整卡片（含视频） */}
            {detailResult && (
                <ResultDetailModal
                    result={detailResult}
                    onClose={() => setDetailResult(null)}
                    onPlayVideo={(path, title) => setDetailVideo({ open: true, path, title })}
                />
            )}
            <VideoPlayerModal
                open={detailVideo.open}
                videoPath={detailVideo.path}
                title={detailVideo.title}
                onClose={() => setDetailVideo(v => ({ ...v, open: false }))}
            />
        </div>
    );
};

export default Database;
