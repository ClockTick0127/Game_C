import type { GameFilter } from './filterGames';
import type { User } from '../types';

/** 마이페이지에서 고를 수 있는 플랫폼·장르. RAWG가 쓰는 이름과 같아야 캘린더 필터와 맞는다 */
export const PLATFORM_OPTIONS = [
  'PC',
  'PlayStation 5',
  'PlayStation 4',
  'Xbox Series S/X',
  'Xbox One',
  'Nintendo Switch',
  'macOS',
  'Linux',
  'iOS',
  'Android',
];

export const GENRE_OPTIONS = [
  'Action',
  'Adventure',
  'RPG',
  'Strategy',
  'Shooter',
  'Simulation',
  'Puzzle',
  'Platformer',
  'Racing',
  'Sports',
  'Fighting',
  'Arcade',
  'Casual',
  'Indie',
  'Massively Multiplayer',
  'Family',
];

/** 내 선호를 기본 필터로 적용한다. 이미 직접 고른 플랫폼·장르는 건드리지 않는다 */
export function withPreferences(filter: GameFilter, user: User | null): GameFilter {
  if (!user) return filter;
  return {
    ...filter,
    platform: filter.platform ?? user.preferredPlatform,
    genre: filter.genre ?? user.preferredGenre,
  };
}
