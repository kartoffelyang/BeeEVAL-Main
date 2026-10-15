import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getTasks, deleteTasksBatch } from '../api';
import { AnalysisTask } from '../types';
import { Clock, CheckCircle2, AlertCircle, Loader2, Trash2, CheckSquare, Square, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';

const PAGE_SIZE = 20;

const History = () => {
    const { t } = useTranslation();
    const [tasks, setTasks] = useState<AnalysisTask[]>([]);
    const [total, setTotal] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [deletingBatch, setDeletingBatch] = useState(false);

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    const fetchTasks = useCallback(async () => {
        setLoading(true);
        try {
            const res = await getTasks({
                offset: (currentPage - 1) * PAGE_SIZE,
                limit: PAGE_SIZE,
            });
            setTasks(res.data);
            setTotal(res.total);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }, [currentPage]);

    useEffect(() => {
        fetchTasks();
    }, [fetchTasks]);

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
        if (selectedIds.size === tasks.length && tasks.length > 0) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(tasks.map(t => t.id)));
        }
    };

    const handleBatchDelete = async () => {
        if (selectedIds.size === 0) return;
        if (!window.confirm(t('confirm_delete_tasks', { count: selectedIds.size }))) return;

        setDeletingBatch(true);
        try {
            await deleteTasksBatch(Array.from(selectedIds));
            setSelectedIds(new Set());
            await fetchTasks();
        } catch (error) {
            console.error(error);
            alert("Failed to batch delete tasks");
        } finally {
            setDeletingBatch(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
        );
    }

    return (
        <div className="p-8 space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-bold text-text-primary">Analysis History</h2>
                    <p className="text-text-muted mt-2">View past analysis tasks and reports.</p>
                </div>
                {selectedIds.size > 0 && (
                    <button
                        onClick={handleBatchDelete}
                        disabled={deletingBatch}
                        className="flex items-center gap-2 px-4 py-2 bg-rose-600 text-text-inverse font-medium rounded-lg hover:bg-rose-700 disabled:opacity-50 transition-colors animate-in fade-in slide-in-from-right-4"
                    >
                        {deletingBatch ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        Delete Selected ({selectedIds.size})
                    </button>
                )}
            </div>

            <div className="bg-surface-raised rounded-xl shadow-sm border border-ink/[0.08] overflow-hidden">
                <table className="w-full text-left text-sm text-text-secondary">
                    <thead className="bg-surface text-text-secondary uppercase font-semibold">
                        <tr>
                            <th className="px-6 py-4 w-12">
                                <button
                                    onClick={toggleSelectAll}
                                    className="hover:text-blue-600 flex items-center"
                                >
                                    {tasks.length > 0 && selectedIds.size === tasks.length ?
                                        <CheckSquare className="w-5 h-5 text-blue-600" /> :
                                        <Square className="w-5 h-5" />
                                    }
                                </button>
                            </th>
                            <th className="px-6 py-4">Status</th>
                            <th className="px-6 py-4">Folder Path</th>
                            <th className="px-6 py-4">Vehicle</th>
                            <th className="px-6 py-4">Case ID Range</th>
                            <th className="px-6 py-4">Videos</th>
                            <th className="px-6 py-4">Date</th>
                            <th className="px-6 py-4">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-ink/[0.08]">
                        {tasks.map((task) => (
                            <tr
                                key={task.id}
                                className={clsx(
                                    "hover:bg-ink/[0.05] transition-colors",
                                    selectedIds.has(task.id) && "bg-blue-100"
                                )}
                            >
                                <td className="px-6 py-4">
                                    <button
                                        onClick={() => toggleSelect(task.id)}
                                        className="hover:text-blue-600"
                                    >
                                        {selectedIds.has(task.id) ?
                                            <CheckSquare className="w-5 h-5 text-blue-600" /> :
                                            <Square className="w-5 h-5 text-text-primary/[0.1]" />
                                        }
                                    </button>
                                </td>
                                <td className="px-6 py-4">
                                    <div className={clsx(
                                        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
                                        task.status === 'completed' ? "bg-emerald-100 text-emerald-700" :
                                        task.status === 'processing' ? "bg-blue-100 text-blue-700" :
                                        task.status === 'failed' ? "bg-rose-100 text-rose-700" :
                                        "bg-surface-overlay text-text-secondary"
                                    )}>
                                        {task.status === 'completed' && <CheckCircle2 className="w-3.5 h-3.5" />}
                                        {task.status === 'processing' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                        {task.status === 'failed' && <AlertCircle className="w-3.5 h-3.5" />}
                                        <span className="capitalize">{task.status === 'completed' ? 'Finished' : task.status}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4 font-mono text-xs text-text-muted max-w-xs truncate" title={task.folder_path}>
                                    {task.folder_path}
                                </td>
                                <td className="px-6 py-4">
                                    {task.brand_models && task.brand_models.length > 0 ? (
                                        <span
                                            className="text-text-secondary max-w-[12rem] inline-block truncate align-bottom"
                                            title={task.brand_models.join('、')}
                                        >
                                            {task.brand_models.join('、')}
                                        </span>
                                    ) : (
                                        <span className="text-text-muted/50">—</span>
                                    )}
                                </td>
                                <td className="px-6 py-4 font-mono text-xs text-text-muted whitespace-nowrap">
                                    {task.case_id_min != null && task.case_id_max != null ? (
                                        task.case_id_min === task.case_id_max
                                            ? task.case_id_min
                                            : `${task.case_id_min} ~ ${task.case_id_max}`
                                    ) : (
                                        <span className="text-text-muted/50">—</span>
                                    )}
                                </td>
                                <td className="px-6 py-4">
                                    {task.completed_videos} / {task.total_videos}
                                </td>
                                <td className="px-6 py-4 text-text-muted">
                                    <div className="flex items-center gap-2">
                                        <Clock className="w-4 h-4 text-text-muted" />
                                        {format(new Date(task.created_at), 'MMM d, yyyy HH:mm')}
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <Link
                                        to={`/results/${task.id}`}
                                        className="text-blue-600 hover:text-blue-800 font-medium hover:underline"
                                    >
                                        View Details
                                    </Link>
                                </td>
                            </tr>
                        ))}
                        {tasks.length === 0 && (
                            <tr>
                                <td colSpan={8} className="text-center py-12 text-text-muted italic">
                                    No history found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
                <div className="p-4 border-t border-ink/[0.08] bg-surface text-xs text-text-muted flex justify-between items-center">
                    <span>Showing {tasks.length} of {total} tasks (Page {currentPage}/{totalPages})</span>
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
        </div>
    );
};

export default History;
