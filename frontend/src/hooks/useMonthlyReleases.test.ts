import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as gamesApi from '../api/games';
import { makeGame } from '../test/fixtures';
import { useMonthlyReleases } from './useMonthlyReleases';

vi.mock('../api/games');

// 훅의 캐시는 모듈 안에 있어 테스트끼리 공유되므로 테스트마다 다른 달을 쓴다.
beforeEach(() => {
  vi.mocked(gamesApi.fetchReleases).mockReset();
});

describe('useMonthlyReleases', () => {
  it('월 범위를 요청하고 날짜별로 묶는다', async () => {
    vi.mocked(gamesApi.fetchReleases).mockResolvedValue({
      games: [
        makeGame(1, { released: '2031-01-05' }),
        makeGame(2, { released: '2031-01-05' }),
        makeGame(3, { released: '2031-01-20' }),
      ],
      sample: false,
    });
    const { result } = renderHook(() => useMonthlyReleases(2031, 0)); // month는 0부터

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(gamesApi.fetchReleases).toHaveBeenCalledWith('2031-01-01', '2031-01-31', expect.any(AbortSignal));
    expect(result.current.totalCount).toBe(3);
    expect(result.current.gamesByDate.get('2031-01-05')).toHaveLength(2);
    expect(result.current.partial).toBe(false);
  });

  it('완전한 결과는 기억해서 같은 달을 다시 열어도 요청하지 않는다', async () => {
    vi.mocked(gamesApi.fetchReleases).mockResolvedValue({
      games: [makeGame(1, { released: '2031-02-05' })],
      sample: false,
    });

    const first = renderHook(() => useMonthlyReleases(2031, 1));
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    first.unmount();

    const second = renderHook(() => useMonthlyReleases(2031, 1));
    await waitFor(() => expect(second.result.current.loading).toBe(false));
    expect(gamesApi.fetchReleases).toHaveBeenCalledOnce();
  });

  it('일부만 받은 결과는 partial로 알리고 기억하지 않아 다시 열면 새로 불러온다', async () => {
    vi.mocked(gamesApi.fetchReleases).mockResolvedValueOnce({
      games: [makeGame(1, { released: '2031-03-05' })],
      sample: false,
      partial: true,
    });
    vi.mocked(gamesApi.fetchReleases).mockResolvedValueOnce({
      games: [makeGame(1, { released: '2031-03-05' }), makeGame(2, { released: '2031-03-06' })],
      sample: false,
    });

    const first = renderHook(() => useMonthlyReleases(2031, 2));
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    expect(first.result.current.partial).toBe(true);
    expect(first.result.current.totalCount).toBe(1);
    first.unmount();

    const second = renderHook(() => useMonthlyReleases(2031, 2));
    await waitFor(() => expect(second.result.current.totalCount).toBe(2));
    expect(second.result.current.partial).toBe(false);
    expect(gamesApi.fetchReleases).toHaveBeenCalledTimes(2);
  });

  it('reload는 기억해 둔 결과를 버리고 다시 불러온다', async () => {
    vi.mocked(gamesApi.fetchReleases)
      .mockResolvedValueOnce({ games: [makeGame(1, { released: '2031-04-05' })], sample: false })
      .mockResolvedValueOnce({
        games: [makeGame(1, { released: '2031-04-05' }), makeGame(2, { released: '2031-04-06' })],
        sample: false,
      });

    const { result } = renderHook(() => useMonthlyReleases(2031, 3));
    await waitFor(() => expect(result.current.totalCount).toBe(1));

    act(() => result.current.reload());
    await waitFor(() => expect(result.current.totalCount).toBe(2));
    expect(gamesApi.fetchReleases).toHaveBeenCalledTimes(2);
  });

  it('요청이 실패하면 오류 메시지를 담는다 (실패는 기억하지 않는다)', async () => {
    vi.mocked(gamesApi.fetchReleases).mockRejectedValueOnce(new Error('서버에 연결할 수 없습니다.'));
    const { result } = renderHook(() => useMonthlyReleases(2031, 4));

    await waitFor(() => expect(result.current.error).toBe('서버에 연결할 수 없습니다.'));
    expect(result.current.totalCount).toBe(0);
  });
});
