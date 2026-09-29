/**
 * 비동기 조회 결과를 일정 시간 기억하는 캐시.
 * Promise를 저장하므로 같은 키를 동시에 요청해도 load는 한 번만 실행되고,
 * 실패한 결과는 바로 지워 다음 요청 때 다시 시도한다.
 */
export function createPromiseCache<K, V>({
  ttlMs,
  maxEntries,
  shouldCache,
}: {
  ttlMs: number;
  maxEntries: number;
  /** false를 돌려주는 결과(예: 일부만 가져온 결과)는 기다리던 요청에는 전달하되 캐시에는 남기지 않는다 */
  shouldCache?: (value: V) => boolean;
}) {
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
    const forget = () => {
      if (entries.get(key) === entry) entries.delete(key);
    };
    entry.promise.then((value) => shouldCache && !shouldCache(value) && forget(), forget);
    return entry.promise;
  };
}
