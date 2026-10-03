import { describe, expect, it } from 'vitest';
import type { Persona } from '../types';
import { makeGame } from '../test/fixtures';
import { likedPersonas, MAX_LIKED_PERSONAS, tasteMatch, tasteReason, TASTE_THRESHOLD } from './taste';

describe('likedPersonas', () => {
  it('문턱 이상인 분위기만 좋아하는 순으로 고른다', () => {
    expect(likedPersonas({ scifi: 1, fantasy: 0.7, cute: 0.2, horror: TASTE_THRESHOLD })).toEqual([
      'scifi',
      'fantasy',
      'horror',
    ]);
  });

  it('고르게 즐겨서 거의 모든 분위기가 문턱을 넘어도 상위 3개까지만 취향으로 본다', () => {
    const affinity = { scifi: 1, fantasy: 0.9, horror: 0.8, cute: 0.7, retro: 0.6 };
    expect(likedPersonas(affinity)).toEqual(['scifi', 'fantasy', 'horror']);
    expect(likedPersonas(affinity)).toHaveLength(MAX_LIKED_PERSONAS);
  });

  it('"기타"는 취향이 아니고, 계산할 수 없으면 비어 있다', () => {
    expect(likedPersonas({ default: 1, scifi: 0.6 })).toEqual(['scifi']);
    expect(likedPersonas({})).toEqual([]);
  });
});

describe('tasteMatch', () => {
  const liked = new Set<Persona>(['scifi', 'fantasy']);
  const today = '2026-06-15';
  const game = (persona: Persona | null | undefined, released: string) => makeGame(1, { persona, released });

  it('취향에 맞는 출시 예정 게임이면 그 분위기를 돌려준다 (오늘 출시도 예정)', () => {
    expect(tasteMatch(game('scifi', '2026-06-20'), liked, today)).toBe('scifi');
    expect(tasteMatch(game('fantasy', today), liked, today)).toBe('fantasy');
  });

  it('이미 출시된 게임, 출시일 미정, 취향이 아닌 분위기, 분위기를 모르는 게임은 맞지 않는다', () => {
    expect(tasteMatch(game('scifi', '2026-06-14'), liked, today)).toBeNull();
    expect(tasteMatch(game('scifi', ''), liked, today)).toBeNull();
    expect(tasteMatch(game('cute', '2026-06-20'), liked, today)).toBeNull();
    expect(tasteMatch(game(null, '2026-06-20'), liked, today)).toBeNull();
    expect(tasteMatch(game(undefined, '2026-06-20'), liked, today)).toBeNull();
    expect(tasteMatch(game('default', '2026-06-20'), new Set<Persona>(['default']), today)).toBeNull();
  });
});

describe('tasteReason', () => {
  it('분위기 이름으로 이유 문장을 만든다', () => {
    expect(tasteReason('scifi')).toBe('SF 게임을 즐겨 하시네요.');
  });
});
