import type {
  CustomGame,
  Game,
  GameLog,
  GameLogInput,
  SteamAchievements,
  SteamOwnedGames,
  SteamStatus,
  SteamWishlist,
  SteamWishlistImportResult,
  User,
} from '../types';
import { request } from './client';

export function updateNickname(nickname: string): Promise<{ user: User }> {
  return request('/api/me', { method: 'PATCH', body: { nickname } });
}

/** 선호 플랫폼·장르 저장 (null이면 정하지 않음) */
export function updatePreferences(platform: string | null, genre: string | null): Promise<{ user: User }> {
  return request('/api/me/preferences', { method: 'PUT', body: { platform, genre } });
}

export function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  return request('/api/me/password', { method: 'PUT', body: { currentPassword, newPassword } });
}

export function deleteAccount(password: string): Promise<void> {
  return request('/api/me', { method: 'DELETE', body: { password } });
}

export function fetchFavorites(): Promise<{ games: Game[] }> {
  return request('/api/me/favorites');
}

export function addFavorite(game: Game): Promise<void> {
  return request(`/api/me/favorites/${game.id}`, { method: 'PUT', body: game });
}

export function removeFavorite(gameId: number): Promise<void> {
  return request(`/api/me/favorites/${gameId}`, { method: 'DELETE' });
}

export function fetchCalendarToken(): Promise<{ token: string }> {
  return request('/api/me/calendar-token');
}

export function resetCalendarToken(): Promise<{ token: string }> {
  return request('/api/me/calendar-token', { method: 'POST' });
}

export function fetchSteamStatus(): Promise<SteamStatus> {
  return request('/api/me/steam');
}

/** Steam 연동 해제. 비밀번호 로그인은 그대로 쓸 수 있다 */
export function unlinkSteam(): Promise<{ user: User }> {
  return request('/api/me/steam', { method: 'DELETE' });
}

export function fetchSteamGames(): Promise<SteamOwnedGames> {
  return request('/api/me/steam/games');
}

export function fetchSteamAchievements(appId: number): Promise<SteamAchievements> {
  return request(`/api/me/steam/games/${appId}/achievements`);
}

export function fetchSteamWishlist(): Promise<SteamWishlist> {
  return request('/api/me/steam/wishlist');
}

/** 위시리스트 게임을 관심 게임에 추가한다. 서버가 게임마다 RAWG를 찾으므로 한 번에 최대 10개 */
export function importSteamWishlist(appIds: number[]): Promise<{ results: SteamWishlistImportResult[] }> {
  return request('/api/me/steam/wishlist/import', { method: 'POST', body: { appIds } });
}

/** 저장한 서재 배치(앱 번호 목록). 저장한 적이 없으면 빈 배열 */
export function fetchLibraryOrder(): Promise<{ order: number[] }> {
  return request('/api/me/library-order');
}

export function saveLibraryOrder(order: number[]): Promise<void> {
  return request('/api/me/library-order', { method: 'PUT', body: { order } });
}

export function fetchCustomGames(): Promise<{ games: CustomGame[] }> {
  return request('/api/me/library-games');
}

export function searchLibraryGames(q: string): Promise<{ games: Game[] }> {
  return request(`/api/me/library-games/search?q=${encodeURIComponent(q)}`);
}

export function addCustomGame(game: CustomGame): Promise<void> {
  return request(`/api/me/library-games/${game.id}`, { method: 'PUT', body: game });
}

export function removeCustomGame(gameId: number): Promise<void> {
  return request(`/api/me/library-games/${gameId}`, { method: 'DELETE' });
}

/** 기록을 남긴 모든 게임의 플레이 상태·별점·메모 */
export function fetchGameLogs(): Promise<{ logs: GameLog[] }> {
  return request('/api/me/game-logs');
}

/** 서재 번호(SteamOwnedGame.appId)의 기록을 통째로 덮어쓴다 */
export function saveGameLog(gameId: number, log: GameLogInput): Promise<void> {
  return request(`/api/me/game-logs/${gameId}`, { method: 'PUT', body: log });
}

export function deleteGameLog(gameId: number): Promise<void> {
  return request(`/api/me/game-logs/${gameId}`, { method: 'DELETE' });
}
