import { HttpError } from '../utils/http.ts';

const OP_ENDPOINT = 'https://steamcommunity.com/openid/login';
const OPENID_NS = 'http://specs.openid.net/auth/2.0';
const IDENTIFIER_SELECT = 'http://specs.openid.net/auth/2.0/identifier_select';
const CLAIMED_ID = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;
/** Steam이 서명해 준 값에 반드시 들어 있어야 하는 항목. 빠져 있으면 서명이 이 값들을 보증하지 않는다 */
const REQUIRED_SIGNED = ['op_endpoint', 'claimed_id', 'identity', 'return_to', 'response_nonce', 'assoc_handle'];
/** 로그인 응답을 받아들이는 유효 시간. 넘은 응답은 재사용(replay)으로 본다 */
const MAX_AGE_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 8_000;

/** Steam 로그인 페이지 주소. 로그인이 끝나면 Steam이 returnTo로 되돌려 보낸다 (realm은 returnTo의 출처) */
export function buildAuthUrl(returnTo: string): string {
  const params = new URLSearchParams({
    'openid.ns': OPENID_NS,
    'openid.mode': 'checkid_setup',
    'openid.return_to': returnTo,
    'openid.realm': new URL(returnTo).origin,
    'openid.identity': IDENTIFIER_SELECT,
    'openid.claimed_id': IDENTIFIER_SELECT,
  });
  return `${OP_ENDPOINT}?${params}`;
}

function invalid(detail: string): HttpError {
  return new HttpError(400, 'Steam 로그인 응답이 올바르지 않습니다.', detail);
}

/**
 * Steam이 돌려보낸 로그인 응답을 검증하고 SteamID64를 돌려준다.
 * 응답 파라미터는 사용자의 브라우저를 거쳐 오므로 그대로 믿지 않고, 우리가 요청한 것과 맞는지 확인한 뒤
 * Steam 서버에 서명이 진짜인지 직접 되물어(check_authentication) 확정한다.
 */
export async function verifyAssertion(params: URLSearchParams, expectedReturnTo: string): Promise<string> {
  const get = (key: string) => params.get(`openid.${key}`);

  if (get('ns') !== OPENID_NS || get('mode') !== 'id_res') throw invalid('id_res 응답이 아님');
  if (get('op_endpoint') !== OP_ENDPOINT) throw invalid('op_endpoint 불일치');
  // 다른 사이트용으로 발급된 응답을 우리 콜백에 가져와 쓰는 것을 막는다
  if (get('return_to') !== expectedReturnTo) throw invalid('return_to 불일치');

  const match = CLAIMED_ID.exec(get('claimed_id') ?? '');
  if (!match || get('identity') !== get('claimed_id')) throw invalid('claimed_id 형식 오류');

  const signed = new Set((get('signed') ?? '').split(','));
  const missing = REQUIRED_SIGNED.filter((field) => !signed.has(field));
  if (missing.length > 0) throw invalid(`서명되지 않은 항목: ${missing.join(', ')}`);

  // 응답 nonce는 "2026-01-01T00:00:00Z" + 임의 문자열. 시각이 너무 오래됐으면 거부한다
  const issued = Date.parse((get('response_nonce') ?? '').slice(0, 20));
  if (!Number.isFinite(issued) || Math.abs(Date.now() - issued) > MAX_AGE_MS)
    throw invalid('nonce 시각이 유효하지 않음');

  const body = new URLSearchParams();
  for (const [key, value] of params) {
    if (key.startsWith('openid.')) body.append(key, value);
  }
  body.set('openid.mode', 'check_authentication');

  let text: string;
  try {
    const res = await fetch(OP_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    text = await res.text();
  } catch (err) {
    throw new HttpError(
      502,
      'Steam 서버와 통신하지 못했습니다. 잠시 후 다시 시도하세요.',
      `check_authentication 실패: ${err instanceof Error ? err.message : err}`,
    );
  }

  if (!/^is_valid:true$/m.test(text)) throw invalid('Steam이 서명을 인정하지 않음');
  return match[1]!;
}
