import LightSelect from '../../components/LightSelect';
import { useCallback, useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Eye,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import {
  getBuilderPages,
  getBuilderPagePreview,
  previewBuilderPages,
  listBuilderTemplates,
  createBuilderTemplate,
  updateBuilderTemplate,
  deleteBuilderTemplate,
  type BuilderPage,
  type ReportTemplate,
  type ReportVehicle,
} from "../../api";
import { useLanguage } from "../../contexts/LanguageContext";
import {
  PlatformAction,
  PlatformDrawer,
  PlatformEmpty,
  PlatformSkeleton,
  PlatformSearch,
} from "../../components/platform/PlatformUI";
import StandardReportForm from "./StandardReportForm";
type Args = {
  own: ReportVehicle;
  competitors: ReportVehicle[];
  name: string;
  lang: "zh" | "en";
  templatePages: number[];
  withAppendix: boolean;
};
type Props = {
  vehicles: ReportVehicle[];
  generating: boolean;
  onGenerate: (args: Args) => void;
};
export default function CustomReportBuilder({
  vehicles,
  generating,
  onGenerate,
}: Props) {
  const { language } = useLanguage();
  const c = (zh: string, en: string) => (language === "zh" ? zh : en);
  const [pages, setPages] = useState<BuilderPage[]>([]);
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [stage, setStage] = useState("pages");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [preview, setPreview] = useState<{
    title: string;
    html: string;
  } | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [dialog, setDialog] = useState<"save" | "delete" | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    const result = await Promise.allSettled([
      getBuilderPages(false),
      listBuilderTemplates(),
    ]);
    if (result[0].status === "fulfilled") setPages(result[0].value.pages);
    if (result[1].status === "fulfilled")
      setTemplates(result[1].value.templates);
    if (result.some((x) => x.status === "rejected")) setError(true);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const showPreview = async (page?: BuilderPage) => {
    setPreviewBusy(true);
    setOperationError(null);
    try {
      const p = page
        ? await getBuilderPagePreview(page.index)
        : await previewBuilderPages(selected);
      setPreview({
        title: page?.title || c("编排预览", "Report preview"),
        html: p.html_content,
      });
    } catch {
      setOperationError(
        c(
          "预览服务暂时不可用，请稍后重试。",
          "The preview service is unavailable. Please retry.",
        ),
      );
    } finally {
      setPreviewBusy(false);
    }
  };
  const move = (index: number, direction: number) =>
    setSelected((s) => {
      const next = [...s];
      const target = index + direction;
      if (target < 0 || target >= next.length) return s;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  const submit = async () => {
    setBusy(true);
    setOperationError(null);
    try {
      if (dialog === "delete" && editing) {
        await deleteBuilderTemplate(editing);
        setEditing(null);
        setSelected([]);
      } else if (editing)
        await updateBuilderTemplate(editing, {
          name: name.trim(),
          pages: selected,
        });
      else await createBuilderTemplate(name.trim(), selected);
      setTemplates((await listBuilderTemplates()).templates);
      setDialog(null);
    } catch {
      setOperationError(
        c(
          "模板操作未完成，请确认服务后重试。",
          "Unable to update the template. Check the service and retry.",
        ),
      );
    } finally {
      setBusy(false);
    }
  };
  const choose = (id: string) => {
    setEditing(id || null);
    const tpl = templates.find((t) => t.id === id);
    setSelected(tpl?.pages || []);
    setName(tpl?.name || "");
  };
  const filtered = pages.filter((p) =>
    `${p.title} ${p.summary}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="cb-workspace">
      <div className="pf-toolbar" style={{ marginTop: 0 }}>
        <div className="pf-toolbar-left">
          <button
            className="pf-button secondary"
            aria-pressed={stage === "pages"}
            onClick={() => setStage("pages")}
          >
            {c("01 · 页面编排", "01 · Arrange pages")}
          </button>
          <button
            className="pf-button secondary"
            disabled={!selected.length}
            aria-pressed={stage === "config"}
            onClick={() => setStage("config")}
          >
            {c("02 · 配置与创建", "02 · Configure & create")}
          </button>
        </div>
        <span className="pf-subtle">
          {selected.length} {c("页已选", "pages selected")}
        </span>
      </div>
      {operationError && (
        <p
          role="alert"
          style={{ fontSize: 12, color: "#a47a5b", margin: "18px 0" }}
        >
          {operationError}
        </p>
      )}
      {stage === "config" ? (
        <>
          <button className="pf-back" onClick={() => setStage("pages")}>
            {c("返回页面编排", "Back to page arrangement")}
          </button>
          <StandardReportForm
            vehicles={vehicles}
            generating={generating}
            onGenerate={(args) =>
              onGenerate({ ...args, templatePages: selected })
            }
          />
        </>
      ) : (
        <>
          <div className="cb-template-row">
            <label htmlFor="builder-template">
              {c("从已有模板开始", "Start from an existing template")}
            </label>
            <LightSelect
              id="builder-template"
              className="pf-select"
              value={editing || ""}
              onChange={(e) => choose(e.target.value)}
            >
              <option value="">{c("新建编排", "New arrangement")}</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} · {t.pages.length} {c("页", "pages")}
                </option>
              ))}
            </LightSelect>
            {editing && (
              <button
                className="pf-icon-button"
                aria-label={c("删除模板", "Delete template")}
                onClick={() => setDialog("delete")}
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
          <div className="cb-layout">
            <section>
              <div className="pf-section-heading">
                <div>
                  <h3 className="pf-panel-title">
                    {c("可选页面", "Available pages")}
                  </h3>
                  <p>
                    {c(
                      "添加需要的页面，也可先预览。",
                      "Add the pages you need, or preview first.",
                    )}
                  </p>
                </div>
              </div>
              <PlatformSearch
                value={query}
                onChange={setQuery}
                placeholder={c(
                  "搜索页面标题或内容",
                  "Search page titles or content",
                )}
              />
              <div style={{ marginTop: 20 }}>
                {loading ? (
                  <PlatformSkeleton />
                ) : error && pages.length === 0 ? (
                  <PlatformEmpty
                    error
                    title={c("页面库暂时无法连接", "Page library unavailable")}
                    description={c(
                      "已有配置会保留，请重新加载页面库。",
                      "Your current arrangement is retained. Reload the page library.",
                    )}
                    action={
                      <PlatformAction secondary onClick={load}>
                        {c("重新加载", "Reload")}
                      </PlatformAction>
                    }
                  />
                ) : filtered.length ? (
                  filtered.map((p) => (
                    <article className="cb-page" key={p.index}>
                      <div>
                        <small>
                          {String(p.index).padStart(2, "0")} / {p.marker}
                        </small>
                        <h4>{p.title}</h4>
                        <p>{p.summary}</p>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          disabled={previewBusy}
                          className="pf-icon-button"
                          aria-label={c("预览", "Preview") + " " + p.title}
                          onClick={() => showPreview(p)}
                        >
                          <Eye size={14} />
                        </button>
                        <button
                          className="pf-icon-button"
                          disabled={selected.includes(p.index)}
                          aria-label={c("添加页面", "Add page") + " " + p.title}
                          onClick={() => setSelected((s) => [...s, p.index])}
                        >
                          {selected.includes(p.index) ? (
                            <Check size={14} />
                          ) : (
                            <Plus size={14} />
                          )}
                        </button>
                      </div>
                    </article>
                  ))
                ) : (
                  <PlatformEmpty
                    title={c("没有匹配的页面", "No matching pages")}
                  />
                )}
              </div>
            </section>
            <section className="cb-outline">
              <div className="pf-section-heading">
                <div>
                  <h3 className="pf-panel-title">
                    {c("报告大纲", "Report outline")}
                  </h3>
                  <p>
                    {c(
                      "上下移动，调整报告叙述顺序。",
                      "Move pages to adjust the narrative.",
                    )}
                  </p>
                </div>
              </div>
              {selected.length ? (
                <ol>
                  {selected.map((id, i) => (
                    <li key={id}>
                      <span>{String(i + 1).padStart(2, "0")}</span>
                      <b>
                        {pages.find((p) => p.index === id)?.title ||
                          c("页面", "Page") + " " + id}
                      </b>
                      <div>
                        <button
                          disabled={i === 0}
                          aria-label={c("上移页面", "Move page up")}
                          onClick={() => move(i, -1)}
                        >
                          <ArrowUp size={13} />
                        </button>
                        <button
                          disabled={i === selected.length - 1}
                          aria-label={c("下移页面", "Move page down")}
                          onClick={() => move(i, 1)}
                        >
                          <ArrowDown size={13} />
                        </button>
                        <button
                          aria-label={c("移除页面", "Remove page")}
                          onClick={() =>
                            setSelected((s) => s.filter((x) => x !== id))
                          }
                        >
                          <X size={13} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <PlatformEmpty
                  title={c("从左侧添加页面", "Add pages from the library")}
                  description={c(
                    "页面顺序会成为报告的叙述顺序。",
                    "The selected order becomes the report narrative.",
                  )}
                />
              )}
              <div className="cb-outline-actions">
                <button
                  className="pf-button secondary"
                  disabled={!selected.length || previewBusy}
                  onClick={() => showPreview()}
                >
                  <Eye size={14} />
                  {c("整体预览", "Preview report")}
                </button>
                <button
                  className="pf-button secondary"
                  disabled={!selected.length}
                  onClick={() => setDialog("save")}
                >
                  <Save size={14} />
                  {editing
                    ? c("更新模板", "Update template")
                    : c("保存为模板", "Save as template")}
                </button>
              </div>
              <div style={{ marginTop: 16 }}>
                <PlatformAction
                  disabled={!selected.length}
                  onClick={() => setStage("config")}
                >
                  {c("配置车型与报告", "Configure versions and report")}
                </PlatformAction>
              </div>
            </section>
          </div>
        </>
      )}
      {preview && (
        <PlatformDrawer
          title={preview.title}
          onClose={() => setPreview(null)}
          eyebrow="PAGE PREVIEW"
        >
          <iframe
            title={preview.title}
            srcDoc={preview.html}
            sandbox="allow-scripts"
            style={{
              width: "100%",
              height: "70dvh",
              border: 0,
              background: "white",
            }}
          />
        </PlatformDrawer>
      )}
      {dialog && (
        <PlatformDrawer
          title={
            dialog === "delete"
              ? c("删除这个模板？", "Delete this template?")
              : editing
                ? c("更新报告模板", "Update report template")
                : c("保存为报告模板", "Save report template")
          }
          onClose={() => {
            if (!busy) setDialog(null);
          }}
          footer={
            <PlatformAction
              disabled={busy || (dialog === "save" && !name.trim())}
              onClick={submit}
            >
              {busy ? c("处理中…", "Working…") : c("确认", "Confirm")}
            </PlatformAction>
          }
        >
          {dialog === "delete" ? (
            <p className="pf-note">
              {templates.find((t) => t.id === editing)?.name}
            </p>
          ) : (
            <>
              <label
                htmlFor="template-name"
                style={{ fontSize: 12, display: "block", marginBottom: 12 }}
              >
                {c("模板名称", "Template name")}
              </label>
              <input
                id="template-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{
                  padding: 12,
                  width: "100%",
                  border: "1px solid #d8dfcc",
                  borderRadius: 6,
                }}
              />
              <p className="pf-note">
                {selected.length}{" "}
                {c(
                  "页将按当前顺序保存。",
                  "pages will be saved in the selected order.",
                )}
              </p>
            </>
          )}
        </PlatformDrawer>
      )}
    </div>
  );
}
