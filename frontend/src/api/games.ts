import type { ReleasesResponse } from '../types';

/** start ~ end(YYYY-MM-DD, 양 끝 포함) 기간에 출시되는 게임을 백엔드에서 가져온다. */
export async function fetchReleases(start: string, end: string, signal?: AbortSignal): Promise<ReleasesResponse> {
  const res = await fetch(`/api/games?${new URLSearchParams({ start, end })}`, { signal });

  if (!res.ok) {
    // 백엔드는 { error: string } 형태로 실패 이유를 보낸다. JSON이 아니면 백엔드에 닿지 못한 것.
    const body: { error?: string } | null = await res.json().catch(() => null);
    throw new Error(body?.error ?? `API 서버에 연결할 수 없습니다 (HTTP ${res.status}). 백엔드가 실행 중인지 확인하세요.`);
  }
  return res.json();
}
