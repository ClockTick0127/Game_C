import { useEffect, useMemo, useState } from 'react';
import { fetchReleases } from '../api/games';
import type { Game, ReleasesResponse } from '../types';
import { getMonthRange } from '../utils/calendar';

/** 월별 조회 결과 캐시 — 이전/다음 달을 오갈 때 재요청하지 않는다. */
const cache = new Map<string, ReleasesResponse>();

type State =
  { status: 'loading' } | { status: 'success'; data: ReleasesResponse } | { status: 'error'; message: string };

export function useMonthlyReleases(year: number, month: number) {
  const cacheKey = `${year}-${month}`;
  // 가장 최근에 서버에서 받은 결과. 어느 달의 것인지 함께 기억해, 달이 바뀐 직후에 이전 달 결과를 쓰지 않는다.
  const [fetched, setFetched] = useState<{ key: string; state: State } | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (cache.has(cacheKey)) return; // 캐시에 있으면 아래에서 렌더할 때 바로 읽는다

    const controller = new AbortController();
    const { start, end } = getMonthRange(year, month);

    fetchReleases(start, end, controller.signal)
      .then((data) => {
        // 일부만 받은 결과는 기억하지 않아, 다시 방문하면 새로 불러온다
        if (!data.partial) cache.set(cacheKey, data);
        setFetched({ key: cacheKey, state: { status: 'success', data } });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const message = err instanceof Error ? err.message : '알 수 없는 오류';
        setFetched({ key: cacheKey, state: { status: 'error', message } });
      });

    return () => controller.abort();
  }, [year, month, cacheKey, reloadToken]);

  // 캐시 → 방금 받은 결과(같은 달일 때만) → 불러오는 중, 순서로 화면에 보여줄 상태를 정한다
  const cached = cache.get(cacheKey);
  const state: State = cached
    ? { status: 'success', data: cached }
    : fetched?.key === cacheKey
      ? fetched.state
      : { status: 'loading' };
  const data = state.status === 'success' ? state.data : null;

  const gamesByDate = useMemo(() => {
    const map = new Map<string, Game[]>();
    for (const game of data?.games ?? []) {
      const list = map.get(game.released);
      if (list) list.push(game);
      else map.set(game.released, [game]);
    }
    return map;
  }, [data]);

  return {
    /** 인기순 (백엔드가 RAWG 인기순으로 내려준다) */
    games: data?.games ?? [],
    gamesByDate,
    totalCount: data?.games.length ?? 0,
    isSample: data?.sample === true,
    /** 일부 출시 정보를 불러오지 못해 목록이 완전하지 않다 */
    partial: data?.partial === true,
    loading: state.status === 'loading',
    error: state.status === 'error' ? state.message : null,
    reload: () => {
      cache.delete(cacheKey);
      setFetched(null);
      setReloadToken((t) => t + 1);
    },
  };
}
