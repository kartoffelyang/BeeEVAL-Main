import LightSelect from "../components/LightSelect";
import { useSearchParams } from "react-router-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, LayoutGrid, List } from "lucide-react";
import { listVehiclesForAggregation, type VehicleListItem } from "../api";
import { useLanguage } from "../contexts/LanguageContext";
import { useComparison, vehicleKey } from "./vehicle-scores/ComparisonContext";
import { useMetricsTranslation } from "../hooks/useMetricsTranslation";
import OverviewTab from "./vehicle-scores/OverviewTab";
import IndustryBaselineTab from "./vehicle-scores/IndustryBaselineTab";
import RankingTab from "./vehicle-scores/RankingTab";
import TestCases from "./TestCases";
import VehiclePK from "./VehiclePK";
import VehicleSelector from "./vehicle-scores/VehicleSelector";
import TrialMoreHint from "../components/TrialMoreHint";
import {
  PlatformHeader,
  PlatformTabs,
  PlatformEmpty,
  PlatformSkeleton,
  PlatformAction,
} from "../components/platform/PlatformUI";

const vehiclePhotoRevisions: Record<string, string> = {
  "问界M9": "b7c9f90c92b1",
  "魏牌二代蓝山": "7b18eb417fe5",
  "Freelander": "19b1f65d38d5",
  "大众与众08": "0b0036ef07cd",
  "小米澎程N90": "333716c41026",
  "奔驰E260L": "2026-haoya",
  "奇瑞风云T9L-灵犀智舱2.0": "qinhu-blue-1",
};

function ModelImage({ name }: { name: string }) {
  const { tv } = useMetricsTranslation();
  const [ext, setExt] = useState(0);
  const extensions = ["webp", "png", "jpg", "jpeg"];
  const photoRevision = vehiclePhotoRevisions[name];
  const revision = ext === 0 && photoRevision ? `?v=${photoRevision}` : "";
  useEffect(() => setExt(0), [name]);
  return ext < extensions.length ? (
    <img
      src={`${import.meta.env.BASE_URL}vehicles/${encodeURIComponent(name)}.${extensions[ext]}${revision}`}
      alt={tv(name)}
      onError={() => setExt((i) => i + 1)}
      loading="lazy"
    />
  ) : (
    <span className="pf-subtle">{tv(name)}</span>
  );
}
function BenchmarkInner() {
  const { language } = useLanguage();
  const c = (zh: string, en: string) => (language === "zh" ? zh : en);
  const { tv } = useMetricsTranslation();
  const ctx = useComparison();
  const {
    vehicles,
    setVehicles,
    primaryKey,
    setPrimaryKey,
    fetchSnapshot,
    snapshots,
  } = ctx;
  const [routeParams, setRouteParams] = useSearchParams();
  const routeTab = routeParams.get("tab") || "library";
  const legacyView =
    routeParams.get("detail") === "1" ? routeParams.get("view") : null;
  const tab =
    routeTab === "library" && ["scenario", "videos"].includes(legacyView || "")
      ? legacyView!
      : routeTab;
  const activeTab = tab === "scenario" ? "baseline" : tab;
  const detail = routeParams.get("detail") === "1" && tab === "library";
  const setTab = (value: string) =>
    setRouteParams((p) => {
      p.set("tab", value);
      p.delete("detail");
      p.delete("view");
      return p;
    });
  const setDetail = (value: boolean) =>
    setRouteParams((p) => {
      value ? p.set("detail", "1") : p.delete("detail");
      return p;
    });
  const [status, setStatus] = useState("all");
  const [verFilter, setVerFilter] = useState("all");
  const [sort, setSort] = useState("date");
  const [view, setView] = useState("grid");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setVehicles(await listVehiclesForAggregation());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [setVehicles]);
  useEffect(() => {
    void load();
  }, [load]);
  const filtered = useMemo(
    () =>
      vehicles
        .filter(
          (v) =>
            (status === "all" ||
              (status === "scored" ? v.has_cache : !v.has_cache)) &&
            (verFilter === "all" ||
              (verFilter === "V2"
                ? Boolean(v.eval_version?.startsWith("V2"))
                : v.eval_version === verFilter)),
        )
        .sort((a, b) =>
          sort === "score"
            ? (b.overall_score ?? -1) - (a.overall_score ?? -1)
            : sort === "name"
              ? tv(a.brand_model).localeCompare(tv(b.brand_model), "zh-CN")
              : (b.capture_date || "").localeCompare(a.capture_date || ""),
        ),
    [vehicles, status, verFilter, sort, tv],
  );
  const pick = (key: string) => {
    ctx.competitorKeys.forEach(ctx.removeCompetitor);
    setPrimaryKey(key);
    void fetchSnapshot(key);
    setDetail(true);
  };
  const switchTab = (key: string) => {
    setDetail(false);
    setTab(key);
    if (["ranking", "baseline", "scenario", "videos"].includes(key)) {
      const k =
        primaryKey ||
        vehicleKey(
          vehicles.find((v) => v.has_cache) ||
            vehicles[0] || { brand_model: "", system_version: null },
        );
      if (k !== "||") {
        setPrimaryKey(k);
        void fetchSnapshot(k);
      }
    }
  };
  useEffect(() => {
    if (
      !primaryKey &&
      vehicles.length &&
      ["baseline", "scenario", "videos"].includes(tab)
    ) {
      const key = vehicleKey(vehicles.find((v) => v.has_cache) || vehicles[0]);
      setPrimaryKey(key);
      void fetchSnapshot(key);
    }
  }, [tab, vehicles, primaryKey, setPrimaryKey, fetchSnapshot]);
  const navigation = (
    <PlatformTabs
      items={[
        {
          key: "library",
          label: c("车型得分", "Vehicle scores"),
          count: vehicles.length,
        },
        { key: "videos", label: c("测试视频", "Test videos") },
        { key: "compare", label: c("用例对比", "Case comparison") },
        { key: "baseline", label: c("场景表现", "Scenario performance") },
        { key: "ranking", label: c("排行榜", "Ranking") },
      ]}
      value={activeTab}
      onChange={switchTab}
    />
  );
  const current = vehicles.find((v) => vehicleKey(v) === primaryKey);
  const snap = primaryKey ? snapshots[primaryKey] : null;
  const sourceNote = (
    <p className="pf-note">
      {c(
        "评分按受测车型与系统版本呈现。不同任务、样本与采集条件会影响可比性，请结合测试过程判断。",
        "Scores belong to the tested model and software version. Review task coverage, samples and test conditions before comparing.",
      )}
    </p>
  );
  if (detail && current) {
    return (
      <div className="pf-page bm-detail">
        {navigation}
        <button className="pf-back" onClick={() => setDetail(false)}>
          <ArrowLeft size={14} />
          {c("返回车型库", "Back to model library")}
        </button>
        <div className="bm-detail-intro">
          <div>
            <div className="pf-eyebrow">VEHICLE INTELLIGENCE PROFILE</div>
            <h1 style={{ marginTop: 18 }}>{tv(current.brand_model)}</h1>
            <p className="pf-subtle" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span>{current.system_version || c("版本未提供", "Version unavailable")}</span>
              {(snap?.eval_version || current.eval_version) && (
                <span className={"eval-ver-badge" + ((snap?.eval_version || current.eval_version) === "V1" ? " is-v1" : "")}>
                  {snap?.eval_version || current.eval_version}
                </span>
              )}
            </p>
            <div className="bm-detail-score">
              <strong>{(snap ? snap.overall_score : current.overall_score)?.toFixed(2) ?? "—"}</strong>
              <div>
                <small>{c("综合总评分 / 5", "Overall score / 5")}</small>
                <b>
                  {snap?.overall_domain_count ?? "—"} {c("个功能域", "domains")}{" "}
                  · {snap?.overall_sample_count ?? "—"} {c("样本", "samples")}
                </b>
              </div>
            </div>
          </div>
          <ModelImage name={current.brand_model} />
        </div>
        <div className="pf-toolbar">
          <span className="pf-subtle">
            {c("当前受测版本", "Tested version")}
          </span>
          <LightSelect
            className="pf-select"
            aria-label={c("切换车型版本", "Switch tested model")}
            value={primaryKey || ""}
            onChange={(e) => pick(e.target.value)}
          >
            {vehicles.map((v) => (
              <option key={vehicleKey(v)} value={vehicleKey(v)}>
                {tv(v.brand_model)} · {v.system_version}
              </option>
            ))}
          </LightSelect>
        </div>
        <section className="pf-panel">
          <h2 className="mb-3">
            {c(
              "车型与版本 · 可增加一台车对比",
              "Models and versions · compare another model",
            )}
          </h2>
          <VehicleSelector maxCompetitors={1} />
        </section>
        <div className="bm-original-scores">
          <OverviewTab />
        </div>
        {sourceNote}
      </div>
    );
  }
  return (
    <div className="pf-page bm-workspace">
      <PlatformHeader
        index="01"
        eyebrow="INTELLIGENCE BENCHMARK"
        title={c("标杆分析", "Benchmark")}
        description={c(
          "从车型与受测版本出发，比较能力结构，回到具体的测试证据。",
          "Explore tested model versions, compare capability structures and review the evidence.",
        )}
      />
      {navigation}
      {loading && vehicles.length === 0 ? (
        <PlatformSkeleton />
      ) : error && vehicles.length === 0 ? (
        <PlatformEmpty
          error
          title={c("车型数据暂时无法读取", "Unable to load model data")}
          description={c(
            "请重试，或确认评测服务已连接。",
            "Retry or check the evaluation service connection.",
          )}
          action={
            <PlatformAction onClick={load}>
              {c("重新加载", "Retry")}
            </PlatformAction>
          }
        />
      ) : tab === "library" ? (
        <>
          <div className="pf-toolbar">
            <div className="pf-toolbar-left">
              <LightSelect
                className="pf-select"
                aria-label={c("评测状态", "Evaluation status")}
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="all">{c("全部版本", "All versions")}</option>
                <option value="scored">{c("已有评分", "Scored")}</option>
                <option value="planned">
                  {c("待评测", "Awaiting evaluation")}
                </option>
              </LightSelect>
              <LightSelect
                className="pf-select"
                aria-label={c("评分版本", "Scoring version")}
                value={verFilter}
                onChange={(e) => setVerFilter(e.target.value)}
              >
                <option value="all">{c("全部评分版本", "All scoring versions")}</option>
                <option value="V2">{c("V2（V2.0 / V2.1）", "V2 (V2.0 / V2.1)")}</option>
                <option value="V2.1">V2.1</option>
                <option value="V2.0">V2.0</option>
              </LightSelect>
              <LightSelect
                className="pf-select"
                aria-label={c("车型排序", "Sort models")}
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                <option value="date">
                  {c("按采集时间", "Collection date")}
                </option>
                <option value="score">
                  {c("按评分从高到低", "Score, high to low")}
                </option>
                <option value="name">{c("按车型名称", "Model name")}</option>
              </LightSelect>
            </div>
            <div className="pf-view-toggle">
              <button
                aria-label={c("列表视图", "List view")}
                aria-pressed={view === "list"}
                onClick={() => setView("list")}
              >
                <List size={16} />
              </button>
              <button
                aria-label={c("卡片视图", "Grid view")}
                aria-pressed={view === "grid"}
                onClick={() => setView("grid")}
              >
                <LayoutGrid size={16} />
              </button>
            </div>
          </div>
          <div className="pf-section-heading">
            <span className="pf-subtle">
              {c("显示", "Showing")} {filtered.length} {c("个版本", "versions")}
            </span>
          </div>
          {filtered.length ? (
            <div
              className={"bm-inventory " + (view === "grid" ? "is-grid" : "")}
            >
              {filtered.map((v) => {
                const k = vehicleKey(v);
                const pending = !v.has_cache;
                return (
                  <article className={"bm-row " + ""} key={k}>
                    <button
                      className="bm-image"
                      disabled={pending}
                      onClick={() => pick(k)}
                      aria-label={c("查看", "View") + " " + tv(v.brand_model)}
                    >
                      <ModelImage name={v.brand_model} />
                    </button>
                    <div>
                      <button
                        className="bm-model-title"
                        onClick={() => pick(k)}
                        disabled={pending}
                      >
                        {tv(v.brand_model)}
                        {v.eval_version && (
                          <span className={"eval-ver-badge" + (v.eval_version === "V1" ? " is-v1" : "")}>
                            {v.eval_version}
                          </span>
                        )}
                        {pending && (
                          <span className="pf-chip muted">
                            {c("待评测", "Pending")}
                          </span>
                        )}
                      </button>
                      <p className="bm-model-version">
                        {v.system_version || c("版本未提供", "No version")}
                      </p>
                      <div className="bm-model-meta">
                        <span>
                          {c("采集", "Collected")} {v.capture_date || "—"}
                        </span>
                        <span>{c("汇总评分", "Aggregate score")}</span>
                      </div>
                      <div className="bm-row-actions">
                        <button onClick={() => pick(k)} disabled={pending}>
                          {c("查看能力画像", "View profile")} ↗
                        </button>
                      </div>
                    </div>
                    <div className="bm-score">
                      <strong>{v.overall_score?.toFixed(2) ?? "—"}</strong>
                      <span>/ 5</span>
                      <div className="bm-score-track">
                        <i
                          style={{
                            width: `${((v.overall_score || 0) / 5) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <PlatformEmpty
              title={c("没有匹配的车型版本", "No matching versions")}
              description={c(
                "切换评测状态，或重置筛选。",
                "Change or clear the status filter.",
              )}
              action={
                <PlatformAction
                  secondary
                  onClick={() => {
                    setStatus("all");
                    setVerFilter("all");
                  }}
                >
                  {c("重置筛选", "Clear filters")}
                </PlatformAction>
              }
            />
          )}
          <TrialMoreHint />
        </>
      ) : tab === "compare" ? (
        <VehiclePK />
      ) : tab === "videos" ? (
        <>
          {current ? (
            <TestCases
              key={primaryKey}
              embedded
              lockedModel={current.brand_model}
              lockedVersion={current.system_version}
              hideBatchFilter
              modelVersionOptions={vehicles.map((v) => ({ value: vehicleKey(v), label: `${tv(v.brand_model)} · ${v.system_version || "—"}` }))}
              selectedModelVersion={primaryKey || ""}
              onModelVersionChange={(key) => { setPrimaryKey(key); void fetchSnapshot(key); }}
            />
          ) : (
            <PlatformEmpty
              title={c("请选择车型与版本", "Select a model and version")}
            />
          )}
        </>
      ) : tab === "ranking" ? (
        <RankingTab />
      ) : (
        <>
          <div className="pf-toolbar">
            <div className="pf-toolbar-left">
              <span className="text-sm text-muted">
                {c("本品", "Your model")}
              </span>
              <LightSelect
                className="pf-select"
                aria-label={c(
                  "选择本品车型和版本",
                  "Select your model and version",
                )}
                value={primaryKey || ""}
                onChange={(e) => {
                  setPrimaryKey(e.target.value);
                  void fetchSnapshot(e.target.value);
                }}
              >
                {vehicles.map((v) => (
                  <option key={vehicleKey(v)} value={vehicleKey(v)}>
                    {tv(v.brand_model)} · {v.system_version}
                  </option>
                ))}
              </LightSelect>
            </div>
          </div>
          <IndustryBaselineTab />
        </>
      )}
      {sourceNote}
    </div>
  );
}
export default BenchmarkInner;
