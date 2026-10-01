import { useEffect, useRef } from 'react';

/** 이보다 작게 줄이면 읽을 수 없어서, 여기까지 줄여도 안 들어가는 글자는 잘리게 둔다 */
const MIN_FONT_PX = 11;

/** 상자 안쪽 여유(위 3px + 아래 8px). styles.css의 .spine-title padding과 같다 */
const PADDING_PX = 11;

/** 제목이 상자 높이를 넘으면 글자 크기를 CSS가 정한 크기에서 비율만큼 줄인다. 넘지 않으면 CSS 크기 그대로 둔다 */
function fit(el: HTMLElement): void {
  el.style.fontSize = '';
  // 글자 높이는 소수점 단위로 어긋나므로 살짝 여유를 둔다
  const available = (el.clientHeight - PADDING_PX) * 0.96;
  const used = el.scrollHeight - PADDING_PX;
  if (available <= 0 || used <= available) return;
  const base = parseFloat(getComputedStyle(el).fontSize);
  el.style.fontSize = `${Math.max(MIN_FONT_PX, Math.floor(((base * available) / used) * 10) / 10)}px`;
}

/**
 * 서재 책등의 세로 제목을 책등 높이에 맞춘다. 세워 쓴 글자가 차지하는 높이는 글꼴마다 달라서
 * (같은 글자 수라도 어떤 글꼴은 1em, 어떤 글꼴은 1.5em) 글자 수로는 미리 알 수 없고, 실제로 그려 본 뒤 재야 한다.
 * 글꼴이 뒤늦게 내려받아지거나 책등 높이가 바뀌면(화면 크기) 다시 맞춘다.
 */
export function useFitTitle<T extends HTMLElement>(...deps: unknown[]) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const run = () => fit(el);
    run();

    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(run);
    observer?.observe(el);
    // 글꼴이 내려받아지면 같은 글이라도 높이가 달라진다
    const fonts = document.fonts;
    fonts?.addEventListener?.('loadingdone', run);
    return () => {
      observer?.disconnect();
      fonts?.removeEventListener?.('loadingdone', run);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 제목이나 글꼴이 바뀔 때 다시 맞추기 위한 값들이다
  }, deps);

  return ref;
}
