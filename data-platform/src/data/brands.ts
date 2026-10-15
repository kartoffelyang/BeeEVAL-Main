/**
 * 品牌识别与展示配置
 * ==================
 * 从 brand_model（如「问界M9」）按前缀识别品牌，给出品牌名、Logo 文件名与主色。
 * 前缀映射与后端 api/services/brand_mapping.py 的内置口径保持一致。
 *
 * Logo：约定放在 public/brands/<slug>.png（透明底）。当前环境未内置真图，
 * BrandLogo 组件加载失败时回退为「文字型 Logo」（品牌名 + 配色圆标）。
 * 之后把对应 png 放进 public/brands/ 即会自动优先使用。
 */

export interface BrandInfo {
    /** 品牌显示名（中文） */
    name: string;
    /** Logo 文件名（不含扩展名），对应 public/brands/<slug>.png */
    slug: string;
    /** 品牌主色（回退文字标 / 圆标配色） */
    color: string;
}

// 按前缀匹配（长前缀优先），与后端内置映射一致。
const BRAND_PREFIXES: Array<{ prefix: string; info: BrandInfo }> = [
    { prefix: '吉利银河', info: { name: '吉利银河', slug: 'geely', color: '#1b68f5' } },
    { prefix: '理想', info: { name: '理想', slug: 'li-auto', color: '#0f8a5f' } },
    { prefix: '蔚来', info: { name: '蔚来', slug: 'nio', color: '#00bebe' } },
    { prefix: '小米', info: { name: '小米', slug: 'xiaomi', color: '#ff6900' } },
    { prefix: '问界', info: { name: '问界', slug: 'aito', color: '#c8102e' } },
];

/** 从 brand_model 识别品牌；识别不到返回 null。 */
export const detectBrand = (brandModel: string | undefined | null): BrandInfo | null => {
    if (!brandModel) return null;
    const bm = brandModel.trim();
    // 长前缀优先，避免「吉利」被短前缀截断
    const sorted = [...BRAND_PREFIXES].sort((a, b) => b.prefix.length - a.prefix.length);
    for (const { prefix, info } of sorted) {
        if (bm.startsWith(prefix)) return info;
    }
    return null;
};

/** Logo 图片地址（约定 png，透明底）。 */
export const brandLogoUrl = (slug: string) => `/brands/${slug}.png`;
