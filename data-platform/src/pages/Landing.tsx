import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Bot, Send, User, MessageSquarePlus, Square,
    FileText, ArrowRight, Database, Award, ClipboardCheck, Wrench,
    Loader2, CheckCircle2,
} from 'lucide-react';
import clsx from 'clsx';
import { ragQueryStream, chatQuery, resetAskAiChat, getAllResults } from '../api';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { MarkdownAnswer } from '../components/MarkdownAnswer';
import VideoPlayerModal from '../components/VideoPlayerModal';
import ResultDetailModal from '../components/ResultDetailModal';
import LockedForViewer from '../components/LockedForViewer';

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    sources?: any[];
}

/**
 * Landing：新首页。空态 = Hero 标题 + Dr. Bee 对话输入框 + 对外开放的核心板块卡片。
 * 提交问题后切换到页内嵌入式对话态。向量库开关(默认开)决定走 RAG 流式检索还是纯聊天。
 * 侧边栏「首页」点击（beeeval:home 事件）回到输入态首页。
 */
const Landing: React.FC = () => {
    const { t, language } = useLanguage();
    const navigate = useNavigate();
    const { user } = useAuth();
    // 体验/外部账号(viewer)不开放问答：检索会跨全部车型召回用例与聚合分数，
    // 无法按车型白名单可靠收窄。后端 /api/rag、/api/drbee、/api/chat 已 403。
    // 前端不隐藏输入框，而是整块遮罩 + 升级提示，让体验账号知道功能存在但需开通。
    const canAsk = user?.role !== 'viewer';

    const [query, setQuery] = useState('');
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [loading, setLoading] = useState(false);
    const [useRag, setUseRag] = useState(true); // 是否调用向量数据库检索，默认开
    const [videoModalPath, setVideoModalPath] = useState<string | null>(null);
    const [videoModalTitle, setVideoModalTitle] = useState<string | null>(null);
    // 思考/检索进度步骤（SSE step 事件驱动）
    const [pipelineSteps, setPipelineSteps] = useState<{ id: string; status: 'active' | 'done' }[]>([]);
    // 点击案例链接 → 用例详情卡片
    const [selectedSource, setSelectedSource] = useState<any>(null);
    const [selectedFullResult, setSelectedFullResult] = useState<any>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const composerRef = useRef<HTMLTextAreaElement>(null);
    const abortRef = useRef<AbortController | null>(null);

    const hasChat = messages.length > 0;

    const STEP_LABELS: Record<string, { zh: string; en: string }> = {
        intent: { zh: '分析意图', en: 'Classifying intent' },
        retrieval: { zh: '检索数据库', en: 'Searching database' },
        context: { zh: '构建上下文', en: 'Building context' },
        generating: { zh: '生成回答', en: 'Generating response' },
    };
    const stepLabel = (id: string) => {
        const labels = STEP_LABELS[id];
        if (!labels) return id;
        return language === 'zh' ? labels.zh : labels.en;
    };

    // 点击案例链接：优先按 video_name 精确查完整记录 → 用例详情卡片；查不到再退回用 source 数据
    const handleOpenCase = (path: string, title: string) => {
        let decodedPath = path;
        try { decodedPath = decodeURIComponent(path); } catch { /* ignore */ }
        const filename = decodedPath.split('/').pop() || decodedPath;
        // 去扩展名后比较，避免 "xxx.mp4" 与 "xxx" 不相等
        const stripExt = (s: string) => (s || '').replace(/\.(mp4|mov|m4v|webm|mkv)$/i, '');
        // 从所有 assistant 消息的 sources 里找匹配的案例
        let src: any = null;
        for (const m of messages) {
            const found = m.sources?.find((s: any) =>
                s.video_path === decodedPath || s.video_path === path
                || s.video_name === filename
                || stripExt(s.video_name) === stripExt(filename)
            );
            if (found) { src = found; break; }
        }
        if (src && src.video_name) {
            getAllResults({ video_name: src.video_name, limit: 1, include_failed: true }).then(res => {
                const row = res.data && res.data.length > 0 ? res.data[0] : null;
                // 关键校验：后端返回的记录必须与请求的 video_name 一致才采用，
                // 否则（例如后端未识别 video_name 参数、退化成取第一条）用 source 数据兜底，
                // 绝不展示张冠李戴的卡片。
                if (row && stripExt(row.video_name) === stripExt(src.video_name)) {
                    setSelectedFullResult(row);
                } else {
                    setSelectedSource(src);
                }
            }).catch(() => setSelectedSource(src));
        } else if (src) {
            setSelectedSource(src);
        } else {
            // 找不到 source（例如链接来自旧消息），退回播放视频
            handlePlay(decodedPath, title);
        }
    };

    useEffect(() => {
        if (hasChat) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, loading, hasChat]);

    // 卸载 / 离开时中止仍在跑的流式请求，避免后台空转浪费 token
    useEffect(() => () => { abortRef.current?.abort(); }, []);

    // 侧边栏「首页」点击 → 回到输入态（清空当前对话）
    useEffect(() => {
        const onHome = () => { void handleNewChat(); };
        window.addEventListener('beeeval:home', onHome);
        return () => window.removeEventListener('beeeval:home', onHome);
    }, []);

    const handlePlay = (path: string, title: string) => {
        setVideoModalPath(path);
        setVideoModalTitle(title);
    };

    const handleSend = async (text?: string) => {
        const userQuery = (text ?? query).trim();
        if (!userQuery || loading) return;

        setMessages((prev) => [...prev, { role: 'user', content: userQuery }]);
        setQuery('');
        setLoading(true);
        setPipelineSteps([]);
        setMessages((prev) => [...prev, { role: 'assistant', content: '', sources: [] }]);

        const setLastAssistant = (patch: (m: ChatMessage) => ChatMessage) => {
            setMessages((prev) => {
                const arr = prev.slice();
                const i = arr.length - 1;
                if (i >= 0 && arr[i].role === 'assistant') arr[i] = patch(arr[i]);
                return arr;
            });
        };

        // 不走向量库：纯聊天（非流式）
        if (!useRag) {
            try {
                const resp = await chatQuery(userQuery, language);
                setLastAssistant((m) => ({ ...m, content: resp.answer }));
            } catch {
                setLastAssistant((m) => ({ ...m, content: t('request_failed_network') }));
            } finally {
                setLoading(false);
            }
            return;
        }

        // 走向量检索增强（RAG 流式）
        const controller = new AbortController();
        abortRef.current = controller;
        try {
            await ragQueryStream(
                userQuery,
                (evt) => {
                    if (evt.type === 'step') {
                        setPipelineSteps((prev) => {
                            if (prev.some((s) => s.id === evt.id)) return prev;
                            const updated = prev.map((s) => s.status === 'active' ? { ...s, status: 'done' as const } : s);
                            return [...updated, { id: evt.id, status: 'active' as const }];
                        });
                    } else if (evt.type === 'sources') {
                        setLastAssistant((m) => ({ ...m, sources: evt.sources }));
                    } else if (evt.type === 'chunk') {
                        // 首个答案 token 到达：把仍在 active 的步骤标记完成（进度保留可见，finally 里清）
                        setPipelineSteps((prev) => prev.map((s) => s.status === 'active' ? { ...s, status: 'done' as const } : s));
                        setLastAssistant((m) => ({ ...m, content: m.content + evt.text }));
                    } else if (evt.type === 'error') {
                        setLastAssistant((m) => ({ ...m, content: t('request_failed', { message: evt.message }) }));
                    }
                },
                { signal: controller.signal, channel: 'askai' },
            );
        } catch (error: any) {
            if (error?.name !== 'AbortError') {
                setLastAssistant((m) => ({ ...m, content: t('request_failed_network') }));
            }
        } finally {
            abortRef.current = null;
            setLoading(false);
            setPipelineSteps([]);
        }
    };

    const handleStop = () => {
        abortRef.current?.abort();
        abortRef.current = null;
        setLoading(false);
        setPipelineSteps([]);
    };

    const handleNewChat = async () => {
        abortRef.current?.abort();
        abortRef.current = null;
        setMessages([]);
        setQuery('');
        setLoading(false);
        setPipelineSteps([]);
        try { await resetAskAiChat('askai'); } catch { /* ignore */ }
    };

    // 板块卡片：对外开放的核心入口
    const sections = [
        { key: 'benchmark', to: '/benchmark', icon: Award, title: t('benchmark_title'), desc: t('benchmark_platform_subtitle'), accent: 'text-emerald-700', bg: 'bg-emerald-500/[0.12]' },
        { key: 'acceptance', to: '/acceptance-testing', icon: ClipboardCheck, title: t('landing_card_acceptance_title'), desc: t('landing_card_acceptance_desc'), accent: 'text-sky-700', bg: 'bg-sky-500/[0.12]' },
        { key: 'reports', to: '/reports', icon: FileText, title: t('landing_card_reports_title'), desc: t('landing_card_reports_desc'), accent: 'text-violet-700', bg: 'bg-violet-500/[0.12]' },
        { key: 'tools', to: '/tool-platform', icon: Wrench, title: t('tool_platform_title'), desc: t('tool_platform_subtitle'), accent: 'text-amber-700', bg: 'bg-amber-500/[0.12]' },
    ];

    return (
        <div className="landing-page flex flex-col">
            {hasChat ? renderChat() : renderHero()}

            {/* Landing 问答引用的视频/案例详情对体验账号放行 */}
            <VideoPlayerModal
                open={!!videoModalPath}
                videoPath={videoModalPath}
                title={videoModalTitle}
                onClose={() => { setVideoModalPath(null); setVideoModalTitle(null); }}
                allowTrial
            />

            {/* 用例详情卡片：点击案例链接时打开（与测试用例库同一组件） */}
            {selectedFullResult && (
                <ResultDetailModal
                    result={selectedFullResult}
                    onClose={() => setSelectedFullResult(null)}
                    onPlayVideo={(p, ti) => {
                        setSelectedFullResult(null);
                        setVideoModalPath(p);
                        setVideoModalTitle(ti);
                    }}
                    allowTrial
                />
            )}

            {/* Fallback：API 查不到完整记录时，用 source 数据展示简化版 */}
            {selectedSource && !selectedFullResult && (
                <ResultDetailModal
                    result={{
                        video_name: selectedSource.video_name,
                        created_at: selectedSource.created_at,
                        metadata: {
                            path: selectedSource.video_path,
                            user_question: selectedSource.user_question,
                            system_response: selectedSource.system_response,
                            system_response_en: selectedSource.system_response_en,
                            summary: selectedSource.summary,
                            summary_en: selectedSource.summary_en,
                        },
                        evaluation_scores: (selectedSource.evaluations || []).map((ev: any, i: number) => ({
                            id: i,
                            criteria: ev.metric_name || ev.criteria,
                            score: ev.score,
                            feedback: ev.feedback,
                            feedback_en: ev.feedback_en,
                        })),
                    }}
                    onClose={() => setSelectedSource(null)}
                    onPlayVideo={(p, ti) => {
                        setSelectedSource(null);
                        setVideoModalPath(p);
                        setVideoModalTitle(ti);
                    }}
                    allowTrial
                />
            )}
        </div>
    );

    // ====== 空态：Hero 标题 + 对话输入框 + 板块卡片（整体垂直居中） ======
    function renderHero() {
        const zh = language === 'zh';
        const suggestions = zh
            ? ['如何比较不同车型的座舱 AI 表现？', '如何查看测试视频与评分依据？']
            : ['How do I compare cockpit AI performance?', 'Where can I find test videos and score evidence?'];
        return (
            <div className="landing-home">
                <div className="landing-eyebrow">BEEEVAL / COCKPIT INTELLIGENCE</div>
                <div className="landing-intro">
                    <div>
                        <h1>{zh ? <>从评测表现，<br />看见座舱 AI 的<em>下一步。</em></> : <>Evidence for decisions.<br /><em>Insight for what’s next.</em></>}</h1>
                        <p>{t('landing_hero_sub')}</p>
                    </div>
                    <div className="landing-art" aria-hidden="true">
                        <div className="landing-art-caption"><span>EVIDENCE → INSIGHT</span><span>BEEEVAL</span></div>
                        <svg viewBox="0 0 360 230" fill="none">
                            {[55,85,115,145,175].map((r) => <ellipse key={r} cx="180" cy="116" rx={r} ry={r*.5} stroke="#d7dbce" transform="rotate(-25 180 116)" />)}
                            {[-60,-30,0,30,60].map((a) => <ellipse key={a} cx="180" cy="116" rx="72" ry="98" stroke="#b9c2ab" transform={`rotate(${a} 180 116)`} />)}
                            <path d="M30 176L96 150L180 115L252 73L329 47" stroke="#a17b35" strokeWidth="1.5" />
                            <circle cx="180" cy="115" r="4" fill="#a17b35" />
                            <circle cx="252" cy="73" r="3" fill="#a17b35" />
                            <circle cx="96" cy="150" r="3" fill="#a17b35" />
                        </svg>
                        <div className="landing-art-caption"><span>RESEARCH / BENCHMARK / VALIDATION</span><span>01</span></div>
                    </div>
                </div>
                <div className="landing-composer">
                    <div className="landing-composer-label"><b>{zh ? '向 Dr. Bee 提问' : 'Ask Dr. Bee'}</b><p>{zh ? '从一个问题开始，找到数据与证据。' : 'Start with a question. Find the evidence.'}</p></div>
                    <div className="min-w-0">
                        <LockedForViewer locked={!canAsk} variant="dim" hint={t('landing_ask_trial_locked')}>
                            {renderComposer()}
                        </LockedForViewer>
                        {canAsk && <div className="landing-suggestions">{suggestions.map(q => <button key={q} onClick={() => { setQuery(q); composerRef.current?.focus(); }}>{q} <span aria-hidden="true">↗</span></button>)}</div>}
                    </div>
                </div>
                <div className="landing-section-title"><b>{t('landing_section_title')}</b><span>EXPLORE THE WORKSPACE</span></div>
                <div className="landing-entry-grid">
                    {sections.map((s) => {
                        const Icon = s.icon;
                        return <button key={s.key} onClick={() => navigate(s.to)} className="landing-entry group">
                            <span className="entry-icon"><Icon className="w-5 h-5" /></span>
                            <div><h3>{s.title}</h3><p>{s.desc}</p></div>
                            <ArrowRight className="entry-arrow w-4 h-4" />
                        </button>;
                    })}
                </div>
                <div className="landing-footnote"><span>BEEEVAL · {zh ? '座舱智能化评测平台' : 'COCKPIT INTELLIGENCE'}</span><span>EVIDENCE FOR DECISIONS.</span></div>
            </div>
        );
    }

    // ====== 对话态：消息流 + 底部输入框 ======
    function renderChat() {
        return (
            <div className="flex-1 flex flex-col min-h-0">
                <div className="flex-1 overflow-y-auto px-6 py-6 scrollbar-thin scrollbar-thumb-ink/10">
                    <div className="max-w-3xl mx-auto space-y-6">
                        <div className="flex justify-end">
                            <button
                                onClick={handleNewChat}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-ink/[0.08] bg-surface-raised text-xs text-text-secondary hover:bg-ink/[0.05] transition-colors"
                            >
                                <MessageSquarePlus className="w-3.5 h-3.5" />
                                {t('landing_new_chat')}
                            </button>
                        </div>

                        {messages.map((msg, idx) => (
                            msg.role === 'user' ? (
                                <div key={idx} className="flex justify-end gap-3">
                                    <div className="max-w-[85%] rounded-2xl rounded-tr-none p-4 text-sm shadow-sm bg-secondary text-text-inverse">
                                        {msg.content}
                                    </div>
                                    <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 shadow-sm border-2 border-surface-raised bg-secondary text-text-inverse">
                                        <User className="w-5 h-5" />
                                    </div>
                                </div>
                            ) : (
                                <div key={idx} className="w-full">
                                    {/* 头部：机器人头像 + Dr. Bee */}
                                    <div className="flex items-center gap-2.5 mb-2">
                                        <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 shadow-sm border-2 border-surface-raised bg-surface-overlay text-primary">
                                            <Bot className="w-5 h-5" />
                                        </div>
                                        <span className="text-sm font-semibold text-text-secondary">Dr. Bee</span>
                                    </div>
                                    {/* 正文：与下方输入框同宽 */}
                                    <div className="text-sm text-text-secondary leading-relaxed">
                                        {msg.content
                                            ? <MarkdownAnswer text={msg.content} onPlay={handlePlay} onDetail={handleOpenCase} />
                                            : (
                                                // 空占位（还没有答案 token）：只有最后一条 assistant 才显示进度/加载态
                                                idx === messages.length - 1
                                                    ? (pipelineSteps.length > 0
                                                        ? renderPipeline()
                                                        : (
                                                            <div className="flex gap-1.5 py-1">
                                                                <div className="w-2 h-2 bg-primary/40 rounded-full animate-bounce" />
                                                                <div className="w-2 h-2 bg-primary/40 rounded-full animate-bounce delay-75" />
                                                                <div className="w-2 h-2 bg-primary/40 rounded-full animate-bounce delay-150" />
                                                            </div>
                                                        ))
                                                    : null
                                            )}
                                    </div>
                                </div>
                            )
                        ))}
                        <div ref={messagesEndRef} />
                    </div>
                </div>

                <div className="px-6 pb-6 pt-2 shrink-0">
                    <div className="max-w-3xl mx-auto">{renderComposer()}</div>
                </div>
            </div>
        );
    }

    // ====== 思考/检索进度（单行翻页，永远只显示一行）======
    function renderPipeline() {
        const activeIdx = pipelineSteps.findIndex((s) => s.status === 'active');
        const currentIndex = activeIdx === -1 ? pipelineSteps.length - 1 : activeIdx;
        const LINE_H = 24; // px，与每行高度对齐
        return (
            <div className="inline-flex items-center bg-surface-overlay/60 border border-ink/[0.06] rounded-xl px-4 py-2 my-1">
                {/* 固定单行高度视口，内部整列上移实现"翻页"，旧步骤翻出视口 */}
                <div className="overflow-hidden" style={{ height: LINE_H }}>
                    <div
                        className="flex flex-col transition-transform duration-300 ease-out"
                        style={{ transform: `translateY(-${currentIndex * LINE_H}px)` }}
                    >
                        {pipelineSteps.map((s) => (
                            <div key={s.id} className="flex items-center gap-2.5 text-xs" style={{ height: LINE_H }}>
                                {s.status === 'done'
                                    ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                                    : <Loader2 className="w-3.5 h-3.5 text-primary animate-spin shrink-0" />}
                                <span className={clsx(
                                    'whitespace-nowrap transition-colors duration-300',
                                    s.status === 'done' ? 'text-text-muted' : 'text-text-primary font-medium',
                                )}>
                                    {stepLabel(s.id)}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    // ====== 对话输入框（空态与对话态共用） ======
    function renderComposer() {
        return (
            <div>
                <div className="composer-surface rounded-2xl bg-surface-raised border border-ink/[0.1] focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary transition-all shadow-sm px-3 pt-2 pb-2.5">
                    <textarea
                        ref={composerRef}
                        aria-label={language === 'zh' ? '向 Dr. Bee 提问' : 'Ask Dr. Bee'}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
                        }}
                        placeholder={t('landing_composer_placeholder')}
                        className="w-full bg-transparent border-none px-1 py-2 text-sm text-text-primary focus:ring-0 outline-none resize-none min-h-[52px] max-h-[160px] placeholder-text-muted"
                        rows={hasChat ? 1 : 2}
                    />
                    {/* 底部工具栏：左=向量库开关，右=发送 */}
                    <div className="flex items-center justify-between gap-2 mt-1">
                        <button
                            type="button"
                            onClick={() => setUseRag((v) => !v)}
                            aria-pressed={useRag}
                            title={useRag ? t('landing_rag_on_hint') : t('landing_rag_off_hint')}
                            className={clsx(
                                'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors',
                                useRag
                                    ? 'border-primary/50 bg-primary/[0.12] text-primary'
                                    : 'border-ink/[0.1] text-text-muted hover:text-text-secondary hover:bg-ink/[0.05]',
                            )}
                        >
                            <Database className="w-3.5 h-3.5" />
                            {t('landing_rag_label')}
                        </button>

                        {loading ? (
                            <button
                                onClick={handleStop}
                                className="p-2 bg-surface-overlay text-text-primary rounded-xl hover:bg-ink/[0.1] transition-all border border-ink/[0.1]"
                                title={t('landing_stop')}
                            >
                                <Square className="w-4 h-4 fill-current" />
                            </button>
                        ) : (
                            <button
                                onClick={() => handleSend()}
                                disabled={!query.trim()}
                                className="p-2 bg-primary text-text-inverse rounded-xl hover:bg-primary-dark disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
                                title={t('landing_send')}
                            >
                                <Send className="w-5 h-5" />
                            </button>
                        )}
                    </div>
                </div>
            </div>
        );
    }
};

export default Landing;
