import { useEffect, useState } from 'react';

import { signVideo, type VideoQuality } from '../api';
import { SERVER_URL } from '../config';

/**
 * 把一个原始视频 path 转成可直接喂给 <video src> 的签名 URL。
 *
 * 用法：
 *   const { url, loading, error } = useSignedVideoUrl(path, 'auto');
 *   <video src={url ?? undefined} ... />
 *
 * 注意：
 * - 视频流走 signed URL 是因为 <video> 标签没法带 Authorization 头；
 * - signed token 默认 TTL 5 分钟，点击播放即时签发，足够单次播放使用；
 * - NAS 默认 quality=auto → 1080p 代理流；
 * - path 改变 → 重新签发；为空 → 清空。
 */
export const useSignedVideoUrl = (
    path: string | null | undefined,
    source: 'local' | 'nas' | 'auto' = 'auto',
    quality: VideoQuality = 'auto',
) => {
    const [url, setUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        if (!path) {
            setUrl(null);
            setLoading(false);
            setError(null);
            return;
        }

        // 自动判定：以 / 开头视为 NAS（与 VideoPlayerModal 一致）
        const finalSource =
            source === 'auto' ? (path.startsWith('/') ? 'nas' : 'local') : source;

        setLoading(true);
        setError(null);
        signVideo(path, finalSource, quality)
            .then((res) => {
                if (cancelled) return;
                const absolute = res.url.startsWith('http')
                    ? res.url
                    : `${SERVER_URL}${res.url}`;
                setUrl(absolute);
            })
            .catch((err) => {
                if (cancelled) return;
                const detail = err?.response?.data?.detail;
                setError(typeof detail === 'string' ? detail : 'sign_failed');
                setUrl(null);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [path, source, quality]);

    return { url, loading, error };
};
