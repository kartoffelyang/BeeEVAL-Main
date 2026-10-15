import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, KeyRound, Loader2, LogIn, User, Mail, X, CheckCircle2 } from 'lucide-react';

import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { applyForAccount } from '../api';

interface LocationState {
    from?: string;
    /**
     * 'forbidden_role'：被路由守卫拦下来（角色不足）
     * 其它字符串：来自后端 401 的 detail（如 'account_expired'），用于给本页错误条预置文案
     */
    reason?: 'forbidden_role' | string;
    attemptedPath?: string;
}

const Login: React.FC = () => {
    const { t, language, toggleLanguage } = useLanguage();
    const { login, isAuthed, mustResetPwd, bootstrapping } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const locState = location.state as LocationState | null;
    const from = locState?.from || '/';
    const forbiddenNotice =
        locState?.reason === 'forbidden_role'
            ? t('auth_forbidden_redirect_notice')
            : null;

    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPwd, setShowPwd] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showApply, setShowApply] = useState(false);


    useEffect(() => {
        if (!bootstrapping && isAuthed && !mustResetPwd) {
            navigate(from, { replace: true });
        }
    }, [bootstrapping, isAuthed, mustResetPwd, navigate, from]);

    // 会话期间被踢回登录页（如 require_user 判账号过期），
    // 把后端 detail 翻译成提示，免得用户对着空白登录页一脸懵。
    useEffect(() => {
        const reason = locState?.reason;
        if (!reason || reason === 'forbidden_role') return;
        if (reason === 'account_expired') {
            setError(t('login_account_expired'));
        } else if (reason === 'user_inactive') {
            setError(t('login_user_inactive'));
        }
        // 其它 detail 字符串就别强加提示了，避免泄露后端实现细节
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [locState?.reason]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (submitting) return;
        setError(null);
        const u = username.trim();
        if (!u || !password) {
            setError(t('login_required_fields'));
            return;
        }
        setSubmitting(true);
        try {
            const user = await login(u, password);
            if (user.must_reset_pwd) {
                navigate('/account', { replace: true, state: { from } });
            } else {
                navigate(from, { replace: true });
            }
        } catch (err: any) {
            const detail = err?.response?.data?.detail;
            if (detail === 'invalid_credentials') {
                setError(t('login_invalid_credentials'));
            } else if (detail === 'user_inactive') {
                setError(t('login_user_inactive'));
            } else if (detail === 'account_expired') {
                setError(t('login_account_expired'));
            } else if (typeof detail === 'string') {
                setError(detail);
            } else {
                setError(t('login_failed'));
            }
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="login-layout font-sans">
            <button
                onClick={toggleLanguage}
                className="absolute top-4 right-4 px-2.5 py-1 text-xs font-medium rounded-md border border-ink/[0.1] text-text-secondary hover:text-text-primary hover:bg-ink/[0.05] transition-colors"
            >
                {language === 'zh' ? 'En' : '中文'}
            </button>
            <div className="login-story">
                <img src={`${import.meta.env.BASE_URL}beeeval-logo.png`} alt="BeeEVAL 蜜蜂智评" />
                <div className="landing-eyebrow">BEEEVAL / INTELLIGENCE WORKSPACE</div>
                <h1>{language === 'zh' ? <>以证据，<br />理解座舱智能。</> : <>Understand intelligence.<br />Start with evidence.</>}</h1>
                <p>{language === 'zh' ? '连接评测数据、任务表现与测试过程，为产品定义和持续迭代提供依据。' : 'Connect evaluation data, task outcomes and test evidence to support product decisions.'}</p>
                <div className="login-evidence"><span>{language === 'zh' ? '竞品对标' : 'Benchmark'}</span><span>{language === 'zh' ? '测试验收' : 'Validation'}</span><span>{language === 'zh' ? '研究报告' : 'Research'}</span></div>
            </div>
            <div className="login-panel overflow-hidden">
                {/* Header */}
                <div className="px-8 py-8 flex flex-col items-center gap-3 border-b border-ink/[0.08]">
                    <h2 className="text-xl font-medium text-text-primary">{language === 'zh' ? '登录工作台' : 'Sign in to your workspace'}</h2>
                    <p className="text-sm text-text-muted">
                        {t('login_subtitle')}
                    </p>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-8 space-y-5">
                    <div>
                        <label htmlFor="login-username" className="block text-sm font-medium text-text-secondary mb-1.5">
                            {t('login_username')}
                        </label>
                        <div className="relative">
                            <User className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                                id="login-username"
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                autoComplete="username"
                                disabled={submitting}
                                className="w-full pl-10 pr-3 py-2.5 bg-surface border border-ink/[0.1] rounded-lg text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:opacity-50"
                                placeholder={t('login_username_placeholder')}
                            />
                        </div>
                    </div>

                    <div>
                        <label htmlFor="login-password" className="block text-sm font-medium text-text-secondary mb-1.5">
                            {t('login_password')}
                        </label>
                        <div className="relative">
                            <KeyRound className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                                id="login-password"
                                type={showPwd ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                autoComplete="current-password"
                                disabled={submitting}
                                className="w-full pl-10 pr-10 py-2.5 bg-surface border border-ink/[0.1] rounded-lg text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:opacity-50"
                                placeholder={t('login_password_placeholder')}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPwd((v) => !v)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                                aria-label={showPwd ? (language === 'zh' ? '隐藏密码' : 'Hide password') : (language === 'zh' ? '显示密码' : 'Show password')}
                            >
                                {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>

                    {forbiddenNotice && (
                        <div className="text-sm text-amber-700 bg-amber-100 border border-amber-200 rounded-lg px-3 py-2">
                            {forbiddenNotice}
                        </div>
                    )}

                    {error && (
                        <div role="alert" className="text-sm text-red-700 bg-red-100 border border-red-200 rounded-lg px-3 py-2">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={submitting}
                        className="w-full bg-primary hover:bg-primary-dark text-text-inverse font-medium py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {submitting ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <LogIn className="w-4 h-4" />
                        )}
                        {submitting
                            ? (t('login_submitting'))
                            : (t('login_submit'))}
                    </button>

                    <p className="text-xs text-text-muted text-center pt-2">
                        {t('login_admin_hint')}
                    </p>

                    <div className="text-center">
                        <button
                            type="button"
                            onClick={() => setShowApply(true)}
                            className="text-xs text-primary hover:underline"
                        >
                            {t('apply_account_entry')}
                        </button>
                    </div>
                </form>
            </div>

            {showApply && <ApplyModal onClose={() => setShowApply(false)} t={t} />}
        </div>
    );
};

// ─── 申请账号弹窗 ───────────────────────────────────────────────
const ApplyModal: React.FC<{ onClose: () => void; t: (k: string) => string }> = ({ onClose, t }) => {
    const [email, setEmail] = useState('');
    const [organization, setOrganization] = useState('');
    const [reason, setReason] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [done, setDone] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const submit = async () => {
        const e = email.trim().toLowerCase();
        if (!e || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) {
            setErr(t('apply_invalid_email'));
            return;
        }
        if (!organization.trim()) {
            setErr(t('apply_org_required'));
            return;
        }
        if (!reason.trim()) {
            setErr(t('apply_reason_required'));
            return;
        }
        setSubmitting(true);
        setErr(null);
        try {
            await applyForAccount(e, organization.trim(), reason.trim());
            setDone(true);
        } catch (ex: any) {
            const detail = ex?.response?.data?.detail;
            if (detail === 'already_registered') setErr(t('apply_already_registered'));
            else if (detail === 'already_pending') setErr(t('apply_already_pending'));
            else if (detail === 'invalid_email') setErr(t('apply_invalid_email'));
            else setErr(t('apply_failed'));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
            <div className="bg-surface-raised border border-ink/[0.1] rounded-xl max-w-sm w-full p-6 max-h-[90dvh] overflow-y-auto"
                role="dialog" aria-modal="true" aria-labelledby="apply-account-title"
                onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
                onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <h3 id="apply-account-title" className="text-text-primary font-semibold">{t('apply_account_title')}</h3>
                    <button onClick={onClose} aria-label={t('apply_ok')} className="text-text-muted hover:text-text-primary">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {done ? (
                    <div className="text-center py-4">
                        <CheckCircle2 className="w-10 h-10 text-emerald-700 mx-auto mb-3" />
                        <p className="text-sm text-text-secondary">{t('apply_success')}</p>
                        <button onClick={onClose}
                            className="mt-4 px-4 py-2 rounded-lg bg-primary text-text-inverse text-sm">
                            {t('apply_ok')}
                        </button>
                    </div>
                ) : (
                    <>
                        <p className="text-xs text-text-muted mb-3">{t('apply_hint')}</p>
                        <label htmlFor="apply-email" className="block text-xs text-text-secondary mb-2">{t('apply_email_placeholder')}</label>
                        <div className="relative mb-3">
                            <Mail className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                                id="apply-email" autoFocus
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                disabled={submitting}
                                className="w-full pl-10 pr-3 py-2.5 bg-surface border border-ink/[0.1] rounded-lg text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                                placeholder={t('apply_email_placeholder')}
                            />
                        </div>
                        <div className="mb-3">
                            <label htmlFor="apply-organization" className="block text-xs text-text-secondary mb-2">{t('apply_org_placeholder')}</label>
                            <input id="apply-organization"
                                type="text"
                                value={organization}
                                onChange={(e) => setOrganization(e.target.value)}
                                disabled={submitting}
                                className="w-full px-3 py-2.5 bg-surface border border-ink/[0.1] rounded-lg text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                                placeholder={t('apply_org_placeholder')}
                            />
                        </div>
                        <div className="mb-3">
                            <label htmlFor="apply-reason" className="block text-xs text-text-secondary mb-2">{t('apply_reason_placeholder')}</label>
                            <textarea id="apply-reason"
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                disabled={submitting}
                                rows={3}
                                className="w-full px-3 py-2.5 bg-surface border border-ink/[0.1] rounded-lg text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
                                placeholder={t('apply_reason_placeholder')}
                            />
                        </div>
                        {err && (
                            <div className="text-xs text-red-700 bg-red-100 border border-red-200 rounded-lg px-3 py-2 mb-3">
                                {err}
                            </div>
                        )}
                        <button onClick={submit} disabled={submitting}
                            className="w-full bg-primary hover:bg-primary-dark text-text-inverse font-medium py-2.5 rounded-lg flex items-center justify-center gap-2 disabled:opacity-60">
                            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                            {t('apply_submit')}
                        </button>
                    </>
                )}
            </div>
        </div>
    );
};

export default Login;
