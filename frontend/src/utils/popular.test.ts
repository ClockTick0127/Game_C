import { describe, expect, it } from 'vitest';
import { formatCount, formatOwners, formatPrice, genreLabel } from './popular';

describe('popular utils', () => {
  it('보유자 수를 만·억 단위로 줄여 쓴다', () => {
    expect(formatCount(1_000_000)).toBe('100만');
    expect(formatCount(20_000_000)).toBe('2,000만');
    expect(formatCount(100_000_000)).toBe('1억');
    expect(formatCount(150_000_000)).toBe('1.5억');
    expect(formatCount(5_000)).toBe('5,000');
  });

  it('구간을 "최소 ~ 최대"로 보여 준다', () => {
    expect(formatOwners(1_000_000, 2_000_000)).toBe('100만 ~ 200만');
  });

  it('가격: 무료·정보 없음·일반', () => {
    expect(formatPrice(0)).toBe('무료');
    expect(formatPrice(null)).toBeNull();
    expect(formatPrice(19.9)).toBe('$19.90');
    expect(formatPrice(59.99, 1353.36)).toBe('₩81,190');
    expect(formatPrice(0, 1353.36)).toBe('무료');
  });

  it('모르는 장르는 원래 이름 그대로', () => {
    expect(genreLabel('Action')).toBe('액션');
    expect(genreLabel('Roguelike')).toBe('Roguelike');
  });
});
