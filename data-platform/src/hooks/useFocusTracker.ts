import { useEffect, useRef } from 'react';
import { getAuthToken } from '../api';
import { BASE_URL } from '../config';
import { useAuth } from '../contexts/AuthContext';

const REPORT_INTERVAL = 30; // 每 30 秒检查一次

/**
 * 全局网页聚焦时长跟踪器。
 *
 * 工作原理：
 * - 每 30 秒检查 document.hasFocus()
 * - 聚焦时累加秒数
 * - 失焦 / 离开 / 累积达 5 分钟时上报一次
 * - 上报接口：POST /api/auth/focus-time { duration_sec }
 * - 失败静默忽略（不影响用户体验）
 */
export function useFocusTracker() {
    const { isAuthed } = useAuth();
    const accumulatedRef = useRef(0);
    const lastTickRef = useRef(Date.now());

    useEffect(() => {
        if (!isAuthed) return;

        const flush = () => {
            const sec = accumulatedRef.current;
            if (sec <= 0) return;
            accumulatedRef.current = 0;

            // 用 sendBeacon 保证页面关闭时也能发出去
            const token = getAuthToken();
            const body = JSON.stringify({ duration_sec: sec });
            try {
                if (navigator.sendBeacon) {
                    const blob = new Blob([body], { type: 'application/json' });
                    // sendBeacon 不支持自定义 header，走 fetch 兜底
                    fetch(`${BASE_URL}/auth/focus-time`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            ...(token ? { Authorization: `Bearer ${token}` } : {}),
                        },
                        body,
                        credentials: "include",
                        keepalive: true, // 允许页面关闭后请求仍完成
                    }).catch(() => {});
                }
            } catch {
                // 静默
            }
        };

        const tick = () => {
            const now = Date.now();
            const elapsed = Math.round((now - lastTickRef.current) / 1000);
            lastTickRef.current = now;

            if (document.hasFocus() && elapsed > 0 && elapsed <= REPORT_INTERVAL * 2) {
                accumulatedRef.current += elapsed;
            }

            // 累积 >= 5 分钟时主动上报一次（不等失焦）
            if (accumulatedRef.current >= 300) {
                flush();
            }
        };

        const timer = setInterval(tick, REPORT_INTERVAL * 1000);

        // 失焦时上报
        const handleVisibilityChange = () => {
            if (document.hidden) flush();
        };
        const handleBlur = () => flush();
        const handleBeforeUnload = () => flush();

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('blur', handleBlur);
        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            clearInterval(timer);
            flush(); // 组件卸载时把剩余的发出去
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('blur', handleBlur);
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, [isAuthed]);
}
