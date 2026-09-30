import express, { Router, type Request } from 'express';
import { clearSessionCookie, currentUser, requireAuth } from '../middleware/auth.ts';
import { getOrCreateCalendarToken, resetCalendarToken } from '../services/calendarFeed.ts';
import { gamesLimiter, sensitiveLimiter, steamDataLimiter } from '../middleware/rateLimit.ts';
import { addFavorite, listFavorites, removeFavorite } from '../services/favorites.ts';
import { addCustomGame, listCustomGames, parseCustomGame, removeCustomGame } from '../services/customLibrary.ts';
import { deleteGameLog, listGameLogs, parseGameLog, saveGameLog } from '../services/gameLog.ts';
import { getPersonas, requestStyles } from '../services/gameStyle.ts';
import { getLibraryOrder, parseLibraryOrder, saveLibraryOrder } from '../services/libraryOrder.ts';
import { searchGamesKorean } from '../services/koreanSearch.ts';
import { hasHangul } from '../services/translate.ts';
import { searchGames } from '../services/rawg.ts';
import { IS_SAMPLE_MODE } from '../services/releases.ts';
import { hashPassword, verifyPassword } from '../services/password.ts';
import { deleteOtherSessions } from '../services/sessions.ts';
import { fetchAchievements, fetchOwnedGames, fetchProfile, steamApiConfigured } from '../services/steamProfile.ts';
import { favoriteAppIds, fetchWishlist, importWishlistGames, parseAppIds } from '../services/steamWishlist.ts';
import {
  deleteUser,
  findUserRowById,
  setSteamId,
  updateNickname,
  updatePasswordHash,
  updatePreferences,
} from '../services/users.ts';
import { HttpError } from '../utils/http.ts';
import { parseGame, requireText, validateNickname, validatePassword, validatePreference } from '../utils/validate.ts';

/** 로그인한 사용자 본인의 정보를 다루는 API (마이페이지) */
export const meRouter = Router();
meRouter.use(requireAuth);

/** 현재 비밀번호 확인이 필요한 작업에서 사용. 틀려도 로그아웃된 것은 아니므로 401이 아닌 400을 쓴다. */
async function assertPassword(userId: number, password: unknown): Promise<void> {
  const input = requireText(password, '현재 비밀번호를 입력하세요.');
  if (!(await verifyPassword(input, findUserRowById(userId)?.password_hash))) {
    throw new HttpError(400, '현재 비밀번호가 올바르지 않습니다.');
  }
}

function parseGameId(value: string): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, '게임 ID가 올바르지 않습니다.');
  return id;
}

/** PATCH /api/me { nickname } */
meRouter.patch('/', (req, res) => {
  const user = currentUser(req);
  res.json({ user: updateNickname(user.id, validateNickname(req.body?.nickname)) });
});

/** PUT /api/me/preferences { platform, genre } — 선호 플랫폼·장르 (null이면 정하지 않음). 캘린더 기본 필터가 된다 */
meRouter.put('/preferences', (req, res) => {
  const platform = validatePreference(req.body?.platform, '플랫폼');
  const genre = validatePreference(req.body?.genre, '장르');
  res.json({ user: updatePreferences(currentUser(req).id, platform, genre) });
});

/** PUT /api/me/password { currentPassword, newPassword } — 다른 기기의 로그인은 해제된다 */
meRouter.put('/password', sensitiveLimiter, async (req, res) => {
  const user = currentUser(req);
  await assertPassword(user.id, req.body?.currentPassword);
  const newPassword = validatePassword(req.body?.newPassword, '새 비밀번호');

  updatePasswordHash(user.id, await hashPassword(newPassword));
  deleteOtherSessions(user.id, req.sessionToken!);
  res.status(204).end();
});

/** DELETE /api/me { password } — 회원 탈퇴 */
meRouter.delete('/', sensitiveLimiter, async (req, res) => {
  const user = currentUser(req);
  await assertPassword(user.id, req.body?.password);

  deleteUser(user.id);
  clearSessionCookie(res);
  res.status(204).end();
});

/** GET /api/me/favorites — 출시일 순 관심 게임 목록 */
meRouter.get('/favorites', (req, res) => {
  res.json({ games: listFavorites(currentUser(req).id) });
});

/** PUT /api/me/favorites/:gameId (본문: Game) — 여러 번 호출해도 결과가 같다 */
meRouter.put('/favorites/:gameId', (req, res) => {
  const gameId = parseGameId(req.params.gameId);
  const game = parseGame(req.body);
  if (game.id !== gameId) throw new HttpError(400, '게임 ID가 일치하지 않습니다.');

  addFavorite(currentUser(req).id, game);
  res.status(204).end();
});

/** DELETE /api/me/favorites/:gameId */
meRouter.delete('/favorites/:gameId', (req, res) => {
  removeFavorite(currentUser(req).id, parseGameId(req.params.gameId));
  res.status(204).end();
});

/** GET /api/me/calendar-token — 캘린더 구독 주소에 들어가는 토큰. 처음 요청하면 만든다. */
meRouter.get('/calendar-token', (req, res) => {
  res.json({ token: getOrCreateCalendarToken(currentUser(req).id) });
});

/** POST /api/me/calendar-token — 토큰을 새로 만든다. 유출된 옛 구독 주소는 더 이상 동작하지 않는다. */
meRouter.post('/calendar-token', (req, res) => {
  res.json({ token: resetCalendarToken(currentUser(req).id) });
});

// --- Steam 연동 ---

/** 연동된 SteamID를 돌려준다. 연동하지 않았으면 404 */
function linkedSteamId(req: Request): string {
  const steamId = currentUser(req).steamId;
  if (!steamId) throw new HttpError(404, '연동된 Steam 계정이 없습니다.');
  return steamId;
}

/** GET /api/me/steam — 연동 상태. configured가 false면 서버에 Steam API 키가 없어 게임·업적 조회는 못 한다 */
meRouter.get('/steam', async (req, res) => {
  const { steamId } = currentUser(req);
  res.json({
    configured: steamApiConfigured(),
    linked: steamId !== null,
    steamId,
    profile: steamId && steamApiConfigured() ? await fetchProfile(steamId) : null,
  });
});

/** DELETE /api/me/steam — 연동 해제. 이 계정은 비밀번호로 계속 로그인할 수 있다 */
meRouter.delete('/steam', (req, res) => {
  res.json({ user: setSteamId(currentUser(req).id, null) });
});

/** GET /api/me/steam/games — 보유 게임 (플레이 시간이 긴 순) */
meRouter.get('/steam/games', steamDataLimiter, async (req, res) => {
  const owned = await fetchOwnedGames(linkedSteamId(req));
  // 책등 폰트를 고를 게임 분위기. 아직 모르는 게임은 백그라운드에서 알아내고, 그동안은 null로 내려간다
  const ids = owned.games.map((g) => g.appId);
  const personas = getPersonas(ids);
  requestStyles(ids.filter((id) => !personas.has(id)));
  res.json({
    ...owned,
    games: owned.games.map((g) => ({ ...g, persona: personas.get(g.appId) ?? null })),
    stylesPending: ids.length - personas.size,
  });
});

/** GET /api/me/steam/games/:appId/achievements — 게임 하나의 업적 달성 현황 */
meRouter.get('/steam/games/:appId/achievements', steamDataLimiter, async (req, res) => {
  const appId = Number(req.params.appId);
  if (!Number.isSafeInteger(appId) || appId <= 0) throw new HttpError(400, '게임 ID가 올바르지 않습니다.');
  res.json(await fetchAchievements(linkedSteamId(req), appId));
});

// --- Steam 위시리스트 → 관심 게임 ---

/** GET /api/me/steam/wishlist — 위시리스트 게임 목록. 이미 관심 게임인 것은 favorite: true (Steam API 키 불필요) */
meRouter.get('/steam/wishlist', steamDataLimiter, async (req, res) => {
  const user = currentUser(req);
  const wishlist = await fetchWishlist(linkedSteamId(req));
  const favorites = favoriteAppIds(
    user.id,
    wishlist.items.map((item) => item.appId),
  );
  res.json({
    ...wishlist,
    items: wishlist.items.map((item) => ({ ...item, favorite: favorites.has(item.appId) })),
  });
});

/** POST /api/me/steam/wishlist/import { appIds: number[] } — 위시리스트 게임을 관심 게임에 추가 (한 번에 최대 10개) */
meRouter.post('/steam/wishlist/import', gamesLimiter, async (req, res) => {
  const user = currentUser(req);
  const steamId = linkedSteamId(req);
  const appIds = parseAppIds(req.body?.appIds);
  if (IS_SAMPLE_MODE) throw new HttpError(503, '샘플 모드에서는 위시리스트를 가져올 수 없습니다.');
  res.json({ results: await importWishlistGames(user.id, steamId, appIds) });
});

// --- 내 서재 배치 ---

/** GET /api/me/library-order — 저장한 배치(앱 번호 목록). 저장한 적이 없으면 빈 배열 */
meRouter.get('/library-order', (req, res) => {
  res.json({ order: getLibraryOrder(currentUser(req).id) });
});

/** PUT /api/me/library-order { order: number[] } — 배치를 통째로 저장한다 */
meRouter.put('/library-order', express.json({ limit: '300kb' }), (req, res) => {
  saveLibraryOrder(currentUser(req).id, parseLibraryOrder(req.body?.order));
  res.status(204).end();
});

// --- 내 서재에 직접 추가한 게임 ---

/** GET /api/me/library-games — 직접 추가한 게임 (추가한 순서) */
meRouter.get('/library-games', async (req, res) => {
  res.json({ games: await listCustomGames(currentUser(req).id) });
});

/** GET /api/me/library-games/search?q=... — 추가할 게임 검색 (RAWG) */
meRouter.get('/library-games/search', gamesLimiter, async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!q || q.length > 100) throw new HttpError(400, '검색어를 1~100자로 입력하세요.');
  if (IS_SAMPLE_MODE) throw new HttpError(503, '샘플 모드에서는 게임을 검색할 수 없습니다.');
  res.json({ games: hasHangul(q) ? await searchGamesKorean(q) : await searchGames(q) });
});

/** PUT /api/me/library-games/:gameId { id, name, image } — 여러 번 호출해도 결과가 같다 */
meRouter.put('/library-games/:gameId', (req, res) => {
  const game = parseCustomGame(req.body);
  if (game.id !== parseGameId(req.params.gameId)) throw new HttpError(400, '게임 ID가 일치하지 않습니다.');
  addCustomGame(currentUser(req).id, game);
  res.status(204).end();
});

/** DELETE /api/me/library-games/:gameId */
meRouter.delete('/library-games/:gameId', (req, res) => {
  removeCustomGame(currentUser(req).id, parseGameId(req.params.gameId));
  res.status(204).end();
});

// --- 게임별 플레이 상태·별점·메모 (gameId는 서재 번호) ---

/** GET /api/me/game-logs — 기록을 남긴 모든 게임 */
meRouter.get('/game-logs', (req, res) => {
  res.json({ logs: listGameLogs(currentUser(req).id) });
});

/** PUT /api/me/game-logs/:gameId { status, rating, note } — 통째로 덮어쓴다. 모두 비우면 기록이 지워진다 */
meRouter.put('/game-logs/:gameId', (req, res) => {
  const gameId = parseGameId(req.params.gameId);
  saveGameLog(currentUser(req).id, gameId, parseGameLog(req.body));
  res.status(204).end();
});

/** DELETE /api/me/game-logs/:gameId */
meRouter.delete('/game-logs/:gameId', (req, res) => {
  deleteGameLog(currentUser(req).id, parseGameId(req.params.gameId));
  res.status(204).end();
});
