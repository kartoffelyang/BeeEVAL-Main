import LightSelect from '../components/LightSelect';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Database, Upload, CheckCircle, AlertCircle, Loader2, Trash2, RefreshCw, Filter, ChevronDown, ChevronUp, Search, Eye, X, AlertTriangle, ChevronLeft, ChevronRight, Square, CheckSquare } from 'lucide-react';
import { getTasks, vectorizeEvaluations, getVectorStats, deleteVideoVectors, listVectors, getVectorFacets, deleteVectorsBatch, clearVectors, updateVector, VectorPoint, getVectorCollections, VectorCollection } from '../api';
import { useLanguage } from '../contexts/LanguageContext';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import TranslatedText from '../components/TranslatedText';
import { useMetricsTranslation } from '../hooks/useMetricsTranslation';

interface Task {
    id: string;
    folder_path: string;
    status: string;
    total_videos: number;
    completed_videos: number;
    created_at: string;
}

interface VectorStats {
    total_vectors: number;
    dimension: number;
    collection_name: string;
}

type SortField = 'created_at' | 'total_videos' | 'completion_rate';
type SortOrder = 'asc' | 'desc';
type StatusFilter = 'all' | 'completed' | 'processing' | 'pending';

interface FilterOptions {
    status: StatusFilter;
    minVideos: number;
    minCompletionRate: number;
    searchQuery: string;
}

const ITEMS_PER_PAGE = 10;
const PAGE_OPTIONS = [10, 20, 50];

const VectorManager = () => {
    const { language } = useLanguage();
    const { t } = useTranslation();
    const [tasks, setTasks] = useState<Task[]>([]);
    const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());
    const [vectorizing, setVectorizing] = useState(false);
    const [vectorStats, setVectorStats] = useState<VectorStats | null>(null);
    const [result, setResult] = useState<{ vectorized_count: number; skipped_count: number; failed_count: number } | null>(null);
    // 目标 collection 选择器
    const [collections, setCollections] = useState<VectorCollection[]>([]);
    const [targetCollection, setTargetCollection] = useState<string>('');

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(ITEMS_PER_PAGE);

    // Sorting
    const [sortField, setSortField] = useState<SortField>('created_at');
    const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

    // Filtering
    const [filters, setFilters] = useState<FilterOptions>({
        status: 'completed',  // 默认只显示已完成的任务
        minVideos: 0,
        minCompletionRate: 0,
        searchQuery: ''
    });

    const [showFilterPanel, setShowFilterPanel] = useState(false);

    const fetchTasks = async () => {
        try {
            const res = await getTasks({ limit: 1000 });
            setTasks(res.data);
        } catch (error) {
            console.error('Failed to fetch tasks:', error);
        }
    };

    const fetchVectorStats = async () => {
        try {
            const stats = await getVectorStats();
            setVectorStats(stats);
        } catch (error) {
            console.error('Failed to fetch vector stats:', error);
        }
    };

    useEffect(() => {
        fetchTasks();
        fetchVectorStats();
        // 加载可用 collection 列表
        getVectorCollections().then(r => setCollections(r.collections)).catch(() => {});
    }, []);

    // Reset page when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [filters, itemsPerPage]);

    const handleToggleTask = (taskId: string) => {
        const newSelected = new Set(selectedTasks);
        if (newSelected.has(taskId)) {
            newSelected.delete(taskId);
        } else {
            newSelected.add(taskId);
        }
        setSelectedTasks(newSelected);
    };

    const handleSelectAll = () => {
        if (selectedTasks.size === filteredAndSortedTasks.length) {
            setSelectedTasks(new Set());
        } else {
            setSelectedTasks(new Set(filteredAndSortedTasks.map(t => t.id)));
        }
    };

    const handleVectorize = async () => {
        if (selectedTasks.size === 0) return;

        setVectorizing(true);
        setResult(null);

        try {
            const res = await vectorizeEvaluations(
                Array.from(selectedTasks),
                targetCollection || undefined,
            );
            setResult(res);
            await fetchVectorStats();
            // 刷新 collection 列表（count 可能变了）
            try { const c = await getVectorCollections(); setCollections(c.collections); } catch {}
            // Clear selection after successful vectorization
            if (res.failed_count === 0) {
                setSelectedTasks(new Set());
            }
        } catch (error) {
            console.error('Vectorization failed:', error);
            setResult({ vectorized_count: 0, skipped_count: 0, failed_count: selectedTasks.size });
        } finally {
            setVectorizing(false);
        }
    };

    const handleDeleteVideoVectors = async (videoName: string) => {
        if (!confirm(t('confirm_delete_video', { name: videoName }))) {
            return;
        }

        try {
            await deleteVideoVectors(videoName);
            await fetchVectorStats();
        } catch (error) {
            console.error('Failed to delete vectors:', error);
            alert(t('delete_failed'));
        }
    };

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortOrder('desc');
        }
    };

    const getCompletionRate = (task: Task) => {
        if (task.total_videos === 0) return 0;
        return (task.completed_videos / task.total_videos) * 100;
    };

    // Filter and sort tasks
    const filteredAndSortedTasks = useMemo(() => {
        let result = [...tasks];

        // Apply status filter
        if (filters.status !== 'all') {
            result = result.filter(t => t.status === filters.status);
        }

        // Apply min videos filter
        if (filters.minVideos > 0) {
            result = result.filter(t => t.total_videos >= filters.minVideos);
        }

        // Apply min completion rate filter
        if (filters.minCompletionRate > 0) {
            result = result.filter(t => getCompletionRate(t) >= filters.minCompletionRate);
        }

        // Apply search filter
        if (filters.searchQuery) {
            const query = filters.searchQuery.toLowerCase();
            result = result.filter(t =>
                t.id.toLowerCase().includes(query) ||
                t.folder_path.toLowerCase().includes(query)
            );
        }

        // Apply sorting
        result.sort((a, b) => {
            let comparison = 0;

            switch (sortField) {
                case 'created_at':
                    comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
                    break;
                case 'total_videos':
                    comparison = a.total_videos - b.total_videos;
                    break;
                case 'completion_rate':
                    comparison = getCompletionRate(a) - getCompletionRate(b);
                    break;
            }

            return sortOrder === 'asc' ? comparison : -comparison;
        });

        return result;
    }, [tasks, filters, sortField, sortOrder]);

    // Pagination
    const totalPages = Math.ceil(filteredAndSortedTasks.length / itemsPerPage);
    const paginatedTasks = filteredAndSortedTasks.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    const completedTasksCount = tasks.filter(t => t.status === 'completed').length;

    const getSortIcon = (field: SortField) => {
        if (sortField !== field) return <ChevronDown className="w-4 h-4 opacity-30" />;
        return sortOrder === 'asc' ?
            <ChevronUp className="w-4 h-4" /> :
            <ChevronDown className="w-4 h-4" />;
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <div className="min-h-[100dvh] bg-surface p-8">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="mb-8">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="bg-primary/10 p-3 rounded-xl">
                            <Database className="w-8 h-8 text-text-primary" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-text-primary">
                                {t('title')}
                            </h1>
                            <p className="text-sm text-text-muted">
                                {t('subtitle')}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    {/* Vector Count */}
                    <div className="bg-surface-raised rounded-2xl p-6 shadow-sm border border-ink/[0.08]">
                        <div className="flex items-center justify-between mb-4">
                            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                                <Database className="w-6 h-6 text-blue-600" />
                            </div>
                        </div>
                        <div className="text-3xl font-bold text-text-primary mb-1">
                            {vectorStats?.total_vectors || 0}
                        </div>
                        <div className="text-sm text-text-muted">
                            {t('total_vectors')}
                        </div>
                    </div>

                    {/* Dimension */}
                    <div className="bg-surface-raised rounded-2xl p-6 shadow-sm border border-ink/[0.08]">
                        <div className="flex items-center justify-between mb-4">
                            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                                <RefreshCw className="w-6 h-6 text-purple-600" />
                            </div>
                        </div>
                        <div className="text-3xl font-bold text-text-primary mb-1">
                            {vectorStats?.dimension || 768}
                        </div>
                        <div className="text-sm text-text-muted flex items-center gap-1">
                            <span>{t('vector_dimension')}</span>
                            <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">BGE-ZH</span>
                        </div>
                        <div className="text-xs text-text-muted mt-1">
                            {t('dimension_desc')}
                        </div>
                    </div>

                    {/* Collection */}
                    <div className="bg-surface-raised rounded-2xl p-6 shadow-sm border border-ink/[0.08]">
                        <div className="flex items-center justify-between mb-4">
                            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                                <CheckCircle className="w-6 h-6 text-green-600" />
                            </div>
                        </div>
                        <div className="text-lg font-bold text-text-primary mb-1">
                            {vectorStats?.collection_name || 'beeeval'}
                        </div>
                        <div className="text-sm text-text-muted">
                            {t('collection_name')}
                        </div>
                    </div>
                </div>

                {/* Task Selection & Filters */}
                <div className="bg-surface-raised rounded-2xl shadow-sm border border-ink/[0.08] overflow-hidden mb-6">
                    {/* Toolbar */}
                    <div className="p-6 border-b border-ink/[0.08]">
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                            {/* Left: Selection info and filter toggle */}
                            <div className="flex items-center gap-3 flex-wrap">
                                <div className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={selectedTasks.size === filteredAndSortedTasks.length && filteredAndSortedTasks.length > 0}
                                        onChange={handleSelectAll}
                                        disabled={filteredAndSortedTasks.length === 0}
                                        className="w-4 h-4 rounded border-ink/[0.1] text-primary focus:ring-primary"
                                    />
                                    <span className="font-semibold text-text-secondary">
                                        {t('select_tasks')}
                                    </span>
                                </div>
                                <span className="text-sm text-text-muted bg-surface-overlay px-2 py-1 rounded-full">
                                    {selectedTasks.size} / {filteredAndSortedTasks.length} {t('selected')}
                                </span>
                                <button
                                    onClick={() => setShowFilterPanel(!showFilterPanel)}
                                    className={clsx(
                                        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors",
                                        showFilterPanel ? "bg-primary/10 text-primary" : "text-text-secondary hover:bg-ink/[0.05]"
                                    )}
                                >
                                    <Filter className="w-4 h-4" />
                                    {t('filter')}
                                </button>
                            </div>

                            {/* Right: Vectorize button */}
                            {/* 目标 Collection 选择器 */}
                            {collections.length > 0 && (
                                <LightSelect
                                    value={targetCollection}
                                    onChange={e => setTargetCollection(e.target.value)}
                                    className="text-sm border border-ink/[0.1] rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-primary/50 bg-surface text-text-primary"
                                >
                                    {collections.map(c => (
                                        <option key={c.name} value={c.name}>
                                            {c.label}{c.count != null ? ` (${c.count})` : ''}
                                        </option>
                                    ))}
                                </LightSelect>
                            )}
                            <button
                                onClick={handleVectorize}
                                disabled={selectedTasks.size === 0 || vectorizing}
                                className="flex items-center justify-center gap-2 px-6 py-2.5 bg-primary text-text-inverse rounded-xl hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
                            >
                                {vectorizing ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        {t('processing')}
                                    </>
                                ) : (
                                    <>
                                        <Upload className="w-5 h-5" />
                                        {t('vectorize_selected')}
                                    </>
                                )}
                            </button>
                        </div>

                        {/* Filter Panel */}
                        {showFilterPanel && (
                            <div className="mt-4 p-4 bg-surface rounded-xl border border-ink/[0.08]">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                    {/* Status Filter */}
                                    <div>
                                        <label className="block text-sm font-medium text-text-secondary mb-1.5">
                                            {t('task_status')}
                                        </label>
                                        <LightSelect
                                            value={filters.status}
                                            onChange={(e) => setFilters({ ...filters, status: e.target.value as StatusFilter })}
                                            className="w-full px-3 py-2 border border-ink/[0.1] rounded-lg text-sm focus:ring-primary focus:border-primary"
                                        >
                                            <option value="all">{t('status_all')}</option>
                                            <option value="completed">{t('status_completed')}</option>
                                            <option value="processing">{t('status_processing')}</option>
                                            <option value="pending">{t('status_pending')}</option>
                                        </LightSelect>
                                    </div>

                                    {/* Min Videos */}
                                    <div>
                                        <label className="block text-sm font-medium text-text-secondary mb-1.5">
                                            {t('min_videos')}
                                        </label>
                                        <input
                                            type="number"
                                            min="0"
                                            value={filters.minVideos || ''}
                                            onChange={(e) => setFilters({ ...filters, minVideos: parseInt(e.target.value) || 0 })}
                                            placeholder={t('min_videos_placeholder')}
                                            className="w-full px-3 py-2 border border-ink/[0.1] rounded-lg text-sm focus:ring-primary focus:border-primary"
                                        />
                                    </div>

                                    {/* Min Completion Rate */}
                                    <div>
                                        <label className="block text-sm font-medium text-text-secondary mb-1.5">
                                            {t('min_completion')}
                                        </label>
                                        <LightSelect
                                            value={filters.minCompletionRate}
                                            onChange={(e) => setFilters({ ...filters, minCompletionRate: parseInt(e.target.value) })}
                                            className="w-full px-3 py-2 border border-ink/[0.1] rounded-lg text-sm focus:ring-primary focus:border-primary"
                                        >
                                            <option value="0">{t('min_videos_placeholder')}</option>
                                            <option value="50">50%+</option>
                                            <option value="80">80%+</option>
                                            <option value="90">90%+</option>
                                            <option value="100">100%</option>
                                        </LightSelect>
                                    </div>

                                    {/* Search */}
                                    <div>
                                        <label className="block text-sm font-medium text-text-secondary mb-1.5">
                                            {t('search')}
                                        </label>
                                        <div className="relative">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                                            <input
                                                type="text"
                                                value={filters.searchQuery}
                                                onChange={(e) => setFilters({ ...filters, searchQuery: e.target.value })}
                                                placeholder={t('search_placeholder')}
                                                className="w-full pl-9 pr-3 py-2 border border-ink/[0.1] rounded-lg text-sm focus:ring-primary focus:border-primary"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Reset Filters */}
                                <div className="mt-4 flex justify-end">
                                    <button
                                        onClick={() => setFilters({
                                            status: 'completed',
                                            minVideos: 0,
                                            minCompletionRate: 0,
                                            searchQuery: ''
                                        })}
                                        className="text-sm text-text-secondary hover:text-text-primary flex items-center gap-1"
                                    >
                                        <RefreshCw className="w-3.5 h-3.5" />
                                        {t('reset_filters')}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Result Banner */}
                        {result && (
                            <div className={clsx(
                                "mt-4 p-4 flex items-center gap-3 rounded-xl",
                                result.failed_count > 0 ? "bg-amber-100" : "bg-green-100"
                            )}>
                                {result.failed_count > 0 ? (
                                    <AlertCircle className="w-5 h-5 text-amber-700" />
                                ) : (
                                    <CheckCircle className="w-5 h-5 text-green-600" />
                                )}
                                <span className="text-sm font-medium">
                                    {t('vector_result_success', { vectorized: result.vectorized_count, skipped: result.skipped_count })}
                                    {result.failed_count > 0 && t('vector_result_failed', { count: result.failed_count })}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Task Table */}
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-surface border-b border-ink/[0.08]">
                                <tr>
                                    <th className="px-6 py-3 text-left">
                                        <input
                                            type="checkbox"
                                            checked={selectedTasks.size === paginatedTasks.length && paginatedTasks.length > 0}
                                            onChange={handleSelectAll}
                                            disabled={paginatedTasks.length === 0}
                                            className="w-4 h-4 rounded border-ink/[0.1] text-primary focus:ring-primary"
                                        />
                                    </th>
                                    <th
                                        className="px-6 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider cursor-pointer hover:bg-ink/[0.05]"
                                        onClick={() => handleSort('created_at')}
                                    >
                                        <div className="flex items-center gap-1">
                                            {t('task_id')}
                                            {getSortIcon('created_at')}
                                        </div>
                                    </th>
                                    <th
                                        className="px-6 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider cursor-pointer hover:bg-ink/[0.05]"
                                        onClick={() => handleSort('total_videos')}
                                    >
                                        <div className="flex items-center gap-1">
                                            {t('video_progress')}
                                            {getSortIcon('total_videos')}
                                        </div>
                                    </th>
                                    <th
                                        className="px-6 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider cursor-pointer hover:bg-ink/[0.05]"
                                        onClick={() => handleSort('completion_rate')}
                                    >
                                        <div className="flex items-center gap-1">
                                            {t('completion')}
                                            {getSortIcon('completion_rate')}
                                        </div>
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">
                                        {t('created_at')}
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">
                                        {t('status')}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-ink/[0.08]">
                                {paginatedTasks.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-12 text-center text-text-muted">
                                            <Database className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                            {t('no_tasks_match')}
                                        </td>
                                    </tr>
                                ) : (
                                    paginatedTasks.map((task) => (
                                        <tr
                                            key={task.id}
                                            className={clsx(
                                                "hover:bg-ink/[0.05] transition-colors",
                                                task.status !== 'completed' && "opacity-60"
                                            )}
                                        >
                                            <td className="px-6 py-4">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedTasks.has(task.id)}
                                                    onChange={() => task.status === 'completed' && handleToggleTask(task.id)}
                                                    disabled={task.status !== 'completed'}
                                                    className="w-4 h-4 rounded border-ink/[0.1] text-primary focus:ring-primary"
                                                />
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="font-medium text-text-secondary text-sm truncate max-w-xs" title={task.id}>
                                                    {task.id}
                                                </div>
                                                <div className="text-xs text-text-muted truncate max-w-xs" title={task.folder_path}>
                                                    {task.folder_path}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="text-sm text-text-secondary">
                                                    {task.completed_videos} / {task.total_videos}
                                                </div>
                                                <div className="w-24 h-1.5 bg-ink/[0.08] rounded-full mt-1 overflow-hidden">
                                                    <div
                                                        className="h-full bg-primary rounded-full transition-all"
                                                        style={{ width: `${getCompletionRate(task)}%` }}
                                                    />
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={clsx(
                                                    "text-sm font-medium",
                                                    getCompletionRate(task) === 100 ? "text-green-600" :
                                                    getCompletionRate(task) >= 80 ? "text-blue-600" :
                                                    "text-text-muted"
                                                )}>
                                                    {getCompletionRate(task).toFixed(0)}%
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-text-muted">
                                                {formatDate(task.created_at)}
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={clsx(
                                                    "px-2.5 py-1 rounded-full text-xs font-medium",
                                                    task.status === 'completed' ? "bg-green-100 text-green-700" :
                                                    task.status === 'processing' ? "bg-blue-100 text-blue-700" :
                                                    "bg-surface-overlay text-text-secondary"
                                                )}>
                                                    {task.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="p-4 border-t border-ink/[0.08] flex items-center justify-between flex-wrap gap-4">
                            {/* Items per page */}
                            <div className="flex items-center gap-2 text-sm text-text-secondary">
                                <span>{t('per_page')}:</span>
                                <LightSelect
                                    value={itemsPerPage}
                                    onChange={(e) => setItemsPerPage(parseInt(e.target.value))}
                                    className="px-2 py-1 border border-ink/[0.1] rounded-lg focus:ring-primary focus:border-primary"
                                >
                                    {PAGE_OPTIONS.map(option => (
                                        <option key={option} value={option}>{option}</option>
                                    ))}
                                </LightSelect>
                            </div>

                            {/* Page info */}
                            <div className="text-sm text-text-secondary">
                                {t('vector_page_info', { current: currentPage, total: totalPages, count: filteredAndSortedTasks.length })}
                            </div>

                            {/* Page navigation */}
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setCurrentPage(1)}
                                    disabled={currentPage === 1}
                                    className="px-3 py-1.5 text-sm border border-ink/[0.08] rounded-lg hover:bg-ink/[0.05] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    {t('first_page')}
                                </button>
                                <button
                                    onClick={() => setCurrentPage(currentPage - 1)}
                                    disabled={currentPage === 1}
                                    className="px-3 py-1.5 text-sm border border-ink/[0.08] rounded-lg hover:bg-ink/[0.05] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    {t('prev_page')}
                                </button>

                                {/* Page numbers */}
                                <div className="flex items-center gap-1">
                                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                        let pageNum;
                                        if (totalPages <= 5) {
                                            pageNum = i + 1;
                                        } else if (currentPage <= 3) {
                                            pageNum = i + 1;
                                        } else if (currentPage >= totalPages - 2) {
                                            pageNum = totalPages - 4 + i;
                                        } else {
                                            pageNum = currentPage - 2 + i;
                                        }

                                        return (
                                            <button
                                                key={pageNum}
                                                onClick={() => setCurrentPage(pageNum)}
                                                className={clsx(
                                                    "w-8 h-8 text-sm rounded-lg transition-colors",
                                                    currentPage === pageNum
                                                        ? "bg-primary text-text-inverse"
                                                        : "hover:bg-ink/[0.05] text-text-secondary"
                                                )}
                                            >
                                                {pageNum}
                                            </button>
                                        );
                                    })}
                                </div>

                                <button
                                    onClick={() => setCurrentPage(currentPage + 1)}
                                    disabled={currentPage === totalPages}
                                    className="px-3 py-1.5 text-sm border border-ink/[0.08] rounded-lg hover:bg-ink/[0.05] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    {t('next_page')}
                                </button>
                                <button
                                    onClick={() => setCurrentPage(totalPages)}
                                    disabled={currentPage === totalPages}
                                    className="px-3 py-1.5 text-sm border border-ink/[0.08] rounded-lg hover:bg-ink/[0.05] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    {t('last_page')}
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Quick Actions */}
                <div className="flex items-center justify-between mb-8">
                    <div className="text-sm text-text-muted">
                        {t('vector_tasks_summary', { total: tasks.length, completed: completedTasksCount, selected: selectedTasks.size })}
                    </div>
                    <button
                        onClick={fetchTasks}
                        className="flex items-center gap-2 px-4 py-2 text-text-secondary hover:text-text-primary hover:bg-ink/[0.05] transition-colors rounded-lg border border-transparent hover:border-ink/[0.08]"
                    >
                        <RefreshCw className="w-4 h-4" />
                        {t('refresh_list')}
                    </button>
                </div>

                {/* ===== Vector Data Browser ===== */}
                <VectorBrowser
                    language={language}
                    onStatsChange={fetchVectorStats}
                />
            </div>
        </div>
    );
};

/* ==================== Vector Data Browser Component ==================== */

const VEC_PAGE_SIZE = 20;

const VectorBrowser = ({ language, onStatsChange }: { language: string; onStatsChange: () => void }) => {
    const { t } = useTranslation();
    const { tv, td } = useMetricsTranslation();
    const [points, setPoints] = useState<VectorPoint[]>([]);
    const [total, setTotal] = useState(0);
    const [nextOffset, setNextOffset] = useState<string | null>(null);
    const [offsets, setOffsets] = useState<(string | undefined)[]>([undefined]);
    const [pageIdx, setPageIdx] = useState(0);
    const [loading, setLoading] = useState(false);

    const [facets, setFacets] = useState<{ video_names: string[]; brand_models: string[]; function_domains: string[] }>({ video_names: [], brand_models: [], function_domains: [] });
    const [filterVideoName, setFilterVideoName] = useState('');
    const [filterBrandModel, setFilterBrandModel] = useState('');
    const [filterDomain, setFilterDomain] = useState('');

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [detailPoint, setDetailPoint] = useState<VectorPoint | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [clearing, setClearing] = useState(false);

    const fetchPage = useCallback(async (offset?: string) => {
        setLoading(true);
        try {
            const params: Record<string, any> = { limit: VEC_PAGE_SIZE };
            if (offset) params.offset = offset;
            if (filterVideoName) params.video_name = filterVideoName;
            if (filterBrandModel) params.brand_model = filterBrandModel;
            if (filterDomain) params.function_domain = filterDomain;
            const res = await listVectors(params);
            setPoints(res.points);
            setTotal(res.total);
            setNextOffset(res.next_offset);
        } catch (e) {
            console.error('Failed to list vectors', e);
        } finally {
            setLoading(false);
        }
    }, [filterVideoName, filterBrandModel, filterDomain]);

    useEffect(() => {
        fetchPage();
        setPageIdx(0);
        setOffsets([undefined]);
        setSelectedIds(new Set());
    }, [fetchPage]);

    useEffect(() => {
        getVectorFacets().then(setFacets).catch(() => {});
    }, []);

    const handleNext = () => {
        if (!nextOffset) return;
        const newIdx = pageIdx + 1;
        const newOffsets = [...offsets];
        if (newOffsets.length <= newIdx) newOffsets.push(nextOffset);
        setOffsets(newOffsets);
        setPageIdx(newIdx);
        fetchPage(nextOffset);
        setSelectedIds(new Set());
    };

    const handlePrev = () => {
        if (pageIdx === 0) return;
        const newIdx = pageIdx - 1;
        setPageIdx(newIdx);
        fetchPage(offsets[newIdx]);
        setSelectedIds(new Set());
    };

    const toggleSelect = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id); else next.add(id);
        setSelectedIds(next);
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === points.length && points.length > 0) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(points.map(p => p.id)));
        }
    };

    const handleDeleteSelected = async () => {
        if (selectedIds.size === 0) return;
        if (!confirm(t('confirm_delete_batch', { count: selectedIds.size }))) return;
        setDeleting(true);
        try {
            await deleteVectorsBatch(Array.from(selectedIds));
            setSelectedIds(new Set());
            await fetchPage(offsets[pageIdx]);
            onStatsChange();
        } catch (e) {
            console.error('Delete failed', e);
            alert(t('delete_failed'));
        } finally {
            setDeleting(false);
        }
    };

    const handleClear = async () => {
        if (!confirm(t('confirm_clear_all'))) return;
        const input = prompt(t('confirm_clear_input'));
        if (input !== t('clear_confirm_word')) return;
        setClearing(true);
        try {
            await clearVectors();
            setPoints([]);
            setTotal(0);
            setNextOffset(null);
            setOffsets([undefined]);
            setPageIdx(0);
            setSelectedIds(new Set());
            onStatsChange();
            getVectorFacets().then(setFacets).catch(() => {});
        } catch (e) {
            console.error('Clear failed', e);
            alert(t('clear_failed'));
        } finally {
            setClearing(false);
        }
    };

    const resetFilters = () => {
        setFilterVideoName('');
        setFilterBrandModel('');
        setFilterDomain('');
    };

    const hasFilters = filterVideoName || filterBrandModel || filterDomain;

    return (
        <>
            <div className="bg-surface-raised rounded-2xl shadow-sm border border-ink/[0.08] overflow-hidden">
                {/* Header */}
                <div className="p-6 border-b border-ink/[0.08]">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                                <Eye className="w-5 h-5 text-indigo-600" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-text-primary">
                                    {t('data_browser_title')}
                                </h2>
                                <p className="text-xs text-text-muted">
                                    {t('data_browser_subtitle')}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {selectedIds.size > 0 && (
                                <button
                                    onClick={handleDeleteSelected}
                                    disabled={deleting}
                                    className="flex items-center gap-1.5 px-3 py-2 bg-red-100 text-red-700 rounded-lg text-sm font-medium hover:bg-red-100 disabled:opacity-50"
                                >
                                    {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                    {t('delete_count', { count: selectedIds.size })}
                                </button>
                            )}

                            <button
                                onClick={handleClear}
                                disabled={clearing || total === 0}
                                className="flex items-center gap-1.5 px-3 py-2 border border-red-200 text-red-700 rounded-lg text-sm font-medium hover:bg-red-100 disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                {clearing ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
                                {t('clear_all')}
                            </button>
                        </div>
                    </div>

                    {/* Filters */}
                    <div className="flex flex-wrap gap-3 items-center">
                        <LightSelect value={filterBrandModel} onChange={e => setFilterBrandModel(e.target.value)} className="text-sm border border-ink/[0.1] rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500">
                            <option value="">{t('all_models')}</option>
                            {facets.brand_models.map(m => <option key={m} value={m}>{tv(m)}</option>)}
                        </LightSelect>
                        <LightSelect value={filterDomain} onChange={e => setFilterDomain(e.target.value)} className="text-sm border border-ink/[0.1] rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500">
                            <option value="">{t('all_domains')}</option>
                            {facets.function_domains.map(d => <option key={d} value={d}>{td(d)}</option>)}
                        </LightSelect>
                        <LightSelect value={filterVideoName} onChange={e => setFilterVideoName(e.target.value)} className="text-sm border border-ink/[0.1] rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500 max-w-[260px]">
                            <option value="">{t('all_videos')}</option>
                            {facets.video_names.map(v => <option key={v} value={v}>{v}</option>)}
                        </LightSelect>
                        {hasFilters && (
                            <button onClick={resetFilters} className="text-xs text-text-muted hover:text-text-primary flex items-center gap-1">
                                <RefreshCw className="w-3 h-3" /> {t('reset')}
                            </button>
                        )}
                        <span className="ml-auto text-xs text-text-muted">{total} {t('vectors_unit')}</span>
                    </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-surface text-text-muted font-medium border-b border-ink/[0.08]">
                            <tr>
                                <th className="px-4 py-3 w-10">
                                    <button onClick={toggleSelectAll}>
                                        {selectedIds.size === points.length && points.length > 0
                                            ? <CheckSquare className="w-4 h-4 text-indigo-600" />
                                            : <Square className="w-4 h-4 text-text-muted" />}
                                    </button>
                                </th>
                                <th className="px-4 py-3">{t('col_video')}</th>
                                <th className="px-4 py-3">{t('col_question')}</th>
                                <th className="px-4 py-3 w-24">{t('col_model')}</th>
                                <th className="px-4 py-3 w-24">{t('col_domain')}</th>
                                <th className="px-4 py-3 w-20 text-right">{t('col_actions')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-ink/[0.08]">
                            {loading ? (
                                <tr><td colSpan={6} className="text-center py-16"><Loader2 className="w-6 h-6 animate-spin text-indigo-500 mx-auto" /></td></tr>
                            ) : points.length === 0 ? (
                                <tr><td colSpan={6} className="text-center py-16 text-text-muted">
                                    <Database className="w-10 h-10 mx-auto mb-2 opacity-40" />
                                    {t('empty_vectors')}
                                </td></tr>
                            ) : points.map(p => (
                                <tr key={p.id} className={clsx("hover:bg-ink/[0.05] transition-colors", selectedIds.has(p.id) && "bg-indigo-50/40")}>
                                    <td className="px-4 py-3">
                                        <button onClick={() => toggleSelect(p.id)}>
                                            {selectedIds.has(p.id)
                                                ? <CheckSquare className="w-4 h-4 text-indigo-600" />
                                                : <Square className="w-4 h-4 text-text-muted" />}
                                        </button>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="font-medium text-text-primary truncate max-w-[200px]" title={p.video_name}>{p.video_name}</div>
                                        <div className="text-[10px] text-text-muted font-mono">{p.id}</div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="text-text-secondary line-clamp-2 max-w-[280px]" title={p.user_question}>{p.user_question || '-'}</div>
                                    </td>
                                    <td className="px-4 py-3 text-xs text-text-muted">{p.brand_model ? tv(p.brand_model) : '-'}</td>
                                    <td className="px-4 py-3 text-xs text-text-muted">{p.function_domain ? td(p.function_domain) : '-'}</td>
                                    <td className="px-4 py-3 text-right">
                                        <button
                                            onClick={() => setDetailPoint(p)}
                                            className="p-1.5 hover:bg-indigo-900/20 text-text-muted hover:text-indigo-600 rounded transition-colors"
                                            title={t('view_detail')}
                                        >
                                            <Eye className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div className="p-3 border-t border-ink/[0.08] bg-surface flex items-center justify-between text-xs text-text-muted">
                    <span>{t('page_n', { n: pageIdx + 1 })}</span>
                    <div className="flex items-center gap-2">
                        <button onClick={handlePrev} disabled={pageIdx === 0} className="px-2 py-1 rounded border border-ink/[0.1] hover:bg-ink/[0.05] disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1">
                            <ChevronLeft className="w-3 h-3" /> {t('prev_page')}
                        </button>
                        <button onClick={handleNext} disabled={!nextOffset} className="px-2 py-1 rounded border border-ink/[0.1] hover:bg-ink/[0.05] disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1">
                            {t('next_page')} <ChevronRight className="w-3 h-3" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Detail / Edit Modal */}
            {detailPoint && (
                <VectorEditModal
                    language={language}
                    point={detailPoint}
                    onClose={() => setDetailPoint(null)}
                    onSaved={() => { fetchPage(offsets[pageIdx]); onStatsChange(); }}
                />
            )}
        </>
    );
};

/* ==================== Vector Edit Modal ==================== */

const SEMANTIC_FIELDS = new Set(['user_question', 'system_response', 'summary']);

const VectorEditModal = ({ language, point, onClose, onSaved }: {
    language: string;
    point: VectorPoint;
    onClose: () => void;
    onSaved: () => void;
}) => {
    const { t } = useTranslation();
    const { tm } = useMetricsTranslation();
    const [editing, setEditing] = useState(false);
    const [form, setForm] = useState({ ...point });
    const [saving, setSaving] = useState(false);
    const [semanticChanged, setSemanticChanged] = useState(false);

    const set = (key: string, val: string) => {
        setForm(prev => ({ ...prev, [key]: val }));
        if (SEMANTIC_FIELDS.has(key)) {
            setSemanticChanged(true);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await updateVector(point.id, {
                video_name: form.video_name,
                user_question: form.user_question,
                system_response: form.system_response,
                summary: form.summary,
                case_id: form.case_id,
                brand_model: form.brand_model,
                system_version: form.system_version,
                function_domain: form.function_domain,
                scenario: form.scenario,
                sequence: form.sequence,
                created_at: form.created_at,
                re_embed: semanticChanged,
            });
            setEditing(false);
            setSemanticChanged(false);
            onSaved();
        } catch (e) {
            console.error('Save failed', e);
            alert(t('save_failed'));
        } finally {
            setSaving(false);
        }
    };

    const handleCancel = () => {
        setForm({ ...point });
        setEditing(false);
        setSemanticChanged(false);
    };

    const fields: { key: keyof VectorPoint; label_zh: string; label_en: string; long?: boolean }[] = [
        { key: 'video_name', label_zh: '视频名称', label_en: 'Video' },
        { key: 'case_id', label_zh: '用例 ID', label_en: 'Case ID' },
        { key: 'brand_model', label_zh: '品牌车型', label_en: 'Model' },
        { key: 'system_version', label_zh: '系统版本', label_en: 'Version' },
        { key: 'function_domain', label_zh: '功能域', label_en: 'Domain' },
        { key: 'scenario', label_zh: '场景', label_en: 'Scenario' },
        { key: 'user_question', label_zh: '用户问题', label_en: 'User Question', long: true },
        { key: 'system_response', label_zh: '系统回复', label_en: 'System Response', long: true },
        { key: 'summary', label_zh: '评估总结', label_en: 'Summary', long: true },
        { key: 'created_at', label_zh: '创建时间', label_en: 'Created' },
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
            <div className="bg-surface-raised rounded-2xl shadow-2xl shadow-ink/40 w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="p-6 border-b border-ink/[0.08] flex justify-between items-start bg-surface rounded-t-2xl sticky top-0 z-10">
                    <div>
                        <h3 className="font-bold text-text-primary">{editing ? t('edit_vector') : t('vector_detail')}</h3>
                        <p className="text-xs text-text-muted font-mono mt-1">ID: {point.id}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        {!editing ? (
                            <button onClick={() => setEditing(true)} className="px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-sm font-medium hover:bg-indigo-900/20 transition-colors">
                                {t('edit')}
                            </button>
                        ) : (
                            <>
                                <button onClick={handleCancel} className="px-3 py-1.5 border border-ink/[0.1] text-text-secondary rounded-lg text-sm font-medium hover:bg-ink/[0.05]">
                                    {t('cancel')}
                                </button>
                                <button onClick={handleSave} disabled={saving} className="px-3 py-1.5 bg-indigo-600 text-text-primary rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5">
                                    {saving && <Loader2 className="w-3 h-3 animate-spin" />}
                                    {t('save')}
                                </button>
                            </>
                        )}
                        <button onClick={onClose} className="p-1.5 hover:bg-ink/[0.08] rounded-full text-text-muted"><X className="w-5 h-5" /></button>
                    </div>
                </div>
                <div className="p-6 space-y-4">
                    {editing && semanticChanged && (
                        <div className="bg-amber-100 border border-amber-200 rounded-lg p-3 text-xs text-amber-700 flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                            <span>{t('vector_semantic_warning')}</span>
                        </div>
                    )}

                    {fields.map(f => (
                        <div key={f.key}>
                            <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1 flex items-center gap-1">
                                {language === 'zh' ? f.label_zh : f.label_en}
                                {editing && SEMANTIC_FIELDS.has(f.key) && (
                                    <span className="text-[9px] bg-amber-100 text-amber-700 px-1 rounded">semantic</span>
                                )}
                            </div>
                            {editing ? (
                                f.long ? (
                                    <textarea
                                        value={(form as any)[f.key] || ''}
                                        onChange={e => set(f.key, e.target.value)}
                                        rows={3}
                                        className="w-full border border-ink/[0.1] rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-y"
                                    />
                                ) : (
                                    <input
                                        type="text"
                                        value={(form as any)[f.key] || ''}
                                        onChange={e => set(f.key, e.target.value)}
                                        className="w-full border border-ink/[0.1] rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                    />
                                )
                            ) : (
                                f.long ? (
                                    <div className="bg-surface p-3 rounded-lg border border-ink/[0.08] text-sm text-text-secondary whitespace-pre-wrap">{(point as any)[f.key] || '-'}</div>
                                ) : (
                                    <div className="text-sm text-text-primary">{(point as any)[f.key] || '-'}</div>
                                )
                            )}
                        </div>
                    ))}

                    {/* Evaluations (read-only) */}
                    {point.evaluations && point.evaluations.length > 0 && (
                        <div>
                            <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">{t('evaluations')}</div>
                            <div className="space-y-2">
                                {point.evaluations.map((ev: any, i: number) => (
                                    <div key={i} className="bg-surface p-3 rounded-lg border border-ink/[0.08] text-sm">
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="font-medium text-text-secondary">{tm(ev.metric_name || ev.criteria || `Metric ${i + 1}`)}</span>
                                            <span className={clsx("px-2 py-0.5 rounded text-xs font-bold",
                                                (ev.score || 0) >= 4 ? "bg-emerald-100 text-emerald-700" :
                                                (ev.score || 0) >= 3 ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700"
                                            )}>{ev.score ?? 'N/A'}</span>
                                        </div>
                                        {ev.feedback && <p className="text-xs text-text-secondary"><TranslatedText text={ev.feedback} preTranslated={ev.feedback_en} /></p>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default VectorManager;
