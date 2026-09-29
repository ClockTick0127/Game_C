export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** 로그인이 풀린 상태로 인증이 필요한 API를 불렀을 때 발생 — AuthProvider가 듣고 로그아웃 처리한다 */
export const UNAUTHORIZED_EVENT = 'auth:unauthorized';

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

/** 백엔드 API 호출. 실패하면 백엔드가 보낸 { error } 메시지를 담은 ApiError를 던진다. */
export async function request<T>(path: string, { method = 'GET', body, signal }: RequestOptions = {}): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    // /api/auth/* 의 401은 "비밀번호 틀림" 같은 정상 응답이므로 제외
    if (res.status === 401 && !path.startsWith('/api/auth/')) {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    // JSON이 아니면 백엔드에 닿지 못한 것 (서버가 꺼져 있는 경우 등)
    const data: { error?: string } | null = await res.json().catch(() => null);
    throw new ApiError(
      res.status,
      data?.error ?? `API 서버에 연결할 수 없습니다 (HTTP ${res.status}). 백엔드가 실행 중인지 확인하세요.`,
    );
  }

  return (res.status === 204 ? undefined : await res.json()) as T;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.';
}
