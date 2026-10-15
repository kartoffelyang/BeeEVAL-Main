import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

import { UserRole, useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';

interface Props {
    children: React.ReactElement;
    /** 不传则任意已登录用户都可访问；传了则必须是其中之一 */
    roles?: UserRole[];
}

/**
 * 角色不够时清会话并跳 /login（见 AuthContext.redirectToLoginDueToRole），
 * 避免仍带 token 时登录页「已登录」逻辑把用户送回无权限路由造成死循环。
 */
const RoleForbiddenRedirect: React.FC<{ attemptedPath: string }> = ({ attemptedPath }) => {
    const { redirectToLoginDueToRole } = useAuth();
    const { t } = useLanguage();
    useEffect(() => {
        redirectToLoginDueToRole({ attemptedPath });
    }, [attemptedPath, redirectToLoginDueToRole]);
    return (
        <div className="flex items-center justify-center h-full w-full bg-surface">
            <div className="flex items-center gap-2 text-text-muted text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('auth_redirecting_to_login')}
            </div>
        </div>
    );
};

/**
 * 路由守卫：
 *   1) 启动时还在 /me 验证 → loading
 *   2) 未登录 → 跳 /login，state.from 记当前路径，登录后回来
 *   3) 必须改密 → 跳 /account（账户页那边渲染强制改密 UI）
 *   4) roles 不匹配 → 清会话并跳 /login（登录页会提示权限不足，登录成功后回首页）
 */
const RequireAuth: React.FC<Props> = ({ children, roles }) => {
    const { isAuthed, bootstrapping, mustResetPwd, hasRole } = useAuth();
    const { t } = useLanguage();
    const location = useLocation();

    if (bootstrapping) {
        return (
            <div className="flex items-center justify-center h-full w-full bg-surface">
                <div className="flex items-center gap-2 text-text-muted text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t('auth_loading')}
                </div>
            </div>
        );
    }

    if (!isAuthed) {
        const here = location.pathname + location.search;
        return <Navigate to="/login" replace state={{ from: here }} />;
    }

    // 必须改密：除了 /account 自己，其他全部劫持过去
    if (mustResetPwd && location.pathname !== '/account') {
        return <Navigate to="/account" replace state={{ from: location.pathname }} />;
    }

    if (roles && roles.length > 0 && !hasRole(...roles)) {
        return <RoleForbiddenRedirect attemptedPath={location.pathname + location.search} />;
    }

    return children;
};

export default RequireAuth;
