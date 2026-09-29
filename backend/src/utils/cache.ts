/**
 * 비동기 조회 결과를 일정 시간 기억하는 캐시.
 * Promise를 저장하므로 같은 키를 동시에 요청해도 load는 한 번만 실행되고,
 * 실패한 결과는 바로 지워 다음 요청 때 다시 시도한다.
 */
export function createPromiseCache<K, V>({ ttlMs, maxEntries }: { ttlMs: number; maxEntries: number }) {
  const entries = new Map<K, { expiresAt: number; promise: Promise<V> }>();

  return (key: K, load: () => Promise<V>): Promise<V> => {
    const hit = entries.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.promise;

    if (entries.size >= maxEntries) {
      // Map은 삽입 순서를 유지하므로 첫 항목이 가장 오래된 것
      entries.delete(entries.keys().next().value!);
    }

    const entry = { expiresAt: Date.now() + ttlMs, promise: load() };
    entries.set(key, entry);
    entry.promise.catch(() => {
      if (entries.get(key) === entry) entries.delete(key);
    });
    return entry.promise;
  };
}
