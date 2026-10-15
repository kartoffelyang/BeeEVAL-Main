import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getReportConfig, saveReportConfig, RecipeKind, ReportConfig } from '../api';
import { ArrowLeft, Loader2, Save, AlertCircle, CheckCircle2, FileJson, MessageSquareText, Database, LayoutTemplate, Lock } from 'lucide-react';

type TabDef = { kind: RecipeKind; label: string; icon: React.ReactNode; editable: boolean; desc: string };

const TABS: TabDef[] = [
    { kind: 'schema', label: '规范', icon: <FileJson className="w-4 h-4" />, editable: true, desc: '指标体系 / 功能域 / SOA / 问法枚举 / 分档口径。改这里，报告结构随之变化。' },
    { kind: 'prompts', label: '归类规则', icon: <MessageSquareText className="w-4 h-4" />, editable: true, desc: 'LLM 把用例归到 SOA / 问法 / 子类的指令文本。改这里，归类逻辑随之变化。' },
    { kind: 'aggregation', label: '数据聚合', icon: <Database className="w-4 h-4" />, editable: false, desc: '数据来源与算分逻辑说明（只读）。' },
    { kind: 'template', label: '版式模板', icon: <LayoutTemplate className="w-4 h-4" />, editable: false, desc: '报告 34 页结构清单（只读）。' },
];

const ReportDetail = () => {
    const [active, setActive] = useState<RecipeKind>('schema');
    const [cfg, setCfg] = useState<ReportConfig | null>(null);
    const [draft, setDraft] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

    const load = useCallback(async (kind: RecipeKind) => {
        setLoading(true); setMsg(null);
        try {
            const c = await getReportConfig(kind);
            setCfg(c);
            if (typeof c.content === 'string') setDraft(c.content);
        } catch (e) {
            console.error(e); setMsg({ type: 'err', text: '加载失败' });
        } finally { setLoading(false); }
    }, []);

    useEffect(() => { load(active); }, [active, load]);

    const handleSave = async () => {
        setSaving(true); setMsg(null);
        try {
            await saveReportConfig(active, draft);
            setMsg({ type: 'ok', text: '已保存。下次生成报告将使用新配置。' });
        } catch (e: any) {
            setMsg({ type: 'err', text: e?.response?.data?.detail || '保存失败（请检查格式）' });
        } finally { setSaving(false); }
    };

    const tab = TABS.find((x) => x.kind === active)!;

    return (
        <div className="h-[100dvh] flex flex-col">
            <div className="flex items-center gap-3 px-6 py-3 border-b border-ink/[0.08] shrink-0">
                <Link to="/reports" className="inline-flex items-center gap-2 text-text-muted hover:text-text-primary transition-colors">
                    <ArrowLeft className="w-4 h-4" />返回报告
                </Link>
                <span className="text-text-primary font-medium">报告配方</span>
                <span className="text-text-muted text-sm">· 定义报告怎么生成，换车型通用</span>
            </div>
            {/* PLACEHOLDER_BODY */}
            <BodyRender tab={tab} cfg={cfg} draft={draft} setDraft={setDraft} loading={loading}
                saving={saving} msg={msg} onSave={handleSave}
                tabs={TABS} active={active} setActive={setActive} />
        </div>
    );
};

type BodyProps = {
    tab: TabDef; cfg: ReportConfig | null; draft: string; setDraft: (v: string) => void;
    loading: boolean; saving: boolean; msg: { type: 'ok' | 'err'; text: string } | null;
    onSave: () => void; tabs: TabDef[]; active: RecipeKind; setActive: (k: RecipeKind) => void;
};

const BodyRender: React.FC<BodyProps> = ({ tab, cfg, draft, setDraft, loading, saving, msg, onSave, tabs, active, setActive }) => (
    <div className="flex-1 min-h-0 flex">
        {/* 左侧 Tab */}
        <div className="w-52 shrink-0 border-r border-ink/[0.08] p-3 space-y-1">
            {tabs.map((x) => (
                <button key={x.kind} onClick={() => setActive(x.kind)}
                    className={'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ' +
                        (active === x.kind ? 'bg-blue-500/20 text-blue-700' : 'text-slate-700 hover:bg-ink/[0.04]')}>
                    {x.icon}{x.label}
                    {!x.editable && <Lock className="w-3 h-3 ml-auto text-text-muted" />}
                </button>
            ))}
        </div>
        {/* 右侧内容 */}
        <div className="flex-1 min-h-0 flex flex-col p-5">
            <div className="flex items-start justify-between gap-4 mb-3">
                <p className="text-sm text-text-muted">{tab.desc}</p>
                {tab.editable && (
                    <button onClick={onSave} disabled={saving}
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-ink text-text-inverse text-sm hover:bg-ink/85 disabled:opacity-40 shrink-0">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}保存
                    </button>
                )}
            </div>
            {msg && (
                <div className={'flex items-center gap-2 text-sm px-3 py-2 rounded-lg mb-3 ' +
                    (msg.type === 'ok' ? 'bg-emerald-500/10 text-emerald-700' : 'bg-rose-500/10 text-rose-700')}>
                    {msg.type === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}{msg.text}
                </div>
            )}
            {loading ? (
                <div className="flex-1 flex items-center justify-center"><Loader2 className="w-7 h-7 animate-spin text-blue-500" /></div>
            ) : tab.kind === 'template' && cfg && Array.isArray(cfg.content) ? (
                <div className="flex-1 min-h-0 overflow-auto rounded-lg border border-ink/[0.08] p-3">
                    {cfg.content.map((p: any) => (
                        <div key={p.page} className="flex items-baseline gap-3 py-1.5 border-b border-ink/[0.05] text-sm">
                            <span className="text-blue-700 font-mono w-8">{p.page}</span>
                            <span className="text-text-primary">{p.title || p.marker}</span>
                        </div>
                    ))}
                </div>
            ) : tab.editable ? (
                <textarea value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false}
                    className="flex-1 min-h-0 w-full bg-surface border border-ink/[0.08] rounded-lg p-4 text-slate-700 font-mono text-[13px] leading-relaxed resize-none focus:outline-none focus:border-blue-500/50" />
            ) : (
                <pre className="flex-1 min-h-0 overflow-auto bg-surface border border-ink/[0.08] rounded-lg p-4 text-slate-700 text-sm whitespace-pre-wrap">{draft}</pre>
            )}
        </div>
    </div>
);

export default ReportDetail;
