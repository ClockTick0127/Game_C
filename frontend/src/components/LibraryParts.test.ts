import { describe, expect, it } from 'vitest';
import { spineTitle } from './LibraryParts';

describe('spineTitle', () => {
  it('짧은 제목은 그대로 둔다', () => {
    expect(spineTitle('Tekken 7')).toBe('Tekken 7');
    expect(spineTitle('  몬스터 헌터 와일즈 ')).toBe('몬스터 헌터 와일즈');
  });

  it('너무 긴 제목은 줄이고 …를 붙인다 (글자 수는 이모지 등 한 글자 단위로 센다)', () => {
    const text = spineTitle("Sid Meier's Civilization VI");
    expect([...text]).toHaveLength(16);
    expect(text).toBe("Sid Meier's Civ…");
    expect(spineTitle('😀'.repeat(20))).toBe(`${'😀'.repeat(15)}…`);
  });

  it('줄인 끝이 공백이면 공백을 떼고 …를 붙인다', () => {
    expect(spineTitle('Left 4 Dead 2 Special Edition')).toBe('Left 4 Dead 2 S…');
    expect(spineTitle('Counter-Strike 2 Global Offensive')).toBe('Counter-Strike…');
  });
});
