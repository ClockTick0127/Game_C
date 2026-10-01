import { HttpError } from '../utils/http.ts';
import { listCustomGames } from './customLibrary.ts';
import { listGameLogs, type GameStatus } from './gameLog.ts';
import { CUSTOM_ID_BASE, getLibraryOrder } from './libraryOrder.ts';
import { fetchOwnedGames } from './steamProfile.ts';
import { findPublicUserRowByNickname } from './users.ts';

/** 공개 진열장에 전시된 게임 한 개. 메모·Steam 계정 같은 개인 정보는 담지 않는다 */
export interface ShowcaseGame {
  /** 서재 번호: Steam 앱 번호, 직접 추가한 게임은 RAWG 번호 + 10억 */
  appId: number;
  name: string;
  /** 직접 추가한 게임은 0 */
  playtimeMinutes: number;
  custom: boolean;
  /** 직접 추가한 게임의 RAWG 표지 */
  image: string | null;
  /** 직접 추가한 게임 중 Steam에도 있는 게임의 앱 번호 (공식 표지용) */
  steamAppId: number | null;
  status: GameStatus | null;
  rating: number | null;
}

export interface Showcase {
  nickname: string;
  /** 진열장에 꽂은 순서대로 */
  games: ShowcaseGame[];
}

/**
 * 공개한 사용자의 진열장. 공개하지 않았거나 없는 닉네임은 구분하지 않고 똑같이 404를 준다.
 * 게임 이름·플레이 시간은 서재 화면과 같은 Steam 조회(5분 캐시)에서 가져온다.
 */
export async function getShowcase(nickname: string): Promise<Showcase> {
  const user = findPublicUserRowByNickname(nickname);
  if (!user) throw new HttpError(404, '공개된 진열장을 찾을 수 없습니다.');

  const order = getLibraryOrder(user.id);
  const needsSteam = user.steam_id !== null && order.some((id) => id < CUSTOM_ID_BASE);
  const needsCustom = order.some((id) => id >= CUSTOM_ID_BASE);
  const [owned, custom] = await Promise.all([
    needsSteam ? fetchOwnedGames(user.steam_id!) : null,
    needsCustom ? listCustomGames(user.id) : [],
  ]);

  const logs = new Map(listGameLogs(user.id).map((l) => [l.gameId, l]));
  const byId = new Map<number, Omit<ShowcaseGame, 'status' | 'rating'>>();
  for (const g of owned?.games ?? []) {
    byId.set(g.appId, {
      appId: g.appId,
      name: g.name,
      playtimeMinutes: g.playtimeMinutes,
      custom: false,
      image: null,
      steamAppId: null,
    });
  }
  for (const g of custom) {
    const appId = CUSTOM_ID_BASE + g.id;
    byId.set(appId, {
      appId,
      name: g.name,
      playtimeMinutes: 0,
      custom: true,
      image: g.image,
      steamAppId: g.steamAppId,
    });
  }

  // 더 이상 갖고 있지 않은 게임은 진열장에서 빠진다 (서재 화면과 같다)
  const games = order.flatMap((id) => {
    const game = byId.get(id);
    if (!game) return [];
    const log = logs.get(id);
    return [{ ...game, status: log?.status ?? null, rating: log?.rating ?? null }];
  });
  return { nickname: user.nickname, games };
}
