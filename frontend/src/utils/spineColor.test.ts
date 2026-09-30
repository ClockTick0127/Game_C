import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractPalette, fallbackPalette, rgbToHsl, toSpineColors } from './spineColor';

/** 같은 색 픽셀 count개를 RGBA 배열로 */
const pixels = (...groups: [number, number, number, number][]): number[] =>
  groups.flatMap(([r, g, b, count]) => Array.from({ length: count }, () => [r, g, b, 255]).flat());

describe('rgbToHsl', () => {
  it('기본 색', () => {
    expect(rgbToHsl(255, 0, 0)).toMatchObject({ h: 0, s: 100, l: 50 });
    expect(rgbToHsl(0, 255, 0)).toMatchObject({ h: 120, s: 100, l: 50 });
    expect(rgbToHsl(0, 0, 255)).toMatchObject({ h: 240, s: 100, l: 50 });
  });

  it('회색은 채도 0', () => {
    expect(rgbToHsl(128, 128, 128).s).toBe(0);
  });
});

describe('extractPalette', () => {
  it('한 가지 색뿐이면 그 색이 대표색이다', () => {
    const palette = extractPalette(pixels([220, 30, 30, 100]))!;
    expect(palette.primary.h).toBeLessThan(5);
    expect(palette.primary.s).toBeGreaterThan(70);
  });

  it('더 많이 쓰인 색이 대표색, 색상이 다른 다음 색이 두 번째 색이다', () => {
    const palette = extractPalette(pixels([30, 60, 220, 70], [40, 200, 60, 30]))!;
    expect(palette.primary.h).toBeGreaterThan(200); // 파랑
    expect(palette.primary.h).toBeLessThan(250);
    expect(palette.secondary.h).toBeGreaterThan(100); // 초록
    expect(palette.secondary.h).toBeLessThan(150);
  });

  it('비슷한 색상끼리는 두 번째 색으로 치지 않고, 대표색에서 색상을 살짝 돌린 색을 쓴다', () => {
    const palette = extractPalette(pixels([220, 30, 30, 60], [230, 70, 20, 40]))!;
    expect(palette.secondary.h).not.toBe(palette.primary.h);
    expect(Math.abs(palette.secondary.h - palette.primary.h)).toBeLessThanOrEqual(40);
  });

  it('회색·검정·흰색 배경보다 뚜렷한 색을 대표색으로 삼는다', () => {
    const palette = extractPalette(pixels([10, 10, 10, 300], [255, 255, 255, 200], [30, 160, 220, 40]))!;
    expect(palette.primary.h).toBeGreaterThan(180);
    expect(palette.primary.h).toBeLessThan(220);
  });

  it('투명한 픽셀은 무시한다', () => {
    const data = [...pixels([200, 40, 40, 20]), ...Array.from({ length: 200 }, () => [30, 200, 60, 0]).flat()];
    expect(extractPalette(data)!.primary.h).toBeLessThan(5);
  });

  it('전부 거의 검정이거나 흰색이라 색을 뽑을 수 없으면 null', () => {
    expect(extractPalette(pixels([0, 0, 0, 100]))).toBeNull();
    expect(extractPalette(pixels([255, 255, 255, 100]))).toBeNull();
    expect(extractPalette([])).toBeNull();
  });
});

describe('toSpineColors', () => {
  it('흰 글씨가 읽히도록 어둡게 눌러서 만든다', () => {
    const colors = toSpineColors({ primary: { h: 10, s: 90, l: 55 }, secondary: { h: 200, s: 60, l: 50 } });
    expect(colors.top).toBe('hsl(10 80% 30%)');
    expect(colors.bottom).toBe('hsl(200 60% 16%)');
    expect(colors.accent).toBe('hsl(10 78% 62%)');
    expect(colors.text).toBe('hsl(10 80% 88%)'); // 같은 색조를 밝게
  });

  it('회색 계열 게임은 없던 색을 입히지 않는다', () => {
    const colors = toSpineColors({ primary: { h: 0, s: 3, l: 40 }, secondary: { h: 30, s: 5, l: 30 } });
    expect(colors.top).toBe('hsl(0 3% 30%)');
    expect(colors.accent).toBe('hsl(0 3% 62%)');
    expect(colors.text).toBe('hsl(0 3% 88%)'); // 글자도 무채색
  });

  it('채도가 낮은 색은 너무 칙칙하지 않게 끌어올린다', () => {
    expect(toSpineColors({ primary: { h: 100, s: 20, l: 40 }, secondary: { h: 100, s: 20, l: 40 } }).top).toBe(
      'hsl(100 35% 30%)',
    );
  });
});

describe('fallbackPalette', () => {
  it('게임마다 고정된 색이고 게임끼리는 다르다', () => {
    expect(fallbackPalette(730)).toEqual(fallbackPalette(730));
    expect(fallbackPalette(730).primary.h).not.toBe(fallbackPalette(440).primary.h);
  });
});

describe('peekPalette', () => {
  afterEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('브라우저에 저장해 둔 대표색을 읽는다', async () => {
    const saved = { primary: { h: 10, s: 80, l: 50 }, secondary: { h: 200, s: 60, l: 40 } };
    localStorage.setItem('spinePalettes:v1', JSON.stringify({ '730': saved }));
    vi.resetModules();
    const { peekPalette } = await import('./spineColor');
    expect(peekPalette(730)).toEqual(saved);
    expect(peekPalette(1)).toBeNull();
  });

  it('저장된 값이 깨져 있어도 오류 없이 비어 있는 것으로 본다', async () => {
    localStorage.setItem('spinePalettes:v1', '{not json');
    vi.resetModules();
    const { peekPalette } = await import('./spineColor');
    expect(peekPalette(730)).toBeNull();
  });
});
