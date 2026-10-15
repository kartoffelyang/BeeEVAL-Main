import { useState, useEffect, useRef } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { translateText } from '../api';

const isChinese = (text: string): boolean =>
  /[一-鿿]/.test(text) && text.length > 2;

const memoryCache = new Map<string, string>();
const pendingRequests = new Map<string, Promise<string>>();

// 全局并发闸：绝大多数文本命中 preTranslated(_en)/缓存不走这里；只有缺预翻译的
// 少量记录才发实时请求。限制在途请求数，避免切英文时几十张卡同时打满后端 worker。
const MAX_CONCURRENT = 3;
let inFlight = 0;
const queue: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  if (inFlight < MAX_CONCURRENT) {
    inFlight++;
    return Promise.resolve();
  }
  return new Promise(resolve => {
    queue.push(() => {
      inFlight++;
      resolve();
    });
  });
}

function releaseSlot(): void {
  inFlight--;
  const next = queue.shift();
  if (next) next();
}

function getTranslation(text: string, targetLang: string): Promise<string> {
  const cacheKey = `${targetLang}:${text}`;
  const cached = memoryCache.get(cacheKey);
  if (cached) return Promise.resolve(cached);

  const pending = pendingRequests.get(cacheKey);
  if (pending) return pending;

  const promise = acquireSlot()
    .then(() => translateText(text, targetLang))
    .then(res => {
      memoryCache.set(cacheKey, res.translated);
      pendingRequests.delete(cacheKey);
      releaseSlot();
      return res.translated;
    })
    .catch(() => {
      pendingRequests.delete(cacheKey);
      releaseSlot();
      return text;
    });

  pendingRequests.set(cacheKey, promise);
  return promise;
}

export function useTranslatedContent(text: string | undefined | null, preTranslated?: string | undefined | null): { content: string; loading: boolean } {
  const { language } = useLanguage();
  const [translated, setTranslated] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);

  const original = text || '';
  const hasPreTranslation = language === 'en' && !!preTranslated && preTranslated.trim().length > 0;
  const needsTranslation = language === 'en' && !!original && isChinese(original) && !hasPreTranslation;

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!needsTranslation) {
      setTranslated(null);
      setLoading(false);
      return;
    }

    const cacheKey = `en:${original}`;
    const cached = memoryCache.get(cacheKey);
    if (cached) {
      setTranslated(cached);
      setLoading(false);
      return;
    }

    setLoading(true);
    getTranslation(original, 'en').then(result => {
      if (mountedRef.current) {
        setTranslated(result);
        setLoading(false);
      }
    });
  }, [original, needsTranslation]);

  if (hasPreTranslation) {
    return { content: preTranslated!, loading: false };
  }

  if (!needsTranslation) {
    return { content: original, loading: false };
  }

  return { content: translated || original, loading };
}
