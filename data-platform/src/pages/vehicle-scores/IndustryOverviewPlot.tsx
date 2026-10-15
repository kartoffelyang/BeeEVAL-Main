import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMetricsTranslation } from "../../hooks/useMetricsTranslation";
const GRADE_I18N_KEY: Record<string, string> = {
  基础验收: "acceptance_grade_basic",
  中等验收: "acceptance_grade_medium",
  进阶验收: "acceptance_grade_advanced",
};
// 每个验收梯度一种颜色（由易到难：绿→琥珀→紫）。
const GRADE_COLOR: Record<string, string> = {
  基础验收: "#6b8060",
  中等验收: "#a78b49",
  进阶验收: "#8a7b96",
};

// 散点：一个细分任务 = 一个点。x=完成率(0-1)，y=得分(0-5)。
interface Point {
  task: string;
  grade: string;
  rate: number | null; // 完成率 0-1
  score: number | null; // 5 分制
  cases: number; // 用例数（点大小参考）
}

// 「nice」刻度：给定数据 min/max，返回美观的 [lo, hi, step]。
const niceScale = (
  min: number,
  max: number,
  targetTicks = 5,
): [number, number, number] => {
  if (min === max) {
    min -= 0.5;
    max += 0.5;
  }
  const span = max - min;
  const rawStep = span / targetTicks;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : norm >= 1 ? 1 : 0.5) * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  return [lo, hi, step];
};

const IndustryOverviewPlot: React.FC<{ points: Point[] }> = ({ points }) => {
  const { t } = useTranslation();
  const { tt } = useMetricsTranslation();
  const [hover, setHover] = useState<{ p: Point; x: number; y: number } | null>(
    null,
  );

  // 只在两轴都有值的点参与坐标绘制；缺一轴的点忽略（无法定位）。
  const plotted = points.filter(
    (p) => p.rate != null && p.score != null,
  ) as Array<Point & { rate: number; score: number }>;

  // 轴范围：完成率用百分比(0-100)，得分用 0-5，均按数据分布收窄以美观。
  const [xLo, xHi, xStep] = useMemo(() => {
    if (plotted.length === 0) return [0, 100, 20] as [number, number, number];
    const xs = plotted.map((p) => p.rate * 100);
    return niceScale(Math.min(...xs), Math.max(...xs), 5);
  }, [plotted]);
  const [yLo, yHi, yStep] = useMemo(() => {
    if (plotted.length === 0) return [0, 5, 1] as [number, number, number];
    const ys = plotted.map((p) => p.score);
    return niceScale(Math.min(...ys), Math.max(...ys), 5);
  }, [plotted]);

  // 画布尺寸（viewBox 坐标系）——宽屏比例，撑满容器宽度。
  const W = 1200,
    H = 620;
  const M = { top: 24, right: 40, bottom: 56, left: 60 };
  const iw = W - M.left - M.right;
  const ih = H - M.top - M.bottom;

  const xPix = (rate: number) =>
    M.left + ((rate * 100 - xLo) / (xHi - xLo)) * iw;
  const yPix = (score: number) =>
    M.top + ih - ((score - yLo) / (yHi - yLo)) * ih;

  const xTicks: number[] = [];
  for (let v = xLo; v <= xHi + 1e-9; v += xStep) xTicks.push(Math.round(v));
  const yTicks: number[] = [];
  for (let v = yLo; v <= yHi + 1e-9; v += yStep)
    yTicks.push(Math.round(v * 10) / 10);

  // 点半径：按用例数轻微区分（5~11）。
  const rOf = (cases: number) =>
    Math.max(5, Math.min(11, 4 + Math.sqrt(cases)));

  // 标签防重叠：贪心布局。为每个点算出圆心 + 尝试 4 个候选位置（右/左/上/下），
  // 选第一个不与「已放置标签矩形 + 所有圆」碰撞的位置；都放不下则隐藏（仅 hover 显示）。
  const CH = 15; // 标签行高（估算）
  const CW = 12.5; // 每个中文字宽（估算，fontSize 12）
  const layout = useMemo(() => {
    const placed: Array<{ x1: number; y1: number; x2: number; y2: number }> =
      [];
    const circles = plotted.map((p) => ({
      cx: xPix(p.rate),
      cy: yPix(p.score),
      r: rOf(p.cases),
    }));
    // 重要性：得分高、完成率高的更靠上右，优先给标签（也可按用例数）。视觉上先放稀疏区。
    const order = plotted
      .map((p, i) => i)
      .sort((a, b) => plotted[b].cases - plotted[a].cases);

    const rectHit = (r: { x1: number; y1: number; x2: number; y2: number }) => {
      for (const q of placed) {
        if (r.x1 < q.x2 && r.x2 > q.x1 && r.y1 < q.y2 && r.y2 > q.y1)
          return true;
      }
      // 与其它圆碰撞也算（避免压点）
      for (const c of circles) {
        const nx = Math.max(r.x1, Math.min(c.cx, r.x2));
        const ny = Math.max(r.y1, Math.min(c.cy, r.y2));
        if ((nx - c.cx) ** 2 + (ny - c.cy) ** 2 < c.r * c.r) return true;
      }
      return false;
    };

    const result: Array<{
      x: number;
      y: number;
      anchor: "start" | "end";
      hidden: boolean;
    }> = new Array(plotted.length);
    for (const idx of order) {
      const p = plotted[idx];
      const cx = xPix(p.rate),
        cy = yPix(p.score),
        r = rOf(p.cases);
      const w = p.task.length * CW;
      // 候选：右、左、上、下（相对圆心）
      const cands: Array<{
        x: number;
        y: number;
        anchor: "start" | "end";
        rect: any;
      }> = [
        {
          x: cx + r + 5,
          y: cy + 4,
          anchor: "start",
          rect: {
            x1: cx + r + 5,
            y1: cy - CH / 2,
            x2: cx + r + 5 + w,
            y2: cy + CH / 2,
          },
        },
        {
          x: cx - r - 5,
          y: cy + 4,
          anchor: "end",
          rect: {
            x1: cx - r - 5 - w,
            y1: cy - CH / 2,
            x2: cx - r - 5,
            y2: cy + CH / 2,
          },
        },
        {
          x: cx,
          y: cy - r - 6,
          anchor: "middle" as any,
          rect: {
            x1: cx - w / 2,
            y1: cy - r - 6 - CH,
            x2: cx + w / 2,
            y2: cy - r - 6,
          },
        },
        {
          x: cx,
          y: cy + r + CH,
          anchor: "middle" as any,
          rect: {
            x1: cx - w / 2,
            y1: cy + r + 2,
            x2: cx + w / 2,
            y2: cy + r + 2 + CH,
          },
        },
      ];
      let done = false;
      for (const c of cands) {
        // 不越出绘图区
        if (
          c.rect.x1 < M.left ||
          c.rect.x2 > W - M.right ||
          c.rect.y1 < M.top ||
          c.rect.y2 > M.top + ih
        )
          continue;
        if (!rectHit(c.rect)) {
          placed.push(c.rect);
          result[idx] = {
            x: c.x,
            y: c.y,
            anchor: c.anchor as any,
            hidden: false,
          };
          done = true;
          break;
        }
      }
      if (!done) result[idx] = { x: cx, y: cy, anchor: "start", hidden: true };
    }
    return result;
  }, [plotted, xLo, xHi, yLo, yHi]);

  return (
    <div className="relative bg-surface-raised rounded-xl border border-ink/[0.08] p-3">
      <div className="industry-legend mb-3 flex-wrap">
        {[...new Set(points.map((p) => p.grade))].map((grade) => (
          <span key={grade} className="inline-flex items-center gap-2">
            <i
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: GRADE_COLOR[grade] }}
            />
            {GRADE_I18N_KEY[grade] ? t(GRADE_I18N_KEY[grade]) : grade}
          </span>
        ))}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height: "min(68vh, 640px)" }}
      >
        {/* 网格 + Y 轴刻度 */}
        {yTicks.map((v) => {
          const y = yPix(v);
          return (
            <g key={`y${v}`}>
              <line
                x1={M.left}
                y1={y}
                x2={W - M.right}
                y2={y}
                stroke="rgba(32,34,31,0.08)"
              />
              <text
                x={M.left - 8}
                y={y + 4}
                textAnchor="end"
                fontSize="13"
                fill="#94a3b8"
              >
                {v}
              </text>
            </g>
          );
        })}
        {/* X 轴刻度 */}
        {xTicks.map((v) => {
          const x = xPix(v / 100);
          return (
            <g key={`x${v}`}>
              <line
                x1={x}
                y1={M.top}
                x2={x}
                y2={M.top + ih}
                stroke="rgba(32,34,31,0.08)"
              />
              <text
                x={x}
                y={M.top + ih + 22}
                textAnchor="middle"
                fontSize="13"
                fill="#94a3b8"
              >
                {v}%
              </text>
            </g>
          );
        })}
        {/* 轴标题 */}
        <text
          x={M.left + iw / 2}
          y={H - 8}
          textAnchor="middle"
          fontSize="14"
          fill="#cbd5e1"
        >
          {t("ind_axis_rate")}
        </text>
        <text
          transform={`translate(18 ${M.top + ih / 2}) rotate(-90)`}
          textAnchor="middle"
          fontSize="14"
          fill="#cbd5e1"
        >
          {t("ind_axis_score")}
        </text>

        {/* 数据点 + 任务名标签（防重叠布局；放不下的隐藏，hover 时高亮显示）。
                    hover 的点放到最后渲染，确保其标签盖在其它元素之上。 */}
        {plotted
          .map((p, i) => ({ p, i }))
          .sort(
            (a, b) => (a.p === hover?.p ? 1 : 0) - (b.p === hover?.p ? 1 : 0),
          )
          .map(({ p, i }) => {
            const cx = xPix(p.rate);
            const cy = yPix(p.score);
            const r = rOf(p.cases);
            const lb = layout[i];
            const active = hover?.p === p;
            // 隐藏的标签平时不画，只有 hover 该点时才临时显示（放右侧）。
            const showLabel = !lb.hidden || active;
            const lx = lb.hidden ? cx + r + 5 : lb.x;
            const ly = lb.hidden ? cy + 4 : lb.y;
            const anchor = lb.hidden ? "start" : lb.anchor;
            return (
              <g
                key={`${p.grade}-${p.task}-${i}`}
                onMouseEnter={() => setHover({ p, x: cx, y: cy })}
                onMouseLeave={() => setHover(null)}
                style={{ cursor: "pointer" }}
              >
                <circle
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill={GRADE_COLOR[p.grade] || "#64748b"}
                  fillOpacity={active ? 1 : 0.82}
                  stroke={active ? "#fff" : "rgba(0,0,0,0.35)"}
                  strokeWidth={active ? 1.5 : 1}
                />
                {showLabel && (
                  <text
                    x={lx}
                    y={ly}
                    textAnchor={anchor as any}
                    fontSize="12"
                    fill={active ? "#20221f" : "#596151"}
                    style={{ paintOrder: "stroke", pointerEvents: "none" }}
                    stroke="#f7f7f3"
                    strokeWidth={active ? 4 : 3}
                  >
                    {tt(p.task)}
                  </text>
                )}
              </g>
            );
          })}
      </svg>

      {/* Tooltip（悬浮显示完成率/得分/用例数） */}
      {hover && (
        <div
          className="absolute z-10 pointer-events-none bg-surface-overlay border border-ink/[0.12] rounded-lg px-3 py-2 text-xs shadow-xl"
          style={{
            left: `calc(${(hover.x / W) * 100}% + 10px)`,
            top: `calc(${(hover.y / H) * 100}% - 8px)`,
            transform: "translateY(-100%)",
            maxWidth: 220,
          }}
        >
          <div className="font-bold text-ink mb-1">{tt(hover.p.task)}</div>
          <div className="flex items-center gap-1.5 text-text-secondary">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: GRADE_COLOR[hover.p.grade] }}
            />
            {GRADE_I18N_KEY[hover.p.grade]
              ? t(GRADE_I18N_KEY[hover.p.grade])
              : hover.p.grade}
          </div>
          <div className="text-text-secondary mt-1">
            {t("ind_axis_rate")}:{" "}
            <span className="text-ink font-semibold">
              {hover.p.rate != null
                ? `${(hover.p.rate * 100).toFixed(0)}%`
                : "—"}
            </span>
          </div>
          <div className="text-text-secondary">
            {t("ind_axis_score")}:{" "}
            <span className="text-ink font-semibold">
              {hover.p.score != null ? hover.p.score.toFixed(1) : "—"}
            </span>
          </div>
          <div className="text-text-muted mt-0.5">
            {t("ind_cases", { count: hover.p.cases })}
          </div>
        </div>
      )}
    </div>
  );
};

export default IndustryOverviewPlot;
