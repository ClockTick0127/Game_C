import { useEffect, useState } from 'react';
import { fetchStoreInfo } from '../api/games';
import type { StoreInfo } from '../types';

/** 한 번 본 게임은 다시 열어도 바로 보이도록 기억해 둔다. */
const cache = new Map<number, StoreInfo>();

type State = { status: 'loading' } | { status: 'success'; data: StoreInfo } | { status: 'error' };

/** 게임 상세를 열 때만 스토어 정보를 불러온다 (게임마다 RAWG·Steam 요청이 필요해 캘린더 전체에 미리 불러오지 않는다). */
export function useStoreInfo(gameId: number): State {
  const [state, setState] = useState<State>(() => {
    const cached = cache.get(gameId);
    return cached ? { status: 'success', data: cached } : { status: 'loading' };
  });

  useEffect(() => {
    const cached = cache.get(gameId);
    if (cached) {
      setState({ status: 'success', data: cached });
      return;
    }

    const controller = new AbortController();
    setState({ status: 'loading' });
    fetchStoreInfo(gameId, controller.signal)
      .then((data) => {
        cache.set(gameId, data);
        setState({ status: 'success', data });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 'error' });
      });
    return () => controller.abort();
  }, [gameId]);

  return state;
}
