import React, { useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import clsx from 'clsx';
import {
    Network, Boxes, Server, Video, Bot, FileText, Languages,
    Database as DbIcon, Layers3, ChevronDown, ArrowDown, Cpu,
    Workflow, GitBranch, Plug, Box, ArrowRightLeft,
} from 'lucide-react';

/** 双语取值助手 */
type Lang = 'zh' | 'en';
const pick = (lang: Lang, zh: string, en: string) => (lang === 'zh' ? zh : en);

/** Agent 节点的数据结构 —— 全部内容双语内联,改文案即改这里 */
interface AgentField {
    label: string;          // i18n key
    zh: string;
    en: string;
}
interface AgentDef {
    id: string;
    icon: React.ComponentType<{ className?: string }>;
    /** 所在层: producer / consumer / helper */
    layer: 'producer' | 'consumer' | 'helper';
    /** 主题色 tailwind 片段 */
    accent: string;         // e.g. 'emerald'
    nameZh: string;
    nameEn: string;
    badge: 'producer' | 'consumer' | 'helper';
    tagline_zh: string;
    tagline_en: string;
    fields: AgentField[];           // 概要字段(始终显示)
    workflow_zh: string[];          // 展开后的工作流步骤
    workflow_en: string[];
    submodules_zh?: string[];
    submodules_en?: string[];
}

const AGENTS: AgentDef[] = [
    {
        id: 'video-mimo',
        icon: Video,
        layer: 'producer',
        accent: 'emerald',
        nameZh: '① 视频评测 Agent · MiMo',
        nameEn: '① Video Eval Agent · MiMo',
        badge: 'producer',
        tagline_zh: 'MiMo-v2.5 原生多模态「看」视频打分,平台数据的源头(主力)',
        tagline_en: 'MiMo-v2.5 multimodal evaluation — the source of all platform data (primary)',
        fields: [
            { label: 'arch_field_trigger', zh: '用户提交分析任务 POST /api/mimo/analyze', en: 'User submits task · POST /api/mimo/analyze' },
            { label: 'arch_field_model', zh: 'MiMo-v2.5(原生多模态)', en: 'MiMo-v2.5 (native multimodal)' },
            { label: 'arch_field_downstream', zh: 'video_results / evaluation_scores', en: 'video_results / evaluation_scores' },
            { label: 'arch_field_deps', zh: 'MiMo API · ffmpeg · NAS · Celery(mimo_analysis)', en: 'MiMo API · ffmpeg · NAS · Celery (mimo_analysis)' },
        ],
        workflow_zh: [
            '建 analysis_tasks(source=mimo) → 投递 Celery mimo_analysis 队列',
            'analyze_batch 串行逐个(防限流) → analyze_single',
            '大于 300MB? ffmpeg 压缩;parse_video_name 解析品牌/版本/功能域',
            'call_mimo_video_api:把视频 URL 交给 MiMo,模型回源拉流看视频',
            'prompt 动态注入 52 指标库 + 功能域权重 → 返回 cases JSON(多轮 dialogue)',
            'save_mimo_result:按域权重重算总分 → 写 video_results / evaluation_scores',
            '进度写 Redis progress:{id} (TTL 1h),前端轮询',
        ],
        workflow_en: [
            'Create analysis_tasks(source=mimo) → enqueue Celery mimo_analysis',
            'analyze_batch runs serially (rate-limit safe) → analyze_single',
            'Over 300MB? ffmpeg compress; parse_video_name extracts brand/version/domain',
            'call_mimo_video_api: hand video URL to MiMo, model pulls & watches it',
            'Prompt injects 52-metric registry + domain weights → cases JSON (multi-turn)',
            'save_mimo_result: re-weight score by domain → write results / scores',
            'Progress to Redis progress:{id} (TTL 1h), polled by frontend',
        ],
    },
    {
        id: 'video-gemini',
        icon: Video,
        layer: 'producer',
        accent: 'teal',
        nameZh: '① 视频评测 Agent · Gemini',
        nameEn: '① Video Eval Agent · Gemini',
        badge: 'producer',
        tagline_zh: 'ASR 转写 + 智能截帧 + Gemini 评测(早期方案,保留兼容)',
        tagline_en: 'ASR + smart frame capture + Gemini (legacy, kept for compatibility)',
        fields: [
            { label: 'arch_field_trigger', zh: '用户提交分析任务 POST /api/video/analyze', en: 'User submits task · POST /api/video/analyze' },
            { label: 'arch_field_model', zh: 'Gemini(文本+截图) + ASR(Whisper/FunASR/Moonshine)', en: 'Gemini (text+image) + ASR (Whisper/FunASR/Moonshine)' },
            { label: 'arch_field_downstream', zh: 'video_results / evaluation_scores', en: 'video_results / evaluation_scores' },
            { label: 'arch_field_deps', zh: 'Gemini API · ASR 模型 · OpenCV · ffmpeg', en: 'Gemini API · ASR models · OpenCV · ffmpeg' },
        ],
        workflow_zh: [
            'Celery video_analysis 队列 或 ThreadPoolExecutor(USE_CELERY=false)',
            '提取音频 → ASR 转写(模型可配)',
            'SmartFrameDetector:cv2 检测 UI 变化 + 从 transcript 找用户问完时刻',
            '截「系统开始响应」那一帧 → public/screenshots/',
            'llm_service.evaluate_video(transcript, image) → Gemini 给分',
            '写 video_results / evaluation_scores',
        ],
        workflow_en: [
            'Celery video_analysis queue, or ThreadPoolExecutor (USE_CELERY=false)',
            'Extract audio → ASR transcription (configurable model)',
            'SmartFrameDetector: cv2 UI-change detection + question-end timing',
            'Capture the "system starts responding" frame → public/screenshots/',
            'llm_service.evaluate_video(transcript, image) → Gemini scores',
            'Write video_results / evaluation_scores',
        ],
    },
    {
        id: 'drbee',
        icon: Bot,
        layer: 'consumer',
        accent: 'amber',
        nameZh: '② Dr.Bee 问答 Agent',
        nameEn: '② Dr.Bee Q&A Agent',
        badge: 'consumer',
        tagline_zh: '意图驱动的 RAG 编排管线,面向用户的评测专家助手(最复杂)',
        tagline_en: 'Intent-driven RAG orchestrator — the user-facing evaluation expert (most complex)',
        fields: [
            { label: 'arch_field_entry', zh: '/api/drbee/query(同步) · /api/drbee/query/stream(SSE)', en: '/api/drbee/query (sync) · /query/stream (SSE)' },
            { label: 'arch_field_model', zh: 'default(主回答) + mimo(意图/HyDE)', en: 'default (answer) + mimo (intent/HyDE)' },
            { label: 'arch_field_upstream', zh: 'Qdrant + 聚合表 + 对话历史', en: 'Qdrant + aggregated tables + chat history' },
            { label: 'arch_field_deps', zh: 'Qdrant · PostgreSQL · Redis · 嵌入/精排模型 · LLM', en: 'Qdrant · PostgreSQL · Redis · embed/rerank models · LLM' },
        ],
        workflow_zh: [
            '①意图分类 classify_intent:缓存 → 规则正则 → LLM 兜底(6 类意图)',
            '②构造 QueryPlan:是否跳过向量检索? 是否启用 HyDE?',
            '③向量检索 fetch_retrieval:追问改写 → embed → Qdrant 过滤检索',
            '④HyDE(top1 < 0.5 时):LLM 造假设答案 → 重新 embed 检索',
            '⑤Reranker 精排(bge-reranker-v2-m3)',
            '⑥动态裁剪:找分数断崖,截 [3,15] 条',
            '⑦上下文构造 build_context:排名表 / 聚合统计 / 二次召回 case',
            '⑧Prompt 渲染:按意图选 system 指令 + 中英语言锁定',
            '⑨组装 messages(含历史)',
            '⑩call_llm / stream_llm:熔断器保护 + 参数降级重试',
            '⑪写对话历史 + 返回 QueryResult(answer + sources + 诊断指标)',
        ],
        workflow_en: [
            '① classify_intent: cache → regex rules → LLM fallback (6 intents)',
            '② Build QueryPlan: skip vector search? enable HyDE?',
            '③ fetch_retrieval: follow-up rewrite → embed → filtered Qdrant search',
            '④ HyDE (when top1 < 0.5): LLM hypothetical answer → re-embed & search',
            '⑤ Reranker (bge-reranker-v2-m3)',
            '⑥ Dynamic cutoff: find score cliff, keep [3,15]',
            '⑦ build_context: ranking table / aggregated stats / secondary cases',
            '⑧ render_prompt: intent-based system instruction + language lock',
            '⑨ Assemble messages (with history)',
            '⑩ call_llm / stream_llm: circuit breaker + param-degrade retry',
            '⑪ Persist history + return QueryResult (answer + sources + diagnostics)',
        ],
        submodules_zh: [
            'intent.py 意图分类(三级)', 'retrieval.py 检索+动态裁剪', 'hyde_service.py 假设答案',
            'reranker_service.py 精排', 'context_builders.py 上下文', 'llm_caller.py 4套模型+降级',
            'prompt_renderer.py 语言锁定', 'circuit_breaker.py 熔断+缓存降级',
        ],
        submodules_en: [
            'intent.py (3-tier)', 'retrieval.py + cutoff', 'hyde_service.py',
            'reranker_service.py', 'context_builders.py', 'llm_caller.py (4 models + degrade)',
            'prompt_renderer.py', 'circuit_breaker.py',
        ],
    },
    {
        id: 'report',
        icon: FileText,
        layer: 'consumer',
        accent: 'sky',
        nameZh: '③ 报告生成 Agent',
        nameEn: '③ Report Generation Agent',
        badge: 'consumer',
        tagline_zh: '内部串联「归类」+「洞察」两个 LLM 子 Agent,产 34 页 PPT 报告',
        tagline_en: 'Chains two LLM sub-agents (classify + insight) into a 34-page PPT report',
        fields: [
            { label: 'arch_field_entry', zh: 'POST /api/reports/instances', en: 'POST /api/reports/instances' },
            { label: 'arch_field_model', zh: 'LLM_MODEL_DEFAULT(绕过 Dr.Bee 重链路)', en: 'LLM_MODEL_DEFAULT (bypasses Dr.Bee chain)' },
            { label: 'arch_field_upstream', zh: '聚合表 + case', en: 'Aggregated tables + cases' },
            { label: 'arch_field_downstream', zh: 'case_classifications · 报告 HTML/PDF', en: 'case_classifications · report HTML/PDF' },
        ],
        workflow_zh: [
            '①数据快照 vehicle_snapshot:读 vehicle_aggregated_scores 指标/功能域/总分',
            '②归类子Agent classifier:对每条 case 做 SOA/问法/子类语义分类(并发4,批20,结果缓存 case_classifications)',
            '拼装 step2:SOA×问法矩阵 / 出行娱乐分布 / 低分对标 case',
            '③洞察子Agent insights:单次 24k token 生成 headline/优势/劣势/建议/各域总结',
            '④build_constants_js:装配 ECharts 数据常量 + 中英化',
            '⑤render_html:注入 template.html + 内联 ECharts',
            '⑥可选 export_pdf:Chrome headless --print-to-pdf 导出 16:9 PDF',
        ],
        workflow_en: [
            '① vehicle_snapshot: read aggregated metric/domain/overall scores',
            '② classifier sub-agent: semantic SOA/ask/subcat per case (concurrency 4, batch 20, cached)',
            'Assemble step2: SOA×ask matrix / travel-ent distribution / low-score contrasts',
            '③ insights sub-agent: single 24k-token call → headline/strengths/weaknesses/recs',
            '④ build_constants_js: assemble ECharts data + i18n',
            '⑤ render_html: inject template.html + inline ECharts',
            '⑥ Optional export_pdf: Chrome headless --print-to-pdf, 16:9',
        ],
        submodules_zh: ['classifier.py 归类(并发批处理)', 'insights.py 洞察文案', 'cases.py 低分对标', 'data_builder.py 聚合', 'template.py 渲染', 'export_pdf.py PDF'],
        submodules_en: ['classifier.py', 'insights.py', 'cases.py', 'data_builder.py', 'template.py', 'export_pdf.py'],
    },
    {
        id: 'helper',
        icon: Languages,
        layer: 'helper',
        accent: 'violet',
        nameZh: '④ 辅助 Agent',
        nameEn: '④ Helper Agents',
        badge: 'helper',
        tagline_zh: '翻译 / HyDE / 意图分类等子例程,被上面三者调用',
        tagline_en: 'Translation / HyDE / intent sub-routines invoked by the three above',
        fields: [
            { label: 'arch_field_trigger', zh: '被 ②③ 调用 或 /api/translate', en: 'Called by ②③ or /api/translate' },
            { label: 'arch_field_model', zh: 'mimo / default', en: 'mimo / default' },
            { label: 'arch_field_role', zh: '子例程(非独立入口)', en: 'Sub-routines (no standalone entry)' },
        ],
        workflow_zh: [
            '翻译 Agent translation_service:报告/界面中英互译,带 .translation_cache',
            'report_i18n + brand_mapping:品牌车型中英映射(问界M9 → Aito M9)',
            'HyDE 子 Agent:Dr.Bee 检索不佳时造假设答案(见 ② 第④步)',
            '意图分类子 Agent:Dr.Bee 规则未命中时轻量 LLM 分类',
        ],
        workflow_en: [
            'Translation agent (translation_service): report/UI zh↔en with cache',
            'report_i18n + brand_mapping: brand/model mapping (问界M9 → Aito M9)',
            'HyDE sub-agent: hypothetical answer when Dr.Bee retrieval is weak (see ② step ④)',
            'Intent sub-agent: lightweight LLM classification when rules miss',
        ],
    },
];

/** Tailwind 不能拼动态类名,这里用静态全字符串映射 */
const ACCENT: Record<string, { text: string; border: string; bg: string; ring: string; dot: string }> = {
    emerald: { text: 'text-emerald-700', border: 'border-emerald-500/30', bg: 'bg-emerald-500/[0.08]', ring: 'hover:border-emerald-500/60', dot: 'bg-emerald-400' },
    teal: { text: 'text-teal-400', border: 'border-teal-500/30', bg: 'bg-teal-500/[0.08]', ring: 'hover:border-teal-500/60', dot: 'bg-teal-400' },
    amber: { text: 'text-amber-700', border: 'border-amber-500/30', bg: 'bg-amber-500/[0.08]', ring: 'hover:border-amber-500/60', dot: 'bg-amber-400' },
    sky: { text: 'text-sky-700', border: 'border-sky-500/30', bg: 'bg-sky-500/[0.08]', ring: 'hover:border-sky-500/60', dot: 'bg-sky-400' },
    violet: { text: 'text-violet-700', border: 'border-violet-500/30', bg: 'bg-violet-500/[0.08]', ring: 'hover:border-violet-500/60', dot: 'bg-violet-400' },
};

const BADGE_STYLE: Record<string, string> = {
    producer: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30',
    consumer: 'bg-sky-500/15 text-sky-700 border-sky-500/30',
    helper: 'bg-violet-500/15 text-violet-700 border-violet-500/30',
};

/** 可展开的 Agent 卡片 */
const AgentCard: React.FC<{
    agent: AgentDef;
    lang: Lang;
    t: (k: string) => string;
    open: boolean;
    onToggle: () => void;
}> = ({ agent, lang, t, open, onToggle }) => {
    const c = ACCENT[agent.accent];
    const Icon = agent.icon;
    const workflow = lang === 'zh' ? agent.workflow_zh : agent.workflow_en;
    const submodules = lang === 'zh' ? agent.submodules_zh : agent.submodules_en;

    return (
        <div className={clsx('rounded-xl border bg-surface-raised transition-all', c.border, c.ring, open && 'ring-1 ring-ink/10')}>
            <button onClick={onToggle} className="w-full text-left p-4 flex items-start gap-3">
                <div className={clsx('shrink-0 w-10 h-10 rounded-lg flex items-center justify-center', c.bg)}>
                    <Icon className={clsx('w-5 h-5', c.text)} />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-text-primary text-sm">{pick(lang, agent.nameZh, agent.nameEn)}</span>
                        <span className={clsx('text-[10px] px-1.5 py-0.5 rounded border font-medium', BADGE_STYLE[agent.badge])}>
                            {t(`arch_badge_${agent.badge}`)}
                        </span>
                    </div>
                    <p className="text-xs text-text-secondary mt-1 leading-relaxed">{pick(lang, agent.tagline_zh, agent.tagline_en)}</p>
                </div>
                <ChevronDown className={clsx('w-4 h-4 shrink-0 text-text-muted transition-transform', open && 'rotate-180')} />
            </button>

            {/* 概要字段 */}
            <div className="px-4 pb-3 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
                {agent.fields.map((f, i) => (
                    <div key={i} className="text-xs flex gap-1.5">
                        <span className="text-text-muted shrink-0">{t(f.label)}:</span>
                        <span className="text-text-secondary font-mono break-all">{pick(lang, f.zh, f.en)}</span>
                    </div>
                ))}
            </div>

            {/* 展开:工作流 + 子模块 */}
            {open && (
                <div className="px-4 pb-4 pt-2 border-t border-ink/[0.06] space-y-4">
                    <div>
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary mb-2">
                            <Workflow className="w-3.5 h-3.5" /> {t('arch_field_workflow')}
                        </div>
                        <ol className="space-y-1.5">
                            {workflow.map((step, i) => (
                                <li key={i} className="flex gap-2 text-xs text-text-secondary leading-relaxed">
                                    <span className={clsx('shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full', c.dot)} />
                                    <span>{step}</span>
                                </li>
                            ))}
                        </ol>
                    </div>
                    {submodules && submodules.length > 0 && (
                        <div>
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary mb-2">
                                <GitBranch className="w-3.5 h-3.5" /> {t('arch_field_submodules')}
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {submodules.map((m, i) => (
                                    <span key={i} className="text-[11px] font-mono px-2 py-0.5 rounded bg-ink/[0.04] border border-ink/[0.06] text-text-secondary">
                                        {m}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

/** 全景拓扑 Tab —— 三层(生产/核心/消费)的纵向数据流 */
const OverviewTab: React.FC<{ lang: Lang; t: (k: string) => string; onJump: (id: string) => void }> = ({ lang, t, onJump }) => {
    const producers = AGENTS.filter(a => a.layer === 'producer');
    const consumers = AGENTS.filter(a => a.layer === 'consumer');
    const helper = AGENTS.find(a => a.id === 'helper')!;

    const MiniCard: React.FC<{ a: AgentDef }> = ({ a }) => {
        const c = ACCENT[a.accent];
        const Icon = a.icon;
        return (
            <button
                onClick={() => onJump(a.id)}
                className={clsx('group flex-1 min-w-[200px] rounded-xl border p-4 text-left transition-all bg-surface-raised', c.border, c.ring)}
            >
                <div className="flex items-center gap-2.5">
                    <div className={clsx('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', c.bg)}>
                        <Icon className={clsx('w-5 h-5', c.text)} />
                    </div>
                    <span className="font-semibold text-text-primary text-sm leading-tight">{pick(lang, a.nameZh, a.nameEn)}</span>
                </div>
                <p className="text-xs text-text-secondary mt-2 leading-relaxed line-clamp-2">{pick(lang, a.tagline_zh, a.tagline_en)}</p>
            </button>
        );
    };

    const LayerLabel: React.FC<{ icon: React.ReactNode; text: string }> = ({ icon, text }) => (
        <div className="flex items-center gap-1.5 text-xs font-semibold text-text-muted uppercase tracking-wider">
            {icon}{text}
        </div>
    );

    return (
        <div className="space-y-3">
            {/* 生产层 */}
            <LayerLabel icon={<Cpu className="w-3.5 h-3.5" />} text={t('arch_layer_producer')} />
            <div className="flex flex-wrap gap-3">
                {producers.map(a => <MiniCard key={a.id} a={a} />)}
            </div>

            <div className="flex justify-center py-1">
                <ArrowDown className="w-5 h-5 text-text-muted" />
            </div>

            {/* 数据核心层 */}
            <LayerLabel icon={<DbIcon className="w-3.5 h-3.5" />} text={t('arch_layer_core')} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-xl border border-primary/30 bg-primary/[0.06] p-4">
                    <div className="flex items-center gap-2 text-primary font-semibold text-sm">
                        <DbIcon className="w-4 h-4" /> {t('arch_core_pg')}
                    </div>
                    <p className="text-xs text-text-secondary mt-1.5 font-mono break-all">{t('arch_core_pg_desc')}</p>
                </div>
                <div className="rounded-xl border border-primary/30 bg-primary/[0.06] p-4">
                    <div className="flex items-center gap-2 text-primary font-semibold text-sm">
                        <Layers3 className="w-4 h-4" /> {t('arch_core_qdrant')}
                    </div>
                    <p className="text-xs text-text-secondary mt-1.5 font-mono break-all">{t('arch_core_qdrant_desc')}</p>
                </div>
            </div>

            <div className="flex justify-center py-1">
                <ArrowDown className="w-5 h-5 text-text-muted" />
            </div>

            {/* 消费层 */}
            <LayerLabel icon={<Box className="w-3.5 h-3.5" />} text={t('arch_layer_consumer')} />
            <div className="flex flex-wrap gap-3">
                {consumers.map(a => <MiniCard key={a.id} a={a} />)}
            </div>

            {/* 辅助层(横向,被调用) */}
            <div className="flex items-center gap-2 pt-2">
                <ArrowRightLeft className="w-4 h-4 text-violet-700 shrink-0" />
                <MiniCard a={helper} />
            </div>
        </div>
    );
};

/** 部署与依赖 Tab —— 容器拓扑(接入/应用/数据/外部) */
const InfraTab: React.FC<{ lang: Lang; t: (k: string) => string }> = ({ lang, t }) => {
    interface Node { name: string; sub_zh: string; sub_en: string }
    interface Layer { key: string; icon: React.ReactNode; accent: string; nodes: Node[] }

    const layers: Layer[] = [
        {
            key: 'arch_infra_edge', icon: <Plug className="w-3.5 h-3.5" />, accent: 'sky',
            nodes: [{ name: 'nginx :80/443', sub_zh: '静态资源 dist/ · 反向代理 /api → api:8004', sub_en: 'Static dist/ · reverse proxy /api → api:8004' }],
        },
        {
            key: 'arch_infra_app', icon: <Server className="w-3.5 h-3.5" />, accent: 'amber',
            nodes: [
                { name: 'api :8004', sub_zh: 'FastAPI · 2× uvicorn · JWT+CORS · 13 路由组', sub_en: 'FastAPI · 2× uvicorn · JWT+CORS · 13 routers' },
                { name: 'worker', sub_zh: 'Celery · 并发3 · video_analysis / mimo_analysis', sub_en: 'Celery · concurrency 3 · video/mimo queues' },
                { name: 'beat', sub_zh: '仅生产 · 每日02:00压缩旧日志', sub_en: 'prod only · daily 02:00 log compaction' },
            ],
        },
        {
            key: 'arch_infra_data', icon: <DbIcon className="w-3.5 h-3.5" />, accent: 'emerald',
            nodes: [
                { name: 'PostgreSQL 17 :5432', sub_zh: 'users · analysis_tasks · video_results · scores', sub_en: 'users · analysis_tasks · video_results · scores' },
                { name: 'Redis 7 :6379', sub_zh: 'Celery broker · 进度 · 意图/HyDE/回答缓存', sub_en: 'Celery broker · progress · intent/HyDE/answer cache' },
                { name: 'Qdrant :6333', sub_zh: 'beeeval / beeeval_mimo · 768d cosine', sub_en: 'beeeval / beeeval_mimo · 768d cosine' },
            ],
        },
        {
            key: 'arch_infra_external', icon: <Plug className="w-3.5 h-3.5" />, accent: 'violet',
            nodes: [
                { name: 'NAS', sub_zh: '车机视频源', sub_en: 'cockpit video source' },
                { name: 'LLM API', sub_zh: 'Gemini / MiMo-v2.5 / Kimi / MiniMax', sub_en: 'Gemini / MiMo-v2.5 / Kimi / MiniMax' },
                { name: 'bge-base-zh-v1.5', sub_zh: '嵌入模型(挂载)', sub_en: 'embedding model (mounted)' },
                { name: 'bge-reranker-v2-m3', sub_zh: '精排模型(挂载)', sub_en: 'reranker model (mounted)' },
                { name: 'SMTP', sub_zh: '账号开通邮件', sub_en: 'account provisioning email' },
            ],
        },
    ];

    return (
        <div className="space-y-4">
            {layers.map((layer, li) => {
                const c = ACCENT[layer.accent];
                return (
                    <div key={layer.key}>
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                            {layer.icon}{t(layer.key)}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {layer.nodes.map(n => (
                                <div key={n.name} className={clsx('rounded-xl border p-3.5 bg-surface-raised', c.border)}>
                                    <div className={clsx('font-mono text-sm font-semibold', c.text)}>{n.name}</div>
                                    <p className="text-xs text-text-secondary mt-1 leading-relaxed">{pick(lang, n.sub_zh, n.sub_en)}</p>
                                </div>
                            ))}
                        </div>
                        {li < layers.length - 1 && (
                            <div className="flex justify-center py-2">
                                <ArrowDown className="w-5 h-5 text-text-muted" />
                            </div>
                        )}
                    </div>
                );
            })}
            <div className="rounded-lg border border-ink/[0.06] bg-ink/[0.02] p-3 text-xs text-text-secondary leading-relaxed">
                {t('arch_infra_note')}
            </div>
        </div>
    );
};

type TabKey = 'overview' | 'agents' | 'infra';

const Architecture: React.FC = () => {
    const { t, language } = useLanguage();
    const lang = (language === 'en' ? 'en' : 'zh') as Lang;
    const [tab, setTab] = useState<TabKey>('overview');
    const [openId, setOpenId] = useState<string | null>('drbee');

    const TABS: Array<{ key: TabKey; labelKey: string; icon: React.ReactNode }> = [
        { key: 'overview', labelKey: 'arch_tab_overview', icon: <Network className="w-4 h-4" /> },
        { key: 'agents', labelKey: 'arch_tab_agents', icon: <Boxes className="w-4 h-4" /> },
        { key: 'infra', labelKey: 'arch_tab_infra', icon: <Server className="w-4 h-4" /> },
    ];

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-6">
            {/* 标题 */}
            <div>
                <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
                    <Network className="w-7 h-7 text-secondary" />
                    {t('arch_title')}
                </h1>
                <p className="text-sm text-text-muted mt-1">{t('arch_subtitle')}</p>
            </div>

            {/* Tab 导航 */}
            <div className="border-b border-ink/[0.08]">
                <nav className="flex gap-1 -mb-px">
                    {TABS.map(tb => (
                        <button
                            key={tb.key}
                            onClick={() => setTab(tb.key)}
                            className={clsx(
                                'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
                                tab === tb.key
                                    ? 'border-secondary text-secondary'
                                    : 'border-transparent text-text-muted hover:text-text-primary hover:border-ink/[0.1]'
                            )}
                        >
                            {tb.icon}
                            {t(tb.labelKey)}
                        </button>
                    ))}
                </nav>
            </div>

            {tab === 'overview' && <OverviewTab lang={lang} t={t} onJump={(id) => { setTab('agents'); setOpenId(id); }} />}
            {tab === 'agents' && (
                <div className="space-y-3">
                    <p className="text-xs text-text-muted">{t('arch_flow_hint')}</p>
                    {AGENTS.map(a => (
                        <AgentCard
                            key={a.id}
                            agent={a}
                            lang={lang}
                            t={t}
                            open={openId === a.id}
                            onToggle={() => setOpenId(openId === a.id ? null : a.id)}
                        />
                    ))}
                </div>
            )}
            {tab === 'infra' && <InfraTab lang={lang} t={t} />}

            <div className="text-xs text-text-muted pt-2 border-t border-ink/[0.06] font-mono">
                {t('arch_doc_link')}
            </div>
        </div>
    );
};

export default Architecture;
