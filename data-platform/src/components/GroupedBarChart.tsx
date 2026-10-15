import React from 'react';

export interface BarGroup {
    label: string;
    values: Array<{ key: string; value: number; color: string }>;
}

interface GroupedBarChartProps {
    groups: BarGroup[];
    max?: number;
    barHeight?: number;
    showValues?: boolean;
}

const GroupedBarChart: React.FC<GroupedBarChartProps> = ({
    groups,
    max = 5,
    barHeight = 20,
    showValues = true,
}) => {
    if (groups.length === 0) return null;

    const groupGap = 24;
    const barGap = 4;
    const labelWidth = 120;
    const chartWidth = 400;
    const barsPerGroup = groups[0]?.values.length ?? 0;
    const groupHeight = barsPerGroup * (barHeight + barGap) - barGap;
    const totalHeight = groups.length * (groupHeight + groupGap) - groupGap;
    const svgWidth = labelWidth + chartWidth + 60;
    const svgHeight = totalHeight + 20;

    return (
        <svg width="100%" viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="select-none">
            {groups.map((group, gi) => {
                const groupY = gi * (groupHeight + groupGap);
                return (
                    <g key={group.label}>
                        <text
                            x={labelWidth - 8}
                            y={groupY + groupHeight / 2}
                            fontSize={12}
                            fill="#475569"
                            textAnchor="end"
                            dominantBaseline="middle"
                        >
                            {group.label}
                        </text>
                        {group.values.map((bar, bi) => {
                            const y = groupY + bi * (barHeight + barGap);
                            const width = Math.max(2, (bar.value / max) * chartWidth);
                            return (
                                <g key={bar.key}>
                                    <rect
                                        x={labelWidth}
                                        y={y}
                                        width={width}
                                        height={barHeight}
                                        rx={4}
                                        fill={bar.color}
                                        opacity={0.85}
                                    />
                                    {showValues && (
                                        <text
                                            x={labelWidth + width + 6}
                                            y={y + barHeight / 2}
                                            fontSize={11}
                                            fill="#64748b"
                                            dominantBaseline="middle"
                                        >
                                            {bar.value.toFixed(2)}
                                        </text>
                                    )}
                                </g>
                            );
                        })}
                    </g>
                );
            })}
        </svg>
    );
};

export default GroupedBarChart;
