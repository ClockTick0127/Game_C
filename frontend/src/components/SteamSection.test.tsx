import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as authApi from '../api/auth';
import * as meApi from '../api/me';
import { AuthProvider } from '../contexts/AuthContext';
import { testUser } from '../test/fixtures';
import type { User } from '../types';
import { SteamSection } from './SteamSection';

vi.mock('../api/auth');
vi.mock('../api/me');

const linkedUser: User = { ...testUser, steamId: '76561198000000001' };

function renderSection(user: User, route = '/mypage') {
  vi.mocked(authApi.fetchMe).mockResolvedValue({ user });
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AuthProvider>
        <SteamSection user={user} />
      </AuthProvider>
    </MemoryRouter>,
  );
}

const game = (appId: number, name: string, playtimeMinutes: number) => ({
  appId,
  name,
  playtimeMinutes,
  lastPlayedAt: null,
  image: `https://example.com/${appId}.jpg`,
});

beforeEach(() => {
  vi.mocked(meApi.fetchSteamStatus).mockResolvedValue({ configured: true, profile: null });
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
    expect(await screen.findByText(/게임 세부 정보/)).toBeInTheDocument();
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
