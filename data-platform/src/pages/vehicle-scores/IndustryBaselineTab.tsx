import {useTrialAccess, TRIAL_DOMAIN} from "../../contexts/TrialContext";
import { useEffect, useMemo, useState } from "react";
import {
  useComparison,
  parseVehicleKey,
  vehicleKey,
} from "./ComparisonContext";
import { useLanguage } from "../../contexts/LanguageContext";
import { useMetricsTranslation } from "../../hooks/useMetricsTranslation";
import {
  getVehicleAcceptanceTaskDetail,
  type VehicleAcceptanceTaskDetail,
} from "../../api";
import LightSelect from "../../components/LightSelect";
import {
  PlatformEmpty,
  PlatformSkeleton,
  PlatformAction,
} from "../../components/platform/PlatformUI";
import {
  industryRows,
  sortIndustryRows,
  type ComparisonMode,
} from "./industryComparison";
import TaskDetailCasesModal from "./TaskDetailCasesModal";
import IndustryOverviewPlot from "./IndustryOverviewPlot";
const GRADES = ["基础验收", "中等验收", "进阶验收"];
const DOMAINS = ["车控域", "出行域", "车书域", "娱乐域", "闲聊域", "创作域"];
export default function IndustryBaselineTab() {
  const {restricted:trial}=useTrialAccess();
  const { language } = useLanguage();
  const c = (zh: string, en: string) => (language === "zh" ? zh : en);
  const { td, tt } = useMetricsTranslation();
  const { vehicles, primaryKey, getVehicleLabel } = useComparison();
  const available = useMemo(
    () => vehicles.filter((v) => v.video_count > 0),
    [vehicles],
  );
  const allKeys = useMemo(() => available.map(vehicleKey), [available]);
  const [videoTask, setVideoTask] = useState<{
    task: string;
    grade: string;
  } | null>(null);
  const [referenceKeys, setReferenceKeys] = useState<string[] | null>(null);
  const [sortField, setSortField] = useState<
    "task" | "primary" | "reference" | "delta"
  >("task");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const keys =
    referenceKeys === null
      ? allKeys
      : referenceKeys.filter((k) => allKeys.includes(k));
  const [domain, setDomain] = useState(trial ? TRIAL_DOMAIN : "车控域"),
    [grade, setGrade] = useState("all"),
    [sortMetric, setSortMetric] = useState<ComparisonMode>("rate");
  useEffect(()=>{if(trial && domain!==TRIAL_DOMAIN)setDomain(TRIAL_DOMAIN)},[trial,domain]);
  const [data, setData] = useState<Record<string, VehicleAcceptanceTaskDetail>>(
      {},
    ),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(false),
    [retry, setRetry] = useState(0);
  const requested = [
    ...new Set([primaryKey, ...keys].filter(Boolean)),
  ] as string[];
  const signature = requested.join("|");
  useEffect(() => {
    let cancelled = false;
    const missing = requested.filter((k) => !data[domain + "@@" + k]);
    setError(false);
    if (!missing.length) {
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all(
      missing.map(async (k) => {
        const v = parseVehicleKey(k);
        return [
          domain + "@@" + k,
          await getVehicleAcceptanceTaskDetail(
            v.brand_model,
            domain,
            v.system_version,
          ),
        ] as const;
      }),
    )
      .then((entries) => {
        if (!cancelled)
          setData((old) => ({ ...old, ...Object.fromEntries(entries) }));
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [signature, domain, retry]);
  const unsortedRows = useMemo(
    () =>
      industryRows(
        primaryKey ? data[domain + "@@" + primaryKey] : undefined,
        keys.map((k) => data[domain + "@@" + k]),
        "rate",
        grade,
      ),
    [data, primaryKey, keys.join("|"), domain, grade],
  );
  const scoreRows = useMemo(
    () =>
      industryRows(
        primaryKey ? data[domain + "@@" + primaryKey] : undefined,
        keys.map((k) => data[domain + "@@" + k]),
        "score",
        grade,
      ),
    [data, primaryKey, keys.join("|"), domain, grade],
  );
  const scoresByKey = new Map(scoreRows.map((r) => [r.key, r]));
  const ratesByKey = new Map(unsortedRows.map((r) => [r.key, r]));
  const rows = sortIndustryRows(
    sortMetric === "rate" ? unsortedRows : scoreRows,
    sortField,
    sortDirection,
  ).map((r) => ratesByKey.get(r.key)!);
  const points = useMemo(() => {
    const references = keys.map((k) => data[domain + "@@" + k]);
    const rates = industryRows(undefined, references, "rate", grade);
    const scores = new Map(
      industryRows(undefined, references, "score", grade).map((r) => [
        r.key,
        r.reference,
      ]),
    );
    return rates.map((r) => ({
      task: r.task,
      grade: r.grade,
      rate: r.reference,
      score: scores.get(r.key) ?? null,
      cases: r.referenceCases,
    }));
  }, [data, keys.join("|"), domain, grade]);
  const sortBy = (
    metric: ComparisonMode,
    field: "primary" | "reference" | "delta",
  ) => {
    if (sortMetric === metric && sortField === field)
      setSortDirection((v) => (v === "desc" ? "asc" : "desc"));
    else {
      setSortMetric(metric);
      setSortField(field);
      setSortDirection("desc");
    }
  };
  const fmt = (v: number | null, mode: ComparisonMode) =>
    v === null
      ? "—"
      : mode === "rate"
        ? `${(v * 100).toFixed(1)}%`
        : v.toFixed(2);
  const delta = (v: number | null, mode: ComparisonMode) =>
    v === null
      ? "—"
      : `${v > 0 ? "+" : ""}${(v * (mode === "rate" ? 100 : 1)).toFixed(mode === "rate" ? 1 : 2)}`;
  const gradeName = (v: string) =>
    c(
      v.replace("验收", ""),
      v === GRADES[0] ? "Basic" : v === GRADES[1] ? "Intermediate" : "Advanced",
    );
  return (
    <section className="industry-comparison">
      <div className="industry-intro">
        <div>
          <h2>{c("场景表现", "Scenario performance")}</h2>
          <p>
            {primaryKey
              ? getVehicleLabel(primaryKey)
              : c("选择本品后查看差距", "Select your model to compare")}{" "}
            <span>vs</span>{" "}
            {c(
              `所选 ${keys.length} 个车型 / 版本`,
              `${keys.length} selected model / versions`,
            )}
          </p>
        </div>
        <div className="industry-legend">
          <span>
            <i className="primary-dot" />
            {c("本品", "Your model")}
          </span>
          <span>
            <i className="reference-dot" />
            {c("行业参考", "Industry reference")}
          </span>
        </div>
      </div>
      <div className="industry-controls">
        <label>
          {c("功能域", "Domain")}
          <LightSelect
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            aria-label={c("选择功能域", "Choose domain")}
          >
            {DOMAINS.map((d) => (
              <option key={d} value={d}>
                {td(d)}
              </option>
            ))}
          </LightSelect>
        </label>
        <label>
          {c("验收梯度", "Acceptance level")}
          <LightSelect
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            aria-label={c("选择验收梯度", "Choose acceptance level")}
          >
            <option value="all">{c("全部梯度", "All levels")}</option>
            {GRADES.map((g) => (
              <option key={g} value={g}>
                {gradeName(g)}
              </option>
            ))}
          </LightSelect>
        </label>
      </div>
      <details className="industry-scope">
        <summary>
          {c("行业范围", "Reference scope")} · {keys.length}{" "}
          {c(
            "个版本 · 展开调整范围和查看总览",
            "versions · expand scope and overview",
          )}
        </summary>
        <div className="industry-scope-actions">
          <button onClick={() => setReferenceKeys(null)}>
            {c("全部受测版本", "All tested versions")}
          </button>
          <button onClick={() => setReferenceKeys([])}>
            {c("清空", "Clear")}
          </button>
        </div>
        <div className="industry-scope-options">
          {available.map((v) => {
            const key = vehicleKey(v),
              selected = keys.includes(key);
            return (
              <button
                key={key}
                aria-pressed={selected}
                onClick={() =>
                  setReferenceKeys(
                    selected ? keys.filter((k) => k !== key) : [...keys, key],
                  )
                }
              >
                {getVehicleLabel(key)}
                {key === primaryKey && <small>{c("本品", "Your model")}</small>}
              </button>
            );
          })}
        </div>
        <section className="industry-scope-overview">
          <h2>{c("场景总览（行业参考）", "Scenario overview (industry reference)")}</h2>
          <p className="pf-note">
            {c(
              "所选行业范围的任务分布：横轴为完成率，纵轴为得分。",
              "Task distribution in the selected reference scope: completion rate vs score.",
            )}
          </p>
          {loading ? (
            <PlatformSkeleton />
          ) : error ? (
            <PlatformEmpty
              error
              title={c("行业总览暂时无法读取", "Industry overview unavailable")}
            />
          ) : points.every((p) => p.rate === null || p.score === null) ? (
            <PlatformEmpty
              title={c(
                "当前行业范围暂无总览数据",
                "No overview data in this reference scope",
              )}
            />
          ) : (
            <IndustryOverviewPlot points={points} />
          )}
        </section>
      </details>
      <p className="pf-note">
        {c(
          "行业参考沿用所选车型的等权均值，默认包含本品。每项只统计有有效数值的版本，缺失数据显示“—”；差距为本品减行业参考。",
          "The reference is the equal-weight mean of selected versions, including your model by default. Each task uses available values; missing values remain blank. Delta = your model minus reference.",
        )}
      </p>
      {!primaryKey ? (
        <PlatformEmpty
          title={c("请选择本品车型与版本", "Select your model and version")}
        />
      ) : keys.length === 0 ? (
        <PlatformEmpty
          title={c("请选择行业参考对象", "Choose reference versions")}
        />
      ) : loading ? (
        <PlatformSkeleton />
      ) : error ? (
        <PlatformEmpty
          error
          title={c("对比数据暂时无法读取", "Comparison data unavailable")}
          action={
            <PlatformAction onClick={() => setRetry((n) => n + 1)}>
              {c("重试", "Retry")}
            </PlatformAction>
          }
        />
      ) : rows.length === 0 ? (
        <PlatformEmpty
          title={c("当前功能域暂无可对比的任务", "No tasks in this domain")}
        />
      ) : (
        <>
          <section className="pf-panel industry-result-card">
            <div className="industry-intro">
              <h2>{c("场景表现对比", "Scenario performance comparison")}</h2>
              <div className="industry-controls">
                <LightSelect
                  aria-label={c("排序数值", "Sort value")}
                  value={
                    sortField === "task" ? "task" : `${sortMetric}.${sortField}`
                  }
                  onChange={(e) => {
                    if (e.target.value === "task") setSortField("task");
                    else {
                      const [metric, field] = e.target.value.split(".");
                      setSortMetric(metric as ComparisonMode);
                      setSortField(field as typeof sortField);
                    }
                  }}
                >
                  <option value="task">
                    {c("默认任务顺序", "Task order")}
                  </option>
                  {(["rate", "score"] as const).flatMap((metric) =>
                    (["primary", "reference", "delta"] as const).map(
                      (field) => (
                        <option
                          key={`${metric}.${field}`}
                          value={`${metric}.${field}`}
                        >
                          {metric === "rate"
                            ? c("完成率", "Completion rate")
                            : c("得分", "Score")}{" "}
                          ·{" "}
                          {field === "primary"
                            ? c("本品", "Your model")
                            : field === "reference"
                              ? c("行业", "Industry")
                              : c("差距", "Delta")}
                        </option>
                      ),
                    ),
                  )}
                </LightSelect>
                <LightSelect
                  aria-label={c("排序方向", "Sort direction")}
                  value={sortDirection}
                  onChange={(e) =>
                    setSortDirection(e.target.value as "asc" | "desc")
                  }
                  disabled={sortField === "task"}
                >
                  <option value="desc">{c("从高到低", "High to low")}</option>
                  <option value="asc">{c("从低到高", "Low to high")}</option>
                </LightSelect>
              </div>
            </div>
            <div className="industry-table-wrap">
              <table className="industry-table">
                <thead>
                  <tr>
                    <th rowSpan={2}>{c("任务 / 梯度", "Task / level")}</th>
                    <th
                      colSpan={3}
                      scope="colgroup"
                      className="industry-metric-group"
                    >
                      {c("完成率", "Completion rate")}
                    </th>
                    <th
                      colSpan={3}
                      scope="colgroup"
                      className="industry-metric-group industry-score-start"
                    >
                      {c("得分（5分制）", "Score (out of 5)")}
                    </th>
                  </tr>
                  <tr>
                    {(["rate", "score"] as const).flatMap((metric) =>
                      (["primary", "reference", "delta"] as const).map(
                        (field) => (
                          <th
                            key={`${metric}.${field}`}
                            className={
                              metric === "score" && field === "primary"
                                ? "industry-score-start"
                                : ""
                            }
                            scope="col"
                            aria-sort={
                              sortMetric === metric && sortField === field
                                ? sortDirection === "asc"
                                  ? "ascending"
                                  : "descending"
                                : "none"
                            }
                          >
                            <button onClick={() => sortBy(metric, field)}>
                              {field === "primary"
                                ? c("本品", "Your model")
                                : field === "reference"
                                  ? c("行业参考", "Reference")
                                  : metric === "rate"
                                    ? c("差距（百分点）", "Delta (pp)")
                                    : c("差距（分）", "Delta (score)")}
                              {sortMetric === metric && sortField === field
                                ? sortDirection === "desc"
                                  ? " ↓"
                                  : " ↑"
                                : " ↕"}
                            </button>
                          </th>
                        ),
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.key}>
                      <td>
                        <button
                          className="industry-task-link"
                          onClick={() =>
                            setVideoTask({ task: row.task, grade: row.grade })
                          }
                          title={c("查看任务视频", "View task videos")}
                        >
                          {tt(row.task)} <span aria-hidden="true">↗</span>
                        </button>
                        <small>
                          {gradeName(row.grade)} ·{" "}
                          {c(
                            `${row.primaryCases} 个本品用例`,
                            `${row.primaryCases} model cases`,
                          )}
                        </small>
                      </td>
                      {(["rate", "score"] as const).flatMap((metric) => {
                        const values =
                          metric === "rate" ? row : scoresByKey.get(row.key)!;
                        return (["primary", "reference", "delta"] as const).map(
                          (field) => {
                            const value = values[field];
                            const tone =
                              field === "primary"
                                ? "industry-primary-value"
                                : field === "delta"
                                  ? value === null || Math.abs(value) < 0.0005
                                    ? "industry-neutral"
                                    : value > 0
                                      ? "industry-ahead"
                                      : "industry-behind"
                                  : "";
                            return (
                              <td
                                key={`${metric}.${field}`}
                                className={`${tone} ${metric === "score" && field === "primary" ? "industry-score-start" : ""}`}
                              >
                                {field === "delta"
                                  ? delta(value, metric)
                                  : fmt(value, metric)}
                                {field === "reference" && (
                                  <small>
                                    {c(
                                      `${values.referenceVehicles} 个参考版本`,
                                      `${values.referenceVehicles} reference versions`,
                                    )}
                                  </small>
                                )}
                              </td>
                            );
                          },
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
      {videoTask &&
        primaryKey &&
        (() => {
          const primary = parseVehicleKey(primaryKey);
          const options = [...new Set([primaryKey, ...keys])].map((k) => {
            const v = parseVehicleKey(k);
            return {
              brandModel: v.brand_model,
              systemVersion: v.system_version,
              label: getVehicleLabel(k),
            };
          });
          return (
            <TaskDetailCasesModal
              key={`${primaryKey}||${domain}||${videoTask.grade}||${videoTask.task}`}
              brandModel={primary.brand_model}
              systemVersion={primary.system_version}
              functionDomain={domain}
              taskDetail={videoTask.task}
              acceptanceTag={videoTask.grade}
              vehicleLabel={getVehicleLabel(primaryKey)}
              vehicleOptions={options}
              onClose={() => setVideoTask(null)}
            />
          );
        })()}
    </section>
  );
}
