import { createPromiseCache } from '../utils/cache.ts';

const TIMEOUT_MS = 8_000;

export const hasHangul = (text: string): boolean => /[\u3131-\u318e\uac00-\ud7a3]/.test(text);

/**
 * Google 번역(비공식 엔드포인트, API 키 불필요)으로 번역한다. 실패하거나 결과가 원문과 같으면 null.
 * 긴 글은 주소에 실을 수 없어 POST 본문으로 보낸다.
 */
async function translate(text: string, from: string, to: string): Promise<string | null> {
  const res = await fetch('https://translate.googleapis.com/translate_a/single', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client: 'gtx', sl: from, tl: to, dt: 't', q: text }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as [[string | null][]?];
  const translated = (body[0] ?? [])
    .map((part) => part[0] ?? '')
    .join('')
    .trim();
  return translated && translated.toLowerCase() !== text.toLowerCase() ? translated : null;
}

const cachedTranslation = createPromiseCache<string, string | null>({
  ttlMs: 7 * 24 * 60 * 60 * 1000,
  maxEntries: 2000,
  // 실패(null)는 남기지 않아 다음 요청에서 다시 시도한다
  shouldCache: (result) => result !== null,
});

/** 번역 결과를 기억하며 번역한다. 실패해도 예외를 던지지 않고 null을 돌려준다 */
export function translateCached(text: string, from: string, to: string): Promise<string | null> {
  return cachedTranslation(`${from}>${to}:${text}`, () => translate(text, from, to)).catch((err) => {
    console.warn('번역 실패:', err instanceof Error ? err.message : err);
    return null;
  });
}

/** 한글이 없는 글(영어 소개 등)을 한국어로. 이미 한국어이거나 번역에 실패하면 원문 그대로 */
export async function toKorean(text: string): Promise<string> {
  if (!text || hasHangul(text)) return text;
  return (await translateCached(text.replace(/\s*\n+\s*/g, ' ').trim(), 'en', 'ko')) ?? text;
}
