import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as authApi from '../api/auth';
import { ApiError } from '../api/client';
import * as meApi from '../api/me';
import * as profilesApi from '../api/profiles';
import { testUser } from '../test/fixtures';
import { renderApp } from '../test/render';
import type { Showcase } from '../types';
import { ShowcasePage } from './ShowcasePage';

vi.mock('../api/auth');
vi.mock('../api/me');
vi.mock('../api/profiles');

const showcase: Showcase = {
  nickname: '자랑왕',
  games: [
    {
      appId: 20,
      name: 'Long',
      playtimeMinutes: 600,
      custom: false,
      image: null,
      steamAppId: null,
      status: 'cleared',
      rating: 5,
    },
    {
      appId: 10,
      name: 'Short',
      playtimeMinutes: 30,
      custom: false,
      image: null,
      steamAppId: null,
      status: null,
      rating: null,
    },
  ],
};

const renderShowcase = (nickname = '자랑왕') =>
  renderApp(<ShowcasePage />, { route: `/u/${encodeURIComponent(nickname)}`, path: '/u/:nickname' });

beforeEach(() => {
  // 공개 페이지는 로그인하지 않아도 볼 수 있다
  vi.mocked(authApi.fetchMe).mockRejectedValue(new ApiError(401, '로그인이 필요합니다.'));
  vi.mocked(profilesApi.fetchShowcase).mockResolvedValue(showcase);
  vi.mocked(meApi.fetchFavorites).mockResolvedValue({ games: [] });
});

describe('ShowcasePage', () => {
  it('주소의 닉네임으로 진열장을 불러와 꽂은 순서대로 보여 준다', async () => {
    renderShowcase();
    expect(await screen.findByRole('heading', { name: '자랑왕님의 진열장' })).toBeInTheDocument();
    expect(vi.mocked(profilesApi.fetchShowcase).mock.calls[0]![0]).toBe('자랑왕');

    const cases = [...document.querySelectorAll('.shelf .case[data-app-id]')].map((el) =>
      el.getAttribute('aria-label'),
    );
    expect(cases).toEqual(['Long, 10.0시간 · 클리어 · ★5', 'Short, 30분']);
  });

  it('게임을 누르면 자세한 정보 창이 열리고 편집 기능은 없다', async () => {
    const user = userEvent.setup();
    renderShowcase();
    await user.click(await screen.findByRole('button', { name: /^Long,/ }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Long' })).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: /Steam 스토어/ })).toHaveAttribute(
      'href',
      'https://store.steampowered.com/app/20/',
    );
    expect(screen.queryByRole('button', { name: '배치 바꾸기' })).not.toBeInTheDocument();
  });

  it('진열장이 비어 있으면 안내한다', async () => {
    vi.mocked(profilesApi.fetchShowcase).mockResolvedValue({ nickname: '자랑왕', games: [] });
    renderShowcase();
    expect(await screen.findByText('아직 진열장에 꽂은 게임이 없어요.')).toBeInTheDocument();
  });

  it('공개하지 않았거나 없는 닉네임(404)이면 찾을 수 없다고 알린다', async () => {
    vi.mocked(profilesApi.fetchShowcase).mockRejectedValue(new ApiError(404, '공개된 진열장을 찾을 수 없습니다.'));
    renderShowcase('없는사람');
    expect(await screen.findByRole('heading', { name: '진열장을 찾을 수 없어요' })).toBeInTheDocument();
  });

  it('그 밖의 오류는 다시 시도할 수 있다', async () => {
    const user = userEvent.setup();
    vi.mocked(profilesApi.fetchShowcase).mockRejectedValueOnce(new ApiError(502, 'Steam 오류'));
    renderShowcase();
    expect(await screen.findByText(/진열장을 불러오지 못했습니다: Steam 오류/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(await screen.findByRole('heading', { name: '자랑왕님의 진열장' })).toBeInTheDocument();
  });

  it('내 공개 진열장을 보면 서재로 가는 안내가 붙는다', async () => {
    vi.mocked(authApi.fetchMe).mockResolvedValue({ user: { ...testUser, nickname: '자랑왕', profilePublic: true } });
    renderShowcase();
    expect(await screen.findByText(/내 진열장이에요/)).toBeInTheDocument();
  });
});
