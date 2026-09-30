import type { Game, SteamAchievements, SteamOwnedGames, SteamStatus, User } from '../types';
import { request } from './client';

export function updateNickname(nickname: string): Promise<{ user: User }> {
  return request('/api/me', { method: 'PATCH', body: { nickname } });
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
