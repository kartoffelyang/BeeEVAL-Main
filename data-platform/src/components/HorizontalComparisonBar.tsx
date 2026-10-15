import React from 'react';

export interface ComparisonBarItem {
    label: string;
    value: number;
    color: string;
}

interface HorizontalComparisonBarProps {
    title: string;
    items: ComparisonBarItem[];
    max?: number;
}

const HorizontalComparisonBar: React.FC<HorizontalComparisonBarProps> = ({
    title,
    items,
    max = 5,
}) => {
    return (
        <div className="space-y-2">
            <h4 className="text-sm font-semibold text-text-secondary">{title}</h4>
            <div className="space-y-1.5">
                {items.map((item) => {
                    const widthPct = Math.max(2, (item.value / max) * 100);
                    return (
                        <div key={item.label} className="flex items-center gap-3">
                            <span className="text-xs text-text-muted w-28 truncate text-right shrink-0">
                                {item.label}
                            </span>
                            <div className="flex-1 h-5 bg-ink/[0.08] rounded-full overflow-hidden relative">
                                <div
                                    className="h-full rounded-full transition-all duration-500"
                                    style={{ width: `${widthPct}%`, backgroundColor: item.color }}
                                />
                            </div>
                            <span className="text-xs font-bold text-text-secondary w-10 tabular-nums">
                                {item.value.toFixed(2)}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default HorizontalComparisonBar;
