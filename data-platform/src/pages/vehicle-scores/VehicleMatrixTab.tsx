import React, { useMemo, useState } from 'react';
import { LayoutGrid } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMetricsTranslation } from '../../hooks/useMetricsTranslation';
import { useComparison, vehicleKey } from './ComparisonContext';
import { detectBrand, brandLogoUrl, type BrandInfo } from '../../data/brands';
import TrialMoreHint from '../../components/TrialMoreHint';

/** 把 "YYYY-MM" / "YYYY-MM-DD" 解析成时间戳（毫秒）；非法返回 null。 */
const parseLaunchDate = (date: string | undefined | null): number | null => {
    if (!date) return null;
    const m = /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/.exec(date.trim());
    if (!m) return null;
    const t = new Date(Number(m[1]), Number(m[2]) - 1, m[3] ? Number(m[3]) : 1).getTime();
    return Number.isFinite(t) ? t : null;
};

// 矩阵图的一个点：一款车（品牌车型 × 版本）。x=官方上线时间，y=总体得分。
interface MatrixPoint {
    key: string;
    brandModel: string;
    systemVersion: string | null;
    brand: BrandInfo | null;
    ts: number;          // 测试采集时间戳（ms），作该版本上线时间的近似
    dateLabel: string;   // 原始日期串（YYYY-MM）
    approx: boolean;     // 恒 true：采集时间是版本上线时间的近似
    score: number;       // overall_score（功能域均分，0-5）
}

// 「nice」刻度：给定 min/max，返回美观的 [lo, hi, step]。
const niceScale = (min: number, max: number, targetTicks = 5): [number, number, number] => {
    if (min === max) { min -= 0.5; max += 0.5; }
    const span = max - min;
    const rawStep = span / targetTicks;
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const norm = rawStep / mag;
    const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : norm >= 1 ? 1 : 0.5) * mag;
    const lo = Math.floor(min / step) * step;
    const hi = Math.ceil(max / step) * step;
    return [lo, hi, step];
};

const fmtMonth = (ts: number) => {
    const d = new Date(ts);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const VehicleMatrixTab: React.FC = () => {
    const { t } = useTranslation();
    const { vehicles } = useComparison();

    // 组装矩阵点：需要同时有「上线时间」和「总体得分」。缺任一忽略。
    const { points, missing } = useMemo(() => {
        const pts: MatrixPoint[] = [];
        const miss: string[] = [];
        for (const v of vehicles) {
            const key = vehicleKey(v);
            const ts = parseLaunchDate(v.capture_date);
            const score = v.overall_score;
            if (ts == null || score == null) {
                if (v.brand_model) miss.push(v.brand_model);
                continue;
            }
            pts.push({
                key,
                brandModel: v.brand_model,
                systemVersion: v.system_version,
                brand: detectBrand(v.brand_model),
                ts,
                dateLabel: v.capture_date!,
                // 采集时间是该 OTA 版本上线时间的近似（我们实拍该版本运行的月份），
                // 非官方精确推送日 —— 恒为近似，UI 标 ≈ 提示。
                approx: true,
                score,
            });
        }
        pts.sort((a, b) => a.ts - b.ts);
        return { points: pts, missing: miss };
    }, [vehicles]);

    return (
        <div className="space-y-4">
            {/* 标题 */}
            <div className="flex flex-wrap items-center gap-2">
                <LayoutGrid className="w-5 h-5 text-secondary" />
                <h2 className="text-lg font-bold text-text-primary">{t('mtx_title')}</h2>
            </div>
            <p className="text-xs text-text-muted -mt-1">{t('mtx_desc')}</p>

            {points.length === 0 ? (
                <div className="text-sm text-text-muted py-12 text-center border border-dashed border-ink/[0.08] rounded-xl">
                    {t('mtx_no_data')}
                </div>
            ) : (
                <MatrixPlot points={points} />
            )}

            {missing.length > 0 && (
                <p className="text-[11px] text-text-muted">
                    {t('mtx_missing', { list: missing.join('、') })}
                </p>
            )}

            {/* 体验账号：矩阵图只画白名单车型，提示还有更多 */}
            <TrialMoreHint className="!py-1" />
        </div>
    );
};

// 品牌 Logo：优先加载 public/brands/<slug>.png（透明底），失败回退文字型标记。
const BrandLogoMark: React.FC<{ brand: BrandInfo | null; size: number }> = ({ brand, size }) => {
    const [failed, setFailed] = useState(false);
    if (!brand) {
        return (
            <div
                className="rounded-full bg-ink/10 flex items-center justify-center text-[10px] text-text-muted"
                style={{ width: size, height: size }}
            >
                ?
            </div>
        );
    }
    if (failed) {
        // 文字型回退：品牌配色圆标 + 品牌名首字
        return (
            <div
                className="rounded-full flex items-center justify-center font-bold text-text-primary shadow"
                style={{ width: size, height: size, backgroundColor: brand.color, fontSize: size * 0.42 }}
                title={brand.name}
            >
                {brand.name.slice(0, 1)}
            </div>
        );
    }
    return (
        <img
            src={brandLogoUrl(brand.slug)}
            alt={brand.name}
            onError={() => setFailed(true)}
            style={{ width: size, height: size }}
            className="object-contain"
        />
    );
};

// 矩阵散点图：X=官方上线时间，Y=总体得分(0-5)。每点为品牌 Logo + 车型名。
const MatrixPlot: React.FC<{ points: MatrixPoint[] }> = ({ points }) => {
    const { t } = useTranslation();
    const { tv } = useMetricsTranslation();
    const [hover, setHover] = useState<{ p: MatrixPoint; x: number; y: number } | null>(null);

    // 画布尺寸（viewBox 坐标系）
    const W = 1200, H = 620;
    const M = { top: 28, right: 48, bottom: 60, left: 60 };
    const iw = W - M.left - M.right;
    const ih = H - M.top - M.bottom;

    // X 轴：时间范围（左右各留一点空白），按月刻度。
    const [xLo, xHi] = useMemo(() => {
        const ts = points.map(p => p.ts);
        let lo = Math.min(...ts), hi = Math.max(...ts);
        if (lo === hi) { lo -= 30 * 864e5; hi += 30 * 864e5; }
        const pad = (hi - lo) * 0.08;
        return [lo - pad, hi + pad];
    }, [points]);

    // Y 轴：得分范围，按数据收窄（但至少含 0-5 的一段）以美观。
    const [yLo, yHi, yStep] = useMemo(() => {
        const ys = points.map(p => p.score);
        return niceScale(Math.min(...ys, 5), Math.max(...ys, 0), 5);
    }, [points]);

    const xPix = (ts: number) => M.left + ((ts - xLo) / (xHi - xLo)) * iw;
    const yPix = (score: number) => M.top + ih - ((score - yLo) / (yHi - yLo)) * ih;

    // X 轴刻度：在时间跨度内按「季度/半年」自适应取 5~7 个月份刻度。
    const xTicks = useMemo(() => {
        const ticks: number[] = [];
        const start = new Date(xLo);
        const spanMonths = (xHi - xLo) / (30 * 864e5);
        const stepMon = spanMonths > 40 ? 6 : spanMonths > 18 ? 3 : 1;
        const d = new Date(start.getFullYear(), start.getMonth(), 1);
        // 对齐到 stepMon 的整数月
        d.setMonth(Math.ceil(d.getMonth() / stepMon) * stepMon);
        while (d.getTime() <= xHi) {
            if (d.getTime() >= xLo) ticks.push(d.getTime());
            d.setMonth(d.getMonth() + stepMon);
        }
        return ticks;
    }, [xLo, xHi]);

    const yTicks: number[] = [];
    for (let v = yLo; v <= yHi + 1e-9; v += yStep) yTicks.push(Math.round(v * 10) / 10);

    const LOGO = 30; // Logo 直径（viewBox 单位）

    return (
        <div className="relative bg-surface-raised rounded-xl border border-ink/[0.08] p-3">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 'min(68vh, 640px)' }}>
                {/* Y 轴网格 + 刻度 */}
                {yTicks.map(v => {
                    const y = yPix(v);
                    return (
                        <g key={`y${v}`}>
                            <line x1={M.left} y1={y} x2={W - M.right} y2={y} stroke="rgba(32,34,31,0.06)" />
                            <text x={M.left - 8} y={y + 4} textAnchor="end" fontSize="13" fill="#656a61">{v}</text>
                        </g>
                    );
                })}
                {/* X 轴刻度 */}
                {xTicks.map(ts => {
                    const x = xPix(ts);
                    return (
                        <g key={`x${ts}`}>
                            <line x1={x} y1={M.top} x2={x} y2={M.top + ih} stroke="rgba(32,34,31,0.05)" />
                            <text x={x} y={M.top + ih + 22} textAnchor="middle" fontSize="12" fill="#656a61">{fmtMonth(ts)}</text>
                        </g>
                    );
                })}
                {/* 轴标题 */}
                <text x={M.left + iw / 2} y={H - 10} textAnchor="middle" fontSize="14" fill="#4e554b">{t('mtx_axis_time')}</text>
                <text transform={`translate(18 ${M.top + ih / 2}) rotate(-90)`} textAnchor="middle" fontSize="14" fill="#4e554b">{t('mtx_axis_score')}</text>

                {/* 数据点：Logo + 车型名 + 得分。hover 高亮。 */}
                {points.map((p, i) => {
                    const cx = xPix(p.ts);
                    const cy = yPix(p.score);
                    const active = hover?.p === p;
                    // 标签放 Logo 下方；靠右边界的点标签左移防溢出。
                    const nearRight = cx > W - M.right - 80;
                    const nearLeft = cx < M.left + 80;
                    const anchor: 'start' | 'middle' | 'end' = nearRight ? 'end' : nearLeft ? 'start' : 'middle';
                    const labelX = nearRight ? cx + LOGO / 2 : nearLeft ? cx - LOGO / 2 : cx;
                    return (
                        <g
                            key={p.key}
                            onMouseEnter={() => setHover({ p, x: cx, y: cy })}
                            onMouseLeave={() => setHover(null)}
                            style={{ cursor: 'pointer' }}
                        >
                            {/* 竖直辅助线（到 X 轴），淡 */}
                            <line x1={cx} y1={cy} x2={cx} y2={M.top + ih} stroke="rgba(32,34,31,0.08)" strokeDasharray="3 3" />
                            {/* 高亮光晕 */}
                            <circle
                                cx={cx} cy={cy} r={LOGO / 2 + (active ? 6 : 3)}
                                fill={p.brand?.color || '#64748b'}
                                fillOpacity={active ? 0.28 : 0.14}
                            />
                            {/* 品牌 Logo（用 foreignObject 嵌入 React 组件） */}
                            <foreignObject x={cx - LOGO / 2} y={cy - LOGO / 2} width={LOGO} height={LOGO} style={{ pointerEvents: 'none' }}>
                                <div style={{ width: LOGO, height: LOGO, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <BrandLogoMark brand={p.brand} size={LOGO} />
                                </div>
                            </foreignObject>
                            {/* 车型名标签 */}
                            <text
                                x={labelX} y={cy + LOGO / 2 + 16} textAnchor={anchor}
                                fontSize="12.5" fontWeight={active ? 700 : 500}
                                fill={active ? '#20221f' : '#4e554b'}
                                style={{ paintOrder: 'stroke', pointerEvents: 'none' }}
                                stroke="rgba(247,247,243,0.95)" strokeWidth={active ? 4 : 3}
                            >
                                {tv(p.brandModel)}
                            </text>
                            {/* 得分标签（Logo 上方） */}
                            <text
                                x={cx} y={cy - LOGO / 2 - 7} textAnchor="middle"
                                fontSize="13" fontWeight={700}
                                fill={active ? '#20221f' : (p.brand?.color || '#656a61')}
                                style={{ paintOrder: 'stroke', pointerEvents: 'none' }}
                                stroke="rgba(247,247,243,0.95)" strokeWidth={3}
                            >
                                {p.score.toFixed(2)}
                            </text>
                        </g>
                    );
                })}
            </svg>
            {/* Tooltip */}
            {hover && (
                <div
                    className="absolute z-10 pointer-events-none bg-surface-overlay border border-ink/[0.12] rounded-lg px-3 py-2 text-xs shadow-xl"
                    style={{
                        left: `calc(${(hover.x / W) * 100}% + 10px)`,
                        top: `calc(${(hover.y / H) * 100}% - 8px)`,
                        transform: 'translateY(-100%)',
                        maxWidth: 240,
                    }}
                >
                    <div className="font-bold text-text-primary mb-1">{tv(hover.p.brandModel)}</div>
                    {hover.p.systemVersion && (
                        <div className="text-text-muted mb-1">{t('benchmark_version_label')}: V{hover.p.systemVersion}</div>
                    )}
                    <div className="text-text-secondary">
                        {t('mtx_axis_score')}: <span className="text-text-primary font-semibold">{hover.p.score.toFixed(2)}</span>
                    </div>
                    <div className="text-text-secondary">
                        {t('mtx_axis_time')}: <span className="text-text-primary font-semibold">{hover.p.dateLabel}</span>
                        {hover.p.approx && <span className="text-amber-700 ml-1">≈</span>}
                    </div>
                </div>
            )}
        </div>
    );
};

export default VehicleMatrixTab;
