import React from 'react';
import { ReportInstance, ReportProgress } from '../../api';
import { RefreshCw, FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import ReportCard from './ReportCard';

type Props = {
    reports: ReportInstance[];
    progress: Record<string, ReportProgress>;
    pdfBusy: string | null;
    isAdmin?: boolean;
    /** 是否显示「标准/自定义」种类徽章（我的报告 Tab 用） */
    showKind?: boolean;
    emptyText: string;
    onRefresh: () => void;
    onOpen: (r: ReportInstance) => void;
    /** 下载 HTML/PDF。传 undefined 时卡片隐藏对应按钮（体验账号(viewer)不可下载）。 */
    onRename?: (r: ReportInstance) => void;
    onDelete?: (r: ReportInstance) => void;
    onPublish?: (r: ReportInstance) => void;
    onUnpublish?: (r: ReportInstance) => void;
    /** 空状态下的行动按钮（如“去生成”），可选 */
    emptyAction?: React.ReactNode;
};

/** 报告卡片墙。多个 Tab 复用同一网格，行为由传入回调决定。 */
const ReportCardGrid: React.FC<Props> = ({
    reports, progress, pdfBusy, showKind, emptyText, onRefresh,
    onOpen, onRename, onDelete, onPublish, onUnpublish, emptyAction,
}) => {
    const { t } = useTranslation();

    return (
        <section className="space-y-4">
            <div className="flex items-center justify-end">
                <button onClick={onRefresh} className="pf-icon-button" aria-label={t('rg_refresh')} title={t('rg_refresh')}>
                    <RefreshCw className="w-4 h-4" />
                </button>
            </div>

            {reports.length === 0 ? (
                <div className="pf-empty flex flex-col items-center gap-3">
                    <FileText className="w-8 h-8 text-slate-600" />
                    <div>{emptyText}</div>
                    {emptyAction}
                </div>
            ) : (
                <div className="rp-library-grid">
                    {reports.map((r) => (
                        <ReportCard
                            key={r.id}
                            report={r}
                            progress={progress[r.id]}
                            pdfBusy={pdfBusy === r.id}
                            showKind={showKind}
                            onOpen={onOpen}
                            onRename={onRename}
                            onDelete={onDelete}
                            onPublish={onPublish}
                            onUnpublish={onUnpublish}
                        />
                    ))}
                </div>
            )}
        </section>
    );
};

export default ReportCardGrid;
