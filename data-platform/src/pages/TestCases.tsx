import {useTrialAccess,TRIAL_DOMAIN,TRIAL_DOMAINS} from "../contexts/TrialContext";
import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { deleteResult, deleteResultsBatch, getAllResults, getFilterOptions, getBatches, AnalysisBatch } from '../api';
import { Loader2, Filter, Star, Info, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, LayoutGrid, List, GitBranch, Trash2, X, AlertTriangle, PlayCircle, Lock, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import clsx from 'clsx';
import { PlatformEmpty, PlatformSkeleton, PlatformAction } from '../components/platform/PlatformUI';
import TranslatedText from '../components/TranslatedText';
import VideoPlayerModal from '../components/VideoPlayerModal';
import ResultDetailModal from '../components/ResultDetailModal';
import FancySelect from '../components/FancySelect';
import TrialMoreHint from '../components/TrialMoreHint';
import { useAuth } from '../contexts/AuthContext';
import { useMetricsTranslation } from '../hooks/useMetricsTranslation';
import { getVideoPosterUrl } from '../config';
import { format } from 'date-fns';

interface TestCasesProps {
    /** 内嵌模式：去掉页面级 padding/标题，作为子面板嵌入其它页面 */
    embedded?: boolean;
    /** 锁定车型：固定筛选到该 brand_model，由外层版本选择器切换 */
    lockedModel?: string;
    lockedVersion?: string | null;
    /** 隐藏「按分析批次筛选」（标杆测评页要求隐藏） */
    hideBatchFilter?: boolean;
    modelVersionOptions?: Array<{value: string; label: string}>;
    selectedModelVersion?: string;
    onModelVersionChange?: (key: string) => void;
}

// 32 = 4 的倍数，让 xl 四列网格每排都填满（非末页无残排）。
const PAGE_SIZE = 32;

// 功能域 → 抽象封面配色（无真实截图时用，按域区分让卡片有辨识度、不空白）。
// 每个域一套渐变 + 主色 + 功能域标签，配合卡片上的播放按钮营造"视频"观感。
const DOMAIN_COVER: Record<string, { grad: string; icon: string }> = {
    '车控域': { grad: 'linear-gradient(135deg,#eff3e7 0%,#d9e3cb 100%)', icon: '车控' },
    '出行域': { grad: 'linear-gradient(135deg,#eff3e7 0%,#d9e3cb 100%)', icon: '出行' },
    '车书域': { grad: 'linear-gradient(135deg,#eff3e7 0%,#d9e3cb 100%)', icon: '车书' },
    '娱乐域': { grad: 'linear-gradient(135deg,#eff3e7 0%,#d9e3cb 100%)', icon: '娱乐' },
    '闲聊域': { grad: 'linear-gradient(135deg,#eff3e7 0%,#d9e3cb 100%)', icon: '闲聊' },
    '创作域': { grad: 'linear-gradient(135deg,#eff3e7 0%,#d9e3cb 100%)', icon: '创作' },
};
const DEFAULT_COVER = { grad: 'linear-gradient(135deg,#eff3e7 0%,#d9e3cb 100%)', icon: '评测' };
const coverFor = (domain?: string) => (domain && DOMAIN_COVER[domain]) || DEFAULT_COVER;

// 批次下拉标签：分析时间 + 重分析标注 + 条数
// 条数用 test_case_count（本页实际显示数：已排除 failed/invalid 与待审核），与列表 total 一致。
const fmtBatchLabel = (b: AnalysisBatch) => {
    let timeStr = b.created_at;
    try { timeStr = format(new Date(b.created_at), 'MM-dd HH:mm'); } catch { /* 保底原值 */ }
    const reAnalyzed = b.folder_path === 'mimo-reanalyze' ? '重分析 · ' : '';
    return `${reAnalyzed}${timeStr} · ${b.test_case_count}条`;
};

const TestCases: React.FC<TestCasesProps> = ({ embedded = false, lockedModel, lockedVersion, hideBatchFilter = false, modelVersionOptions, selectedModelVersion, onModelVersionChange }) => {
    const {trial,guardEvidence}=useTrialAccess();
    const { t } = useTranslation();
    const { tv, td } = useMetricsTranslation();
    const { user } = useAuth();
    // 删除入口只对 admin / analyst 开放；viewer 永远看不到 trash 按钮，避免误操作。
    const canDelete = user?.role === 'admin' || user?.role === 'analyst';
    // 批次筛选仅管理员可见可用；内嵌模式（标杆测评）强制隐藏
    const isAdmin = user?.role === 'admin';
    const showBatchFilter = isAdmin && !hideBatchFilter;

    const [results, setResults] = useState<any[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(0);
    const [loading, setLoading] = useState(true);
    const [dataError, setDataError] = useState(false);
    // 锁定车型时，固定到该车型，由外层选择器切换
    const [selectedModel, setSelectedModel] = useState<string>(lockedModel || 'all');
    const [selectedDomain, setSelectedDomain] = useState<string>(trial ? TRIAL_DOMAIN : 'all');
    const [selectedCase, setSelectedCase] = useState<string>('all');
    // "查同组"独立于 selectedCase（后者是模糊 search，前者精确匹配 case_id）。
    // 同时设置 brand_model + case_id 才是真正的"同车型同用例"，缺一不可。
    const [groupCaseId, setGroupCaseId] = useState<string>('');
    const [scoreMin, setScoreMin] = useState<string>('');
    const [scoreMax, setScoreMax] = useState<string>('');
    // 排序：默认按创建时间；可切换按用例 ID 升/降序。
    const [caseSort, setCaseSort] = useState<'default' | 'id_asc' | 'id_desc'>('default');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    // 分析批次筛选
    const [batches, setBatches] = useState<AnalysisBatch[]>([]);
    const [batchFilter, setBatchFilter] = useState<string>('');
    // 页码跳转输入框的临时值（受控），与实际 page 解耦，回车或失焦时才真正翻页。
    const [jumpInput, setJumpInput] = useState<string>('');

    const [selectedResult, setSelectedResult] = useState<any | null>(null);
    const [models, setModels] = useState<string[]>([]);
    const [domains, setDomains] = useState<string[]>([]);

    // 删除确认弹窗：单条删除时存对应 result，批量删除时存 ids 列表
    const [deleteConfirm, setDeleteConfirm] = useState<
        | { mode: 'single'; result: any }
        | { mode: 'batch'; ids: string[]; label: string }
        | null
    >(null);
    const [deleting, setDeleting] = useState(false);

    // 视频弹窗状态
    const [videoModal, setVideoModal] = useState<{ open: boolean; path: string; title: string }>({
        open: false, path: '', title: '',
    });
    const openVideo = (path: string, title: string) => setVideoModal({ open: true, path, title });
    const closeVideo = () => setVideoModal(v => ({ ...v, open: false }));

    useEffect(() => {
        getFilterOptions().then(opts => {
            setModels(opts.brand_models);
            setDomains(trial ? TRIAL_DOMAINS : opts.function_domains);
        }).catch(() => {});
        // 只保留本页有有效用例的批次（test_case_count>0），避免下拉里出现空批次。
        if (showBatchFilter) getBatches().then(bs => setBatches(bs.filter(b => b.test_case_count > 0))).catch(() => setBatches([]));
    }, [showBatchFilter]);

    // 外部切换锁定车型（标杆测评页顶部切车）→ 同步筛选
    useEffect(() => {
        if (lockedModel) {
            setSelectedModel(lockedModel);
            setSelectedDomain(trial ? TRIAL_DOMAIN : 'all');
            setSelectedCase('all');
            setGroupCaseId('');
        }
    }, [lockedModel]);

    const fetchData = useCallback(async (pageNum: number) => {
        setLoading(true);
        setDataError(false);
        try {
            const params: Record<string, any> = {
                offset: pageNum * PAGE_SIZE,
                limit: PAGE_SIZE,
                // 测试用例库只展示有效 case：后端默认已排除失败(failed)，这里再排除待审核(needs_review)。
                // 待审核记录改在「数据库」页展示并置顶，供人工确认。
                exclude_review: true,
            };
            if (selectedModel !== 'all') params.brand_model = selectedModel;
            if (lockedVersion) params.system_version = lockedVersion;
            if (selectedDomain !== 'all') params.function_domain = selectedDomain;
            if (selectedCase !== 'all') params.case_id_search = selectedCase;
            // 「查同组」状态下，case_id 走精确匹配（后端 vr.case_id = %s）。
            // 与 search（模糊 video_name）并存：用户可以再叠加搜索，灵活。
            if (groupCaseId) params.case_id = groupCaseId;
            if (scoreMin) params.min_score = parseFloat(scoreMin);
            if (scoreMax) params.max_score = parseFloat(scoreMax);
            if (batchFilter) params.task_id = batchFilter;
            if (caseSort !== 'default') {
                params.sort_by = 'case_id';
                params.sort_order = caseSort === 'id_asc' ? 'asc' : 'desc';
            }
            const res = await getAllResults(params);
            setResults(res.data);
            setTotal(res.total);
        } catch (error) {
            console.error("Failed to load results", error);
            setDataError(true);
        } finally {
            setLoading(false);
        }
    }, [lockedVersion, selectedModel, selectedDomain, selectedCase, groupCaseId, scoreMin, scoreMax, batchFilter, caseSort]);

    useEffect(() => {
        setPage(0);
        fetchData(0);
    }, [fetchData]);

    // 「查同组」入口：用 brand_model + case_id 双重过滤把同组视频聚到一页。
    // brand_model 缺失时只按 case_id 过滤；case_id 缺失时降级回普通模糊 search。
    const viewSameGroup = useCallback((result: any) => {
        const cid = String(result?.case_id || '').trim();
        const bm  = String(result?.brand_model || '').trim();
        if (!cid && !bm) {
            // 数据完全缺：用 video_name 兜底搜
            setSelectedCase(result?.video_name || 'all');
            setGroupCaseId('');
            return;
        }
        if (bm) setSelectedModel(bm);
        if (cid) {
            setGroupCaseId(cid);
            setSelectedCase('all');
        } else {
            // 没解析出 case_id 时回退到模糊搜 video_name
            setGroupCaseId('');
            setSelectedCase(result?.video_name || 'all');
        }
        setSelectedDomain(trial ? TRIAL_DOMAIN : 'all');
        setScoreMin('');
        setScoreMax('');
    }, []);

    // 清掉"同组"过滤，恢复默认列表
    const clearGroupFilter = useCallback(() => {
        setGroupCaseId('');
        // 不动 selectedModel：用户可能想保留按车型过滤
    }, []);

    const performDelete = useCallback(async () => {
        if (!deleteConfirm) return;
        setDeleting(true);
        try {
            if (deleteConfirm.mode === 'single') {
                await deleteResult(deleteConfirm.result.id);
            } else {
                await deleteResultsBatch(deleteConfirm.ids);
            }
            setDeleteConfirm(null);
            // 删完刷新；若当前页删空了，自动回退一页
            const remaining = results.length - (deleteConfirm.mode === 'single' ? 1 : deleteConfirm.ids.length);
            if (remaining <= 0 && page > 0) {
                setPage(page - 1);
                fetchData(page - 1);
            } else {
                fetchData(page);
            }
        } catch (e) {
            console.error('delete failed', e);
            alert(t('delete_failed'));
        } finally {
            setDeleting(false);
        }
    }, [deleteConfirm, results.length, page, fetchData, t]);

    const getTestCaseName = (name: string) => name.replace(/\.(mp4|mov|avi|mkv)$/i, '');

    const totalPages = Math.ceil(total / PAGE_SIZE);
    const filteredResults = results;

    // 统一的翻页入口：把目标页码夹紧到 [0, totalPages-1]，避免越界请求，再触发后端拉取。
    const goToPage = (p: number) => {
        const clamped = Math.max(0, Math.min(p, totalPages - 1));
        if (clamped === page) return;
        setPage(clamped);
        fetchData(clamped);
    };

    // 处理跳转输入框：解析用户输入（1-based）转成 0-based 页码，非法输入则忽略。
    const handleJump = () => {
        const n = parseInt(jumpInput, 10);
        if (!Number.isNaN(n)) goToPage(n - 1);
        setJumpInput('');
    };

    const modelOptions = [{ value: 'all', label: t('all_models') }, ...models.map(m => ({ value: m, label: tv(m) }))];
    const domainOptions = [{ value: 'all', label: t('all_domains') }, ...domains.map(d => ({ value: d, label: td(d) }))];
    const batchOptions = [{ value: '', label: t('batch_all') }, ...batches.map(b => ({ value: b.id, label: fmtBatchLabel(b) }))];

    return (
        <div className={clsx(
            'flex flex-col overflow-hidden relative',
            embedded ? 'h-full' : 'p-8 h-[100dvh] bg-surface',
        )}>
            {!embedded && (
                <header className="mb-8 shrink-0">
                    <h2 className="text-3xl font-bold text-text-primary">{t('test_case_library')}</h2>
                    <p className="text-text-muted mt-2">{t('description')}</p>
                </header>
            )}

            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-6 shrink-0 bg-surface-raised p-4 rounded-xl shadow-sm border border-ink/[0.08] items-center">
                <Filter className="w-5 h-5 text-text-muted" />
                {showBatchFilter && (
                <div className="flex items-center gap-2">
                    <span className="font-medium text-text-secondary text-sm">{t('batch_filter')}:</span>
                    <FancySelect
                        value={batchFilter}
                        options={batchOptions}
                        onChange={(v) => { setBatchFilter(v); setPage(0); }}
                        minWidth={180}
                    />
                </div>
                )}
                <div className="flex items-center gap-2">
                    <span className="font-medium text-text-secondary text-sm whitespace-nowrap">{t('filter_by_model')}:</span>
                    <FancySelect
                        value={modelVersionOptions ? selectedModelVersion || "" : selectedModel}
                        disabled={!!lockedModel && !modelVersionOptions}
                        options={modelVersionOptions || modelOptions}
                        onChange={(v) => {
                            if (modelVersionOptions) { onModelVersionChange?.(v); return; }
                            setSelectedModel(v);
                            setSelectedDomain(trial ? TRIAL_DOMAIN : 'all');
                            setSelectedCase('all');
                        }}
                        minWidth={140}
                    />
                </div>

                <div className="flex items-center gap-2">
                    <span className="font-medium text-text-secondary text-sm">Domain:</span>
                    <FancySelect
                        value={selectedDomain}
                        options={domainOptions}
                        onChange={(v) => {
                            if(!guardEvidence(v))return;
                            setSelectedDomain(v);
                            setSelectedCase('all');
                        }}
                        minWidth={140}
                    />
                </div>

                <div className="flex items-center gap-2">
                    <span className="font-medium text-text-secondary text-sm">{t('filter_by_case')}:</span>
                    <input
                        type="text"
                        inputMode="numeric"
                        value={selectedCase === 'all' ? '' : selectedCase}
                        onChange={e => setSelectedCase(e.target.value || 'all')}
                        placeholder={t('case_id_search_ph')}
                        className="border border-ink/[0.1] rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/60 bg-surface text-text-secondary w-40"
                    />
                    {/* 按用例 ID 排序 */}
                    <button
                        onClick={() => setCaseSort(s => s === 'id_asc' ? 'id_desc' : s === 'id_desc' ? 'default' : 'id_asc')}
                        title={t('sort_by_id')}
                        className={clsx(
                            'flex items-center gap-1 border rounded-lg px-2.5 py-2 text-sm transition-colors',
                            caseSort === 'default'
                                ? 'border-ink/[0.1] text-text-muted hover:text-text-primary hover:border-ink/[0.25]'
                                : 'border-primary/60 text-primary bg-primary/[0.1]',
                        )}
                    >
                        <span className="text-xs">ID</span>
                        {caseSort === 'id_asc' ? <ArrowUp className="w-3.5 h-3.5" />
                            : caseSort === 'id_desc' ? <ArrowDown className="w-3.5 h-3.5" />
                            : <ArrowUpDown className="w-3.5 h-3.5" />}
                    </button>
                </div>

                <div className="flex items-center gap-2">
                    <span className="font-medium text-text-secondary text-sm">{t('score')}:</span>
                    <input
                        type="number"
                        min="0"
                        max="5"
                        step="0.5"
                        value={scoreMin}
                        onChange={e => setScoreMin(e.target.value)}
                        placeholder="0"
                        className="border border-ink/[0.1] rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-surface text-text-secondary w-16 text-center"
                    />
                    <span className="text-text-muted text-sm">—</span>
                    <input
                        type="number"
                        min="0"
                        max="5"
                        step="0.5"
                        value={scoreMax}
                        onChange={e => setScoreMax(e.target.value)}
                        placeholder="5"
                        className="border border-ink/[0.1] rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-surface text-text-secondary w-16 text-center"
                    />
                </div>

                <span className="text-xs text-text-muted ml-auto">{total} {t('total')}</span>
                {!embedded && (
                <div className="flex items-center border border-ink/[0.1] rounded-lg overflow-hidden">
                    <button
                        onClick={() => setViewMode('grid')}
                        className={clsx('p-1.5 transition-colors', viewMode === 'grid' ? 'bg-ink/[0.1] text-text-primary' : 'text-text-muted hover:text-text-secondary')}
                        title="Grid"
                    >
                        <LayoutGrid className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setViewMode('list')}
                        className={clsx('p-1.5 transition-colors', viewMode === 'list' ? 'bg-ink/[0.1] text-text-primary' : 'text-text-muted hover:text-text-secondary')}
                        title="List"
                    >
                        <List className="w-4 h-4" />
                    </button>
                </div>
                )}
            </div>

            {/* 「查同组」过滤激活态：紫色高亮，提示用户当前只看到同车型同 case_id 的同组数据 */}
            {groupCaseId && (
                <div className="mb-4 -mt-2 px-3 py-2 rounded-lg border border-purple-500/40 bg-purple-100 text-purple-700 text-xs flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2">
                        <GitBranch className="w-3.5 h-3.5" />
                        <span>
                            {t('test_cases_group_filter_hint', {
                                model: selectedModel !== 'all' ? selectedModel : t('all_models'),
                                caseId: groupCaseId,
                            })}
                        </span>
                    </div>
                    <button
                        onClick={clearGroupFilter}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-purple-500/40 hover:bg-purple-100 transition-colors"
                    >
                        <X className="w-3 h-3" />
                        {t('test_cases_clear_group')}
                    </button>
                </div>
            )}

            {/* Content Grid */}
            <div className="flex-1 overflow-y-auto pr-2 pb-4">
                {loading ? (
                    <PlatformSkeleton/>
                ) : dataError ? <PlatformEmpty error title={t('request_failed_network')} action={<PlatformAction secondary onClick={()=>fetchData(page)}>{t('rg_refresh')}</PlatformAction>}/> : filteredResults.length === 0 ? (
                    <div className="text-center text-text-muted py-20 bg-surface-raised rounded-xl border border-ink/[0.08] border-dashed">
                        {t('no_results')}
                    </div>
                ) : (
                    <>
                    {embedded ? (
                    /* 内嵌（标杆测评）精简卡片：车型名 · 功能域 · 分数 · 是否成功 · 查同组 */
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {filteredResults.map(result => {
                            const cover = coverFor(result.function_domain);
                            // 体验账号的锁定占位卡：模糊 + 锁图标，不可点击、不出真实内容。
                            if ((result as any)._locked) {
                                return (
                                    <div
                                        key={result.id}
                                        className="relative bg-surface-raised rounded-2xl border border-ink/[0.08] overflow-hidden flex flex-col cursor-not-allowed select-none"
                                        title={t('trial_locked_video')}
                                    >
                                        {/* 模糊的封面区 */}
                                        <div className="relative aspect-video overflow-hidden blur-sm opacity-50" style={{ background: cover.grad }} aria-hidden>
                                            <span className="absolute -right-3 -bottom-4 text-[88px] opacity-[0.12] leading-none">{cover.icon}</span>
                                        </div>
                                        {/* 模糊的信息区骨架 */}
                                        <div className="p-4 flex flex-col gap-2.5 flex-1 blur-sm opacity-50" aria-hidden>
                                            <div className="h-4 w-2/3 rounded bg-ink/10" />
                                            <div className="h-3 w-full rounded bg-ink/[0.06]" />
                                            <div className="h-3 w-4/5 rounded bg-ink/[0.06]" />
                                            <div className="mt-auto h-7 w-full rounded-lg bg-ink/[0.04]" />
                                        </div>
                                        {/* 居中锁提示遮罩 */}
                                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                                            <div className="w-11 h-11 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
                                                <Lock className="w-5 h-5 text-amber-700" />
                                            </div>
                                            <span className="text-[11px] text-text-secondary px-3 text-center">{t('trial_locked_video')}</span>
                                        </div>
                                    </div>
                                );
                            }
                            const score = result.metadata?.response_quality_score;
                            const scoreNum = typeof score === 'number' ? score : parseFloat(score);
                            const hasScore = !Number.isNaN(scoreNum);
                            const tone = !hasScore ? 'muted' : scoreNum >= 4 ? 'good' : scoreNum >= 3 ? 'mid' : 'bad';
                            const success = result.metadata?.task_success;
                            const scoreHex = tone === 'good' ? '#36715a' : tone === 'mid' ? '#a17b35' : tone === 'bad' ? '#b34840' : '#6b7280';
                            return (
                                <div
                                    key={result.id}
                                    className="bg-surface-raised rounded-2xl border border-ink/[0.08] overflow-hidden hover:border-primary/40 hover:-translate-y-0.5 transition-all group cursor-pointer flex flex-col"
                                    onClick={() => setSelectedResult(result)}
                                >
                                    {/* 视频缩略区：视频首帧（懒加载，失败回退到按功能域配色的抽象封面）+ 播放按钮 + 角标 */}
                                    <div className="relative aspect-video overflow-hidden" style={{ background: cover.grad }}>
                                        {/* 装饰性功能域文字水印（首帧未出/失败时可见，作为兜底底纹） */}
                                        <span className="absolute -right-3 -bottom-4 text-[88px] opacity-[0.12] select-none pointer-events-none leading-none">
                                            {cover.icon}
                                        </span>
                                        {/* 视频首帧：懒加载，进视口才向后端请求（后端 ffmpeg 抽帧 + 缓存）。
                                            加载失败（非 mp4 / NAS 不可达）则隐藏，露出下层渐变兜底。 */}
                                        {getVideoPosterUrl(result.video_name) && (
                                            <img
                                                src={getVideoPosterUrl(result.video_name)}
                                                alt=""
                                                loading="lazy"
                                                decoding="async"
                                                className="absolute inset-0 w-full h-full object-cover"
                                                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                                            />
                                        )}
                                        {/* 播放按钮 */}
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <div className="w-14 h-14 rounded-full bg-ink/55 backdrop-blur-sm border border-white/25 flex items-center justify-center group-hover:scale-110 group-hover:bg-ink/70 transition-all">
                                                <PlayCircle className="w-8 h-8 text-white fill-white/10" />
                                            </div>
                                        </div>
                                        {/* 大号分数角标 */}
                                        <div className="absolute top-2.5 left-2.5 flex items-baseline gap-0.5 px-2.5 py-1 rounded-lg bg-white/90 backdrop-blur-sm">
                                            <span className="text-2xl font-extrabold leading-none" style={{ color: scoreHex }}>
                                                {hasScore ? scoreNum : '—'}
                                            </span>
                                            <span className="text-[10px] text-text-primary/60 font-medium">/5</span>
                                        </div>
                                        {/* 成功/失败角标 */}
                                        {success === true ? (
                                            <span className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-emerald-700/90 text-text-inverse">
                                                {t('task_success')}
                                            </span>
                                        ) : success === false ? (
                                            <span className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-rose-700/90 text-text-inverse">
                                                {t('task_failed')}
                                            </span>
                                        ) : null}
                                    </div>

                                    {/* 信息区 */}
                                    <div className="p-4 flex flex-col gap-2.5 flex-1">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <h3 className="font-semibold text-text-primary text-sm truncate" title={result.brand_model ? tv(result.brand_model) : result.video_name}>
                                                {result.brand_model ? tv(result.brand_model) : getTestCaseName(result.video_name)}
                                            </h3>
                                            {result.case_id && (
                                                <span className="shrink-0 px-1.5 py-0.5 rounded-md text-[11px] font-mono bg-primary/[0.12] text-primary border border-primary/20" title={`用例 ID: ${result.case_id}`}>
                                                    #{result.case_id}
                                                </span>
                                            )}
                                            {result.function_domain && (
                                                <span className="shrink-0 px-2 py-0.5 rounded-md text-[11px] bg-surface-overlay text-text-secondary border border-ink/[0.08]">
                                                    {td(result.function_domain)}
                                                </span>
                                            )}
                                        </div>
                                        {/* 用例问题预览 */}
                                        <p className="text-xs text-text-muted leading-relaxed line-clamp-2 min-h-[2rem]" title={result.metadata?.user_question}>
                                            <TranslatedText text={result.metadata?.user_question || 'N/A'} preTranslated={result.metadata?.user_question_en} />
                                        </p>
                                        {/* 查同组 */}
                                        <button
                                            onClick={(e) => { e.stopPropagation(); viewSameGroup(result); }}
                                            className="mt-auto w-full text-xs px-2 py-1.5 rounded-lg border border-ink/[0.08] text-text-secondary hover:bg-ink/[0.05] hover:text-text-primary inline-flex items-center justify-center gap-1 transition-colors"
                                            title={t('test_cases_view_group_hint')}
                                        >
                                            <GitBranch className="w-3.5 h-3.5" />
                                            {t('test_cases_view_group')}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    ) : viewMode === 'grid' ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                        {filteredResults.map(result => (
                            <div
                                key={result.id}
                                className="bg-surface-raised rounded-xl shadow-sm border border-ink/[0.08] overflow-hidden hover:shadow-md transition-shadow group cursor-pointer"
                                onClick={() => setSelectedResult(result)}
                            >
                                {/* Card Header */}
                                <div className="p-4 border-b border-ink/[0.08] bg-surface flex justify-between items-start">
                                    <div>
                                        <h3 className="font-semibold text-text-primary line-clamp-1" title={result.video_name}>
                                            {getTestCaseName(result.video_name)}
                                        </h3>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        {result.metadata?.task_success === true && (
                                            <span className="px-2 py-1 rounded text-[10px] font-medium bg-emerald-100 text-emerald-700 border border-emerald-200" title={result.metadata?.task_success_reason || ''}>
                                                {t('task_success')}
                                            </span>
                                        )}
                                        {result.metadata?.task_success === false && (
                                            <span className="px-2 py-1 rounded text-[10px] font-medium bg-rose-100 text-rose-700 border border-rose-200" title={result.metadata?.task_success_reason || ''}>
                                                {t('task_failed')}
                                            </span>
                                        )}
                                        {result.metadata?.needs_review && (
                                            <span className="px-2 py-1 rounded text-[10px] font-medium bg-orange-100 text-orange-700 border border-orange-200" title={result.metadata?.review_reason || ''}>
                                                {t('needs_review')}
                                            </span>
                                        )}
                                        <div className={clsx(
                                            "px-2 py-1 rounded text-xs font-bold flex items-center gap-1",
                                            (result.metadata?.response_quality_score || 0) >= 4 ? "bg-emerald-100 text-emerald-700" :
                                                (result.metadata?.response_quality_score || 0) >= 3 ? "bg-amber-100 text-amber-700" :
                                                    "bg-rose-100 text-rose-700"
                                        )}>
                                            <Star className="w-3 h-3 fill-current" />
                                            {result.metadata?.response_quality_score || 'N/A'}
                                        </div>
                                    </div>
                                </div>

                                {/* Card Body */}
                                <div className="p-4 space-y-4">
                                    {/* Screenshot if available */}
                                    {result.metadata?.screenshot_path && (
                                        <div className="relative aspect-video bg-surface-overlay rounded-lg overflow-hidden group-hover:ring-2 ring-blue-500/20 transition-all">
                                            <img
                                                src={result.metadata.screenshot_path}
                                                alt="Screenshot"
                                                className="w-full h-full object-cover"
                                            />
                                            <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors">
                                                <Info className="w-10 h-10 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                                            </div>
                                        </div>
                                    )}

                                    <div className="space-y-2">
                                        {/* Show User Question Preview instead of Summary */}
                                        <div className="text-xs font-semibold text-text-muted uppercase flex items-center gap-1">
                                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block"></span>
                                            User Question
                                        </div>
                                        <p className="text-sm text-text-secondary font-medium leading-relaxed line-clamp-3" title={result.metadata?.user_question}>
                                            <TranslatedText text={result.metadata?.user_question || 'N/A'} preTranslated={result.metadata?.user_question_en} />
                                        </p>
                                    </div>

                                    {/* Key Metrics */}
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                        <div className="bg-surface p-2 rounded border border-ink/[0.08]">
                                            <span className="text-text-muted block mb-0.5">{t('latency')}</span>
                                            <span className="font-mono font-medium text-text-secondary">
                                                {result.metadata?.latency_ms ? `${result.metadata.latency_ms}ms` : 'N/A'}
                                            </span>
                                        </div>
                                        <div className="bg-surface p-2 rounded border border-ink/[0.08]">
                                            <span className="text-text-muted block mb-0.5">{t('response')}</span>
                                            <span className="font-medium text-text-secondary truncate block" title={result.metadata?.system_response}>
                                                <TranslatedText text={result.metadata?.system_response || 'N/A'} preTranslated={result.metadata?.system_response_en} />
                                            </span>
                                        </div>
                                    </div>

                                    {/* Card 底部操作条：阻止冒泡，避免点按钮时把详情 Modal 也打开 */}
                                    <div className="flex items-center gap-1.5 pt-2 mt-1 border-t border-ink/[0.05]">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); viewSameGroup(result); }}
                                            className="flex-1 text-xs px-2 py-1.5 rounded border border-ink/[0.08] text-text-secondary hover:bg-ink/[0.05] hover:text-text-primary inline-flex items-center justify-center gap-1 transition-colors"
                                            title={t('test_cases_view_group_hint')}
                                        >
                                            <GitBranch className="w-3.5 h-3.5" />
                                            {t('test_cases_view_group')}
                                        </button>
                                        {canDelete && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setDeleteConfirm({ mode: 'single', result }); }}
                                                className="text-xs p-1.5 rounded border border-ink/[0.08] text-rose-700 hover:bg-rose-100 hover:border-rose-200 transition-colors"
                                                title={t('test_cases_delete')}
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                    ) : (
                    <div className="bg-surface-raised rounded-xl border border-ink/[0.08] shadow-sm overflow-hidden">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-ink/[0.08] bg-surface">
                                    <th className="px-4 py-2.5 text-left text-xs text-text-muted font-semibold w-12">#</th>
                                    <th className="px-4 py-2.5 text-left text-xs text-text-muted font-semibold">{t('case_name_col')}</th>
                                    <th className="px-4 py-2.5 text-left text-xs text-text-muted font-semibold">{t('domain_col')}</th>
                                    <th className="px-4 py-2.5 text-center text-xs text-text-muted font-semibold w-16">{t('score')}</th>
                                    <th className="px-4 py-2.5 text-center text-xs text-text-muted font-semibold w-20">{t('task_status_col')}</th>
                                    <th className="px-4 py-2.5 text-left text-xs text-text-muted font-semibold">{t('user_question_col')}</th>
                                    <th className="px-4 py-2.5 text-left text-xs text-text-muted font-semibold w-24">{t('time_col')}</th>
                                    <th className="px-4 py-2.5 text-right text-xs text-text-muted font-semibold w-32">{t('admin_users_col_actions')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredResults.map((result, idx) => {
                                    const score = result.metadata?.response_quality_score || 0;
                                    return (
                                        <tr
                                            key={result.id}
                                            onClick={() => setSelectedResult(result)}
                                            className="border-b border-ink/[0.04] hover:bg-ink/[0.03] cursor-pointer transition-colors"
                                        >
                                            <td className="px-4 py-2.5 text-text-muted text-xs">{page * PAGE_SIZE + idx + 1}</td>
                                            <td className="px-4 py-2.5 text-text-secondary text-xs font-medium max-w-[200px]">
                                                <span className="truncate block" title={result.video_name}>
                                                    {getTestCaseName(result.video_name)}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2.5 text-text-muted text-xs">
                                                {result.function_domain ? td(result.function_domain) : '-'}
                                            </td>
                                            <td className="px-4 py-2.5 text-center">
                                                <span className={clsx(
                                                    'px-2 py-0.5 rounded text-xs font-bold',
                                                    score >= 4 ? 'bg-emerald-100 text-emerald-700' :
                                                    score >= 3 ? 'bg-amber-100 text-amber-700' :
                                                    'bg-rose-100 text-rose-700'
                                                )}>
                                                    {score || 'N/A'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2.5 text-center">
                                                {result.metadata?.task_success === true ? (
                                                    <span className="inline-block px-2 py-0.5 rounded text-[10px] bg-emerald-100 text-emerald-700 border border-emerald-200" title={result.metadata?.task_success_reason || ''}>
                                                        {t('task_success')}
                                                    </span>
                                                ) : result.metadata?.task_success === false ? (
                                                    <span className="inline-block px-2 py-0.5 rounded text-[10px] bg-rose-100 text-rose-700 border border-rose-200" title={result.metadata?.task_success_reason || ''}>
                                                        {t('task_failed')}
                                                    </span>
                                                ) : (
                                                    <span className="text-text-muted italic text-xs">-</span>
                                                )}
                                                {result.metadata?.needs_review && (
                                                    <span className="inline-block ml-1 px-2 py-0.5 rounded text-[10px] bg-orange-100 text-orange-700 border border-orange-200" title={result.metadata?.review_reason || ''}>
                                                        {t('needs_review')}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-2.5 text-text-muted text-xs max-w-[350px]">
                                                <span className="truncate block" title={result.metadata?.user_question}>
                                                    {result.metadata?.user_question || '-'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2.5 text-text-muted text-xs">
                                                {result.created_at ? new Date(result.created_at).toLocaleDateString() : '-'}
                                            </td>
                                            <td className="px-4 py-2.5 text-right">
                                                <div className="inline-flex items-center gap-1">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); viewSameGroup(result); }}
                                                        className="p-1.5 rounded text-text-muted hover:bg-ink/[0.08] hover:text-text-primary transition-colors"
                                                        title={t('test_cases_view_group_hint')}
                                                    >
                                                        <GitBranch className="w-3.5 h-3.5" />
                                                    </button>
                                                    {canDelete && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); setDeleteConfirm({ mode: 'single', result }); }}
                                                            className="p-1.5 rounded text-rose-700 hover:bg-rose-100 transition-colors"
                                                            title={t('test_cases_delete')}
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    )}
                    </>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-2 mt-6 mb-2 flex-wrap">
                        <button
                            onClick={() => goToPage(0)}
                            disabled={page === 0}
                            className="flex items-center gap-1 px-3 py-2 rounded-lg border border-ink/[0.1] text-sm hover:bg-ink/[0.05] disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            <ChevronsLeft className="w-4 h-4" /> {t('first_page')}
                        </button>
                        <button
                            onClick={() => goToPage(page - 1)}
                            disabled={page === 0}
                            className="flex items-center gap-1 px-3 py-2 rounded-lg border border-ink/[0.1] text-sm hover:bg-ink/[0.05] disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            <ChevronLeft className="w-4 h-4" /> {t('prev_page')}
                        </button>
                        <span className="text-sm text-text-secondary font-mono px-1">
                            {page + 1} / {totalPages}
                        </span>
                        <button
                            onClick={() => goToPage(page + 1)}
                            disabled={page + 1 >= totalPages}
                            className="flex items-center gap-1 px-3 py-2 rounded-lg border border-ink/[0.1] text-sm hover:bg-ink/[0.05] disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            {t('next_page')} <ChevronRight className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => goToPage(totalPages - 1)}
                            disabled={page + 1 >= totalPages}
                            className="flex items-center gap-1 px-3 py-2 rounded-lg border border-ink/[0.1] text-sm hover:bg-ink/[0.05] disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            {t('last_page')} <ChevronsRight className="w-4 h-4" />
                        </button>
                        <div className="flex items-center gap-1.5 ml-2 text-sm text-text-secondary">
                            <span>{t('jump_to_page')}</span>
                            <input
                                type="number"
                                min={1}
                                max={totalPages}
                                value={jumpInput}
                                onChange={(e) => setJumpInput(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleJump(); }}
                                placeholder={`${page + 1}`}
                                className="w-16 px-2 py-2 rounded-lg border border-ink/[0.1] bg-transparent text-center text-sm focus:outline-none focus:border-ink/[0.3] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            <span>{t('page_unit')}</span>
                            <button
                                onClick={handleJump}
                                className="px-3 py-2 rounded-lg border border-ink/[0.1] text-sm hover:bg-ink/[0.05]"
                            >
                                {t('go')}
                            </button>
                        </div>
                    </div>
                )}

                {/* 体验账号：列表只含白名单车型的用例，提示还有更多 */}
                <TrialMoreHint />
            </div>

            {/* Detail Modal */}
            {selectedResult && (
                <ResultDetailModal
                    result={selectedResult}
                    onClose={() => setSelectedResult(null)}
                    onPlayVideo={(path, title) => {
                        setSelectedResult(null);
                        openVideo(path, title);
                    }}
                    /* 标杆平台内嵌(测试视频tab)才允许体验账号看白名单用例 */
                    allowTrial={embedded}
                />
            )}

            {/* 视频弹窗 */}
            <VideoPlayerModal
                open={videoModal.open}
                videoPath={videoModal.path}
                title={videoModal.title}
                onClose={closeVideo}
                allowTrial={embedded}
            />

            {/* 删除确认弹窗：原生 window.confirm 无法多语言 + 视觉一致，自己撸一个 */}
            {deleteConfirm && (
                <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
                     onClick={() => !deleting && setDeleteConfirm(null)}
                >
                    <div
                        className="bg-surface-raised rounded-xl shadow-2xl shadow-ink/40 border border-ink/[0.08] w-full max-w-md"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="px-5 py-3.5 border-b border-ink/[0.08] flex items-center justify-between">
                            <h2 className="text-base font-semibold text-text-primary inline-flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 text-rose-700" />
                                {t('test_cases_delete_title')}
                            </h2>
                            <button
                                onClick={() => !deleting && setDeleteConfirm(null)}
                                className="p-1 rounded hover:bg-ink/[0.05] text-text-muted"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="p-5 space-y-3">
                            <p className="text-sm text-text-secondary">
                                {deleteConfirm.mode === 'single'
                                    ? t('test_cases_delete_confirm_single', { name: getTestCaseName(deleteConfirm.result.video_name) })
                                    : t('test_cases_delete_confirm_batch', { count: deleteConfirm.ids.length })}
                            </p>
                            <p className="text-xs text-rose-700/80 bg-rose-100 border border-rose-200 rounded-lg px-3 py-2">
                                {t('test_cases_delete_warn')}
                            </p>
                            <div className="flex justify-end gap-2 pt-1">
                                <button
                                    onClick={() => setDeleteConfirm(null)}
                                    disabled={deleting}
                                    className="px-4 py-2 text-sm border border-ink/[0.1] rounded-lg text-text-secondary hover:bg-ink/[0.05] disabled:opacity-60"
                                >
                                    {t('cancel')}
                                </button>
                                <button
                                    onClick={performDelete}
                                    disabled={deleting}
                                    className="px-4 py-2 text-sm bg-rose-600 hover:bg-rose-700 text-text-inverse rounded-lg inline-flex items-center gap-1.5 disabled:opacity-60"
                                >
                                    {deleting
                                        ? <Loader2 className="w-4 h-4 animate-spin" />
                                        : <Trash2 className="w-4 h-4" />}
                                    {t('test_cases_delete_confirm')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TestCases;
