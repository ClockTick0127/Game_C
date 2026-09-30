import { db } from '../db.ts';
import { HttpError } from '../utils/http.ts';

/** 한 계정이 저장할 수 있는 게임 수. Steam 서재는 보통 수백~수천 개다 */
export const MAX_LIBRARY_ORDER = 20_000;

const select = db.prepare('SELECT order_json FROM library_orders WHERE user_id = ?');
const upsert = db.prepare(`
  INSERT INTO library_orders (user_id, order_json, updated_at) VALUES (?, ?, ?)
  ON CONFLICT (user_id) DO UPDATE SET order_json = excluded.order_json, updated_at = excluded.updated_at
`);

/** 저장한 서재 배치(앱 번호 목록, 앞에 있을수록 먼저 꽂힌다). 저장한 적이 없으면 빈 배열 */
export function getLibraryOrder(userId: number): number[] {
  const row = select.get(userId) as { order_json: string } | undefined;
  return row ? (JSON.parse(row.order_json) as number[]) : [];
}

/** 요청 본문의 배치 목록을 검증한다: 중복 없는 양의 정수 배열 */
export function parseLibraryOrder(value: unknown): number[] {
  if (!Array.isArray(value)) throw new HttpError(400, '배치 목록이 올바르지 않습니다.');
  if (value.length > MAX_LIBRARY_ORDER) {
    throw new HttpError(400, `배치는 최대 ${MAX_LIBRARY_ORDER.toLocaleString('ko-KR')}개까지 저장할 수 있습니다.`);
  }
  const seen = new Set<number>();
  for (const id of value) {
    if (!Number.isSafeInteger(id) || (id as number) <= 0 || seen.has(id as number)) {
      throw new HttpError(400, '배치 목록에 올바르지 않거나 중복된 게임이 있습니다.');
    }
    seen.add(id as number);
  }
  return value as number[];
}

export function saveLibraryOrder(userId: number, order: number[]): void {
  upsert.run(userId, JSON.stringify(order), new Date().toISOString());
}
