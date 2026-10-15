import React from 'react';

export interface GapItem {
    label: string;
    delta: number;
}

interface GapChartProps {
    items: GapItem[];
    primaryLabel: string;
    competitorLabel: string;
    primaryColor?: string;
    competitorColor?: string;
}

const GapChart: React.FC<GapChartProps> = ({
    items,
    primaryLabel,
    competitorLabel,
    primaryColor = '#697a61',
    competitorColor = '#b34840',
}) => {
    if (items.length === 0) return null;

    const maxDelta = Math.max(...items.map(i => Math.abs(i.delta)), 0.5);
    const mid = Math.ceil(items.length / 2);
    const leftItems = items.slice(0, mid);
    const rightItems = items.slice(mid);

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-center gap-5 text-xs text-text-secondary">
                <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: primaryColor }} />
                    {primaryLabel}
                </span>
                <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: competitorColor }} />
                    {competitorLabel}
                </span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6">
                <GapColumn items={leftItems} maxDelta={maxDelta} primaryColor={primaryColor} competitorColor={competitorColor} />
                {rightItems.length > 0 && (
                    <GapColumn items={rightItems} maxDelta={maxDelta} primaryColor={primaryColor} competitorColor={competitorColor} />
                )}
            </div>
        </div>
    );
};

const GapColumn: React.FC<{
    items: GapItem[];
    maxDelta: number;
    primaryColor: string;
    competitorColor: string;
}> = ({ items, maxDelta, primaryColor, competitorColor }) => (
    <div className="space-y-[3px]">
        {items.map(item => {
            const pct = (Math.abs(item.delta) / maxDelta) * 100;
            const isPositive = item.delta >= 0;
            const color = isPositive ? primaryColor : competitorColor;
            return (
                <div key={item.label} className="flex items-center gap-2 h-7">
                    <span className="text-[13px] text-text-muted w-28 shrink-0 truncate text-right" title={item.label}>
                        {item.label}
                    </span>
                    <div className="flex-1 flex items-center h-full relative">
                        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-ink/[0.08]" />
                        {isPositive ? (
                            <div className="ml-[50%] h-2.5 rounded-r-sm" style={{ width: `${pct / 2}%`, backgroundColor: color, opacity: 0.8 }} />
                        ) : (
                            <div className="h-2.5 rounded-l-sm ml-auto" style={{ width: `${pct / 2}%`, backgroundColor: color, opacity: 0.8, marginRight: '50%' }} />
                        )}
                    </div>
                    <span className="text-[13px] font-medium tabular-nums w-12 shrink-0" style={{ color: `${color}cc` }}>
                        {item.delta > 0 ? '+' : ''}{item.delta.toFixed(2)}
                    </span>
                </div>
            );
        })}
    </div>
);

export default GapChart;
