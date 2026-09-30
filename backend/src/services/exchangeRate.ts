const TIMEOUT_MS = 8_000;
/** 기준 환율은 하루 한 번 바뀌므로 몇 시간씩 캐시한다 */
const TTL_MS = 6 * 60 * 60 * 1000;
/** 조회에 실패한 뒤 다시 시도하기까지의 대기 시간 (실패할 때마다 외부 API를 두드리지 않는다) */
const RETRY_MS = 5 * 60 * 1000;

export interface ExchangeRate {
  /** 1달러가 몇 원인지 */
  krwPerUsd: number;
  /** 환율 기준일 (YYYY-MM-DD) */
  date: string;
}

let cached: { rate: ExchangeRate; fetchedAt: number } | null = null;
let inflight: Promise<ExchangeRate | null> | null = null;
let retryAfter = 0;

async function load(): Promise<ExchangeRate | null> {
  try {
    // Frankfurter: 유럽중앙은행 기준 환율. API 키가 필요 없다 (https://frankfurter.dev)
    const res = await fetch('https://api.frankfurter.dev/v1/latest?base=USD&symbols=KRW', {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { date?: string; rates?: { KRW?: number } };
    const krwPerUsd = body.rates?.KRW;
    if (typeof krwPerUsd !== 'number' || !Number.isFinite(krwPerUsd) || krwPerUsd <= 0 || !body.date) {
      throw new Error('응답 형식 이상');
    }
    cached = { rate: { krwPerUsd, date: body.date }, fetchedAt: Date.now() };
    return cached.rate;
  } catch (err) {
    retryAfter = Date.now() + RETRY_MS;
    console.warn('환율 조회 실패:', err instanceof Error ? err.message : err);
    // 오래된 환율이라도 아예 없는 것보다 낫다
    return cached?.rate ?? null;
  }
}

/** 달러→원 환율. 조회에 실패하면 마지막으로 받은 값, 그것도 없으면 null */
export function getKrwRate(): Promise<ExchangeRate | null> {
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) return Promise.resolve(cached.rate);
  if (Date.now() < retryAfter) return Promise.resolve(cached?.rate ?? null);
  inflight ??= load().finally(() => {
    inflight = null;
  });
  return inflight;
}
