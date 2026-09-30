import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as authApi from '../api/auth';
import * as meApi from '../api/me';
import * as popularApi from '../api/popular';
import { renderApp } from '../test/render';
import type { PopularGame, PopularResponse } from '../types';
import { PopularPage } from './PopularPage';

vi.mock('../api/auth');
vi.mock('../api/me');
vi.mock('../api/popular');

const game = (appId: number, name: string, overrides: Partial<PopularGame> = {}): PopularGame => ({
  appId,
  name,
  developer: '개발사',
  publisher: '유통사',
  ownersMin: 20_000_000,
  ownersMax: 50_000_000,
  ccu: 54_771,
  priceUsd: 59.99,
  discount: 25,
  genres: ['RPG', 'Adventure'],
  releaseYear: 2023,
  platforms: { windows: true, mac: true, linux: false },
  image: `https://example.com/${appId}.jpg`,
  ...overrides,
});

const response = (overrides: Partial<PopularResponse> = {}): PopularResponse => ({
  status: { ready: true, updatedAt: '2026-09-30T00:00:00.000Z', total: 2, releaseChecked: 2 },
  total: 2,
  page: 1,
  pageSize: 30,
  exchange: { krwPerUsd: 1350, date: '2026-09-29' },
  games: [game(1, '발더스 게이트 3'), game(2, '테라리아', { ownersMin: 1_000_000, ownersMax: 2_000_000, priceUsd: 0 })],
  facets: {
    genres: [
      { value: 'RPG', count: 5 },
      { value: 'Action', count: 3 },
    ],
    years: [
      { value: 2023, count: 2 },
      { value: 2019, count: 1 },
    ],
    platforms: [{ value: 'windows', count: 2 }],
  },
  ...overrides,
});

beforeEach(() => {
  vi.mocked(authApi.fetchMe).mockResolvedValue({ user: null });
  vi.mocked(meApi.fetchFavorites).mockResolvedValue({ games: [] });
  vi.mocked(popularApi.fetchPopular).mockResolvedValue(response());
});

const lastParams = () => vi.mocked(popularApi.fetchPopular).mock.lastCall![0];

describe('PopularPage', () => {
  it('게임 목록을 보유자 추정 구간과 함께 보여 준다', async () => {
    renderApp(<PopularPage />, { route: '/popular', path: '/popular' });

    expect(await screen.findByRole('link', { name: '발더스 게이트 3' })).toHaveAttribute(
      'href',
      'https://store.steampowered.com/app/1/',
    );
    expect(screen.getByText('2,000만 ~ 5,000만명')).toBeInTheDocument();
    expect(screen.getByText('100만 ~ 200만명')).toBeInTheDocument();
    expect(screen.getAllByText('54,771명', { selector: 'dd' })).toHaveLength(2);
    expect(screen.getByText('₩80,990')).toBeInTheDocument(); // 59.99 × 1350 = 80,986.5 → 10원 단위 반올림
    expect(screen.getByText(/1달러 = 1,350원/)).toBeInTheDocument();
    expect(screen.getByText('무료', { selector: 'dd' })).toBeInTheDocument();
  });

  it('환율을 못 가져왔으면 달러로 보여 주고 환율 안내는 숨긴다', async () => {
    vi.mocked(popularApi.fetchPopular).mockResolvedValue(response({ exchange: null }));
    renderApp(<PopularPage />, { route: '/popular', path: '/popular' });
    expect(await screen.findByText('$59.99')).toBeInTheDocument();
    expect(screen.queryByText(/환율/)).not.toBeInTheDocument();
  });

  it('"순위"라고 하지 않고 추정치임을 안내한다', async () => {
    renderApp(<PopularPage />, { route: '/popular', path: '/popular' });
    expect(await screen.findByRole('heading', { name: '인기 있는 게임' })).toBeInTheDocument();
    expect(screen.getByText(/실제 판매량과는 달라요/)).toBeInTheDocument();
    expect(screen.queryByText(/순위/)).not.toBeInTheDocument();
  });

  it('필터 선택지에 개수를 보여 주고, 고르면 그 조건으로 다시 조회한다', async () => {
    const user = userEvent.setup();
    renderApp(<PopularPage />, { route: '/popular', path: '/popular' });
    await screen.findByText('발더스 게이트 3');

    expect(screen.getByRole('option', { name: 'RPG (5)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '2019년 (1)' })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('장르'), 'RPG');
    await waitFor(() => expect(lastParams().genre).toBe('RPG'));

    await user.selectOptions(screen.getByLabelText('출시 연도'), '2019');
    await waitFor(() => expect(lastParams()).toMatchObject({ genre: 'RPG', year: '2019' }));

    await user.selectOptions(screen.getByLabelText('플랫폼'), 'windows');
    await user.selectOptions(screen.getByLabelText('정렬'), 'ccu');
    await waitFor(() => expect(lastParams()).toMatchObject({ platform: 'windows', sort: 'ccu' }));
  });

  it('주소의 조건으로 시작한다', async () => {
    renderApp(<PopularPage />, { route: '/popular?genre=Action&year=2019&sort=ccu', path: '/popular' });
    await screen.findByText('발더스 게이트 3');
    expect(lastParams()).toMatchObject({ genre: 'Action', year: '2019', sort: 'ccu', page: 1 });
  });

  it('검색어는 입력이 멈춘 뒤 한 번만 조회한다', async () => {
    const user = userEvent.setup();
    renderApp(<PopularPage />, { route: '/popular', path: '/popular' });
    await screen.findByText('발더스 게이트 3');
    const calls = vi.mocked(popularApi.fetchPopular).mock.calls.length;

    await user.type(screen.getByLabelText('게임 이름 검색'), 'terra');
    await waitFor(() => expect(lastParams().q).toBe('terra'));
    // 다섯 글자를 쳤지만 글자마다 조회하지 않는다
    expect(vi.mocked(popularApi.fetchPopular).mock.calls.length - calls).toBeLessThanOrEqual(2);
  });

  it('처음 수집하는 중이면 안내를 보여 주고 목록은 감춘다', async () => {
    vi.mocked(popularApi.fetchPopular).mockResolvedValue(
      response({ status: { ready: false, updatedAt: null, total: 0, releaseChecked: 0 }, total: 0, games: [] }),
    );
    renderApp(<PopularPage />, { route: '/popular', path: '/popular' });
    expect(await screen.findByText(/처음 모으는 중/)).toBeInTheDocument();
    expect(screen.queryByText('조건에 맞는 게임이 없어요.')).not.toBeInTheDocument();
  });

  it('출시 정보를 채우는 중이면 진행 상황과 필터 제한을 알려 준다', async () => {
    vi.mocked(popularApi.fetchPopular).mockResolvedValue(
      response({ status: { ready: true, updatedAt: null, total: 1435, releaseChecked: 120 } }),
    );
    renderApp(<PopularPage />, { route: '/popular', path: '/popular' });
    expect(await screen.findByText(/120\/1435/)).toBeInTheDocument();
    expect(screen.getByText(/정보가 채워진 게임만/)).toBeInTheDocument();
  });

  it('조건에 맞는 게임이 없으면 그렇게 알려 준다', async () => {
    vi.mocked(popularApi.fetchPopular).mockResolvedValue(response({ total: 0, games: [] }));
    renderApp(<PopularPage />, { route: '/popular', path: '/popular' });
    expect(await screen.findByText('조건에 맞는 게임이 없어요.')).toBeInTheDocument();
  });

  it('조회에 실패하면 오류를 보여 준다', async () => {
    vi.mocked(popularApi.fetchPopular).mockRejectedValue(new Error('서버에 연결할 수 없습니다.'));
    renderApp(<PopularPage />, { route: '/popular', path: '/popular' });
    expect(await screen.findByText(/서버에 연결할 수 없습니다/)).toBeInTheDocument();
  });

  it('여러 쪽이면 이전·다음으로 넘긴다', async () => {
    const user = userEvent.setup();
    vi.mocked(popularApi.fetchPopular).mockResolvedValue(response({ total: 75 }));
    renderApp(<PopularPage />, { route: '/popular', path: '/popular' });
    await screen.findByText('1 / 3');
    expect(screen.getByRole('button', { name: '이전' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: '다음' }));
    await waitFor(() => expect(lastParams().page).toBe(2));
  });
});
