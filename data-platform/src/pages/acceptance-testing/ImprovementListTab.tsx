import { useSearchParams } from "react-router-dom";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ClipboardList,
  Star,
  ChevronDown,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
  ChevronsUpDown,
} from "lucide-react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { useMetricsTranslation } from "../../hooks/useMetricsTranslation";
import {
  useComparison,
  parseVehicleKey,
} from "../vehicle-scores/ComparisonContext";
import {
  getVehicleAcceptanceCompletion,
  getVehicleAcceptanceTaskDetail,
  type VehicleAcceptanceTaskDetail,
} from "../../api";
import VehicleSelector from "../vehicle-scores/VehicleSelector";
import FailedCasesPanel from "./FailedCasesPanel";

// 验收梯度固定顺序与短标签，与 ScenarioBaselineTab 保持一致。
const GRADE_SHORT_KEY: Record<string, string> = {
  基础验收: "baseline_grade_basic",
  中等验收: "baseline_grade_medium",
  进阶验收: "baseline_grade_advanced",
};
// 判定「未完成/做得不好」的阈值。
const SOLO_RATE_THRESHOLD = 0.8; // 未选参考：本品完成率低于此值即列入
const GAP_THRESHOLD = 0.1; // 选了参考：参考领先本品超过此值即列入

const fmtPct = (rate: number | null): string =>
  rate == null ? "—" : `${(rate * 100).toFixed(0)}%`;

// 完成率 → 色温（红→黄→绿），与场景基线一致。
const HEAT_RED_FLOOR = 0.3;
const heatBg = (rate: number | null): string => {
  if (rate == null) return "transparent";
  const r = Math.max(0, Math.min(1, rate));
  const norm = Math.max(0, (r - HEAT_RED_FLOOR) / (1 - HEAT_RED_FLOOR));
  return `hsl(${norm * 140}, 34%, 34%)`;
};

// 可排序的列。
type SortKey =
  | "domain"
  | "grade"
  | "task"
  | "primaryRate"
  | "refRate"
  | "gap"
  | "failedCount";

// 验收梯度由易到难的序号（用于梯度列排序）。
const GRADE_RANK: Record<string, number> = {
  基础验收: 0,
  中等验收: 1,
  进阶验收: 2,
};

// 一条改进项（本品在某 功能域×梯度×任务类型 下的低完成/落后表现）。
interface ImproveItem {
  domain: string;
  grade: string;
  task: string;
  primaryRate: number | null;
  refRate: number | null;
  gap: number | null; // refRate - primaryRate（选了参考时）
  caseCount: number;
  failedCount: number; // 失败用例数（success/failed/unknown 里的 failed）
}

/** 把一台车所有功能域的 task-detail 结果压平成 { 域|梯度|任务 -> 统计 }。 */
const flatten = (
  details: (VehicleAcceptanceTaskDetail | null)[],
): Map<string, { rate: number | null; cases: number; failed: number }> => {
  const map = new Map<
    string,
    { rate: number | null; cases: number; failed: number }
  >();
  for (const d of details) {
    if (!d) continue;
    for (const g of d.by_grade) {
      for (const tk of g.task_details) {
        map.set(`${d.function_domain}|${g.grade}|${tk.task_detail}`, {
          rate: tk.completion_rate,
          cases: tk.case_count,
          failed: tk.failed,
        });
      }
    }
  }
  return map;
};

const ImprovementListTab: React.FC<{ hideSelector?: boolean }> = ({
  hideSelector = false,
}) => {
  const { t } = useTranslation();
  const { td, tt } = useMetricsTranslation();
  const { primaryKey, competitorKeys, getVehicleLabel } = useComparison();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<ImproveItem[]>([]);
  const [refCount, setRefCount] = useState(0);
  // 当前展开的改进项行 key（手风琴：一次展开一个）。
  const [routeParams, setRouteParams] = useSearchParams();
  const selectionScope = `${primaryKey || ""}::${competitorKeys.join(",")}`;
  const expanded =
    routeParams.get("task_scope") === selectionScope
      ? routeParams.get("task")
      : null;
  const setExpanded = (value: string | null) =>
    setRouteParams((p) => {
      if (value) {
        p.set("task", value);
        p.set("task_scope", selectionScope);
      } else {
        p.delete("task");
        p.delete("task_scope");
      }
      return p;
    });
  // 表头排序：null = 用默认排序（gap 降序 / 完成率升序）。
  const [sort, setSort] = useState<{
    key: SortKey;
    dir: "asc" | "desc";
  } | null>(null);
  const reqIdRef = useRef(0);

  const competitorSig = competitorKeys.join(",");

  useEffect(() => {
    if (!primaryKey) {
      setItems([]);
      setRefCount(0);
      return;
    }
    const reqId = ++reqIdRef.current;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        // 1) 先拿本品各功能域列表（有样本的域）。
        const primary = parseVehicleKey(primaryKey);
        const completion = await getVehicleAcceptanceCompletion(
          primary.brand_model,
          primary.system_version,
        );
        const domains = completion.by_domain
          .filter((x) => Object.values(x.grades).some((s) => s.case_count > 0))
          .map((x) => x.function_domain);

        // 2) 本品每个功能域拉任务类型细分。
        const primaryDetails = await Promise.all(
          domains.map((dom) =>
            getVehicleAcceptanceTaskDetail(
              primary.brand_model,
              dom,
              primary.system_version,
            ).catch(() => null),
          ),
        );

        // 3) 参考车型（若有）：每个功能域拉细分，跨车按任务类型求均值。
        const refKeys = competitorKeys;
        const refMaps = await Promise.all(
          refKeys.map(async (k) => {
            const rv = parseVehicleKey(k);
            const details = await Promise.all(
              domains.map((dom) =>
                getVehicleAcceptanceTaskDetail(
                  rv.brand_model,
                  dom,
                  rv.system_version,
                ).catch(() => null),
              ),
            );
            return flatten(details);
          }),
        );

        if (reqId !== reqIdRef.current) return; // 已被更新的请求取代

        const primaryMap = flatten(primaryDetails);
        const hasRef = refMaps.length > 0;

        const refRateFor = (key: string): number | null => {
          if (!hasRef) return null;
          const rates = refMaps
            .map((m) => m.get(key)?.rate)
            .filter((r): r is number => r != null);
          if (rates.length === 0) return null;
          return rates.reduce((a, b) => a + b, 0) / rates.length;
        };

        const collected: ImproveItem[] = [];
        for (const [key, val] of primaryMap.entries()) {
          const [domain, grade, task] = key.split("|");
          const primaryRate = val.rate;
          const refRate = refRateFor(key);

          if (hasRef) {
            // 选了参考：参考完成率明显高于本品才算「做得不好」。
            if (refRate == null || primaryRate == null) continue;
            const gap = refRate - primaryRate;
            if (gap > GAP_THRESHOLD) {
              collected.push({
                domain,
                grade,
                task,
                primaryRate,
                refRate,
                gap,
                caseCount: val.cases,
                failedCount: val.failed,
              });
            }
          } else {
            // 未选参考：本品完成率低于阈值即列入。
            if (primaryRate != null && primaryRate < SOLO_RATE_THRESHOLD) {
              collected.push({
                domain,
                grade,
                task,
                primaryRate,
                refRate: null,
                gap: null,
                caseCount: val.cases,
                failedCount: val.failed,
              });
            }
          }
        }

        // 排序：有参考按 gap 降序；无参考按本品完成率升序。
        collected.sort((a, b) => {
          if (hasRef) return (b.gap ?? 0) - (a.gap ?? 0);
          return (a.primaryRate ?? 0) - (b.primaryRate ?? 0);
        });

        setItems(collected);
        setRefCount(refMaps.length);
      } catch (e: any) {
        if (reqId === reqIdRef.current)
          setError(e?.message || t("at_improve_load_failed"));
      } finally {
        if (reqId === reqIdRef.current) setLoading(false);
      }
    })();
  }, [primaryKey, competitorSig]);

  const gradeShort = (grade: string): string => {
    const key = GRADE_SHORT_KEY[grade];
    if (!key) return grade;
    const r = t(key);
    return r === key ? grade : r;
  };

  const hasRef = refCount > 0;
  const primary = primaryKey ? parseVehicleKey(primaryKey) : null;
  // 展开表格的列数（用于展开行的 colSpan）。
  const colCount = 5 + (hasRef ? 2 : 0);

  // 点击表头：同列切换升/降序，换列默认降序（文本列默认升序）。
  const toggleSort = (key: SortKey) => {
    setExpanded(null);
    setSort((prev) => {
      const textCol = key === "domain" || key === "grade" || key === "task";
      if (prev?.key === key)
        return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
      return { key, dir: textCol ? "asc" : "desc" };
    });
  };

  // 排序后的列表：无 sort 时用默认排序（后端返回时已按 gap/完成率排好）。
  const sortedItems = useMemo(() => {
    if (!sort) return items;
    const { key, dir } = sort;
    const sign = dir === "asc" ? 1 : -1;
    const val = (it: ImproveItem): number | string => {
      switch (key) {
        case "domain":
          return td(it.domain);
        case "grade":
          return GRADE_RANK[it.grade] ?? 99;
        case "task":
          return it.task;
        case "primaryRate":
          return it.primaryRate ?? -1;
        case "refRate":
          return it.refRate ?? -1;
        case "gap":
          return it.gap ?? -Infinity;
        case "failedCount":
          return it.failedCount;
      }
    };
    return [...items].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      if (typeof va === "string" && typeof vb === "string")
        return sign * va.localeCompare(vb, "zh");
      return sign * ((va as number) - (vb as number));
    });
  }, [items, sort, td]);

  // 可排序表头单元格。
  const SortableTh: React.FC<{
    col: SortKey;
    label: string;
    center?: boolean;
  }> = ({ col, label, center }) => {
    const active = sort?.key === col;
    return (
      <th
        onClick={() => toggleSort(col)}
        className={clsx(
          "px-4 py-3 font-semibold border-b border-ink/[0.08] cursor-pointer select-none transition-colors hover:text-text-primary",
          active ? "text-text-primary" : "text-text-secondary",
          center ? "text-center" : "text-left",
        )}
      >
        <span
          className={clsx(
            "inline-flex items-center gap-1",
            center && "justify-center",
          )}
        >
          {label}
          {active ? (
            sort!.dir === "asc" ? (
              <ArrowUp className="w-3.5 h-3.5" />
            ) : (
              <ArrowDown className="w-3.5 h-3.5" />
            )
          ) : (
            <ChevronsUpDown className="w-3.5 h-3.5 opacity-40" />
          )}
        </span>
      </th>
    );
  };

  return (
    <div className="space-y-4">
      {/* 车型选择：本品 + 参考，始终显示 */}
      <div className="bg-surface-raised p-5 rounded-xl border border-ink/[0.08]">
        <div className="text-xs text-text-muted mb-2">
          {t("at_select_hint")}
        </div>
        {!hideSelector && <VehicleSelector />}
      </div>

      {/* 标题 + 说明 */}
      <div className="flex flex-wrap items-center gap-2">
        <ClipboardList className="w-5 h-5 text-secondary" />
        <h2 className="text-lg font-bold text-text-primary">
          {t("at_improve_title")}
        </h2>
      </div>
      <p className="text-xs text-text-muted -mt-1">{t("at_improve_desc")}</p>

      {!primaryKey ? (
        <div className="bg-blue-100 border border-blue-200 text-blue-700 px-4 py-6 rounded-lg text-center">
          {t("at_improve_need_primary")}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5 text-text-secondary">
              <Star className="w-3.5 h-3.5 text-amber-700" />
              {t("baseline_primary")}：{getVehicleLabel(primaryKey)}
            </span>
            <span className="text-text-muted">
              {hasRef
                ? t("at_improve_ref_target", { count: refCount })
                : t("at_improve_ref_none", {
                    threshold: fmtPct(SOLO_RATE_THRESHOLD),
                  })}
            </span>
          </div>

          {loading ? (
            <div className="text-sm text-text-muted px-4 py-8 text-center">
              {t("at_improve_loading")}
            </div>
          ) : error ? (
            <div className="bg-rose-100 border border-rose-200 text-rose-700 px-4 py-6 rounded-lg flex items-center justify-center gap-2">
              <AlertTriangle className="w-4 h-4" /> {error}
            </div>
          ) : items.length === 0 ? (
            <div className="bg-emerald-100 border border-emerald-200 text-emerald-700 px-4 py-8 rounded-lg text-center">
              {t("at_improve_empty")}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between text-xs text-text-muted">
                <span>
                  {hasRef
                    ? t("at_improve_gap_hint")
                    : t("at_improve_solo_hint")}
                </span>
                <span className="font-semibold text-text-secondary">
                  {t("at_improve_count", { count: items.length })}
                </span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-ink/[0.08]">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-surface-raised">
                      <SortableTh col="domain" label={t("at_col_domain")} />
                      <SortableTh col="grade" label={t("at_col_grade")} />
                      <SortableTh col="task" label={t("at_col_task")} />
                      <SortableTh
                        col="primaryRate"
                        label={t("at_col_primary_rate")}
                        center
                      />
                      {hasRef && (
                        <SortableTh
                          col="refRate"
                          label={t("at_col_ref_rate")}
                          center
                        />
                      )}
                      {hasRef && (
                        <SortableTh col="gap" label={t("at_col_gap")} center />
                      )}
                      <SortableTh
                        col="failedCount"
                        label={t("at_col_failed")}
                        center
                      />
                    </tr>
                  </thead>
                  <tbody>
                    {sortedItems.map((it) => {
                      const rowKey = `${it.domain}|${it.grade}|${it.task}`;
                      const isOpen = expanded === rowKey;
                      return (
                        <React.Fragment key={rowKey}>
                          <tr
                            tabIndex={0}
                            aria-expanded={isOpen}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setExpanded(isOpen ? null : rowKey);
                              }
                            }}
                            onClick={() => setExpanded(isOpen ? null : rowKey)}
                            className={clsx(
                              "cursor-pointer transition-colors group",
                              isOpen ? "bg-ink/[0.04]" : "hover:bg-ink/[0.03]",
                            )}
                            title={t("at_expand_hint")}
                          >
                            <td className="px-4 py-3 border-b border-ink/[0.06] text-text-secondary whitespace-nowrap">
                              <span className="inline-flex items-center gap-1.5">
                                <ChevronDown
                                  className={clsx(
                                    "w-4 h-4 text-text-muted transition-transform",
                                    isOpen ? "" : "-rotate-90",
                                  )}
                                />
                                {td(it.domain)}
                              </span>
                            </td>
                            <td className="px-4 py-3 border-b border-ink/[0.06] text-text-muted whitespace-nowrap">
                              {gradeShort(it.grade)}
                            </td>
                            <td className="px-4 py-3 border-b border-ink/[0.06] text-text-primary">
                              {tt(it.task)}
                            </td>
                            <td className="px-4 py-3 border-b border-ink/[0.06] text-center tabular-nums">
                              <span
                                className="inline-block px-2 py-0.5 rounded font-semibold text-text-inverse"
                                style={{
                                  backgroundColor: heatBg(it.primaryRate),
                                }}
                              >
                                {fmtPct(it.primaryRate)}
                              </span>
                            </td>
                            {hasRef && (
                              <td className="px-4 py-3 border-b border-ink/[0.06] text-center tabular-nums text-text-secondary">
                                {fmtPct(it.refRate)}
                              </td>
                            )}
                            {hasRef && (
                              <td className="px-4 py-3 border-b border-ink/[0.06] text-center tabular-nums font-semibold text-rose-700">
                                {it.gap == null
                                  ? "—"
                                  : `+${(it.gap * 100).toFixed(0)}%`}
                              </td>
                            )}
                            <td className="px-4 py-3 border-b border-ink/[0.06] text-center tabular-nums font-semibold text-rose-700">
                              {it.failedCount}
                            </td>
                          </tr>
                          {isOpen && primary && (
                            <tr>
                              <td
                                colSpan={colCount}
                                className="border-b border-ink/[0.06] p-0"
                              >
                                <FailedCasesPanel
                                  brandModel={primary.brand_model}
                                  systemVersion={primary.system_version}
                                  functionDomain={it.domain}
                                  taskDetail={it.task}
                                  acceptanceGrade={it.grade}
                                />
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
};

export default ImprovementListTab;
