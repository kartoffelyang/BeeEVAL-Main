import { useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { useComparison } from "./vehicle-scores/ComparisonContext";
import { listVehiclesForAggregation } from "../api";
import { useLanguage } from "../contexts/LanguageContext";
import VehicleSelector from "./vehicle-scores/VehicleSelector";
import AcceptanceTab from "./vehicle-scores/AcceptanceTab";
import ImprovementListTab from "./acceptance-testing/ImprovementListTab";
import {
  PlatformHeader,
  PlatformTabs,
  PlatformEmpty,
  PlatformAction,
} from "../components/platform/PlatformUI";
export default function AcceptanceTesting() {
  const { language } = useLanguage();
  const c = (zh: string, en: string) => (language === "zh" ? zh : en);
  const { setVehicles } = useComparison();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "improvement" ? "improvement" : "baseline";
  const setTab = (value: string) =>
    setParams((p) => {
      p.set("tab", value);
      return p;
    });
  const [error, setError] = useState(false);
  const load = () => {
    setError(false);
    listVehiclesForAggregation()
      .then(setVehicles)
      .catch(() => setError(true));
  };
  useEffect(load, [setVehicles]);
  return (
    <div className="pf-page">
      <PlatformHeader
        index="03"
        eyebrow="ACCEPTANCE"
        title={c("验收分析", "Acceptance")}
        description={c(
          "检查基线表现，定位需要改进的任务，再回到具体用例核查。",
          "Review completion baselines, identify tasks to improve and inspect case evidence.",
        )}
      />
      <section className="pf-panel">
        <h2 className="mb-3">
          {c(
            "选择本品与参考车型 / 版本",
            "Choose your model and reference versions",
          )}
        </h2>
        <VehicleSelector />
      </section>
      <PlatformTabs
        items={[
          { key: "baseline", label: c("验收基线", "Baseline") },
          { key: "improvement", label: c("任务改进", "Task improvement") },
        ]}
        value={tab}
        onChange={setTab}
      />
      {error ? (
        <PlatformEmpty
          error
          title={c("车型数据暂时无法读取", "Unable to load models")}
          action={
            <PlatformAction onClick={load}>{c("重试", "Retry")}</PlatformAction>
          }
        />
      ) : tab === "baseline" ? (
        <AcceptanceTab />
      ) : (
        <ImprovementListTab hideSelector />
      )}
    </div>
  );
}
