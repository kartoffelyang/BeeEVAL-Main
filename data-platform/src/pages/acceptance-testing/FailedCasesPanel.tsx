import React, { useEffect, useState } from 'react';
import { XCircle, FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getTaskDetailCases } from '../../api';
import ResultDetailModal from '../../components/ResultDetailModal';
import VideoPlayerModal from '../../components/VideoPlayerModal';

interface Props {
    brandModel: string;
    systemVersion: string | null;
    functionDomain: string;
    taskDetail: string;
    /** 验收梯度：限定只取同一梯度下的失败用例，与表头失败数口径一致。 */
    acceptanceGrade: string;
}

// 从文件名/字段取用例展示名（去扩展名）。
const caseName = (r: any): string =>
    (r?.video_name || '').replace(/\.(mp4|mov|avi|mkv)$/i, '') || r?.case_id || '—';

// 判定单个 case 是否失败：口径与后端一致（metadata.task_success === 'false'）。
const isFailed = (r: any): boolean =>
    String(r?.metadata?.task_success ?? '').trim().toLowerCase() === 'false';

/**
 * 改进清单某任务类型行展开后的内联面板：只列该类型下「失败」的用例（非全量）。
 * 每个失败用例可点开详情卡片 / 播放视频。
 */
const FailedCasesPanel: React.FC<Props> = ({ brandModel, systemVersion, functionDomain, taskDetail, acceptanceGrade }) => {
    const { t } = useTranslation();
    const [cases, setCases] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [detail, setDetail] = useState<any | null>(null);
    const [video, setVideo] = useState<{ path: string; title: string } | null>(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        getTaskDetailCases(brandModel, functionDomain, taskDetail, systemVersion, acceptanceGrade)
            .then(res => {
                if (cancelled) return;
                // 只保留失败用例。
                setCases((res.data || []).filter(isFailed));
            })
            .catch((e: any) => { if (!cancelled) setError(t('at_failed_cases_load_failed')); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [brandModel, systemVersion, functionDomain, taskDetail, acceptanceGrade]);

    return (
        <div className="bg-surface/60 px-4 py-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-text-secondary">
                <XCircle className="w-4 h-4 text-rose-700" />
                {t('at_failed_cases_title')}
                {!loading && !error && (
                    <span className="text-xs font-normal text-text-muted">· {cases.length}</span>
                )}
            </div>

            {loading ? (
                <div className="text-sm text-text-muted py-2">{t('at_failed_cases_loading')}</div>
            ) : error ? (
                <div className="text-sm text-rose-700 py-2">{error}</div>
            ) : cases.length === 0 ? (
                <div className="text-sm text-text-muted py-2">{t('at_failed_cases_empty')}</div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {cases.map((c, i) => {
                        const score = c?.metadata?.response_quality_score;
                        return (
                            <div
                                key={c.id || i}
                                className="rounded-xl border border-ink/[0.08] bg-surface-raised p-3.5 hover:border-rose-500/40 transition-colors"
                            >
                                <div className="flex items-start justify-between gap-2 mb-2">
                                    <button
                                        onClick={() => setDetail(c)}
                                        className="text-left text-sm font-medium text-text-primary hover:text-secondary transition-colors truncate flex-1 min-w-0"
                                        title={caseName(c)}
                                    >
                                        {caseName(c)}
                                    </button>
                                    {/* 失败徽标 */}
                                    <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-700 border border-rose-500/30">
                                        <XCircle className="w-3 h-3" />
                                        {t('at_case_status_failed')}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between gap-2">
                                    {score != null && (
                                        <span className="text-xs text-text-muted tabular-nums">
                                            {t('col_score')}: <span className="font-bold text-rose-700">{score}</span> / 5
                                        </span>
                                    )}
                                    <button
                                        onClick={() => setDetail(c)}
                                        className="ml-auto inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary px-2 py-1 rounded-lg hover:bg-ink/[0.05] transition-colors"
                                    >
                                        <FileText className="w-3.5 h-3.5" />
                                        {t('case_detail')}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* 用例详情卡片弹窗（复用现成组件） */}
            {detail && (
                <ResultDetailModal
                    result={detail}
                    onClose={() => setDetail(null)}
                    onPlayVideo={(path, title) => { setDetail(null); setVideo({ path, title }); }}
                />
            )}

            {/* 视频播放弹窗 */}
            <VideoPlayerModal
                open={!!video}
                videoPath={video?.path ?? null}
                title={video?.title ?? null}
                onClose={() => setVideo(null)}
            />
        </div>
    );
};

export default FailedCasesPanel;
