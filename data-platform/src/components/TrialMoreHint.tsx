import React from 'react';
import { Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';

/**
 * 体验账号(viewer)的「还有更多」一行提示。
 *
 * 后端已按车型白名单(TRIAL_VISIBLE_BRAND_MODELS)裁剪了车型库/用例/报告列表，
 * 前端在列表下方补这一行，让体验账号知道"不是只有这些"，但不透出被屏蔽的车名。
 *
 * 非 viewer 渲染 null，所以调用处不需要自己判角色。
 * 中英文由 common.ts 的 trial_upgrade_more 提供。
 */
const TrialMoreHint: React.FC<{ className?: string }> = ({ className }) => {
    const { t } = useTranslation();
    const { user } = useAuth();

    if (user?.role !== 'viewer') return null;

    return (
        <div className={`flex items-center justify-center gap-1.5 py-4 text-xs text-text-muted ${className || ''}`}>
            <Lock className="w-3.5 h-3.5 shrink-0" />
            <span>{t('trial_upgrade_more')}</span>
        </div>
    );
};

export default TrialMoreHint;
