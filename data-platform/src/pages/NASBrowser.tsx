import LightSelect from '../components/LightSelect';
import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    browseNas, getNasStatus, analyzeNasVideos, getASRModels,
    NasItem, NasBrowseResponse, searchNas,
    mimoAnalyze, MimoVideoItem,
} from '../api';
import { useLanguage } from '../contexts/LanguageContext';
import { useTranslation } from 'react-i18next';
import { useSignedVideoUrl } from '../hooks/useSignedVideoUrl';
import {
    Loader2, FolderOpen, Film, ArrowLeft, Search, CheckSquare, Square,
    Play, HardDrive, ChevronRight, RefreshCw, Wifi, WifiOff, X,
    FileVideo, ArrowUpDown, Zap, AlertTriangle,
} from 'lucide-react';
import clsx from 'clsx';

// 弹窗内部用的小组件：把 NAS path 签名后塞进 <video src>
const NasVideoPreview: React.FC<{ path: string }> = ({ path }) => {
    const { t } = useTranslation();
    const { url, loading, error } = useSignedVideoUrl(path, 'nas');
    if (loading) {
        return (
            <div className="w-full aspect-video bg-surface-overlay rounded-xl flex items-center justify-center text-text-primary/70 text-sm gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                {t('generating_link')}
            </div>
        );
    }
    if (error) {
        return (
            <div className="w-full aspect-video bg-surface-overlay rounded-xl flex items-center justify-center text-red-700 text-sm">
                {t('link_failed', { error })}
            </div>
        );
    }
    return (
        <video
            src={url ?? undefined}
            controls
            autoPlay
            className="w-full rounded-xl shadow-2xl shadow-ink/40"
        />
    );
};

const formatSize = (bytes: number | null) => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

const NASBrowser = () => {
    const { t } = useLanguage();
    const navigate = useNavigate();

    const [nasAvailable, setNasAvailable] = useState<boolean | null>(null);
    const [nasMessage, setNasMessage] = useState('');
    const [currentPath, setCurrentPath] = useState<string>('');
    const [parentPath, setParentPath] = useState<string | null>(null);
    const [items, setItems] = useState<NasItem[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
    const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
    const [previewVideo, setPreviewVideo] = useState<string | null>(null);
    const [typeFilter, setTypeFilter] = useState<string>('');
    const [sortBy, setSortBy] = useState<string>('name');
    const [sortOrder, setSortOrder] = useState<string>('asc');
    const [searchKeyword, setSearchKeyword] = useState('');
    const [searchResults, setSearchResults] = useState<NasItem[] | null>(null);
    const [searching, setSearching] = useState(false);
    const [page, setPage] = useState(0);
    const pageSize = 500;

    const [analyzing, setAnalyzing] = useState(false);
    const [asrModels, setAsrModels] = useState<Array<{ value: string; label: string; description: string }>>([]);
    const [selectedAsr, setSelectedAsr] = useState('whisper');

    // MiMo 相关状态
    const [filterLarge, setFilterLarge] = useState(false);     // ≥300MB 筛选
    const [showMimoModal, setShowMimoModal] = useState(false);
    const [mimoSubmitting, setMimoSubmitting] = useState(false);

    useEffect(() => {
        const checkStatus = async () => {
            try {
                const status = await getNasStatus();
                setNasAvailable(status.available);
                setNasMessage(status.message || '');
            } catch {
                setNasAvailable(false);
                setNasMessage('Failed to connect to backend');
            }
        };
        checkStatus();
        getASRModels().then(res => {
            setAsrModels(res.models);
            setSelectedAsr(res.default);
        }).catch(() => { });
    }, []);

    const browse = useCallback(async (path?: string, offset: number = 0) => {
        setLoading(true);
        setSearchResults(null);
        try {
            const params: Record<string, any> = { sort: sortBy, order: sortOrder, offset };
            if (path !== undefined) params.path = path;
            if (typeFilter) params.type = typeFilter;
            const data: NasBrowseResponse = await browseNas(params);
            setCurrentPath(data.current_path);
            setParentPath(data.parent_path || null);
            setItems(data.items);
            setTotal(data.total);
        } catch (e: any) {
            console.error('NAS browse error', e);
        } finally {
            setLoading(false);
        }
    }, [sortBy, sortOrder, typeFilter]);

    useEffect(() => {
        if (nasAvailable) browse();
    }, [nasAvailable, browse]);

    const handleNavigate = (path: string) => {
        setSelectedPaths(new Set());
        setLastSelectedIndex(null);
        setPage(0);
        browse(path, 0);
    };

    const handleBack = () => {
        if (parentPath) handleNavigate(parentPath);
    };

    const handleSearch = async () => {
        if (!searchKeyword.trim()) { setSearchResults(null); return; }
        setSearching(true);
        try {
            const data = await searchNas({ keyword: searchKeyword, path: currentPath, depth: 5, limit: 200 });
            setSearchResults(data.results || data.items || []);
        } catch (e) {
            console.error('NAS search error', e);
        } finally {
            setSearching(false);
        }
    };

    const videoItems = ((searchResults || items).filter(i => i.is_video))
        .filter(v => !filterLarge || (v.size || 0) >= 300 * 1024 * 1024);

    // Shift 范围多选：记录上次点击的行索引作为锚点。按住 Shift 点击时，
    // 选中/取消 锚点到当前行之间的所有视频（含两端），选中态跟随当前行的目标态。
    const toggleSelect = (path: string, index: number, shiftKey: boolean) => {
        const next = new Set(selectedPaths);
        if (shiftKey && lastSelectedIndex !== null && lastSelectedIndex !== index) {
            const [start, end] = index < lastSelectedIndex
                ? [index, lastSelectedIndex]
                : [lastSelectedIndex, index];
            // 目标态：以当前点击行「点击前是否已选」决定整段是选还是取消
            const shouldSelect = !selectedPaths.has(path);
            for (let i = start; i <= end; i++) {
                const p = videoItems[i]?.path;
                if (!p) continue;
                if (shouldSelect) next.add(p); else next.delete(p);
            }
        } else {
            if (next.has(path)) next.delete(path); else next.add(path);
        }
        setSelectedPaths(next);
        setLastSelectedIndex(index);
    };
    const dirItems = searchResults ? [] : items.filter(i => i.is_dir);

    const selectAllVideos = () => {
        if (selectedPaths.size === videoItems.length && videoItems.length > 0) {
            setSelectedPaths(new Set());
        } else {
            setSelectedPaths(new Set(videoItems.map(v => v.path)));
        }
        setLastSelectedIndex(null);
    };

    const handleAnalyze = async () => {
        if (selectedPaths.size === 0) return;
        setAnalyzing(true);
        try {
            const res = await analyzeNasVideos(Array.from(selectedPaths), selectedAsr);
            navigate(`/results/${res.task_id}`);
        } catch (e: any) {
            console.error('NAS analyze error', e);
            alert('Failed to start NAS analysis: ' + (e?.response?.data?.detail || e.message));
        } finally {
            setAnalyzing(false);
        }
    };

    const pathParts = currentPath.split('/').filter(Boolean);

    if (nasAvailable === null) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
        );
    }

    if (!nasAvailable) {
        return (
            <div className="p-8 flex flex-col items-center justify-center h-full gap-4">
                <WifiOff className="w-16 h-16 text-text-muted" />
                <h2 className="text-2xl font-bold text-text-secondary">{t('nas_unavailable')}</h2>
                <p className="text-text-muted max-w-md text-center">{nasMessage || t('nas_unavailable_desc')}</p>
                <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-ink text-text-inverse rounded-lg hover:bg-ink/85 flex items-center gap-2">
                    <RefreshCw className="w-4 h-4" /> {t('retry')}
                </button>
            </div>
        );
    }

    return (
        <div className="p-8 h-[100dvh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex justify-between items-start mb-6 shrink-0">
                <div>
                    <h2 className="text-3xl font-bold text-text-primary flex items-center gap-3">
                        <HardDrive className="w-8 h-8 text-blue-600" />
                        {t('nas_browser')}
                    </h2>
                    <p className="text-text-muted mt-1">{t('nas_browser_desc')}</p>
                </div>
                <div className="flex items-center gap-2">
                    <Wifi className="w-4 h-4 text-emerald-500" />
                    <span className="text-xs text-emerald-600 font-medium">{t('nas_connected')}</span>
                </div>
            </div>

            {/* Breadcrumb + Controls */}
            <div className="flex items-center gap-3 mb-4 shrink-0 flex-wrap">
                <button
                    onClick={handleBack}
                    disabled={!parentPath}
                    className="p-2 rounded-lg hover:bg-ink/[0.05]/[0.05] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="flex items-center gap-1 text-sm text-text-secondary bg-surface-raised px-3 py-2 rounded-lg border border-ink/[0.08] flex-1 min-w-0 overflow-x-auto">
                    <button onClick={() => handleNavigate('')} className="hover:text-blue-600 font-medium shrink-0">NAS</button>
                    {pathParts.map((part, i) => (
                        <React.Fragment key={i}>
                            <ChevronRight className="w-3 h-3 text-text-muted shrink-0" />
                            <button
                                onClick={() => handleNavigate('/' + pathParts.slice(0, i + 1).join('/'))}
                                className="hover:text-blue-600 truncate max-w-[200px]"
                                title={part}
                            >
                                {part}
                            </button>
                        </React.Fragment>
                    ))}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <LightSelect value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="text-sm border border-ink/[0.1] rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="">{t('all_files')}</option>
                        <option value="video">{t('videos_only')}</option>
                        <option value="dir">{t('folders_only')}</option>
                    </LightSelect>
                    <button onClick={() => setSortOrder(o => o === 'asc' ? 'desc' : 'asc')} className="p-2 rounded-lg hover:bg-ink/[0.05]/[0.05] transition-colors" title="Toggle sort order">
                        <ArrowUpDown className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Search Bar */}
            <div className="flex items-center gap-2 mb-4 shrink-0">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted w-4 h-4" />
                    <input
                        type="text"
                        value={searchKeyword}
                        onChange={e => setSearchKeyword(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSearch()}
                        placeholder={t('nas_search_placeholder')}
                        className="w-full pl-10 pr-4 py-2 border border-ink/[0.1] rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                    {searchResults && (
                        <button onClick={() => { setSearchResults(null); setSearchKeyword(''); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary">
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>
                <button onClick={handleSearch} disabled={searching} className="px-4 py-2 bg-ink text-text-inverse rounded-lg text-sm font-medium hover:bg-ink/85 disabled:opacity-50 flex items-center gap-2">
                    {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    {t('search')}
                </button>
            </div>

            {/* Analysis Controls */}
            {videoItems.length > 0 && (
                <div className="flex items-center justify-between bg-surface-raised p-3 rounded-xl border border-ink/[0.08] shadow-sm mb-4 shrink-0">
                    <div className="flex items-center gap-4">
                        <button onClick={selectAllVideos} className="flex items-center gap-2 text-sm font-medium text-text-secondary hover:text-blue-600">
                            {selectedPaths.size === videoItems.length && videoItems.length > 0
                                ? <CheckSquare className="w-5 h-5 text-blue-600" />
                                : <Square className="w-5 h-5" />
                            }
                            {selectedPaths.size > 0 ? `${selectedPaths.size} ${t('selected')}` : t('select_all')}
                        </button>
                        <span className="text-xs text-text-muted">{videoItems.length} {t('videos_in_dir')}</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <label className="flex items-center gap-1.5 text-xs text-text-muted cursor-pointer">
                            <input type="checkbox" checked={filterLarge}
                                onChange={e => setFilterLarge(e.target.checked)} />
                            {t('mimo_filter_large')}
                        </label>
                        <LightSelect value={selectedAsr} onChange={e => setSelectedAsr(e.target.value)} className="text-sm border border-ink/[0.1] rounded-lg px-3 py-1.5 outline-none">
                            {asrModels.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </LightSelect>
                        <button
                            onClick={handleAnalyze}
                            disabled={selectedPaths.size === 0 || analyzing}
                            className="px-5 py-2 bg-ink text-text-inverse font-medium rounded-lg hover:bg-ink/85 disabled:opacity-50 flex items-center gap-2 text-sm"
                        >
                            {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                            {analyzing ? t('analyzing') : t('start_analysis')} {selectedPaths.size > 0 && `(${selectedPaths.size})`}
                        </button>
                        <button
                            onClick={() => {
                                if (selectedPaths.size === 0) return;
                                setShowMimoModal(true);
                            }}
                            disabled={selectedPaths.size === 0 || mimoSubmitting}
                            className="px-5 py-2 bg-purple-600 text-text-primary font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2 text-sm"
                        >
                            {mimoSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                            {t('mimo_analyze')} {selectedPaths.size > 0 && `(${selectedPaths.size})`}
                        </button>
                    </div>
                </div>
            )}

            {/* File List */}
            <div className="bg-surface-raised rounded-xl shadow-sm border border-ink/[0.08] flex-1 overflow-hidden flex flex-col">
                <div className="overflow-auto flex-1">
                    {loading ? (
                        <div className="flex items-center justify-center h-64">
                            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                        </div>
                    ) : (
                        <table className="w-full text-left text-sm">
                            <thead className="bg-surface text-text-muted font-medium sticky top-0 z-10">
                                <tr>
                                    <th className="px-4 py-3 w-10"></th>
                                    <th className="px-4 py-3">{t('file_name')}</th>
                                    <th className="px-4 py-3 w-28">{t('size')}</th>
                                    <th className="px-4 py-3 w-20 text-right">{t('actions')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-ink/[0.08]">
                                {dirItems.map(item => (
                                    <tr key={item.path} className="hover:bg-ink/[0.05]/[0.05] cursor-pointer transition-colors" onClick={() => handleNavigate(item.path)}>
                                        <td className="px-4 py-3"><FolderOpen className="w-5 h-5 text-amber-500" /></td>
                                        <td className="px-4 py-3 font-medium text-text-primary">{item.name}</td>
                                        <td className="px-4 py-3 text-text-muted">-</td>
                                        <td className="px-4 py-3 text-right">
                                            <ChevronRight className="w-4 h-4 text-text-muted inline" />
                                        </td>
                                    </tr>
                                ))}
                                {videoItems.map((item, index) => (
                                    <tr
                                        key={item.path}
                                        className={clsx("hover:bg-ink/[0.05]/[0.05] transition-colors group cursor-pointer select-none", selectedPaths.has(item.path) && "bg-blue-100/40")}
                                        onClick={(e) => {
                                            // 整行可点选；Shift 范围多选。避免文本选中干扰体验（select-none）。
                                            if ((e.target as HTMLElement).closest('button')) return; // 预览按钮等自行处理
                                            toggleSelect(item.path, index, e.shiftKey);
                                        }}
                                    >
                                        <td className="px-4 py-3">
                                            <button onClick={(e) => { e.stopPropagation(); toggleSelect(item.path, index, e.shiftKey); }}>
                                                {selectedPaths.has(item.path)
                                                    ? <CheckSquare className="w-5 h-5 text-blue-600" />
                                                    : <Square className="w-5 h-5 text-text-muted" />
                                                }
                                            </button>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <FileVideo className="w-4 h-4 text-blue-500 shrink-0" />
                                                <span className="font-medium text-text-primary truncate">{item.name}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-text-muted font-mono text-xs">{formatSize(item.size)}</td>
                                        <td className="px-4 py-3 text-right">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setPreviewVideo(item.path); }}
                                                className="p-1.5 hover:bg-blue-100 text-text-muted hover:text-blue-600 rounded opacity-0 group-hover:opacity-100 transition-all"
                                                title={t('preview')}
                                            >
                                                <Play className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {!loading && dirItems.length === 0 && videoItems.length === 0 && (
                                    <tr><td colSpan={4} className="text-center py-16 text-text-muted">{t('no_results')}</td></tr>
                                )}
                            </tbody>
                        </table>
                    )}
                </div>
                <div className="p-3 border-t border-ink/[0.08] bg-surface text-xs text-text-muted flex justify-between items-center">
                    <span>{searchResults ? `${t('search_results')}: ${searchResults.length}` : `${t('total')}: ${total}`}</span>
                    {!searchResults && total > pageSize && (
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => { const p = page - 1; setPage(p); browse(currentPath, p * pageSize); }}
                                disabled={page === 0}
                                className="px-2 py-1 rounded border border-ink/[0.1] hover:bg-ink/[0.05] disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                ←
                            </button>
                            <span className="font-mono text-text-secondary">
                                {page * pageSize + 1}-{Math.min((page + 1) * pageSize, total)} / {total}
                            </span>
                            <button
                                onClick={() => { const p = page + 1; setPage(p); browse(currentPath, p * pageSize); }}
                                disabled={(page + 1) * pageSize >= total}
                                className="px-2 py-1 rounded border border-ink/[0.1] hover:bg-ink/[0.05] disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                →
                            </button>
                        </div>
                    )}
                    <span className="font-mono text-text-muted">{currentPath}</span>
                </div>
            </div>

            {/* Video Preview Modal */}
            {previewVideo && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setPreviewVideo(null)}>
                    <div className="relative w-full max-w-4xl mx-4" onClick={e => e.stopPropagation()}>
                        <button onClick={() => setPreviewVideo(null)} className="absolute -top-12 right-0 text-white/70 hover:text-white transition-colors">
                            <X className="w-8 h-8" />
                        </button>
                        <NasVideoPreview path={previewVideo} />
                        <div className="mt-3 text-center text-text-primary/60 text-sm font-mono truncate">{previewVideo.split('/').pop()}</div>
                    </div>
                </div>
            )}

            {/* MiMo 分析弹窗 */}
            {showMimoModal && (
                <MimoAnalyzeModal
                    videos={videoItems.filter(v => selectedPaths.has(v.path))}
                    onClose={() => setShowMimoModal(false)}
                    onSubmitting={setMimoSubmitting}
                />
            )}
        </div>
    );
};

// ──────────────────────────────────────────────────────────────────────
// MiMo 分析弹窗
// ──────────────────────────────────────────────────────────────────────
const MIMO_MAX_SIZE = 300 * 1024 * 1024; // 300MB

const MimoAnalyzeModal: React.FC<{
    videos: NasItem[];
    onClose: () => void;
    onSubmitting: (v: boolean) => void;
}> = ({ videos, onClose, onSubmitting }) => {
    const { t } = useLanguage();
    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState<string | null>(null);

    const oversized = videos.filter(v => (v.size || 0) >= MIMO_MAX_SIZE);

    // 统一压缩：超大视频恒定压缩后分析，绝不静默跳过（前端 300MB 门槛远高于后端
    // 35MB 真实阈值，若传 false 会导致 35MB+ 视频被后端标 skipped/oversized）。
    const submit = async () => {
        setSubmitting(true);
        onSubmitting(true);
        try {
            const list: MimoVideoItem[] = videos.map(v => ({
                path: v.path,
                name: v.name,
                size: v.size || 0,
            }));
            if (list.length === 0) {
                setResult(t('mimo_no_videos'));
                return;
            }
            const resp = await mimoAnalyze({ videos: list, compress_oversized: true });
            const compNote = resp.compress_needed > 0
                ? t('mimo_compress_note', { count: resp.compress_needed })
                : '';
            setResult(t('mimo_submitted_detail', {
                taskId: resp.task_id.slice(0, 8),
                total: resp.total_videos,
                compress: compNote,
            }));
        } catch (e: any) {
            setResult(`Error: ${e?.response?.data?.detail || e?.message || 'unknown'}`);
        } finally {
            setSubmitting(false);
            onSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
            <div className="bg-surface border border-border/60 rounded-xl max-w-lg w-full mx-4 p-5"
                onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-text-primary font-semibold flex items-center gap-2">
                        <Zap className="w-5 h-5 text-purple-700" />
                        {t('mimo_oversized_title')}
                    </h3>
                    <button onClick={onClose} className="text-text-muted hover:text-text-primary">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {result ? (
                    <div className="text-center py-6">
                        <p className="text-text-secondary text-sm">{result}</p>
                        <button onClick={onClose}
                            className="mt-4 px-4 py-1.5 rounded bg-primary text-text-inverse text-sm">
                            OK
                        </button>
                    </div>
                ) : (
                    <>
                        {oversized.length > 0 ? (
                            <>
                                <p className="text-text-secondary text-sm mb-3">
                                    {t('mimo_oversized_desc', { total: videos.length, count: oversized.length })}
                                </p>
                                <div className="max-h-40 overflow-y-auto mb-3 space-y-1">
                                    {oversized.map(v => (
                                        <div key={v.path} className="flex items-center gap-2 text-xs text-amber-700/90 px-2 py-1 bg-amber-100 rounded border border-amber-200">
                                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                            <span className="truncate flex-1">{v.name}</span>
                                            <span className="shrink-0 text-text-muted">({((v.size || 0) / 1024 / 1024).toFixed(0)}MB)</span>
                                        </div>
                                    ))}
                                </div>
                                <p className="text-text-muted text-xs mb-4">{t('mimo_oversized_hint')}</p>
                                <button onClick={() => submit()} disabled={submitting}
                                    className="w-full px-4 py-2.5 rounded-lg bg-purple-600 text-text-primary font-medium text-sm hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2">
                                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                                    {t('mimo_compress_all')} ({videos.length})
                                </button>
                            </>
                        ) : (
                            <>
                                <p className="text-text-secondary text-sm mb-4">
                                    {t('mimo_oversized_desc', { total: videos.length, count: 0 })}
                                    {' '}All videos are within the 300MB limit.
                                </p>
                                <button onClick={() => submit()} disabled={submitting}
                                    className="w-full px-4 py-2.5 rounded-lg bg-purple-600 text-text-primary font-medium text-sm hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2">
                                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                                    {t('mimo_analyze')} ({videos.length})
                                </button>
                            </>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default NASBrowser;
