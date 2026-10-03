import type { Game, Persona } from '../types';
import { PERSONA_LABELS } from './libraryStats';

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
