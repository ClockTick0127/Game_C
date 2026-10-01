import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as authApi from '../api/auth';
import { ApiError } from '../api/client';
import * as gamesApi from '../api/games';
import * as meApi from '../api/me';
import { makeGame, testUser } from '../test/fixtures';
import { renderApp } from '../test/render';
import { SearchPage } from './SearchPage';

vi.mock('../api/auth');
vi.mock('../api/games');
vi.mock('../api/me');

// 검색 결과에는 이미 출시된 게임도, 아직 출시일이 정해지지 않은 게임도 있다
const released = makeGame(1, {
  name: 'Elden Ring',
  released: '2022-02-25',
  platforms: ['PC', 'PlayStation 5'],
  genres: ['RPG'],
});
const undated = makeGame(2, { name: 'Hollow Knight: Silksong', released: '' });

const renderSearch = (route = '/search') => renderApp(<SearchPage />, { route, path: '/search' });

beforeEach(() => {
  // 검색은 로그인하지 않아도 쓸 수 있다
  vi.mocked(authApi.fetchMe).mockRejectedValue(new ApiError(401, '로그인이 필요합니다.'));
  vi.mocked(meApi.fetchFavorites).mockResolvedValue({ games: [] });
  vi.mocked(gamesApi.findGames).mockResolvedValue({ games: [released, undated] });
});

describe('SearchPage', () => {
  it('검색어가 없으면 아무것도 찾지 않는다', async () => {
    renderSearch();
    expect(await screen.findByRole('heading', { name: '게임 검색' })).toBeInTheDocument();
    expect(gamesApi.findGames).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '검색' })).toBeDisabled();
  });

  it('검색어를 입력해 찾으면 주소에 q가 남고 결과가 나온다', async () => {
    const user = userEvent.setup();
    renderSearch();
    await user.type(screen.getByRole('searchbox', { name: '게임 이름' }), '  엘든 링 ');
    await user.click(screen.getByRole('button', { name: '검색' }));

    expect(await screen.findByText(/검색 결과 2개/)).toBeInTheDocument();
    expect(vi.mocked(gamesApi.findGames).mock.calls[0]![0]).toBe('엘든 링');
    expect(screen.getByTestId('location')).toHaveTextContent('/search?q=%EC%97%98%EB%93%A0+%EB%A7%81');
    expect(screen.getByText('2022 · PC, PlayStation 5 · RPG')).toBeInTheDocument();
    expect(screen.getByText('출시일 미정 · PC · RPG')).toBeInTheDocument();
  });

  it('주소에 q가 있으면 바로 찾는다 (공유·뒤로 가기)', async () => {
    renderSearch('/search?q=elden');
    expect(await screen.findByRole('button', { name: /Elden Ring/ })).toBeInTheDocument();
    expect(vi.mocked(gamesApi.findGames).mock.calls[0]![0]).toBe('elden');
    expect(screen.getByRole('searchbox', { name: '게임 이름' })).toHaveValue('elden');
  });

  it('결과가 없으면 안내한다', async () => {
    vi.mocked(gamesApi.findGames).mockResolvedValue({ games: [] });
    renderSearch('/search?q=zzzz');
    expect(await screen.findByText(/해당하는 게임이 없어요/)).toBeInTheDocument();
  });

  it('실패하면 이유를 알리고 다시 시도할 수 있다', async () => {
    const user = userEvent.setup();
    vi.mocked(gamesApi.findGames).mockRejectedValueOnce(
      new ApiError(503, '샘플 모드에서는 게임을 검색할 수 없습니다.'),
    );
    renderSearch('/search?q=elden');
    expect(await screen.findByText(/샘플 모드에서는 게임을 검색할 수 없습니다/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(await screen.findByRole('button', { name: /Elden Ring/ })).toBeInTheDocument();
  });

  it('게임을 누르면 상세가 열리고, 로그인하지 않았으면 관심 게임 버튼을 누를 때 로그인으로 보낸다', async () => {
    const user = userEvent.setup();
    renderSearch('/search?q=elden');
    await user.click(await screen.findByRole('button', { name: /Elden Ring/ }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Elden Ring' })).toBeInTheDocument();
    expect(within(dialog).getByText(/2022년 2월 25일/)).toBeInTheDocument();
    expect(within(dialog).getByText(/로그인하면 관심 게임을 저장할 수 있어요/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: /관심 게임 추가/ }));
    expect(screen.getByTestId('location')).toHaveTextContent('/login');
  });

  it('로그인했으면 검색한 게임을 관심 게임에 담을 수 있고 결과에 ★가 붙는다', async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.fetchMe).mockResolvedValue({ user: testUser });
    vi.mocked(meApi.addFavorite).mockResolvedValue(undefined);
    renderSearch('/search?q=elden');
    await user.click(await screen.findByRole('button', { name: /Elden Ring/ }));
    await user.click(await within(screen.getByRole('dialog')).findByRole('button', { name: /관심 게임 추가/ }));

    expect(meApi.addFavorite).toHaveBeenCalledWith(released);
    expect(await within(screen.getByRole('dialog')).findByRole('button', { name: /★ 관심 게임/ })).toBeInTheDocument();
  });

  it('출시일이 정해지지 않은 게임은 "미정"으로 보여 주고 관심 게임에는 담을 수 없다', async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.fetchMe).mockResolvedValue({ user: testUser });
    renderSearch('/search?q=silksong');
    await user.click(await screen.findByRole('button', { name: /Silksong/ }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('출시일 미정')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /관심 게임 추가/ })).toBeDisabled();
    expect(within(dialog).getByText(/출시일이 정해지면/)).toBeInTheDocument();
  });
});
