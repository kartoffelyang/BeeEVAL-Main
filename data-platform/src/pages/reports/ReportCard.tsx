import {
  ExternalLink,
  FileText,
  Pencil,
  Share2,
  Trash2,
} from "lucide-react";
import { type ReportInstance, type ReportProgress } from "../../api";
import { useLanguage } from "../../contexts/LanguageContext";
import { useMetricsTranslation } from "../../hooks/useMetricsTranslation";
type Props = {
  report: ReportInstance;
  progress?: ReportProgress;
  pdfBusy: boolean;
  showKind?: boolean;
  onOpen: (r: ReportInstance) => void;
  onRename?: (r: ReportInstance) => void;
  onDelete?: (r: ReportInstance) => void;
  onPublish?: (r: ReportInstance) => void;
  onUnpublish?: (r: ReportInstance) => void;
};
export default function ReportCard({
  report: r,
  progress,
  pdfBusy,
  onOpen,
  onRename,
  onDelete,
  onPublish,
  onUnpublish,
}: Props) {
  const { language } = useLanguage();
  const c = (zh: string, en: string) => (language === "zh" ? zh : en);
  const { tv } = useMetricsTranslation();
  const ready = r.status === "completed" && r.has_html;
  const shared = (r.visibility || "private") === "shared";
  const pct = Math.max(0, Math.min(100, progress?.pct || 0));
  return (
    <article className="rp-report">
      <button
        className="rp-report-cover"
        onClick={() => onOpen(r)}
        disabled={!ready}
        aria-label={`${c("阅读报告", "Read report")} ${r.name}`}
      >
        <small>
          BEEEVAL
          <br />
          RESEARCH
        </small>
        <strong>
          {r.name.includes("行业")
            ? c("行业\n研究", "Industry\nStudy")
            : r.name.includes("专项")
              ? c("专项\n对标", "Focused\nBenchmark")
              : r.report_kind === "custom"
                ? c("定制\n研究", "Custom\nStudy")
                : c("座舱 AI\n对标研究", "Cockpit AI\nBenchmark")}
        </strong>
        <span>{r.created_at?.slice(0, 7) || "—"} / ↗</span>
      </button>
      <div className="rp-report-body">
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          <span
            className={"pf-chip " + (r.status === "completed" ? "" : "muted")}
          >
            {r.status === "completed"
              ? c("已完成", "Ready")
              : r.status === "processing"
                ? c("生成中", "Processing")
                : r.status === "failed"
                  ? c("生成失败", "Failed")
                  : r.status}
          </span>
          {shared && (
            <span className="pf-chip muted">{c("共享", "Shared")}</span>
          )}
        </div>
        <h3>
          <button
            style={{ textAlign: "left" }}
            disabled={!ready}
            onClick={() => onOpen(r)}
          >
            {r.name}
          </button>
        </h3>
        <p>
          {tv(r.own_vehicle?.brand_model || "")} ·{" "}
          {r.own_vehicle?.system_version}
          <br />
          {r.created_at?.slice(0, 10)}
        </p>
        {r.status === "processing" && (
          <div>
            <p aria-live="polite">
              {progress?.msg || c("正在准备报告", "Preparing report")} · {pct}%
            </p>
            <div className="rp-progress">
              <i style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
        <div className="rp-report-actions">
          {ready && (
            <button onClick={() => onOpen(r)}>
              <ExternalLink size={12} />
              {c("阅读", "Read")}
            </button>
          )}
          {r.can_manage && (
            <>
              {onRename && (
                <button
                  aria-label={c("重命名", "Rename")}
                  onClick={() => onRename(r)}
                >
                  <Pencil size={12} />
                </button>
              )}
              {onDelete && (
                <button
                  aria-label={c("删除报告", "Delete report")}
                  onClick={() => onDelete(r)}
                >
                  <Trash2 size={12} />
                </button>
              )}
              {ready && !shared && onPublish && (
                <button onClick={() => onPublish(r)}>
                  <Share2 size={12} />
                  {c("共享", "Share")}
                </button>
              )}
              {shared && onUnpublish && (
                <button onClick={() => onUnpublish(r)}>
                  {c("取消共享", "Unshare")}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </article>
  );
}
