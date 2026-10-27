import { PlatformDrawer } from './platform/PlatformUI';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useMetricsTranslation } from '../hooks/useMetricsTranslation';
import { PlayCircle, X, Info, CheckCircle2, XCircle, Lock } from 'lucide-react';
import clsx from 'clsx';
import TranslatedText from './TranslatedText';
import { useAuth } from '../contexts/AuthContext';
import { isDomainTrial, TRIAL_DOMAIN } from '../contexts/TrialContext';
import { getScreenshotUrl, getVideoPosterUrl } from '../config';

interface ResultDetailModalProps {
    result: any;
    onClose: () => void;
    onPlayVideo: (path: string, title: string) => void;
    /** Legacy viewer sample whitelist. Explicit Trial memberships use domain permissions. */
    allowTrial?: boolean;
}

/** 体验账号无权查看时的占位内容（替换详情卡片主体）。 */
const TrialLockedDetail: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
    const { t } = useTranslation();
    return (
        <div className="relative flex flex-col items-center justify-center gap-4 py-20 px-8 text-center">
            {onClose && (
                <button onClick={onClose} className="absolute top-4 right-4 text-text-muted hover:text-text-primary">
                    <X className="w-5 h-5" />
                </button>
            )}
            <div className="w-16 h-16 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
                <Lock className="w-8 h-8 text-amber-700" />
            </div>
            <p className="text-base text-text-secondary max-w-sm">{t('trial_locked_video')}</p>
        </div>
    );
};

/**
 * 用例详情卡片内容（无外层遮罩）。既被 ResultDetailModal（全屏弹窗）包裹使用，
 * 也可直接嵌入其它容器（如「场景基线」的用例弹窗右侧展示框）。
 * onClose 省略时不显示右上角关闭按钮（由外层容器自行控制关闭）。
 */
export const ResultDetailContent: React.FC<{
    result: any;
    onPlayVideo: (path: string, title: string) => void;
    onClose?: () => void;
    allowTrial?: boolean;
    flow?: boolean;
}> = ({ result, onPlayVideo, onClose, allowTrial = false, flow = false }) => {
    const { t } = useTranslation();
    const { tm, td, tv } = useMetricsTranslation();
    const { user } = useAuth();
    // Tier permissions supersede the legacy viewer whitelist. Trial evidence stays travel-only.
    const tier = user?.membership_tier;
    const trialBlocked = isDomainTrial(user) && result.function_domain !== TRIAL_DOMAIN;
    const legacyBlocked = user?.role === 'viewer' && !['trial', 'plus', 'pro'].includes(tier || '') && !allowTrial;
    if (trialBlocked || legacyBlocked) {
        return <TrialLockedDetail onClose={onClose} />;
    }

    // 文件名命名规则：id-车型-系统版本-Domain-type（如 1052-蔚来ET5-3.2.2-车控域-NULL.mp4）。
    // 优先用数据库结构化字段，缺失时按规则从文件名切割兜底。
    const parseMeta = (name: string) => {
        const base = (name || '').replace(/\.(mp4|mov|avi|mkv)$/i, '');
        const parts = base.split('-');
        return {
            id: result.case_id || parts[0] || '',
            brandModel: result.brand_model || parts[1] || '',
            systemVersion: result.system_version || parts[2] || '',
            domain: result.function_domain || parts[3] || '',
            type: parts[4] || '',
        };
    };

    const getTestCaseName = (name: string) => {
        return (name || '').replace(/\.(mp4|mov|avi|mkv)$/i, '');
    };

    const meta = parseMeta(result.video_name);

    // 综合评分：优先用后端已算好的 response_quality_score；缺失时（如问答 fallback 用
    // source 数据构造的卡片）从各维度 evaluation_scores 的数字型 score 求均分兜底，
    // 与后端 _case_overall_score 口径一致，避免显示 N/A。
    const overallScore: number | null = (() => {
        const q = result.metadata?.response_quality_score;
        if (typeof q === 'number' && !Number.isNaN(q)) return q;
        const qn = parseFloat(q);
        if (!Number.isNaN(qn)) return qn;
        const nums = (result.evaluation_scores || [])
            .map((s: any) => (typeof s.score === 'number' ? s.score : parseFloat(s.score)))
            .filter((n: number) => !Number.isNaN(n));
        if (nums.length === 0) return null;
        const avg = nums.reduce((a: number, b: number) => a + b, 0) / nums.length;
        return Math.round(avg * 10) / 10;
    })();

    return (
        <>
                {/* Header */}
                <div className="evidence-heading p-4 border-b border-ink/[0.08] flex justify-between items-start bg-surface">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                            {meta.brandModel && (
                                <span className="bg-primary text-text-inverse text-xs font-bold px-2 py-1 rounded uppercase tracking-wider shadow-sm">
                                    {tv(meta.brandModel)}
                                </span>
                            )}
                            {meta.systemVersion && (
                                <span className="text-xs font-medium px-2 py-1 rounded border border-ink/[0.15] text-text-secondary">
                                    {meta.systemVersion}
                                </span>
                            )}
                            {meta.domain && (
                                <span className="text-xs font-medium px-2 py-1 rounded border border-ink/[0.15] text-text-secondary">
                                    {td(meta.domain)}
                                </span>
                            )}
                        </div>
                        <h2 className="evidence-title text-base font-semibold text-text-primary" title={getTestCaseName(result.video_name)}>
                            <TranslatedText text={result.metadata?.user_question || result.user_question || getTestCaseName(result.video_name) || `CASE ${meta.id}`} preTranslated={result.metadata?.user_question_en} />
                        </h2>
                    </div>
                    {onClose && (
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-ink/[0.05] rounded-full transition-colors text-text-muted"
                        >
                            <X className="w-6 h-6" />
                        </button>
                    )}
                </div>

                {/* Content */}
                <div className={flow ? "evidence-flow relative" : "flex-1 overflow-hidden relative"}>
                    <div className={flow ? "evidence-grid w-full" : "flex flex-col md:grid md:grid-cols-3 h-full absolute inset-0 w-full"}>
                        {/* Left Column */}
                        <div className="evidence-media md:col-span-1 bg-surface p-4 border-r border-ink/[0.08] space-y-4 overflow-y-auto h-full">
                            <div
                                className="evidence-preview rounded-xl overflow-hidden bg-black aspect-video relative group cursor-pointer" role="button" tabIndex={result.metadata?.path ? 0 : -1} aria-label={t('click_to_play')} onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && result.metadata?.path) { e.preventDefault(); onPlayVideo(result.metadata.path, result.video_name); } }}
                                onClick={() => {
                                    const path = result.metadata?.path;
                                    if (path) onPlayVideo(path, result.video_name || path);
                                }}
                            >
                                {/* 首帧预览：优先已存的 screenshot_path，否则用 video_name 现场抽帧（后端 ffmpeg + 缓存）。
                                    两者都不可用时露出下层黑底。 */}
                                {(result.metadata?.screenshot_path
                                    ? getScreenshotUrl(result.metadata.screenshot_path)
                                    : getVideoPosterUrl(result.video_name)) ? (
                                    <img
                                        src={result.metadata?.screenshot_path
                                            ? getScreenshotUrl(result.metadata.screenshot_path)
                                            : getVideoPosterUrl(result.video_name)}
                                        alt="thumbnail"
                                        decoding="async"
                                        className="w-full h-full object-cover opacity-80 group-hover:opacity-60 transition-opacity"
                                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                                    />
                                ) : (
                                    <div className="w-full h-full bg-surface-overlay" />
                                )}
                                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                                    {result.metadata?.path ? (
                                        <>
                                            <PlayCircle className="w-14 h-14 text-white drop-shadow-lg group-hover:scale-110 transition-transform" />
                                            <span className="text-white/80 text-xs font-medium">{t('click_to_play')}</span>
                                        </>
                                    ) : (
                                        <>
                                            <PlayCircle className="w-10 h-10 text-white/40" />
                                            <span className="text-white/70 text-xs">{result.metadata?.preview_source || t('no_video_path')}</span>
                                        </>
                                    )}
                                </div>
                            </div>

                            <div className="evidence-overall bg-surface-raised p-3 rounded-lg border border-ink/[0.08] flex items-center justify-between">
                                <div className="text-sm text-text-muted mb-1 uppercase tracking-wide font-semibold">{t('overall_score')}</div>
                                <div className={clsx(
                                    "text-2xl font-semibold whitespace-nowrap",
                                    overallScore == null ? "text-rose-700" :
                                        overallScore >= 4 ? "text-emerald-700" :
                                            overallScore >= 3 ? "text-amber-700" : "text-rose-700"
                                )}>
                                    {overallScore != null ? overallScore : 'N/A'}
                                    <span className="text-lg text-text-muted ml-1 font-normal">/ 5</span>
                                </div>
                            </div>

                            <div className="evidence-facts grid grid-cols-2 gap-2">
                                <div className="bg-surface-raised p-3 rounded-lg border border-ink/[0.08]">
                                    <div className="text-xs text-text-muted mb-1">{t('system_id')}</div>
                                    <div className="font-mono font-medium text-text-primary">{result.case_id || meta.id || 'N/A'}</div>
                                </div>
                                <div className="bg-surface-raised p-3 rounded-lg border border-ink/[0.08]">
                                    <div className="text-xs text-text-muted mb-1">{t('task_status')}</div>
                                    {result.metadata?.task_success === true ? (
                                        <div className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700">
                                            <CheckCircle2 className="w-4 h-4" /> {t('task_success')}
                                        </div>
                                    ) : result.metadata?.task_success === false ? (
                                        <div className="inline-flex items-center gap-1 text-sm font-medium text-rose-700">
                                            <XCircle className="w-4 h-4" /> {t('task_failed')}
                                        </div>
                                    ) : (
                                        <div className="text-sm text-text-muted italic">{t('task_success_unknown')}</div>
                                    )}
                                </div>
                                <div className="bg-surface-raised p-3 rounded-lg border border-ink/[0.08]">
                                    <div className="text-xs text-text-muted mb-1">{t('latency')}</div>
                                    <div className="font-mono font-medium">{result.metadata?.latency_ms ? `${result.metadata.latency_ms} ms` : 'N/A'}</div>
                                </div>
                                <div className="bg-surface-raised p-3 rounded-lg border border-ink/[0.08]">
                                    <div className="text-xs text-text-muted mb-1">{t('analysis_date')}</div>
                                    <div className="text-sm">{result.created_at ? new Date(result.created_at).toLocaleDateString() : 'N/A'}</div>
                                </div>
                            </div>
                        </div>
                        {/* Right Column */}
                        <div className="evidence-analysis md:col-span-2 p-4 space-y-4 bg-surface-raised overflow-y-auto h-full">
                            <section className="mb-4">
                                <h3 className="text-sm font-semibold text-text-primary mb-2">{t('interaction_log')}</h3>
                                <div className="space-y-4">
                                    {Array.isArray(result.metadata?.dialogue) && result.metadata.dialogue.length > 0 ? (
                                        // 多轮对话：按轮次分开展示，每轮一问一答
                                        result.metadata.dialogue.map((turn: any, idx: number) => (
                                            <div key={idx} className="space-y-2">
                                                {result.metadata.dialogue.length > 1 && (
                                                    <div className="text-[10px] text-text-muted uppercase tracking-wide font-semibold pl-1">
                                                        {t('turn_label')} {turn.turn ?? idx + 1}
                                                    </div>
                                                )}
                                                {turn.user && (
                                                    <div className="flex gap-3 justify-end">
                                                        <div className="bg-secondary text-text-inverse p-3 rounded-2xl rounded-tr-none text-sm max-w-[80%] shadow-sm">
                                                            <div className="text-[10px] opacity-70 mb-1 uppercase tracking-wide font-semibold">{t('user_label')}</div>
                                                            <TranslatedText text={turn.user} preTranslated={turn.user_en} />
                                                        </div>
                                                    </div>
                                                )}
                                                {turn.system && (
                                                    <div className="flex gap-3">
                                                        <div className="bg-surface-overlay text-text-secondary p-3 rounded-2xl rounded-tl-none text-sm max-w-[80%] border border-ink/[0.08]">
                                                            <div className="text-[10px] text-text-muted mb-1 uppercase tracking-wide font-semibold">{t('system_label')}</div>
                                                            <TranslatedText text={turn.system} preTranslated={turn.system_en} />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ))
                                    ) : (
                                        // 兼容旧数据（Gemini / 无 dialogue）：整段汇总展示
                                        <>
                                            <div className="flex gap-3 justify-end">
                                                <div className="bg-secondary text-text-inverse p-3 rounded-2xl rounded-tr-none text-sm max-w-[80%] shadow-sm">
                                                    <div className="text-[10px] opacity-70 mb-1 uppercase tracking-wide font-semibold">{t('user_label')}</div>
                                                    <TranslatedText text={result.metadata?.user_question || 'N/A'} />
                                                </div>
                                            </div>
                                            <div className="flex gap-3">
                                                <div className="bg-surface-overlay text-text-secondary p-3 rounded-2xl rounded-tl-none text-sm max-w-[80%] border border-ink/[0.08]">
                                                    <div className="text-[10px] text-text-muted mb-1 uppercase tracking-wide font-semibold">{t('system_label')}</div>
                                                    <TranslatedText text={result.metadata?.system_response || 'N/A'} preTranslated={result.metadata?.system_response_en} />
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </section>

                            <section>
                                <h3 className="text-sm font-semibold text-text-primary mb-2 flex items-center gap-2">
                                    <Info className="w-5 h-5 text-secondary" />
                                    {t('summary')}
                                </h3>
                                <div className="bg-secondary/5 p-3 rounded-lg text-text-secondary leading-relaxed border border-ink/[0.08] text-sm">
                                    <TranslatedText text={result.metadata?.summary || 'N/A'} preTranslated={result.metadata?.summary_en} />
                                </div>
                            </section>

                            {result.evaluation_scores && result.evaluation_scores.length > 0 && (
                                <section>
                                    <h3 className="text-sm font-semibold text-text-primary mb-2">{t('evaluation_details')}</h3>
                                    <div className="space-y-4">
                                        {result.evaluation_scores.filter((score: any) => (score.metric_code || '') !== 'C11').map((score: any) => (
                                            <div key={score.id || score.criteria} className="evidence-dimension bg-surface-overlay border border-ink/[0.08] rounded-lg p-3">
                                                <div className="flex justify-between items-center gap-3">
                                                    <span className="font-bold text-text-secondary">{tm(score.criteria)}</span>
                                                    <span className={clsx(
                                                        "px-2 py-0.5 rounded text-xs font-bold",
                                                        score.score >= 4 ? "bg-emerald-100 text-emerald-700" :
                                                            score.score >= 3 ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700"
                                                    )}>
                                                        {score.score} / 5
                                                    </span>
                                                </div>
                                                <p className="text-sm text-text-secondary mt-2 leading-relaxed">
                                                    <TranslatedText text={score.feedback} preTranslated={score.feedback_en} />
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            )}

                            {/* 人工修改历史 */}
                            {Array.isArray(result.metadata?.edit_history) && result.metadata.edit_history.length > 0 && (
                                <section>
                                    <h3 className="text-sm font-semibold text-text-primary mb-2 flex items-center gap-2">
                                        <Info className="w-5 h-5 text-sky-700" />
                                        {t('edit_history_title')}
                                    </h3>
                                    <div className="space-y-2">
                                        {result.metadata.edit_history.map((h: any, i: number) => (
                                            <div key={i} className="bg-sky-100 border border-sky-500/20 rounded-xl p-3 text-xs">
                                                <div className="flex items-center gap-2 text-text-muted mb-1">
                                                    <span>{h.at}</span>
                                                    <span className="text-text-secondary">· {h.operator || 'unknown'}</span>
                                                </div>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {Array.isArray(h.changes) && h.changes.map((c: any, j: number) => (
                                                        <span key={j} className="font-mono bg-ink/[0.06] rounded px-1.5 py-0.5 text-[10px]">
                                                            {c.metric_code} {c.action === 'changed' ? `${c.old_score}→${c.new_score}` : c.action}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            )}
                        </div>
                    </div>
                </div>
        </>
    );
};

const ResultDetailModal: React.FC<ResultDetailModalProps> = ({ result, onClose, onPlayVideo, allowTrial = false }) => {
    const { i18n } = useTranslation();
    const label = i18n.language?.startsWith('zh') ? '用例' : 'Case';
    return (
    <PlatformDrawer centered title={`${label} ${result.case_id || '—'}`} onClose={onClose}>
        <ResultDetailContent result={result} flow onPlayVideo={(path,title) => { onClose(); onPlayVideo(path,title); }} allowTrial={allowTrial} />
    </PlatformDrawer>
    );
};
export default ResultDetailModal;
