import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
    LayoutDashboard, History, Settings, Database, ChevronLeft, ChevronRight,
    Library, GitCompareArrows, HardDrive, FlaskConical, Users, MessageSquareText,
    FileText, Network, Home, Shield, LogOut, User as UserIcon, Languages, ChevronDown, Award, ClipboardCheck, Wrench,
} from 'lucide-react';
import clsx from 'clsx';
import { useLanguage } from '../contexts/LanguageContext';
import { UserRole } from '../api';
import { useAuth } from '../contexts/AuthContext';

interface NavLinkDef {
    path: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    roles?: UserRole[];
}

const ROLE_LABEL: Record<string, { key: string; cls: string }> = {
    admin: { key: 'role_admin', cls: 'bg-red-100 text-red-700 border-red-200' },
    analyst: { key: 'role_analyst', cls: 'bg-blue-100 text-blue-700 border-blue-200' },
    tester: { key: 'role_tester', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    viewer: { key: 'role_viewer', cls: 'bg-purple-100 text-purple-700 border-purple-200' },
};

const Sidebar = () => {
    const location = useLocation();
    // 默认折叠：图标轨，悬停显示名称
    const [collapsed, setCollapsed] = useState(false);
    // 管理组展开态（仅展开态侧边栏下可折叠）
    const [adminOpen, setAdminOpen] = useState(false);
    const { t, language, toggleLanguage } = useLanguage();
    const { user, logout } = useAuth();

    const role = useMemo(() => String(user?.role ?? '').toLowerCase() as UserRole, [user]);
    const filterByRole = (l: NavLinkDef) => {
        if (!l.roles) return true;
        return l.roles.includes(role);
    };

    // 主导航：对外开放的核心板块
    const mainLinks = useMemo<NavLinkDef[]>(() => {
        const all: NavLinkDef[] = [
            { path: '/', label: language === 'zh' ? '查用例' : 'Find cases', icon: Library, roles: ['admin', 'analyst', 'viewer', 'tester'] },
            { path: '/benchmark', label: language === 'zh' ? '标杆分析' : 'Benchmark', icon: Award, roles: ['admin', 'analyst', 'viewer', 'tester'] },
            { path: '/benchmark?tab=compare', label: language === 'zh' ? '用例对比' : 'Case comparison', icon: GitCompareArrows, roles: ['admin', 'analyst', 'viewer', 'tester'] },
            { path: '/acceptance-testing', label: language === 'zh' ? '验收分析' : 'Acceptance', icon: ClipboardCheck, roles: ['admin', 'analyst', 'viewer', 'tester'] },
        ];
        if (!user) return [];
        return all.filter(filterByRole);
    }, [t, user, role, language]);

    // 管理组：其余全部板块归到一级「管理」目录下
    const adminLinks = useMemo<NavLinkDef[]>(() => {
        const all: NavLinkDef[] = [
            { path: '/console', label: t('console'), icon: LayoutDashboard, roles: ['admin', 'analyst'] },
            { path: '/database', label: t('database'), icon: Database, roles: ['admin', 'analyst'] },
            { path: '/history', label: t('history'), icon: History, roles: ['admin', 'analyst'] },
            { path: '/nas', label: t('nas_browser'), icon: HardDrive, roles: ['admin', 'analyst'] },
            { path: '/vector-manager', label: t('vector_manager'), icon: Database, roles: ['admin', 'analyst'] },
            { path: '/architecture', label: t('architecture'), icon: Network, roles: ['admin', 'analyst'] },
            { path: '/admin/users', label: t('admin_users'), icon: Users, roles: ['admin'] },
            { path: '/admin/askai-logs', label: t('askai_logs'), icon: MessageSquareText, roles: ['admin'] },
            { path: '/settings', label: t('settings'), icon: Settings, roles: ['admin'] },
        ];
        if (!user) return [];
        return all.filter(filterByRole);
    }, [t, user, role, language]);

    const renderNavItem = (link: NavLinkDef) => {
        const Icon = link.icon;
        const target=new URL(link.path,'http://localhost');
        const comparison=new URLSearchParams(location.search).get('tab')==='compare';
        const isActive = location.pathname===target.pathname && (target.search ? comparison : link.path==='/benchmark' ? !comparison : true);
        return (
            <Link
                key={link.path}
                to={link.path}
                aria-label={link.label}
                aria-current={isActive ? 'page' : undefined}
                className={clsx(
                    'group relative flex items-center gap-3 rounded-lg transition-all whitespace-nowrap',
                    collapsed ? 'justify-center px-0 py-2.5 mx-1' : 'px-4 py-2.5',
                    isActive
                        ? 'bg-primary/[0.12] text-primary'
                        : 'text-text-secondary hover:bg-ink/[0.05] hover:text-text-primary',
                )}
            >
                <Icon className={clsx('w-5 h-5 shrink-0 transition-colors', isActive ? 'text-primary' : 'group-hover:text-text-primary')} />
                {!collapsed && <span className="sidebar-label font-medium text-sm">{link.label}</span>}
                {/* 折叠态悬停 tooltip */}
                {collapsed && (
                    <span className="pointer-events-none absolute left-full ml-3 px-2 py-1 rounded-md bg-surface-overlay border border-ink/[0.1] text-xs text-text-primary whitespace-nowrap opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all z-50 shadow-lg shadow-ink/40">
                        {link.label}
                    </span>
                )}
            </Link>
        );
    };

    return (
        <div className={clsx(
            'workspace-sidebar h-[100dvh] bg-sidebar-bg text-text-primary flex flex-col border-r border-ink/[0.08] transition-all duration-300 relative z-50',
            collapsed ? 'w-20' : 'w-64',
        )}>
            {/* 折叠切换 */}
            <button
                onClick={() => setCollapsed((v) => !v)}
                aria-label={collapsed ? (language === 'zh' ? '展开导航' : 'Expand navigation') : (language === 'zh' ? '收起导航' : 'Collapse navigation')}
                aria-expanded={!collapsed}
                className="sidebar-toggle absolute -right-3 top-8 bg-surface-raised border border-ink/[0.12] rounded-full p-1 text-text-secondary hover:text-text-primary hover:bg-surface-overlay transition-colors z-20"
            >
                {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>

            {/* Unified original BeeEVAL logo */}
            <div className={clsx(
                'sidebar-brand flex items-center gap-3 border-b border-ink/[0.08] transition-all overflow-hidden',
                collapsed ? 'justify-center px-2 py-4' : 'px-5 py-4',
            )}>
                <span className={clsx("sidebar-logo-frame", collapsed && "sidebar-logo-mark")}>
                    <img src={`${import.meta.env.BASE_URL}beeeval-logo.png`} alt="BeeEVAL" className="sidebar-logo" />
                </span>
            </div>

            {/* 导航 */}
            <nav className="flex-1 py-4 space-y-1 overflow-x-hidden overflow-y-auto scrollbar-thin scrollbar-thumb-ink/10">
                <div className={clsx('space-y-1', collapsed ? '' : 'px-3')}>
                    {mainLinks.map(renderNavItem)}
                </div>

                {/* 管理组：一级目录（展开态可折叠） */}
                {adminLinks.length > 0 && (
                    <div className="mt-4 pt-3">
                        {collapsed ? (
                            <div className="mx-3 mb-2 border-t border-ink/[0.08]" />
                        ) : (
                            <button
                                onClick={() => setAdminOpen((v) => !v)}
                                aria-label={t('admin_group')}
                                aria-expanded={adminOpen}
                                className="w-full px-5 mb-1 flex items-center gap-2 text-[11px] font-semibold text-text-muted uppercase tracking-wider hover:text-text-secondary transition-colors"
                            >
                                <Shield className="w-3.5 h-3.5" />
                                <span className="sidebar-label">{t('admin_group')}</span>
                                <ChevronDown className={clsx('w-3.5 h-3.5 ml-auto transition-transform', adminOpen ? '' : '-rotate-90')} />
                            </button>
                        )}
                        {/* 折叠态始终显示图标；展开态受 adminOpen 控制 */}
                        {(collapsed || adminOpen) && (
                            <div className={clsx('space-y-1', collapsed ? '' : 'px-3')}>
                                {adminLinks.map(renderNavItem)}
                            </div>
                        )}
                    </div>
                )}
            </nav>

            {/* 底部：用户 + 语言（对所有用户开放） */}
            <div className="sidebar-footer border-t border-ink/[0.08] p-3 space-y-1">
                <LanguageButton collapsed={collapsed} language={language} onToggle={toggleLanguage} />
                {user && (
                    <UserMenu
                        collapsed={collapsed}
                        displayName={user.display_name || user.username}
                        username={user.username}
                        role={user.role}
                        roleText={user.role==='admin'?t('role_admin'):(user.membership_tier?({free:'Free',base:'Base',plus:'Plus',pro:'Pro',trial:'Trial'})[user.membership_tier]:t(ROLE_LABEL[user.role]?.key || 'role_tester'))}
                        roleCls={ROLE_LABEL[user.role]?.cls || ROLE_LABEL.tester.cls}
                        accountLabel={t('topbar_my_account')}
                        logoutLabel={t('topbar_logout')}
                        onLogout={() => void logout()}
                    />
                )}
            </div>
        </div>
    );
};

// ── 语言切换按钮 ─────────────────────────────────────────────
const LanguageButton: React.FC<{ collapsed: boolean; language: string; onToggle: () => void }> = ({ collapsed, language, onToggle }) => {
    const next = language === 'zh' ? 'En' : '中文';
    return (
        <button
            onClick={onToggle}
            aria-label={language === 'zh' ? 'Switch to English' : '切换中文'}
            className={clsx(
                'group relative w-full flex items-center gap-3 rounded-lg text-text-secondary hover:bg-ink/[0.05] hover:text-text-primary transition-colors',
                collapsed ? 'justify-center py-2.5' : 'px-3 py-2.5',
            )}
        >
            <Languages className="w-5 h-5 shrink-0" />
            {!collapsed && <span className="sidebar-label font-medium text-sm">{next}</span>}
            {collapsed && (
                <span className="pointer-events-none absolute left-full ml-3 px-2 py-1 rounded-md bg-surface-overlay border border-ink/[0.1] text-xs text-text-primary whitespace-nowrap opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all z-50 shadow-lg shadow-ink/40">
                    {next}
                </span>
            )}
        </button>
    );
};

// ── 用户菜单（点击弹出，向上展开） ───────────────────────────
const UserMenu: React.FC<{
    collapsed: boolean;
    displayName: string;
    username: string;
    role: string;
    roleText: string;
    roleCls: string;
    accountLabel: string;
    logoutLabel: string;
    onLogout: () => void;
}> = ({ collapsed, displayName, username, role, roleText, roleCls, accountLabel, logoutLabel, onLogout }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement | null>(null);
    const initial = displayName.slice(0, 1).toUpperCase();

    useEffect(() => {
        if (!open) return;
        const onDoc = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [open]);

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setOpen((v) => !v)}
                aria-label={displayName}
                aria-expanded={open}
                className={clsx(
                    'group relative w-full flex items-center gap-2.5 rounded-lg hover:bg-ink/[0.05] transition-colors',
                    collapsed ? 'justify-center py-2' : 'px-2 py-2',
                )}
            >
                <div className="w-8 h-8 rounded-full bg-primary text-text-inverse flex items-center justify-center text-xs font-semibold shrink-0">
                    {initial}
                </div>
                {!collapsed && (
                    <div className="sidebar-account-detail flex-1 min-w-0 text-left">
                        <div className="text-sm font-medium text-text-secondary truncate">{displayName}</div>
                        <div className="text-[10px] text-text-muted truncate">@{username}</div>
                    </div>
                )}
                {!collapsed && (
                    <span className={`sidebar-account-detail text-[10px] px-1.5 py-0.5 rounded border font-medium shrink-0 ${roleCls}`}>{roleText}</span>
                )}
                {collapsed && (
                    <span className="pointer-events-none absolute left-full ml-3 px-2 py-1 rounded-md bg-surface-overlay border border-ink/[0.1] text-xs text-text-primary whitespace-nowrap opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all z-50 shadow-lg shadow-ink/40">
                        {displayName}
                    </span>
                )}
            </button>

            {open && (
                <div className={clsx(
                    'absolute bottom-full mb-2 w-56 bg-surface-overlay border border-ink/[0.1] rounded-lg shadow-xl shadow-ink/40 overflow-hidden z-50',
                    collapsed ? 'left-0' : 'left-0 right-0',
                )}>
                    <div className="px-3 py-2.5 border-b border-ink/[0.08]">
                        <div className="text-sm font-medium text-text-primary truncate">{displayName}</div>
                        <div className="text-xs text-text-muted mt-0.5 truncate">@{username}</div>
                    </div>
                    <Link
                        to="/account"
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:bg-ink/[0.05] hover:text-text-primary"
                    >
                        <UserIcon className="w-4 h-4 text-text-muted" />
                        {accountLabel}
                    </Link>
                    <button
                        onClick={() => { setOpen(false); onLogout(); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-700 hover:bg-red-100 border-t border-ink/[0.08]"
                    >
                        <LogOut className="w-4 h-4" />
                        {logoutLabel}
                    </button>
                </div>
            )}
        </div>
    );
};

export default Sidebar;
