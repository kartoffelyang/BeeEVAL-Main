import React, { useState } from 'react';
import {
    CalendarClock,
    CheckCircle2,
    Clock,
    Infinity as InfinityIcon,
    KeyRound,
    Loader2,
    ShieldAlert,
    UserCircle,
} from 'lucide-react';

import { changePassword } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';

const ROLE_KEYS: Record<string, string> = {
    admin:   'role_admin',
    analyst: 'role_analyst',
    tester:  'role_tester',
    viewer:  'role_viewer',
};

const Account: React.FC = () => {
    const { user, mustResetPwd, forceRelogin } = useAuth();
    const { t } = useLanguage();

    const [oldPwd, setOldPwd] = useState('');
    const [newPwd, setNewPwd] = useState('');
    const [confirmPwd, setConfirmPwd] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    if (!user) return null;

    const roleKey = ROLE_KEYS[user.role] || ROLE_KEYS.tester;
    const roleText = t(roleKey);

    // 到期时间展示：永久 / 临近 / 已过期 / 普通
    const expiryInfo = (() => {
        if (!user.expires_at) {
            return {
                status: 'permanent' as const,
                text: t('account_expiry_permanent'),
                cls: 'text-text-secondary',
                daysLeft: null as number | null,
            };
        }
        const ts = Date.parse(user.expires_at);
        if (Number.isNaN(ts)) {
            return { status: 'normal' as const, text: user.expires_at, cls: 'text-text-secondary', daysLeft: null };
        }
        const diffMs = ts - Date.now();
        const daysLeft = Math.ceil(diffMs / 86_400_000);
        const dateText = new Date(ts).toLocaleString();
        if (diffMs <= 0) {
            return {
                status: 'expired' as const,
                text: t('account_expiry_expired', { date: dateText }),
                cls: 'text-red-700',
                daysLeft,
            };
        }
        if (daysLeft <= 7) {
            return {
                status: 'soon' as const,
                text: t('account_expiry_soon', { date: dateText, days: String(daysLeft) }),
                cls: 'text-amber-700',
                daysLeft,
            };
        }
        return {
            status: 'normal' as const,
            text: t('account_expiry_until', { date: dateText, days: String(daysLeft) }),
            cls: 'text-text-secondary',
            daysLeft,
        };
    })();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (submitting) return;
        setError(null);

        if (!mustResetPwd && !oldPwd) {
            setError(t('account_old_pwd_required'));
            return;
        }
        if (newPwd.length < 6) {
            setError(t('account_pwd_too_short'));
            return;
        }
        if (newPwd.length > 72) {
            // bcrypt 上限
            setError(t('account_pwd_too_long'));
            return;
        }
        if (newPwd !== confirmPwd) {
            setError(t('account_pwd_mismatch'));
            return;
        }
        if (!mustResetPwd && newPwd === oldPwd) {
            setError(t('account_pwd_same'));
            return;
        }

        setSubmitting(true);
        try {
            await changePassword(newPwd, mustResetPwd ? undefined : oldPwd);
            setSuccess(true);
            // 后端会让所有旧 token 失效（含当前请求自己的），强制走重登
            setTimeout(() => {
                forceRelogin();
            }, 1500);
        } catch (err: any) {
            const detail = err?.response?.data?.detail;
            if (detail === 'invalid_old_password') {
                setError(t('account_old_pwd_wrong'));
            } else if (detail === 'old_password_required') {
                setError(t('account_old_pwd_required'));
            } else if (detail === 'weak_password') {
                setError(t('account_pwd_too_short'));
            } else if (detail === 'password_too_long') {
                setError(t('account_pwd_too_long'));
            } else if (typeof detail === 'string') {
                setError(detail);
            } else {
                setError(t('account_change_failed'));
            }
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
                    <UserCircle className="w-6 h-6 text-primary" />
                    {t('account_title')}
                </h1>
                <p className="text-sm text-text-muted mt-1">
                    {t('account_subtitle')}
                </p>
            </div>

            {/* 必须改密的横幅 */}
            {mustResetPwd && (
                <div className="border border-amber-200 bg-amber-100 rounded-lg p-4 flex gap-3">
                    <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                        <div className="font-medium text-amber-700">
                            {t('account_must_reset_title')}
                        </div>
                        <div className="text-sm text-amber-700 mt-1">
                            {t('account_must_reset_desc')}
                        </div>
                    </div>
                </div>
            )}

            {/* 临近到期 / 已过期 横幅 —— 永久和正常状态不展示横幅，避免视觉噪音 */}
            {expiryInfo.status === 'soon' && (
                <div className="border border-amber-200 bg-amber-100 rounded-lg p-4 flex gap-3">
                    <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                        <div className="font-medium text-amber-700">
                            {t('account_expiry_banner_soon_title', { days: String(expiryInfo.daysLeft ?? 0) })}
                        </div>
                        <div className="text-sm text-amber-700 mt-1">
                            {t('account_expiry_banner_soon_desc')}
                        </div>
                    </div>
                </div>
            )}
            {expiryInfo.status === 'expired' && (
                <div className="border border-red-200 bg-red-100 rounded-lg p-4 flex gap-3">
                    <ShieldAlert className="w-5 h-5 text-red-700 shrink-0 mt-0.5" />
                    <div>
                        <div className="font-medium text-red-700">
                            {t('account_expiry_banner_expired_title')}
                        </div>
                        <div className="text-sm text-red-700 mt-1">
                            {t('account_expiry_banner_expired_desc')}
                        </div>
                    </div>
                </div>
            )}

            {/* 个人信息 */}
            <div className="bg-surface-raised rounded-xl border border-ink/[0.08] shadow-sm p-6">
                <h2 className="text-base font-semibold text-text-primary mb-4">
                    {t('account_profile')}
                </h2>
                <dl className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                        <dt className="text-text-muted">{t('account_username')}</dt>
                        <dd className="text-text-primary mt-0.5 font-medium">@{user.username}</dd>
                    </div>
                    <div>
                        <dt className="text-text-muted">{t('account_display_name')}</dt>
                        <dd className="text-text-primary mt-0.5 font-medium">
                            {user.display_name || <span className="text-text-muted">—</span>}
                        </dd>
                    </div>
                    <div>
                        <dt className="text-text-muted">{t('account_role')}</dt>
                        <dd className="text-text-primary mt-0.5 font-medium">{roleText}</dd>
                    </div>
                    <div>
                        <dt className="text-text-muted">{t('account_status')}</dt>
                        <dd className="mt-0.5 font-medium">
                            {user.is_active ? (
                                <span className="text-emerald-600">{t('account_active')}</span>
                            ) : (
                                <span className="text-red-700">{t('account_inactive')}</span>
                            )}
                        </dd>
                    </div>
                    <div>
                        <dt className="text-text-muted">{t('account_created_at')}</dt>
                        <dd className="text-text-primary mt-0.5">
                            {new Date(user.created_at).toLocaleString()}
                        </dd>
                    </div>
                    <div>
                        <dt className="text-text-muted">{t('account_last_login')}</dt>
                        <dd className="text-text-primary mt-0.5">
                            {user.last_login_at
                                ? new Date(user.last_login_at).toLocaleString()
                                : <span className="text-text-muted">—</span>}
                        </dd>
                    </div>
                    <div className="md:col-span-2">
                        <dt className="text-text-muted">{t('account_expiry_label')}</dt>
                        <dd className={`mt-0.5 font-medium inline-flex items-center gap-1.5 ${expiryInfo.cls}`}>
                            {expiryInfo.status === 'permanent'
                                ? <InfinityIcon className="w-4 h-4" />
                                : <CalendarClock className="w-4 h-4" />}
                            {expiryInfo.text}
                        </dd>
                    </div>
                </dl>
            </div>

            {/* 修改密码 */}
            <div className="bg-surface-raised rounded-xl border border-ink/[0.08] shadow-sm p-6">
                <h2 className="text-base font-semibold text-text-primary mb-4 flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-primary" />
                    {t('account_change_password')}
                </h2>

                {success ? (
                    <div className="flex items-center gap-2 text-emerald-700 bg-emerald-100 border border-emerald-200 rounded-lg px-4 py-3">
                        <CheckCircle2 className="w-5 h-5" />
                        <span className="text-sm">
                            {t('account_change_success')}
                        </span>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
                        {!mustResetPwd && (
                            <div>
                                <label className="block text-sm font-medium text-text-secondary mb-1.5">
                                    {t('account_old_password')}
                                </label>
                                <input
                                    type="password"
                                    value={oldPwd}
                                    onChange={(e) => setOldPwd(e.target.value)}
                                    autoComplete="current-password"
                                    disabled={submitting}
                                    className="w-full px-3 py-2 border border-ink/[0.1] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:opacity-50"
                                />
                            </div>
                        )}
                        <div>
                            <label className="block text-sm font-medium text-text-secondary mb-1.5">
                                {t('account_new_password')}
                                <span className="text-xs text-text-muted ml-2">
                                    {t('account_pwd_hint')}
                                </span>
                            </label>
                            <input
                                type="password"
                                value={newPwd}
                                onChange={(e) => setNewPwd(e.target.value)}
                                autoComplete="new-password"
                                disabled={submitting}
                                className="w-full px-3 py-2 border border-ink/[0.1] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:opacity-50"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-text-secondary mb-1.5">
                                {t('account_confirm_password')}
                            </label>
                            <input
                                type="password"
                                value={confirmPwd}
                                onChange={(e) => setConfirmPwd(e.target.value)}
                                autoComplete="new-password"
                                disabled={submitting}
                                className="w-full px-3 py-2 border border-ink/[0.1] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:opacity-50"
                            />
                        </div>

                        {error && (
                            <div className="text-sm text-red-700 bg-red-100 border border-red-200 rounded-lg px-3 py-2">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={submitting}
                            className="bg-primary hover:bg-primary-dark text-text-inverse font-medium px-5 py-2 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                            {submitting
                                ? (t('account_submitting'))
                                : (t('account_submit'))}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
};

export default Account;
