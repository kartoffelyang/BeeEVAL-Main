import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowUpRight,
  Bot,
  Film,
  Folder,
  FileDown,
  Cpu,
  Search,
  Lock,
  type LucideIcon,
} from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import {
  PlatformHeader,
  PlatformSearch,
  PlatformEmpty,
  PlatformDrawer,
  PlatformAction,
} from "../components/platform/PlatformUI";
type Tool = {
  id: string;
  name: [string, string];
  desc: [string, string];
  category: string;
  icon: LucideIcon;
  path?: string;
  roles: string[];
  input: [string, string];
  output: [string, string];
  steps: [string, string][];
};
const tools: Tool[] = [
  {
    id: "video",
    name: ["视频评测工作台", "Video evaluation"],
    desc: [
      "提交视频分析任务，查看处理进度与评测结果。",
      "Submit video analysis tasks and inspect evaluation results.",
    ],
    category: "evaluation",
    icon: Film,
    path: "/console",
    roles: ["admin", "analyst"],
    input: ["测试视频与分析配置", "Test videos and analysis settings"],
    output: ["处理进度、评分与结果记录", "Progress, scores and result records"],
    steps: [
      ["选择视频来源与分析配置", "Select video sources and analysis settings"],
      ["提交任务，查看处理进度", "Submit the task and review progress"],
      ["核查评分与测试过程", "Inspect scores against test evidence"],
    ],
  },
  {
    id: "drbee",
    name: ["Dr. Bee 调试台", "Dr. Bee lab"],
    desc: [
      "检查检索与对话表现，追踪问题对应的评测依据。",
      "Inspect retrieval and conversation behavior against evaluation evidence.",
    ],
    category: "development",
    icon: Bot,
    path: "/drbee",
    roles: ["admin", "analyst", "tester"],
    input: [
      "问题、检索与对话配置",
      "Questions, retrieval and dialogue settings",
    ],
    output: [
      "对话回复、检索依据与调试结果",
      "Responses, retrieved evidence and debug results",
    ],
    steps: [
      ["配置问题与检索条件", "Set the question and retrieval conditions"],
      ["观察回答与引用结果", "Inspect responses and citations"],
      ["回到原始测试依据进行核查", "Verify against original test evidence"],
    ],
  },
  {
    id: "files",
    name: ["测试素材浏览器", "Test asset browser"],
    desc: [
      "浏览已连接的 NAS 素材，为评测选择对应视频。",
      "Browse connected NAS assets and choose relevant test videos.",
    ],
    category: "data",
    icon: Folder,
    path: "/nas",
    roles: ["admin", "analyst"],
    input: ["已配置的素材存储服务", "Configured asset storage service"],
    output: ["目录、文件与素材预览", "Directories, files and previews"],
    steps: [
      ["连接已配置的素材服务", "Connect to the configured asset service"],
      ["按目录或文件名查找素材", "Browse folders or search file names"],
      ["检查素材内容与来源", "Review asset contents and source"],
    ],
  },
  {
    id: "export",
    name: ["测试证据与导出", "Test evidence and export"],
    desc: [
      "按车型与任务查找评分记录，查看视频或导出测试数据。",
      "Find score records by model and task; view videos or export test data.",
    ],
    category: "evaluation",
    icon: FileDown,
    path: "/test-cases",
    roles: ["admin", "analyst"],
    input: ["车型、任务与评分筛选条件", "Model, task and score filters"],
    output: ["测试记录、视频与导出文件", "Test records, videos and exports"],
    steps: [
      ["设置车型与任务筛选条件", "Set model and task filters"],
      ["展开记录，检查评分与视频", "Inspect record details and video evidence"],
      ["导出当前范围的测试数据", "Export the selected range of test data"],
    ],
  },
  {
    id: "hardware",
    name: ["实车验证工具", "In-vehicle validation tools"],
    desc: [
      "硬件工具目录与设备接入信息尚未开放。",
      "Hardware catalog and device connection information are not available yet.",
    ],
    category: "hardware",
    icon: Cpu,
    roles: [],
    input: ["尚未提供", "Not provided"],
    output: ["尚未提供", "Not provided"],
    steps: [
      [
        "设备信息与接口要求待补充",
        "Device information and interface requirements are pending",
      ],
      [
        "接入配置与运行状态待补充",
        "Connection settings and runtime status are pending",
      ],
      ["验证流程待补充", "Validation workflow is pending"],
    ],
  },
];
export default function ToolPlatform() {
  const { language } = useLanguage();
  const c = (zh: string, en: string) => (language === "zh" ? zh : en);
  const text = (x: [string, string]) => x[language === "zh" ? 0 : 1];
  const { user } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [selected, setSelected] = useState<Tool | null>(null);
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const allowed = (tool: Tool) =>
    !!tool.path && tool.roles.includes(user?.role || "");
  const categories = [
    { key: "all", name: c("全部工具", "All tools") },
    { key: "evaluation", name: c("评测与证据", "Evaluation & evidence") },
    { key: "development", name: c("调试与探索", "Debugging & exploration") },
    { key: "data", name: c("数据与素材", "Data & assets") },
    { key: "hardware", name: c("实车验证", "In-vehicle validation") },
  ];
  const filtered = useMemo(
    () =>
      tools.filter(
        (x) =>
          (category === "all" || x.category === category) &&
          `${text(x.name)} ${text(x.desc)}`
            .toLowerCase()
            .includes(query.toLowerCase()) &&
          (!onlyAvailable || allowed(x)),
      ),
    [query, category, onlyAvailable, language, user],
  );
  return (
    <div className="pf-page tl-workspace">
      <PlatformHeader
        index="04"
        eyebrow="TOOLS & WORKFLOWS"
        title={c("工具平台", "Tools")}
        description={c(
          "围绕评测、调试和验证，找到合适的工具与使用入口。",
          "Find the right tools and entry points for evaluation, debugging and validation.",
        )}
        action={
          <span className="pf-chip muted">
            {c("依账号权限开放", "Access follows account permissions")}
          </span>
        }
      />
      <div className="pf-toolbar">
        <PlatformSearch
          value={query}
          onChange={setQuery}
          placeholder={c("搜索工具名称或用途", "Search tools or use cases")}
        />
        <label className="bm-compare-check">
          <input
            type="checkbox"
            checked={onlyAvailable}
            onChange={(e) => setOnlyAvailable(e.target.checked)}
          />
          {c("仅显示我可使用的工具", "Show tools I can access")}
        </label>
      </div>
      <div className="tl-layout">
        <aside className="tl-filters">
          <h3>{c("按工作任务浏览", "BROWSE BY WORKFLOW")}</h3>
          <div>
            {categories.map((cat) => (
              <button
                className={category === cat.key ? "is-active" : ""}
                aria-pressed={category === cat.key}
                key={cat.key}
                onClick={() => setCategory(cat.key)}
              >
                {cat.name}
                <span>
                  {
                    tools.filter(
                      (x) => cat.key === "all" || x.category === cat.key,
                    ).length
                  }
                </span>
              </button>
            ))}
          </div>
          <p className="tl-filter-note">
            {c(
              "目录连接已有平台页面。运行工具前，请确认相应业务服务与素材已配置。",
              "This directory connects existing platform pages. Confirm service and asset configuration before running tools.",
            )}
          </p>
        </aside>
        <div>
          <div className="pf-section-heading" style={{ marginTop: 0 }}>
            <h2>{categories.find((x) => x.key === category)?.name}</h2>
            <span className="pf-subtle">
              {filtered.length} {c("个条目", "entries")}
            </span>
          </div>
          {filtered.length ? (
            <div className="tl-tools">
              {filtered.map((tool) => {
                const Icon = tool.icon;
                return (
                  <button
                    className="tl-tool"
                    key={tool.id}
                    onClick={() => setSelected(tool)}
                  >
                    <div className="tl-tool-top">
                      <span className="tl-tool-icon">
                        <Icon size={22} />
                      </span>
                      <span
                        className={"pf-chip " + (allowed(tool) ? "" : "muted")}
                      >
                        {!tool.path
                          ? c("尚未开放", "Planned")
                          : allowed(tool)
                            ? c("可进入", "Accessible")
                            : c("需内部权限", "Restricted")}
                      </span>
                    </div>
                    <h3>{text(tool.name)}</h3>
                    <p>{text(tool.desc)}</p>
                    <div className="tl-tool-foot">
                      <span>
                        {categories.find((x) => x.key === tool.category)?.name}
                      </span>
                      <span
                        style={{
                          display: "flex",
                          gap: 7,
                          alignItems: "center",
                        }}
                      >
                        {c("查看使用说明", "View workflow")}
                        <ArrowUpRight size={14} />
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <PlatformEmpty
              title={c("没有符合条件的工具", "No matching tools")}
              description={c(
                "调整关键词、分类或权限筛选。",
                "Adjust the search, category or access filter.",
              )}
              action={
                <PlatformAction
                  secondary
                  onClick={() => {
                    setQuery("");
                    setCategory("all");
                    setOnlyAvailable(false);
                  }}
                >
                  {c("重置筛选", "Reset filters")}
                </PlatformAction>
              }
            />
          )}
          <p className="tl-catalog-note">
            {c(
              "工具是否可进入由账号权限决定；页面入口可用不代表相关后台服务已连接。硬件条目仅为未开放的目录占位。",
              "Access depends on your account role. An accessible page does not imply its backend service is connected. The hardware entry is an unavailable catalog placeholder.",
            )}
          </p>
        </div>
      </div>
      {selected && (
        <PlatformDrawer
          title={text(selected.name)}
          eyebrow="TOOL WORKFLOW"
          onClose={() => setSelected(null)}
          footer={
            allowed(selected) ? (
              <PlatformAction onClick={() => navigate(selected.path!)}>
                {c("打开工具", "Open tool")}
              </PlatformAction>
            ) : (
              <div
                style={{
                  display: "flex",
                  gap: 9,
                  alignItems: "center",
                  fontSize: 12,
                  color: "#879476",
                }}
              >
                <Lock size={15} />
                {selected.path
                  ? c(
                      "当前账号无权进入，请联系管理员。",
                      "This account does not have access. Contact your administrator.",
                    )
                  : c("该工具尚未开放。", "This tool is not available yet.")}
              </div>
            )
          }
        >
          <div className="tl-detail-preview">
            <selected.icon size={48} strokeWidth={1} />
          </div>
          <p style={{ fontSize: 13, color: "#7f8c70", lineHeight: 1.9 }}>
            {text(selected.desc)}
          </p>
          <h3 className="pf-panel-title" style={{ marginTop: 28 }}>
            {c("使用顺序", "Workflow")}
          </h3>
          <ol className="tl-detail-steps">
            {selected.steps.map((s, i) => (
              <li key={i}>{text(s)}</li>
            ))}
          </ol>
          <dl className="tl-detail-dl">
            <dt>{c("输入", "Input")}</dt>
            <dd>{text(selected.input)}</dd>
            <dt>{c("输出", "Output")}</dt>
            <dd>{text(selected.output)}</dd>
            <dt>{c("开放状态", "Availability")}</dt>
            <dd>
              {selected.path
                ? c(
                    "已有平台页面；需对应权限与服务",
                    "Existing page; requires the appropriate role and services",
                  )
                : c("目录尚未开放", "Catalog not available")}
            </dd>
          </dl>
        </PlatformDrawer>
      )}
    </div>
  );
}
