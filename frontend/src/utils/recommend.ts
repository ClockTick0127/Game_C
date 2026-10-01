import type { GameLog, Persona, SteamOwnedGame } from '../types';
import { PERSONA_LABELS } from './libraryStats';

/** 한 번에 보여 주는 추천 수 */
export const PICK_COUNT = 3;

/** 이 시간(분)보다 적게 해 본 게임은 "해 보다 만" 게임으로 본다 */
export const BARELY_PLAYED_MINUTES = 120;

/** 후보가 많을 때 점수 상위 몇 개 중에서 뽑을지 (너무 낮은 점수의 게임이 뽑히지 않게) */
const POOL_SIZE = 15;

/** 취향이 이 정도(0~1) 이상 맞으면 이유에 적는다 */
const AFFINITY_NOTE = 0.5;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface Pick {
  game: SteamOwnedGame;
  /** 이 게임을 고른 이유 (한두 줄) */
  reasons: string[];
  score: number;
}

/**
 * 분위기별 취향(0~1). 많이 한 분위기, 클리어한 분위기, 별점을 높게 준 분위기일수록 높고,
 * 별점을 낮게 주거나 포기한 게임은 깎는다. 분위기를 아직 모르는 게임과 "기타"는 계산에서 뺀다.
 */
export function personaAffinity(games: SteamOwnedGame[], logs: Record<number, GameLog>): Map<Persona, number> {
  const raw = new Map<Persona, number>();
  for (const g of games) {
    if (g.persona === null || g.persona === 'default') continue;
    const log = logs[g.appId];
    let weight = Math.log10(1 + g.playtimeMinutes / 60); // 100시간이면 약 2
    if (log?.status === 'cleared') weight += 1;
    if (log?.status === 'dropped') weight -= 1;
    if (log?.rating != null) weight += log.rating >= 4 ? 1.5 : log.rating <= 2 ? -1.5 : 0;
    raw.set(g.persona, (raw.get(g.persona) ?? 0) + weight);
  }
  const max = Math.max(...raw.values(), 0);
  const affinity = new Map<Persona, number>();
  if (max <= 0) return affinity;
  for (const [persona, value] of raw) affinity.set(persona, Math.max(0, value) / max);
  return affinity;
}

/** 오늘 할 만한 후보와 그 이유. 이미 클리어했거나 포기한 게임, 충분히 해 본 게임은 후보가 아니다 */
export function candidatePicks(
  games: SteamOwnedGame[],
  logs: Record<number, GameLog>,
  now: number = Date.now(),
): Pick[] {
  const affinity = personaAffinity(games, logs);
  const picks: Pick[] = [];

  for (const game of games) {
    const status = logs[game.appId]?.status ?? null;
    if (status === 'cleared' || status === 'dropped') continue;

    let score: number;
    let reason: string;
    if (status === 'playing') {
      score = 3;
      const days = game.lastPlayedAt ? Math.floor((now - new Date(game.lastPlayedAt).getTime()) / DAY_MS) : null;
      reason =
        days === null || days < 0
          ? '하는 중인 게임이에요. 이어서 해 볼까요?'
          : days === 0
            ? '오늘도 하던 게임이에요. 이어서 해 볼까요?'
            : `${days.toLocaleString('ko-KR')}일 전까지 하던 게임이에요. 이어서 해 볼까요?`;
    } else if (status === 'backlog') {
      score = 2.5;
      reason = '쌓아 둔 게임이에요. 이제 꺼낼 때가 됐어요.';
    } else if (game.playtimeMinutes === 0) {
      score = 1.5;
      reason = game.custom ? '서재에 꽂아 두기만 한 게임이에요.' : '가지고만 있고 한 번도 안 해 본 게임이에요.';
    } else if (game.playtimeMinutes < BARELY_PLAYED_MINUTES) {
      score = 1;
      reason = `${game.playtimeMinutes.toLocaleString('ko-KR')}분만 해 보고 만 게임이에요.`;
    } else {
      continue; // 상태를 정하지 않았지만 이미 충분히 해 본 게임
    }

    const reasons = [reason];
    const fit = game.persona ? (affinity.get(game.persona) ?? 0) : 0;
    if (fit >= AFFINITY_NOTE && game.persona) reasons.push(`${PERSONA_LABELS[game.persona]} 게임을 즐겨 하시네요.`);
    picks.push({ game, reasons, score: score + 2 * fit });
  }
  return picks;
}

/**
 * 오늘 할 만한 게임을 count개 고른다. 점수 상위 후보 중에서 점수가 높을수록 잘 뽑히게 무작위로 고르므로
 * 다시 뽑으면 다른 게임이 나온다. random은 0 이상 1 미만의 수를 돌려주는 함수다(테스트에서 바꿔 끼운다).
 */
export function recommendGames(
  games: SteamOwnedGame[],
  logs: Record<number, GameLog>,
  {
    count = PICK_COUNT,
    random = Math.random,
    now = Date.now(),
  }: { count?: number; random?: () => number; now?: number } = {},
): Pick[] {
  const pool = candidatePicks(games, logs, now)
    .sort((a, b) => b.score - a.score || a.game.appId - b.game.appId)
    .slice(0, POOL_SIZE);

  const chosen: Pick[] = [];
  while (chosen.length < count && pool.length > 0) {
    const weights = pool.map((p) => p.score ** 2);
    let roll = random() * weights.reduce((sum, w) => sum + w, 0);
    let index = weights.findIndex((w) => (roll -= w) < 0);
    if (index === -1) index = pool.length - 1;
    chosen.push(pool.splice(index, 1)[0]!);
  }
  return chosen;
}
