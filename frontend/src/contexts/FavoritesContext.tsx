import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as meApi from '../api/me';
import type { Game } from '../types';
import { useAuth } from './AuthContext';

interface FavoritesValue {
  /** 출시일 순 정렬 */
  favorites: Game[];
  loading: boolean;
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

  // 로그인한 사용자가 바뀔 때마다 목록을 새로 불러온다
  useEffect(() => {
    setFavorites([]);
    if (userId === undefined) return;

    let cancelled = false;
    setLoading(true);
    meApi
      .fetchFavorites()
      .then(({ games }) => !cancelled && setFavorites(games))
      .catch(() => {}) // 목록을 못 불러와도 캘린더 사용에는 지장이 없다
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const ids = useMemo(() => new Set(favorites.map((g) => g.id)), [favorites]);

  const toggle = async (game: Game) => {
    const wasFavorite = ids.has(game.id);
    const previous = favorites;
    // 응답을 기다리지 않고 먼저 반영해 버튼이 즉시 반응하게 한다
    setFavorites(wasFavorite ? favorites.filter((g) => g.id !== game.id) : sortByRelease([...favorites, game]));
    try {
      if (wasFavorite) await meApi.removeFavorite(game.id);
      else await meApi.addFavorite(game);
    } catch (err) {
      setFavorites(previous);
      throw err;
    }
  };

  return (
    <FavoritesContext.Provider value={{ favorites, loading, isFavorite: (id) => ids.has(id), toggle }}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites(): FavoritesValue {
  const value = useContext(FavoritesContext);
  if (!value) throw new Error('useFavorites는 FavoritesProvider 안에서만 사용할 수 있습니다.');
  return value;
}
