import type { Game } from '../types.ts';
import { toDateKey } from '../utils/date.ts';
import { normalizeTitle } from '../utils/text.ts';
import type { Persona } from './gameStyle.ts';
import { getRankedReleases, type RankedGame } from './releases.ts';
import { fetchOwnedGames } from './steamProfile.ts';
import { getTaste, type Affinity } from './taste.ts';

/** 한 번에 보여 주는 추천 수 */
export const SUGGESTION_COUNT = 8;
/** 방금 나온 게임도 추천에 넣는 기간(일). 이보다 오래된 게임은 "신작"이 아니다 */
const RECENT_DAYS = 21;
/** 이 기간(일) 안에 나올 예정인 게임까지 본다 */
const UPCOMING_DAYS = 70;
/** 취향 추천이 이 개수보다 적으면 인기 있는 예정작으로 채운다 */
const MIN_PERSONALIZED = 4;

export interface Suggestions {
  /** true면 서재 취향으로 고른 게임이 들어 있다. false면 취향을 알 수 없어 인기 있는 예정작만 골랐다 */
  personalized: boolean;
  /** 취향으로 삼은 분위기들(좋아하는 순). personalized가 false면 비어 있다 */
  liked: Persona[];
  games: Game[];
}

const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

/** 인기 있는 예정작 (취향을 알 수 없을 때, 또는 취향 추천이 모자랄 때) */
function popularUpcoming(ranked: RankedGame[], today: string): RankedGame[] {
  return ranked.filter((r) => r.game.released >= today).sort((a, b) => b.popularity - a.popularity);
}

/**
 * 게임 검색의 첫 화면에 띄울 추천. Steam을 연동해 취향을 알 수 있으면 그 분위기의 신작·예정작을(이미 가진 게임은 빼고),
 * 아니면 인기 있는 예정작을 고른다. 한 달 안에서 인기순으로 받은 목록의 순번을 인기 점수로 쓴다.
 */
export async function getSuggestions(user: { id: number; steamId: string | null } | null): Promise<Suggestions> {
  const now = new Date();
  const today = toDateKey(now);
  const ranked = await getRankedReleases(toDateKey(addDays(now, -RECENT_DAYS)), toDateKey(addDays(now, UPCOMING_DAYS)));

  let liked: Persona[] = [];
  let affinity: Affinity = {};
  let ownedNames = new Set<string>();
  if (user?.steamId) {
    try {
      const taste = await getTaste(user.id, user.steamId);
      if (taste.ready) {
        affinity = taste.affinity;
        liked = taste.liked;
      }
      ownedNames = new Set((await fetchOwnedGames(user.steamId)).games.map((g) => normalizeTitle(g.name)));
    } catch (err) {
      // 취향은 부가 기능이라 Steam 조회가 실패해도 인기 예정작은 보여 준다
      console.warn(`추천용 취향 조회 실패 (사용자 ${user.id}):`, err instanceof Error ? err.message : err);
    }
  }
  return pick(ranked, today, liked, affinity, ownedNames);
}

function pick(
  ranked: RankedGame[],
  today: string,
  liked: Persona[],
  affinity: Affinity,
  ownedNames: Set<string>,
): Suggestions {
  const available = ranked.filter((r) => !ownedNames.has(normalizeTitle(r.game.name)));
  const chosen: Game[] = [];

  if (liked.length > 0) {
    const matches = available
      .filter((r) => r.game.persona && liked.includes(r.game.persona))
      .map((r) => ({
        game: r.game,
        // 취향이 강한 분위기일수록, 인기 있을수록, 앞으로 나올 게임일수록 위로
        score: (affinity[r.game.persona!] ?? 0) * 1.5 + r.popularity + (r.game.released >= today ? 0.2 : 0),
      }))
      .sort((a, b) => b.score - a.score);
    chosen.push(...matches.slice(0, SUGGESTION_COUNT).map((m) => m.game));
  }

  // 취향에 맞는 게임이 충분하면 그것만 보여 준다 (취향이 아닌 게임을 섞으면 "취향 추천"이라는 말이 틀려진다)
  if (chosen.length >= MIN_PERSONALIZED) return { personalized: true, liked, games: chosen };

  // 몇 개 안 되면 취향 추천이라 내세우지 않고 인기 있는 예정작을 보여 준다
  const popular = popularUpcoming(available, today)
    .slice(0, SUGGESTION_COUNT)
    .map((r) => r.game);
  return { personalized: false, liked: [], games: popular };
}
