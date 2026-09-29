import type { Game } from '../types.ts';
import { parseDateKey, toDateKey } from '../utils/date.ts';

// API 키가 없을 때 UI를 확인하기 위한 가상의 게임 목록 (실제 게임 아님)
const SAMPLE_TITLES: { name: string; genres: string[]; platforms: string[] }[] = [
  { name: 'Starfall Odyssey', genres: ['RPG', 'Adventure'], platforms: ['PC', 'PlayStation 5'] },
  { name: 'Neon Drift', genres: ['Racing'], platforms: ['PC', 'Xbox Series S/X'] },
  { name: 'Ironclad Tactics', genres: ['Strategy'], platforms: ['PC'] },
  { name: 'Hollow Pines', genres: ['Horror', 'Adventure'], platforms: ['PC', 'PlayStation 5', 'Xbox Series S/X'] },
  { name: 'Pixel Harvest', genres: ['Simulation', 'Indie'], platforms: ['PC', 'Nintendo Switch'] },
  { name: 'Skyline Brawlers', genres: ['Fighting'], platforms: ['PlayStation 5', 'Xbox Series S/X'] },
  { name: 'Echoes of Aether', genres: ['RPG'], platforms: ['PC', 'Nintendo Switch'] },
  { name: 'Deep Core Miners', genres: ['Action', 'Indie'], platforms: ['PC'] },
  { name: 'Kingdom Ledger', genres: ['Strategy', 'Simulation'], platforms: ['PC', 'macOS'] },
  { name: 'Velocity Zero', genres: ['Shooter', 'Action'], platforms: ['PC', 'PlayStation 5'] },
  { name: 'Moonlit Garden', genres: ['Puzzle', 'Casual'], platforms: ['Nintendo Switch', 'iOS', 'Android'] },
  { name: 'Rift Wardens', genres: ['Action', 'RPG'], platforms: ['PC', 'Xbox Series S/X'] },
  { name: 'Coral Kingdom', genres: ['Adventure', 'Family'], platforms: ['Nintendo Switch'] },
  { name: 'Last Signal', genres: ['Shooter'], platforms: ['PC', 'PlayStation 5', 'Xbox Series S/X'] },
  { name: 'Tiny Tavern', genres: ['Simulation', 'Indie'], platforms: ['PC'] },
];

/** 날짜 배치는 월마다 달라지지만 같은 월에서는 항상 같도록 결정적으로 만든다. */
function sampleForMonth(year: number, month: number): Game[] {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const seed = year * 12 + month;

  return SAMPLE_TITLES.map((title, i) => ({
    id: seed * 100 + i,
    name: title.name,
    released: toDateKey(new Date(year, month, ((i * 7 + seed * 3) % daysInMonth) + 1)),
    image: null,
    rating: 3.5 + ((i * 37 + seed) % 15) / 10,
    metacritic: null,
    platforms: title.platforms,
    genres: title.genres,
    url: null,
  }));
}

/** start ~ end 기간에 걸친 각 달의 샘플을 만들어 기간 안의 것만 돌려준다. */
export function getSampleReleases(start: string, end: string): Game[] {
  const startDate = parseDateKey(start);
  const endDate = parseDateKey(end);
  const games: Game[] = [];

  for (let d = new Date(startDate.getFullYear(), startDate.getMonth(), 1); d <= endDate; d.setMonth(d.getMonth() + 1)) {
    games.push(...sampleForMonth(d.getFullYear(), d.getMonth()));
  }
  return games.filter((g) => g.released >= start && g.released <= end);
}
