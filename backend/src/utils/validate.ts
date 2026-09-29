import type { Game } from '../types.ts';
import { isDateKey } from './date.ts';
import { HttpError } from './http.ts';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(value: unknown): string {
  const email = typeof value === 'string' ? value.trim() : '';
  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    throw new HttpError(400, '올바른 이메일 주소를 입력하세요.');
  }
  return email;
}

export function validatePassword(value: unknown, label = '비밀번호'): string {
  if (typeof value !== 'string' || value.length < 8 || value.length > 100) {
    throw new HttpError(400, `${label}는 8자 이상 100자 이하로 입력하세요.`);
  }
  return value;
}

export function validateNickname(value: unknown): string {
  const nickname = typeof value === 'string' ? value.trim() : '';
  if (nickname.length < 2 || nickname.length > 20) {
    throw new HttpError(400, '닉네임은 2자 이상 20자 이하로 입력하세요.');
  }
  return nickname;
}

/** 비어 있지 않은 문자열인지만 확인한다 (로그인처럼 형식 규칙을 알려줄 필요가 없는 곳에서 사용). */
export function requireText(value: unknown, message: string): string {
  if (typeof value !== 'string' || value === '') throw new HttpError(400, message);
  return value;
}

function isText(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}

function isTextList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 30 && value.every((v) => isText(v, 100));
}

/** 링크로 렌더링되므로 javascript: 같은 스킴을 막기 위해 https만 허용한다. */
function isHttpsUrlOrNull(value: unknown): value is string | null {
  return value === null || (isText(value, 500) && value.startsWith('https://'));
}

function isFiniteOrNull(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

/** 클라이언트가 보낸 게임 정보를 검증하고, 알려진 필드만 골라낸다. */
export function parseGame(value: unknown): Game {
  const g = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
  const valid =
    Number.isSafeInteger(g.id) &&
    (g.id as number) > 0 &&
    isText(g.name, 200) &&
    typeof g.released === 'string' &&
    isDateKey(g.released) &&
    isHttpsUrlOrNull(g.image) &&
    typeof g.rating === 'number' &&
    Number.isFinite(g.rating) &&
    isFiniteOrNull(g.metacritic) &&
    isTextList(g.platforms) &&
    isTextList(g.genres) &&
    isHttpsUrlOrNull(g.url);

  if (!valid) throw new HttpError(400, '게임 정보가 올바르지 않습니다.');

  return {
    id: g.id as number,
    name: g.name as string,
    released: g.released as string,
    image: g.image as string | null,
    rating: g.rating as number,
    metacritic: g.metacritic as number | null,
    platforms: g.platforms as string[],
    genres: g.genres as string[],
    url: g.url as string | null,
  };
}
