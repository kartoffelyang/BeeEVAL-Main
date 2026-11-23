import { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { getMetricsMap, getDomainsMap, getTaskDetailMap, getBrandMap } from '../api';
import bundled from '../locales/en/evaluationLabels.json';
import { getSubCategoryEnName } from '../pages/vehicle-scores/metricsHierarchy';

const modelNames: Record<string, string> = {
  '蔚来': 'NIO', '理想': 'Li Auto', '极氪': 'ZEEKR',
  '小鹏': 'XPENG', '魏牌': 'WEY', '红旗': 'HONGQI', '领克': 'Lynk & Co', '小鹏GX': 'XPENG GX',
  '小米Yu7': 'Xiaomi YU7', '小米YU7': 'Xiaomi YU7', '小米澎程N90': 'Xiaomi N90',
  '大众与众08': 'Volkswagen ID. UNYX 08', '魏牌二代蓝山': 'WEY Lanshan II',
  '魏牌 V9X': 'WEY V9X', '理想L9 Livis': 'Li Auto L9 Livis', '理想i8': 'Li Auto i8',
  '长安启源Q06': 'Changan Qiyuan Q06', '大众ID.ERA 9X': 'Volkswagen ID. ERA 9X',
};
let metricsCache: Record<string, string> = bundled.metrics;
let domainsCache: Record<string, string> = bundled.domains;
let tasksCache: Record<string, string> = bundled.tasks;
let brandsCache: Record<string, string> = { ...bundled.brands, ...modelNames };
let loaded = false;
let fetchPromise: Promise<void> | null = null;

function ensureLoaded(): Promise<void> {
  if (loaded) return Promise.resolve();
  if (fetchPromise) return fetchPromise;
  fetchPromise = Promise.all([getMetricsMap(), getDomainsMap(), getTaskDetailMap(), getBrandMap()])
    .then(([m, d, tk, b]) => {
      metricsCache = { ...metricsCache, ...m };
      domainsCache = { ...domainsCache, ...d };
      tasksCache = { ...tasksCache, ...tk };
      brandsCache = { ...brandsCache, ...b, ...modelNames };
      loaded = true;
    })
    .catch(() => {
      metricsCache = metricsCache || {};
      domainsCache = domainsCache || {};
      tasksCache = tasksCache || {};
      brandsCache = brandsCache || {};
    });
  return fetchPromise;
}

/**
 * 把 brand_model（如「问界M9」）按品牌前缀译成英文（「Aito M9」）。
 * 前缀映射来自后端 brand-map；型号后缀（M9/YU7/ET5…）原样保留。
 * 长前缀优先，避免「吉利」截断「吉利银河」。
 */
function translateBrandModel(brandModel: string, map: Record<string, string>): string {
  if (!brandModel) return brandModel;
  const bm = brandModel.trim();
  if (map[bm]) return map[bm]; // 完整命中
  const prefixes = Object.keys(map).sort((a, b) => b.length - a.length);
  for (const zh of prefixes) {
    if (bm.startsWith(zh)) {
      const en = map[zh];
      const suffix = bm.slice(zh.length);
      if (!suffix) return en;
      // 英文前缀与型号后缀之间补空格（除非前缀已以空格/连字符结尾）
      return /[\s-]$/.test(en) ? `${en}${suffix}` : `${en} ${suffix}`;
    }
  }
  return brandModel;
}

export function useMetricsTranslation() {
  const { language } = useLanguage();
  const [ready, setReady] = useState(loaded);

  useEffect(() => {
    if (!ready) {
      ensureLoaded().then(() => setReady(true));
    }
  }, [ready]);

  // 指标名 中→英
  const tm = useCallback((name: string): string => {
    if (language === 'zh' || !metricsCache) return name;
    return metricsCache[name] || (name === '其它' ? 'Other metrics' : getSubCategoryEnName(name));
  }, [language, ready]);

  // 功能域 中→英
  const td = useCallback((name: string): string => {
    if (language === 'zh' || !domainsCache) return name;
    return domainsCache[name] || name;
  }, [language, ready]);

  // 任务类型(task_detail) 中→英
  const tt = useCallback((name: string): string => {
    if (language === 'zh' || !tasksCache) return name;
    return tasksCache[name] || name;
  }, [language, ready]);

  // 车型名(brand_model) 中→英（前缀匹配 + 保留型号后缀）
  const tv = useCallback((brandModel: string): string => {
    if (language === 'zh' || !brandsCache) return brandModel;
    return translateBrandModel(brandModel, brandsCache);
  }, [language, ready]);

  return { tm, td, tt, tv, ready };
}
