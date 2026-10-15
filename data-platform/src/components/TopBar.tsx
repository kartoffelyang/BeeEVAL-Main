import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, LogOut, ShieldAlert, User as UserIcon, UserCog } from 'lucide-react';

import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTranslation } from 'react-i18next';

const ROLE_LABEL: Record<string, { key: string; cls: string }> = {
    admin:   { key: 'role_admin',   cls: 'bg-red-100 text-red-700 border-red-200' },
    analyst: { key: 'role_analyst', cls: 'bg-blue-100 text-blue-700 border-blue-200' },
    tester:  { key: 'role_tester',  cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    viewer:  { key: 'role_viewer',  cls: 'bg-purple-100 text-purple-700 border-purple-200' },
};

const TopBar: React.FC = () => {
    const { user, logout, mustResetPwd } = useAuth();
    const { t, language, toggleLanguage } = useLanguage();
    const { t: ti18n } = useTranslation();
    const [open, setOpen] = useState(false);
    const popRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!open) return;
        const onDoc = (e: MouseEvent) => {
            if (popRef.current && !popRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [open]);

    if (!user) return null;

    const initial = (user.display_name || user.username).slice(0, 1).toUpperCase();
    const roleMeta = ROLE_LABEL[user.role] || ROLE_LABEL.tester;
    const roleText = ti18n(roleMeta.key);

    return (
        <div className="h-12 shrink-0 bg-surface-raised border-b border-ink/[0.08] flex items-center justify-end px-6 gap-4">
            {mustResetPwd && (
                <Link
                    to="/account"
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border border-amber-200 bg-amber-100 text-amber-700 hover:bg-amber-100"
                >
                    <ShieldAlert className="w-3.5 h-3.5" />
                    {t('topbar_must_reset')}
                </Link>
            )}

            <button
                onClick={toggleLanguage}
                className="px-2.5 py-1 text-xs font-medium rounded-md border border-ink/[0.1] text-text-secondary hover:text-text-primary hover:bg-ink/[0.05] transition-colors"
            >
                {language === 'zh' ? 'En' : '中文'}
            </button>

            <div className="relative" ref={popRef}>
                <button
                    onClick={() => setOpen((v) => !v)}
                    className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-ink/[0.05] text-sm"
                >
                    <div className="w-7 h-7 rounded-full bg-primary text-text-inverse flex items-center justify-center text-xs font-semibold">
                        {initial}
                    </div>
                    <span className="font-medium text-text-secondary max-w-[120px] truncate">
                        {user.display_name || user.username}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${roleMeta.cls}`}>
                        {roleText}
                    </span>
                    <ChevronDown className="w-3.5 h-3.5 text-text-muted" />
                </button>

                {open && (
                    <div className="absolute right-0 top-full mt-1 w-56 bg-surface-overlay border border-ink/[0.1] rounded-lg shadow-xl shadow-ink/40 overflow-hidden z-30">
                        <div className="px-3 py-2.5 border-b border-ink/[0.08]">
                            <div className="text-sm font-medium text-text-primary truncate">
                                {user.display_name || user.username}
                            </div>
                            <div className="text-xs text-text-muted mt-0.5 truncate">
                                @{user.username}
                            </div>
                        </div>

                        <Link
                            to="/account"
                            onClick={() => setOpen(false)}
                            className="flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:bg-ink/[0.05] hover:text-text-primary"
                        >
                            <UserIcon className="w-4 h-4 text-text-muted" />
                            {t('topbar_my_account')}
                        </Link>

                        {user.role === 'admin' && (
                            <Link
                                to="/admin/users"
                                onClick={() => setOpen(false)}
                                className="flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:bg-ink/[0.05] hover:text-text-primary"
                            >
                                <UserCog className="w-4 h-4 text-text-muted" />
                                {t('topbar_admin_users')}
                            </Link>
                        )}

                        <button
                            onClick={() => {
                                setOpen(false);
                                void logout();
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-700 hover:bg-red-100 border-t border-ink/[0.08]"
                        >
                            <LogOut className="w-4 h-4" />
                            {t('topbar_logout')}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default TopBar;
