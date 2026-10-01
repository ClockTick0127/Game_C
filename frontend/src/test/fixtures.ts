import type { Game, User } from '../types';

export function makeGame(id: number, overrides: Partial<Game> = {}): Game {
  return {
    id,
    name: `게임 ${id}`,
    // 항상 미래라 "출시 예정"으로 분류된다. id가 클수록 늦게 나온다.
    released: `2099-01-${String(id).padStart(2, '0')}`,
    image: null,
    rating: 4,
    metacritic: null,
    platforms: ['PC'],
    genres: ['RPG'],
    url: null,
    ...overrides,
  };
}

export const testUser: User = {
  id: 1,
  email: 'tester@example.com',
  nickname: '테스터',
  createdAt: '2026-01-01T00:00:00.000Z',
  steamId: null,
  preferredPlatform: null,
  preferredGenre: null,
  profilePublic: false,
};

/** 밖에서 직접 성공·실패시킬 수 있는 Promise (요청 순서와 타이밍을 제어하는 테스트용) */
export function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
