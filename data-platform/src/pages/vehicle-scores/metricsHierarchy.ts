import metricsRaw from '../../../指标库.json';

export interface MetricItem {
    code: string;
    name: string;
    definition: string;
    scoring: string | null;
}

export interface SubCategory {
    key: string;
    metrics: MetricItem[];
}

export interface Domain {
    rawKey: string;
    englishName: string;
    chineseName: string;
    subCategories: SubCategory[];
}

let _domains: Domain[] | null = null;
let _nameToMetric: Map<string, { metric: MetricItem; subCategory: string; domain: Domain }> | null = null;

const DOMAIN_NAME_MAP: Record<string, { englishName: string; chineseName: string }> = {
    'feedbck': { englishName: 'Feedback', chineseName: '反馈' },
};

const SUB_CATEGORY_EN_MAP: Record<string, string> = {
    'P1-听觉感知能力': 'P1-Auditory Perception',
    'P2-视觉感知能力': 'P2-Visual Perception',
    'P3-生态互联': 'P3-Ecosystem Connectivity',
    'C1-自然语言': 'C1-Natural Language',
    'C2-知识推理': 'C2-Knowledge Reasoning',
    'C3-意图识别': 'C3-Intent Recognition',
    'A1-执行质量': 'A1-Execution Quality',
    'A2-执行效率': 'A2-Execution Efficiency',
    'A3-情感表达': 'A3-Emotional Expression',
    'F1-可用': 'F1-Usability',
    'F2-信任': 'F2-Trust',
    'F3-负荷': 'F3-Cognitive Load',
    'E1-记忆': 'E1-Memory',
};

export function getSubCategoryEnName(key: string): string {
    return SUB_CATEGORY_EN_MAP[key] || key;
}

function parseDomainKey(key: string): { englishName: string; chineseName: string } {
    if (DOMAIN_NAME_MAP[key]) return DOMAIN_NAME_MAP[key];
    const parts = key.split('\n');
    if (parts.length === 2) {
        return { englishName: parts[0], chineseName: parts[1] };
    }
    return { englishName: key, chineseName: key };
}

export function getDomains(): Domain[] {
    if (_domains) return _domains;

    _domains = [];
    const raw = metricsRaw as Record<string, Record<string, MetricItem[]>>;

    for (const domainKey of Object.keys(raw)) {
        const { englishName, chineseName } = parseDomainKey(domainKey);
        const subCategories: SubCategory[] = [];

        for (const subKey of Object.keys(raw[domainKey])) {
            subCategories.push({
                key: subKey,
                metrics: raw[domainKey][subKey],
            });
        }

        _domains.push({ rawKey: domainKey, englishName, chineseName, subCategories });
    }

    return _domains;
}

function buildNameIndex(): Map<string, { metric: MetricItem; subCategory: string; domain: Domain }> {
    if (_nameToMetric) return _nameToMetric;

    _nameToMetric = new Map();
    for (const domain of getDomains()) {
        for (const sub of domain.subCategories) {
            for (const metric of sub.metrics) {
                _nameToMetric.set(metric.name, { metric, subCategory: sub.key, domain });
                if (metric.code) {
                    _nameToMetric.set(metric.code, { metric, subCategory: sub.key, domain });
                }
            }
        }
    }
    return _nameToMetric;
}

export function lookupMetric(nameOrCode: string) {
    return buildNameIndex().get(nameOrCode) ?? null;
}

export function getDomainForMetric(nameOrCode: string): Domain | null {
    const entry = lookupMetric(nameOrCode);
    return entry?.domain ?? null;
}

export function getAllMetricNames(): string[] {
    const names: string[] = [];
    for (const domain of getDomains()) {
        for (const sub of domain.subCategories) {
            for (const metric of sub.metrics) {
                names.push(metric.name);
            }
        }
    }
    return names;
}

export function getMetricsByDomain(domainChineseName: string): MetricItem[] {
    const domain = getDomains().find(d => d.chineseName === domainChineseName);
    if (!domain) return [];
    const metrics: MetricItem[] = [];
    for (const sub of domain.subCategories) {
        metrics.push(...sub.metrics);
    }
    return metrics;
}
