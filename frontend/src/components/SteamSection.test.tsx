import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as authApi from '../api/auth';
import * as meApi from '../api/me';
import { AuthProvider } from '../contexts/AuthContext';
import { FavoritesProvider } from '../contexts/FavoritesContext';
import { makeGame, testUser } from '../test/fixtures';
import type { SteamWishlistItem, User } from '../types';
import { SteamSection } from './SteamSection';

vi.mock('../api/auth');
vi.mock('../api/me');

const linkedUser: User = { ...testUser, steamId: '76561198000000001' };

function renderSection(user: User, route = '/mypage') {
  vi.mocked(authApi.fetchMe).mockResolvedValue({ user });
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AuthProvider>
        <FavoritesProvider>
          <SteamSection user={user} />
        </FavoritesProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

const wishlistItem = (appId: number, name: string, overrides: Partial<SteamWishlistItem> = {}): SteamWishlistItem => ({
  appId,
  name,
  released: '2030-06-15',
  image: `https://example.com/w${appId}.jpg`,
  favorite: false,
  ...overrides,
});

const game = (appId: number, name: string, playtimeMinutes: number) => ({
  appId,
  name,
  playtimeMinutes,
  lastPlayedAt: null,
  image: `https://example.com/${appId}.jpg`,
  iconUrl: null,
  persona: null,
});

beforeEach(() => {
  vi.mocked(meApi.fetchSteamStatus).mockResolvedValue({ configured: true, profile: null });
  vi.mocked(meApi.fetchFavorites).mockResolvedValue({ games: [] });
});

describe('SteamSection — 위시리스트 가져오기', () => {
  it('위시리스트를 불러오면 관심 게임이 아닌 것만 골라져 있고, 이미 있는 게임은 표시만 한다', async () => {
    const user = userEvent.setup();
    vi.mocked(meApi.fetchSteamWishlist).mockResolvedValue({
      items: [wishlistItem(1, 'New Game'), wishlistItem(2, 'Old Game', { favorite: true, released: null })],
      excluded: 2,
    });
    renderSection(linkedUser);

    await user.click(await screen.findByRole('button', { name: '위시리스트 불러오기' }));

    expect(await screen.findByText('New Game')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'New Game' })).toBeChecked();
    const old = screen.getByRole('checkbox', { name: 'Old Game' });
    expect(old).toBeChecked();
    expect(old).toBeDisabled();
    expect(screen.getByText('출시일 미정')).toBeInTheDocument();
    expect(screen.getByText('DLC·데모 2개 제외')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '선택한 1개 관심 게임에 추가' })).toBeInTheDocument();
  });

  it('선택한 게임을 10개씩 나눠 보내고 결과를 요약하며, 추가된 게임은 관심 게임으로 바뀐다', async () => {
    const user = userEvent.setup();
    const items = Array.from({ length: 12 }, (_, i) => wishlistItem(i + 1, `Game ${i + 1}`));
    vi.mocked(meApi.fetchSteamWishlist).mockResolvedValue({ items, excluded: 0 });
    vi.mocked(meApi.importSteamWishlist).mockImplementation(async (appIds) => ({
      results: appIds.map((appId) => ({
        appId,
        status: appId === 3 ? 'notFound' : appId === 4 ? 'noDate' : appId === 5 ? 'exists' : 'added',
        game: appId === 3 ? null : makeGame(appId),
      })),
    }));
    renderSection(linkedUser);

    await user.click(await screen.findByRole('button', { name: '위시리스트 불러오기' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Game 12' })); // 하나는 뺀다
    await user.click(screen.getByRole('button', { name: '선택한 11개 관심 게임에 추가' }));

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('관심 게임에 8개를 추가했습니다. 이미 있던 게임 1개. 넣지 못한 게임 2개.');
    expect(meApi.importSteamWishlist).toHaveBeenCalledTimes(2);
    expect(meApi.importSteamWishlist).toHaveBeenNthCalledWith(1, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(meApi.importSteamWishlist).toHaveBeenNthCalledWith(2, [11]);
    expect(within(status).getByText('Game 3')).toBeInTheDocument();
    expect(within(status).getByText('(같은 이름의 게임을 찾지 못함)')).toBeInTheDocument();
    expect(within(status).getByText('(출시일 미정)')).toBeInTheDocument();
    // 추가된 게임은 더 고를 수 없고, 관심 게임 목록을 다시 불러온다
    expect(screen.getByRole('checkbox', { name: 'Game 1' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Game 3' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: '선택한 2개 관심 게임에 추가' })).toBeInTheDocument();
    expect(meApi.fetchFavorites).toHaveBeenCalledTimes(2);
  });

  it('가져오다 실패하면 오류를 보여 주고 그때까지의 결과는 반영한다', async () => {
    const user = userEvent.setup();
    const items = Array.from({ length: 11 }, (_, i) => wishlistItem(i + 1, `Game ${i + 1}`));
    vi.mocked(meApi.fetchSteamWishlist).mockResolvedValue({ items, excluded: 0 });
    vi.mocked(meApi.importSteamWishlist)
      .mockResolvedValueOnce({
        results: items.slice(0, 10).map((i) => ({ appId: i.appId, status: 'added', game: makeGame(i.appId) })),
      })
      .mockRejectedValueOnce(new Error('요청이 몰려 잠시 후 다시 시도해 주세요.'));
    renderSection(linkedUser);

    await user.click(await screen.findByRole('button', { name: '위시리스트 불러오기' }));
    await user.click(await screen.findByRole('button', { name: '선택한 11개 관심 게임에 추가' }));

    expect(await screen.findByText(/가져오는 중 문제가 생겼습니다: 요청이 몰려/)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('관심 게임에 10개를 추가했습니다.');
    expect(screen.getByRole('button', { name: '선택한 1개 관심 게임에 추가' })).toBeInTheDocument();
  });

  it('위시리스트가 비어 있으면 공개 설정을 안내한다', async () => {
    const user = userEvent.setup();
    vi.mocked(meApi.fetchSteamWishlist).mockResolvedValue({ items: [], excluded: 0 });
    renderSection(linkedUser);

    await user.click(await screen.findByRole('button', { name: '위시리스트 불러오기' }));
    expect(await screen.findByText(/위시리스트가 비어 있거나 비공개입니다/)).toBeInTheDocument();
  });

  it('서버에 Steam API 키가 없어도 위시리스트는 가져올 수 있다', async () => {
    vi.mocked(meApi.fetchSteamStatus).mockResolvedValue({ configured: false, profile: null });
    renderSection(linkedUser);
    expect(await screen.findByRole('button', { name: '위시리스트 불러오기' })).toBeInTheDocument();
  });
});

describe('SteamSection — 연동 전', () => {
  it('연동 링크를 보여 주고 서버에는 아무것도 묻지 않는다', () => {
    renderSection(testUser);
    const link = screen.getByRole('link', { name: 'Steam 계정 연동' });
    expect(link).toHaveAttribute('href', '/api/auth/steam?mode=link');
    expect(meApi.fetchSteamStatus).not.toHaveBeenCalled();
  });

  it('콜백이 알려 준 결과 코드를 안내 문구로 보여 준다', () => {
    renderSection(testUser, '/mypage?steam=taken');
    expect(screen.getByText('이미 다른 계정에 연동된 Steam 계정입니다.')).toBeInTheDocument();
  });
});

describe('SteamSection — 연동 후', () => {
  it('프로필과 함께 게임을 불러와 플레이 시간과 함께 보여 준다', async () => {
    const user = userEvent.setup();
    vi.mocked(meApi.fetchSteamStatus).mockResolvedValue({
      configured: true,
      profile: { name: '스팀닉', avatar: null, url: 'https://steamcommunity.com/id/nick' },
    });
    vi.mocked(meApi.fetchSteamGames).mockResolvedValue({
      private: false,
      games: [game(1, 'Long Game', 600), game(2, 'Short Game', 30)],
    });
    renderSection(linkedUser);

    expect(await screen.findByText('스팀닉')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '보유 게임 불러오기' }));

    expect(await screen.findByText('Long Game')).toBeInTheDocument();
    expect(screen.getByText('10.0시간')).toBeInTheDocument();
    expect(screen.getByText('30분')).toBeInTheDocument();
  });

  it('게임을 누르면 업적을 달성 수와 함께 보여 준다', async () => {
    const user = userEvent.setup();
    vi.mocked(meApi.fetchSteamGames).mockResolvedValue({ private: false, games: [game(440, 'TF2', 100)] });
    vi.mocked(meApi.fetchSteamAchievements).mockResolvedValue({
      supported: true,
      private: false,
      achievements: [
        { id: 'A', name: '첫 승리', description: '이겨라', achieved: true, unlockedAt: '2024-01-02T00:00:00.000Z' },
        { id: 'B', name: '숨겨진 업적', description: '', achieved: false, unlockedAt: null },
      ],
    });
    renderSection(linkedUser);

    await user.click(await screen.findByRole('button', { name: '보유 게임 불러오기' }));
    await user.click(await screen.findByRole('button', { name: /TF2/ }));

    expect(meApi.fetchSteamAchievements).toHaveBeenCalledWith(440);
    expect(await screen.findByText('업적 1 / 2')).toBeInTheDocument();
    expect(screen.getByText('첫 승리')).toBeInTheDocument();
    expect(screen.getByText('숨겨진 업적')).toBeInTheDocument();
  });

  it('업적이 없는 게임은 그렇게 안내한다', async () => {
    const user = userEvent.setup();
    vi.mocked(meApi.fetchSteamGames).mockResolvedValue({ private: false, games: [game(9, 'No Ach', 5)] });
    vi.mocked(meApi.fetchSteamAchievements).mockResolvedValue({ supported: false, private: false, achievements: [] });
    renderSection(linkedUser);

    await user.click(await screen.findByRole('button', { name: '보유 게임 불러오기' }));
    await user.click(await screen.findByRole('button', { name: /No Ach/ }));
    expect(await screen.findByText('이 게임에는 업적이 없습니다.')).toBeInTheDocument();
  });

  it('게임 세부 정보가 비공개면 공개 방법을 안내한다', async () => {
    const user = userEvent.setup();
    vi.mocked(meApi.fetchSteamGames).mockResolvedValue({ private: true, games: [] });
    renderSection(linkedUser);

    await user.click(await screen.findByRole('button', { name: '보유 게임 불러오기' }));
    expect(await screen.findByText(/보유 게임을 볼 수 없습니다/)).toBeInTheDocument();
  });

  it('서버에 Steam API 키가 없으면 게임 불러오기 대신 안내를 보여 준다', async () => {
    vi.mocked(meApi.fetchSteamStatus).mockResolvedValue({ configured: false, profile: null });
    renderSection(linkedUser);

    expect(await screen.findByText(/API 키가 설정되지 않아/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '보유 게임 불러오기' })).not.toBeInTheDocument();
  });

  it('연동 해제를 확인하면 서버에 요청하고 연동 링크로 바뀐다', async () => {
    const user = userEvent.setup();
    vi.mocked(meApi.unlinkSteam).mockResolvedValue({ user: testUser });
    renderSection(linkedUser);

    await user.click(await screen.findByRole('button', { name: '연동 해제' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: '해제' }));

    expect(meApi.unlinkSteam).toHaveBeenCalled();
  });
});
