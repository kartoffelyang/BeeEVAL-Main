import LightSelect from '../components/LightSelect';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    AlertCircle,
    Bot,
    History as HistoryIcon,
    Loader2,
    MessageSquarePlus,
    PlayCircle,
    Save,
    Send,
    Settings2,
    Sparkles,
} from 'lucide-react';

import {
    DrBeeConfig,
    DrBeeQueryResponse,
    DrBeeSelectionMode,
    DrBeeSource,
    RagStreamEvent,
    drBeeQueryStream,
    getDrBeeConfig,
    getDrBeeChatHistory,
    resetDrBeeChat,
    saveDrBeeSession,
} from '../api';
import VideoPlayerModal from '../components/VideoPlayerModal';
import { MarkdownAnswer } from '../components/MarkdownAnswer';
import { useMetricsTranslation } from '../hooks/useMetricsTranslation';

const TOP_K_DEFAULT = 20;
const MIN_SCORE_FALLBACK = 0.55;

const DrBeeLab: React.FC = () => {
    const { t } = useTranslation();
    const { tm, tv } = useMetricsTranslation();

    const [config, setConfig] = useState<DrBeeConfig | null>(null);
    const [configLoading, setConfigLoading] = useState(true);
    const [configError, setConfigError] = useState<string | null>(null);

    const [systemInstruction, setSystemInstruction] = useState('');
    const [promptTemplate, setPromptTemplate] = useState('');
    const [modelKey, setModelKey] = useState('');
    const [topK, setTopK] = useState(TOP_K_DEFAULT);
    const [selectionMode, setSelectionMode] = useState<DrBeeSelectionMode>('manual');
    const [minScore, setMinScore] = useState<number>(MIN_SCORE_FALLBACK);
    // RAG 增强（Lab 默认关，让测试人员对比开/关效果）
    const [useHyde, setUseHyde] = useState<boolean>(false);
    const [useIntentRouter, setUseIntentRouter] = useState<boolean>(true);
    const [question, setQuestion] = useState('');

    // ── 多轮对话消息列表 ──────────────────────────────────────────────
    interface ChatMessage {
        role: 'user' | 'assistant';
        content: string;
        meta?: DrBeeQueryResponse;  // 只有 assistant 消息才有 meta（用于调试信息）
    }
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [response, setResponse] = useState<DrBeeQueryResponse | null>(null);  // 最近一条 assistant
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const chatContainerRef = useRef<HTMLDivElement>(null);

    const [askLoading, setAskLoading] = useState(false);
    const [askError, setAskError] = useState<string | null>(null);

    const [saveTitle, setSaveTitle] = useState('');
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState<string | null>(null);

    const [videoModalPath, setVideoModalPath] = useState<string | null>(null);
    const [videoModalTitle, setVideoModalTitle] = useState<string | null>(null);
    const [selectedSource, setSelectedSource] = useState<DrBeeSource | null>(null);

    useEffect(() => {
        let mounted = true;
        // 并行加载配置和历史
        Promise.all([
            getDrBeeConfig(),
            getDrBeeChatHistory('drbee'),
        ]).then(([cfg, historyMsgs]) => {
            if (!mounted) return;
            setConfig(cfg);
            setSystemInstruction(cfg.default_system_instruction);
            setPromptTemplate(cfg.default_prompt_template);
            setModelKey(cfg.default_model_key || (cfg.models[0]?.key ?? ''));
            if (typeof cfg.default_min_score === 'number') {
                setMinScore(cfg.default_min_score);
            }
            // 恢复历史消息（无 meta，仅展示内容）
            if (historyMsgs.length > 0) {
                setMessages(historyMsgs.map(m => ({ role: m.role, content: m.content })));
            }
        }).catch((err) => {
            if (!mounted) return;
            setConfigError(err?.response?.data?.detail || err?.message || 'Failed to load config');
        }).finally(() => mounted && setConfigLoading(false));
        return () => {
            mounted = false;
        };
    }, []);

    const missingPlaceholders = useMemo(() => {
        if (!config) return [];
        return config.required_placeholders.filter((ph) => !promptTemplate.includes(ph));
    }, [config, promptTemplate]);

    const canAsk =
        !!question.trim() &&
        !!modelKey &&
        !askLoading &&
        missingPlaceholders.length === 0;

    const handleAsk = async () => {
        if (!canAsk) return;
        const userMsg = question.trim();
        setAskLoading(true);
        setAskError(null);
        setSaveMsg(null);
        setQuestion('');
        setMessages(prev => [...prev, { role: 'user', content: userMsg }]);

        // 流式回答：先追加一条空 assistant 消息，逐字填充
        let streamingMeta: DrBeeQueryResponse | null = null;
        let streamingSources: DrBeeSource[] = [];
        let streamingText = '';

        setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

        try {
            await drBeeQueryStream(
                {
                    question: userMsg,
                    prompt_template: promptTemplate,
                    system_instruction: systemInstruction,
                    model_key: modelKey,
                    top_k: topK,
                    selection_mode: selectionMode,
                    min_score: selectionMode === 'auto' ? minScore : null,
                    use_hyde: useHyde,
                    use_intent_router: useIntentRouter,
                    channel: 'drbee',
                },
                (event: RagStreamEvent) => {
                    if (event.type === 'meta') {
                        streamingMeta = {
                            answer: '',
                            sources: [],
                            model_key: event.modelKey,
                            model_name: event.modelName,
                            llm_latency_ms: 0,
                            total_latency_ms: 0,
                            retrieved_count: event.retrievedCount,
                            selection_mode: event.selectionMode,
                            min_score_used: event.minScoreUsed,
                            top_score: event.topScore,
                            low_relevance: event.lowRelevance,
                            intent: event.intent ?? undefined,
                            intent_source: event.intentSource ?? undefined,
                            used_hyde: event.usedHyde ?? false,
                            no_data_reason: null,
                        } as DrBeeQueryResponse;
                    } else if (event.type === 'sources') {
                        streamingSources = event.sources as DrBeeSource[];
                        if (streamingMeta) streamingMeta = { ...streamingMeta, sources: streamingSources };
                    } else if (event.type === 'chunk') {
                        streamingText += event.text;
                        setMessages(prev => {
                            const updated = [...prev];
                            updated[updated.length - 1] = {
                                role: 'assistant',
                                content: streamingText,
                                meta: streamingMeta ? { ...streamingMeta, answer: streamingText } : undefined,
                            };
                            return updated;
                        });
                    } else if (event.type === 'done') {
                        const finalMeta = streamingMeta
                            ? { ...streamingMeta, answer: streamingText, sources: streamingSources }
                            : null;
                        setResponse(finalMeta);
                        setMessages(prev => {
                            const updated = [...prev];
                            updated[updated.length - 1] = {
                                role: 'assistant',
                                content: streamingText,
                                meta: finalMeta ?? undefined,
                            };
                            return updated;
                        });
                    } else if (event.type === 'error') {
                        setAskError(event.message);
                        setMessages(prev => prev.slice(0, -1));
                    }
                },
            );
        } catch (err: any) {
            setAskError(err?.message || 'Query failed');
            setMessages(prev => {
                // 移除空的 assistant 消息和 user 消息
                const filtered = prev.filter((_, i) => i < prev.length - 2);
                return filtered;
            });
        } finally {
            setAskLoading(false);
        }
    };

    const handleNewChat = async () => {
        setMessages([]);
        setResponse(null);
        setQuestion('');
        setAskError(null);
        setSaveMsg(null);
        try { await resetDrBeeChat('drbee'); } catch (_) { /* 忽略网络错 */ }
    };

    const handleSave = async () => {
        if (!response) return;
        // 找到与最近 assistant response 对应的 user 问题
        const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
        const userQuestion = lastUserMsg?.content || '';
        setSaving(true);
        setSaveMsg(null);
        try {
            await saveDrBeeSession({
                title: saveTitle.trim() || null,
                prompt_template: promptTemplate,
                model_key: response.model_key,
                model_name: response.model_name,
                user_question: userQuestion,
                answer: response.answer,
                llm_latency_ms: response.llm_latency_ms,
                total_latency_ms: response.total_latency_ms,
                // auto 模式 top_k 没意义，回填实际取的条数让历史记录更直观
                top_k: response.selection_mode === 'auto' ? response.retrieved_count : topK,
                retrieved_sources: response.sources,
                selection_mode: response.selection_mode,
                min_score: response.min_score_used,
                top_score: response.top_score,
                low_relevance: response.low_relevance,
            });
            setSaveMsg(t('drbee_save_success'));
            setSaveTitle('');
        } catch (err: any) {
            setSaveMsg(err?.response?.data?.detail || err?.message || 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    const resetToDefaults = () => {
        if (!config) return;
        setSystemInstruction(config.default_system_instruction);
        setPromptTemplate(config.default_prompt_template);
        setModelKey(config.default_model_key);
        setTopK(TOP_K_DEFAULT);
        setSelectionMode('manual');
        setMinScore(config.default_min_score ?? MIN_SCORE_FALLBACK);
        setUseHyde(false);
        setUseIntentRouter(true);
    };

    return (
        <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">
            {/* Header */}
            <div className="flex items-start justify-between mb-6">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="bg-gradient-to-br from-primary to-secondary p-2.5 rounded-xl shadow-lg shadow-primary/20">
                            <Bot className="w-6 h-6 text-text-primary" />
                        </div>
                        <h1 className="text-2xl font-bold text-text-primary font-sans">
                            {t('drbee_lab')}
                        </h1>
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                            {t('drbee_tester_only')}
                        </span>
                    </div>
                    <p className="text-sm text-text-muted">
                        {t('drbee_lab_desc')}
                    </p>
                </div>
                <Link
                    to="/drbee/sessions"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-raised border border-ink/[0.08] text-text-secondary hover:bg-ink/[0.05] hover:border-primary/40 hover:text-primary transition-colors text-sm font-medium shadow-sm"
                >
                    <HistoryIcon className="w-4 h-4" />
                    {t('drbee_history')}
                </Link>
            </div>

            {configLoading && (
                <div className="flex items-center gap-2 text-text-muted text-sm py-12 justify-center">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>{t('loading_data')}</span>
                </div>
            )}

            {configError && (
                <div className="flex items-start gap-2 text-red-700 bg-red-100 border border-red-200 rounded-lg p-4 mb-4">
                    <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
                    <div className="text-sm">{configError}</div>
                </div>
            )}

            {config && (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    {/* ───────── 左：配置 ───────── */}
                    <div className="bg-surface-raised rounded-2xl border border-ink/[0.08] shadow-sm p-5 space-y-5">
                        <div className="flex items-center justify-between">
                            <h2 className="font-semibold text-text-primary flex items-center gap-2">
                                <Settings2 className="w-4 h-4 text-primary" />
                                {t('drbee_config')}
                            </h2>
                            <button
                                onClick={resetToDefaults}
                                className="text-xs text-text-muted hover:text-primary"
                            >
                                {t('drbee_reset_defaults')}
                            </button>
                        </div>

                        {/* Model + retrieval mode */}
                        <div>
                            <label className="text-xs font-medium text-text-secondary mb-1 block">
                                {t('drbee_model')}
                            </label>
                            <LightSelect
                                value={modelKey}
                                onChange={(e) => setModelKey(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-ink/[0.08] bg-surface-raised text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                                disabled={config.models.length === 0}
                            >
                                {config.models.length === 0 ? (
                                    <option value="">
                                        {t('drbee_no_model')}
                                    </option>
                                ) : (
                                    config.models.map((m) => (
                                        <option key={m.key} value={m.key}>
                                            {m.label} — {m.model_name}
                                        </option>
                                    ))
                                )}
                            </LightSelect>
                        </div>

                        {/* Selection mode + threshold/top_k */}
                        <div className="grid grid-cols-2 gap-3 items-end">
                            <div>
                                <label className="text-xs font-medium text-text-secondary mb-1 block">
                                    {t('drbee_retrieval_mode')}
                                </label>
                                <div
                                    role="tablist"
                                    aria-label={t('drbee_retrieval_mode')}
                                    className="inline-flex w-full rounded-lg border border-ink/[0.08] bg-surface p-0.5 text-xs font-medium"
                                >
                                    <button
                                        type="button"
                                        role="tab"
                                        aria-selected={selectionMode === 'manual'}
                                        onClick={() => setSelectionMode('manual')}
                                        className={
                                            'flex-1 px-3 py-1.5 rounded-md transition-colors ' +
                                            (selectionMode === 'manual'
                                                ? 'bg-surface-raised text-text-primary shadow-sm'
                                                : 'text-text-muted hover:text-text-primary')
                                        }
                                    >
                                        {t('drbee_mode_manual')}
                                    </button>
                                    <button
                                        type="button"
                                        role="tab"
                                        aria-selected={selectionMode === 'auto'}
                                        onClick={() => setSelectionMode('auto')}
                                        className={
                                            'flex-1 px-3 py-1.5 rounded-md transition-colors ' +
                                            (selectionMode === 'auto'
                                                ? 'bg-surface-raised text-text-primary shadow-sm'
                                                : 'text-text-muted hover:text-text-primary')
                                        }
                                    >
                                        {t('drbee_mode_auto')}
                                    </button>
                                </div>
                            </div>
                            {selectionMode === 'manual' ? (
                                <div>
                                    <label className="text-xs font-medium text-text-secondary mb-1 block">
                                        Top-K
                                    </label>
                                    <input
                                        type="number"
                                        min={1}
                                        max={config.rag_max_k || 50}
                                        value={topK}
                                        onChange={(e) => setTopK(parseInt(e.target.value || '0', 10) || 1)}
                                        className="w-full px-3 py-2 rounded-lg border border-ink/[0.08] bg-surface-raised text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                                    />
                                </div>
                            ) : (
                                <div>
                                    <label className="text-xs font-medium text-text-secondary mb-1 block">
                                        {t('drbee_min_score')}
                                    </label>
                                    <input
                                        type="number"
                                        min={0}
                                        max={1}
                                        step={0.05}
                                        value={minScore}
                                        onChange={(e) => {
                                            const v = parseFloat(e.target.value);
                                            if (Number.isNaN(v)) return;
                                            setMinScore(Math.max(0, Math.min(1, v)));
                                        }}
                                        className="w-full px-3 py-2 rounded-lg border border-ink/[0.08] bg-surface-raised text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono"
                                    />
                                </div>
                            )}
                        </div>
                        {selectionMode === 'auto' && (
                            <div className="-mt-2 text-[11px] text-text-muted leading-snug">
                                {t('drbee_auto_filter_hint', { min: config.rag_min_k, max: config.rag_max_k })}
                            </div>
                        )}

                        {/* RAG 增强 toggles —— 测试人员可对比开/关效果 */}
                        <div className="space-y-2 pt-1">
                            <label className="text-xs font-medium text-text-secondary block">
                                {t('drbee_rag_enhancement')}
                            </label>
                            <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-surface border border-ink/[0.08]">
                                <div className="flex-1 min-w-0">
                                    <div className="text-xs font-medium text-text-secondary">
                                        {t('drbee_use_hyde')}
                                    </div>
                                    <div className="text-[10px] text-text-muted leading-snug mt-0.5">
                                        {t('drbee_hyde_hint')}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={useHyde}
                                    onClick={() => setUseHyde((v) => !v)}
                                    className={
                                        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ' +
                                        (useHyde ? 'bg-primary' : 'bg-ink/[0.1]')
                                    }
                                >
                                    <span
                                        className={
                                            'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ' +
                                            (useHyde ? 'translate-x-4' : 'translate-x-0.5')
                                        }
                                    />
                                </button>
                            </div>
                            <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-surface border border-ink/[0.08]">
                                <div className="flex-1 min-w-0">
                                    <div className="text-xs font-medium text-text-secondary">
                                        {t('drbee_use_intent_router')}
                                    </div>
                                    <div className="text-[10px] text-text-muted leading-snug mt-0.5">
                                        {t('drbee_ranking_hint')}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={useIntentRouter}
                                    onClick={() => setUseIntentRouter((v) => !v)}
                                    className={
                                        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ' +
                                        (useIntentRouter ? 'bg-primary' : 'bg-ink/[0.1]')
                                    }
                                >
                                    <span
                                        className={
                                            'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ' +
                                            (useIntentRouter ? 'translate-x-4' : 'translate-x-0.5')
                                        }
                                    />
                                </button>
                            </div>

                        </div>

                        {/* System prompt */}
                        <div>
                            <label className="text-xs font-medium text-text-secondary mb-1 block">
                                {t('drbee_system_prompt')}
                            </label>
                            <textarea
                                value={systemInstruction}
                                onChange={(e) => setSystemInstruction(e.target.value)}
                                rows={6}
                                className="w-full px-3 py-2 rounded-lg border border-ink/[0.08] bg-surface/50 text-xs font-mono text-text-secondary leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/30 resize-y"
                            />
                        </div>

                        {/* User prompt template */}
                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <label className="text-xs font-medium text-text-secondary">
                                    {t('drbee_prompt_template')}
                                </label>
                                <PlaceholderHints
                                    required={config.required_placeholders}
                                    optional={config.optional_placeholders}
                                />
                            </div>
                            <textarea
                                value={promptTemplate}
                                onChange={(e) => setPromptTemplate(e.target.value)}
                                rows={12}
                                className="w-full px-3 py-2 rounded-lg border border-ink/[0.08] bg-surface/50 text-xs font-mono text-text-secondary leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/30 resize-y"
                            />
                            {missingPlaceholders.length > 0 && (
                                <div className="mt-2 flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                    <span>
                                        {(t('drbee_missing_placeholders')) +
                                            missingPlaceholders.join(', ')}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Question */}
                        <div>
                            <label className="text-xs font-medium text-text-secondary mb-1 block">
                                {t('drbee_question')}
                            </label>
                            <textarea
                                value={question}
                                onChange={(e) => setQuestion(e.target.value)}
                                rows={3}
                                placeholder={t('drbee_question_placeholder')}
                                className="w-full px-3 py-2 rounded-lg border border-ink/[0.08] bg-surface-raised text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-y"
                            />
                        </div>

                        <button
                            onClick={handleAsk}
                            disabled={!canAsk}
                            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-text-inverse font-medium text-sm shadow-md shadow-primary/20 hover:bg-primary/90 disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed transition-colors"
                        >
                            {askLoading ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    {t('drbee_asking')}
                                </>
                            ) : (
                                <>
                                    <Send className="w-4 h-4" />
                                    {t('drbee_ask')}
                                </>
                            )}
                        </button>
                    </div>

                    {/* ───────── 右：多轮对话 ───────── */}
                    <div className="bg-surface-raised rounded-2xl border border-ink/[0.08] shadow-sm p-5 flex flex-col min-h-[480px]">
                        {/* 头部：标题 + 新建对话按钮 */}
                        <div className="flex items-center justify-between mb-3 shrink-0">
                            <h2 className="font-semibold text-text-primary flex items-center gap-2">
                                <Sparkles className="w-4 h-4 text-primary" />
                                {t('drbee_answer')}
                                {messages.length > 0 && (
                                    <span className="text-xs text-text-muted font-normal ml-1">
                                        ({Math.floor(messages.length / 2)} {t('chat_turns')})
                                    </span>
                                )}
                            </h2>
                            {messages.length > 0 && (
                                <button
                                    onClick={handleNewChat}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-ink/[0.08] bg-surface-raised text-xs text-text-secondary hover:bg-ink/[0.05] transition-colors"
                                    title={t('chat_new_conversation')}
                                >
                                    <MessageSquarePlus className="w-3.5 h-3.5" />
                                    {t('chat_new_conversation')}
                                </button>
                            )}
                        </div>

                        {/* 对话内容区 */}
                        <div ref={chatContainerRef} className="flex-1 overflow-y-auto space-y-4 pr-1 min-h-0">
                            {messages.length === 0 && !askLoading && (
                                <div className="text-sm text-text-muted italic py-12 text-center border border-dashed border-ink/[0.08] rounded-lg">
                                    {t('drbee_empty_answer')}
                                </div>
                            )}

                            {messages.map((msg, idx) => (
                                <div key={idx}>
                                    {msg.role === 'user' ? (
                                        /* 用户气泡 */
                                        <div className="flex justify-end">
                                            <div className="max-w-[85%] bg-primary/10 text-text-primary rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm">
                                                {msg.content}
                                            </div>
                                        </div>
                                    ) : (
                                        /* 助手气泡 */
                                        <div className="space-y-2">
                                            {/* 调试 meta 信息 */}
                                            {msg.meta && (
                                                <div className="px-3 py-2 rounded-lg bg-surface border border-ink/[0.08] text-xs text-text-muted font-mono break-all flex flex-wrap items-center gap-x-3 gap-y-1">
                                                    <span>
                                                        {t('drbee_used_model')}: <strong>{msg.meta.model_name}</strong>
                                                    </span>
                                                    <span>LLM: {msg.meta.llm_latency_ms}ms</span>
                                                    <span>{t('drbee_total_latency')}: {msg.meta.total_latency_ms}ms</span>
                                                    <span>{msg.meta.retrieved_count} {t('drbee_sources')}</span>
                                                    {msg.meta.intent && (
                                                        <span className={
                                                            'inline-flex items-center px-1.5 py-0.5 rounded font-sans text-[10px] font-medium ' +
                                                            (msg.meta.intent === 'case_lookup'
                                                                ? 'bg-surface-overlay text-text-secondary border border-ink/[0.08]'
                                                                : 'bg-violet-50 text-violet-700 border border-violet-200')
                                                        }>
                                                            {msg.meta.intent}
                                                            {msg.meta.intent_source
                                                                ? ` (${msg.meta.intent_source})` : ''}
                                                        </span>
                                                    )}
                                                    {msg.meta.used_hyde && (
                                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded font-sans text-[10px] font-medium bg-cyan-50 text-cyan-700 border border-cyan-200">
                                                            HyDE
                                                        </span>
                                                    )}
                                                    {msg.meta.low_relevance && (
                                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded font-sans text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                                                            <AlertCircle className="w-3 h-3 mr-0.5" />
                                                            low relevance
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                            <MarkdownAnswer
                                                text={msg.content}
                                                onPlay={(path, title) => {
                                                    setVideoModalPath(path);
                                                    setVideoModalTitle(title);
                                                }}
                                                onDetail={(path, _title) => {
                                                    let decodedPath = path;
                                                    try { decodedPath = decodeURIComponent(path); } catch { /* ignore */ }
                                                    const filename = decodedPath.split('/').pop() || decodedPath;
                                                    const src = msg.meta?.sources.find(s =>
                                                        s.video_path === decodedPath || s.video_path === path || s.video_name === filename
                                                    );
                                                    if (src) setSelectedSource(src);
                                                    else { setVideoModalPath(decodedPath); setVideoModalTitle(_title); }
                                                }}
                                            />
                                            {/* 最后一条 assistant：显示 sources + save */}
                                            {idx === messages.length - 1 && msg.meta && (
                                                <>
                                                    {msg.meta.sources.length > 0 && (
                                                        <div className="pt-3 mt-1 border-t border-ink/[0.08]">
                                                            <div className="text-xs font-medium text-text-secondary mb-2">
                                                                {(t('drbee_sources_label')) + ` (${msg.meta.sources.length})`}
                                                            </div>
                                                            <SourcesList sources={msg.meta.sources} onPlay={(path, title) => {
                                                                setVideoModalPath(path);
                                                                setVideoModalTitle(title);
                                                            }} onDetail={(source) => setSelectedSource(source)} />
                                                        </div>
                                                    )}
                                                    <div className="pt-3 mt-1 border-t border-ink/[0.08]">
                                                        <div className="text-xs font-medium text-text-secondary mb-2">
                                                            {t('drbee_save_session')}
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <input
                                                                type="text"
                                                                value={saveTitle}
                                                                onChange={(e) => setSaveTitle(e.target.value)}
                                                                placeholder={t('drbee_save_title_placeholder')}
                                                                className="flex-1 px-3 py-2 rounded-lg border border-ink/[0.08] bg-surface-raised text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                                                            />
                                                            <button
                                                                onClick={handleSave}
                                                                disabled={saving}
                                                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-text-inverse text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                                                            >
                                                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                                                {t('save_changes')}
                                                            </button>
                                                        </div>
                                                        {saveMsg && <div className="mt-2 text-xs text-text-muted">{saveMsg}</div>}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}

                            {askLoading && (
                                <div className="flex items-center gap-2 text-text-muted text-sm py-4">
                                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                                    <span>{t('drbee_thinking')}</span>
                                </div>
                            )}

                            {askError && (
                                <div className="flex items-start gap-2 text-red-700 bg-red-100 border border-red-200 rounded-lg p-3 text-xs">
                                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                                    <div className="break-all">{askError}</div>
                                </div>
                            )}

                            <div ref={messagesEndRef} />
                        </div>
                    </div>
                </div>
            )}

            <VideoPlayerModal
                open={!!videoModalPath}
                videoPath={videoModalPath}
                title={videoModalTitle}
                onClose={() => {
                    setVideoModalPath(null);
                    setVideoModalTitle(null);
                }}
            />

            {/* 用例详情弹窗 */}
            {selectedSource && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
                    onClick={() => setSelectedSource(null)}
                >
                    <div
                        className="bg-surface-raised rounded-2xl shadow-2xl shadow-ink/40 w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 relative"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="p-6 border-b border-ink/[0.08] flex justify-between items-start bg-surface">
                            <div>
                                <div className="flex items-center gap-3 mb-2">
                                    <span className="bg-primary text-text-inverse text-xs font-bold px-2 py-1 rounded uppercase tracking-wider shadow-sm">
                                        {selectedSource.brand_model ? tv(selectedSource.brand_model) : 'OTHER'}
                                    </span>
                                    <span className="text-text-muted text-sm font-mono">{selectedSource.video_name}</span>
                                </div>
                                <h2 className="text-2xl font-bold text-text-primary">
                                    {(selectedSource.video_name || '').replace(/\.(mp4|mov|avi|mkv)$/i, '')}
                                </h2>
                            </div>
                            <button
                                onClick={() => setSelectedSource(null)}
                                className="p-2 hover:bg-ink/[0.05] rounded-full transition-colors text-text-muted"
                            >
                                <span className="text-xl leading-none">✕</span>
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-hidden relative">
                            <div className="flex flex-col md:grid md:grid-cols-3 h-full absolute inset-0 w-full">
                                {/* Left */}
                                <div className="md:col-span-1 bg-surface p-6 border-r border-ink/[0.08] space-y-6 overflow-y-auto h-full">
                                    <div
                                        className="rounded-xl overflow-hidden shadow-sm bg-black aspect-video relative group cursor-pointer"
                                        onClick={() => {
                                            if (selectedSource.video_path) {
                                                setSelectedSource(null);
                                                setVideoModalPath(selectedSource.video_path);
                                                setVideoModalTitle(selectedSource.video_name || selectedSource.video_path);
                                            }
                                        }}
                                    >
                                        <div className="w-full h-full bg-surface-overlay" />
                                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                                            {selectedSource.video_path ? (
                                                <>
                                                    <PlayCircle className="w-14 h-14 text-text-primary drop-shadow-lg group-hover:scale-110 transition-transform" />
                                                    <span className="text-text-primary/80 text-xs font-medium">{t('click_to_play')}</span>
                                                </>
                                            ) : (
                                                <>
                                                    <PlayCircle className="w-10 h-10 text-text-primary/30" />
                                                    <span className="text-text-primary/40 text-xs">{t('no_video_path')}</span>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    <div className="bg-surface-raised p-4 rounded-xl shadow-sm border border-ink/[0.08] text-center">
                                        <div className="text-sm text-text-muted mb-1 uppercase tracking-wide font-semibold">Overall Score</div>
                                        {(() => {
                                            const evals = selectedSource.evaluations || [];
                                            const scores = evals.map((e: any) => e.score).filter((s: any) => typeof s === 'number');
                                            const avg = scores.length > 0 ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length : null;
                                            return (
                                                <div className={`text-4xl font-black ${avg === null ? 'text-text-muted' : avg >= 4 ? 'text-emerald-600' : avg >= 3 ? 'text-amber-500' : 'text-rose-500'}`}>
                                                    {avg !== null ? avg.toFixed(1) : 'N/A'}
                                                    <span className="text-lg text-text-muted ml-1 font-normal">/ 5</span>
                                                </div>
                                            );
                                        })()}
                                    </div>

                                    {selectedSource.created_at && (
                                        <div className="bg-surface-raised p-3 rounded-lg border border-ink/[0.08]">
                                            <div className="text-xs text-text-muted mb-1">Analysis Date</div>
                                            <div className="text-sm">{new Date(selectedSource.created_at).toLocaleDateString()}</div>
                                        </div>
                                    )}
                                </div>

                                {/* Right */}
                                <div className="md:col-span-2 p-8 space-y-8 bg-surface-raised overflow-y-auto h-full">
                                    <section className="mb-6">
                                        <h3 className="text-lg font-bold text-text-primary mb-3">{t('interaction_log')}</h3>
                                        <div className="space-y-4">
                                            <div className="flex gap-3 justify-end">
                                                <div className="bg-secondary text-text-inverse p-3 rounded-2xl rounded-tr-none text-sm max-w-[80%] shadow-sm">
                                                    <div className="text-[10px] opacity-70 mb-1 uppercase tracking-wide font-semibold">User</div>
                                                    {selectedSource.user_question || 'N/A'}
                                                </div>
                                            </div>
                                            <div className="flex gap-3">
                                                <div className="bg-surface-overlay text-text-primary p-3 rounded-2xl rounded-tl-none text-sm max-w-[80%] border border-ink/[0.08]">
                                                    <div className="text-[10px] text-text-muted mb-1 uppercase tracking-wide font-semibold">System</div>
                                                    {selectedSource.system_response || 'N/A'}
                                                </div>
                                            </div>
                                        </div>
                                    </section>

                                    <section>
                                        <h3 className="text-lg font-bold text-text-primary mb-3 flex items-center gap-2">
                                            <span className="text-blue-500">ⓘ</span> {t('summary')}
                                        </h3>
                                        <div className="bg-blue-100 p-4 rounded-xl text-text-secondary leading-relaxed border border-blue-100 text-sm">
                                            {selectedSource.summary || 'N/A'}
                                        </div>
                                    </section>

                                    {selectedSource.evaluations && selectedSource.evaluations.length > 0 && (
                                        <section>
                                            <h3 className="text-lg font-bold text-text-primary mb-4">{t('evaluation_details')}</h3>
                                            <div className="space-y-4">
                                                {selectedSource.evaluations.map((ev, i) => (
                                                    <div key={i} className="bg-surface-raised border border-ink/[0.08] rounded-xl p-4 hover:border-blue-300 transition-colors">
                                                        <div className="flex justify-between items-center mb-2">
                                                            <span className="font-bold text-text-secondary">{tm(ev.metric_name || ev.criteria)}</span>
                                                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${(ev.score ?? 0) >= 4 ? 'bg-emerald-100 text-emerald-700' : (ev.score ?? 0) >= 3 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>
                                                                {ev.score} / 5
                                                            </span>
                                                        </div>
                                                        <p className="text-sm text-text-secondary">{ev.feedback}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </section>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// ──────────────────────────────────────────────────────────────
// 子组件：占位符提示
// ──────────────────────────────────────────────────────────────
const PlaceholderHints: React.FC<{ required: string[]; optional: string[] }> = ({ required, optional }) => {
    const { t } = useTranslation();
    return (
        <div className="text-[10px] text-text-muted flex items-center gap-1.5">
            <span className="font-medium text-amber-700">{t('required_label')}</span>
            {required.map((p) => (
                <code key={p} className="px-1 py-0.5 rounded bg-amber-50 border border-amber-200 font-mono text-amber-700">
                    {p}
                </code>
            ))}
            <span className="font-medium ml-2">{t('optional_label')}</span>
            {optional.map((p) => (
                <code key={p} className="px-1 py-0.5 rounded bg-surface border border-ink/[0.08] font-mono text-text-muted">
                    {p}
                </code>
            ))}
        </div>
    );
};

// MarkdownAnswer 已抽到 src/components/MarkdownAnswer.tsx，与 Ask AI 共用，避免重复维护两份。

// ──────────────────────────────────────────────────────────────
// 子组件：检索来源列表
// ──────────────────────────────────────────────────────────────
const SourcesList: React.FC<{
    sources: DrBeeSource[];
    onPlay: (path: string, title: string) => void;
    onDetail: (source: DrBeeSource) => void;
}> = ({ sources, onPlay, onDetail }) => {
    const { t } = useTranslation();
    const { tv, td } = useMetricsTranslation();
    return (
        <div className="space-y-2 max-h-96 overflow-auto pr-1">
            {sources.map((s, i) => {
                const isSummary = s.doc_type === 'vehicle_summary';
                return (
                    <div
                        key={i}
                        className={
                            'text-xs border rounded-lg p-2.5 transition-colors ' +
                            (isSummary
                                ? 'border-violet-200 bg-violet-50/50 hover:bg-violet-50'
                                : 'border-ink/[0.08] hover:border-ink/[0.08] hover:bg-ink/[0.05]')
                        }
                    >
                        <div className="flex items-center justify-between gap-2 mb-1">
                            <div className="flex items-center gap-1.5 truncate">
                                {isSummary ? (
                                    <span className="inline-flex items-center gap-1 text-violet-700 font-medium truncate">
                                        <Sparkles className="w-3.5 h-3.5 shrink-0" />
                                        {`${s.brand_model ? tv(s.brand_model) : '—'}${s.system_version ? ` (V${s.system_version})` : ''} · ${t('vehicle_summary_card')}`}
                                    </span>
                                ) : (
                                    <button
                                        onClick={() => onDetail(s)}
                                        className="text-primary hover:text-primary/80 font-medium truncate inline-flex items-center gap-1"
                                        title={s.video_path || s.video_name || ''}
                                    >
                                        <PlayCircle className="w-3.5 h-3.5 shrink-0" />
                                        {s.video_name || s.video_path || '—'}
                                    </button>
                                )}
                            </div>
                            <span className="text-[10px] text-text-muted shrink-0">#{i + 1}</span>
                        </div>
                        <div className={isSummary ? 'text-violet-700/80 line-clamp-3 whitespace-pre-line' : 'text-text-muted line-clamp-2'}>
                            {s.summary || s.user_question || ''}
                        </div>
                        {!isSummary && (
                            <div className="text-[10px] text-text-muted mt-1 font-mono truncate">
                                {[s.brand_model ? tv(s.brand_model) : null, s.system_version, s.function_domain ? td(s.function_domain) : null].filter(Boolean).join(' · ')}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export default DrBeeLab;
