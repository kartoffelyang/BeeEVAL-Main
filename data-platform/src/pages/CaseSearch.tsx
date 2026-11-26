import {useTrialAccess, TRIAL_DOMAIN, TRIAL_DOMAINS} from "../contexts/TrialContext";
import { SCORE_RANGES, scoreBounds } from "../utils/scoreRanges";
import LightSelect from "../components/LightSelect";
import {
  FormEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "react-router-dom";
import { Search, ArrowRight, RotateCcw, ChevronDown } from "lucide-react";
import {
  getCaseContentSearch,
  getCaseSearchFacets,
  getAllResults,
  getFilterOptions,
  listVehiclesForAggregation,
} from "../api";
import { useComparison } from "./vehicle-scores/ComparisonContext";
import { useLanguage } from "../contexts/LanguageContext";
import { useMetricsTranslation } from "../hooks/useMetricsTranslation";
import ResultDetailModal from "../components/ResultDetailModal";
import VideoPlayerModal from "../components/VideoPlayerModal";
import TranslatedText from "../components/TranslatedText";
import {
  PlatformHeader,
  PlatformEmpty,
  PlatformSkeleton,
  PlatformAction,
} from "../components/platform/PlatformUI";
const STORE = "beeeval.case-query.v1";
const RECENTS = "beeeval.case-recents.v1";
const PAGE_SIZE = 30;
function stored(key: string, fallback: any) {
  try {
    return JSON.parse(sessionStorage.getItem(key) || "null") || fallback;
  } catch {
    return fallback;
  }
}
export default function CaseSearch() {
  const {trial,guardDomain}=useTrialAccess();
  const { language } = useLanguage();
  const { tv, td, tt } = useMetricsTranslation();
  const c = (zh: string, en: string) => (language === "zh" ? zh : en);
  const [params, setParams] = useSearchParams();
  const { vehicles, setVehicles } = useComparison();
  const [draft, setDraft] = useState(
    params.get("q") || params.get("case_id") || "",
  );
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [totalCases, setTotalCases] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [domains, setDomains] = useState<string[]>([]);
  const [taskTypes, setTaskTypes] = useState<string[]>([]);
  const [difficulties, setDifficulties] = useState<string[]>([]);
  const gradeLabel = (value: string) => ({ "基础验收": c("基础", "Basic"), "中等验收": c("中等", "Intermediate"), "进阶验收": c("进阶", "Advanced"), "未分类": c("未分类", "Unclassified") }[value] || value);
  const [loading, setLoading] = useState(true);
  const [searchProgress, setSearchProgress] = useState("");
  const [searchWarning, setSearchWarning] = useState("");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [ready, setReady] = useState(false);
  const [facetScope, setFacetScope] = useState<string | null>(null);
  const savedQuery = stored(STORE, {});
  const initialScroll = useRef<number | null>(
    (!params.toString() || savedQuery.query === params.toString()) &&
      savedQuery.scroll > 0
      ? savedQuery.scroll
      : null,
  );
  const resetOnMount = useRef(false);
  useLayoutEffect(() => {
    if (resetOnMount.current) return;
    resetOnMount.current = true;
    if (initialScroll.current === null) {
      const el = document.querySelector(".workspace-scroll");
      if (el) el.scrollTop = 0;
    }
  }, []);
  const [recent, setRecent] = useState<string[]>(() => stored(RECENTS, []));
  const [detail, setDetail] = useState<any>(null);
  const [pendingEvidence, setPendingEvidence] = useState<string | null>(null);
  async function openEvidence(row: any) {
    if (pendingEvidence) return;
    setPendingEvidence(String(row.id));setInputError("");
    try {
      const response = await getAllResults({ result_id: String(row.id), limit: 1, exclude_review: true });
      const full = response.data.find((item: any) => String(item.id) === String(row.id));
      if (!full) throw new Error('missing_evidence');
      setDetail(full);
    } catch { setInputError(c("证据加载失败，请重试。", "Unable to load evidence. Please retry.")); }
    finally { setPendingEvidence(null); }
  }
  const [video, setVideo] = useState<{ path: string; title: string } | null>(
    null,
  );
  const [inputError, setInputError] = useState("");
  const model = params.get("brand_model") || "";
  const version = params.get("system_version") || "";
  const signature = params.toString();
  useEffect(()=>{
    if(trial && params.get('function_domain') !== TRIAL_DOMAIN){
      const p=new URLSearchParams(params);p.set('function_domain',TRIAL_DOMAIN);
      p.delete('task_detail');p.delete('acceptance_tag');p.delete('page');setParams(p,{replace:true});
    }
  },[trial,signature]);
  const page = Math.max(0, Math.floor(Number(params.get("page"))) || 0);
  useEffect(() => {
    if (!signature) {
      const saved = stored(STORE, null);
      if (saved?.query) {
        setParams(saved.query, { replace: true });
        setDraft(
          new URLSearchParams(saved.query).get("q") ||
            new URLSearchParams(saved.query).get("case_id") ||
            "",
        );
      }
    }
    if (params.get("score") === "low")
      setParams(
        (p) => {
          p.delete("score");
          return p;
        },
        { replace: true },
      );
    setReady(true);
    listVehiclesForAggregation()
      .then(setVehicles)
      .catch(() => {});
    getFilterOptions()
      .then((r) => setDomains(trial ? TRIAL_DOMAINS : r.function_domains || []))
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const controller = new AbortController();
    setExpanded(null);
    setLoading(true);
    setError("");
    setSearchProgress("");
    let timer: ReturnType<typeof setTimeout>;
    const run = () =>
      getCaseContentSearch(
        {
          group_by_case: true,
          offset: page * PAGE_SIZE,
          limit: PAGE_SIZE,
          brand_model: model || undefined,
          system_version: version || undefined,
          function_domain: trial ? TRIAL_DOMAIN : params.get("function_domain") || undefined,
          case_id: params.get("case_id") || undefined,
          task_detail: params.get("task_detail") || undefined,
          acceptance_tag: params.get("acceptance_tag") || undefined,
          search: params.get("q") || undefined,
          video_name: params.get("video_name") || undefined,
          ...scoreBounds(params.get("score")),
          exclude_review: true,
          sort_by: "case_id",
          sort_order: "asc",
        },
        { signal: controller.signal },
      )
        .then((r: any) => {
          if (cancelled) return;
          if (r.status === "indexing") {
            setSearchProgress(
              c(
                `正在检索完整用例内容 ${r.scanned || 0} / ${r.total || "…"}`,
                `Searching full case content ${r.scanned || 0} / ${r.total || "…"}`,
              ),
            );
            timer = setTimeout(run, 2000);
            return;
          }
          if (!Number.isSafeInteger(r.total_cases)) throw new Error("invalid_case_page");
          const lastPage = Math.max(0, Math.ceil(r.total_cases / PAGE_SIZE) - 1);
          if (page > lastPage) {
            const next = new URLSearchParams(params);
            if (lastPage) next.set("page", String(lastPage));
            else next.delete("page");
            setParams(next, { replace: true });
            return;
          }
          setSearchProgress("");
          setSearchWarning(r.warning || "");
          setLoading(false);
          if (!cancelled) {
            setRows(r.data);
            setTotal(r.total);
            setTotalCases(r.total_cases);
            setFacetScope(JSON.stringify({brand_model: model || undefined, system_version: version || undefined,
              function_domain: trial ? TRIAL_DOMAIN : params.get('function_domain') || undefined, exclude_review: true}));
          }
        })
        .catch((e) => {
          if (!cancelled) {
            setLoading(false);
            setSearchProgress("");
            setError(
              e.response?.status === 403
                ? c(
                    "当前账号无权查看这些用例，请选择已开放的内容。",
                    "Your account does not have access to these cases.",
                  )
                : c(
                    "用例服务暂时不可用，请重试。",
                    "Case service unavailable. Please retry.",
                  ),
            );
          }
        });
    run();
    sessionStorage.setItem(
      STORE,
      JSON.stringify({
        query: signature,
        scroll:
          stored(STORE, {}).query === signature ? stored(STORE, {}).scroll : 0,
      }),
    );
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [signature, retry, ready, trial]);
  useEffect(() => {
    if (!facetScope) return;
    const controller = new AbortController();
    setTaskTypes([]);
    setDifficulties([]);
    getCaseSearchFacets(JSON.parse(facetScope), controller.signal).then((facets) => {
      if (!controller.signal.aborted) {
        setTaskTypes(facets.task_types || []);
        setDifficulties(facets.difficulties || []);
      }
    }).catch(() => {});
    return () => controller.abort();
  }, [facetScope]);
  useLayoutEffect(() => {
    if (!loading && initialScroll.current !== null) {
      const scroll = initialScroll.current;
      initialScroll.current = null;
      const el = document.querySelector(".workspace-scroll");
      if (el) el.scrollTop = scroll;
    }
  }, [loading]);
  useEffect(() => {
    const el = document.querySelector(".workspace-scroll");
    const save = () =>
      sessionStorage.setItem(
        STORE,
        JSON.stringify({ query: signature, scroll: el?.scrollTop || 0 }),
      );
    el?.addEventListener("scroll", save);
    return () => el?.removeEventListener("scroll", save);
  }, [signature]);
  useEffect(() => {
    setDraft(params.get("q") || params.get("case_id") || "");
  }, [signature]);
  const change = (key: string, value: string) => {
    if(key === "function_domain" && !guardDomain(value)) return;
    const p = new URLSearchParams(params);
    value ? p.set(key, value) : p.delete(key);
    if (key !== "page") p.delete("page");
    if (key === "brand_model") p.delete("system_version");
    if (["brand_model", "system_version", "function_domain"].includes(key)) {
      p.delete("task_detail");
      p.delete("acceptance_tag");
      setTaskTypes([]);
      setDifficulties([]);
    }
    setParams(p);
  };
  const submit = (e?: FormEvent, value = draft) => {
    e?.preventDefault();
    setInputError("");
    let q = value.trim();
    let p = new URLSearchParams(params);
    p.delete("q");
    p.delete("case_id");
    p.delete("video_name");
    p.delete("page");
    if (/^https?:\/\//i.test(q)) {
      try {
        const u = new URL(q);
        const id = u.searchParams.get("case_id");
        if (!id && !u.searchParams.get("video_name")) {
          setInputError(
            c(
              "链接中未找到用例编号，请粘贴报告里的用例编号或问题。",
              "No case ID in this link. Paste a case ID or question.",
            ),
          );
          return;
        }
        for (const k of [
          "case_id",
          "video_name",
          "brand_model",
          "system_version",
        ]) {
          const v = u.searchParams.get(k);
          v ? p.set(k, v) : p.delete(k);
        }
      } catch {
        setInputError(c("链接格式有误", "Invalid link"));
        return;
      }
    } else if (/^\d+$/.test(q)) {
      p.set("case_id", q);
    } else if (q) {
      p.set("q", q);
    }
    if (q) {
      const next = [q, ...recent.filter((x) => x !== q)].slice(0, 6);
      setRecent(next);
      sessionStorage.setItem(RECENTS, JSON.stringify(next));
    }
    setParams(p);
    setRetry((n) => n + 1);
  };
  const groups = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const r of rows) {
      const key = r.case_id ? `case:${r.case_id}` : `record:${r.id}`;
      const group = m.get(key);
      if (group) group.push(r);
      else m.set(key, [r]);
    }
    return Array.from(m.entries());
  }, [rows]);
  const models = Array.from(new Set(vehicles.map((v) => v.brand_model)));
  return (
    <div className="pf-page case-query">
      <PlatformHeader
        index="01"
        eyebrow="EVIDENCE FINDER"
        title={c("查用例", "Find case evidence")}
        description={c(
          "从报告中的用例编号或问题出发，找到对应车型、版本的测试证据。",
          "Find the tested model, version and evidence behind a case referenced in a report.",
        )}
      />
      <form className="case-search-box" onSubmit={submit}>
        <Search size={21} />
        <input
          aria-label={c(
            "用例编号、问题或证据链接",
            "Case ID, question or evidence link",
          )}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={c(
            "输入用例编号、问题关键词，或粘贴证据链接",
            "Case ID, question keywords or evidence link",
          )}
        />
        <button type="submit">
          {c("查找", "Search")}
          <ArrowRight size={16} />
        </button>
      </form>
      {inputError && (
        <p role="alert" className="text-rose-700">
          {inputError}
        </p>
      )}
      <p className="pf-note">
        {c(
          "用例编号精确匹配；关键词检索标准用例描述、实际提问、对话及回答。多个关键词用空格分隔。",
          "Search case questions, task descriptions, dialogue and answers. Separate keywords with spaces.",
        )}
      </p>
      {recent.length > 0 && (
        <div className="case-recents">
          <span>{c("最近查找", "Recent")}</span>
          {recent.map((q) => (
            <button key={q} onClick={() => submit(undefined, q)} title={q}>
              {q}
            </button>
          ))}
          <button
            aria-label={c("清除最近查找", "Clear recent searches")}
            onClick={() => {
              setRecent([]);
              sessionStorage.removeItem(RECENTS);
            }}
          >
            {c("清除", "Clear")}
          </button>
        </div>
      )}
      <div className="case-filters">
        <label>
          {c("车型", "Model")}
          <LightSelect
            value={model}
            onChange={(e) => change("brand_model", e.target.value)}
          >
            <option value="">{c("全部车型", "All models")}</option>
            {models.map((m) => (
              <option key={m} value={m}>
                {tv(m)}
              </option>
            ))}
          </LightSelect>
        </label>
        <label>
          {c("系统版本", "Version")}
          <LightSelect
            value={version}
            onChange={(e) => change("system_version", e.target.value)}
          >
            <option value="">{c("全部版本", "All versions")}</option>
            {Array.from(
              new Set(
                vehicles
                  .filter((v) => !model || v.brand_model === model)
                  .map((v) => v.system_version)
                  .filter(Boolean),
              ),
            ).map((v) => (
              <option key={v!}>{v}</option>
            ))}
          </LightSelect>
        </label>
        <label>
          {c("功能域", "Domain")}
          <LightSelect
            value={trial ? TRIAL_DOMAIN : params.get("function_domain") || ""}
            onChange={(e) => change("function_domain", e.target.value)}
          >
            <option value="">{c("全部功能域", "All domains")}</option>
            {domains.map((d) => (
              <option key={d} value={d}>
                {td(d)}
              </option>
            ))}
          </LightSelect>
        </label>
        <label>
          {c("任务类型", "Task type")}
          <LightSelect aria-label={c("任务类型", "Task type")} value={params.get("task_detail") || ""} onChange={(e) => change("task_detail", e.target.value)}>
            <option value="">{c("全部任务类型", "All task types")}</option>
            {taskTypes.map(task => <option key={task} value={task}>{task === "未分类" ? c("未分类", "Unclassified") : tt(task)}</option>)}
          </LightSelect>
        </label>
        <label>
          {c("难度", "Difficulty")}
          <LightSelect aria-label={c("难度", "Difficulty")} title={c("沿用题库的验收梯度标签，不按评估得分划分", "Uses official acceptance grades, independently of evaluation scores")} value={params.get("acceptance_tag") || ""} onChange={(e) => change("acceptance_tag", e.target.value)}>
            <option value="">{c("全部难度", "All difficulties")}</option>
            {["基础验收", "中等验收", "进阶验收", "未分类"].filter(grade => difficulties.includes(grade)).map(grade => <option key={grade} value={grade}>{gradeLabel(grade)}</option>)}
          </LightSelect>
        </label>
        <label>
          {c("得分", "Score")}
          <LightSelect
            title={c(
              "2、3、4分分别归入以该分数开头的区间；5分归入4–5分",
              "Lower bounds included; 5 is included in 4–5",
            )}
            value={params.get("score") || ""}
            onChange={(e) => change("score", e.target.value)}
          >
            <option value="">{c("全部得分", "All scores")}</option>
            {SCORE_RANGES.map((r) => (
              <option key={r.value} value={r.value}>
                {c(r.zh, r.en)}
              </option>
            ))}
          </LightSelect>
        </label>
        <button
          className="pf-back"
          onClick={() => {
            sessionStorage.removeItem(STORE);
            setParams({});
            setDraft("");
          }}
        >
          <RotateCcw size={14} />
          {c("重置", "Reset")}
        </button>
      </div>
      {[
        "case_id",
        "q",
        "brand_model",
        "system_version",
        "function_domain",
        "task_detail",
        "acceptance_tag",
        "score",
      ].some((key) => params.get(key)) && (
        <div className="case-active-filters">
          <span>{c("当前筛选", "Active filters")}</span>
          {[
            "case_id",
            "q",
            "brand_model",
            "system_version",
            "function_domain",
            "task_detail",
            "acceptance_tag",
            "score",
          ]
            .filter((key) => params.get(key))
            .map((key) => (
              <button
                key={key}
                title={params.get(key)!}
                onClick={() => change(key, "")}
              >
                {key === "brand_model"
                  ? tv(params.get(key)!)
                  : key === "function_domain"
                    ? td(params.get(key)!)
                    : key === "task_detail" ? tt(params.get(key)!)
                    : key === "acceptance_tag" ? gradeLabel(params.get(key)!)
                    : key === "score"
                      ? SCORE_RANGES.find((r) => r.value === params.get(key))?.[
                          language === "zh" ? "zh" : "en"
                        ] || params.get(key)
                      : params.get(key)}{" "}
                <span aria-hidden="true">×</span>
                <span className="sr-only">{c("清除筛选", "Clear filter")}</span>
              </button>
            ))}
        </div>
      )}
      {error && rows.length > 0 && (
        <p role="alert" className="pf-note text-rose-700">
          {c(
            "本次查询更新失败，保留上次成功结果。可点击查找重试。",
            "This update failed. Previous results are preserved; retry your search.",
          )}
        </p>
      )}
      {searchWarning && (
        <p role="status" className="pf-note">
          {searchWarning}
        </p>
      )}
      <div className="case-result-heading">
        <h2>{c("用例结果", "Case results")}</h2>
        <span aria-live="polite">
          {loading
            ? searchProgress || c("正在查找…", "Loading…")
            : c(`${totalCases} 个用例 · ${total} 条测试记录`, `${totalCases} ${totalCases === 1 ? "case" : "cases"} · ${total} ${total === 1 ? "test record" : "test records"}`)}
        </span>
      </div>
      {loading && rows.length === 0 ? (
        <PlatformSkeleton />
      ) : error && rows.length === 0 ? (
        <PlatformEmpty
          error
          title={error}
          action={
            <PlatformAction onClick={() => setRetry((x) => x + 1)}>
              {c("重新加载", "Retry")}
            </PlatformAction>
          }
        />
      ) : groups.length === 0 ? (
        <PlatformEmpty
          title={c("没有找到匹配的用例", "No matching cases")}
          action={
            <PlatformAction
              onClick={() => {
                sessionStorage.removeItem(STORE);
                setParams({});
                setDraft("");
              }}
            >
              {c(
                "清除筛选，查看全部用例",
                "Clear filters and browse all cases",
              )}
            </PlatformAction>
          }
          description={c(
            "当前筛选组合没有匹配记录。可清除筛选后查看全部用例，或调整编号与关键词。",
            "No records match these filters. Clear them to browse all cases, or change the case ID and keywords.",
          )}
        />
      ) : (
        <div className="case-results">
          {groups.map(([id, records]) => {
            const first = records[0];
            const isOpen = expanded === id;
            const panelId = `case-vehicles-${encodeURIComponent(id)}`;
            const modelCount = new Set(records.map(record => record.brand_model)).size;
            return (
              <section className="case-group" key={id}>
                <h3>
                  <button type="button" className="case-group-title" aria-expanded={isOpen}
                    aria-controls={panelId} onClick={() => setExpanded(isOpen ? null : id)}>
                    <span className="case-code">
                      {first.case_id ? `${c("用例", "Case")} ${first.case_id}` : c("未编号用例", "Unnumbered case")}
                    </span>
                    <span className="case-question">
                      <TranslatedText text={first.case_definition || first.metadata?.user_question ||
                        first.user_question || first.video_name || c("用例详情", "Case details")} />
                    </span>
                    {first.function_domain && <span className="case-domain">{td(first.function_domain)}</span>}
                    <span className="case-model-count">{c(`${modelCount} 款车型`, `${modelCount} ${modelCount === 1 ? "model" : "models"}`)}</span>
                    <ChevronDown size={16} aria-hidden="true" />
                  </button>
                </h3>
                <div className="case-records" id={panelId} hidden={!isOpen}>
                  {isOpen && records.map((r) => (
                    <button
                      key={r.id}
                      className="case-record"
                      disabled={!!pendingEvidence}
                      onClick={() => void openEvidence(r)}
                    >
                      <div>
                        <strong>
                          {r.brand_model
                            ? tv(r.brand_model)
                            : c("车型未提供", "Model unavailable")}
                        </strong>
                        <span>
                          {r.system_version ||
                            c("版本未提供", "Version unavailable")}
                        </span>
                      </div>
                      <div>
                        <span>
                          {r.metadata?.task_success === true ||
                          r.metadata?.task_success === "true"
                            ? c("完成", "Completed")
                            : r.metadata?.task_success === false ||
                                r.metadata?.task_success === "false"
                              ? c("未完成", "Failed")
                              : c("结果未标注", "Unlabeled")}
                        </span>
                        <b>
                          {r.metadata?.response_quality_score ?? "—"}{" "}
                          <small>/ 5</small>
                        </b>
                        <span className="case-evidence-cta">
                          {pendingEvidence === String(r.id) ? c("正在打开…", "Opening…") : c("查看证据", "Evidence")}
                          <ArrowRight size={14} />
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
      {!loading && !error && total > 0 && (
        <div className="case-pagination">
          <button
            disabled={page === 0}
            onClick={() => change("page", String(page - 1))}
          >
            {c("上一页", "Previous")}
          </button>
          <span>
            {page + 1} / {Math.max(1, Math.ceil(totalCases / PAGE_SIZE))}
          </span>
          <button
            disabled={(page + 1) * PAGE_SIZE >= totalCases}
            onClick={() => {
              const p = new URLSearchParams(params);
              p.set("page", String(page + 1));
              setParams(p);
            }}
          >
            {c("下一页", "Next")}
          </button>
        </div>
      )}
      {detail && (
        <ResultDetailModal
          result={detail}
          onClose={() => setDetail(null)}
          onPlayVideo={(path, title) => {
            setDetail(null);
            setVideo({ path, title });
          }}
        />
      )}
      <VideoPlayerModal
        open={!!video}
        videoPath={video?.path || null}
        title={video?.title || null}
        onClose={() => setVideo(null)}
      />
    </div>
  );
}
