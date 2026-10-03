import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as meApi from '../api/me';
import type { Game, Persona, Taste } from '../types';
import { toDateKey } from '../utils/calendar';
import { tasteMatch } from '../utils/taste';
import { useAuth } from './AuthContext';

interface TasteValue {
  /** 취향을 믿을 만큼 서재의 분위기 정보가 쌓였는지. false면 아무것도 강조하지 않는다 */
  ready: boolean;
  /** 취향에 맞는 출시 예정 게임이면 그 분위기, 아니면 null */
  match: (game: Game) => Persona | null;
}

/** Provider 밖(테스트 등)에서는 아무것도 강조하지 않는다 */
const NO_TASTE: TasteValue = { ready: false, match: () => null };

const TasteContext = createContext<TasteValue>(NO_TASTE);

/**
 * 서재의 보유 게임으로 알아낸 취향. Steam을 연동한 사용자만 서버에서 받아 오고, 못 받아도(연동 문제·서버 오류) 조용히 넘어간다.
 * 캘린더가 취향에 맞는 출시 예정 게임을 강조하고, 게임 상세가 이유를 알리는 데 쓴다.
 */
export function TasteProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;
  const linked = Boolean(user?.steamId);
  // 어느 사용자의 취향인지 함께 기억해, 다른 계정으로 바뀐 직후에 이전 사용자의 취향을 쓰지 않는다
  const [loaded, setLoaded] = useState<{ userId: number; taste: Taste } | null>(null);

  useEffect(() => {
    if (userId === undefined || !linked) return;
    let cancelled = false;
    (async () => {
      try {
        const taste = await meApi.fetchTaste();
        if (!cancelled && taste) setLoaded({ userId, taste });
      } catch {
        // 취향은 부가 기능이라 못 받으면 강조만 없다
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, linked]);

  const taste = loaded && loaded.userId === userId ? loaded.taste : null;

  const value = useMemo<TasteValue>(() => {
    if (!taste?.ready) return NO_TASTE;
    const liked = new Set(taste.liked);
    if (liked.size === 0) return NO_TASTE;
    return { ready: true, match: (game) => tasteMatch(game, liked, toDateKey(new Date())) };
  }, [taste]);

  return <TasteContext.Provider value={value}>{children}</TasteContext.Provider>;
}

export function useTaste(): TasteValue {
  return useContext(TasteContext);
}
