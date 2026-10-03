import type { Game, Persona, Taste } from '../types';
import { PERSONA_LABELS } from './libraryStats';

/** 이 값(0~1) 이상 즐겨 하는 분위기만 "취향"으로 본다. 가장 좋아하는 분위기가 1이다 */
export const TASTE_THRESHOLD = 0.5;

/** 취향으로 삼는 분위기의 최대 개수. 이것저것 고르게 해서 거의 모든 분위기가 문턱을 넘어도 강조가 넘치지 않게 한다 */
export const MAX_LIKED_PERSONAS = 3;

/** 즐겨 하는 분위기들(좋아하는 순). 문턱 이상이고 상위 MAX_LIKED_PERSONAS개까지 */
export function likedPersonas(affinity: Taste['affinity']): Persona[] {
  return (Object.entries(affinity) as [Persona, number][])
    .filter(([persona, value]) => persona !== 'default' && value >= TASTE_THRESHOLD)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_LIKED_PERSONAS)
    .map(([persona]) => persona);
}

/**
 * 취향에 맞는 출시 예정 게임이면 그 분위기를 돌려준다. 이미 출시된 게임(오늘 이전)과 출시일 미정, 분위기를 모르는 게임은 null이다.
 * todayKey는 YYYY-MM-DD다 (오늘 출시도 "예정"으로 본다).
 */
export function tasteMatch(game: Game, liked: ReadonlySet<Persona>, todayKey: string): Persona | null {
  if (!game.persona || game.persona === 'default' || !liked.has(game.persona)) return null;
  if (!game.released || game.released < todayKey) return null;
  return game.persona;
}

/** "액션·슈팅 게임을 즐겨 하시네요" 같은 이유 문장 */
export function tasteReason(persona: Persona): string {
  return `${PERSONA_LABELS[persona]} 게임을 즐겨 하시네요.`;
}
