import LightSelect from '../components/LightSelect';
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle } from "lucide-react";
import {
  getReportVehicles,
  createReport,
  listReportInstances,
  renameReportInstance,
  deleteReportInstance,
  getReportInstancePreview,
  streamReportProgress,
  publishReport,
  unpublishReport,
  type ReportVehicle,
  type ReportInstance,
  type ReportProgress,
} from "../api";
import { useLanguage } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import {
  PlatformHeader,
  PlatformTabs,
  PlatformSearch,
  PlatformAction,
  PlatformEmpty,
  PlatformSkeleton,
  PlatformDrawer,
} from "../components/platform/PlatformUI";
import ReportCardGrid from "./reports/ReportCardGrid";
import StandardReportForm from "./reports/StandardReportForm";
import CustomReportBuilder from "./reports/CustomReportBuilder";
import LockedForViewer from "../components/LockedForViewer";
import TrialMoreHint from "../components/TrialMoreHint";
type Tab = "shared" | "mine" | "gen_standard" | "gen_custom";
export default function Reports() {
  const navigate = useNavigate();
  const { language, t } = useLanguage();
  const c = (zh: string, en: string) => (language === "zh" ? zh : en);
  const { user } = useAuth();
  const canManage = user?.role === "admin" || user?.role === "analyst";
  const isAdmin = user?.role === "admin";
  const [tab, setTab] = useState<Tab>("shared");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [vehicles, setVehicles] = useState<ReportVehicle[]>([]);
  const [shared, setShared] = useState<ReportInstance[]>([]);
  const [mine, setMine] = useState<ReportInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, ReportProgress>>({});
  const streaming = useRef(new Set<string>());
  const controllers = useRef(new Map<string, AbortController>());
  useEffect(
    () => () => {
      controllers.current.forEach((c) => c.abort());
      controllers.current.clear();
      streaming.current.clear();
    },
    [],
  );
  const [reading, setReading] = useState<ReportInstance | null>(null);
  const [readerHtml, setReaderHtml] = useState<string | null>(null);
  const [readerError, setReaderError] = useState(false);
  const [dialog, setDialog] = useState<{
    kind: "rename" | "delete" | "unpublish";
    report: ReportInstance;
  } | null>(null);
  const [dialogName, setDialogName] = useState("");
  const [dialogBusy, setDialogBusy] = useState(false);
  const fetchReports = useCallback(async () => {
    const [a, b] = await Promise.all([
      listReportInstances({ limit: 100, scope: "shared" }),
      listReportInstances({ limit: 100, scope: "mine" }),
    ]);
    setShared(a.data);
    setMine(b.data);
  }, []);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const results = await Promise.allSettled([
      getReportVehicles(),
      fetchReports(),
    ]);
    if (results[0].status === "fulfilled")
      setVehicles(results[0].value.vehicles);
    if (results.some((r) => r.status === "rejected"))
      setError(
        language === "zh"
          ? "部分报告服务暂时无法连接，请重试。"
          : "Some report services are unavailable. Please retry.",
      );
    setLoading(false);
  }, [fetchReports, language]);
  useEffect(() => {
    void load();
  }, [load]);
  const stream = useCallback(
    (id: string) => {
      if (streaming.current.has(id)) return;
      streaming.current.add(id);
      const controller = new AbortController();
      controllers.current.set(id, controller);
      streamReportProgress(
        id,
        (p) => {
          setProgress((prev) => ({ ...prev, [id]: p }));
          if (p.status === "completed" || p.status === "failed") {
            streaming.current.delete(id);
            controllers.current.delete(id);
            void fetchReports().catch(() => setError("Report refresh failed"));
          }
        },
        { signal: controller.signal },
      ).catch(() => {
        streaming.current.delete(id);
        controllers.current.delete(id);
        if (controller.signal.aborted) return;
        setError(
          language === "zh"
            ? "进度连接中断，请刷新报告列表。"
            : "Progress connection interrupted. Refresh the report list.",
        );
      });
    },
    [fetchReports, language],
  );
  useEffect(() => {
    mine.filter((r) => r.status === "processing").forEach((r) => stream(r.id));
  }, [mine, stream]);
  useEffect(() => {
    let active = true;
    setReaderHtml(null);
    setReaderError(false);
    if (!reading) return;
    getReportInstancePreview(reading.id)
      .then((p) => {
        if (active) setReaderHtml(p.html_content);
      })
      .catch(() => {
        if (active) setReaderError(true);
      });
    return () => {
      active = false;
    };
  }, [reading]);
  const handleGenerate = async (args: {
    own: ReportVehicle;
    competitors: ReportVehicle[];
    name: string;
    lang: "zh" | "en";
    templatePages?: number[];
    withAppendix?: boolean;
  }) => {
    setGenerating(true);
    setError(null);
    try {
      const created = await createReport({
        name: args.name || undefined,
        own_vehicle: {
          brand_model: args.own.brand_model,
          system_version: args.own.system_version,
        },
        competitors: args.competitors.map((v) => ({
          brand_model: v.brand_model,
          system_version: v.system_version,
        })),
        report_type: "ppt",
        lang: args.lang,
        template_pages: args.templatePages,
        with_appendix: args.withAppendix ?? false,
      });
      setProgress((p) => ({
        ...p,
        [created.id]: {
          pct: 0,
          msg: c("正在准备报告", "Preparing report"),
          status: "processing",
          log: [],
        },
      }));
      stream(created.id);
      await fetchReports();
      setTab("mine");
    } catch {
      setError(
        c(
          "报告未能创建。配置已保留，请确认服务后重试。",
          "Unable to create the report. Your configuration is preserved. Retry when the service is available.",
        ),
      );
    } finally {
      setGenerating(false);
    }
  };
  const publish = async (r: ReportInstance) => {
    try {
      await publishReport(r.id);
      await fetchReports();
    } catch {
      setError(c("共享报告失败，请重试。", "Unable to share the report."));
    }
  };
  const open = (r: ReportInstance) => {
    if (r.status === "completed" && r.has_html) setReading(r);
  };
  const rename = (r: ReportInstance) => {
    setDialogName(r.name);
    setDialog({ kind: "rename", report: r });
  };
  const submitDialog = async () => {
    if (!dialog) return;
    setDialogBusy(true);
    try {
      if (dialog.kind === "rename")
        await renameReportInstance(dialog.report.id, dialogName.trim());
      else if (dialog.kind === "delete")
        await deleteReportInstance(dialog.report.id);
      else await unpublishReport(dialog.report.id);
      await fetchReports();
      setDialog(null);
    } catch {
      setError(
        c("操作未完成，请重试。", "The operation failed. Please retry."),
      );
    } finally {
      setDialogBusy(false);
    }
  };
  const reports = (tab === "mine" ? mine : shared).filter(
    (r) =>
      `${r.name} ${r.own_vehicle.brand_model} ${r.own_vehicle.system_version || ""}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (statusFilter === "all" || statusFilter === r.status),
  );
  const creating = tab === "gen_standard" || tab === "gen_custom";
  return (
    <div className="pf-page rp-workspace">
      <PlatformHeader
        index="03"
        eyebrow="RESEARCH & REPORTS"
        title={c("报告平台", "Reports")}
        description={c(
          "阅读已有研究，或围绕受测版本与参考版本创建一份对标报告。",
          "Read existing research, or create a benchmark report for selected model versions.",
        )}
        action={
          <PlatformAction onClick={() => setTab("gen_standard")}>
            {c("创建报告", "Create a report")}
          </PlatformAction>
        }
      />
      <PlatformTabs
        value={tab}
        onChange={(k) => setTab(k as Tab)}
        items={[
          {
            key: "shared",
            label: c("共享研究", "Shared research"),
            count: shared.length,
          },
          {
            key: "mine",
            label: c("我的报告", "My reports"),
            count: mine.length,
          },
          { key: "gen_standard", label: c("创建标准报告", "Standard report") },
          { key: "gen_custom", label: c("自定义编排", "Custom builder") },
        ]}
      />
      {error && (
        <div
          role="alert"
          className="pf-note"
          style={{
            padding: 14,
            background: "#f5eee7",
            borderRadius: 6,
            margin: "0 0 20px",
          }}
        >
          <AlertCircle size={15} />
          <span>{error}</span>
          <button
            style={{
              marginLeft: "auto",
              textDecoration: "underline",
              whiteSpace: "nowrap",
            }}
            onClick={load}
          >
            {c("重新加载", "Reload")}
          </button>
        </div>
      )}
      {!creating && (
        <div className="rp-toolbar">
          <PlatformSearch
            value={query}
            onChange={setQuery}
            placeholder={c(
              "搜索报告名称或车型",
              "Search report names or models",
            )}
          />
          <LightSelect
            className="pf-select"
            aria-label={c("报告状态", "Report status")}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">{c("全部状态", "All statuses")}</option>
            <option value="completed">{c("已完成", "Ready")}</option>
            <option value="processing">{c("生成中", "Processing")}</option>
            <option value="failed">{c("生成失败", "Failed")}</option>
          </LightSelect>
        </div>
      )}
      {loading ? (
        <PlatformSkeleton />
      ) : creating ? (
        <LockedForViewer locked={!canManage} hint={t("rg_trial_locked")}>
          {tab === "gen_standard" ? (
            <StandardReportForm
              vehicles={vehicles}
              generating={generating}
              onGenerate={handleGenerate}
            />
          ) : (
            <section className="rp-builder-shell">
              <div className="pf-section-heading">
                <div>
                  <h2>
                    {c(
                      "选择页面，再编排报告顺序",
                      "Choose pages and arrange the report",
                    )}
                  </h2>
                  <p>
                    {c(
                      "使用已有页面与模板，配置车型并生成报告。",
                      "Use existing pages and templates, configure versions, then generate.",
                    )}
                  </p>
                </div>
                {isAdmin && (
                  <button
                    className="pf-button secondary"
                    onClick={() => navigate("/reports/templates")}
                  >
                    {c("模板规范", "Template settings")}
                  </button>
                )}
              </div>
              <CustomReportBuilder
                vehicles={vehicles}
                generating={generating}
                onGenerate={handleGenerate}
              />
            </section>
          )}
        </LockedForViewer>
      ) : (
        <>
          <div className="pf-section-heading">
            <span className="pf-subtle">
              {reports.length} {c("份报告", "reports")}
            </span>
            <span className="pf-subtle">BEEEVAL RESEARCH LIBRARY</span>
          </div>
          <ReportCardGrid
            reports={reports}
            progress={progress}
            pdfBusy={pdfBusy}
            isAdmin={isAdmin}
            emptyText={
              query
                ? c(
                    "没有匹配的报告，试试其他关键词。",
                    "No matching reports. Try another search.",
                  )
                : tab === "shared"
                  ? t("rg_shared_empty")
                  : t("rg_empty")
            }
            onRefresh={() => void load()}
            onOpen={open}
            onRename={canManage ? rename : undefined}
            onDelete={
              canManage
                ? (r) => setDialog({ kind: "delete", report: r })
                : undefined
            }
            onPublish={canManage ? publish : undefined}
            onUnpublish={
              canManage
                ? (r) => setDialog({ kind: "unpublish", report: r })
                : undefined
            }
            emptyAction={
              canManage ? (
                <PlatformAction onClick={() => setTab("gen_standard")}>
                  {c("创建第一份报告", "Create a report")}
                </PlatformAction>
              ) : undefined
            }
          />
          {tab === "shared" && <TrialMoreHint />}
        </>
      )}
      {reading && (
        <PlatformDrawer
          title={reading.name}
          eyebrow="REPORT READER"
          onClose={() => setReading(null)}

        >
          {readerError ? (
            <PlatformEmpty
              error
              title={c("报告暂时无法读取", "Unable to load this report")}
            />
          ) : readerHtml ? (
            <iframe
              title={reading.name}
              srcDoc={readerHtml}
              sandbox="allow-scripts"
              style={{
                width: "100%",
                height: "70dvh",
                border: "1px solid #dfe2d8",
                background: "white",
                borderRadius: 6,
              }}
            />
          ) : (
            <PlatformSkeleton />
          )}
        </PlatformDrawer>
      )}
      {dialog && (
        <PlatformDrawer
          title={
            dialog.kind === "rename"
              ? c("重命名报告", "Rename report")
              : dialog.kind === "delete"
                ? c("删除这份报告？", "Delete this report?")
                : c("取消共享这份报告？", "Unshare this report?")
          }
          onClose={() => {
            if (!dialogBusy) setDialog(null);
          }}
          footer={
            <PlatformAction
              onClick={submitDialog}
              disabled={
                dialogBusy || (dialog.kind === "rename" && !dialogName.trim())
              }
            >
              {dialogBusy ? c("处理中…", "Working…") : c("确认", "Confirm")}
            </PlatformAction>
          }
        >
          <p className="pf-subtle" style={{ lineHeight: 1.9 }}>
            {dialog.report.name}
          </p>
          {dialog.kind === "rename" ? (
            <>
              <label
                htmlFor="rename-report"
                style={{
                  display: "block",
                  fontSize: 12,
                  margin: "24px 0 12px",
                }}
              >
                {c("新报告名称", "New report name")}
              </label>
              <input
                id="rename-report"
                value={dialogName}
                onChange={(e) => setDialogName(e.target.value)}
                style={{
                  width: "100%",
                  padding: 12,
                  border: "1px solid #d8dfcc",
                  borderRadius: 6,
                }}
              />
            </>
          ) : (
            <p className="pf-note">
              {dialog.kind === "delete"
                ? c(
                    "确认后将删除该报告。请先保存需要的文件。",
                    "The report will be deleted. Save any files you need first.",
                  )
                : c(
                    "取消后，其他用户将无法从共享研究中找到它。",
                    "It will no longer appear in shared research for other users.",
                  )}
            </p>
          )}
        </PlatformDrawer>
      )}
    </div>
  );
}
