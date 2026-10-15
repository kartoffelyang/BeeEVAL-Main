import React, { useEffect, useState, Component, type ErrorInfo, type ReactNode } from 'react';
import {
    listVehiclesForAggregation,
    type VehicleListItem,
} from '../api';
import VehicleUpdateDialog from './vehicle-scores/VehicleUpdateDialog';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import {
    Car,
    AlertCircle,
    LayoutDashboard,
    Trophy,
    ClipboardCheck,
    Grid3x3,
    BarChart3,
    RefreshCw,
} from 'lucide-react';
import clsx from 'clsx';
import {
    ComparisonProvider,
    useComparison,
    vehicleKey,
    type TabKey,
} from './vehicle-scores/ComparisonContext';
import VehicleSelector from './vehicle-scores/VehicleSelector';
import OverviewTab from './vehicle-scores/OverviewTab';
import AcceptanceTab from './vehicle-scores/AcceptanceTab';
import ScenarioBaselineTab from './vehicle-scores/ScenarioBaselineTab';
import MetricBaselineTab from './vehicle-scores/MetricBaselineTab';
import RankingTab from './vehicle-scores/RankingTab';

class TabErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
    state = { error: null as Error | null };
    static getDerivedStateFromError(error: Error) { return { error }; }
    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error('[TabErrorBoundary]', error, info.componentStack);
    }
    render() {
        if (this.state.error) {
            return (
                <div className="bg-rose-100 border border-rose-200 text-rose-700 px-4 py-6 rounded-lg">
                    <p className="font-bold mb-1">渲染出错</p>
                    <p className="text-sm text-rose-700">{this.state.error.message}</p>
                    <button
                        onClick={() => this.setState({ error: null })}
                        className="mt-3 text-xs underline text-rose-700 hover:text-rose-700"
                    >
                        重试
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

const TABS: Array<{ key: TabKey; labelKey: string; icon: React.ReactNode }> = [
    { key: 'overview', labelKey: 'tab_overview', icon: <LayoutDashboard className="w-4 h-4" /> },
    { key: 'acceptance', labelKey: 'tab_acceptance', icon: <ClipboardCheck className="w-4 h-4" /> },
    { key: 'baseline', labelKey: 'tab_baseline', icon: <Grid3x3 className="w-4 h-4" /> },
    { key: 'metric-baseline', labelKey: 'tab_metric_baseline', icon: <BarChart3 className="w-4 h-4" /> },
    { key: 'ranking', labelKey: 'tab_ranking', icon: <Trophy className="w-4 h-4" /> },
];

const VehicleScoresInner: React.FC = () => {
    const { t: tLang } = useLanguage();
    const { t } = useTranslation();

    const {
        vehicles,
        setVehicles,
        primaryKey,
        setPrimaryKey,
        activeTab,
        setActiveTab,
        fetchSnapshot,
        snapshots,
    } = useComparison();

    const { hasRole } = useAuth();
    const isAdmin = hasRole('admin');

    const [loadingList, setLoadingList] = useState(true);
    const [listError, setListError] = useState<string | null>(null);
    const [showUpdateDialog, setShowUpdateDialog] = useState(false);

    const refreshVehicles = async () => {
        setLoadingList(true);
        setListError(null);
        try {
            const list = await listVehiclesForAggregation();
            setVehicles(list);
            if (list.length > 0 && !primaryKey) {
                const cached = list.find(v => v.has_cache);
                const first = cached || list[0];
                const firstKey = vehicleKey(first);
                setPrimaryKey(firstKey);
                await fetchSnapshot(firstKey);
            }
        } catch (e: any) {
            setListError(e?.message || t('load_vehicles_failed'));
        } finally {
            setLoadingList(false);
        }
    };

    useEffect(() => {
        refreshVehicles();
    }, []);

    // 只读取快照，不再在打开页面时自动触发重算。
    // 车能出现在这里 = 已被管理员在「更新评分」弹窗里确认并重算过。
    useEffect(() => {
        if (!primaryKey) return;
        if (snapshots[primaryKey]) return;
        fetchSnapshot(primaryKey);
    }, [primaryKey]);

    // 弹窗更新/移除后：刷新车辆列表 + 清掉当前车快照缓存以便重新拉取最新分。
    const handleDialogDone = async () => {
        await refreshVehicles();
        if (primaryKey) await fetchSnapshot(primaryKey);
    };

    const renderTab = () => {
        switch (activeTab) {
            case 'overview': return <OverviewTab />;
            case 'acceptance': return <AcceptanceTab />;
            case 'baseline': return <ScenarioBaselineTab />;
            case 'metric-baseline': return <MetricBaselineTab />;
            case 'ranking': return <RankingTab />;
        }
    };

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-6">
            {/* 标题 + 管理员工具栏 */}
            <div className="flex items-center justify-between gap-4">
                <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
                    <Car className="w-7 h-7 text-secondary" />
                    {t('vehicle_scores')}
                </h1>
                {isAdmin && (
                    <button
                        onClick={() => setShowUpdateDialog(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-ink/[0.12] text-text-muted hover:text-text-primary hover:border-ink/[0.25] transition-colors"
                        title="勾选数据完整的车型更新，被更新的车才进入评分板块"
                    >
                        <RefreshCw className="w-4 h-4" />
                        更新评分
                    </button>
                )}
            </div>

            {isAdmin && showUpdateDialog && (
                <VehicleUpdateDialog
                    onClose={() => setShowUpdateDialog(false)}
                    onDone={handleDialogDone}
                />
            )}

            {/* 车辆选择器 */}
            <div className="bg-surface-raised p-5 rounded-xl border border-ink/[0.08] shadow-sm">
                {loadingList ? (
                    <div className="text-sm text-text-muted">{t('loading')}</div>
                ) : listError ? (
                    <div className="text-sm text-rose-600 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" /> {listError}
                    </div>
                ) : vehicles.length === 0 ? (
                    <div className="text-sm text-text-muted">{t('vehicle_scores_no_data')}</div>
                ) : (
                    <VehicleSelector />
                )}
            </div>

            {/* Tab 导航 */}
            <div className="border-b border-ink/[0.08]">
                <nav className="flex gap-1 -mb-px">
                    {TABS.map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={clsx(
                                'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
                                activeTab === tab.key
                                    ? 'border-secondary text-secondary'
                                    : 'border-transparent text-text-muted hover:text-text-primary hover:border-ink/[0.1]'
                            )}
                        >
                            {tab.icon}
                            {tab.labelKey === 'P-CAFE' ? 'P-CAFE' : t(tab.labelKey)}
                        </button>
                    ))}
                </nav>
            </div>

            {/* Tab 内容 */}
            <TabErrorBoundary key={activeTab}>
                {renderTab()}
            </TabErrorBoundary>
        </div>
    );
};

const VehicleScores: React.FC = () => (
    <ComparisonProvider>
        <VehicleScoresInner />
    </ComparisonProvider>
);

export default VehicleScores;
