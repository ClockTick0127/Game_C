import { useEffect, useMemo, useState } from 'react';
import { fetchReleases } from '../api/games';
import type { Game, ReleasesResponse } from '../types';
import { getMonthRange } from '../utils/calendar';

/** 월별 조회 결과 캐시 — 이전/다음 달을 오갈 때 재요청하지 않는다. */
const cache = new Map<string, ReleasesResponse>();

type State =
  | { status: 'loading' }
  | { status: 'success'; data: ReleasesResponse }
  | { status: 'error'; message: string };

export function useMonthlyReleases(year: number, month: number) {
  const cacheKey = `${year}-${month}`;
  const [state, setState] = useState<State>({ status: 'loading' });
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const cached = cache.get(cacheKey);
    if (cached) {
      setState({ status: 'success', data: cached });
      return;
    }

    const controller = new AbortController();
    const { start, end } = getMonthRange(year, month);
    setState({ status: 'loading' });

    fetchReleases(start, end, controller.signal)
      .then((data) => {
        cache.set(cacheKey, data);
        setState({ status: 'success', data });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const message = err instanceof Error ? err.message : '알 수 없는 오류';
        setState({ status: 'error', message });
      });

    return () => controller.abort();
  }, [year, month, cacheKey, reloadToken]);

  const gamesByDate = useMemo(() => {
    const map = new Map<string, Game[]>();
    if (state.status !== 'success') return map;
    for (const game of state.data.games) {
      const list = map.get(game.released);
      if (list) list.push(game);
      else map.set(game.released, [game]);
    }
    return map;
  }, [state]);

  return {
    gamesByDate,
    totalCount: state.status === 'success' ? state.data.games.length : 0,
    isSample: state.status === 'success' && state.data.sample,
    loading: state.status === 'loading',
    error: state.status === 'error' ? state.message : null,
    reload: () => {
      cache.delete(cacheKey);
      setReloadToken((t) => t + 1);
    },
  };
}
