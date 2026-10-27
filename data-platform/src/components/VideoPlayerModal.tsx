import React, { useEffect, useRef, useState } from 'react';
import { Loader2, X, Lock } from 'lucide-react';
import { preloadNasVideo, signVideo, type VideoQuality } from '../api';
import { SERVER_URL } from '../config';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { isDomainTrial } from '../contexts/TrialContext';

interface Props {
    open: boolean;
    videoPath: string | null;
    title?: string | null;
    onClose: () => void;
    /** Legacy viewer sample whitelist. Membership video access is authorized by the signing API. */
    allowTrial?: boolean;
}

type LoadPhase = 'idle' | 'signing' | 'requesting' | 'metadata' | 'buffering' | 'ready' | 'error';

const PHASE_KEYS: Record<LoadPhase, string> = {
    idle: '',
    signing: 'generating_link',
    requesting: 'requesting_video',
    metadata: 'received_preparing',
    buffering: 'buffering',
    ready: '',
    error: 'load_failed',
};

/**
 * 通用视频弹窗。点击 markdown 链接 (.mp4) 时弹出，不离开当前页。
 *
 * 路径判断逻辑：以 / 开头的视为 NAS 路径，默认走 1080p 代理流；
 * 其他（含 http(s)://、相对路径）走 /api/video/stream，与 AskBeeEval 保持一致。
 *
 * 性能：
 * - NAS 默认 proxy，体积约为 4K 原片的 1/10~1/20，跨公网首开快很多
 * - preload="auto" 让浏览器立刻开始拉
 * - 分阶段加载提示（请求/元数据/缓冲/就绪），让用户感知到进度
 */
const VideoPlayerModal: React.FC<Props> = ({ open, videoPath, title, onClose, allowTrial = false }) => {
    const { t } = useTranslation();
    const { user } = useAuth();
    const videoRef = useRef<HTMLVideoElement>(null);
    const [phase, setPhase] = useState<LoadPhase>('idle');
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    // 弹窗打开时记录开始时间，让 progress 文案显示「已等待 Xs」
    const [openAt, setOpenAt] = useState<number>(0);
    const [, setNow] = useState<number>(0);

    // 签名 URL：每次打开都重新签，避免拿到过期 token
    const [signedUrl, setSignedUrl] = useState<string | null>(null);
    // NAS：默认代理流；用户可切换原片
    const [quality, setQuality] = useState<Exclude<VideoQuality, 'auto'>>('proxy');
    const [proxyReady, setProxyReady] = useState(false);
    const [resolvedQuality, setResolvedQuality] = useState<'proxy' | 'original' | string>('proxy');
    // 播放出错时自动重签一次（token 过期 / proxy 瞬时 503）
    const resignOnceRef = useRef(false);

    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        if (open) {
            window.addEventListener('keydown', handleEsc);
        }
        return () => window.removeEventListener('keydown', handleEsc);
    }, [open, onClose]);

    // 打开新视频时重置为代理流
    useEffect(() => {
        if (open && videoPath) {
            setQuality('proxy');
            resignOnceRef.current = false;
        }
    }, [open, videoPath]);

    // 核心效果：打开时 → 调 sign 拿带 token 的 URL；关闭时 → 暂停并清状态
    useEffect(() => {
        let cancelled = false;
        if (open && videoPath) {
            setPhase('signing');
            setErrorMsg(null);
            setOpenAt(Date.now());
            setSignedUrl(null);

            // LLM 生成的 markdown 链接可能含 URL 编码的中文路径，解码后再签名，
            // 避免 sign 端点对已编码路径再次 quote() 导致双重编码 → NAS 404。
            let decodedPath = videoPath;
            try { decodedPath = decodeURIComponent(videoPath); } catch { /* 非法编码保持原值 */ }

            // 启发式：以 / 开头视为 NAS 路径；其余按 local 处理
            const source = decodedPath.startsWith('/') ? 'nas' : 'local';
            const signQuality: VideoQuality = source === 'nas' ? quality : 'auto';
            signVideo(decodedPath, source, signQuality)
                .then((res) => {
                    if (cancelled) return;
                    // 后端返回的是相对 URL，前端按 SERVER_URL 拼绝对（或保持相对）
                    const absolute = res.url.startsWith('http')
                        ? res.url
                        : `${SERVER_URL}${res.url}`;
                    setSignedUrl(absolute);
                    setResolvedQuality(res.quality || (source === 'nas' ? quality : 'original'));
                    setProxyReady(Boolean(res.proxy_ready));
                    setPhase('requesting');
                })
                .catch((err) => {
                    if (cancelled) return;
                    setPhase('error');
                    const detail = err?.response?.data?.detail;
                    setErrorMsg(typeof detail === 'string' ? detail : t('sign_failed'));
                });
        } else if (!open && videoRef.current) {
            videoRef.current.pause();
            setPhase('idle');
            setSignedUrl(null);
        }
        return () => {
            cancelled = true;
        };
    }, [open, videoPath, quality, t]);

    // 「已等待 Xs」每秒更新一次，仅在还没就绪时跑
    useEffect(() => {
        if (phase === 'ready' || phase === 'idle' || phase === 'error') return;
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, [phase]);

    if (!open || !videoPath) return null;

    // Explicit memberships use server-side video authorization; Trial signing validates the travel domain.
    if (user?.role === 'viewer' && !['trial', 'plus', 'pro'].includes(user?.membership_tier || '') && !allowTrial) {
        return (
            <div
                className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/60 backdrop-blur-sm p-4"
                onClick={onClose}
            >
                <div
                    className="bg-surface-raised rounded-2xl border border-ink/[0.08] shadow-2xl px-10 py-14 flex flex-col items-center gap-4 max-w-sm text-center relative"
                    onClick={(e) => e.stopPropagation()}
                >
                    <button onClick={onClose} className="absolute top-4 right-4 text-text-muted hover:text-text-primary">
                        <X className="w-5 h-5" />
                    </button>
                    <div className="w-16 h-16 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
                        <Lock className="w-8 h-8 text-amber-700" />
                    </div>
                    <p className="text-base text-text-secondary">{t('trial_locked_video')}</p>
                </div>
            </div>
        );
    }

    const elapsedSec = phase === 'ready' || phase === 'idle' ? 0 : Math.floor((Date.now() - openAt) / 1000);
    const showOverlay = phase !== 'ready' && phase !== 'idle';
    const isNas = Boolean(videoPath && (videoPath.startsWith('/') || videoPath.startsWith('%2F') || videoPath.startsWith('%2f')));

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/60 backdrop-blur-sm p-4"
            onClick={onClose}
        >
            <div
                className="bg-surface-overlay rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-5 py-3 border-b border-ink/15 bg-surface-overlay gap-3">
                    <div className="text-text-primary font-medium truncate pr-2 min-w-0">
                        {title || videoPath}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        {isNas && (
                            <>
                                <span className="hidden sm:inline text-[11px] px-2 py-0.5 rounded-full border border-ink/15 text-slate-700">
                                    {resolvedQuality === 'proxy'
                                        ? (proxyReady ? t('quality_proxy_ready') : t('quality_proxy'))
                                        : (quality === 'proxy' && !proxyReady
                                            ? t('quality_original_warming')
                                            : t('quality_original'))}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setQuality((q) => (q === 'proxy' ? 'original' : 'proxy'))}
                                    className="text-xs px-2.5 py-1 rounded-md border border-ink/15 text-slate-700 hover:bg-surface-overlay transition-colors"
                                >
                                    {quality === 'proxy' ? t('switch_to_original') : t('switch_to_proxy')}
                                </button>
                            </>
                        )}
                        <button
                            onClick={onClose}
                            className="text-slate-700 hover:text-text-primary p-1.5 rounded-full hover:bg-surface-overlay transition-colors"
                            aria-label="Close"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>
                <div className="flex-1 flex items-center justify-center bg-black overflow-hidden relative">
                    <video
                        ref={videoRef}
                        controls
                        autoPlay
                        muted
                        preload="auto"
                        playsInline
                        src={signedUrl || undefined}
                        className="max-h-[80vh] max-w-full"
                        onLoadStart={() => setPhase('requesting')}
                        onLoadedMetadata={() => setPhase('metadata')}
                        onWaiting={() => setPhase('buffering')}
                        onCanPlay={() => {
                            setPhase('ready');
                            const v = videoRef.current;
                            if (v) {
                                v.play().then(() => { v.muted = false; }).catch(() => {});
                            }
                        }}
                        onPlaying={() => setPhase('ready')}
                        onLoadedData={() => {
                            // Trial playback is signed, but cache administration is not a Trial permission.
                            if (!isDomainTrial(user) && videoPath && videoPath.startsWith('/')) {
                                let dp = videoPath;
                                try { dp = decodeURIComponent(videoPath); } catch { /* ignore */ }
                                preloadNasVideo(dp);
                            }
                        }}
                        onError={(e) => {
                            const v = e.currentTarget as HTMLVideoElement;
                            const code = v.error?.code;
                            const codeMsg: Record<number, string> = {
                                1: 'aborted',
                                2: 'network',
                                3: 'decode',
                                4: 'src not supported',
                            };
                            const msg = code ? codeMsg[code] || `code=${code}` : 'unknown';

                            // network/decode/src：自动重签一次（处理 token 过期或 proxy 瞬时不可用）
                            if (!resignOnceRef.current && videoPath && (code === 2 || code === 3 || code === 4)) {
                                resignOnceRef.current = true;
                                setPhase('signing');
                                setErrorMsg(null);
                                let decodedPath = videoPath;
                                try { decodedPath = decodeURIComponent(videoPath); } catch { /* ignore */ }
                                const source = decodedPath.startsWith('/') ? 'nas' : 'local';
                                const signQuality: VideoQuality = source === 'nas' ? quality : 'auto';
                                signVideo(decodedPath, source, signQuality)
                                    .then((res) => {
                                        const absolute = res.url.startsWith('http')
                                            ? res.url
                                            : `${SERVER_URL}${res.url}`;
                                        setSignedUrl(absolute);
                                        setResolvedQuality(res.quality || (source === 'nas' ? quality : 'original'));
                                        setProxyReady(Boolean(res.proxy_ready));
                                        setPhase('requesting');
                                    })
                                    .catch((err) => {
                                        setPhase('error');
                                        const detail = err?.response?.data?.detail;
                                        setErrorMsg(typeof detail === 'string' ? detail : msg);
                                    });
                                return;
                            }

                            setPhase('error');
                            setErrorMsg(msg);
                        }}
                    >
                        {t('browser_not_supported')}
                    </video>
                    {showOverlay && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 pointer-events-none">
                            {phase === 'error' ? (
                                <div className="text-red-700 text-sm font-medium">
                                    {t(PHASE_KEYS[phase])}
                                    {errorMsg ? `（${errorMsg}）` : ''}
                                </div>
                            ) : (
                                <>
                                    <Loader2 className="w-8 h-8 text-white/80 animate-spin mb-2" />
                                    <div className="text-white/90 text-sm font-medium">
                                        {t(PHASE_KEYS[phase])}
                                    </div>
                                    <div className="text-white/50 text-xs mt-1 font-mono">
                                        {elapsedSec > 2 ? t('waited_seconds', { seconds: elapsedSec }) : ''}
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>
                <div className="px-5 py-2 text-xs text-slate-700 font-mono break-all bg-surface-overlay border-t border-ink/15">
                    {videoPath}
                </div>
            </div>
        </div>
    );
};

export default VideoPlayerModal;
