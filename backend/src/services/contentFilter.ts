/**
 * 성인(선정적) 게임 판별. RAWG API에는 이를 걸러내는 파라미터가 없어 태그와 ESRB 등급으로 판단한다.
 */

/** 붙어 있으면 무조건 성인 게임으로 보는 태그 */
const ADULT_TAGS = new Set([
  'hentai',
  'khentai',
  'nsfw',
  'adult',
  'adult-content',
  'erotic',
  'eroge',
  'porn',
  'pornographic',
  'uncensored',
]);

/**
 * 선정성 태그. 사이버펑크 2077·위쳐 3처럼 정식 심의(ESRB)를 받은 일반 게임에도 붙기 때문에,
 * 심의 등급이 없는 게임에 붙었을 때만 성인 게임으로 본다.
 */
const SEXUAL_TAGS = new Set(['sexual-content', 'nudity']);

interface RatedGame {
  tags?: { slug: string }[] | null;
  esrb_rating?: { slug: string } | null;
}

export function isAdultGame(game: RatedGame): boolean {
  const esrb = game.esrb_rating?.slug;
  if (esrb === 'adults-only') return true;

  const tags = game.tags?.map((t) => t.slug) ?? [];
  if (tags.some((t) => ADULT_TAGS.has(t))) return true;
  return !esrb && tags.some((t) => SEXUAL_TAGS.has(t));
}
