import React, { useEffect, useRef, useState } from 'react';
import { getBuilderPagePreview } from '../../api';
import { Loader2, AlertCircle } from 'lucide-react';

type Props = {
    pageIndex: number;
    /** 缩略图高度（px），宽度撑满容器 */
    height?: number;
};

// 单页真实缩略图缓存：同一页只请求一次 HTML（构建器内多处复用）
const _htmlCache = new Map<number, string>();

/**
 * 报告某一页的真实缩略图：懒加载单页 HTML，用 iframe 放大后 scale 缩小成缩略图。
 * 进视口才拉取；pointer-events:none 防误触。
 */
const PagePreviewThumb: React.FC<Props> = ({ pageIndex, height = 150 }) => {
    const boxRef = useRef<HTMLDivElement>(null);
    const [html, setHtml] = useState<string | null>(_htmlCache.get(pageIndex) ?? null);
    const [visible, setVisible] = useState(false);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        const el = boxRef.current;
        if (!el) return;
        const io = new IntersectionObserver((entries) => {
            if (entries.some((e) => e.isIntersecting)) { setVisible(true); io.disconnect(); }
        }, { rootMargin: '150px' });
        io.observe(el);
        return () => io.disconnect();
    }, []);

    useEffect(() => {
        if (!visible || html !== null || failed) return;
        let alive = true;
        getBuilderPagePreview(pageIndex)
            .then((r) => { if (alive) { _htmlCache.set(pageIndex, r.html_content); setHtml(r.html_content); } })
            .catch(() => { if (alive) setFailed(true); });
        return () => { alive = false; };
    }, [visible, html, failed, pageIndex]);

    return (
        <div ref={boxRef} className="relative w-full overflow-hidden rounded-md bg-white border border-ink/[0.08]"
            style={{ height }}>
            {html !== null ? (
                <iframe
                    title={`page-${pageIndex}`}
                    srcDoc={html}
                    sandbox="allow-same-origin"
                    aria-hidden
                    scrolling="no"
                    className="pointer-events-none border-0 bg-white"
                    style={{ width: '400%', height: '400%', transform: 'scale(0.25)', transformOrigin: 'top left' }}
                />
            ) : failed ? (
                <div className="h-full flex items-center justify-center text-slate-700 gap-1.5 text-xs">
                    <AlertCircle className="w-3.5 h-3.5" />预览失败
                </div>
            ) : (
                <div className="h-full flex items-center justify-center">
                    <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                </div>
            )}
        </div>
    );
};

export default PagePreviewThumb;
