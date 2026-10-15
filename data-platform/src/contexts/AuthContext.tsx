import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { useNavigate } from 'react-router-dom';

import {
    UserPublic,
    UserRole,
    clearAuthToken,
    getAuthToken,
    login as apiLogin,
    logoutApi,
    me as apiMe,
    setAuthToken,
    migrateUnifiedSession,
} from '../api';
import { usesUnifiedSession } from '../utils/unifiedAuth';

// 从 ../api 转发出去，方便其它组件按习惯从 AuthContext 直接 import 角色类型
export type { UserPublic, UserRole };

// ─────────────────────────────────────────────────────────────────────
// AuthContext
//
// 状态机：
//   bootstrapping → ((token? && /me ok) ? authed : guest)
//   guest → login() → authed
//   authed → logout() / 401 拦截 → guest
//
// 设计要点：
//   - 生产使用原站 HttpOnly 共享会话；本地开发兼容 beeeval.auth.token。
//   - 任意页面的 axios 401 都会触发 'beeeval:unauthorized' 事件，本 context
//     监听后清空状态并跳 /login（携带 from，登录后回到原页面）。
//   - mustResetPwd 由后端 detail = "must_reset_password" 给出；前端 RequireAuth
//     看到这个状态就强制弹改密窗。
// ─────────────────────────────────────────────────────────────────────
interface AuthContextValue {
    user: UserPublic | null;
    bootstrapping: boolean;          // 首次拉 /me 中
    isAuthed: boolean;
    mustResetPwd: boolean;
    login: (username: string, password: string) => Promise<UserPublic>;
    logout: () => Promise<void>;
    refresh: () => Promise<void>;
    /** 改密成功后强制重登：清 token + 跳 /login，不带 from（避免回到含旧 token 的页面） */
    forceRelogin: () => void;
    /**
     * 前端路由层发现角色不够（非后端 403）：清本地会话并跳登录页，
     * 便于用户换一个有权限的账号；登录成功后默认回首页，避免回到无权限路由死循环。
     */
    redirectToLoginDueToRole: (opts?: { attemptedPath?: string }) => void;
    hasRole: (...roles: UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<UserPublic | null>(null);
    const [bootstrapping, setBootstrapping] = useState(true);
    const navigate = useNavigate();
    const navigateRef = useRef(navigate);
    navigateRef.current = navigate;

    const refresh = useCallback(async () => {
        const token = getAuthToken();
        if (usesUnifiedSession() && token) {
            try { await migrateUnifiedSession(); } catch { /* Check the canonical session below. */ }
            finally { clearAuthToken(); }
        }
        if (!usesUnifiedSession() && !token) {
            setUser(null);
            return;
        }
        try {
            const u = await apiMe();
            setUser(u);
        } catch (error: any) {
            // /me 失败：要么 token 已坏，要么后端 down；前者由 401 拦截器清掉，
            // 这里直接置空就好。
            if (error?.response?.status === 401) setUser(null);
        }
    }, []);

    // 启动时跑一次：拿 token → 验证 → 决定能不能直接进
    useEffect(() => {
        let cancelled = false;
        (async () => {
            await refresh();
            if (!cancelled) setBootstrapping(false);
        })();
        return () => {
            cancelled = true;
        };
    }, [refresh]);

    // Re-read original account roles/expiry when returning from the original site.
    useEffect(() => {
        const check = () => { if (document.visibilityState === 'visible') void refresh(); };
        window.addEventListener('focus', check);
        document.addEventListener('visibilitychange', check);
        return () => { window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', check); };
    }, [refresh]);

    // 监听 axios 401：自动登出 + 跳 /login，保留 from 以便登录后回跳
    useEffect(() => {
        const onUnauth = (ev: Event) => {
            setUser(null);
            // 别覆盖正在登录的页面（防止登录失败时重复跳）
            const base = import.meta.env.BASE_URL.replace(/\/$/, "");
            const here = (window.location.pathname.slice(base.length) || "/") + window.location.search;
            if (!here.startsWith('/login')) {
                // 把后端 detail（例如 account_expired）转给 Login 页提示用户
                const detail = (ev as CustomEvent).detail;
                navigateRef.current('/login', {
                    replace: true,
                    state: { from: here, reason: typeof detail === 'string' ? detail : undefined },
                });
            }
        };
        window.addEventListener('beeeval:unauthorized', onUnauth);
        return () => window.removeEventListener('beeeval:unauthorized', onUnauth);
    }, []);

    const login = useCallback(async (username: string, password: string) => {
        const resp = await apiLogin(username, password);
        if (!usesUnifiedSession()) setAuthToken(resp.access_token);
        setUser(resp.user);
        return resp.user;
    }, []);

    const logout = useCallback(async () => {
        try {
            await logoutApi();
        } finally {
            clearAuthToken();
            setUser(null);
            navigateRef.current('/login', { replace: true });
        }
    }, []);

    const forceRelogin = useCallback(() => {
        clearAuthToken();
        setUser(null);
        navigateRef.current('/login', { replace: true });
    }, []);

    const redirectToLoginDueToRole = useCallback((opts?: { attemptedPath?: string }) => {
        clearAuthToken();
        setUser(null);
        navigateRef.current('/login', {
            replace: true,
            state: {
                from: '/',
                reason: 'forbidden_role',
                attemptedPath: opts?.attemptedPath,
            },
        });
    }, []);

    const hasRole = useCallback(
        (...roles: UserRole[]) => !!user && roles.includes(user.role),
        [user],
    );

    const value = useMemo<AuthContextValue>(
        () => ({
            user,
            bootstrapping,
            isAuthed: !!user,
            mustResetPwd: !!user?.must_reset_pwd,
            login,
            logout,
            refresh,
            forceRelogin,
            redirectToLoginDueToRole,
            hasRole,
        }),
        [user, bootstrapping, login, logout, refresh, forceRelogin, redirectToLoginDueToRole, hasRole],
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
    const ctx = useContext(AuthContext);
    if (!ctx) {
        throw new Error('useAuth must be used inside <AuthProvider>');
    }
    return ctx;
};
