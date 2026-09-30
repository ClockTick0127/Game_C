import { useEffect, useState } from 'react';
import { fallbackPalette, loadPalette, peekPalette, toSpineColors, type SpineColors } from '../utils/spineColor';

/**
 * 서재 책등의 색. 대표색을 아직 못 뽑았으면 게임마다 정해진 임시 색으로 먼저 보여 주고,
 * 이미지에서 뽑는 데 성공하면 그 색으로 바꾼다. 한 번 뽑은 색은 브라우저에 기억해 둔다.
 */
export function useSpinePalette(appId: number, imageUrl?: string | null): SpineColors {
  const [palette, setPalette] = useState(() => peekPalette(appId));

  useEffect(() => {
    if (palette) return;
    let alive = true;
    loadPalette(appId, imageUrl).then((found) => {
      if (alive && found) setPalette(found);
    });
    return () => {
      alive = false;
    };
  }, [appId, imageUrl, palette]);

  return toSpineColors(palette ?? fallbackPalette(appId));
}
