import { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { translateText } from '../api';

const isChinese = (text: string): boolean =>
  /[一-鿿]/.test(text);

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
      if (!res.translated?.trim() || (isChinese(text) && res.translated.trim() === text.trim())) {
        throw new Error('Translation unavailable');
      }
      memoryCache.set(cacheKey, res.translated);
      return res.translated;
    })
    .finally(() => {
      pendingRequests.delete(cacheKey);
      releaseSlot();
    });

  pendingRequests.set(cacheKey, promise);
  return promise;
}

export function useTranslatedContent(text: string | undefined | null, preTranslated?: string | undefined | null): { content: string; loading: boolean } {
  const { language, t } = useLanguage();
  const [result, setResult] = useState<{source: string; value: string | null; failed: boolean}>({source:'',value:null,failed:false});

  const original = text || '';
  const hasPreTranslation = language === 'en' && !!preTranslated?.trim() && !isChinese(preTranslated);
  const needsTranslation = language === 'en' && !!original && isChinese(original) && !hasPreTranslation;

  useEffect(() => {
    let cancelled = false;
    if (!needsTranslation) {
      return;
    }

    const cacheKey = `en:${original}`;
    const cached = memoryCache.get(cacheKey);
    if (cached) {
      setResult({source:original,value:cached,failed:false});
      return;
    }

    getTranslation(original, 'en').then(result => {
      if (!cancelled) setResult({source:original,value:result,failed:false});
    }).catch(() => {
      if (!cancelled) setResult({source:original,value:null,failed:true});
    });
    return () => { cancelled = true; };
  }, [original, needsTranslation]);

  if (hasPreTranslation) {
    return { content: preTranslated!, loading: false };
  }

  if (!needsTranslation) {
    return { content: original, loading: false };
  }

  const current = result.source === original ? result : null;
  if (current?.value) return {content:current.value,loading:false};
  if (current?.failed) return {content:t('english_translation_unavailable'),loading:false};
  return {content:t('english_translation_pending'),loading:true};
}
