import React, { useState } from 'react';
import { Car, Building2 } from 'lucide-react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import VehicleSelector from '../vehicle-scores/VehicleSelector';
import AcceptanceTab from '../vehicle-scores/AcceptanceTab';

type RefMode = 'target' | 'industry';

/**
 * 验收基线：选择参考对象（目标车型 / 行业均值占位）后，
 * 复用 vehicle-scores 的「验收梯度完成率」页（AcceptanceTab，按梯度分组的
 * 柱状图对比），其内部已内建「本品 vs 已选竞品」对比逻辑。
 */
const AcceptanceBaselineTab: React.FC = () => {
    const { t } = useTranslation();
    const [refMode, setRefMode] = useState<RefMode>('target');

    const MODES: Array<{ key: RefMode; label: string; icon: React.ReactNode; hint: string; disabled?: boolean }> = [
        { key: 'target', label: t('at_ref_target'), icon: <Car className="w-4 h-4" />, hint: t('at_ref_target_hint') },
        { key: 'industry', label: t('at_ref_industry'), icon: <Building2 className="w-4 h-4" />, hint: t('at_ref_industry_hint'), disabled: true },
    ];

    return (
        <div className="space-y-6">
            {/* 参考对象切换 */}
            <div className="bg-surface-raised p-5 rounded-xl border border-ink/[0.08] space-y-4">
                <div>
                    <div className="text-sm font-semibold text-text-secondary mb-2">{t('at_ref_mode')}</div>
                    <div className="flex flex-wrap gap-2">
                        {MODES.map(m => {
                            const active = refMode === m.key;
                            return (
                                <button
                                    key={m.key}
                                    onClick={() => !m.disabled && setRefMode(m.key)}
                                    disabled={m.disabled}
                                    title={m.hint}
                                    className={clsx(
                                        'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border transition-colors',
                                        m.disabled
                                            ? 'border-ink/[0.06] text-text-muted opacity-50 cursor-not-allowed'
                                            : active
                                                ? 'border-secondary/60 bg-secondary/[0.14] text-secondary'
                                                : 'border-ink/[0.1] text-text-secondary hover:text-text-primary hover:bg-ink/[0.05]',
                                    )}
                                >
                                    {m.icon}
                                    {m.label}
                                    {m.disabled && (
                                        <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-ink/[0.06] text-text-muted">
                                            {t('at_coming_soon')}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                    <p className="text-xs text-text-muted mt-2">
                        {refMode === 'target' ? t('at_ref_target_hint') : t('at_ref_industry_hint')}
                    </p>
                </div>

                {/* 目标车型模式：车型选择器（本品 + 目标车型作参考） */}
                {refMode === 'target' && (
                    <div className="pt-3 border-t border-ink/[0.06]">
                        <div className="text-xs text-text-muted mb-2">{t('at_select_hint')}</div>
                        <VehicleSelector />
                    </div>
                )}
            </div>

            {/* 验收梯度完成率（复用 vehicle-scores 的验收评价页） */}
            <AcceptanceTab />
        </div>
    );
};

export default AcceptanceBaselineTab;
