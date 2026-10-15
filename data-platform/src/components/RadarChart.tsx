import React from 'react';

interface DataSet {
    label?: string;
    data: Array<{ label: string; value: number }>;
    strokeColor?: string;
    fillColor?: string;
}

interface RadarChartProps {
    data?: Array<{ label: string; value: number }>;
    datasets?: DataSet[];
    max?: number;
    size?: number;
    strokeColor?: string;
    fillColor?: string;
    showLabels?: boolean;
}

const RadarChart: React.FC<RadarChartProps> = ({
    data,
    datasets,
    max = 5,
    size = 360,
    strokeColor = '#a17b35',
    fillColor = 'rgba(161, 123, 53, 0.14)',
    showLabels = true,
}) => {
    const resolvedDatasets: DataSet[] = datasets
        ? datasets
        : data
            ? [{ data, strokeColor, fillColor }]
            : [];

    if (resolvedDatasets.length === 0 || resolvedDatasets[0].data.length < 3) {
        return (
            <div
                className="flex items-center justify-center text-sm text-text-muted italic"
                style={{ width: size, height: size }}
            >
                指标数据不足以绘制雷达图（至少需要 3 个维度）
            </div>
        );
    }

    const axes = resolvedDatasets[0].data;
    const n = axes.length;
    const padding = 60;
    const radius = size / 2 - padding;
    const cx = size / 2;
    const cy = size / 2;

    const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;

    const rings = [1, 2, 3, 4, 5].map((r) => {
        const ratio = r / max;
        const points = Array.from({ length: n }, (_, i) => {
            const a = angle(i);
            const x = cx + Math.cos(a) * radius * ratio;
            const y = cy + Math.sin(a) * radius * ratio;
            return `${x},${y}`;
        }).join(' ');
        return { r, points };
    });

    const labels = axes.map((d, i) => {
        const a = angle(i);
        const x = cx + Math.cos(a) * (radius + 18);
        const y = cy + Math.sin(a) * (radius + 18);
        const cos = Math.cos(a);
        const anchor: 'start' | 'middle' | 'end' =
            cos > 0.3 ? 'start' : cos < -0.3 ? 'end' : 'middle';
        return { label: d.label, x, y, anchor };
    });

    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="select-none">
            {rings.map(({ r, points }) => (
                <polygon key={r} points={points} fill="none" stroke="rgba(32,34,31,0.1)" strokeWidth={1} />
            ))}

            {Array.from({ length: n }).map((_, i) => {
                const a = angle(i);
                const x = cx + Math.cos(a) * radius;
                const y = cy + Math.sin(a) * radius;
                return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(32,34,31,0.1)" strokeWidth={1} />;
            })}

            {[1, 2, 3, 4, 5].map((r) => (
                <text key={`tick-${r}`} x={cx + 4} y={cy - (radius * r) / max} fontSize={10} fill="#72766e" dominantBaseline="middle">
                    {r}
                </text>
            ))}

            {resolvedDatasets.map((ds, dsIdx) => {
                const sc = ds.strokeColor || strokeColor;
                const fc = ds.fillColor || `${sc}30`;
                const points = ds.data.map((d, i) => {
                    const a = angle(i);
                    const ratio = Math.max(0, Math.min(1, d.value / max));
                    const x = cx + Math.cos(a) * radius * ratio;
                    const y = cy + Math.sin(a) * radius * ratio;
                    return { x, y };
                });
                const polyline = points.map(p => `${p.x},${p.y}`).join(' ');
                return (
                    <g key={dsIdx}>
                        <polygon points={polyline} fill={fc} stroke={sc} strokeWidth={2} opacity={0.85} />
                        {points.map((p, i) => (
                            <circle key={i} cx={p.x} cy={p.y} r={3} fill={sc} />
                        ))}
                    </g>
                );
            })}

            {showLabels && labels.map((l, i) => (
                <g key={i}>
                    <text x={l.x} y={l.y} fontSize={11} fill="#656a61" textAnchor={l.anchor} dominantBaseline="middle">
                        {l.label}
                    </text>
                    {resolvedDatasets.length === 1 && (
                        <text x={l.x} y={l.y + 13} fontSize={10} fill={resolvedDatasets[0].strokeColor || strokeColor} textAnchor={l.anchor} dominantBaseline="middle" fontWeight="bold">
                            {resolvedDatasets[0].data[i].value.toFixed(2)}
                        </text>
                    )}
                </g>
            ))}
        </svg>
    );
};

export default RadarChart;
