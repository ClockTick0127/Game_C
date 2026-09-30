/** Steam 로그인 콜백이 주소의 ?steam= 으로 알려 주는 결과 코드를 안내 문구로 바꾼다 */
const MESSAGES: Record<string, { type: 'error' | 'success'; text: string }> = {
  linked: { type: 'success', text: 'Steam 계정을 연동했습니다.' },
  failed: { type: 'error', text: 'Steam 로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.' },
  unlinked: {
    type: 'error',
    text: '이 Steam 계정과 연결된 계정이 없습니다. 이메일로 로그인한 뒤 마이페이지에서 Steam을 연동해 주세요.',
  },
  taken: { type: 'error', text: '이미 다른 계정에 연동된 Steam 계정입니다.' },
};

export function steamResult(code: string | null): { type: 'error' | 'success'; text: string } | null {
  return (code && MESSAGES[code]) || null;
}

/**
 * Steam 로그인 시작 주소. 브라우저가 Steam 페이지로 이동해야 하므로 fetch가 아니라 링크(전체 이동)로 쓴다.
 * link는 로그인한 사용자가 자기 계정에 Steam을 연결할 때, login은 연결된 계정으로 로그인할 때 쓴다.
 */
export function steamAuthUrl(mode: 'login' | 'link', redirect = '/'): string {
  const params = new URLSearchParams({ mode });
  if (redirect !== '/') params.set('redirect', redirect);
  return `/api/auth/steam?${params}`;
}

/** 플레이 시간(분)을 "12.3시간" 형태로. 1시간 미만은 분 단위 */
export function formatPlaytime(minutes: number): string {
  if (minutes <= 0) return '플레이 기록 없음';
  return minutes < 60 ? `${minutes}분` : `${(minutes / 60).toFixed(1)}시간`;
}
