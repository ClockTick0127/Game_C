import type { Game, User } from '../types';
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
