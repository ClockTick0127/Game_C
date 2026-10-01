import { db } from '../db.ts';
import { HttpError } from '../utils/http.ts';
import { normalizeTitle } from '../utils/text.ts';
import { searchSteamAppId } from './steam.ts';
import { fetchOwnedGames, steamApiConfigured } from './steamProfile.ts';

/** 한 계정이 직접 추가할 수 있는 게임 수 */
export const MAX_CUSTOM_GAMES = 500;

/** RAWG에서 찾아 서재에 직접 추가한 게임. 서재에 그릴 때 외부 API를 다시 부르지 않도록 이름과 표지를 저장한다 */
export interface CustomGame {
  /** RAWG 게임 번호 */
  id: number;
  name: string;
  image: string | null;
}

/** 서재에 내려 주는 모양. Steam에도 있는 게임이면 Steam 공식 이미지를 쓰도록 앱 번호를 함께 준다 */
export interface CustomGameWithSteam extends CustomGame {
  steamAppId: number | null;
}

const selectAll = db.prepare(
  'SELECT game_id, name, image, steam_app_id, steam_checked FROM custom_library_games WHERE user_id = ? ORDER BY added_at',
);
const saveSteam = db.prepare(
  'UPDATE custom_library_games SET steam_app_id = ?, steam_checked = 1 WHERE user_id = ? AND game_id = ?',
);
const countStmt = db.prepare('SELECT COUNT(*) AS count FROM custom_library_games WHERE user_id = ?');
const existsStmt = db.prepare('SELECT 1 FROM custom_library_games WHERE user_id = ? AND game_id = ?');
const upsert = db.prepare(`
  INSERT INTO custom_library_games (user_id, game_id, name, image, added_at) VALUES (?, ?, ?, ?, ?)
  ON CONFLICT (user_id, game_id) DO UPDATE SET name = excluded.name, image = excluded.image
`);
const deleteStmt = db.prepare('DELETE FROM custom_library_games WHERE user_id = ? AND game_id = ?');

interface Row {
  game_id: number;
  name: string;
  image: string | null;
  steam_app_id: number | null;
  steam_checked: number;
}

/**
 * 직접 추가한 게임 목록. 아직 Steam 앱 번호를 찾아 보지 않은 게임(예전에 추가했거나 조회에 실패한 게임)은 이름으로 찾아 채운다.
 * Steam 조회는 부가 기능이라 실패해도 목록은 돌려주고, 못 찾으면 null로 두어 RAWG 이미지를 쓴다.
 */
export async function listCustomGames(userId: number): Promise<CustomGameWithSteam[]> {
  const rows = selectAll.all(userId) as unknown as Row[];
  return Promise.all(
    rows.map(async (r) => {
      let steamAppId = r.steam_app_id;
      if (!r.steam_checked) {
        steamAppId = await searchSteamAppId(r.name);
        saveSteam.run(steamAppId, userId, r.game_id);
      }
      return { id: r.game_id, name: r.name, image: r.image, steamAppId };
    }),
  );
}

/** Steam 이름의 ™·®·©는 NFKC 정규화에서 "TM" 같은 글자가 되므로 비교 전에 뗀다 */
const comparable = (name: string) => normalizeTitle(name.replace(/[™®©]/g, ''));

/**
 * Steam으로 이미 가진 게임이면 409. Steam 보유 게임은 서재에 자동으로 꽂히므로 같은 게임을 직접 추가하면 두 번 꽂힌다.
 * 이미 직접 추가해 둔 게임을 다시 저장하는 요청은 막지 않는다(예전에 추가한 게임을 갱신할 수 있어야 한다).
 * 보유 목록은 부가 확인이라, Steam을 연동하지 않았거나 목록을 가져오지 못하면(키 없음·Steam 장애·비공개) 막지 않는다.
 */
export async function assertNotOwnedOnSteam(userId: number, steamId: string | null, game: CustomGame): Promise<void> {
  if (!steamId || !steamApiConfigured() || existsStmt.get(userId, game.id)) return;
  let owned;
  try {
    owned = await fetchOwnedGames(steamId);
  } catch (err) {
    console.warn(`Steam 보유 게임 확인 실패 (사용자 ${userId}):`, err instanceof HttpError ? err.detail : err);
    return;
  }
  const target = comparable(game.name);
  if (target && owned.games.some((g) => comparable(g.name) === target)) {
    throw new HttpError(409, '이미 Steam으로 가지고 있는 게임이에요. 서재에 이미 꽂혀 있어요.');
  }
}

/** 이미 추가한 게임이면 저장된 정보만 갱신한다 */
export function addCustomGame(userId: number, game: CustomGame): void {
  if (!existsStmt.get(userId, game.id) && (countStmt.get(userId) as { count: number }).count >= MAX_CUSTOM_GAMES) {
    throw new HttpError(400, `직접 추가한 게임은 최대 ${MAX_CUSTOM_GAMES}개까지 둘 수 있습니다.`);
  }
  upsert.run(userId, game.id, game.name, game.image, new Date().toISOString());
}

export function removeCustomGame(userId: number, gameId: number): void {
  deleteStmt.run(userId, gameId);
}

/** 요청 본문 검증. 표지는 https 주소만 받는다 */
export function parseCustomGame(body: unknown): CustomGame {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  if (!Number.isSafeInteger(b.id) || (b.id as number) <= 0) throw new HttpError(400, '게임 ID가 올바르지 않습니다.');
  if (!name || name.length > 200) throw new HttpError(400, '게임 이름이 올바르지 않습니다.');
  const image = typeof b.image === 'string' && b.image.startsWith('https://') && b.image.length <= 500 ? b.image : null;
  return { id: b.id as number, name, image };
}
