import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as authApi from '../api/auth';
import * as meApi from '../api/me';
import { testUser } from '../test/fixtures';
import { renderApp } from '../test/render';
import type { SteamOwnedGame, User } from '../types';
import { LibraryPage } from './LibraryPage';

vi.mock('../api/auth');
vi.mock('../api/me');

const linkedUser: User = { ...testUser, steamId: '76561198000000001' };

const game = (
  appId: number,
  name: string,
  playtimeMinutes: number,
  lastPlayedAt: string | null = null,
): SteamOwnedGame => ({
  appId,
  name,
  playtimeMinutes,
  lastPlayedAt,
  image: `https://example.com/${appId}.jpg`,
});

const renderLibrary = () => renderApp(<LibraryPage />, { route: '/library', path: '/library' });
const caseNames = () =>
  screen.getAllByRole('button', { name: /, / }).map((b) => b.getAttribute('aria-label')!.split(',')[0]);

beforeEach(() => {
  vi.mocked(authApi.fetchMe).mockResolvedValue({ user: linkedUser });
  vi.mocked(meApi.fetchFavorites).mockResolvedValue({ games: [] });
  vi.mocked(meApi.fetchSteamGames).mockResolvedValue({
    private: false,
    games: [game(1, 'Terraria', 600), game(2, 'Portal', 90, '2025-06-01T00:00:00.000Z'), game(3, 'Zero', 0)],
  });
});

describe('LibraryPage', () => {
  it('보유 게임을 상자로 보여 주고 게임 수와 총 플레이 시간을 알려 준다', async () => {
    renderLibrary();
    expect(await screen.findByRole('button', { name: 'Terraria, 10.0시간' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zero, 플레이 기록 없음' })).toBeInTheDocument();
    expect(screen.getByText('게임 3개 · 총 12시간 플레이')).toBeInTheDocument();
  });

  it('기본은 플레이 시간이 긴 순이고, 정렬을 바꿀 수 있다', async () => {
    const user = userEvent.setup();
    renderLibrary();
    await screen.findByRole('button', { name: /Terraria/ });
    expect(caseNames()).toEqual(['Terraria', 'Portal', 'Zero']);

    await user.selectOptions(screen.getByLabelText('정렬'), 'name');
    expect(caseNames()).toEqual(['Portal', 'Terraria', 'Zero']);

    await user.selectOptions(screen.getByLabelText('정렬'), 'recent');
    expect(caseNames()[0]).toBe('Portal');
  });

  it('이름으로 검색하고, 결과가 없으면 알려 준다', async () => {
    const user = userEvent.setup();
    renderLibrary();
    await screen.findByRole('button', { name: /Terraria/ });

    await user.type(screen.getByLabelText('내 게임 검색'), 'port');
    expect(caseNames()).toEqual(['Portal']);
    expect(screen.getByText('1 / 3개')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('내 게임 검색'));
    await user.type(screen.getByLabelText('내 게임 검색'), 'zzz');
    expect(await screen.findByText('찾는 게임이 서재에 없어요.')).toBeInTheDocument();
  });

  it('상자를 누르면 업적을 보여 주고, 스토어 링크가 있다', async () => {
    const user = userEvent.setup();
    vi.mocked(meApi.fetchSteamAchievements).mockResolvedValue({
      supported: true,
      private: false,
      achievements: [
        { id: 'A', name: '첫 승리', description: '이겨라', achieved: true, unlockedAt: '2024-01-02T00:00:00.000Z' },
        { id: 'B', name: '전설', description: '', achieved: false, unlockedAt: null },
      ],
    });
    renderLibrary();
    await user.click(await screen.findByRole('button', { name: /Terraria/ }));

    const dialog = await screen.findByRole('dialog', { name: 'Terraria' });
    expect(meApi.fetchSteamAchievements).toHaveBeenCalledWith(1);
    expect(await within(dialog).findByText('업적 1 / 2')).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Steam 스토어에서 보기' })).toHaveAttribute(
      'href',
      'https://store.steampowered.com/app/1/',
    );

    await user.click(within(dialog).getByRole('button', { name: '닫기' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('60개가 넘으면 더 꺼내 볼 수 있다', async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 65 }, (_, i) => game(i + 1, `Game ${String(i + 1).padStart(2, '0')}`, 1000 - i));
    vi.mocked(meApi.fetchSteamGames).mockResolvedValue({ private: false, games: many });
    renderLibrary();
    await screen.findByRole('button', { name: /Game 01/ });
    expect(caseNames()).toHaveLength(60);

    await user.click(screen.getByRole('button', { name: /더 꺼내 보기 \(5개 남음\)/ }));
    expect(caseNames()).toHaveLength(65);
  });

  it('Steam 연동 전이면 게임을 묻지 않고 연동을 안내한다', async () => {
    vi.mocked(authApi.fetchMe).mockResolvedValue({ user: testUser });
    renderLibrary();
    expect(await screen.findByRole('link', { name: '마이페이지' })).toHaveAttribute('href', '/mypage');
    expect(meApi.fetchSteamGames).not.toHaveBeenCalled();
  });

  it('게임 세부 정보가 비공개면 공개 방법을 안내한다', async () => {
    vi.mocked(meApi.fetchSteamGames).mockResolvedValue({ private: true, games: [] });
    renderLibrary();
    expect(await screen.findByText(/게임 세부 정보/)).toBeInTheDocument();
  });

  it('서재가 비어 있으면 그렇게 알려 준다', async () => {
    vi.mocked(meApi.fetchSteamGames).mockResolvedValue({ private: false, games: [] });
    renderLibrary();
    expect(await screen.findByText(/서재가 비어 있어요/)).toBeInTheDocument();
  });

  it('실패하면 오류를 보여 주고 다시 시도하면 불러온다', async () => {
    const user = userEvent.setup();
    vi.mocked(meApi.fetchSteamGames).mockRejectedValueOnce(new Error('Steam에서 정보를 가져오지 못했습니다.'));
    renderLibrary();
    expect(await screen.findByText(/Steam에서 정보를 가져오지 못했습니다/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '다시 시도' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Terraria/ })).toBeInTheDocument());
  });

  it('표지 이미지가 없으면 글자 표지로 대신한다', async () => {
    renderLibrary();
    const button = await screen.findByRole('button', { name: /Terraria/ });
    const img = button.querySelector('img')!;
    // 세로형 → 가로형 → 글자 순으로 물러난다
    img.dispatchEvent(new Event('error'));
    await waitFor(() => expect(button.querySelector('img')!.getAttribute('src')).toContain('header.jpg'));
    button.querySelector('img')!.dispatchEvent(new Event('error'));
    await waitFor(() => expect(button.querySelector('.case-fallback')).toHaveTextContent('Terraria'));
  });
});
