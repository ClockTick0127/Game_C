import { useEffect, useState } from 'react';
import { fetchStoreInfo } from '../api/games';
import type { StoreInfo } from '../types';

/** 한 번 본 게임은 다시 열어도 바로 보이도록 기억해 둔다. */
const cache = new Map<number, StoreInfo>();

type State = { status: 'loading' } | { status: 'success'; data: StoreInfo } | { status: 'error' };

/** 게임 상세를 열 때만 스토어 정보를 불러온다 (게임마다 RAWG·Steam 요청이 필요해 캘린더 전체에 미리 불러오지 않는다). */
export function useStoreInfo(gameId: number): State {
  // 가장 최근에 서버에서 받은 결과. 어느 게임의 것인지 함께 기억해, 게임이 바뀐 직후에 이전 게임 정보를 쓰지 않는다.
  const [fetched, setFetched] = useState<{ gameId: number; state: State } | null>(null);

  useEffect(() => {
    if (cache.has(gameId)) return; // 캐시에 있으면 아래에서 렌더할 때 바로 읽는다

    const controller = new AbortController();
    fetchStoreInfo(gameId, controller.signal)
      .then((data) => {
        cache.set(gameId, data);
        setFetched({ gameId, state: { status: 'success', data } });
      })
      .catch(() => {
        if (!controller.signal.aborted) setFetched({ gameId, state: { status: 'error' } });
      });
    return () => controller.abort();
  }, [gameId]);

  const cached = cache.get(gameId);
  if (cached) return { status: 'success', data: cached };
  return fetched?.gameId === gameId ? fetched.state : { status: 'loading' };
}
