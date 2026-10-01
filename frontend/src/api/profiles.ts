import type { Showcase } from '../types';
import { request } from './client';

/** 공개한 사용자의 진열장. 로그인 없이 부를 수 있고, 공개하지 않았거나 없는 닉네임이면 404 */
export function fetchShowcase(nickname: string, signal?: AbortSignal): Promise<Showcase> {
  return request(`/api/profiles/${encodeURIComponent(nickname)}/showcase`, { signal });
}
