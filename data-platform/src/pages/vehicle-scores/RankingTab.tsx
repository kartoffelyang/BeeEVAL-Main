import React, { useState, useMemo, useEffect } from "react";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import clsx from "clsx";
import { useComparison, vehicleKey } from "./ComparisonContext";
import {
  getAllVehicleScores,
  getVehicleAcceptanceCompletion,
} from "../../api";
import { useTranslation } from "react-i18next";
import { useMetricsTranslation } from "../../hooks/useMetricsTranslation";
import { PlatformTabs } from "../../components/platform/PlatformUI";
import TrialMoreHint from "../../components/TrialMoreHint";

// 6 个规范功能域展示顺序，与后端 STANDARD_FUNCTION_DOMAINS 一致。
const STANDARD_FUNCTION_DOMAINS = [
  "车控域",
  "出行域",
  "车书域",
  "娱乐域",
  "闲聊域",
  "创作域",
];

// 验收梯度顺序 + 英文翻译键（中文回落梯度全名）。
const GRADES_ORDER = ["基础验收", "中等验收", "进阶验收"];
const GRADE_I18N_KEY: Record<string, string> = {
  基础验收: "acceptance_grade_basic",
  中等验收: "acceptance_grade_medium",
  进阶验收: "acceptance_grade_advanced",
};

type SortDir = "asc" | "desc";

// 通用排行榜行：总分 + 各功能域分（值可为 null）。
interface RankRow {
  key: string;
  brand_model: string;
  system_version: string | null;
  eval_version?: string | null;
  overall: number | null;
  domainValues: Record<string, number | null>;
}

// All values use one restrained palette; overall columns carry the emphasis.
const scoreCell = (val: number | null | undefined) =>
  val == null ? (
    <span className="rank-missing">—</span>
  ) : (
    <span className="rank-value">{val.toFixed(2)}</span>
  );
const completionCell = (val: number | null | undefined) =>
  val == null ? (
    <span className="rank-missing">—</span>
  ) : (
    <span className="rank-value">
      {(val * 100).toFixed(0)}
      <small>%</small>
    </span>
  );

// 通用可排序排行榜表格。列 = # + 车辆 + 总分 + 各功能域。
// renderCell 决定单元格样式（均分 or 完成率）；domains 为要展示的功能域列。
const RankTable: React.FC<{
  rows: RankRow[];
  domains: string[];
  overallLabel: string;
  renderCell: (val: number | null | undefined) => React.ReactNode;
  primaryKey: string | null;
  onSelect: (key: string) => void;
  domainLabel: (d: string) => string;
}> = ({
  rows,
  domains,
  overallLabel,
  renderCell,
  primaryKey,
  onSelect,
  domainLabel,
}) => {
  const { t } = useTranslation();
  const { tv } = useMetricsTranslation();
  const [sortKey, setSortKey] = useState<string>("overall");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir((p) => (p === "desc" ? "asc" : "desc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      let aVal: number | string | null;
      let bVal: number | string | null;
      if (sortKey === "brand_model") {
        aVal = a.brand_model;
        bVal = b.brand_model;
      } else if (sortKey === "overall") {
        aVal = a.overall;
        bVal = b.overall;
      } else {
        aVal = a.domainValues[sortKey] ?? null;
        bVal = b.domainValues[sortKey] ?? null;
      }
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortDir === "desc" ? -cmp : cmp;
    });
  }, [rows, sortKey, sortDir]);

  const SortIcon: React.FC<{ col: string }> = ({ col }) => {
    if (sortKey !== col)
      return <ArrowUpDown className="w-3 h-3 text-text-primary/30" />;
    return sortDir === "desc" ? (
      <ArrowDown className="w-3 h-3 text-secondary" />
    ) : (
      <ArrowUp className="w-3 h-3 text-secondary" />
    );
  };

  const sortedHeader = (key: string, label: string, overall = false) => (
    <th
      key={key}
      scope="col"
      className={clsx(
        key === "brand_model" && "rank-model-heading",
        overall && "rank-overall",
      )}
      aria-sort={
        sortKey === key
          ? sortDir === "desc"
            ? "descending"
            : "ascending"
          : "none"
      }
    >
      <button onClick={() => handleSort(key)}>
        {label}
        <SortIcon col={key} />
      </button>
    </th>
  );
  return (
    <div className="rank-table-wrap">
      <table className="rank-table">
        <thead>
          <tr>
            <th scope="col" className="rank-position-heading">
              #
            </th>
            {sortedHeader("brand_model", t("col_vehicle"))}
            {sortedHeader("overall", overallLabel, true)}
            {domains.map((d) => sortedHeader(d, domainLabel(d)))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr
              key={row.key}
              className={clsx(row.key === primaryKey && "rank-selected")}
              onClick={() => onSelect(row.key)}
            >
              <td className="rank-position">
                <span className={clsx(i < 3 && "rank-leading")}>
                  {String(i + 1).padStart(2, "0")}
                </span>
              </td>
              <td className="rank-model">
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelect(row.key);
                  }}
                  aria-pressed={row.key === primaryKey}
                >
                  <span className="rank-model-name">
                    {tv(row.brand_model)}
                    {row.eval_version && (
                      <span className={clsx("eval-ver-badge", row.eval_version === "V1" && "is-v1")}>
                        {row.eval_version}
                      </span>
                    )}
                    {row.key === primaryKey && (
                      <span className="rank-self">{t("badge_self")}</span>
                    )}
                  </span>
                  {row.system_version && <small>{row.system_version}</small>}
                </button>
              </td>
              <td className="rank-overall">{renderCell(row.overall)}</td>
              {domains.map((d) => (
                <td key={d}>{renderCell(row.domainValues[d])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// 单个梯度下、某车各功能域完成率（合并该梯度的成功/已判定）。
const gradeDomainValues = (
  byDomain: Array<{ function_domain: string; grades: Record<string, any> }>,
  grade: string,
): { overall: number | null; domains: Record<string, number | null> } => {
  const domains: Record<string, number | null> = {};
  let sumSuccess = 0;
  let sumJudged = 0;
  for (const d of byDomain) {
    const s = d.grades?.[grade];
    if (!s) {
      domains[d.function_domain] = null;
      continue;
    }
    const judged = s.success + s.failed;
    domains[d.function_domain] = judged > 0 ? s.success / judged : null;
    sumSuccess += s.success;
    sumJudged += judged;
  }
  return { overall: sumJudged > 0 ? sumSuccess / sumJudged : null, domains };
};

const RankingTab: React.FC = () => {
  const { t } = useTranslation();
  const { td } = useMetricsTranslation();
  const { vehicles, primaryKey, setPrimaryKey } = useComparison();

  const [view, setView] = useState<"metric" | "acceptance">("metric");
  const [verFilter, setVerFilter] = useState<"all" | "V2" | "V1">("all");

  // 指标排行榜行（功能域均分）。
  const [metricRows, setMetricRows] = useState<RankRow[]>([]);
  // 验收梯度排行榜：{grade -> RankRow[]}。
  const [gradeRows, setGradeRows] = useState<Record<string, RankRow[]>>({});
  const [metricLoading, setMetricLoading] = useState(true);
  const [gradeLoading, setGradeLoading] = useState(false);
  const [gradeSignature, setGradeSignature] = useState('');
  const inventorySignature = JSON.stringify(vehicles.filter(v => v.has_cache).map(v => [vehicleKey(v), v.last_computed_at, v.video_count]));
  useEffect(() => {
    let cancelled = false;
    const allowed = new Set(vehicles.filter(v => v.has_cache).map(vehicleKey));
    if (!allowed.size) { setMetricRows([]); setMetricLoading(false); return; }
    setMetricLoading(true);
    // One authorized summary request. Do not wait for the other ranking mode.
    getAllVehicleScores().then(snapshots => {
      if (cancelled) return;
      setMetricRows(snapshots.filter(v => allowed.has(vehicleKey(v))).map(snap => ({
        key: vehicleKey(snap), brand_model: snap.brand_model, system_version: snap.system_version,
        eval_version: snap.eval_version ?? vehicles.find(x => vehicleKey(x) === vehicleKey(snap))?.eval_version,
        overall: snap.overall_score,
        domainValues: Object.fromEntries(snap.function_domain_scores.map(d => [d.dimension_key, d.avg_score])),
      })));
    }).catch(() => { if (!cancelled) setMetricRows([]); })
      .finally(() => { if (!cancelled) setMetricLoading(false); });
    return () => { cancelled = true; };
  }, [inventorySignature]);

  useEffect(() => {
    if (view !== 'acceptance' || gradeSignature === inventorySignature) return;
    let cancelled = false;
    const cached = vehicles.filter(v => v.has_cache);
    setGradeLoading(true);
    const rows: Record<string, RankRow[]> = {基础验收: [], 中等验收: [], 进阶验收: []};
    Promise.all(cached.map(async v => {
      try {
        const acc = await getVehicleAcceptanceCompletion(v.brand_model, v.system_version);
        for (const grade of GRADES_ORDER) {
          const {overall, domains} = gradeDomainValues(acc.by_domain, grade);
          rows[grade].push({key: vehicleKey(v), brand_model: v.brand_model,
            system_version: v.system_version, eval_version: v.eval_version, overall, domainValues: domains});
        }
      } catch { /* Preserve the existing per-model failure isolation. */ }
    })).then(() => {
      if (!cancelled) { setGradeRows(rows); setGradeSignature(inventorySignature); setGradeLoading(false); }
    });
    return () => { cancelled = true; };
  }, [view, inventorySignature, gradeSignature]);
  const loading = view === 'metric' ? metricLoading : gradeLoading || gradeSignature !== inventorySignature;

  // 各榜实际出现的功能域（保持规范顺序 + 兜底非规范域）。
  const metricDomains = useMemo(() => {
    const set = new Set<string>();
    metricRows.forEach((r) =>
      Object.keys(r.domainValues).forEach((d) => set.add(d)),
    );
    return [
      ...STANDARD_FUNCTION_DOMAINS.filter((d) => set.has(d)),
      ...[...set].filter((d) => !STANDARD_FUNCTION_DOMAINS.includes(d)),
    ];
  }, [metricRows]);

  const acceptanceDomains = useMemo(() => {
    const set = new Set<string>();
    Object.values(gradeRows).forEach((rows) =>
      rows.forEach((r) =>
        Object.keys(r.domainValues).forEach((d) => set.add(d)),
      ),
    );
    return [
      ...STANDARD_FUNCTION_DOMAINS.filter((d) => set.has(d)),
      ...[...set].filter((d) => !STANDARD_FUNCTION_DOMAINS.includes(d)),
    ];
  }, [gradeRows]);

  const gradeLabel = (g: string) => {
    const key = GRADE_I18N_KEY[g];
    if (!key) return g;
    const r = t(key);
    return r === key ? g : r;
  };

  const matchVer = (ev?: string | null) =>
    verFilter === "all" || (verFilter === "V2" ? Boolean(ev?.startsWith("V2")) : ev === "V1");
  const visibleMetricRows = useMemo(() => metricRows.filter(r => matchVer(r.eval_version)), [metricRows, verFilter]);

  if (loading) {
    return (
      <div className="text-center py-12 text-text-muted">
        {t("loading_ranking")}
      </div>
    );
  }

  return (
    <div className="ranking-workspace space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PlatformTabs
          items={[
            { key: "metric", label: t("ranking_metric_title") },
            { key: "acceptance", label: t("ranking_acceptance_title") },
          ]}
          value={view}
          onChange={(value) => setView(value as typeof view)}
        />
        <div className="flex items-center gap-1.5 text-xs">
          {(["all", "V2", "V1"] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setVerFilter(opt)}
              className={clsx(
                "px-2.5 py-1 rounded border transition-colors",
                verFilter === opt
                  ? "bg-secondary text-text-inverse border-secondary font-medium"
                  : "border-ink/[0.12] text-text-muted hover:text-text-primary",
              )}
            >
              {opt === "all" ? t("all_versions_short", { defaultValue: "全部" }) : opt}
            </button>
          ))}
        </div>
      </div>

      {view === "metric" ? (
        <div className="space-y-3">
          <h3 className="rank-section-title">
            {t("ranking_metric_title")}
            <span>{visibleMetricRows.length}</span>
          </h3>
          <RankTable
            rows={visibleMetricRows}
            domains={metricDomains}
            overallLabel={t("col_overall_avg")}
            renderCell={scoreCell}
            primaryKey={primaryKey}
            onSelect={setPrimaryKey}
            domainLabel={td}
          />
        </div>
      ) : (
        <div className="space-y-6">
          <p className="text-xs text-text-muted">
            {t("ranking_acceptance_desc")}
          </p>
          {GRADES_ORDER.map((grade) => (
            <div key={grade} className="space-y-2.5">
              <h3 className="rank-section-title">
                {gradeLabel(grade)}
                <span className="text-xs font-normal text-text-muted">
                  {t("ranking_acceptance_grade_sub")}
                </span>
              </h3>
              <RankTable
                rows={(gradeRows[grade] || []).filter(r => matchVer(r.eval_version))}
                domains={acceptanceDomains}
                overallLabel={t("ranking_overall_completion")}
                renderCell={completionCell}
                primaryKey={primaryKey}
                onSelect={setPrimaryKey}
                domainLabel={td}
              />
            </div>
          ))}
        </div>
      )}

      {/* 体验账号：榜单已按车型白名单裁剪，提示还有更多车型 */}
      <TrialMoreHint />
    </div>
  );
};

export default RankingTab;
