import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import {
    type VehicleListItem,
    type VehicleScoreSnapshot,
    getVehicleAggregatedScores,
} from '../../api';
import { useMetricsTranslation } from '../../hooks/useMetricsTranslation';

const VEHICLE_COLORS = [
    '#697a61', // blue-500 (本品)
    '#36715a', // emerald-500
    '#a17b35', // amber-500
    '#786d83', // purple-500
    '#b34840', // rose-500
];

export const vehicleKey = (v: { brand_model: string; system_version: string | null }) =>
    `${v.brand_model}||${v.system_version ?? ''}`;

export const parseVehicleKey = (key: string): { brand_model: string; system_version: string | null } => {
    const [bm, ver] = key.split('||');
    return { brand_model: bm, system_version: ver || null };
};

export type TabKey = 'overview' | 'acceptance' | 'baseline' | 'metric-baseline' | 'ranking';

interface ComparisonState {
    vehicles: VehicleListItem[];
    primaryKey: string | null;
    competitorKeys: string[];
    snapshots: Record<string, VehicleScoreSnapshot>;
    loadingKeys: Set<string>;
    activeTab: TabKey;
}

interface ComparisonActions {
    setVehicles: (list: VehicleListItem[]) => void;
    setPrimaryKey: (key: string) => void;
    addCompetitor: (key: string) => void;
    removeCompetitor: (key: string) => void;
    setActiveTab: (tab: TabKey) => void;
    fetchSnapshot: (key: string) => Promise<void>;
    fetchAllSelected: () => Promise<void>;
    getColor: (key: string) => string;
    getVehicleLabel: (key: string) => string;
    allSelectedKeys: () => string[];
}

type ContextValue = ComparisonState & ComparisonActions;

const ComparisonContext = createContext<ContextValue | null>(null);

export const useComparison = () => {
    const ctx = useContext(ComparisonContext);
    if (!ctx) throw new Error('useComparison must be used within ComparisonProvider');
    return ctx;
};

export const ComparisonProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { tv } = useMetricsTranslation();
    const [vehicles, setVehicles] = useState<VehicleListItem[]>([]);
    const [primaryKey, setPrimaryKey] = useState<string | null>(null);
    const [competitorKeys, setCompetitorKeys] = useState<string[]>([]);
    const [snapshots, setSnapshots] = useState<Record<string, VehicleScoreSnapshot>>({});
    const [loadingKeys, setLoadingKeys] = useState<Set<string>>(new Set());
    const [activeTab, setActiveTab] = useState<TabKey>('overview');
    const fetchingRef = useRef<Set<string>>(new Set());

    const addCompetitor = useCallback((key: string) => {
        setCompetitorKeys(prev => {
            if (prev.includes(key) || prev.length >= 4) return prev;
            return [...prev, key];
        });
    }, []);

    const removeCompetitor = useCallback((key: string) => {
        setCompetitorKeys(prev => prev.filter(k => k !== key));
    }, []);

    const fetchSnapshot = useCallback(async (key: string) => {
        if (fetchingRef.current.has(key)) return;
        fetchingRef.current.add(key);
        setLoadingKeys(prev => new Set([...prev, key]));
        try {
            const { brand_model, system_version } = parseVehicleKey(key);
            const snap = await getVehicleAggregatedScores(brand_model, system_version);
            if (!snap.criteria_scores) snap.criteria_scores = [];
            if (!snap.function_domain_scores) snap.function_domain_scores = [];
            setSnapshots(prev => ({ ...prev, [key]: snap }));
        } catch {
            // silently skip
        } finally {
            fetchingRef.current.delete(key);
            setLoadingKeys(prev => {
                const next = new Set(prev);
                next.delete(key);
                return next;
            });
        }
    }, []);

    const allSelectedKeys = useCallback(() => {
        const keys: string[] = [];
        if (primaryKey) keys.push(primaryKey);
        keys.push(...competitorKeys);
        return keys;
    }, [primaryKey, competitorKeys]);

    const fetchAllSelected = useCallback(async () => {
        const keys = allSelectedKeys();
        await Promise.all(keys.filter(k => !snapshots[k]).map(fetchSnapshot));
    }, [allSelectedKeys, snapshots, fetchSnapshot]);

    const getColor = useCallback((key: string) => {
        if (key === primaryKey) return VEHICLE_COLORS[0];
        const idx = competitorKeys.indexOf(key);
        return VEHICLE_COLORS[Math.min(idx + 1, VEHICLE_COLORS.length - 1)];
    }, [primaryKey, competitorKeys]);

    const getVehicleLabel = useCallback((key: string) => {
        const { brand_model, system_version } = parseVehicleKey(key);
        const name = tv(brand_model);
        return system_version ? `${name} · V${system_version}` : name;
    }, [tv]);

    const value: ContextValue = {
        vehicles,
        primaryKey,
        competitorKeys,
        snapshots,
        loadingKeys,
        activeTab,
        setVehicles,
        setPrimaryKey,
        addCompetitor,
        removeCompetitor,
        setActiveTab,
        fetchSnapshot,
        fetchAllSelected,
        getColor,
        getVehicleLabel,
        allSelectedKeys,
    };

    return (
        <ComparisonContext.Provider value={value}>
            {children}
        </ComparisonContext.Provider>
    );
};
