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

/** Native play starts fetching; only an actual playback stall may briefly hold. */
export function useBufferedPlayback(ref: RefObject<HTMLVideoElement>, source: string | null) {
    const controls = useRef({ play: () => {}, pause: () => {} });
    const [state, setState] = useState({ ahead: 0, target: 2, ready: false, waiting: false, requested: false });
    useEffect(() => {
        const video = ref.current;
        if (!video || !source) return;
        let requested = false, waiting = false, internalPause = false, disposed = false;
        let targetSeconds = 2, heldAt = 0, hasPlayed = false;
        const publish = () => {
            if (!disposed) setState({ ...videoBuffer(video, targetSeconds), waiting, requested });
        };
        const start = () => {
            heldAt = 0;
            void video.play().catch((error: DOMException) => {
                if (disposed || error.name === 'AbortError') return;
                requested = false;
                waiting = false;
                publish();
            });
        };
        const hold = () => {
            waiting = true;
            // Pausing a play request before the first frame can stop the browser's
            // media fetch entirely, leaving buffered at zero forever.
            if (hasPlayed && video.readyState >= 2 && !video.paused) {
                internalPause = true;
                heldAt = Date.now();
                video.pause();
            }
            publish();
        };
        const update = () => {
            const buffer = videoBuffer(video, targetSeconds);
            if (requested && waiting) {
                if (heldAt && video.paused && (buffer.ready || Date.now() - heldAt >= 4000)) {
                    // preload is a browser hint. If pausing also stopped fetching,
                    // release the hold instead of waiting on an unreachable target.
                    start();
                }
                if (buffer.ready && !video.paused) waiting = false;
            }
            publish();
        };
        const onPlay = () => {
            requested = true;
            waiting = video.readyState < 3;
            publish();
        };
        const onPlaying = () => {
            hasPlayed = true;
            waiting = false;
            heldAt = 0;
            publish();
        };
        const onPause = () => {
            if (internalPause) { internalPause = false; return; }
            requested = false;
            waiting = false;
            publish();
        };
        const onWaiting = () => {
            if (requested && !video.ended) {
                if (hasPlayed) targetSeconds = Math.min(targetSeconds + 2, 12);
                hold();
            }
        };
        const onSeeking = () => {
            if (requested && !videoBuffer(video, targetSeconds).ready) hold();
            else update();
        };
        const finish = () => { requested = false; waiting = false; publish(); };
        controls.current = {
            play: () => { requested = true; waiting = video.readyState < 3; publish(); start(); },
            pause: () => { requested = false; waiting = false; heldAt = 0; video.pause(); publish(); },
        };
        const listeners: Array<[string, () => void]> = [
            ['play', onPlay], ['playing', onPlaying], ['pause', onPause], ['waiting', onWaiting], ['seeking', onSeeking],
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
