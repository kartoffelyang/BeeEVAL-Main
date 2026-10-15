import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMetricsTranslation } from '../hooks/useMetricsTranslation';
import { getResults, retryFailedVideos, retryFailedMimo, recoverStuckVideos, recoverStuckMimo, forceCompleteTask } from '../api';
import { getScreenshotUrl, getVideoStreamUrl } from '../config';
import { TaskResults, VideoResult } from '../types';
import { ArrowLeft, Loader2, Activity, Star, X, PlayCircle, ChevronLeft, ChevronRight, RotateCcw, Filter, CheckCircle2, AlertCircle, Clock, Square, Ban } from 'lucide-react';
import clsx from 'clsx';
import TranslatedText from '../components/TranslatedText';

const ImageModal = ({ src, onClose }: { src: string; onClose: () => void }) => {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
            <div className="relative max-w-5xl max-h-[90vh] w-full p-4" onClick={e => e.stopPropagation()}>
                <button
                    onClick={onClose}
                    className="absolute top-0 right-0 -mt-12 text-white/70 hover:text-white transition-colors"
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

const StarRating = ({ rating }: { rating: number }) => {
    const safeRating = Number(rating) || 0;
    return (
        <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((star) => {
                const isFull = star <= safeRating;
                const isHalf = star - 0.5 === safeRating;

                return (
                    <div key={star} className="relative">
                        <Star
                            className={clsx(
                                "w-4 h-4",
                                isFull ? "text-amber-700 fill-amber-400" : "text-text-primary/20 fill-white/20"
                            )}
                        />
                        {isHalf && (
                            <div className="absolute top-0 left-0 overflow-hidden w-1/2">
                                <Star className="w-4 h-4 text-amber-700 fill-amber-400" />
                            </div>
                        )}
                    </div>
                );
            })}
            <span className="ml-2 font-bold text-text-secondary text-sm">{(Number(rating) || 0).toFixed(1)}/5.0</span>
        </div>
    );
};

const PAGE_SIZE = 20;

type StatusFilter = '' | 'completed' | 'failed' | 'invalid' | 'processing' | 'pending';

const getStatusOptions = (t: (key: string) => string) => [
    { value: '' as StatusFilter, label: t('status_all'), icon: <Filter className="w-3.5 h-3.5" />, color: 'text-text-secondary bg-surface-overlay border-ink/[0.1]' },
    { value: 'completed' as StatusFilter, label: t('status_completed'), icon: <CheckCircle2 className="w-3.5 h-3.5" />, color: 'text-emerald-700 bg-emerald-100 border-emerald-200' },
    { value: 'failed' as StatusFilter, label: t('status_failed'), icon: <AlertCircle className="w-3.5 h-3.5" />, color: 'text-red-700 bg-red-100 border-red-200' },
    { value: 'invalid' as StatusFilter, label: t('status_invalid'), icon: <Ban className="w-3.5 h-3.5" />, color: 'text-text-muted bg-surface-overlay border-ink/[0.1]' },
    { value: 'processing' as StatusFilter, label: t('status_processing'), icon: <Loader2 className="w-3.5 h-3.5" />, color: 'text-blue-700 bg-blue-100 border-blue-200' },
    { value: 'pending' as StatusFilter, label: t('status_pending'), icon: <Clock className="w-3.5 h-3.5" />, color: 'text-text-muted bg-surface border-ink/[0.1]' },
];

// 把 MiMo/分析链路的原始报错翻译成人话。匹配不到则回退到通用提示。
const friendlyError = (raw: string | undefined, t: (key: string) => string): string => {
    if (!raw) return t('err_unknown');
    const e = raw.toLowerCase();
    if (e.includes('failed to download') || (e.includes('param incorrect') && e.includes('url')))
        return t('err_download');
    if (e.includes('invalid json') || e.includes('expecting value'))
        return t('err_invalid_json');
    if (e.includes('quota') || e.includes('insufficient') || e.includes('balance'))
        return t('err_quota');
    if (e.includes('429') || e.includes('too many') || e.includes('rate limit'))
        return t('err_rate_limit');
    if (e.includes('multimodal data is corrupted') || e.includes('cannot be processed'))
        return t('err_corrupted');
    if (e.includes('moviepy') || e.includes('failed to read') || e.includes('duration'))
        return t('err_video_broken');
    if (e.includes('timeout') || e.includes('timed out'))
        return t('err_timeout');
    if (e.includes('cancelled') || e.includes('force-complete') || e.includes('canceled'))
        return t('err_cancelled');
    return t('err_generic');
};

const Results = () => {
    const { t } = useTranslation();
    const { tm } = useMetricsTranslation();
    const { id } = useParams<{ id: string }>();
    const statusOptions = getStatusOptions(t);
    const [data, setData] = useState<TaskResults | null>(null);
    const [loading, setLoading] = useState(true);
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [page, setPage] = useState(0);
    const [total, setTotal] = useState(0);
    const [failedCount, setFailedCount] = useState(0);
    const [stuckCount, setStuckCount] = useState(0);
    const [successCount, setSuccessCount] = useState(0);
    const [statusCounts, setStatusCounts] = useState<{ completed: number; failed: number; invalid: number; skipped: number; processing: number; pending: number }>({ completed: 0, failed: 0, invalid: 0, skipped: 0, processing: 0, pending: 0 });
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('');
    const [retrying, setRetrying] = useState(false);
    const [recovering, setRecovering] = useState(false);
    const [stopping, setStopping] = useState(false);

    const fetchData = useCallback(async (pageNum?: number, filter?: StatusFilter) => {
        if (!id) return;
        const p = pageNum ?? page;
        const s = filter !== undefined ? filter : statusFilter;
        try {
            const params: any = { offset: p * PAGE_SIZE, limit: PAGE_SIZE };
            if (s) params.status = s;
            const res = await getResults(id, params);
            setData(res);
            setTotal(res.total ?? res.results?.length ?? 0);
            setFailedCount(res.failed_count ?? 0);
            setStuckCount((res as any).stuck_count ?? 0);
            setSuccessCount(res.success_count ?? 0);
            if (res.status_counts) setStatusCounts(res.status_counts);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }, [id, page, statusFilter]);

    useEffect(() => {
        fetchData();
        const isActive = data?.task?.status === 'processing' || data?.task?.status === 'pending' || !data;
        if (!isActive) return;
        const interval = setInterval(() => {
            fetchData();
        }, 5000);
        return () => clearInterval(interval);
    }, [fetchData, data?.task?.status]);

    const totalPages = Math.ceil(total / PAGE_SIZE);

    const handlePageChange = (newPage: number) => {
        setPage(newPage);
        fetchData(newPage);
    };

    const handleStatusFilter = (s: StatusFilter) => {
        setStatusFilter(s);
        setPage(0);
        fetchData(0, s);
    };

    const isMimoTask = data?.task?.source === 'mimo' || data?.task?.folder_path?.startsWith('mimo');
    // MiMo 任务的恢复涵盖「卡住 + 失败 + 超大跳过」；ASR 老链路仅恢复卡住。
    // skipped 多为 oversized，recover 会带压缩重跑，故计入可恢复数。
    const recoverableCount = isMimoTask ? stuckCount + failedCount + (statusCounts.skipped ?? 0) : stuckCount;

    const handleRetryFailed = async () => {
        if (!id || retrying) return;
        if (!window.confirm(t('confirm_retry', { count: failedCount }))) return;
        setRetrying(true);
        try {
            // 根据任务来源选择重试接口
            if (isMimoTask) {
                await retryFailedMimo(id);
            } else {
                await retryFailedVideos(id);
            }
            setStatusFilter('');
            setPage(0);
            fetchData(0, '');
        } catch (e) {
            console.error(e);
            alert(t('retry_request_failed'));
        } finally {
            setRetrying(false);
        }
    };

    const handleRecoverStuck = async () => {
        if (!id || recovering) return;
        if (!window.confirm(t('confirm_recover', { count: recoverableCount }))) return;
        setRecovering(true);
        try {
            const res = isMimoTask ? await recoverStuckMimo(id) : await recoverStuckVideos(id);
            alert(t('recover_success', { count: res.recovered }));
            setStatusFilter('');
            setPage(0);
            fetchData(0, '');
        } catch (e) {
            console.error(e);
            alert(t('recover_request_failed'));
        } finally {
            setRecovering(false);
        }
    };

    const handleStopTask = async () => {
        if (!id || stopping) return;
        if (!window.confirm(t('confirm_stop'))) return;
        setStopping(true);
        try {
            const res = await forceCompleteTask(id);
            alert(t('task_stopped', { purged: res.celery_purged ? t('task_stopped_purged', { count: res.celery_purged }) : '' }));
            fetchData();
        } catch (e) {
            console.error(e);
            alert(t('stop_task_failed'));
        } finally {
            setStopping(false);
        }
    };

    if (loading && !data) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
        );
    }

    if (!data) {
        return <div className="p-8 text-center text-text-muted">Task not found</div>;
    }

    // Determine overall status message
    const processingVideos = data.results.filter(v => v.metadata?.status === 'processing');
    const pendingVideos = data.results.filter(v => v.metadata?.status === 'pending' || v.metadata?.status === 'queued');

    return (
        <div className="h-[100dvh] flex flex-col relative">
            {previewImage && <ImageModal src={previewImage} onClose={() => setPreviewImage(null)} />}

            {/* Header */}
            <div className="bg-surface-raised border-b border-ink/[0.08] px-8 py-4 z-10">
                <div className="flex justify-between items-center">
                <div className="flex items-center gap-4">
                    <Link to="/history" className="p-2 hover:bg-ink/[0.05] rounded-lg text-text-muted">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <div>
                        <h2 className="text-xl font-bold text-text-primary">Analysis Results</h2>
                        <div className="flex items-center gap-2 text-sm text-text-muted mt-1">
                            <span className="font-mono bg-surface-overlay px-2 py-0.5 rounded text-xs">{id}</span>
                            <span>•</span>
                            <span className={clsx(
                                "capitalize font-medium",
                                data.task.status === 'completed' ? "text-emerald-600" :
                                data.task.status === 'processing' ? "text-blue-600" : "text-text-secondary"
                            )}>
                                {data.task.status === 'completed' ? 'Finished' : data.task.status}
                                {(data.task.status === 'processing' || data.task.status === 'completed') && (
                                    <span className="ml-2 text-text-muted font-normal">
                                        {t('results_progress_summary', {
                                            success: successCount,
                                            failed: statusCounts.failed,
                                            pending: statusCounts.pending + statusCounts.processing,
                                            total: data.task.total_videos,
                                        })}
                                    </span>
                                )}
                            </span>
                        </div>
                    </div>
                </div>
                {/* Progress Bar for Processing */}
                {data.task.status === 'processing' && (
                    <div className="w-1/3 bg-surface p-4 rounded-lg border border-ink/[0.08]">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-sm font-medium text-text-secondary">
                                {t('total_progress', { percent: data.task.total_videos > 0 ? Math.min(100, Math.round((successCount / data.task.total_videos) * 100)) : 0 })}
                            </span>
                        </div>
                        <div className="w-full h-2 bg-ink/[0.1] rounded-full overflow-hidden mb-3">
                            <div
                                className="h-full bg-blue-500 transition-all duration-500 ease-out rounded-full"
                                style={{ width: `${data.task.total_videos > 0 ? Math.min(100, (successCount / data.task.total_videos) * 100) : 0}%` }}
                            />
                        </div>

                        {/* Current Active Tasks */}
                        <div className="space-y-2">
                            {processingVideos.map(v => (
                                <div key={v.id} className="flex items-center justify-between text-xs bg-surface-raised p-2 rounded border border-blue-200 shadow-sm animate-pulse">
                                    <div className="flex items-center gap-2 overflow-hidden">
                                        <Loader2 className="w-3 h-3 animate-spin text-blue-500 flex-shrink-0" />
                                        <span className="font-medium text-text-secondary truncate max-w-[150px]">{v.video_name}</span>
                                        <span className="text-text-muted">|</span>
                                        <span className="text-blue-600 font-medium">{v.metadata?.current_phase || "Initializing..."}</span>
                                    </div>
                                    <span className="font-mono text-text-muted">{v.metadata?.progress || 0}%</span>
                                </div>
                            ))}
                            {processingVideos.length === 0 && pendingVideos.length > 0 && (
                                <div className="text-xs text-text-muted text-center italic">
                                    Queueing next video...
                                </div>
                            )}
                        </div>
                    </div>
                )}
                </div>

                {/* Status Filter Bar + Retry Button */}
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-ink/[0.08]">
                    <div className="flex items-center gap-2">
                        {statusOptions.map(opt => {
                            // 每个状态栏的实时数字：'全部' 显示总数(=total_videos)，其余取对应状态计数
                            const badge =
                                opt.value === '' ? (data.task.total_videos || total) :
                                opt.value === 'completed' ? statusCounts.completed :
                                opt.value === 'failed' ? statusCounts.failed :
                                opt.value === 'invalid' ? statusCounts.invalid :
                                opt.value === 'processing' ? statusCounts.processing :
                                opt.value === 'pending' ? statusCounts.pending : 0;
                            const active = statusFilter === opt.value;
                            return (
                                <button
                                    key={opt.value}
                                    onClick={() => handleStatusFilter(opt.value)}
                                    className={clsx(
                                        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all",
                                        active
                                            ? `${opt.color} border-current shadow-sm`
                                            : "text-text-muted bg-surface-raised border-ink/[0.08] hover:border-ink/[0.1] hover:text-text-secondary"
                                    )}
                                >
                                    {opt.icon}
                                    {opt.label}
                                    <span className={clsx(
                                        "ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold tabular-nums",
                                        active ? "bg-ink/[0.12]" : "bg-ink/[0.06] text-text-muted"
                                    )}>{badge}</span>
                                </button>
                            );
                        })}
                    </div>
                    {/* “重新分析失败视频”按钮已隐藏：与“恢复卡住/失败视频”功能重叠且会新建任务/删记录，
                        统一只保留下方“恢复”按钮，避免混淆。handleRetryFailed 逻辑保留以备后用。 */}
                    {recoverableCount > 0 && (
                        <button
                            onClick={handleRecoverStuck}
                            disabled={recovering}
                            className="flex items-center gap-2 px-4 py-2 bg-amber-100 hover:bg-amber-600 disabled:bg-amber-300 text-text-primary rounded-lg text-xs font-medium transition-colors shadow-sm"
                        >
                            <RotateCcw className={clsx("w-3.5 h-3.5", recovering && "animate-spin")} />
                            {recovering ? t('recovering') : t('recover_stuck_videos', { count: recoverableCount })}
                        </button>
                    )}
                    {(data.task.status === 'processing' || data.task.status === 'pending') && (
                        <button
                            onClick={handleStopTask}
                            disabled={stopping}
                            className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-text-inverse rounded-lg text-xs font-medium transition-colors shadow-sm"
                            title={t('stop_task_title')}
                        >
                            <Square className={clsx("w-3.5 h-3.5", stopping && "animate-pulse")} fill="currentColor" />
                            {stopping ? t('stopping') : t('stop_task')}
                        </button>
                    )}
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* Main Content */}
                <div className="flex-1 overflow-y-auto bg-surface-overlay/50 p-8">
                    {data.results.length > 0 ? (
                        <div className="max-w-full mx-auto">
                            <div className="bg-surface-raised rounded-xl shadow-sm border border-ink/[0.08] overflow-hidden">
                                <div className="p-4 border-b border-ink/[0.08] bg-surface/50">
                                    <h3 className="font-semibold text-text-primary">Analysis Details</h3>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-surface text-text-muted font-medium">
                                            <tr>
                                                <th className="px-6 py-4 w-1/6">Video / Question</th>
                                                <th className="px-6 py-4 w-1/6">System Response</th>
                                                <th className="px-6 py-4 w-1/12">Screenshot</th>
                                                <th className="px-6 py-4 w-1/12">Video</th>
                                                <th className="px-6 py-4 w-1/12">Latency</th>
                                                <th className="px-6 py-4 w-1/6">Quality</th>
                                                <th className="px-6 py-4 w-1/4">Evaluation Details</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-ink/[0.08]">
                                            {data.results.map((video) => {
                                                const isProcessing = video.metadata?.status === 'processing';
                                                const isPending = video.metadata?.status === 'pending' || video.metadata?.status === 'queued';
                                                const isFailed = video.metadata?.status === 'failed';
                                                const isInvalid = video.metadata?.status === 'invalid';

                                                if (isPending) {
                                                    return (
                                                        <tr key={video.id} className="bg-surface/30">
                                                            <td className="px-6 py-4 align-top">
                                                                <div className="font-medium text-text-muted">{video.video_name}</div>
                                                                <div className="inline-flex items-center gap-1.5 mt-2 px-2 py-1 bg-surface-overlay rounded text-xs text-text-muted">
                                                                    <div className="w-1.5 h-1.5 bg-text-muted rounded-full" />
                                                                    Pending
                                                                </div>
                                                            </td>
                                                            <td colSpan={6} className="px-6 py-4 text-text-muted italic">Waiting to start...</td>
                                                        </tr>
                                                    );
                                                }

                                                if (isFailed) {
                                                    return (
                                                        <tr key={video.id} className="bg-red-100">
                                                            <td className="px-6 py-4 align-top">
                                                                <div className="font-medium text-text-primary">{video.video_name}</div>
                                                                <div className="inline-flex items-center gap-1.5 mt-2 px-2 py-1 bg-red-100 rounded text-xs text-red-700 border border-red-200">
                                                                    <X className="w-3 h-3" />
                                                                    Failed
                                                                </div>
                                                            </td>
                                                            <td colSpan={6} className="px-6 py-4">
                                                                <div className="bg-red-100 p-3 rounded border border-red-200">
                                                                    <div className="text-red-700 text-sm font-medium mb-1">
                                                                        {friendlyError(video.metadata?.error, t)}
                                                                    </div>
                                                                    <details className="text-red-700/80 text-xs">
                                                                        <summary className="cursor-pointer select-none hover:text-red-700">{t('err_detail_toggle')}</summary>
                                                                        <div className="mt-1 font-mono break-all">
                                                                            {video.metadata?.error || "Unknown error"}
                                                                        </div>
                                                                    </details>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                }

                                                if (isInvalid) {
                                                    return (
                                                        <tr key={video.id} className="bg-surface/40">
                                                            <td className="px-6 py-4 align-top">
                                                                <div className="font-medium text-text-secondary">{video.video_name}</div>
                                                                <div className="inline-flex items-center gap-1.5 mt-2 px-2 py-1 bg-surface-overlay rounded text-xs text-text-muted border border-ink/[0.1]">
                                                                    <Ban className="w-3 h-3" />
                                                                    {t('status_invalid')}
                                                                </div>
                                                            </td>
                                                            <td colSpan={6} className="px-6 py-4">
                                                                <div className="text-text-muted text-xs bg-surface-overlay p-3 rounded border border-ink/[0.08]">
                                                                    {video.metadata?.invalid_reason || t('invalid_no_reason')}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                }

                                                if (isProcessing) {
                                                    return (
                                                        <tr key={video.id} className="bg-blue-100">
                                                            <td className="px-6 py-4 align-top">
                                                                <div className="font-medium text-text-primary">{video.video_name}</div>
                                                                <div className="inline-flex items-center gap-1.5 mt-2 px-2 py-1 bg-blue-100 rounded text-xs text-blue-600 border border-blue-200">
                                                                    <Loader2 className="w-3 h-3 animate-spin" />
                                                                    Analyzing ({video.metadata?.progress || 0}%)
                                                                </div>
                                                            </td>
                                                            <td colSpan={6} className="px-6 py-4">
                                                                <div className="flex flex-col gap-2">
                                                                    <span className="text-text-muted text-xs uppercase tracking-wider font-medium">{video.metadata?.current_phase || "Processing..."}</span>
                                                                    <div className="w-full max-w-md h-1.5 bg-surface-overlay rounded-full overflow-hidden">
                                                                        <div
                                                                            className="h-full bg-blue-400 rounded-full transition-all duration-300 animate-pulse"
                                                                            style={{ width: `${video.metadata?.progress || 0}%` }}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                }

                                                return (
                                                    <tr key={video.id} className="hover:bg-ink/[0.05] transition-colors">
                                                        <td className="px-6 py-4 align-top">
                                                            <div className="font-medium text-text-primary mb-1 break-words whitespace-pre-wrap">
                                                                {video.video_name}
                                                                {video.metadata?.reused && (
                                                                    <span className="ml-2 px-1.5 py-0.5 bg-purple-100 text-purple-700 border border-purple-200 rounded text-[10px] font-medium align-middle">{t('reused_badge')}</span>
                                                                )}
                                                            </div>
                                                            <div className="text-text-muted text-xs mb-3 font-mono break-all">{video.metadata.path}</div>
                                                            {video.metadata.user_question && (
                                                                <div className="bg-blue-100 p-3 rounded-lg border border-blue-200">
                                                                    <div className="text-xs font-semibold text-blue-700 mb-1">USER QUESTION</div>
                                                                    <div className="text-text-secondary text-xs leading-relaxed whitespace-pre-wrap">{video.metadata.user_question}</div>
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="px-6 py-4 align-top">
                                                            {video.metadata.system_response ? (
                                                                <div className="bg-emerald-100 p-3 rounded-lg border border-emerald-200">
                                                                    <div className="text-xs font-semibold text-emerald-700 mb-1">SYSTEM RESPONSE</div>
                                                                    <div className="text-text-secondary text-xs leading-relaxed whitespace-pre-wrap">{video.metadata.system_response}</div>
                                                                </div>
                                                            ) : (
                                                                <span className="text-text-muted italic text-xs">No response detected</span>
                                                            )}
                                                        </td>
                                                        <td className="px-6 py-4 align-top">
                                                            {video.metadata.screenshot_path ? (
                                                                <div className="group relative w-32">
                                                                    <img
                                                                        src={getScreenshotUrl(video.metadata.screenshot_path)}
                                                                        alt="System Response"
                                                                        className="w-full h-auto rounded-lg border border-ink/[0.08] shadow-sm cursor-pointer hover:ring-2 ring-blue-500 transition-all"
                                                                        onClick={() => setPreviewImage(getScreenshotUrl(video.metadata.screenshot_path))}
                                                                    />
                                                                </div>
                                                            ) : (
                                                                <div className="w-32 aspect-video bg-surface-overlay rounded-lg flex items-center justify-center text-text-muted border border-ink/[0.08] border-dashed">
                                                                    <span className="text-xs">No Image</span>
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="px-6 py-4 align-top">
                                                             <a
                                                                 href={getVideoStreamUrl(video.metadata.path)}
                                                                 target="_blank"
                                                                 rel="noopener noreferrer"
                                                                 className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-surface-overlay hover:bg-ink/[0.05] text-text-secondary rounded-md transition-colors text-xs font-medium"
                                                             >
                                                                 <PlayCircle className="w-4 h-4" />
                                                                 Watch
                                                             </a>
                                                        </td>
                                                        <td className="px-6 py-4 align-top whitespace-nowrap">
                                                            <div className="flex items-center gap-2">
                                                                <Activity className="w-4 h-4 text-text-muted" />
                                                                <span className="font-mono font-bold text-text-secondary text-sm">
                                                                    {video.metadata.latency_ms || 0} ms
                                                                </span>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4 align-top">
                                                             <div className="space-y-2">
                                                                <StarRating rating={video.metadata.response_quality_score || 0} />
                                                                {video.metadata.summary && (
                                                                    <div className="text-xs text-text-secondary bg-amber-100 p-2 rounded border border-amber-200 leading-relaxed">
                                                                        <span className="font-semibold text-amber-700 block mb-1">Summary:</span>
                                                                        <TranslatedText text={video.metadata.summary} preTranslated={video.metadata.summary_en} />
                                                                    </div>
                                                                )}
                                                             </div>
                                                        </td>
                                                        <td className="px-6 py-4 align-top">
                                                            <div className="space-y-3">
                                                                {video.evaluation_scores.map((score, idx) => (
                                                                    <div key={score.id || idx} className="bg-surface p-2.5 rounded border border-ink/[0.08]">
                                                                        <div className="flex justify-between items-center mb-1">
                                                                            <div className="flex flex-col">
                                                                                <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">{tm(score.criteria)}</span>
                                                                                {score.metric_code && (
                                                                                    <span className="text-[9px] text-text-muted font-mono">{score.metric_code}</span>
                                                                                )}
                                                                                {score.category && (
                                                                                    <span className="text-[9px] text-text-muted">{score.category}</span>
                                                                                )}
                                                                            </div>
                                                                            <span className={clsx(
                                                                                "text-[10px] font-bold px-1.5 py-0.5 rounded",
                                                                                score.score >= 4 ? "bg-emerald-100 text-emerald-700" :
                                                                                score.score >= 3 ? "bg-amber-100 text-amber-700" :
                                                                                "bg-rose-100 text-rose-700"
                                                                            )}>
                                                                                {(Number(score.score) || 0).toFixed(1)}
                                                                            </span>
                                                                        </div>
                                                                        <p className="text-xs text-text-secondary leading-relaxed"><TranslatedText text={score.feedback} preTranslated={score.feedback_en} /></p>
                                                                        {score.selection_reason && (
                                                                            <p className="text-[10px] text-text-muted mt-1.5 italic border-t border-ink/[0.08] pt-1.5">
                                                                                {t('selection_reason')}<TranslatedText text={score.selection_reason} preTranslated={score.selection_reason_en} />
                                                                            </p>
                                                                        )}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-text-muted">
                            <Activity className="w-12 h-12 mb-4 opacity-20" />
                            <p>No results available</p>
                        </div>
                    )}

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-center gap-3 py-4 bg-surface-overlay/50">
                            <button
                                onClick={() => handlePageChange(page - 1)}
                                disabled={page === 0}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-ink/[0.1] text-xs hover:bg-ink/[0.05] disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                <ChevronLeft className="w-3 h-3" /> {t('prev_page')}
                            </button>
                            <span className="text-xs text-text-secondary font-mono">
                                {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, total)} / {total}
                            </span>
                            <button
                                onClick={() => handlePageChange(page + 1)}
                                disabled={page + 1 >= totalPages}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-ink/[0.1] text-xs hover:bg-ink/[0.05] disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                {t('next_page')} <ChevronRight className="w-3 h-3" />
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Results;
