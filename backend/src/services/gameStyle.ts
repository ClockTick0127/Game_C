import { GAME_STYLES_ENABLED, POPULAR_STEAMSPY_GAP_MS } from '../config.ts';
import { db } from '../db.ts';

/**
 * 게임의 "분위기". 서재 책등의 제목 폰트를 고르는 데 쓴다.
 * 게임마다 로고 폰트를 가져올 수는 없어서, SteamSpy의 사용자 태그(예: Souls-like, Cyberpunk, Pixel Graphics)를
 * 몇 가지 분위기로 묶어 그에 맞는 폰트 스타일을 고른다.
 */
export const PERSONAS = [
  'horror',
  'scifi',
  'fantasy',
  'retro',
  'cute',
  'sports',
  'strategy',
  'action',
  'default',
] as const;
export type Persona = (typeof PERSONAS)[number];

/** 분위기별로 점수를 주는 태그 */
const TAGS: Record<Exclude<Persona, 'default'>, string[]> = {
  horror: ['Horror', 'Survival Horror', 'Psychological Horror', 'Gore', 'Lovecraftian', 'Zombies'],
  scifi: ['Cyberpunk', 'Sci-fi', 'Space', 'Futuristic', 'Mechs', 'Robots', 'Space Sim', 'Aliens'],
  fantasy: [
    'Dark Fantasy',
    'Fantasy',
    'Souls-like',
    'Medieval',
    'Magic',
    'Dungeon Crawler',
    'Mythology',
    'Swordplay',
    'JRPG',
  ],
  retro: ['Pixel Graphics', 'Retro', 'Arcade', 'Old School', '2D Platformer', 'Roguelite', 'Metroidvania'],
  cute: [
    'Cute',
    'Casual',
    'Farming Sim',
    'Life Sim',
    'Anime',
    'Cartoony',
    'Colorful',
    'Family Friendly',
    'Relaxing',
    'Cozy',
    'Wholesome',
  ],
  sports: ['Racing', 'Sports', 'Driving', 'Football', 'Soccer', 'Basketball', 'Golf', 'Cars', 'Motorbike'],
  strategy: [
    'Strategy',
    'City Builder',
    'Grand Strategy',
    '4X',
    'Management',
    'RTS',
    'Turn-Based Strategy',
    'Tower Defense',
    'Simulation',
    'Building',
    'Colony Sim',
  ],
  action: ['FPS', 'Shooter', 'Action', 'Fighting', 'Hack and Slash', 'Battle Royale', 'Third-Person Shooter'],
};

/**
 * 태그(이름 → 투표 수)에서 분위기를 고른다. 분위기마다 해당 태그의 투표 수를 합쳐 가장 높은 것을 고르고,
 * 어느 것도 가장 많이 붙은 태그의 10%에 못 미치면 기본으로 둔다. 동점이면 PERSONAS 순서상 앞선 분위기가 이긴다.
 */
export function derivePersona(tags: Record<string, number> | null | undefined): Persona {
  const entries = Object.entries(tags ?? {}).filter(([, votes]) => Number.isFinite(votes) && votes > 0);
  if (entries.length === 0) return 'default';
  const top = Math.max(...entries.map(([, votes]) => votes));

  let best: Persona = 'default';
  let bestScore = 0;
  for (const persona of PERSONAS) {
    if (persona === 'default') continue;
    const names = new Set(TAGS[persona]);
    const score = entries.reduce((sum, [name, votes]) => sum + (names.has(name) ? votes : 0), 0);
    if (score > bestScore) {
      best = persona;
      bestScore = score;
    }
  }
  return bestScore >= top * 0.1 ? best : 'default';
}

/** 태그·장르 이름 비교용: 대소문자와 기호를 무시한다 ("Sci-fi" · "sci-fi" · "SciFi"가 같게) */
const normalizeTag = (name: string) => name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

const PERSONA_BY_TAG = new Map<string, Persona>(
  (Object.entries(TAGS) as [Exclude<Persona, 'default'>, string[]][]).flatMap(([persona, names]) =>
    names.map((name) => [normalizeTag(name), persona] as const),
  ),
);
// RAWG 장르 중 SteamSpy 태그 목록에는 없지만 분위기를 알려 주는 것
PERSONA_BY_TAG.set(normalizeTag('Family'), 'cute');

/** "Action"·"Shooter" 같은 흔한 태그는 거의 모든 게임에 붙어서, 다른 분위기보다 약하게 센다 */
const WEAK_PERSONA: Persona = 'action';

/**
 * 아직 출시되지 않은 게임의 분위기. SteamSpy 태그는 득표 수가 있어 derivePersona가 쓰지만, RAWG는 태그 이름만 줘서
 * 이름이 몇 개나 맞는지로 고른다. 흔한 "액션"은 절반으로 세고, 동점이면 PERSONAS 순서(공포 → … → 액션)가 앞선 쪽이 이긴다.
 * 어느 분위기에도 맞는 이름이 없으면 null(모른다)이다.
 */
export function personaFromNames(names: string[]): Persona | null {
  const matched = new Set<string>();
  const score = new Map<Persona, number>();
  for (const name of names) {
    const key = normalizeTag(name);
    const persona = PERSONA_BY_TAG.get(key);
    if (!persona || matched.has(key)) continue;
    matched.add(key);
    score.set(persona, (score.get(persona) ?? 0) + (persona === WEAK_PERSONA ? 0.5 : 1));
  }
  let best: Persona | null = null;
  let bestScore = 0;
  for (const persona of PERSONAS) {
    const value = score.get(persona) ?? 0;
    if (value > bestScore) {
      best = persona;
      bestScore = value;
    }
  }
  return best;
}

const selectMany = (count: number) =>
  db.prepare(`SELECT appid, persona FROM game_styles WHERE appid IN (${Array(count).fill('?').join(',')})`);
const upsert = db.prepare(`
  INSERT INTO game_styles (appid, persona, checked_at) VALUES (?, ?, ?)
  ON CONFLICT (appid) DO UPDATE SET persona = excluded.persona, checked_at = excluded.checked_at
`);

const CHUNK = 500; // SQLite 변수 개수 제한을 넘지 않게 나눠서 조회한다

/** 이미 알아 둔 게임들의 분위기 */
export function getPersonas(appIds: number[]): Map<number, Persona> {
  const found = new Map<number, Persona>();
  for (let i = 0; i < appIds.length; i += CHUNK) {
    const chunk = appIds.slice(i, i + CHUNK);
    for (const row of selectMany(chunk.length).all(...chunk) as { appid: number; persona: Persona }[]) {
      found.set(row.appid, row.persona);
    }
  }
  return found;
}

// --- 백그라운드 조회 ---

const TIMEOUT_MS = 20_000;
/** 호출 제한이나 서버 오류로 멈춘 뒤 다시 시도하기까지의 대기 시간 */
const RETRY_MS = 10 * 60 * 1000;
/** 한 번에 대기열에 쌓아 두는 최대 게임 수 (서버 메모리 보호) */
const MAX_QUEUE = 20_000;

const queue = new Set<number>();
let working: Promise<void> | null = null;
let retryAfter = 0;

const sleep = (ms: number) => (ms > 0 ? new Promise<void>((resolve) => setTimeout(resolve, ms)) : Promise.resolve());

async function lookup(appId: number): Promise<Persona> {
  const res = await fetch(`https://steamspy.com/api.php?request=appdetails&appid=${appId}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`SteamSpy app ${appId}: HTTP ${res.status}`);
  const body = (await res.json()) as { name?: string | null; tags?: Record<string, number> | unknown[] };
  // 모르는 앱이면 name이 null이고 tags는 빈 배열로 온다. 기본 분위기로 기록해서 다시 묻지 않는다
  const tags = body.tags && !Array.isArray(body.tags) ? body.tags : {};
  return derivePersona(body.name ? tags : {});
}

async function drain(): Promise<void> {
  let first = true;
  for (const appId of queue) {
    if (!first) await sleep(POPULAR_STEAMSPY_GAP_MS);
    first = false;
    try {
      upsert.run(appId, await lookup(appId), Date.now());
      queue.delete(appId);
    } catch (err) {
      // 호출 제한(429)이나 서버 오류일 수 있으니 계속 두드리지 않고 멈춘다. 남은 게임은 다음 요청 때 이어서 한다
      retryAfter = Date.now() + RETRY_MS;
      console.warn('게임 분위기 조회 실패 (10분 뒤 다시 시도):', err instanceof Error ? err.message : err);
      return;
    }
  }
}

/** 아직 분위기를 모르는 게임들을 대기열에 넣고, 백그라운드에서 SteamSpy로 하나씩(초당 1회 이하) 알아낸다 */
export function requestStyles(appIds: number[]): void {
  if (!GAME_STYLES_ENABLED) return;
  for (const id of appIds) if (queue.size < MAX_QUEUE) queue.add(id);
  if (working || queue.size === 0 || Date.now() < retryAfter) return;
  working = drain().finally(() => {
    working = null;
    // 조회하는 동안 새로 쌓인 게임이 있으면 이어서 처리한다
    if (queue.size > 0 && Date.now() >= retryAfter) requestStyles([]);
  });
}

/** 진행 중인 백그라운드 조회가 끝날 때까지 기다린다 (테스트용) */
export async function whenStylesIdle(): Promise<void> {
  while (working) await working;
}
