import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getReportInstance, getReportInstancePreview, ReportInstance } from '../api';
import { ArrowLeft, Loader2, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const ReportView = () => {
    const { t } = useTranslation();
    const { id } = useParams<{ id: string }>();
    const [meta, setMeta] = useState<ReportInstance | null>(null);
    const [html, setHtml] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!id) return;
        (async () => {
            setLoading(true);
            setError(null);
            try {
                const m = await getReportInstance(id);
                setMeta(m);
                if (m.status === 'completed' && m.has_html) {
                    const p = await getReportInstancePreview(id);
                    setHtml(p.html_content);
                } else {
                    setError(t('rg_preview_unavailable'));
                }
            } catch (e) {
                console.error(e);
                setError(t('reports_load_failed'));
            } finally {
                setLoading(false);
            }
        })();
    }, [id, t]);

    return (
        <div className="h-[100dvh] flex flex-col">
            <div className="flex items-center gap-3 px-6 py-3 border-b border-ink/[0.08] shrink-0">
                <Link to="/reports" className="inline-flex items-center gap-2 text-text-muted hover:text-text-primary transition-colors">
                    <ArrowLeft className="w-4 h-4" />{t('report_back')}
                </Link>
                {meta && <span className="text-text-primary font-medium truncate">{meta.name}</span>}
            </div>

            <div className="flex-1 min-h-0">
                {loading ? (
                    <div className="flex items-center justify-center h-full">
                        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                    </div>
                ) : error ? (
                    <div className="flex items-center justify-center h-full gap-2 text-rose-700">
                        <AlertCircle className="w-5 h-5" />{error}
                    </div>
                ) : (
                    <iframe
                        title={meta?.name || 'report'}
                        srcDoc={html}
                        className="w-full h-full bg-white border-0"
                        sandbox="allow-same-origin"
                    />
                )}
            </div>
        </div>
    );
};

export default ReportView;
