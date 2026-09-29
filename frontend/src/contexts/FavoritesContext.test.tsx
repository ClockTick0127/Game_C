import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as meApi from '../api/me';
import { deferred, makeGame, testUser } from '../test/fixtures';
import { FavoritesProvider, useFavorites } from './FavoritesContext';

vi.mock('../api/me');
vi.mock('./AuthContext', () => ({ useAuth: () => ({ user: testUser }) }));

const wrapper = ({ children }: { children: ReactNode }) => <FavoritesProvider>{children}</FavoritesProvider>;

const gameA = makeGame(1);
const gameB = makeGame(2);

/** 목록을 불러온 상태의 훅을 만든다 */
async function renderLoaded(initial = [gameA, gameB]) {
  vi.mocked(meApi.fetchFavorites).mockResolvedValue({ games: initial });
  const hook = renderHook(() => useFavorites(), { wrapper });
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
}

const ids = (favorites: { id: number }[]) => favorites.map((g) => g.id);

beforeEach(() => {
  vi.mocked(meApi.addFavorite).mockResolvedValue(undefined);
  vi.mocked(meApi.removeFavorite).mockResolvedValue(undefined);
});

describe('목록 불러오기', () => {
  it('로그인한 사용자의 관심 게임을 불러온다', async () => {
    const { result } = await renderLoaded();
    expect(ids(result.current.favorites)).toEqual([1, 2]);
    expect(result.current.error).toBeNull();
    expect(result.current.isFavorite(1)).toBe(true);
    expect(result.current.isFavorite(99)).toBe(false);
  });

  it('불러오기에 실패하면 빈 목록이 아니라 오류로 알리고, reload로 다시 시도한다', async () => {
    vi.mocked(meApi.fetchFavorites).mockRejectedValueOnce(new Error('서버 오류'));
    const hook = renderHook(() => useFavorites(), { wrapper });
    await waitFor(() => expect(hook.result.current.error).toBe('서버 오류'));
    expect(hook.result.current.favorites).toEqual([]);

    vi.mocked(meApi.fetchFavorites).mockResolvedValueOnce({ games: [gameA] });
    act(() => hook.result.current.reload());
    await waitFor(() => expect(ids(hook.result.current.favorites)).toEqual([1]));
    expect(hook.result.current.error).toBeNull();
  });
});

describe('toggle', () => {
  it('추가하면 응답을 기다리지 않고 바로 반영하고, 출시일 순으로 정렬한다', async () => {
    const { result } = await renderLoaded([gameB]);
    const pending = deferred();
    vi.mocked(meApi.addFavorite).mockReturnValue(pending.promise);

    let done!: Promise<void>;
    act(() => {
      done = result.current.toggle(gameA);
    });
    expect(ids(result.current.favorites)).toEqual([1, 2]); // 서버 응답 전인데도 보인다

    pending.resolve();
    await act(() => done);
    expect(meApi.addFavorite).toHaveBeenCalledWith(gameA);
  });

  it('삭제한다', async () => {
    const { result } = await renderLoaded();
    await act(() => result.current.toggle(gameA));
    expect(ids(result.current.favorites)).toEqual([2]);
    expect(meApi.removeFavorite).toHaveBeenCalledWith(1);
  });

  it('실패하면 그 게임의 변경을 되돌리고 오류를 던진다', async () => {
    const { result } = await renderLoaded();
    vi.mocked(meApi.removeFavorite).mockRejectedValue(new Error('삭제 실패'));

    await act(async () => {
      await expect(result.current.toggle(gameA)).rejects.toThrow('삭제 실패');
    });
    expect(ids(result.current.favorites)).toEqual([1, 2]);
  });

  it('한 게임의 요청이 실패해도 그사이 다른 게임에 한 변경은 되돌리지 않는다', async () => {
    const { result } = await renderLoaded();
    const slowFailure = deferred();
    vi.mocked(meApi.removeFavorite).mockImplementation((id) => (id === 1 ? slowFailure.promise : Promise.resolve()));

    let removeA!: Promise<void>;
    act(() => {
      removeA = result.current.toggle(gameA).catch(() => {});
    });
    await act(() => result.current.toggle(gameB)); // A가 진행 중일 때 B를 삭제 (성공)
    expect(ids(result.current.favorites)).toEqual([]);

    slowFailure.reject(new Error('A 삭제 실패'));
    await act(() => removeA);

    // A만 돌아오고, 서버에서 이미 지워진 B는 되살아나지 않는다
    expect(ids(result.current.favorites)).toEqual([1]);
  });

  it('같은 게임의 요청은 누른 순서대로 하나씩 보낸다', async () => {
    const { result } = await renderLoaded();
    const firstRemove = deferred();
    vi.mocked(meApi.removeFavorite).mockReturnValue(firstRemove.promise);

    let remove!: Promise<void>;
    let addBack!: Promise<void>;
    act(() => {
      remove = result.current.toggle(gameA);
    });
    act(() => {
      addBack = result.current.toggle(gameA); // 삭제가 끝나기 전에 다시 눌러 추가
    });
    expect(meApi.addFavorite).not.toHaveBeenCalled(); // 삭제 응답 전에는 추가 요청을 보내지 않는다

    firstRemove.resolve();
    await act(() => Promise.all([remove, addBack]));
    expect(meApi.addFavorite).toHaveBeenCalledOnce();
    const removeOrder = vi.mocked(meApi.removeFavorite).mock.invocationCallOrder[0]!;
    const addOrder = vi.mocked(meApi.addFavorite).mock.invocationCallOrder[0]!;
    expect(removeOrder).toBeLessThan(addOrder);
    expect(ids(result.current.favorites)).toEqual([1, 2]);
  });
});
