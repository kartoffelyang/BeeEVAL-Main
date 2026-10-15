/**
 * @deprecated 已废弃，请勿修改或在此基础上开发。
 *
 * 此组件（Dr. Bee 悬浮抽屉问答）已不再被任何路由/页面挂载，App.tsx 未引用它。
 * 线上真正生效的 Dr. Bee 问答入口是 `src/pages/Landing.tsx`（首页嵌入式对话）。
 * 两者是相互独立的实现，没有继承关系：功能改动（SSE 步骤可视化、案例卡片跳转、
 * 意图相关的展示等）都应改在 Landing.tsx，改这里不会有任何线上效果。
 *
 * 保留此文件仅作历史参考，暂不删除。若需复用其中逻辑，请显式移植到 Landing.tsx。
 */

import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, MessageSquarePlus, Send, X, Bot, User, Loader2, Sparkles, PlayCircle, CheckCircle2 } from 'lucide-react';
import clsx from 'clsx';
import { chatQuery, getAllResults, ragQueryStream, getVectorStats, resetAskAiChat } from '../api';
import { useLanguage } from '../contexts/LanguageContext';
import { useTranslation } from 'react-i18next';
import { useMetricsTranslation } from '../hooks/useMetricsTranslation';
import { MarkdownAnswer } from './MarkdownAnswer';
import TranslatedText from './TranslatedText';
import VideoPlayerModal from './VideoPlayerModal';
import ResultDetailModal from './ResultDetailModal';

const AskBeeEval = () => {
    const { language } = useLanguage();
    const { t } = useTranslation();
    const { tm, td } = useMetricsTranslation();
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [messages, setMessages] = useState<{ role: 'user' | 'assistant', content: string, sources?: any[] }[]>([]);
    const [loading, setLoading] = useState(false);
    const [videoMap, setVideoMap] = useState<Record<string, string>>({});
    const [useRag, setUseRag] = useState(true);  // RAG 开关
    const [vectorStats, setVectorStats] = useState<{ total_vectors: number; dimension: number } | null>(null);
    // 流式输出时记录当前模型名 / auto 模式实际拿到的检索数，仅 UI 展示用
    const [activeModel, setActiveModel] = useState<string>('');
    const [activeRetrievedCount, setActiveRetrievedCount] = useState<number | null>(null);
    const [activeLowRelevance, setActiveLowRelevance] = useState<boolean>(false);
    const [activeMinScore, setActiveMinScore] = useState<number | null>(null);
    const [activeTopScore, setActiveTopScore] = useState<number | null>(null);
    const [pipelineSteps, setPipelineSteps] = useState<{ id: string; status: 'active' | 'done' }[]>([]);
    // 点击 LLM 答复里的 .mp4 链接 → 弹窗播放（和 Dr.bee Lab 行为一致）
    const [videoModalPath, setVideoModalPath] = useState<string | null>(null);
    const [videoModalTitle, setVideoModalTitle] = useState<string | null>(null);
    const [selectedSource, setSelectedSource] = useState<any>(null);
    const [selectedFullResult, setSelectedFullResult] = useState<any>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const abortRef = useRef<AbortController | null>(null);

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

    const handlePlayVideo = (path: string, title: string) => {
        setVideoModalPath(path);
        setVideoModalTitle(title);
    };

    // Fetch all results to build filename -> fullpath map
    useEffect(() => {
        const fetchVideoPaths = async () => {
            try {
                const res = await getAllResults({ limit: 5000 });
                const map: Record<string, string> = {};
                res.data.forEach((r: any) => {
                    if (r.video_name && r.metadata?.path) {
                        map[r.video_name] = r.metadata.path;
                    }
                });
                setVideoMap(map);
            } catch (error) {
                console.error("Failed to load video paths for chat links", error);
            }
        };

        fetchVideoPaths();
    }, []);

    // Fetch vector stats when opening
    useEffect(() => {
        if (isOpen && useRag) {
            getVectorStats().then(stats => {
                setVectorStats({ total_vectors: stats.total_vectors, dimension: stats.dimension });
            }).catch(err => {
                console.error("Failed to fetch vector stats", err);
            });
        }
    }, [isOpen, useRag]);

    const handleSend = async () => {
        if (!query.trim()) return;

        const userQuery = query;
        setMessages(prev => [...prev, { role: 'user', content: userQuery }]);
        setQuery('');
        setLoading(true);
        setActiveRetrievedCount(null);
        setActiveLowRelevance(false);
        setActiveMinScore(null);
        setActiveTopScore(null);
        setPipelineSteps([]);

        if (useRag && vectorStats && vectorStats.total_vectors > 0) {
            // 流式分支：先插一个空 assistant 消息占位，后续 chunk 增量追加
            setMessages(prev => [...prev, { role: 'assistant', content: '', sources: [] }]);

            const controller = new AbortController();
            abortRef.current = controller;

            try {
                await ragQueryStream(
                    userQuery,
                    (evt) => {
                        if (evt.type === 'meta') {
                            if (evt.modelName) setActiveModel(evt.modelName);
                            setActiveRetrievedCount(evt.retrievedCount);
                            setActiveLowRelevance(evt.lowRelevance);
                            setActiveMinScore(evt.minScoreUsed);
                            setActiveTopScore(evt.topScore);
                        } else if (evt.type === 'step') {
                            setPipelineSteps(prev => {
                                if (prev.some(s => s.id === evt.id)) return prev;
                                const updated = prev.map(s => s.status === 'active' ? { ...s, status: 'done' as const } : s);
                                return [...updated, { id: evt.id, status: 'active' as const }];
                            });
                        } else if (evt.type === 'sources') {
                            // 不可变更新：替换最后一条 assistant 的 sources
                            setMessages(prev => {
                                const arr = prev.slice();
                                const i = arr.length - 1;
                                if (i >= 0 && arr[i].role === 'assistant') {
                                    arr[i] = { ...arr[i], sources: evt.sources };
                                }
                                return arr;
                            });
                        } else if (evt.type === 'chunk') {
                            // 不在这里清空进度：思考/检索过程要持续可见，直到整条流结束（finally 里清）。
                            // 收到首个答案 token 时，把仍在 active 的最后一步标记完成。
                            setPipelineSteps(prev => prev.map(s => s.status === 'active' ? { ...s, status: 'done' as const } : s));
                            setMessages(prev => {
                                const arr = prev.slice();
                                const i = arr.length - 1;
                                if (i >= 0 && arr[i].role === 'assistant') {
                                    arr[i] = { ...arr[i], content: arr[i].content + evt.text };
                                }
                                return arr;
                            });
                        } else if (evt.type === 'error') {
                            setMessages(prev => {
                                const arr = prev.slice();
                                const i = arr.length - 1;
                                if (i >= 0 && arr[i].role === 'assistant') {
                                    arr[i] = { ...arr[i], content: t('request_failed', { message: evt.message }) };
                                }
                                return arr;
                            });
                        }
                    },
                    { signal: controller.signal, channel: 'askai' },
                );
            } catch (error: any) {
                if (error?.name === 'AbortError') {
                    // 用户主动取消，不当成报错
                } else {
                    console.error(error);
                    setMessages(prev => {
                        const arr = prev.slice();
                        const i = arr.length - 1;
                        if (i >= 0 && arr[i].role === 'assistant') {
                            arr[i] = { ...arr[i], content: t('request_failed_network') };
                        }
                        return arr;
                    });
                }
            } finally {
                abortRef.current = null;
                setLoading(false);
                setPipelineSteps([]);
            }
        } else {
            // 非 RAG 分支保持非流式（chatQuery 没有 streaming 后端，没必要也改）
            try {
                const response = await chatQuery(userQuery, language);
                setMessages(prev => [...prev, { role: 'assistant', content: response.answer }]);
            } catch (error) {
                console.error(error);
                const message = (() => {
                    if (typeof error === 'object' && error && 'response' in error) {
                        const resp: any = (error as any).response;
                        const detail = resp?.data?.detail;
                        if (typeof detail === 'string' && detail.trim()) return t('request_failed', { message: detail });
                    }
                    return t('request_failed_network');
                })();
                setMessages(prev => [...prev, { role: 'assistant', content: message }]);
            } finally {
                setLoading(false);
            }
        }
    };

    // 关闭抽屉时取消还在跑的流式请求，避免后台继续跑浪费 token
    useEffect(() => {
        if (!isOpen && abortRef.current) {
            abortRef.current.abort();
            abortRef.current = null;
        }
    }, [isOpen]);

    // 之前这里有个本地 renderContent 用 <a target="_blank"> 把 mp4 当本地视频流打开，
    // 在 NAS 全路径场景下（/volume1/...）走错了 endpoint，且体验和 Dr.bee 不一致。
    // 现已改用公共 MarkdownAnswer 组件 + VideoPlayerModal 弹窗（与 Dr.bee Lab 完全一致）。

    return (
        <>
            {/* Toggle Button */}
            {!isOpen && (
                <button
                    onClick={() => setIsOpen(true)}
                    className="fixed bottom-8 right-8 bg-primary text-text-inverse p-4 rounded-full shadow-xl hover:bg-primary-dark hover:scale-110 transition-all z-50 flex items-center gap-2 group animate-in slide-in-from-bottom-4 duration-500"
                >
                    <MessageSquare className="w-6 h-6 group-hover:rotate-12 transition-transform" />
                    <span className="font-bold pr-1">Dr. Bee</span>
                </button>
            )}

            {/* Drawer Backdrop */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity animate-in fade-in duration-300"
                    onClick={() => setIsOpen(false)}
                />
            )}

            {/* Drawer Panel */}
            <div className={clsx(
                "fixed top-0 right-0 h-full bg-surface-raised shadow-2xl shadow-ink/40 z-50 transition-transform duration-300 ease-out flex flex-col border-l border-ink/[0.08]",
                isOpen ? "translate-x-0" : "translate-x-full",
                // 抽屉宽度：手机 100%，平板 600，笔记本 760，普通桌面 900，大屏 1100。
                // 用 max-w 而不是定宽，避免在很窄的浏览器里被强制撑出横向滚动条。
                "w-full sm:w-[600px] md:w-[760px] lg:w-[900px] xl:w-[1100px] max-w-[100vw]"
            )}>
                {/* Header */}
                <div className="bg-surface-raised/80 backdrop-blur-md p-5 flex justify-between items-center border-b border-ink/[0.08] shrink-0 sticky top-0 z-10">
                    <div className="flex items-center gap-3">
                        <div className="bg-gradient-to-br from-primary to-primary-dark p-2.5 rounded-xl shadow-lg shadow-primary/20">
                            <Bot className="w-6 h-6 text-text-inverse" />
                        </div>
                        <div>
                            <h3 className="font-bold text-lg text-text-primary font-sans tracking-tight">Dr. Bee</h3>
                            <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-xs text-text-muted font-medium flex items-center gap-1">
                                    <Sparkles className="w-3 h-3 text-primary" />
                                    {activeModel
                                        ? t('model_label', { model: activeModel })
                                        : 'Powered by Xiaomi MiMo'}
                                </p>
                                {useRag && vectorStats && (
                                    <span className="text-[10px] text-primary font-medium bg-primary/10 px-1.5 py-0.5 rounded-full">
                                        {t('vectors_count', { count: vectorStats.total_vectors })}
                                    </span>
                                )}
                                {/* 思考/检索进度还在跑时（pipelineSteps 非空），先不显示顶部检索徽章，
                                    避免和底部单行进度里的"检索数据库"同时出现两处"检索"文案。
                                    进度结束（finally 清空 pipelineSteps）后再展示最终检索数。 */}
                                {activeRetrievedCount !== null && pipelineSteps.length === 0 && (
                                    <span
                                        title={
                                            activeMinScore != null && activeTopScore != null
                                                ? `阈值 ≥ ${activeMinScore.toFixed(2)} · 最高相似度 ${activeTopScore.toFixed(2)}`
                                                : ''
                                        }
                                        className={clsx(
                                            "text-[10px] font-medium px-1.5 py-0.5 rounded-full",
                                            activeLowRelevance
                                                ? "text-amber-700 bg-amber-100"
                                                : "text-emerald-700 bg-emerald-100"
                                        )}
                                    >
                                        {activeLowRelevance
                                            ? t('low_relevance_cases', { count: activeRetrievedCount })
                                            : t('auto_retrieved', { count: activeRetrievedCount })}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={() => setIsOpen(false)}
                        className="p-2 hover:bg-ink/[0.05] rounded-full transition-colors text-text-muted hover:text-text-primary"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* RAG Toggle */}
                <div className="p-4 bg-surface border-b border-ink/[0.08] flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className={clsx("w-2 h-2 rounded-full", useRag && vectorStats && vectorStats.total_vectors > 0 ? "bg-green-500 animate-pulse" : "bg-text-muted")} />
                        <span className="text-sm font-medium text-text-secondary">
                            {t('vector_retrieval')}
                        </span>
                    </div>
                    <button
                        onClick={() => setUseRag(!useRag)}
                        className={clsx(
                            "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-surface-raised",
                            useRag ? "bg-primary" : "bg-text-muted"
                        )}
                    >
                        <span
                            className={clsx(
                                "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                                useRag ? "translate-x-6" : "translate-x-1"
                            )}
                        />
                    </button>
                </div>

                {/* 新建对话按钮（仅有消息时显示） */}
                {messages.length > 0 && (
                    <div className="px-4 py-2 border-b border-ink/[0.08] flex justify-end bg-surface-raised">
                        <button
                            onClick={async () => {
                                setMessages([]);
                                try { await resetAskAiChat('askai'); } catch (_) { /* ignore */ }
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-ink/[0.1] bg-surface-overlay text-xs text-text-secondary hover:bg-ink/[0.05] transition-colors"
                        >
                            <MessageSquarePlus className="w-3.5 h-3.5" />
                            {t('new_conversation')}
                        </button>
                    </div>
                )}

                {/* Messages Area */}
                <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-6 space-y-6 bg-surface scrollbar-thin scrollbar-thumb-ink/10">
                    {messages.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full text-center text-text-muted p-8 animate-in zoom-in-95 duration-500">
                            <div className="w-20 h-20 bg-surface-overlay rounded-full flex items-center justify-center mb-6">
                                <Bot className="w-10 h-10 text-text-muted" />
                            </div>
                            <h4 className="font-bold text-text-primary mb-3 text-lg">{t('welcome')}</h4>
                            <div className="space-y-2 w-full max-w-sm">
                                <button onClick={() => setQuery(t('suggestion_quality'))} className="w-full p-3 text-sm text-text-secondary bg-surface-raised border border-ink/[0.08] rounded-xl hover:border-primary hover:text-primary transition-colors text-left">
                                    {`"${t('suggestion_quality')}"`}
                                </button>
                                <button onClick={() => setQuery(t('suggestion_issues'))} className="w-full p-3 text-sm text-text-secondary bg-surface-raised border border-ink/[0.08] rounded-xl hover:border-primary hover:text-primary transition-colors text-left">
                                    {`"${t('suggestion_issues')}"`}
                                </button>
                            </div>
                        </div>
                    )}

                    {messages.map((msg, idx) => (
                        <div key={idx} className={clsx("flex gap-4 animate-in slide-in-from-bottom-2 duration-300", msg.role === 'user' ? "flex-row-reverse" : "flex-row")}>
                            <div className={clsx(
                                "w-9 h-9 rounded-full flex items-center justify-center shrink-0 shadow-sm border-2 border-surface-raised",
                                msg.role === 'user' ? "bg-secondary text-text-inverse" : "bg-surface-overlay text-primary"
                            )}>
                                {msg.role === 'user' ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
                            </div>
                            <div className={clsx(
                                "max-w-[85%] rounded-2xl p-5 text-sm shadow-sm",
                                msg.role === 'user'
                                    ? "bg-secondary text-text-inverse rounded-tr-none shadow-md shadow-secondary/10"
                                    : "bg-surface-overlay border border-ink/[0.08] text-text-secondary rounded-tl-none"
                            )}>
                                {msg.role === 'user'
                                    ? msg.content
                                    : <MarkdownAnswer
                                        text={msg.content}
                                        onPlay={handlePlayVideo}
                                        onDetail={(path, title) => {
                                            let decodedPath = path;
                                            try { decodedPath = decodeURIComponent(path); } catch { /* ignore */ }
                                            const filename = decodedPath.split('/').pop() || decodedPath;
                                            const src = msg.sources?.find((s: any) =>
                                                s.video_path === decodedPath || s.video_path === path || s.video_name === filename
                                            );
                                            if (src && src.video_name) {
                                                // 精确按 video_name 查完整记录（不用 search 模糊匹配，
                                                // 否则会命中 transcript 里含同串的无关案例，卡片张冠李戴）。
                                                getAllResults({ video_name: src.video_name, limit: 1, include_failed: true }).then(res => {
                                                    if (res.data && res.data.length > 0) {
                                                        setSelectedFullResult(res.data[0]);
                                                    } else {
                                                        setSelectedSource(src);
                                                    }
                                                }).catch(() => setSelectedSource(src));
                                            } else if (src) {
                                                setSelectedSource(src);
                                            } else {
                                                handlePlayVideo(decodedPath, title);
                                            }
                                        }}
                                    />}
                                {/* Render sources for RAG responses */}
                                {msg.role === 'assistant' && msg.sources && msg.sources.length > 0 && (
                                    <div className="mt-3 pt-3 border-t border-ink/[0.08]">
                                        <details className="text-xs">
                                            <summary className="cursor-pointer text-text-muted hover:text-text-primary font-medium flex items-center gap-1">
                                                <Sparkles className="w-3 h-3" />
                                                {/* {t('referenced_cases', { count: msg.sources.length })} */}
                                            </summary>
                                            <div className="mt-2 space-y-2">
                                                {msg.sources.map((source: any, i: number) => {
                                                    const isSummary = source.doc_type === 'vehicle_summary';
                                                    if (isSummary) {
                                                        return (
                                                            <div key={i} className="bg-violet-100 rounded-lg p-3 border border-violet-200">
                                                                <div className="flex items-center gap-1.5 mb-1.5 text-violet-700 font-medium text-xs">
                                                                    <Sparkles className="w-3.5 h-3.5" />
                                                                    {`${(language === 'en' && source.brand_model_en ? source.brand_model_en : source.brand_model) || '—'}${source.system_version ? ` (V${source.system_version})` : ''} · ${t('vehicle_summary_card')}`}
                                                                </div>
                                                                <div className="text-violet-700/80 text-xs whitespace-pre-line line-clamp-6">
                                                                    {source.summary || ''}
                                                                </div>
                                                                <div className="text-violet-700/70 text-[11px] mt-1.5 flex items-center gap-1">
                                                                    <span className="font-medium">{t('similarity')}</span>
                                                                    {((source.score || 0) * 100).toFixed(1)}%
                                                                </div>
                                                            </div>
                                                        );
                                                    }
                                                    return (
                                                        <div key={i} className="bg-surface rounded-lg p-3 border border-ink/[0.08]">
                                                            {/* Structured Info */}
                                                            <div className="grid grid-cols-4 gap-2 mb-2">
                                                                {source.case_id && (
                                                                    <div className="bg-surface-overlay rounded px-2 py-1 border border-ink/[0.08]">
                                                                        <div className="text-[9px] text-text-muted">Case ID</div>
                                                                        <div className="text-xs font-mono font-medium">{source.case_id}</div>
                                                                    </div>
                                                                )}
                                                                {source.brand_model && (
                                                                    <div className="bg-surface-overlay rounded px-2 py-1 border border-ink/[0.08]">
                                                                        <div className="text-[9px] text-text-muted">品牌车型</div>
                                                                        <div className="text-xs font-medium">{language === 'en' && source.brand_model_en ? source.brand_model_en : source.brand_model}</div>
                                                                    </div>
                                                                )}
                                                                {source.system_version && (
                                                                    <div className="bg-surface-overlay rounded px-2 py-1 border border-ink/[0.08]">
                                                                        <div className="text-[9px] text-text-muted">系统版本</div>
                                                                        <div className="text-xs font-mono">{source.system_version}</div>
                                                                    </div>
                                                                )}
                                                                {source.function_domain && (
                                                                    <div className="bg-surface-overlay rounded px-2 py-1 border border-ink/[0.08]">
                                                                        <div className="text-[9px] text-text-muted">功能域</div>
                                                                        <div className="text-xs font-medium">{td(source.function_domain)}</div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div className="text-text-secondary text-xs">
                                                                <span className="font-medium">{t('question_label')}</span>
                                                                {source.user_question}
                                                            </div>
                                                            <div className="text-text-secondary text-xs mt-1">
                                                                <span className="font-medium">{t('response_label')}</span>
                                                                {source.system_response?.slice(0, 100)}...
                                                            </div>
                                                            <div className="text-text-muted text-xs mt-1 flex items-center gap-1">
                                                                <Sparkles className="w-3 h-3" />
                                                                <span className="font-medium">{t('similarity')}</span>
                                                                {(source.score * 100).toFixed(1)}%
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </details>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}

                    {/*
                      流式模式下，handleSend 已经预先插了一条空 assistant 消息占位，
                      此时上面的 messages.map 已经渲染了一个空 bubble；为避免再叠一个
                      "三点动画 bubble"，只在「末尾不是 assistant 占位」时才额外显示。
                      非流式（chatQuery）分支会走这条路径，没有提前插占位消息。
                    */}
                    {loading && (() => {
                        const last = messages[messages.length - 1];
                        const hasAssistantPlaceholder = last && last.role === 'assistant' && last.content === '';
                        if (hasAssistantPlaceholder && pipelineSteps.length > 0) {
                            // 思考/检索进度锁定为单行显示：当前步骤停在可见窗口，
                            // 已完成的步骤随进度往上翻出（overflow 裁掉），永远只显示一行文字，
                            // 不会与顶部检索徽章同时出现两处"检索"文案。
                            const activeIdx = pipelineSteps.findIndex(s => s.status === 'active');
                            const currentIndex = activeIdx === -1 ? pipelineSteps.length - 1 : activeIdx;
                            const LINE_H = 24; // px，与每行 h-6 对齐
                            return (
                                <div className="ml-[3.25rem] -mt-1 mb-2">
                                    <div className="inline-flex items-center bg-surface-overlay/60 border border-ink/[0.06] rounded-xl px-4 py-2">
                                        {/* 固定单行高度的视口，内部整列上移实现"翻页" */}
                                        <div className="overflow-hidden" style={{ height: LINE_H }}>
                                            <div
                                                className="flex flex-col transition-transform duration-300 ease-out"
                                                style={{ transform: `translateY(-${currentIndex * LINE_H}px)` }}
                                            >
                                                {pipelineSteps.map(s => (
                                                    <div key={s.id} className="flex items-center gap-2.5 text-xs" style={{ height: LINE_H }}>
                                                        {s.status === 'done'
                                                            ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                                                            : <Loader2 className="w-3.5 h-3.5 text-primary animate-spin shrink-0" />}
                                                        <span className={clsx(
                                                            "whitespace-nowrap transition-colors duration-300",
                                                            s.status === 'done' ? 'text-text-muted' : 'text-text-primary font-medium'
                                                        )}>
                                                            {stepLabel(s.id)}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        }
                        if (hasAssistantPlaceholder) {
                            return (
                                <div className="flex gap-4 -mt-2 ml-[3.25rem] text-text-muted text-xs items-center">
                                    <div className="flex gap-1.5">
                                        <div className="w-1.5 h-1.5 bg-primary/40 rounded-full animate-bounce" />
                                        <div className="w-1.5 h-1.5 bg-primary/40 rounded-full animate-bounce delay-75" />
                                        <div className="w-1.5 h-1.5 bg-primary/40 rounded-full animate-bounce delay-150" />
                                    </div>
                                </div>
                            );
                        }
                        return (
                            <div className="flex gap-4 animate-pulse">
                                <div className="w-9 h-9 rounded-full bg-surface-overlay border border-ink/[0.08] flex items-center justify-center shrink-0">
                                    <Bot className="w-5 h-5 text-primary" />
                                </div>
                                <div className="bg-surface-overlay border border-ink/[0.08] p-5 rounded-2xl rounded-tl-none">
                                    <div className="flex gap-1.5">
                                        <div className="w-2 h-2 bg-primary/40 rounded-full animate-bounce" />
                                        <div className="w-2 h-2 bg-primary/40 rounded-full animate-bounce delay-75" />
                                        <div className="w-2 h-2 bg-primary/40 rounded-full animate-bounce delay-150" />
                                    </div>
                                </div>
                            </div>
                        );
                    })()}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className="p-5 bg-surface-raised border-t border-ink/[0.08] shrink-0 pb-8">
                    <div className="relative rounded-2xl bg-surface border border-ink/[0.1] focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary transition-all">
                        <textarea
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSend();
                                }
                            }}
                            placeholder={t('input_placeholder')}
                            className="w-full bg-transparent border-none px-4 py-4 text-sm text-text-primary focus:ring-0 outline-none resize-none min-h-[60px] max-h-[150px] pr-14 placeholder-text-muted"
                            rows={1}
                        />
                        <button
                            onClick={handleSend}
                            disabled={loading || !query.trim()}
                            className="absolute right-2 bottom-2 p-2 bg-primary text-text-inverse rounded-xl hover:bg-primary-dark disabled:opacity-50 transition-all shadow-sm"
                        >
                            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                        </button>
                    </div>
                    <div className="text-center mt-3 text-[10px] text-text-muted font-medium">
                        {t('ai_disclaimer')}
                    </div>
                </div>
            </div>

            {/* 视频弹窗：点击 LLM 答复里的 .mp4 链接时打开。
                VideoPlayerModal 会根据 path 是否以 / 开头自动切到 NAS 流。 */}
            <VideoPlayerModal
                open={!!videoModalPath}
                videoPath={videoModalPath}
                title={videoModalTitle}
                onClose={() => {
                    setVideoModalPath(null);
                    setVideoModalTitle(null);
                }}
            />

            {/* 用例详情弹窗 — 使用和测试用例页面相同的完整详情组件 */}
            {selectedFullResult && (
                <ResultDetailModal
                    result={selectedFullResult}
                    onClose={() => setSelectedFullResult(null)}
                    onPlayVideo={(path, title) => {
                        setSelectedFullResult(null);
                        setVideoModalPath(path);
                        setVideoModalTitle(title);
                    }}
                />
            )}

            {/* Fallback: 当 API 查不到完整数据时，用 source 数据展示简化版 */}
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
                            response_quality_score: (() => {
                                const evals = selectedSource.evaluations || [];
                                const scores = evals.map((e: any) => e.score).filter((s: any) => typeof s === 'number');
                                return scores.length > 0 ? (scores.reduce((a: number, b: number) => a + b, 0) / scores.length).toFixed(1) : null;
                            })(),
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
                    onPlayVideo={(path, title) => {
                        setSelectedSource(null);
                        setVideoModalPath(path);
                        setVideoModalTitle(title);
                    }}
                />
            )}
        </>
    );
};

export default AskBeeEval;
