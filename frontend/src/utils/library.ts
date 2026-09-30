import type { SteamOwnedGame } from '../types';

export type LibrarySort = 'playtime' | 'recent' | 'name';

export const SORT_LABELS: Record<LibrarySort, string> = {
  playtime: '플레이 시간 순',
  recent: '최근 플레이 순',
  name: '이름 순',
};

/** 게임 상자에 쓰는 세로형 표지. 없는 게임이 있어서 가로형 헤더, 그마저 없으면 글자 표지로 물러난다 */
export const coverUrls = (appId: number) => [
  `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`,
  `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`,
];

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

/** 전체 플레이 시간(분)을 "1,234시간"으로 */
export function formatTotalHours(minutes: number): string {
  return `${Math.round(minutes / 60).toLocaleString('ko-KR')}시간`;
}
