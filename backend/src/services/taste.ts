import type { GameLog, GameStatus } from './gameLog.ts';
import { listGameLogs } from './gameLog.ts';
import { getPersonas, requestStyles, type Persona } from './gameStyle.ts';
import { fetchOwnedGames } from './steamProfile.ts';

/** 취향을 믿으려면 분위기를 알아낸 보유 게임이 이 정도는 있어야 한다 (게임 한두 개로 "취향"이라 하지 않는다) */
export const MIN_ANALYZED_GAMES = 5;

/** 취향 계산에 쓰는 보유 게임 한 개 */
export interface TasteInput {
  persona: Persona | null;
  playtimeMinutes: number;
  status: GameStatus | null;
  rating: number | null;
}

export type Affinity = Partial<Record<Persona, number>>;

/**
 * 분위기별 취향(0~1). 많이 한 분위기, 클리어한 분위기, 별점을 높게 준 분위기일수록 높고 별점이 낮거나 포기한 게임은 깎는다.
 * 분위기를 아직 모르는 게임과 "기타"는 계산에서 뺀다. (frontend/src/utils/recommend.ts의 personaAffinity와 같은 식이다)
 */
export function computeAffinity(items: TasteInput[]): Affinity {
  const raw = new Map<Persona, number>();
  for (const item of items) {
    if (item.persona === null || item.persona === 'default') continue;
    let weight = Math.log10(1 + item.playtimeMinutes / 60); // 100시간이면 약 2
    if (item.status === 'cleared') weight += 1;
    if (item.status === 'dropped') weight -= 1;
    if (item.rating !== null) weight += item.rating >= 4 ? 1.5 : item.rating <= 2 ? -1.5 : 0;
    raw.set(item.persona, (raw.get(item.persona) ?? 0) + weight);
  }
  const max = Math.max(...raw.values(), 0);
  const affinity: Affinity = {};
  if (max <= 0) return affinity;
  for (const [persona, value] of raw) affinity[persona] = Math.round((Math.max(0, value) / max) * 100) / 100;
  return affinity;
}

/** 이 값(0~1) 이상 즐겨 하는 분위기만 취향으로 본다 */
export const TASTE_THRESHOLD = 0.5;
/** 취향으로 삼는 분위기의 최대 개수 */
export const MAX_LIKED_PERSONAS = 3;

/** 즐겨 하는 분위기들(좋아하는 순). "무엇을 취향으로 칠지"는 서버가 한 곳에서만 정하고, 화면은 결과(Taste.liked)를 그대로 쓴다 */
export function likedPersonas(affinity: Affinity): Persona[] {
  return (Object.entries(affinity) as [Persona, number][])
    .filter(([persona, value]) => persona !== 'default' && value >= TASTE_THRESHOLD)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_LIKED_PERSONAS)
    .map(([persona]) => persona);
}

export interface Taste {
  /** 분위기별 취향(0~1). 아직 계산할 수 없으면 비어 있다 */
  affinity: Affinity;
  /** 즐겨 하는 분위기들(좋아하는 순). 캘린더 강조와 검색 추천이 같은 기준을 쓰도록 서버가 정해서 내려 준다 */
  liked: Persona[];
  /** 분위기를 알아낸 보유 게임 수 / 전체 보유 게임 수 (나머지는 백그라운드에서 알아내는 중이다) */
  analyzed: number;
  total: number;
  /** 취향을 믿어도 되는지 (analyzed가 MIN_ANALYZED_GAMES 이상) */
  ready: boolean;
}

/**
 * 보유 게임의 분위기(game_styles에 저장된 것)와 플레이 시간·기록으로 취향을 계산한다.
 * 분위기를 모르는 게임은 백그라운드에서 알아내도록 요청해 두므로, 서재를 한 번도 열지 않았어도 다음 방문부터는 쓸 수 있다.
 */
export async function getTaste(userId: number, steamId: string): Promise<Taste> {
  const owned = await fetchOwnedGames(steamId);
  const ids = owned.games.map((g) => g.appId);
  const personas = getPersonas(ids);
  requestStyles(ids.filter((id) => !personas.has(id)));

  const logs = new Map<number, GameLog>(listGameLogs(userId).map((l) => [l.gameId, l]));
  const items = owned.games.map((g) => ({
    persona: personas.get(g.appId) ?? null,
    playtimeMinutes: g.playtimeMinutes,
    status: logs.get(g.appId)?.status ?? null,
    rating: logs.get(g.appId)?.rating ?? null,
  }));
  const analyzed = personas.size;
  const ready = analyzed >= MIN_ANALYZED_GAMES;
  const affinity = ready ? computeAffinity(items) : {};
  return { affinity, liked: likedPersonas(affinity), analyzed, total: ids.length, ready };
}
