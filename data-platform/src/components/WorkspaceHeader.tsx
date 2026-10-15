import { useLocation, Link } from "react-router-dom";
import { useLanguage } from "../contexts/LanguageContext";

const labels: Record<string, [string, string]> = {
  "/evidence": ["用例证据", "Case evidence"],
  "/": ["查用例", "Find cases"],
  "/benchmark": ["标杆分析", "Benchmark"],
  "/acceptance-testing": ["验收分析", "Acceptance"],
  "/console": ["分析控制台", "Analysis console"],
  "/test-cases": ["测试视频及评分", "Test evidence"],
  "/database": ["数据库", "Database"],
  "/history": ["历史记录", "History"],
  "/nas": ["NAS 浏览器", "NAS browser"],
  "/vector-manager": ["向量管理", "Vector manager"],
  "/architecture": ["架构拓扑", "Architecture"],
  "/admin/users": ["账号管理", "Accounts"],
  "/admin/askai-logs": ["用户问答数据", "Question logs"],
  "/settings": ["设置", "Settings"],
  "/account": ["我的账号", "My account"],
  "/vehicle-scores": ["车型评分", "Vehicle scores"],
  "/vehicle-pk": ["车型对比", "Vehicle comparison"],
};

export default function WorkspaceHeader() {
  const { pathname } = useLocation();
  const { language } = useLanguage();
  const key = Object.keys(labels)
    .sort((a, b) => b.length - a.length)
    .find((p) => pathname === p || (p !== "/" && pathname.startsWith(p + "/")));
  const label = labels[key || "/"][language === "zh" ? 0 : 1];
  return (
    <header className="workspace-header">
      <div className="breadcrumb">
        <Link to="/" aria-label="BeeEVAL home">
          <img src={`${import.meta.env.BASE_URL}beeeval-logo.png`} alt="BeeEVAL" className="workspace-logo" />
        </Link>
        <i aria-hidden="true">/</i>
        <span>{label}</span>
      </div>
      <span className="workspace-label">EVALUATION EVIDENCE</span>
    </header>
  );
}
