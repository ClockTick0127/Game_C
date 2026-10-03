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
  vi.mocked(meApi.fetchCustomGames).mockResolvedValue({ games: [] });
  vi.mocked(meApi.fetchSteamGames).mockResolvedValue({ private: false, games: [] });
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

  describe('내 서재에 추가', () => {
    const openElden = async (user: ReturnType<typeof userEvent.setup>) => {
      await user.click(await screen.findByRole('button', { name: /Elden Ring/ }));
      return screen.getByRole('dialog');
    };

    it('로그인하지 않았으면 버튼을 누를 때 로그인으로 보낸다', async () => {
      const user = userEvent.setup();
      renderSearch('/search?q=elden');
      const dialog = await openElden(user);
      await user.click(within(dialog).getByRole('button', { name: /내 서재에 추가/ }));
      expect(screen.getByTestId('location')).toHaveTextContent('/login');
      expect(meApi.addCustomGame).not.toHaveBeenCalled();
    });

    it('누르면 이름과 표지를 서재에 저장하고 "추가됨"으로 바뀐다', async () => {
      const user = userEvent.setup();
      vi.mocked(authApi.fetchMe).mockResolvedValue({ user: { ...testUser, steamId: '76561198000000001' } });
      vi.mocked(meApi.addCustomGame).mockResolvedValue(undefined);
      renderSearch('/search?q=elden');
      const dialog = await openElden(user);
      await user.click(await within(dialog).findByRole('button', { name: /내 서재에 추가/ }));

      expect(meApi.addCustomGame).toHaveBeenCalledWith({ id: 1, name: 'Elden Ring', image: null });
      expect(await within(dialog).findByRole('button', { name: /서재에 추가됨/ })).toBeDisabled();
      expect(within(dialog).queryByText(/Steam 연동 후/)).not.toBeInTheDocument();
    });

    it('이미 서재에 있는 게임은 처음부터 "추가됨"이다', async () => {
      const user = userEvent.setup();
      vi.mocked(authApi.fetchMe).mockResolvedValue({ user: testUser });
      vi.mocked(meApi.fetchCustomGames).mockResolvedValue({ games: [{ id: 1, name: 'Elden Ring', image: null }] });
      renderSearch('/search?q=elden');
      const dialog = await openElden(user);
      expect(await within(dialog).findByRole('button', { name: /서재에 추가됨/ })).toBeDisabled();
    });

    it('Steam으로 이미 가진 게임은 표기가 조금 달라도 추가할 수 없다', async () => {
      const user = userEvent.setup();
      vi.mocked(authApi.fetchMe).mockResolvedValue({ user: { ...testUser, steamId: '76561198000000001' } });
      vi.mocked(meApi.fetchSteamGames).mockResolvedValue({
        private: false,
        games: [
          {
            appId: 5,
            name: 'ELDEN RING™',
            playtimeMinutes: 60,
            lastPlayedAt: null,
            image: '',
            iconUrl: null,
            persona: null,
          },
        ],
      });
      renderSearch('/search?q=elden');
      const dialog = await openElden(user);

      const button = await within(dialog).findByRole('button', { name: /Steam 보유 게임/ });
      expect(button).toBeDisabled();
      expect(within(dialog).getByText(/Steam으로 이미 가진 게임/)).toBeInTheDocument();
      expect(meApi.addCustomGame).not.toHaveBeenCalled();
    });

    it('Steam을 연동했어도 보유 목록을 못 불러오면 막지 않는다', async () => {
      const user = userEvent.setup();
      vi.mocked(authApi.fetchMe).mockResolvedValue({ user: { ...testUser, steamId: '76561198000000001' } });
      vi.mocked(meApi.fetchSteamGames).mockRejectedValue(new ApiError(502, 'Steam 오류'));
      renderSearch('/search?q=elden');
      const dialog = await openElden(user);
      expect(await within(dialog).findByRole('button', { name: /내 서재에 추가/ })).toBeEnabled();
    });

    it('Steam을 연동하지 않은 사람은 Steam 보유 목록을 조회하지 않는다', async () => {
      const user = userEvent.setup();
      vi.mocked(authApi.fetchMe).mockResolvedValue({ user: testUser });
      renderSearch('/search?q=elden');
      const dialog = await openElden(user);
      await within(dialog).findByRole('button', { name: /내 서재에 추가/ });
      expect(meApi.fetchSteamGames).not.toHaveBeenCalled();
    });

    it('Steam을 연동하지 않았으면 서재를 보려면 연동이 필요하다고 알린다', async () => {
      const user = userEvent.setup();
      vi.mocked(authApi.fetchMe).mockResolvedValue({ user: testUser });
      vi.mocked(meApi.addCustomGame).mockResolvedValue(undefined);
      renderSearch('/search?q=elden');
      const dialog = await openElden(user);
      await user.click(await within(dialog).findByRole('button', { name: /내 서재에 추가/ }));
      expect(await within(dialog).findByText(/Steam 연동 후 볼 수 있어요/)).toBeInTheDocument();
    });

    it('저장에 실패하면 이유를 알리고 다시 누를 수 있다', async () => {
      const user = userEvent.setup();
      vi.mocked(authApi.fetchMe).mockResolvedValue({ user: testUser });
      vi.mocked(meApi.addCustomGame).mockRejectedValue(
        new ApiError(400, '직접 추가한 게임은 최대 500개까지 둘 수 있습니다.'),
      );
      renderSearch('/search?q=elden');
      const dialog = await openElden(user);
      await user.click(await within(dialog).findByRole('button', { name: /내 서재에 추가/ }));

      expect(await within(dialog).findByText(/최대 500개/)).toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: /내 서재에 추가/ })).toBeEnabled();
    });
  });
});

describe('SearchPage — 첫 화면 추천', () => {
  const upcoming = makeGame(11, {
    name: 'Starfall',
    released: '2099-03-05',
    persona: 'scifi',
    platforms: ['PC', 'PlayStation 5'],
  });
  const other = makeGame(12, { name: 'Cozy Farm', released: '2099-04-01', persona: 'cute' });
  const personalized = { personalized: true, liked: ['scifi' as const, 'fantasy' as const], games: [upcoming] };

  it('검색어가 없으면 추천을 불러와 서재 취향 기준이라고 밝히고, 맞는 이유를 붙인다', async () => {
    vi.mocked(authApi.fetchMe).mockResolvedValue({ user: { ...testUser, steamId: '76561198000000001' } });
    vi.mocked(gamesApi.fetchSuggestions).mockResolvedValue(personalized);
    renderSearch();

    const section = await screen.findByRole('region', { name: '추천 게임' });
    expect(within(section).getByRole('heading', { name: '내 서재 취향에 맞는 신작·예정작' })).toBeInTheDocument();
    expect(within(section).getByText(/SF · 판타지 분위기를 기준으로 골랐어요/)).toBeInTheDocument();
    expect(within(section).getByText('3월 5일 출시 예정 · PC, PlayStation 5')).toBeInTheDocument();
    expect(within(section).getByText('✦ SF 게임을 즐겨 하시네요.')).toBeInTheDocument();
    expect(gamesApi.findGames).not.toHaveBeenCalled();
  });

  it('추천 게임을 누르면 검색 결과와 같은 상세가 열린다', async () => {
    const user = userEvent.setup();
    vi.mocked(gamesApi.fetchSuggestions).mockResolvedValue(personalized);
    renderSearch();
    await user.click(await screen.findByRole('button', { name: /Starfall/ }));
    expect(within(screen.getByRole('dialog')).getByRole('heading', { name: 'Starfall' })).toBeInTheDocument();
  });

  it('취향을 모르면 인기 있는 예정작을 보여 주고, 로그인하면 취향 추천을 받을 수 있다고 안내한다', async () => {
    vi.mocked(gamesApi.fetchSuggestions).mockResolvedValue({ personalized: false, liked: [], games: [other] });
    renderSearch();

    const section = await screen.findByRole('region', { name: '추천 게임' });
    expect(within(section).getByRole('heading', { name: '곧 출시되는 인기 게임' })).toBeInTheDocument();
    expect(within(section).getByRole('link', { name: '로그인' })).toBeInTheDocument();
    expect(within(section).queryByText(/즐겨 하시네요/)).not.toBeInTheDocument();
  });

  it('로그인했지만 Steam을 연동하지 않았으면 연동을 안내한다', async () => {
    vi.mocked(authApi.fetchMe).mockResolvedValue({ user: testUser });
    vi.mocked(gamesApi.fetchSuggestions).mockResolvedValue({ personalized: false, liked: [], games: [other] });
    renderSearch();
    expect(await screen.findByRole('link', { name: 'Steam을 연동' })).toBeInTheDocument();
  });

  it('추천이 없거나 불러오지 못해도 검색은 쓸 수 있고, 실패하면 다시 시도할 수 있다', async () => {
    const user = userEvent.setup();
    vi.mocked(gamesApi.fetchSuggestions).mockRejectedValueOnce(new ApiError(502, 'RAWG 오류'));
    vi.mocked(gamesApi.fetchSuggestions).mockResolvedValue({ personalized: false, liked: [], games: [other] });
    renderSearch();
    expect(await screen.findByText(/추천 게임을 불러오지 못했어요/)).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: '게임 이름' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(await screen.findByRole('region', { name: '추천 게임' })).toBeInTheDocument();
  });

  it('검색어가 있으면 추천은 사라지고 검색 결과가 나온다', async () => {
    vi.mocked(gamesApi.fetchSuggestions).mockResolvedValue(personalized);
    renderSearch('/search?q=elden');
    expect(await screen.findByRole('button', { name: /Elden Ring/ })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '추천 게임' })).not.toBeInTheDocument();
    expect(gamesApi.fetchSuggestions).not.toHaveBeenCalled();
  });
});
