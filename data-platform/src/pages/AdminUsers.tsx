import LightSelect from '../components/LightSelect';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    AlertTriangle,
    Check,
    CalendarClock,
    Clock,
    Download,
    FileSpreadsheet,
    Infinity as InfinityIcon,
    KeyRound,
    Loader2,
    Mail,
    Pencil,
    Plus,
    RefreshCcw,
    Send,
    ShieldCheck,
    Trash2,
    Upload,
    UserPlus,
    Users,
    X,
} from 'lucide-react';

import {
    BulkCommitResponse,
    BulkPreviewResponse,
    BulkPreviewRow,
    UserPublic,
    UserRole,
    AccountApplication,
    adminBulkCommit,
    adminBulkPreview,
    adminCreateUser,
    adminDeleteUser,
    adminDownloadBulkTemplate,
    adminListUsers,
    adminResetUserPassword,
    adminTestSmtp,
    adminUpdateUser,
    adminListApplications,
    adminApproveApplication,
    adminRejectApplication,
    adminGetUsersFocusTime,
    UserFocusTimeStat,
} from '../api';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';

const ROLE_OPTIONS: { value: UserRole; key: string; cls: string }[] = [
    { value: 'admin',   key: 'role_admin',   cls: 'bg-red-100 text-red-700 border-red-200' },
    { value: 'viewer',  key: 'role_viewer',   cls: 'bg-purple-100 text-purple-700 border-purple-200' },
];

const MEMBERSHIP_OPTIONS = ['free','base','plus','pro','trial'] as const;
const membershipLabel = (tier: string|null|undefined) => tier ? ({free:'Free',base:'Base',plus:'Plus',pro:'Pro',max:'Max',trial:'试用会员'} as Record<string,string>)[tier] || tier : '原有账号';

const roleMeta = (role: UserRole, t: (k: string) => string) => {
    const m = ROLE_OPTIONS.find((r) => r.value === role) || ROLE_OPTIONS[1];
    return { label: m.value === 'admin' ? '管理员' : '会员', cls: m.cls };
};

// 到期时间的展示元数据：颜色 + 状态 + 文案。临近到期阈值 7 天。
type ExpiryStatus = 'permanent' | 'normal' | 'soon' | 'expired';
interface ExpiryMeta {
    status: ExpiryStatus;
    text: string;
    cls: string;
    daysLeft: number | null;
}
const expiryMeta = (expires_at: string | null | undefined, t: (k: string, opts?: Record<string, unknown>) => string): ExpiryMeta => {
    if (!expires_at) {
        return {
            status: 'permanent',
            text: t('admin_users_expiry_permanent'),
            cls: 'text-text-muted',
            daysLeft: null,
        };
    }
    const ts = Date.parse(expires_at);
    if (Number.isNaN(ts)) {
        return { status: 'normal', text: expires_at, cls: 'text-text-muted', daysLeft: null };
    }
    const now = Date.now();
    const diffMs = ts - now;
    const daysLeft = Math.ceil(diffMs / 86_400_000);
    const dateText = new Date(ts).toLocaleDateString();
    if (diffMs <= 0) {
        return {
            status: 'expired',
            text: t('admin_users_expiry_expired', { date: dateText }),
            cls: 'text-red-700',
            daysLeft,
        };
    }
    if (daysLeft <= 7) {
        return {
            status: 'soon',
            text: t('admin_users_expiry_soon', { date: dateText, days: String(daysLeft) }),
            cls: 'text-amber-700',
            daysLeft,
        };
    }
    return {
        status: 'normal',
        text: t('admin_users_expiry_until', { date: dateText }),
        cls: 'text-text-secondary',
        daysLeft,
    };
};

// 把 <input type="date"> 的 'YYYY-MM-DD' 转成"当地当天 23:59:59"的 ISO 字符串。
// 取当地末位是为了用户视觉上"那一天还能用"，避免选 12-31 结果中午就过期了。
const dateInputToIso = (dateStr: string): string | null => {
    if (!dateStr) return null;
    const [y, m, d] = dateStr.split('-').map((s) => parseInt(s, 10));
    if (!y || !m || !d) return null;
    const local = new Date(y, m - 1, d, 23, 59, 59, 999);
    if (Number.isNaN(local.getTime())) return null;
    return local.toISOString();
};

// 反向：ISO → 'YYYY-MM-DD'，用于 date input 回显
const isoToDateInput = (iso: string | null | undefined): string => {
    if (!iso) return '';
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return '';
    const d = new Date(t);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// 把 detail 翻译成人话
const errMsg = (detail: any, t: (k: string) => string) => {
    if (typeof detail !== 'string') return t('admin_users_op_failed');
    const map: Record<string, string> = {
        membership_changed_reload: '会员等级已被其他管理员修改，请刷新后重试',
        scenario_access_changed_reload: '场景库权限已被其他管理员修改，请刷新后重试',
        admin_scenario_always_enabled: '管理员始终拥有场景库权限',
        admin_membership_managed_by_role: '管理员权限由角色管理，无需设置会员等级',
        invalid_username: t('admin_users_err_invalid_username'),
        username_taken: t('admin_users_err_username_taken'),
        password_too_long: t('admin_users_err_pwd_too_long'),
        cannot_change_own_role: t('admin_users_err_cannot_change_own_role'),
        cannot_deactivate_self: t('admin_users_err_cannot_deactivate_self'),
        cannot_delete_self: t('admin_users_err_cannot_delete_self'),
        last_active_admin: t('admin_users_err_last_admin'),
        user_not_found: t('admin_users_err_not_found'),
        invalid_expires_days: t('admin_users_err_invalid_expires_days'),
        expires_days_too_large: t('admin_users_err_expires_days_too_large'),
    };
    // 后端 _resolve_expires_at 抛 "invalid_expires_at: <原因>"，截前缀做模糊匹配
    const head = detail.split(':')[0].trim();
    if (head === 'invalid_expires_at') return t('admin_users_err_invalid_expires_at');
    return map[detail] || detail;
};

const AdminUsers: React.FC = () => {
    const { user: me } = useAuth();
    const { t } = useLanguage();

    const [users, setUsers] = useState<UserPublic[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [createOpen, setCreateOpen] = useState(false);
    const [bulkOpen, setBulkOpen] = useState(false);

    // 内联编辑某行的状态
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editDraft, setEditDraft] = useState<{ role: UserRole; display_name: string; is_active: boolean; membership_tier: string; scenario_enabled: boolean }>({
        role: 'viewer',
        membership_tier: '',
        scenario_enabled: false,
        display_name: '',
        is_active: true,
    });
    const [savingRow, setSavingRow] = useState<number | null>(null);

    // 重置密码弹窗
    const [resetTarget, setResetTarget] = useState<UserPublic | null>(null);
    // 改到期时间弹窗
    const [expiryTarget, setExpiryTarget] = useState<UserPublic | null>(null);

    // 待审核申请
    const [applications, setApplications] = useState<AccountApplication[]>([]);
    const [approveTarget, setApproveTarget] = useState<AccountApplication | null>(null);
    const [rejectingId, setRejectingId] = useState<number | null>(null);

    const reloadApplications = useCallback(async () => {
        try {
            const apps = await adminListApplications();
            setApplications(apps);
        } catch {
            // 静默：申请列表加载失败不影响主页面
        }
    }, []);

    // 用户聚焦时长
    const [focusTimeData, setFocusTimeData] = useState<UserFocusTimeStat[]>([]);
    const reloadFocusTime = useCallback(async () => {
        try {
            const data = await adminGetUsersFocusTime();
            setFocusTimeData(data);
        } catch {}
    }, []);

    const reload = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const list = await adminListUsers();
            setUsers(list);
        } catch (err: any) {
            setError(errMsg(err?.response?.data?.detail, t));
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => {
        void reload();
        void reloadApplications();
        void reloadFocusTime();
    }, [reload, reloadApplications, reloadFocusTime]);

    const handleReject = async (id: number) => {
        setRejectingId(id);
        try {
            await adminRejectApplication(id);
            await reloadApplications();
        } catch {
            // ignore
        } finally {
            setRejectingId(null);
        }
    };

    const startEdit = (u: UserPublic) => {
        setEditingId(u.id);
        setEditDraft({
            role: u.role === 'admin' ? 'admin' : 'viewer',
            membership_tier: u.membership_tier || '',
            scenario_enabled: !!u.scenario_enabled,
            display_name: u.display_name || '',
            is_active: u.is_active,
        });
    };

    const cancelEdit = () => {
        setEditingId(null);
    };

    const saveEdit = async (u: UserPublic) => {
        setSavingRow(u.id);
        setError(null);
        try {
            const payload: any = {};
            if (u.role!=="admin" && editDraft.scenario_enabled!==!!u.scenario_enabled){payload.scenario_enabled=editDraft.scenario_enabled;payload.expected_scenario_enabled=!!u.scenario_enabled;}
            if (editDraft.membership_tier && editDraft.membership_tier !== (u.membership_tier || '')) {payload.membership_tier=editDraft.membership_tier;payload.expected_membership_tier=u.membership_tier || null;}
            if (editDraft.role !== (u.role === 'admin' ? 'admin' : 'viewer')) payload.role = editDraft.role;
            if (editDraft.display_name !== (u.display_name || '')) {
                payload.display_name = editDraft.display_name || null;
            }
            if (editDraft.is_active !== u.is_active) payload.is_active = editDraft.is_active;

            // 没改任何字段就别打 PATCH
            if (Object.keys(payload).length > 0) {
                const updated = await adminUpdateUser(u.id, payload);
                setUsers((prev) => prev.map((x) => (x.id === u.id ? updated : x)));
            }
            setEditingId(null);
        } catch (err: any) {
            setError(errMsg(err?.response?.data?.detail, t));
        } finally {
            setSavingRow(null);
        }
    };

    const handleDelete = async (u: UserPublic) => {
        if (me && u.id === me.id) return;
        const confirmText = t('admin_users_confirm_delete', { name: u.username });
        if (!window.confirm(confirmText)) return;
        setError(null);
        try {
            await adminDeleteUser(u.id);
            setUsers((prev) => prev.filter((x) => x.id !== u.id));
        } catch (err: any) {
            setError(errMsg(err?.response?.data?.detail, t));
        }
    };

    const summary = useMemo(() => {
        const total = users.length;
        const byRole = ROLE_OPTIONS.reduce<Record<UserRole, number>>(
            (acc, r) => ({ ...acc, [r.value]: 0 }),
            { admin: 0, analyst: 0, tester: 0, viewer: 0 },
        );
        let active = 0;
        for (const u of users) {
            byRole[u.role === 'admin' ? 'admin' : 'viewer'] += 1;
            if (u.is_active) active += 1;
        }
        return { total, active, byRole };
    }, [users]);

    return (
        <div className="p-6 md:p-8 space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
                        <Users className="w-6 h-6 text-primary" />
                        {t('admin_users_title')}
                    </h1>
                    <p className="text-sm text-text-muted mt-1">
                        {t('admin_users_subtitle')}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={reload}
                        disabled={loading}
                        className="px-3 py-2 text-sm border border-ink/[0.1] rounded-lg text-text-secondary hover:bg-surface-raised/[0.05] flex items-center gap-1.5 disabled:opacity-60"
                    >
                        <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        {t('admin_users_refresh')}
                    </button>
                    <button
                        onClick={() => setBulkOpen(true)}
                        className="px-3 py-2 text-sm border border-ink/[0.1] rounded-lg text-text-secondary hover:bg-surface-raised/[0.05] flex items-center gap-1.5"
                    >
                        <FileSpreadsheet className="w-4 h-4" />
                        {t('admin_users_bulk_open')}
                    </button>
                    <button
                        onClick={() => setCreateOpen(true)}
                        className="px-3 py-2 text-sm bg-primary hover:bg-primary-dark text-text-inverse rounded-lg flex items-center gap-1.5"
                    >
                        <UserPlus className="w-4 h-4" />
                        {t('admin_users_create')}
                    </button>
                </div>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <SummaryCard label={t('admin_users_summary_total')} value={summary.total} />
                <SummaryCard
                    label={t('admin_users_summary_active')}
                    value={summary.active}
                    accent="text-emerald-600"
                />
                {ROLE_OPTIONS.map((r) => (
                    <SummaryCard
                        key={r.value}
                        label={r.value === 'admin' ? '管理员' : '会员'}
                        value={summary.byRole[r.value]}
                    />
                ))}
            </div>

            {error && (
                <div className="text-sm text-red-700 bg-red-100 border border-red-200 rounded-lg px-3 py-2 flex items-center justify-between">
                    <span>{error}</span>
                    <button onClick={() => setError(null)} className="text-red-700 hover:text-red-700">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* 待审核申请 */}
            {applications.length > 0 && (
                <div className="bg-amber-100 border border-amber-200 rounded-xl p-4">
                    <h2 className="text-sm font-semibold text-amber-700 mb-3 flex items-center gap-2">
                        <UserPlus className="w-4 h-4" />
                        {t('admin_pending_title')}
                        <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-700 text-xs">
                            {applications.length}
                        </span>
                    </h2>
                    <div className="space-y-2">
                        {applications.map((app) => (
                            <div key={app.id}
                                className="flex items-center justify-between gap-3 bg-surface-raised/60 rounded-lg px-3 py-2">
                                <div className="min-w-0 flex-1">
                                    <div className="text-sm text-text-primary truncate">{app.username}</div>
                                    <div className="text-xs text-text-muted flex items-center gap-3 mt-0.5">
                                        {app.organization && <span>📍 {app.organization}</span>}
                                        <span>{app.created_at ? new Date(app.created_at).toLocaleString() : '-'}</span>
                                    </div>
                                    {app.apply_reason && (
                                        <div className="text-xs text-text-secondary mt-1 line-clamp-2" title={app.apply_reason}>
                                            💬 {app.apply_reason}
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <button
                                        onClick={() => setApproveTarget(app)}
                                        className="px-3 py-1.5 rounded-lg bg-emerald-600 text-text-inverse text-xs hover:bg-emerald-700 flex items-center gap-1"
                                    >
                                        <Check className="w-3.5 h-3.5" />
                                        {t('admin_pending_approve')}
                                    </button>
                                    <button
                                        onClick={() => handleReject(app.id)}
                                        disabled={rejectingId === app.id}
                                        className="px-3 py-1.5 rounded-lg border border-ink/[0.1] text-text-secondary text-xs hover:bg-ink/[0.05] disabled:opacity-50 flex items-center gap-1"
                                    >
                                        {rejectingId === app.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                                        {t('admin_pending_reject')}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* 用户使用时长统计 */}
            {focusTimeData.length > 0 && (
                <div className="bg-surface-raised border border-ink/[0.08] rounded-xl p-4">
                    <h2 className="text-sm font-semibold text-text-secondary mb-3 flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        {t('admin_users_focus_time_title')}
                    </h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                        {focusTimeData.map((f) => (
                            <div key={f.user_id} className="px-3 py-2 rounded-lg bg-surface border border-ink/[0.06]">
                                <div className="text-xs text-text-muted truncate">{f.display_name || f.username}</div>
                                <div className="text-lg font-semibold text-text-primary">{f.total_display}</div>
                                <div className="text-[10px] text-text-muted">
                                    {f.last_active_at ? new Date(f.last_active_at).toLocaleDateString() : ''}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Table */}
            <div className="bg-surface-raised border border-ink/[0.08] rounded-xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead className="bg-surface text-text-secondary text-xs uppercase tracking-wide">
                            <tr>
                                <th className="px-4 py-3 text-left font-medium">{t('admin_users_col_user')}</th>
                                <th className="px-4 py-3 text-left font-medium">{t('admin_users_col_role')}</th>
                                <th className="px-4 py-3 text-left font-medium">会员等级</th><th className="px-4 py-3 text-left font-medium">场景库权限</th><th className="px-4 py-3 text-left font-medium">注册来源</th>
                                <th className="px-4 py-3 text-left font-medium">{t('admin_users_col_status')}</th>
                                <th className="px-4 py-3 text-left font-medium">{t('admin_users_col_expires')}</th>
                                <th className="px-4 py-3 text-left font-medium">{t('admin_users_col_last_login')}</th>
                                <th className="px-4 py-3 text-left font-medium">{t('admin_users_col_created_at')}</th>
                                <th className="px-4 py-3 text-right font-medium">{t('admin_users_col_actions')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-ink/[0.08]">
                            {loading && users.length === 0 ? (
                                <tr>
                                    <td colSpan={12} className="px-4 py-12 text-center text-text-muted">
                                        <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
                                        {t('loading')}
                                    </td>
                                </tr>
                            ) : users.length === 0 ? (
                                <tr>
                                    <td colSpan={12} className="px-4 py-12 text-center text-text-muted">
                                        {t('admin_users_empty')}
                                    </td>
                                </tr>
                            ) : (
                                users.slice().sort((a,b)=>b.id-a.id).map((u) => {
                                    const isMe = me?.id === u.id;
                                    const isEditing = editingId === u.id;
                                    const role = roleMeta(u.role, t);
                                    return (
                                        <tr key={u.id} className="hover:bg-ink/[0.05]">
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">
                                                        {(u.display_name || u.username).slice(0, 1).toUpperCase()}
                                                    </div>
                                                    <div className="min-w-0">
                                                        {isEditing ? (
                                                            <input
                                                                type="text"
                                                                value={editDraft.display_name}
                                                                onChange={(e) =>
                                                                    setEditDraft((d) => ({ ...d, display_name: e.target.value }))
                                                                }
                                                                placeholder={u.username}
                                                                className="w-40 px-2 py-1 border border-ink/[0.1] rounded text-sm"
                                                            />
                                                        ) : (
                                                            <div className="font-medium text-text-primary flex items-center gap-1.5">
                                                                {u.display_name || u.username}
                                                                {isMe && (
                                                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-overlay text-text-muted border border-ink/[0.08]">
                                                                        {t('admin_users_me')}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        )}
                                                        <div className="text-xs text-text-muted">@{u.username}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                {isEditing && !isMe ? (
                                                    <LightSelect
                                                        value={editDraft.role}
                                                        onChange={(e) =>
                                                            setEditDraft((d) => ({ ...d, role: e.target.value as UserRole }))
                                                        }
                                                        className="px-2 py-1 border border-ink/[0.1] rounded text-sm"
                                                    >
                                                    {ROLE_OPTIONS.map((r) => (
                                                            <option key={r.value} value={r.value}>
                                                                {r.value === 'admin' ? '管理员' : '会员'}
                                                            </option>
                                                        ))}
                                                    </LightSelect>
                                                ) : (
                                                    <span
                                                        className={`text-xs px-2 py-0.5 rounded border font-medium ${role.cls}`}
                                                    >
                                                        {role.label}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                {u.role==='admin' ? <span className="text-text-muted">管理员权限</span> : isEditing ? <LightSelect aria-label="会员等级" value={editDraft.membership_tier} onChange={e=>setEditDraft(d=>({...d,membership_tier:e.target.value}))} className="px-2 py-1 border border-ink/[0.1] rounded text-sm"><option value="" disabled>原有账号</option>{MEMBERSHIP_OPTIONS.map(tier=><option key={tier} value={tier}>{membershipLabel(tier)}</option>)}</LightSelect> : <span className="text-xs px-2 py-1 rounded border border-ink/[0.1]">{membershipLabel(u.membership_tier)}</span>}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                {u.role==='admin' ? <span className="text-text-muted">始终开放</span> : isEditing ? <LightSelect aria-label={`场景库权限 ${u.username}`} value={editDraft.scenario_enabled?'open':'closed'} onChange={e=>setEditDraft(d=>({...d,scenario_enabled:e.target.value==='open'}))} className="px-2 py-1 border border-ink/[0.1] rounded text-sm"><option value="closed">不开放</option><option value="open">开放</option></LightSelect> : <span className={u.scenario_enabled?'font-medium text-ink':'text-text-muted'}>{u.scenario_enabled?'开放':'不开放'}</span>}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap">{u.registration_source==='wechat' ? '微信注册' : '网站 / 后台'}{u.status && u.status!=='active' && <div className="text-xs text-text-muted">{u.status==='pending'?'待审核':u.status}</div>}</td>
                                            <td className="px-4 py-3">
                                                {isEditing && !isMe ? (
                                                    <label className="inline-flex items-center gap-2 text-sm">
                                                        <input
                                                            type="checkbox"
                                                            checked={editDraft.is_active}
                                                            onChange={(e) =>
                                                                setEditDraft((d) => ({ ...d, is_active: e.target.checked }))
                                                            }
                                                        />
                                                        {editDraft.is_active
                                                            ? (t('account_active'))
                                                            : (t('account_inactive'))}
                                                    </label>
                                                ) : (
                                                    <span
                                                        className={`text-xs ${u.is_active ? 'text-emerald-600' : 'text-red-700'}`}
                                                    >
                                                        {u.is_active
                                                            ? (t('account_active'))
                                                            : (t('account_inactive'))}
                                                    </span>
                                                )}
                                                {u.must_reset_pwd && (
                                                    <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">
                                                        {t('admin_users_must_reset')}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-xs">
                                                {(() => {
                                                    const em = expiryMeta(u.expires_at, t);
                                                    return (
                                                        <span className={`inline-flex items-center gap-1 ${em.cls}`}>
                                                            {em.status === 'permanent'
                                                                ? <InfinityIcon className="w-3.5 h-3.5" />
                                                                : <Clock className="w-3.5 h-3.5" />}
                                                            {em.text}
                                                        </span>
                                                    );
                                                })()}
                                            </td>
                                            <td className="px-4 py-3 text-text-secondary text-xs">
                                                {u.last_login_at
                                                    ? new Date(u.last_login_at).toLocaleString()
                                                    : <span className="text-text-muted">—</span>}
                                            </td>
                                            <td className="px-4 py-3 text-text-secondary text-xs">
                                                {u.created_at
                                                    ? new Date(u.created_at).toLocaleString()
                                                    : <span className="text-text-muted">—</span>}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                {isEditing ? (
                                                    <div className="inline-flex items-center gap-1">
                                                        <button
                                                            onClick={() => saveEdit(u)}
                                                            disabled={savingRow === u.id}
                                                            className="px-2 py-1 rounded text-xs bg-primary text-text-inverse hover:bg-primary-dark inline-flex items-center gap-1 disabled:opacity-60"
                                                        >
                                                            {savingRow === u.id ? (
                                                                <Loader2 className="w-3 h-3 animate-spin" />
                                                            ) : (
                                                                <Check className="w-3 h-3" />
                                                            )}
                                                            {t('admin_users_save')}
                                                        </button>
                                                        <button
                                                            onClick={cancelEdit}
                                                            className="px-2 py-1 rounded text-xs border border-ink/[0.1] text-text-secondary hover:bg-surface-raised/[0.05] inline-flex items-center gap-1"
                                                        >
                                                            <X className="w-3 h-3" />
                                                            {t('cancel')}
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="inline-flex items-center gap-1">
                                                        <button
                                                            onClick={() => startEdit(u)}
                                                            className="p-1.5 rounded hover:bg-surface-raised/[0.05] text-text-secondary"
                                                            title={t('admin_users_edit')}
                                                        >
                                                            <Pencil className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button
                                                            onClick={() => setExpiryTarget(u)}
                                                            className="p-1.5 rounded hover:bg-blue-100 text-blue-700"
                                                            title={t('admin_users_set_expiry')}
                                                        >
                                                            <CalendarClock className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button
                                                            onClick={() => setResetTarget(u)}
                                                            className="p-1.5 rounded hover:bg-amber-100 text-amber-600"
                                                            title={t('admin_users_reset_pwd')}
                                                        >
                                                            <KeyRound className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDelete(u)}
                                                            disabled={isMe}
                                                            className="p-1.5 rounded hover:bg-red-100 text-red-700 disabled:opacity-30 disabled:cursor-not-allowed"
                                                            title={
                                                                isMe
                                                                    ? (t('admin_users_cannot_delete_self'))
                                                                    : (t('admin_users_delete'))
                                                            }
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {createOpen && (
                <CreateUserModal
                    onClose={() => setCreateOpen(false)}
                    onCreated={(u) => {
                        setUsers((prev) => [u, ...prev]);
                        setCreateOpen(false);
                    }}
                />
            )}

            {resetTarget && (
                <ResetPasswordModal
                    user={resetTarget}
                    onClose={() => setResetTarget(null)}
                    onDone={() => {
                        setResetTarget(null);
                        // 重置后用户的 must_reset_pwd 不变（后端没强制设回 true，
                        // 但所有 token 已被吊销）。这里刷一次列表保险。
                        void reload();
                    }}
                />
            )}

            {bulkOpen && (
                <BulkProvisionModal
                    onClose={() => setBulkOpen(false)}
                    onDone={() => {
                        // 批量开通完成后强制刷一次列表，让新账号立刻显示
                        void reload();
                    }}
                />
            )}

            {expiryTarget && (
                <ExpiryEditModal
                    user={expiryTarget}
                    onClose={() => setExpiryTarget(null)}
                    onUpdated={(updated) => {
                        setUsers((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
                        setExpiryTarget(null);
                    }}
                />
            )}

            {approveTarget && (
                <ApproveApplicationModal
                    application={approveTarget}
                    onClose={() => setApproveTarget(null)}
                    onApproved={() => {
                        setApproveTarget(null);
                        void reload();
                        void reloadApplications();
                    }}
                />
            )}

        </div>
    );
};

const SummaryCard: React.FC<{ label: string; value: number | string; accent?: string }> = ({
    label,
    value,
    accent,
}) => (
    <div className="bg-surface-raised border border-ink/[0.08] rounded-lg px-4 py-3">
        <div className="text-xs text-text-muted">{label}</div>
        <div className={`text-xl font-semibold mt-0.5 ${accent || 'text-text-primary'}`}>{value}</div>
    </div>
);

// ─────────────────────────────────────────────────────────────────────
// 新建用户弹窗
// ─────────────────────────────────────────────────────────────────────
const CreateUserModal: React.FC<{
    onClose: () => void;
    onCreated: (u: UserPublic) => void;
}> = ({ onClose, onCreated }) => {
    const { t } = useLanguage();
    const [username, setUsername] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState<UserRole>('viewer');
    const [membershipTier,setMembershipTier] = useState<typeof MEMBERSHIP_OPTIONS[number]>('free');
    const [scenarioEnabled,setScenarioEnabled] = useState(false);
    const [expiryMode, setExpiryMode] = useState<'permanent' | 'date'>('permanent');
    const [expiryDate, setExpiryDate] = useState<string>('');  // 'YYYY-MM-DD'
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (submitting) return;
        setError(null);
        if (!username.trim() || password.length < 6) {
            setError(t('admin_users_create_invalid'));
            return;
        }
        if (expiryMode === 'date' && !expiryDate) {
            setError(t('admin_users_expiry_pick_date'));
            return;
        }
        setSubmitting(true);
        try {
            const payload: Parameters<typeof adminCreateUser>[0] = {
                username: username.trim(),
                password,
                role,
                membership_tier: role === 'admin' ? null : membershipTier,
                scenario_enabled: scenarioEnabled,
                display_name: displayName.trim() || null,
                must_reset_pwd: false,
            };
            if (expiryMode === 'date') {
                payload.expires_at = dateInputToIso(expiryDate);
            }
            const u = await adminCreateUser(payload);
            onCreated(u);
        } catch (err: any) {
            setError(errMsg(err?.response?.data?.detail, t));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <ModalShell title={t('admin_users_create_title')} onClose={onClose}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <Field label={t('admin_users_username')} required>
                    <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        autoComplete="off"
                        placeholder={t('admin_users_username_hint')}
                        className="modal-input"
                    />
                </Field>
                <Field label={t('admin_users_display_name')}>
                    <input
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        autoComplete="off"
                        className="modal-input"
                    />
                </Field>
                <Field label={t('admin_users_initial_password')} required>
                    <input
                        type="text"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="new-password"
                        placeholder={t('admin_users_pwd_hint')}
                        className="modal-input font-mono"
                    />
                </Field>
                <Field label={t('admin_users_role')} required>
                    <LightSelect
                        value={role}
                        onChange={(e) => setRole(e.target.value as UserRole)}
                        className="modal-input"
                    >
                        {ROLE_OPTIONS.map((r) => (
                            <option key={r.value} value={r.value}>
                                {r.value === 'admin' ? '管理员' : '会员'}
                            </option>
                        ))}
                    </LightSelect>
                </Field>
                <ProvisionAccessFields role={role} tier={membershipTier} scenario={scenarioEnabled} onTier={setMembershipTier} onScenario={setScenarioEnabled}/>

                <Field label={t('admin_users_expiry_field_label')}>
                    <ExpirySelector
                        mode={expiryMode}
                        date={expiryDate}
                        onChangeMode={setExpiryMode}
                        onChangeDate={setExpiryDate}
                    />
                </Field>

                <div className="text-xs text-text-muted bg-surface border border-ink/[0.08] rounded-lg px-3 py-2 flex gap-2">
                    <ShieldCheck className="w-4 h-4 text-text-muted shrink-0 mt-0.5" />
                    {t('admin_users_create_hint')}
                </div>

                {error && (
                    <div className="text-sm text-red-700 bg-red-100 border border-red-200 rounded-lg px-3 py-2">
                        {error}
                    </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-sm border border-ink/[0.1] rounded-lg text-text-secondary hover:bg-surface-raised/[0.05]"
                    >
                        {t('cancel')}
                    </button>
                    <button
                        type="submit"
                        disabled={submitting}
                        className="px-4 py-2 text-sm bg-primary text-text-inverse rounded-lg hover:bg-primary-dark inline-flex items-center gap-1.5 disabled:opacity-60"
                    >
                        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                        {t('admin_users_create_submit')}
                    </button>
                </div>
            </form>
        </ModalShell>
    );
};

// ─────────────────────────────────────────────────────────────────────
// 重置密码弹窗
// ─────────────────────────────────────────────────────────────────────
const ResetPasswordModal: React.FC<{
    user: UserPublic;
    onClose: () => void;
    onDone: () => void;
}> = ({ user, onClose, onDone }) => {
    const { t } = useLanguage();
    const [pwd, setPwd] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (submitting) return;
        if (pwd.length < 6) {
            setError(t('account_pwd_too_short'));
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            await adminResetUserPassword(user.id, pwd);
            onDone();
        } catch (err: any) {
            setError(errMsg(err?.response?.data?.detail, t));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <ModalShell
            title={t('admin_users_reset_pwd_title', { name: user.username })}
            onClose={onClose}
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="text-sm text-text-secondary">
                    {t('admin_users_reset_pwd_desc')}
                </div>
                <Field label={t('admin_users_new_password')} required>
                    <input
                        type="text"
                        value={pwd}
                        onChange={(e) => setPwd(e.target.value)}
                        autoComplete="new-password"
                        placeholder={t('admin_users_pwd_hint')}
                        className="modal-input font-mono"
                    />
                </Field>

                {error && (
                    <div className="text-sm text-red-700 bg-red-100 border border-red-200 rounded-lg px-3 py-2">
                        {error}
                    </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-sm border border-ink/[0.1] rounded-lg text-text-secondary hover:bg-surface-raised/[0.05]"
                    >
                        {t('cancel')}
                    </button>
                    <button
                        type="submit"
                        disabled={submitting}
                        className="px-4 py-2 text-sm bg-amber-100 text-text-primary rounded-lg hover:bg-amber-600 inline-flex items-center gap-1.5 disabled:opacity-60"
                    >
                        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                        {t('admin_users_reset_pwd_submit')}
                    </button>
                </div>
            </form>
        </ModalShell>
    );
};

// ─────────────────────────────────────────────────────────────────────
// 到期时间选择器（共用：CreateUserModal / ExpiryEditModal / BulkProvisionModal）
//
// 两个 mode：
//   permanent → 永久；提交时单建/批建不传 expires_at；编辑时显式传 clear_expires=true
//   date      → 选择具体到期日；前端用 <input type="date">，提交时转 ISO（当地 23:59:59）
// 这里不直接发请求，由父组件根据 mode/date 自己拼 payload。
// ─────────────────────────────────────────────────────────────────────
const ExpirySelector: React.FC<{
    mode: 'permanent' | 'date';
    date: string;
    minDate?: string;
    onChangeMode: (m: 'permanent' | 'date') => void;
    onChangeDate: (d: string) => void;
}> = ({ mode, date, minDate, onChangeMode, onChangeDate }) => {
    const { t } = useLanguage();
    // 默认 min = 今天，避免选过去的日期出"已过期"
    const todayStr = (() => {
        const d = new Date();
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    })();
    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-1.5 text-sm text-text-secondary cursor-pointer">
                    <input
                        type="radio"
                        name="expiry_mode"
                        checked={mode === 'permanent'}
                        onChange={() => onChangeMode('permanent')}
                    />
                    <InfinityIcon className="w-3.5 h-3.5 text-text-muted" />
                    {t('admin_users_expiry_permanent')}
                </label>
                <label className="inline-flex items-center gap-1.5 text-sm text-text-secondary cursor-pointer">
                    <input
                        type="radio"
                        name="expiry_mode"
                        checked={mode === 'date'}
                        onChange={() => onChangeMode('date')}
                    />
                    <CalendarClock className="w-3.5 h-3.5 text-text-muted" />
                    {t('admin_users_expiry_until_date')}
                </label>
            </div>
            {mode === 'date' && (
                <input
                    type="date"
                    value={date}
                    min={minDate || todayStr}
                    onChange={(e) => onChangeDate(e.target.value)}
                    className="modal-input"
                />
            )}
            <div className="text-xs text-text-muted">
                {mode === 'permanent'
                    ? t('admin_users_expiry_hint_permanent')
                    : t('admin_users_expiry_hint_date')}
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────
// 修改账号到期时间弹窗
// ─────────────────────────────────────────────────────────────────────
const ExpiryEditModal: React.FC<{
    user: UserPublic;
    onClose: () => void;
    onUpdated: (u: UserPublic) => void;
}> = ({ user, onClose, onUpdated }) => {
    const { t } = useLanguage();
    const [mode, setMode] = useState<'permanent' | 'date'>(user.expires_at ? 'date' : 'permanent');
    const [date, setDate] = useState<string>(isoToDateInput(user.expires_at));
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (submitting) return;
        setError(null);
        if (mode === 'date' && !date) {
            setError(t('admin_users_expiry_pick_date'));
            return;
        }
        setSubmitting(true);
        try {
            const payload: Parameters<typeof adminUpdateUser>[1] = {};
            if (mode === 'permanent') {
                // 显式清除：后端会把 expires_at 置 NULL
                payload.clear_expires = true;
            } else {
                payload.expires_at = dateInputToIso(date);
            }
            const updated = await adminUpdateUser(user.id, payload);
            onUpdated(updated);
        } catch (err: any) {
            setError(errMsg(err?.response?.data?.detail, t));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <ModalShell
            title={t('admin_users_expiry_modal_title', { name: user.display_name || user.username })}
            onClose={onClose}
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="text-sm text-text-secondary">
                    {t('admin_users_expiry_modal_desc')}
                </div>
                <ExpirySelector
                    mode={mode}
                    date={date}
                    onChangeMode={setMode}
                    onChangeDate={setDate}
                />

                {error && (
                    <div className="text-sm text-red-700 bg-red-100 border border-red-200 rounded-lg px-3 py-2">
                        {error}
                    </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-sm border border-ink/[0.1] rounded-lg text-text-secondary hover:bg-surface-raised/[0.05]"
                    >
                        {t('cancel')}
                    </button>
                    <button
                        type="submit"
                        disabled={submitting}
                        className="px-4 py-2 text-sm bg-primary text-text-inverse rounded-lg hover:bg-primary-dark inline-flex items-center gap-1.5 disabled:opacity-60"
                    >
                        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        {t('admin_users_save')}
                    </button>
                </div>
            </form>
        </ModalShell>
    );
};

// ─────────────────────────────────────────────────────────────────────
// 通用 Modal 壳
// ─────────────────────────────────────────────────────────────────────
const ModalShell: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({
    title,
    onClose,
    children,
}) => (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-surface-raised rounded-xl shadow-2xl shadow-ink/40 border border-ink/[0.08] w-full max-w-md">
            <div className="px-5 py-3.5 border-b border-ink/[0.08] flex items-center justify-between">
                <h2 className="text-base font-semibold text-text-primary">{title}</h2>
                <button onClick={onClose} className="p-1 rounded hover:bg-surface-raised/[0.05] text-text-muted">
                    <X className="w-4 h-4" />
                </button>
            </div>
            <div className="p-5">{children}</div>
            <style>{`.modal-input{
                width:100%; padding:8px 12px; border:1px solid #4e554b; border-radius:8px;
                font-size:14px; outline:none; transition:border-color .15s, box-shadow .15s;
            }
            .modal-input:focus{ border-color:#0a3a73; box-shadow:0 0 0 3px rgba(10,58,115,.12); }`}</style>
        </div>
    </div>
);

const Field: React.FC<{ label: string; required?: boolean; children: React.ReactNode }> = ({
    label,
    required,
    children,
}) => (
    <div>
        <label className="block text-sm font-medium text-text-secondary mb-1.5">
            {label}
            {required && <span className="text-red-700 ml-0.5">*</span>}
        </label>
        {children}
    </div>
);

// ─────────────────────────────────────────────────────────────────────
// 批量开通弹窗：上传 Excel → 预览 → 提交 → 显示结果
//
// 状态机：
//   idle    → 用户尚未选择文件
//   parsing → 上传给后端解析中
//   preview → 后端解析完，展示每行明细 + commit 按钮
//   committing → 提交中（per-row 创建 + 发邮件，串行）
//   done    → 显示结果汇总；可继续追加 / 关闭
// ─────────────────────────────────────────────────────────────────────
type BulkStage = 'idle' | 'parsing' | 'preview' | 'committing' | 'done';

const BulkProvisionModal: React.FC<{
    onClose: () => void;
    onDone: () => void;
}> = ({ onClose, onDone }) => {
    const { t, language } = useLanguage();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [stage, setStage] = useState<BulkStage>('idle');
    const [error, setError] = useState<string | null>(null);
    const [preview, setPreview] = useState<BulkPreviewResponse | null>(null);
    const [result, setResult] = useState<BulkCommitResponse | null>(null);
    const [smtpTesting, setSmtpTesting] = useState(false);
    const [smtpStatus, setSmtpStatus] = useState<{ ok: boolean; detail: string } | null>(null);

    // 批量统一到期：mode 默认 'days'（最常见用例是"内测7天"），允许切到 'permanent'
    const [batchExpiryMode, setBatchExpiryMode] = useState<'permanent' | 'days'>('permanent');
    const [batchExpiryDays, setBatchExpiryDays] = useState<number>(7);

    // 把后端的 error 码翻译成中文
    const rowErr = (code: string): string => {
        if (!code) return '';
        const map: Record<string, string> = {
            email_required: t('admin_users_bulk_err_email_required'),
            email_invalid: t('admin_users_bulk_err_email_invalid'),
            role_invalid: '角色只能填写会员或管理员',
            membership_tier_invalid: '会员等级只能填写 Free、Base、Plus、Pro 或 Trial',
            scenario_enabled_invalid: '场景库授权只能填写开放或不开放',
            display_name_too_long: t('admin_users_bulk_err_display_too_long'),
            department_too_long: t('admin_users_bulk_err_department_too_long'),
            duplicate_in_file: t('admin_users_bulk_err_duplicate_in_file'),
            too_many_rows: t('admin_users_bulk_err_too_many_rows'),
            expires_days_invalid: t('admin_users_bulk_err_expires_days_invalid'),
            expires_days_too_large: t('admin_users_bulk_err_expires_days_too_large'),
        };
        // 多个错误码以逗号拼接，逐个翻译
        return code.split(',').map((c) => map[c.trim()] || c.trim()).join('; ');
    };

    const parseErr = (detail: any): string => {
        if (typeof detail !== 'string') return t('admin_users_bulk_parse_failed');
        const map: Record<string, string> = {
            empty_file: t('admin_users_bulk_err_empty_file'),
            file_too_large: t('admin_users_bulk_err_file_too_large'),
            xls_not_supported: t('admin_users_bulk_err_xls_not_supported'),
            unsupported_file_type: t('admin_users_bulk_err_unsupported_file_type'),
            failed_to_open_xlsx: t('admin_users_bulk_err_failed_open_xlsx'),
            failed_to_decode_csv: t('admin_users_bulk_err_failed_decode_csv'),
            empty_sheet: t('admin_users_bulk_err_empty_sheet'),
            missing_email_column: t('admin_users_bulk_err_missing_email_column'),
            smtp_not_configured: t('admin_users_bulk_err_smtp_not_configured'),
            too_many_rows: t('admin_users_bulk_err_too_many_rows'),
        };
        // detail 可能形如 "failed_to_open_xlsx: ..."，截前缀做精确匹配再回退
        const head = detail.split(':')[0].trim();
        return map[head] || detail;
    };

    const handleDownloadTemplate = async () => {
        try {
            const blob = await adminDownloadBulkTemplate();
            // 浏览器原生触发下载：blob → objectURL → 模拟点击 → revoke
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'beeeval_users_template.xlsx';
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (err: any) {
            setError(parseErr(err?.response?.data?.detail) || t('admin_users_bulk_template_failed'));
        }
    };

    const handleTestSmtp = async () => {
        if (smtpTesting) return;
        setSmtpTesting(true);
        setSmtpStatus(null);
        try {
            const r = await adminTestSmtp();
            setSmtpStatus({ ok: r.ok, detail: r.detail || '' });
        } catch (err: any) {
            setSmtpStatus({ ok: false, detail: String(err?.message || err) });
        } finally {
            setSmtpTesting(false);
        }
    };

    const handleFilePicked = async (file: File) => {
        setError(null);
        setStage('parsing');
        setPreview(null);
        setResult(null);
        try {
            const data = await adminBulkPreview(file);
            setPreview(data);
            setStage('preview');
        } catch (err: any) {
            setError(parseErr(err?.response?.data?.detail));
            setStage('idle');
        }
    };

    const handleCommit = async () => {
        if (!preview) return;
        // 只把"合法且不存在"的行提交，跳过项 / 错误项不发送
        const sendable = preview.rows.filter((r) => !r.error && !r.exists);
        if (sendable.length === 0) {
            setError(t('admin_users_bulk_nothing_to_commit'));
            return;
        }
        // 校验天数（避免拿到 NaN / 负数把后端 422 出去）
        if (batchExpiryMode === 'days') {
            if (!Number.isInteger(batchExpiryDays) || batchExpiryDays < 1 || batchExpiryDays > 3650) {
                setError(t('admin_users_bulk_err_invalid_expiry_days'));
                return;
            }
        }
        setError(null);
        setStage('committing');
        try {
            const payload: Parameters<typeof adminBulkCommit>[0] = {
                rows: sendable.map((row) => ({
                    email: row.email,
                    display_name: row.display_name,
                    role: row.role,
                    membership_tier: row.membership_tier,
                    scenario_enabled: row.scenario_enabled,
                    department: row.department,
                    // 行级 expires_days 优先于批次默认；preview 阶段后端已校验
                    expires_days: row.expires_days ?? null,
                })),
                email_lang: language === 'en' ? 'en' : 'zh',
            };
            if (batchExpiryMode === 'days') {
                payload.expires_days = batchExpiryDays;
            }
            const r = await adminBulkCommit(payload);
            setResult(r);
            setStage('done');
            onDone();
        } catch (err: any) {
            setError(parseErr(err?.response?.data?.detail) || t('admin_users_bulk_commit_failed'));
            setStage('preview');
        }
    };

    const renderUploadStage = () => (
        <div className="space-y-4">
            <div className="text-sm text-text-secondary">{language==='zh'?'上传 Excel / CSV 名单，分别设置角色、会员等级和场景库授权。提交后自动生成初始密码，并通过邮件告知账号、实际权限与有效期，用户可直接登录。':'Upload an Excel / CSV roster with role, membership and independent scenario access. Users receive credentials, permissions and validity by email and can sign in directly.'}</div>

            <div className="flex flex-wrap items-center gap-2">
                <button
                    onClick={handleDownloadTemplate}
                    className="px-3 py-1.5 text-sm border border-ink/[0.1] rounded-lg text-text-secondary hover:bg-surface-raised/[0.05] inline-flex items-center gap-1.5"
                >
                    <Download className="w-4 h-4" />
                    {t('admin_users_bulk_download_template')}
                </button>
                <button
                    onClick={handleTestSmtp}
                    disabled={smtpTesting}
                    className="px-3 py-1.5 text-sm border border-ink/[0.1] rounded-lg text-text-secondary hover:bg-surface-raised/[0.05] inline-flex items-center gap-1.5 disabled:opacity-60"
                >
                    {smtpTesting
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <Mail className="w-4 h-4" />}
                    {t('admin_users_bulk_test_smtp')}
                </button>
                {smtpStatus && (
                    <span
                        className={`text-xs px-2 py-0.5 rounded border ${
                            smtpStatus.ok
                                ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                                : 'bg-red-100 text-red-700 border-red-200'
                        }`}
                    >
                        {smtpStatus.ok
                            ? t('admin_users_bulk_smtp_ok')
                            : `${t('admin_users_bulk_smtp_failed')}: ${smtpStatus.detail || '—'}`}
                    </span>
                )}
            </div>

            <div
                className="border-2 border-dashed border-ink/[0.1] rounded-xl p-8 flex flex-col items-center justify-center gap-2 hover:border-primary/60 transition cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                    e.preventDefault();
                    const f = e.dataTransfer.files?.[0];
                    if (f) void handleFilePicked(f);
                }}
            >
                {stage === 'parsing' ? (
                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                ) : (
                    <Upload className="w-8 h-8 text-text-muted" />
                )}
                <div className="text-sm text-text-secondary">
                    {stage === 'parsing'
                        ? t('admin_users_bulk_parsing')
                        : t('admin_users_bulk_drop_hint')}
                </div>
                <div className="text-xs text-text-muted">
                    {t('admin_users_bulk_accept_hint')}
                </div>
                <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept=".xlsx,.csv"
                    onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handleFilePicked(f);
                        // 清掉 value，让"上传同一个文件两次"也能触发 onChange
                        e.target.value = '';
                    }}
                />
            </div>
        </div>
    );

    const sendableCount = preview
        ? preview.rows.filter((r) => !r.error && !r.exists).length
        : 0;

    const renderPreviewStage = () => {
        if (!preview) return null;
        return (
            <div className="space-y-4">
                {/* Summary */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <BulkStatCard label={t('admin_users_bulk_stat_total')} value={preview.total} />
                    <BulkStatCard label={t('admin_users_bulk_stat_sendable')} value={sendableCount} accent="text-emerald-700" />
                    <BulkStatCard label={t('admin_users_bulk_stat_existing')} value={preview.existing} accent="text-amber-700" />
                    <BulkStatCard label={t('admin_users_bulk_stat_invalid')} value={preview.invalid} accent="text-red-700" />
                </div>

                {!preview.smtp_configured && (
                    <div className="text-xs text-amber-700 bg-amber-100 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>{t('admin_users_bulk_smtp_not_configured_warn')}</span>
                    </div>
                )}

                {/* 批量到期时间：永久 / N 天 */}
                <div className="border border-ink/[0.08] bg-surface rounded-lg px-3 py-2.5 space-y-2">
                    <div className="text-xs text-text-secondary inline-flex items-center gap-1.5 font-medium">
                        <CalendarClock className="w-3.5 h-3.5 text-text-muted" />
                        {t('admin_users_bulk_expiry_label')}
                    </div>
                    <div className="flex items-center gap-3 flex-wrap text-sm">
                        <label className="inline-flex items-center gap-1.5 text-text-secondary cursor-pointer">
                            <input
                                type="radio"
                                name="bulk_expiry_mode"
                                checked={batchExpiryMode === 'permanent'}
                                onChange={() => setBatchExpiryMode('permanent')}
                            />
                            <InfinityIcon className="w-3.5 h-3.5 text-text-muted" />
                            {t('admin_users_expiry_permanent')}
                        </label>
                        <label className="inline-flex items-center gap-1.5 text-text-secondary cursor-pointer">
                            <input
                                type="radio"
                                name="bulk_expiry_mode"
                                checked={batchExpiryMode === 'days'}
                                onChange={() => setBatchExpiryMode('days')}
                            />
                            <Clock className="w-3.5 h-3.5 text-text-muted" />
                            {t('admin_users_bulk_expiry_days_prefix')}
                            <input
                                type="number"
                                min={1}
                                max={3650}
                                value={batchExpiryDays}
                                disabled={batchExpiryMode !== 'days'}
                                onChange={(e) => setBatchExpiryDays(parseInt(e.target.value, 10) || 0)}
                                onFocus={() => setBatchExpiryMode('days')}
                                className="w-20 px-2 py-1 border border-ink/[0.1] rounded text-sm disabled:opacity-50"
                            />
                            {t('admin_users_bulk_expiry_days_suffix')}
                        </label>
                    </div>
                    <div className="text-xs text-text-muted space-y-0.5">
                        <div>{t('admin_users_bulk_expiry_hint')}</div>
                        <div>{t('admin_users_bulk_expiry_row_override_hint')}</div>
                    </div>
                </div>

                <div className="border border-ink/[0.08] rounded-lg overflow-hidden max-h-[360px] overflow-y-auto">
                    <table className="min-w-full text-xs">
                        <thead className="bg-surface text-text-muted uppercase tracking-wide sticky top-0">
                            <tr>
                                <th className="px-3 py-2 text-left">#</th>
                                <th className="px-3 py-2 text-left">{t('admin_users_bulk_col_email')}</th>
                                <th className="px-3 py-2 text-left">{t('admin_users_bulk_col_name')}</th>
                                <th className="px-3 py-2 text-left">{t('admin_users_bulk_col_role')}</th><th className="px-3 py-2 text-left">会员等级</th><th className="px-3 py-2 text-left">场景库授权</th>
                                <th className="px-3 py-2 text-left">{t('admin_users_bulk_col_dept')}</th>
                                <th className="px-3 py-2 text-left">{t('admin_users_bulk_col_expires_days')}</th>
                                <th className="px-3 py-2 text-left">{t('admin_users_bulk_col_status')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-ink/[0.05]">
                            {preview.rows.map((row, idx) => (
                                <BulkPreviewTableRow
                                    key={`${row.row_no}-${idx}`}
                                    row={row}
                                    t={t}
                                    rowErr={rowErr}
                                />
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    const renderResultStage = () => {
        if (!result) return null;
        return (
            <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <BulkStatCard label={t('admin_users_bulk_stat_total')} value={result.total} />
                    <BulkStatCard label={t('admin_users_bulk_stat_created')} value={result.created} accent="text-emerald-700" />
                    <BulkStatCard label={t('admin_users_bulk_stat_skipped')} value={result.skipped} accent="text-amber-700" />
                    <BulkStatCard label={t('admin_users_bulk_stat_failed')} value={result.failed} accent="text-red-700" />
                </div>

                <div className="border border-ink/[0.08] rounded-lg overflow-hidden max-h-[360px] overflow-y-auto">
                    <table className="min-w-full text-xs">
                        <thead className="bg-surface text-text-muted uppercase tracking-wide sticky top-0">
                            <tr>
                                <th className="px-3 py-2 text-left">{t('admin_users_bulk_col_email')}</th>
                                <th className="px-3 py-2 text-left">{t('admin_users_bulk_col_role')}</th><th className="px-3 py-2 text-left">会员等级</th><th className="px-3 py-2 text-left">场景库授权</th>
                                <th className="px-3 py-2 text-left">{t('admin_users_bulk_col_status')}</th>
                                <th className="px-3 py-2 text-left">{t('admin_users_bulk_col_detail')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-ink/[0.05]">
                            {result.rows.map((row, idx) => (
                                <tr key={`${row.email}-${idx}`}>
                                    <td className="px-3 py-2 text-text-secondary">{row.email}</td>
                                    <td className="px-3 py-2 text-text-secondary">{row.role === 'admin' ? '管理员' : '会员'}</td><td className="px-3 py-2">{row.role==='admin'?'全部权限':membershipLabel(row.membership_tier || 'free')}</td><td className="px-3 py-2">{row.role==='admin'||row.scenario_enabled?'开放':'不开放'}</td>
                                    <td className="px-3 py-2">
                                        <BulkStatusBadge status={row.status} t={t} />
                                    </td>
                                    <td className="px-3 py-2 text-text-muted truncate max-w-[260px]" title={row.detail}>
                                        {row.detail || '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    return (
        <ModalShellWide title={t('admin_users_bulk_title')} onClose={onClose}>
            {error && (
                <div className="mb-3 text-sm text-red-700 bg-red-100 border border-red-200 rounded-lg px-3 py-2 flex items-center justify-between">
                    <span>{error}</span>
                    <button onClick={() => setError(null)} className="text-red-700 hover:text-red-700">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}

            {stage === 'idle' && renderUploadStage()}
            {stage === 'parsing' && renderUploadStage()}
            {(stage === 'preview' || stage === 'committing') && renderPreviewStage()}
            {stage === 'done' && renderResultStage()}

            <div className="flex justify-end gap-2 pt-4 mt-4 border-t border-ink/[0.08]">
                {stage === 'preview' && (
                    <button
                        type="button"
                        onClick={() => {
                            setPreview(null);
                            setStage('idle');
                        }}
                        className="px-4 py-2 text-sm border border-ink/[0.1] rounded-lg text-text-secondary hover:bg-surface-raised/[0.05]"
                    >
                        {t('admin_users_bulk_reupload')}
                    </button>
                )}

                {stage === 'done' && (
                    <button
                        type="button"
                        onClick={() => {
                            setResult(null);
                            setPreview(null);
                            setStage('idle');
                        }}
                        className="px-4 py-2 text-sm border border-ink/[0.1] rounded-lg text-text-secondary hover:bg-surface-raised/[0.05]"
                    >
                        {t('admin_users_bulk_upload_more')}
                    </button>
                )}

                <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 text-sm border border-ink/[0.1] rounded-lg text-text-secondary hover:bg-surface-raised/[0.05]"
                >
                    {stage === 'done' ? t('admin_users_bulk_close') : t('cancel')}
                </button>

                {(stage === 'preview' || stage === 'committing') && (
                    <button
                        type="button"
                        onClick={handleCommit}
                        disabled={stage === 'committing' || sendableCount === 0}
                        className="px-4 py-2 text-sm bg-primary text-text-inverse rounded-lg hover:bg-primary-dark inline-flex items-center gap-1.5 disabled:opacity-60"
                    >
                        {stage === 'committing'
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <Send className="w-4 h-4" />}
                        {t('admin_users_bulk_commit', { count: String(sendableCount) })}
                    </button>
                )}
            </div>
        </ModalShellWide>
    );
};

const BulkStatCard: React.FC<{ label: string; value: number; accent?: string }> = ({ label, value, accent }) => (
    <div className="bg-surface border border-ink/[0.08] rounded-lg px-3 py-2">
        <div className="text-[11px] text-text-muted">{label}</div>
        <div className={`text-lg font-semibold ${accent || 'text-text-primary'}`}>{value}</div>
    </div>
);

const BulkPreviewTableRow: React.FC<{
    row: BulkPreviewRow;
    t: (k: string, opts?: Record<string, unknown>) => string;
    rowErr: (code: string) => string;
}> = ({ row, t, rowErr }) => {
    let status: React.ReactNode;
    if (row.error) {
        status = (
            <span className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-700 border border-red-200">
                {rowErr(row.error)}
            </span>
        );
    } else if (row.exists) {
        status = (
            <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">
                {t('admin_users_bulk_row_exists')}
            </span>
        );
    } else {
        status = (
            <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 border border-emerald-200">
                {t('admin_users_bulk_row_ready')}
            </span>
        );
    }
    return (
        <tr className={row.error ? 'bg-red-100/[0.04]' : row.exists ? 'bg-amber-100/[0.04]' : ''}>
            <td className="px-3 py-2 text-text-muted">{row.row_no}</td>
            <td className="px-3 py-2 text-text-secondary font-mono">{row.email || '—'}</td>
            <td className="px-3 py-2 text-text-secondary">{row.display_name || '—'}</td>
            <td className="px-3 py-2 text-text-secondary">{row.role === 'admin' ? '管理员' : '会员'}</td><td className="px-3 py-2">{row.role==='admin'?'全部权限':membershipLabel(row.membership_tier || 'free')}</td><td className="px-3 py-2">{row.role==='admin'||row.scenario_enabled?'开放':'不开放'}</td>
            <td className="px-3 py-2 text-text-muted">{row.department || '—'}</td>
            <td className="px-3 py-2 text-text-secondary">
                {row.expires_days===0 ? '永久' : row.expires_days != null
                    ? t('admin_users_bulk_expiry_days_cell', { days: String(row.expires_days) })
                    : <span className="text-text-muted">{t('admin_users_bulk_expiry_use_batch')}</span>}
            </td>
            <td className="px-3 py-2">{status}</td>
        </tr>
    );
};

const BulkStatusBadge: React.FC<{ status: string; t: (k: string) => string }> = ({ status, t }) => {
    const map: Record<string, { cls: string; key: string }> = {
        created: {
            cls: 'bg-emerald-100 text-emerald-700 border-emerald-200',
            key: 'admin_users_bulk_status_created',
        },
        created_no_email: {
            cls: 'bg-amber-100 text-amber-700 border-amber-200',
            key: 'admin_users_bulk_status_created_no_email',
        },
        skipped_exists: {
            cls: 'bg-amber-100 text-amber-700 border-amber-200',
            key: 'admin_users_bulk_status_skipped_exists',
        },
        skipped_invalid: {
            cls: 'bg-red-100 text-red-700 border-red-200',
            key: 'admin_users_bulk_status_skipped_invalid',
        },
        failed: {
            cls: 'bg-red-100 text-red-700 border-red-200',
            key: 'admin_users_bulk_status_failed',
        },
    };
    const m = map[status] || { cls: 'bg-surface text-text-secondary border-ink/[0.1]', key: status };
    return (
        <span className={`text-xs px-2 py-0.5 rounded border ${m.cls}`}>{t(m.key) || status}</span>
    );
};

// 宽版 modal 壳，max-w 比默认 sm 大，给批量预览的大表格留位置
const ModalShellWide: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({
    title,
    onClose,
    children,
}) => (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-surface-raised rounded-xl shadow-2xl shadow-ink/40 border border-ink/[0.08] w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="px-5 py-3.5 border-b border-ink/[0.08] flex items-center justify-between">
                <h2 className="text-base font-semibold text-text-primary inline-flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-primary" />
                    {title}
                </h2>
                <button onClick={onClose} className="p-1 rounded hover:bg-surface-raised/[0.05] text-text-muted">
                    <X className="w-4 h-4" />
                </button>
            </div>
            <div className="p-5 overflow-y-auto">{children}</div>
        </div>
    </div>
);

export default AdminUsers;


// ─────────────────────────────────────────────────────────────────────
// 审批申请弹窗：配置角色/显示名/部门/到期，审批通过后生成密码并发邀请邮件
// 用户名锁定为申请邮箱，不可改。
// ─────────────────────────────────────────────────────────────────────
const ApproveApplicationModal: React.FC<{
    application: AccountApplication;
    onClose: () => void;
    onApproved: () => void;
}> = ({ application, onClose, onApproved }) => {
    const { t } = useLanguage();
    const [role, setRole] = useState<UserRole>('viewer');
    const [membershipTier,setMembershipTier] = useState<typeof MEMBERSHIP_OPTIONS[number]>('free');
    const [scenarioEnabled,setScenarioEnabled] = useState(false);
    const [displayName, setDisplayName] = useState('');
    const [department, setDepartment] = useState('');
    const [expiryMode, setExpiryMode] = useState<'permanent' | 'date'>('permanent');
    const [expiryDate, setExpiryDate] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (submitting) return;
        setError(null);
        if (expiryMode === 'date' && !expiryDate) {
            setError(t('admin_users_expiry_pick_date'));
            return;
        }
        setSubmitting(true);
        try {
            const payload: Parameters<typeof adminApproveApplication>[1] = {
                role,
                membership_tier: role === 'admin' ? null : membershipTier,
                scenario_enabled: scenarioEnabled,
                display_name: displayName.trim() || null,
                department: department.trim() || null,
                email_lang: 'zh',
            };
            if (expiryMode === 'date') {
                payload.expires_at = dateInputToIso(expiryDate);
            }
            await adminApproveApplication(application.id, payload);
            onApproved();
        } catch (err: any) {
            setError(errMsg(err?.response?.data?.detail, t));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <ModalShell title={t('admin_pending_approve_title')} onClose={onClose}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <Field label={t('admin_users_username')}>
                    <input type="text" value={application.username} disabled
                        className="modal-input opacity-70 cursor-not-allowed" />
                </Field>
                <Field label={t('admin_users_display_name')}>
                    <input type="text" value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        autoComplete="off" className="modal-input" />
                </Field>
                <Field label={t('admin_pending_department')}>
                    <input type="text" value={department}
                        onChange={(e) => setDepartment(e.target.value)}
                        autoComplete="off" className="modal-input" />
                </Field>
                <Field label={t('admin_users_role')} required>
                    <LightSelect value={role}
                        onChange={(e) => setRole(e.target.value as UserRole)}
                        className="modal-input">
                        {ROLE_OPTIONS.map((r) => (
                            <option key={r.value} value={r.value}>{r.value === 'admin' ? '管理员' : '会员'}</option>
                        ))}
                    </LightSelect>
                </Field>
                <ProvisionAccessFields role={role} tier={membershipTier} scenario={scenarioEnabled} onTier={setMembershipTier} onScenario={setScenarioEnabled}/>
                <Field label={t('admin_users_expiry')}>
                    <ExpirySelector
                        mode={expiryMode}
                        date={expiryDate}
                        onChangeMode={setExpiryMode}
                        onChangeDate={setExpiryDate}
                    />
                </Field>
                <p className="text-xs text-text-muted">{t('admin_pending_approve_hint')}</p>
                {error && (
                    <div className="text-sm text-red-700 bg-red-100 border border-red-200 rounded-lg px-3 py-2">
                        {error}
                    </div>
                )}
                <div className="flex justify-end gap-2 pt-2">
                    <button type="button" onClick={onClose}
                        className="px-4 py-2 rounded-lg border border-ink/[0.1] text-text-secondary text-sm hover:bg-ink/[0.05]">
                        {t('admin_users_cancel')}
                    </button>
                    <button type="submit" disabled={submitting}
                        className="px-4 py-2 rounded-lg bg-emerald-600 text-text-inverse text-sm hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2">
                        {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                        {t('admin_pending_approve_submit')}
                    </button>
                </div>
            </form>
        </ModalShell>
    );
};

const ProvisionAccessFields: React.FC<{role:UserRole;tier:typeof MEMBERSHIP_OPTIONS[number];scenario:boolean;onTier:(value:typeof MEMBERSHIP_OPTIONS[number])=>void;onScenario:(value:boolean)=>void}> = ({role,tier,scenario,onTier,onScenario}) => role==='admin' ? <p className="text-xs text-text-muted">管理员拥有全部会员及场景库权限。</p> : <><Field label="会员等级"><LightSelect aria-label="会员等级" value={tier} onChange={e=>onTier(e.target.value as typeof tier)} className="modal-input">{MEMBERSHIP_OPTIONS.map(v=><option key={v} value={v}>{membershipLabel(v)}</option>)}</LightSelect></Field><Field label="场景库授权"><LightSelect aria-label="场景库授权" value={scenario?'open':'closed'} onChange={e=>onScenario(e.target.value==='open')} className="modal-input"><option value="closed">不开放</option><option value="open">开放</option></LightSelect><p className="text-xs text-text-muted mt-1">独立授权，不随会员等级自动开通。</p></Field></>;
