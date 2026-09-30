import type { SteamOwnedGame } from '../types';

export type LibrarySort = 'playtime' | 'recent' | 'name';

export const SORT_LABELS: Record<LibrarySort, string> = {
  playtime: '플레이 시간 순',
  recent: '최근 플레이 순',
  name: '이름 순',
};

/** 진열장의 게임 상자에 쓰는 세로형 표지. 없는 게임이 있어서 가로형 헤더, 그마저 없으면 글자 표지로 물러난다 */
export const coverUrls = (appId: number) => [
  `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`,
  `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`,
];

/** 게임마다 정해지는 책등 색상(0~359). 같은 게임은 항상 같은 색이다 */
export function spineHue(appId: number): number {
  return (appId * 137) % 360;
}

/** 검색어로 거른 뒤 정렬한다 */
export function filterAndSort(games: SteamOwnedGame[], query: string, sort: LibrarySort): SteamOwnedGame[] {
  const q = query.trim().toLowerCase();
  const list = q ? games.filter((g) => g.name.toLowerCase().includes(q)) : [...games];
  const byName = (a: SteamOwnedGame, b: SteamOwnedGame) => a.name.localeCompare(b.name, 'ko');
  if (sort === 'name') return list.sort(byName);
  if (sort === 'recent') {
    // 플레이 기록이 없는 게임(null)은 맨 뒤로
    return list.sort((a, b) => (b.lastPlayedAt ?? '').localeCompare(a.lastPlayedAt ?? '') || byName(a, b));
  }
  return list.sort((a, b) => b.playtimeMinutes - a.playtimeMinutes || byName(a, b));
}

/**
 * id를 targetId가 있던 자리에 꽂는다. list 안에 이미 있으면 옮기는 것이고(사이 항목은 한 칸씩 밀린다),
 * 없으면 targetId 앞에 끼워 넣는다. targetId가 null이면 맨 뒤에 꽂는다.
 */
export function placeAt(list: number[], id: number, targetId: number | null): number[] {
  if (id === targetId) return list;
  const to = targetId === null ? -1 : list.indexOf(targetId);
  if (targetId !== null && to < 0) return list;
  const next = list.filter((x) => x !== id);
  if (targetId === null) next.push(id);
  else next.splice(to, 0, id);
  return next;
}

export const removeFrom = (list: number[], id: number): number[] => list.filter((x) => x !== id);

/** 전체 플레이 시간(분)을 "1,234시간"으로 */
export function formatTotalHours(minutes: number): string {
  return `${Math.round(minutes / 60).toLocaleString('ko-KR')}시간`;
}
