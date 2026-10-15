import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useLanguage } from "../contexts/LanguageContext";
export function evidencePath(result: any) {
  const p = new URLSearchParams();
  if (result.case_id) p.set("case_id", result.case_id);
  if (result.brand_model) p.set("brand_model", result.brand_model);
  if (result.system_version) p.set("system_version", result.system_version);
  if (result.video_name) p.set("video_name", result.video_name);
  if (result.id) p.set("record", result.id);
  return `/evidence?${p}`;
}
export default function EvidenceActions({ result }: { result: any }) {
  const current = useLocation();
  const { language } = useLanguage();
  const [message, setMessage] = useState("");
  const zh = language === "zh";
  return (
    <div className="evidence-actions">
      <Link
        to={evidencePath(result)}
        state={{ returnTo: current.pathname + current.search }}
      >
        {zh ? "独立查看" : "Open detail"}
      </Link>
      <button
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(
              new URL(evidencePath(result), location.origin).href,
            );
            setMessage(zh ? "链接已复制" : "Copied");
          } catch {
            setMessage(
              zh
                ? "复制失败，请在独立详情页复制地址"
                : "Open detail and copy the address",
            );
          }
        }}
      >
        {zh ? "复制证据链接" : "Copy evidence link"}
      </button>
      <span role="status">{message}</span>
    </div>
  );
}
