import LightSelect from '../../components/LightSelect';
import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ArrowRight } from "lucide-react";
import { type ReportVehicle } from "../../api";
import { useLanguage } from "../../contexts/LanguageContext";
import { useMetricsTranslation } from "../../hooks/useMetricsTranslation";
import { PlatformAction } from "../../components/platform/PlatformUI";
const vkey = (v: ReportVehicle) =>
  `${v.brand_model}__${v.system_version ?? ""}`;
type Props = {
  vehicles: ReportVehicle[];
  generating: boolean;
  onGenerate: (args: {
    own: ReportVehicle;
    competitors: ReportVehicle[];
    name: string;
    lang: "zh" | "en";
    withAppendix: boolean;
  }) => void;
};
export default function StandardReportForm({
  vehicles,
  generating,
  onGenerate,
}: Props) {
  const { language } = useLanguage();
  const c = (zh: string, en: string) => (language === "zh" ? zh : en);
  const { tv } = useMetricsTranslation();
  const formRef = useRef<HTMLElement>(null);
  const previousStep = useRef(0);
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (previousStep.current !== step) {
      formRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
      previousStep.current = step;
    }
  }, [step]);
  const [ownKey, setOwnKey] = useState("");
  const [compKeys, setCompKeys] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [lang, setLang] = useState<"zh" | "en">("zh");
  const [appendix, setAppendix] = useState(false);
  const own = vehicles.find((v) => vkey(v) === ownKey);
  const comps = vehicles.filter(
    (v) => compKeys.includes(vkey(v)) && vkey(v) !== ownKey,
  );
  const names = [
    c("选择受测与参考版本", "Choose versions"),
    c("设置报告内容", "Configure report"),
    c("确认并创建", "Review and create"),
  ];
  return (
    <div className="rp-create-layout">
      <aside className="rp-create-aside">
        <h3>{c("创建标准报告", "Create a standard report")}</h3>
        <div>
          {names.map((n, i) => (
            <button
              className={"rp-step " + (step === i ? "is-active" : "")}
              disabled={generating || (i > 0 && !own)}
              key={i}
              onClick={() => setStep(i)}
              aria-current={step === i ? "step" : undefined}
            >
              <span>{i < step ? <Check size={12} /> : i + 1}</span>
              {n}
            </button>
          ))}
        </div>
        <p>
          {c(
            "配置过程中不会生成报告。确认后才会提交生成任务，可在“我的报告”中查看进度。",
            "No generation takes place while configuring. Submit after review, then monitor progress in My reports.",
          )}
        </p>
      </aside>
      <section
        ref={formRef}
        className="rp-form"
        style={{ scrollMarginTop: 20 }}
      >
        <span className="pf-eyebrow">0{step + 1} / REPORT SETUP</span>
        <h3 style={{ marginTop: 14 }}>{names[step]}</h3>
        <p>
          {step === 0
            ? c(
                "以一个受测版本为核心，选择需要比较的参考版本。",
                "Choose a tested version and any reference versions.",
              )
            : step === 1
              ? c(
                  "明确报告名称、语言和附录范围。",
                  "Set the report name, language and appendix.",
                )
              : c(
                  "确认下面的范围，再开始生成。",
                  "Review the scope before starting generation.",
                )}
        </p>
        {step === 0 ? (
          <>
            <label htmlFor="report-own" className="field-label">
              {c("受测车型与系统版本", "Tested model and software version")} *
            </label>
            <LightSelect
              id="report-own"
              value={ownKey}
              disabled={generating}
              onChange={(e) => {
                setOwnKey(e.target.value);
                setCompKeys((ks) => ks.filter((k) => k !== e.target.value));
              }}
            >
              <option value="">
                {c("选择受测版本", "Select a tested version")}
              </option>
              {vehicles.map((v) => (
                <option key={vkey(v)} value={vkey(v)}>
                  {tv(v.brand_model)} · {v.system_version}
                </option>
              ))}
            </LightSelect>
            <label className="field-label">
              {c("参考版本（可选）", "Reference versions (optional)")} ·{" "}
              {comps.length} {c("已选", "selected")}
            </label>
            <div className="rp-vehicle-options">
              {vehicles
                .filter((v) => vkey(v) !== ownKey)
                .map((v) => (
                  <button
                    className="rp-vehicle-option"
                    key={vkey(v)}
                    disabled={generating}
                    aria-pressed={compKeys.includes(vkey(v))}
                    onClick={() =>
                      setCompKeys((ks) =>
                        ks.includes(vkey(v))
                          ? ks.filter((k) => k !== vkey(v))
                          : [...ks, vkey(v)],
                      )
                    }
                  >
                    <div>
                      {tv(v.brand_model)}
                      <small>{v.system_version || "—"}</small>
                    </div>
                    {compKeys.includes(vkey(v)) ? (
                      <Check size={15} />
                    ) : (
                      <span className="pf-subtle">+</span>
                    )}
                  </button>
                ))}
            </div>
            {vehicles.length === 0 && (
              <p className="pf-subtle">
                {c(
                  "暂无可选择的车型，请返回报告平台重新加载。",
                  "No versions available. Reload the report platform.",
                )}
              </p>
            )}
          </>
        ) : step === 1 ? (
          <>
            <label htmlFor="report-name" className="field-label">
              {c("报告名称", "Report name")}
            </label>
            <input
              id="report-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                own
                  ? `${tv(own.brand_model)} · ${c("座舱 AI 对标报告", "Cockpit AI benchmark")}`
                  : ""
              }
            />
            <label htmlFor="report-language" className="field-label">
              {c("报告语言", "Report language")}
            </label>
            <LightSelect
              id="report-language"
              value={lang}
              onChange={(e) => setLang(e.target.value as "zh" | "en")}
            >
              <option value="zh">中文</option>
              <option value="en">English</option>
            </LightSelect>
            <label
              style={{
                display: "flex",
                gap: 12,
                alignItems: "flex-start",
                marginTop: 28,
                fontSize: 12,
              }}
            >
              <input
                style={{ marginTop: 3 }}
                type="checkbox"
                checked={appendix}
                onChange={(e) => setAppendix(e.target.checked)}
              />
              <div>
                {c("包含用例附录", "Include case appendix")}
                <p
                  className="pf-subtle"
                  style={{ margin: "8px 0", lineHeight: 1.9 }}
                >
                  {c(
                    "附录可能较长。需要逐条核查测试依据时再勾选。",
                    "The appendix can be lengthy. Include it when individual evidence needs review.",
                  )}
                </p>
              </div>
            </label>
          </>
        ) : (
          <div className="rp-summary">
            <dl>
              <dt>{c("报告名称", "Report name")}</dt>
              <dd>
                {name.trim() ||
                  `${tv(own?.brand_model || "")} · ${c("座舱 AI 对标报告", "Cockpit AI benchmark")}`}
              </dd>
              <dt>{c("受测版本", "Tested version")}</dt>
              <dd>
                {tv(own?.brand_model || "")}
                <br />
                {own?.system_version}
              </dd>
              <dt>{c("参考版本", "References")}</dt>
              <dd>
                {comps.length
                  ? comps.map((v) => (
                      <div key={vkey(v)}>
                        {tv(v.brand_model)} · {v.system_version}
                      </div>
                    ))
                  : c("无，生成单车报告", "None; single-model report")}
              </dd>
              <dt>{c("语言", "Language")}</dt>
              <dd>{lang === "zh" ? "中文" : "English"}</dd>
              <dt>{c("用例附录", "Case appendix")}</dt>
              <dd>
                {appendix ? c("包含", "Included") : c("不包含", "Not included")}
              </dd>
            </dl>
          </div>
        )}
        <div className="rp-form-footer">
          <button
            className="pf-back"
            style={{ margin: 0 }}
            disabled={step === 0 || generating}
            onClick={() => setStep((s) => s - 1)}
          >
            <ChevronLeft size={15} />
            {c("上一步", "Back")}
          </button>
          {step < 2 ? (
            <PlatformAction
              disabled={!own}
              onClick={() => setStep((s) => s + 1)}
            >
              {c("下一步", "Continue")}
            </PlatformAction>
          ) : (
            <PlatformAction
              disabled={!own || generating}
              onClick={() => {
                if (own)
                  onGenerate({
                    own,
                    competitors: comps,
                    name:
                      name.trim() ||
                      `${tv(own.brand_model)} · ${c("座舱 AI 对标报告", "Cockpit AI benchmark")}`,
                    lang,
                    withAppendix: appendix,
                  });
              }}
            >
              {generating
                ? c("正在创建…", "Creating…")
                : c("确认并生成报告", "Create report")}
            </PlatformAction>
          )}
        </div>
      </section>
    </div>
  );
}
