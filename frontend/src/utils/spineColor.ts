import { spineHue } from './library';

/** h: 0~359, s·l: 0~100 */
export interface Hsl {
  h: number;
  s: number;
  l: number;
}

/** 게임의 대표색 두 가지 (가장 뚜렷한 색과, 그와 다른 계열의 두 번째 색) */
export interface Palette {
  primary: Hsl;
  secondary: Hsl;
}

/** 책등에 실제로 칠하는 색 */
export interface SpineColors {
  top: string;
  bottom: string;
  accent: string;
  /** 제목 글자색: 대표색을 밝게 한 색 */
  text: string;
}

export function rgbToHsl(r: number, g: number, b: number): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l: l * 100 };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === rn ? ((gn - bn) / d) % 6 : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
  return { h: (h * 60 + 360) % 360, s: s * 100, l: l * 100 };
}

const BUCKETS = 12;
const hueDistance = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

interface Bucket {
  weight: number;
  sin: number;
  cos: number;
  s: number;
  l: number;
}

/**
 * RGBA 픽셀에서 대표색 두 가지를 뽑는다. 색상을 12구간으로 나눠 채도가 높고 너무 어둡거나 밝지 않은 픽셀에 더 큰 점수를 주고,
 * 점수가 가장 큰 구간을 대표색으로, 색상이 40° 이상 다른 다음 구간을 두 번째 색으로 삼는다.
 * 모든 픽셀이 거의 검정·흰색이라 색을 뽑을 수 없으면 null.
 */
export function extractPalette(pixels: ArrayLike<number>): Palette | null {
  const buckets: Bucket[] = Array.from({ length: BUCKETS }, () => ({ weight: 0, sin: 0, cos: 0, s: 0, l: 0 }));

  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3]! < 128) continue; // 투명한 픽셀
    const { h, s, l } = rgbToHsl(pixels[i]!, pixels[i + 1]!, pixels[i + 2]!);
    // 가운데 밝기일수록 점수가 크고, 검정·흰색에 가까우면 0에 가깝다
    const lightness = 1 - Math.abs((l - 50) / 50) ** 1.5;
    const weight = (0.15 + s / 100) * lightness;
    if (weight < 0.02) continue;
    const bucket = buckets[Math.floor(h / (360 / BUCKETS)) % BUCKETS]!;
    const rad = (h * Math.PI) / 180;
    bucket.weight += weight;
    bucket.sin += Math.sin(rad) * weight;
    bucket.cos += Math.cos(rad) * weight;
    bucket.s += s * weight;
    bucket.l += l * weight;
  }

  const toHsl = (b: Bucket): Hsl => ({
    h: Math.round(((Math.atan2(b.sin, b.cos) * 180) / Math.PI + 360) % 360),
    s: Math.round(b.s / b.weight),
    l: Math.round(b.l / b.weight),
  });

  const ranked = buckets.filter((b) => b.weight > 0).sort((a, b) => b.weight - a.weight);
  const first = ranked[0];
  if (!first) return null;
  const primary = toHsl(first);
  const second = ranked
    .slice(1)
    .find((b) => b.weight >= first.weight * 0.2 && hueDistance(toHsl(b).h, primary.h) >= 40);
  // 뚜렷한 두 번째 색이 없으면 대표색에서 색상을 조금 돌린 색을 쓴다
  const secondary = second ? toHsl(second) : { ...primary, h: (primary.h + 30) % 360 };
  return { primary, secondary };
}

/** 대표색을 못 뽑았을 때(이미지가 없거나 아직 불러오는 중)의 색. 게임마다 다른 색이 고정으로 나온다 */
export function fallbackPalette(appId: number): Palette {
  const h = spineHue(appId);
  return { primary: { h, s: 45, l: 40 }, secondary: { h: (h + 30) % 360, s: 45, l: 30 } };
}

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

/**
 * 밝은 글씨가 잘 읽히도록 대표색을 어둡게 눌러서 책등 색을 만들고, 글자색은 같은 색조를 밝게 만든다.
 * 회색·검정 계열 게임은 없던 색을 입히지 않고 그대로 무채색으로 둔다.
 */
export function toSpineColors({ primary, secondary }: Palette): SpineColors {
  const saturation = (s: number) => (s < 12 ? s : clamp(s, 35, 80));
  return {
    top: `hsl(${primary.h} ${saturation(primary.s)}% 30%)`,
    bottom: `hsl(${secondary.h} ${saturation(secondary.s)}% 16%)`,
    accent: `hsl(${primary.h} ${primary.s < 12 ? primary.s : 78}% 62%)`,
    // 어두운 바탕(밝기 16~30%) 위에서 잘 읽히도록 밝기를 88%로 고정한다. 색조는 게임 대표색을 따른다
    text: `hsl(${primary.h} ${primary.s < 12 ? primary.s : 80}% 88%)`,
  };
}

// --- 이미지에서 뽑아 브라우저에 기억해 두기 ---

const STORAGE_KEY = 'spinePalettes:v1';
const MAX_STORED = 5000;
/** 색을 뽑을 이미지. 아이콘 서버(media.steampowered.com)는 픽셀 읽기를 막아서, 허용하는 캡슐 이미지 서버를 쓴다 */
const capsuleUrl = (appId: number) => `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/capsule_sm_120.jpg`;

let stored: Record<string, Palette> | null = null;

function store(): Record<string, Palette> {
  if (stored) return stored;
  try {
    stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, Palette>;
  } catch {
    stored = {}; // 저장소를 못 쓰는 환경(비공개 창 등)이면 이번 접속 동안만 기억한다
  }
  return stored;
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store()));
  } catch {
    // 용량이 부족하거나 저장소를 못 쓰면 다음에 다시 뽑는다
  }
}

/** 이미 뽑아 둔 대표색 (없으면 null) */
export function peekPalette(appId: number): Palette | null {
  return store()[appId] ?? null;
}

// 이미지를 한꺼번에 수백 장 요청하지 않도록 동시에 몇 장만 처리한다
const MAX_ACTIVE = 6;
let active = 0;
const waiting: (() => void)[] = [];
const pending = new Map<number, Promise<Palette | null>>();

function measure(appId: number): Promise<Palette | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 12;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, 32, 12);
        resolve(extractPalette(ctx.getImageData(0, 0, 32, 12).data));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = capsuleUrl(appId);
  });
}

/** 게임의 대표색을 뽑아서(같은 게임은 한 번만) 브라우저에 저장한다. 이미지가 없거나 읽을 수 없으면 null */
export function loadPalette(appId: number): Promise<Palette | null> {
  const known = peekPalette(appId);
  if (known) return Promise.resolve(known);
  const running = pending.get(appId);
  if (running) return running;

  const job = (async () => {
    if (active >= MAX_ACTIVE) await new Promise<void>((resolve) => waiting.push(resolve));
    active++;
    try {
      const palette = await measure(appId);
      if (palette && Object.keys(store()).length < MAX_STORED) {
        store()[appId] = palette;
        persist();
      }
      return palette;
    } finally {
      active--;
      waiting.shift()?.();
      pending.delete(appId);
    }
  })();
  pending.set(appId, job);
  return job;
}
