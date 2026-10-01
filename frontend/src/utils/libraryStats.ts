import type { AchievementSummary, GameLog, GameStatus, Persona, SteamOwnedGame } from '../types';
import { GAME_STATUSES } from './library';

/** 게임 분위기(SteamSpy 태그를 묶은 것)의 표시 이름. 실제 장르가 아니라 태그로 짐작한 분류다 */
export const PERSONA_LABELS: Record<Persona, string> = {
  action: '액션·슈팅',
  fantasy: '판타지',
  scifi: 'SF',
  horror: '공포',
  retro: '레트로·도트',
  cute: '아기자기·캐주얼',
  sports: '스포츠·레이싱',
  strategy: '전략·시뮬레이션',
  default: '기타',
};

/** 분(分)을 "45분", "12.5시간", "1,234시간"으로. 100시간부터는 소수점을 뺀다 */
export function formatHours(minutes: number): string {
  if (minutes < 60) return `${minutes}분`;
  const hours = minutes / 60;
  return hours < 100 ? `${hours.toFixed(1)}시간` : `${Math.round(hours).toLocaleString('ko-KR')}시간`;
}

/** 백분율(반올림). 나누는 수가 0이면 0 */
export const percent = (part: number, whole: number) => (whole === 0 ? 0 : Math.round((part / whole) * 100));

export interface LibrarySummary {
  games: number;
  /** 플레이 시간이 1분이라도 있는 게임 */
  played: number;
  unplayed: number;
  totalMinutes: number;
  /** 플레이한 게임 하나당 평균. 플레이한 게임이 없으면 0 */
  averageMinutes: number;
}

export function summarizeLibrary(games: SteamOwnedGame[]): LibrarySummary {
  const played = games.filter((g) => g.playtimeMinutes > 0).length;
  const totalMinutes = games.reduce((sum, g) => sum + g.playtimeMinutes, 0);
  return {
    games: games.length,
    played,
    unplayed: games.length - played,
    totalMinutes,
    averageMinutes: played === 0 ? 0 : Math.round(totalMinutes / played),
  };
}

export interface PersonaBar {
  persona: Persona;
  minutes: number;
  games: number;
}

/**
 * 분위기별 플레이 시간 (많은 순, 게임이 하나도 없는 분위기는 뺀다).
 * 서버가 아직 분위기를 알아내지 못한 게임은 어느 쪽에도 넣지 않고 개수만 pending으로 알린다.
 */
export function byPersona(games: SteamOwnedGame[]): { bars: PersonaBar[]; pending: number } {
  const map = new Map<Persona, PersonaBar>();
  let pending = 0;
  for (const g of games) {
    if (g.persona === null) {
      pending++;
      continue;
    }
    const bar = map.get(g.persona) ?? { persona: g.persona, minutes: 0, games: 0 };
    bar.minutes += g.playtimeMinutes;
    bar.games++;
    map.set(g.persona, bar);
  }
  const bars = [...map.values()].sort(
    (a, b) => b.minutes - a.minutes || b.games - a.games || a.persona.localeCompare(b.persona),
  );
  return { bars, pending };
}

/** 마지막으로 플레이한 해별 게임 수 (오래된 해부터). 플레이한 적 없는 게임은 뺀다 */
export function byLastPlayedYear(games: SteamOwnedGame[]): { year: number; games: number }[] {
  const counts = new Map<number, number>();
  for (const g of games) {
    if (!g.lastPlayedAt) continue;
    // 저장된 시각(UTC)의 연도를 그대로 쓴다. 보는 사람의 시간대에 따라 결과가 달라지지 않는다
    const year = Number(g.lastPlayedAt.slice(0, 4));
    if (Number.isInteger(year)) counts.set(year, (counts.get(year) ?? 0) + 1);
  }
  return [...counts].map(([year, n]) => ({ year, games: n })).sort((a, b) => a.year - b.year);
}

/** 플레이 시간이 긴 게임 n개 (플레이한 적 없는 게임은 뺀다) */
export function topPlayed(games: SteamOwnedGame[], n = 5): SteamOwnedGame[] {
  return games
    .filter((g) => g.playtimeMinutes > 0)
    .sort((a, b) => b.playtimeMinutes - a.playtimeMinutes || a.name.localeCompare(b.name, 'ko'))
    .slice(0, n);
}

export interface LogSummary {
  /** 상태별 게임 수 */
  counts: Record<GameStatus, number>;
  /** 별점을 남긴 게임 수 */
  rated: number;
  /** 별점 평균(소수 첫째 자리). 별점이 없으면 null */
  averageRating: number | null;
  /** 상태·별점·메모 중 하나라도 남긴 게임 수 */
  logged: number;
}

/** 남긴 기록의 요약. 서재에 없는 게임(뺀 뒤에 남은 기록)은 세지 않는다 */
export function summarizeLogs(logs: Record<number, GameLog>, libraryIds: Set<number>): LogSummary {
  const counts = Object.fromEntries(GAME_STATUSES.map((s) => [s, 0])) as Record<GameStatus, number>;
  let rated = 0;
  let ratingSum = 0;
  let logged = 0;
  for (const log of Object.values(logs)) {
    if (!libraryIds.has(log.gameId)) continue;
    logged++;
    if (log.status) counts[log.status]++;
    if (log.rating !== null) {
      rated++;
      ratingSum += log.rating;
    }
  }
  return { counts, rated, averageRating: rated === 0 ? null : Math.round((ratingSum / rated) * 10) / 10, logged };
}

export interface AchievementStats {
  achieved: number;
  total: number;
  /** 확인한 게임 전체의 달성률(%) */
  percent: number;
  /** 업적을 전부 달성한 게임 수 */
  perfect: number;
}

/** 업적 달성 요약을 한 줄 통계로. 게임별 달성률이 아니라 업적 수를 모두 합쳐서 계산한다 */
export function achievementStats(summary: AchievementSummary): AchievementStats {
  const achieved = summary.games.reduce((sum, g) => sum + g.achieved, 0);
  const total = summary.games.reduce((sum, g) => sum + g.total, 0);
  return {
    achieved,
    total,
    percent: percent(achieved, total),
    perfect: summary.games.filter((g) => g.achieved === g.total).length,
  };
}
