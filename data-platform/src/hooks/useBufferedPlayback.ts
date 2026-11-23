import { useEffect, useRef, useState, type RefObject } from 'react';

export function videoBuffer(video: HTMLVideoElement, targetSeconds: number) {
    let ahead = 0;
    for (let i = 0; i < video.buffered.length; i++) {
        if (video.buffered.start(i) <= video.currentTime + 0.1 && video.buffered.end(i) >= video.currentTime) {
            ahead = Math.max(ahead, video.buffered.end(i) - video.currentTime);
        }
    }
    const remaining = Number.isFinite(video.duration) ? Math.max(0, video.duration - video.currentTime) : Infinity;
    const target = Math.min(targetSeconds * Math.max(1, video.playbackRate), remaining);
    return { ahead, target, ready: video.readyState >= 2 && ahead + 0.15 >= target };
}

/** Start only on request; after a stall, collect a larger contiguous buffer. */
export function useBufferedPlayback(ref: RefObject<HTMLVideoElement>, source: string | null) {
    const controls = useRef({ play: () => {}, pause: () => {} });
    const [state, setState] = useState({ ahead: 0, target: 6, ready: false, waiting: false, requested: false });
    useEffect(() => {
        const video = ref.current;
        if (!video || !source) return;
        let requested = false, waiting = false, internalPause = false, disposed = false;
        let targetSeconds = 6;
        const publish = () => {
            if (!disposed) setState({ ...videoBuffer(video, targetSeconds), waiting, requested });
        };
        const start = () => {
            void video.play().catch((error: DOMException) => {
                if (disposed || error.name === 'AbortError') return;
                requested = false;
                waiting = false;
                publish();
            });
        };
        const hold = () => {
            waiting = true;
            if (!video.paused) {
                internalPause = true;
                video.pause();
            }
            publish();
        };
        const update = () => {
            const buffer = videoBuffer(video, targetSeconds);
            if (requested && waiting && buffer.ready) {
                waiting = false;
                start();
            }
            publish();
        };
        const onPlay = () => {
            requested = true;
            if (!videoBuffer(video, targetSeconds).ready) hold();
            else { waiting = false; publish(); }
        };
        const onPause = () => {
            if (internalPause) { internalPause = false; return; }
            requested = false;
            waiting = false;
            publish();
        };
        const onWaiting = () => {
            if (requested && !video.ended) {
                targetSeconds = Math.min(targetSeconds + 4, 20);
                hold();
            }
        };
        const onSeeking = () => {
            if (requested && !videoBuffer(video, targetSeconds).ready) hold();
            else update();
        };
        const finish = () => { requested = false; waiting = false; publish(); };
        controls.current = {
            play: () => { requested = true; start(); },
            pause: () => { requested = false; waiting = false; video.pause(); publish(); },
        };
        const listeners: Array<[string, () => void]> = [
            ['play', onPlay], ['pause', onPause], ['waiting', onWaiting], ['seeking', onSeeking],
            ['progress', update], ['canplay', update], ['loadeddata', update], ['seeked', update],
            ['durationchange', update], ['ratechange', update], ['ended', finish], ['error', finish],
        ];
        listeners.forEach(([event, handler]) => video.addEventListener(event, handler));
        const timer = window.setInterval(update, 500);
        publish();
        return () => {
            disposed = true;
            requested = false;
            window.clearInterval(timer);
            listeners.forEach(([event, handler]) => video.removeEventListener(event, handler));
            video.pause();
            controls.current = { play: () => {}, pause: () => {} };
        };
    }, [ref, source]);
    return { ...state, play: () => controls.current.play(), pause: () => controls.current.pause() };
}
