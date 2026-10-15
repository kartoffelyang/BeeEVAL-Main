import React from 'react';

/**
 * 通用「即将上线」占位卡片：用于验收测试里尚未实现的板块（用例生成 / 自动提票）。
 * 只做视觉占位，不含业务逻辑。
 */
const PlaceholderTab: React.FC<{
    icon: React.ReactNode;
    title: string;
    desc: string;
    comingSoonLabel: string;
}> = ({ icon, title, desc, comingSoonLabel }) => (
    <div className="flex flex-col items-center justify-center text-center py-20 px-6 rounded-2xl border border-dashed border-ink/[0.12] bg-surface-raised/40">
        <div className="w-16 h-16 rounded-2xl bg-ink/[0.04] flex items-center justify-center text-text-muted mb-5">
            {icon}
        </div>
        <div className="flex items-center gap-2 mb-2.5">
            <h2 className="text-lg font-bold text-text-primary">{title}</h2>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary/[0.12] text-primary border border-primary/30">
                {comingSoonLabel}
            </span>
        </div>
        <p className="max-w-md text-sm text-text-muted leading-relaxed">{desc}</p>
    </div>
);

export default PlaceholderTab;
