import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { errorMessage } from '../api/client';
import * as meApi from '../api/me';
import type { Game } from '../types';
import { useAuth } from './AuthContext';

interface FavoritesValue {
  /** 출시일 순 정렬 */
  favorites: Game[];
  loading: boolean;
  /** 목록을 불러오지 못했을 때의 메시지. 성공하면 null */
  error: string | null;
  /** 목록을 다시 불러온다 */
  reload: () => void;
  isFavorite: (gameId: number) => boolean;
  /** 추가/삭제를 뒤집는다. 실패하면 화면을 원래대로 되돌리고 에러를 던진다. */
  toggle: (game: Game) => Promise<void>;
}

const FavoritesContext = createContext<FavoritesValue | null>(null);

function sortByRelease(games: Game[]): Game[] {
  return [...games].sort((a, b) => a.released.localeCompare(b.released));
}

export function FavoritesProvider({ children }: { children: ReactNode }) {
  // user 객체 대신 id에 의존해, 닉네임 변경 같은 갱신으로는 목록을 다시 부르지 않는다
  const userId = useAuth().user?.id;
  const [favorites, setFavorites] = useState<Game[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  // 로그인한 사용자가 바뀔 때마다 목록을 새로 불러온다
  useEffect(() => {
    setFavorites([]);
    setError(null);
    if (userId === undefined) return;

    let cancelled = false;
    setLoading(true);
    meApi
      .fetchFavorites()
      .then(({ games }) => !cancelled && setFavorites(games))
      // 캘린더 사용에는 지장이 없으므로 화면을 막지는 않고, 관심 게임 목록을 보여주는 곳에서 안내한다
      .catch((err: unknown) => !cancelled && setError(errorMessage(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [userId, reloadToken]);

  const ids = useMemo(() => new Set(favorites.map((g) => g.id)), [favorites]);

  // 같은 게임에 대한 요청은 누른 순서대로 하나씩 보낸다 (추가·삭제 요청이 서로 앞지르면 서버 상태가 화면과 달라진다)
  const pending = useRef(new Map<number, Promise<unknown>>());

  const toggle = async (game: Game) => {
    const wasFavorite = ids.has(game.id);
    const withGame = (list: Game[]) => sortByRelease([...list.filter((g) => g.id !== game.id), game]);
    const withoutGame = (list: Game[]) => list.filter((g) => g.id !== game.id);

    // 응답을 기다리지 않고 먼저 반영해 버튼이 즉시 반응하게 한다
    setFavorites((list) => (wasFavorite ? withoutGame(list) : withGame(list)));

    const previousRequest = pending.current.get(game.id) ?? Promise.resolve();
    const request = previousRequest
      .catch(() => {}) // 앞선 요청의 실패는 그 요청을 보낸 쪽이 처리한다
      .then(() => (wasFavorite ? meApi.removeFavorite(game.id) : meApi.addFavorite(game)));
    pending.current.set(game.id, request);

    try {
      await request;
    } catch (err) {
      // 이 게임의 변경만 되돌린다. 그사이 다른 게임에 한 변경까지 지우지 않도록 목록 전체를 되돌리지 않는다.
      setFavorites((list) => (wasFavorite ? withGame(list) : withoutGame(list)));
      throw err;
    } finally {
      if (pending.current.get(game.id) === request) pending.current.delete(game.id);
    }
  };

  return (
    <FavoritesContext.Provider value={{ favorites, loading, error, reload: () => setReloadToken((t) => t + 1), isFavorite: (id) => ids.has(id), toggle }}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites(): FavoritesValue {
  const value = useContext(FavoritesContext);
  if (!value) throw new Error('useFavorites는 FavoritesProvider 안에서만 사용할 수 있습니다.');
  return value;
}
