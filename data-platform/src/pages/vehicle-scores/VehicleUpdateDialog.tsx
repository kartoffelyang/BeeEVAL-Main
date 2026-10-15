import React, { useEffect, useState } from 'react';
import { X, RefreshCw, Trash2, CheckCircle2, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';
import {
    listMimoVehicles,
    recomputeVehicles,
    removeVehicleFromBoard,
    type MimoVehicleItem,
} from '../../api';
import { useMetricsTranslation } from '../../hooks/useMetricsTranslation';

interface Props {
    onClose: () => void;
    onDone: () => void;   // 重算/移除后回调，父组件刷新列表
}

const keyOf = (v: MimoVehicleItem) => `${v.brand_model}|||${v.system_version ?? ''}`;

// 管理员「更新评分」弹窗：列出所有有 MiMo 数据的车，勾选后重算（进板块）；
// 已在板块的车可单独移除。可见判据 = 有重算缓存。
const VehicleUpdateDialog: React.FC<Props> = ({ onClose, onDone }) => {
    const { tv } = useMetricsTranslation();
    const [items, setItems] = useState<MimoVehicleItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [checked, setChecked] = useState<Set<string>>(new Set());
    const [busy, setBusy] = useState(false);

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const list = await listMimoVehicles();
            setItems(list);
        } catch (e: any) {
            setError(e?.message || '加载失败');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const toggle = (k: string) => {
        setChecked(prev => {
            const next = new Set(prev);
            next.has(k) ? next.delete(k) : next.add(k);
            return next;
        });
    };

    const handleRecompute = async () => {
        const picked = items.filter(v => checked.has(keyOf(v)));
        if (picked.length === 0) return;
        setBusy(true);
        try {
            const res = await recomputeVehicles(picked.map(v => ({
                brand_model: v.brand_model,
                system_version: v.system_version,
            })));
            await load();
            setChecked(new Set());
            onDone();
            alert(`已更新 ${res.count} 台车${res.failed.length ? `，${res.failed.length} 台失败` : ''}`);
        } catch (e: any) {
            alert(`更新失败：${e?.message || e}`);
        } finally {
            setBusy(false);
        }
    };

    const handleRemove = async (v: MimoVehicleItem) => {
        if (!confirm(`确定把「${v.brand_model} ${v.system_version || ''}」撤出评分板块？\n（仅删除评分缓存，原始分析数据保留，可再次更新恢复）`)) return;
        setBusy(true);
        try {
            await removeVehicleFromBoard(v.brand_model, v.system_version);
            await load();
            onDone();
        } catch (e: any) {
            alert(`移除失败：${e?.message || e}`);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={onClose}
        >
            <div
                className="bg-surface-raised border border-ink/[0.1] rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {/* 头 */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-ink/[0.08]">
                    <div>
                        <h3 className="font-bold text-text-primary">更新评分</h3>
                        <p className="text-xs text-text-muted mt-0.5">
                            勾选数据完整的车型并更新，被更新的车才会进入评分板块（对用户可见）
                        </p>
                    </div>
                    <button onClick={onClose} className="text-text-muted hover:text-text-primary">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* 列表 */}
                <div className="flex-1 overflow-y-auto px-5 py-3">
                    {loading ? (
                        <div className="text-sm text-text-muted py-8 text-center">加载中…</div>
                    ) : error ? (
                        <div className="text-sm text-rose-700 py-8 text-center">{error}</div>
                    ) : items.length === 0 ? (
                        <div className="text-sm text-text-muted py-8 text-center">暂无有 MiMo 数据的车型</div>
                    ) : (
                        <div className="space-y-2">
                            {items.map(v => {
                                const k = keyOf(v);
                                const full = v.domain_count >= 6;
                                return (
                                    <div key={k} className="flex items-center gap-3 p-3 rounded-lg border border-ink/[0.06] hover:border-ink/[0.12]">
                                        <input
                                            type="checkbox"
                                            checked={checked.has(k)}
                                            onChange={() => toggle(k)}
                                            className="w-4 h-4 accent-secondary"
                                        />
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium text-text-primary">
                                                {tv(v.brand_model)}
                                                {v.system_version && <span className="text-text-muted ml-1">V{v.system_version}</span>}
                                            </div>
                                            <div className="flex items-center gap-3 text-xs mt-0.5">
                                                <span className="text-text-muted">{v.mimo_sample_count} 样本</span>
                                                <span className={clsx('flex items-center gap-1',
                                                    full ? 'text-emerald-700' : 'text-amber-700')}>
                                                    {full
                                                        ? <><CheckCircle2 className="w-3 h-3" />6/6 域齐全</>
                                                        : <><AlertTriangle className="w-3 h-3" />{v.domain_count}/6 域（数据不全）</>}
                                                </span>
                                                {v.in_board && <span className="text-secondary">· 已在板块</span>}
                                            </div>
                                        </div>
                                        {v.in_board && (
                                            <button
                                                onClick={() => handleRemove(v)}
                                                disabled={busy}
                                                className="flex items-center gap-1 text-xs text-rose-700 hover:text-rose-700 disabled:opacity-50"
                                                title="撤出评分板块"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />移除
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* 底 */}
                <div className="flex items-center justify-between px-5 py-4 border-t border-ink/[0.08]">
                    <span className="text-xs text-text-muted">已勾选 {checked.size} 台</span>
                    <div className="flex gap-2">
                        <button
                            onClick={onClose}
                            className="px-3 py-1.5 text-sm rounded-lg border border-ink/[0.12] text-text-muted hover:text-text-primary"
                        >
                            取消
                        </button>
                        <button
                            onClick={handleRecompute}
                            disabled={busy || checked.size === 0}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-secondary text-text-inverse hover:bg-secondary/90 disabled:opacity-50"
                        >
                            <RefreshCw className={clsx('w-4 h-4', busy && 'animate-spin')} />
                            更新勾选的车
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default VehicleUpdateDialog;
