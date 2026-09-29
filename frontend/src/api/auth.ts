import type { User } from '../types';
import { request } from './client';

export function signup(email: string, password: string, nickname: string): Promise<{ user: User }> {
  return request('/api/auth/signup', { method: 'POST', body: { email, password, nickname } });
}

export function login(email: string, password: string): Promise<{ user: User }> {
  return request('/api/auth/login', { method: 'POST', body: { email, password } });
}

export function logout(): Promise<void> {
  return request('/api/auth/logout', { method: 'POST' });
}

/** 이 기기를 포함한 모든 기기에서 로그아웃 */
export function logoutAll(): Promise<void> {
  return request('/api/auth/logout-all', { method: 'POST' });
}

/** 로그인하지 않았으면 user가 null */
export function fetchMe(): Promise<{ user: User | null }> {
  return request('/api/auth/me');
}
