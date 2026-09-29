import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as authApi from '../api/auth';
import * as gamesApi from '../api/games';
import * as meApi from '../api/me';
import { makeGame, testUser } from '../test/fixtures';
import { renderApp } from '../test/render';
import type { Game } from '../types';
import { CalendarPage } from './CalendarPage';

vi.mock('../api/auth');
vi.mock('../api/games');
vi.mock('../api/me');

// 달별 조회 결과는 훅 안에 기억되어 테스트끼리 공유되므로, 테스트마다 다른 해의 6월을 "오늘"로 정한다.
let year = 2039;
beforeEach(() => {
  year += 1;
  vi.useFakeTimers({ toFake: ['Date'] }); // 날짜만 고정하고, 비동기 대기(waitFor)는 그대로 둔다
  vi.setSystemTime(new Date(year, 5, 15));
  vi.mocked(authApi.fetchMe).mockResolvedValue({ user: null });
  vi.mocked(meApi.fetchFavorites).mockResolvedValue({ games: [] });
});
afterEach(() => vi.useRealTimers());

const june = (day: number) => `${year}-06-${String(day).padStart(2, '0')}`;
const game = (id: number, name: string, day: number, overrides: Partial<Game> = {}) =>
  makeGame(id, { name, released: june(day), ...overrides });

function mockReleases(games: Game[], extra: { sample?: boolean; partial?: boolean } = {}) {
  vi.mocked(gamesApi.fetchReleases).mockResolvedValue({ games, sample: extra.sample ?? false, partial: extra.partial });
}

/** 달력 격자 (오른쪽 패널의 같은 이름 버튼과 헷갈리지 않게 범위를 좁힌다) */
const grid = () => within(document.querySelector<HTMLElement>('.cal-grid')!);
const panel = () => within(screen.getByRole('complementary', { name: '게임 정보' }));

async function renderCalendar(games: Game[] = [], extra?: { sample?: boolean; partial?: boolean }) {
  mockReleases(games, extra);
  renderApp(<CalendarPage />);
  await waitFor(() => expect(screen.queryByText('불러오는 중…')).not.toBeInTheDocument());
}

describe('CalendarPage — 달력', () => {
  it('현재 달을 보여 주고 그 달의 범위로 출시 정보를 요청한다', async () => {
    await renderCalendar();
    expect(screen.getByRole('button', { name: new RegExp(`${year}년 6월`) })).toBeInTheDocument();
    expect(gamesApi.fetchReleases).toHaveBeenCalledWith(`${year}-06-01`, `${year}-06-30`, expect.any(AbortSignal));
    expect(screen.getByRole('heading', { level: 1, name: '게임 출시 캘린더' })).toBeInTheDocument();
  });

  it('게임을 출시일 칸에 보여 주고, 한 칸에 3개까지만 보이고 나머지는 "더보기"로 접는다', async () => {
    await renderCalendar([
      game(1, '가 게임', 10),
      game(2, '나 게임', 10),
      game(3, '다 게임', 10),
      game(4, '라 게임', 10),
      game(5, '마 게임', 20),
    ]);

    for (const name of ['가 게임', '나 게임', '다 게임', '마 게임']) {
      expect(grid().getByRole('button', { name })).toBeInTheDocument();
    }
    expect(grid().queryByRole('button', { name: '라 게임' })).not.toBeInTheDocument();
    expect(grid().getByRole('button', { name: '+1개 더보기' })).toBeInTheDocument();
    expect(grid().getByRole('button', { name: '6월 10일, 게임 4개' })).toBeEnabled();
    expect(grid().getByRole('button', { name: '6월 11일, 게임 0개' })).toBeDisabled(); // 게임 없는 날은 누를 수 없다
  });

  it('로그인한 사용자의 관심 게임에는 별 표시가 붙는다', async () => {
    vi.mocked(authApi.fetchMe).mockResolvedValue({ user: testUser });
    vi.mocked(meApi.fetchFavorites).mockResolvedValue({ games: [game(1, '가 게임', 10)] });
    await renderCalendar([game(1, '가 게임', 10), game(2, '나 게임', 10)]);

    await waitFor(() => expect(grid().getAllByLabelText('관심 게임')).toHaveLength(1));
    expect(within(grid().getByRole('button', { name: /가 게임/ })).getByLabelText('관심 게임')).toBeInTheDocument();
  });
});

describe('CalendarPage — 안내 배너', () => {
  it('샘플 데이터면 안내한다', async () => {
    await renderCalendar([], { sample: true });
    expect(screen.getByText(/샘플 데이터로 표시 중/)).toBeInTheDocument();
  });

  it('일부만 불러왔으면 알리고, 다시 시도하면 새로 불러온다', async () => {
    const user = userEvent.setup();
    await renderCalendar([game(1, '가 게임', 10)], { partial: true });
    expect(screen.getByText(/일부 출시 정보를 불러오지 못해/)).toBeInTheDocument();

    mockReleases([game(1, '가 게임', 10), game(2, '나 게임', 12)]);
    await user.click(screen.getByRole('button', { name: '다시 시도' }));

    await waitFor(() => expect(grid().getByRole('button', { name: '나 게임' })).toBeInTheDocument());
    expect(screen.queryByText(/일부 출시 정보를 불러오지 못해/)).not.toBeInTheDocument();
  });

  it('불러오기에 실패하면 오류를 보여 주고, 다시 시도하면 복구된다', async () => {
    const user = userEvent.setup();
    vi.mocked(gamesApi.fetchReleases).mockRejectedValueOnce(new Error('서버에 연결할 수 없습니다.'));
    renderApp(<CalendarPage />);

    expect(await screen.findByText(/출시 정보를 불러오지 못했습니다: 서버에 연결할 수 없습니다\./)).toBeInTheDocument();

    mockReleases([game(1, '가 게임', 10)]);
    await user.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(await grid().findByRole('button', { name: '가 게임' })).toBeInTheDocument();
    expect(screen.queryByText(/출시 정보를 불러오지 못했습니다/)).not.toBeInTheDocument();
  });
});

describe('CalendarPage — 달 이동', () => {
  it('다음 달·이전 달·오늘 버튼으로 이동하고, 이동한 달의 범위로 요청한다', async () => {
    const user = userEvent.setup();
    await renderCalendar();

    await user.click(screen.getByRole('button', { name: '다음 달' }));
    expect(screen.getByRole('button', { name: new RegExp(`${year}년 7월`) })).toBeInTheDocument();
    await waitFor(() =>
      expect(gamesApi.fetchReleases).toHaveBeenCalledWith(`${year}-07-01`, `${year}-07-31`, expect.any(AbortSignal)),
    );

    await user.click(screen.getByRole('button', { name: '오늘' }));
    expect(screen.getByRole('button', { name: new RegExp(`${year}년 6월`) })).toBeInTheDocument();
  });

  it('12월에서 다음 달을 누르면 다음 해 1월로 넘어간다', async () => {
    const user = userEvent.setup();
    vi.setSystemTime(new Date(year, 11, 15));
    await renderCalendar();

    await user.click(screen.getByRole('button', { name: '다음 달' }));
    expect(screen.getByRole('button', { name: new RegExp(`${year + 1}년 1월`) })).toBeInTheDocument();
  });
});

describe('CalendarPage — 게임 정보 패널', () => {
  const makeGames = () => [game(1, '가 게임', 10), game(2, '나 게임', 10), game(3, '다 게임', 20)];

  it('처음에는 안내와 이번 달 인기 게임 순위를 보여 준다', async () => {
    await renderCalendar(makeGames());
    expect(panel().getByText('PRESS START')).toBeInTheDocument();
    expect(panel().getByRole('heading', { name: '6월 인기 게임 TOP 3' })).toBeInTheDocument();
    const ranking = panel().getAllByRole('listitem');
    expect(ranking[0]).toHaveTextContent('가 게임'); // 백엔드가 준 인기순 그대로
  });

  it('칸의 게임을 누르면 상세를, 닫으면 다시 처음 화면을 보여 준다', async () => {
    const user = userEvent.setup();
    await renderCalendar(makeGames());

    await user.click(grid().getByRole('button', { name: '다 게임' }));
    expect(panel().getByRole('heading', { name: '다 게임' })).toBeInTheDocument();
    expect(panel().getByText(new RegExp(`출시일 ${year}년 6월 20일`))).toBeInTheDocument();
    expect(grid().getByRole('button', { name: '다 게임' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(panel().getByRole('button', { name: '닫기' }));
    expect(panel().getByText('PRESS START')).toBeInTheDocument();
  });

  it('날짜를 누르면 그날의 목록을, 게임을 고르면 상세와 "목록으로" 버튼을 보여 준다', async () => {
    const user = userEvent.setup();
    await renderCalendar(makeGames());

    await user.click(grid().getByRole('button', { name: '6월 10일, 게임 2개' }));
    expect(panel().getByText('게임 2개')).toBeInTheDocument();
    expect(panel().getByRole('button', { name: /가 게임/ })).toBeInTheDocument();

    await user.click(panel().getByRole('button', { name: /나 게임/ }));
    expect(panel().getByRole('heading', { name: '나 게임' })).toBeInTheDocument();

    await user.click(panel().getByRole('button', { name: /6월 10일 목록/ }));
    expect(panel().getByText('게임 2개')).toBeInTheDocument();
  });

  it('Esc로 패널을 닫는다', async () => {
    const user = userEvent.setup();
    await renderCalendar(makeGames());
    await user.click(grid().getByRole('button', { name: '가 게임' }));
    expect(panel().getByRole('heading', { name: '가 게임' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(panel().getByText('PRESS START')).toBeInTheDocument();
  });

  it('월 선택기에서 누른 Esc는 선택기만 닫고, 뒤의 패널은 그대로 둔다', async () => {
    const user = userEvent.setup();
    await renderCalendar(makeGames());
    await user.click(grid().getByRole('button', { name: '가 게임' }));
    await user.click(screen.getByRole('button', { name: new RegExp(`${year}년 6월`) }));
    expect(screen.getByRole('dialog', { name: '연도와 월 선택' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: '연도와 월 선택' })).not.toBeInTheDocument();
    expect(panel().getByRole('heading', { name: '가 게임' })).toBeInTheDocument(); // 패널은 유지

    await user.keyboard('{Escape}'); // 선택기가 닫힌 뒤의 Esc는 패널을 닫는다
    expect(panel().getByText('PRESS START')).toBeInTheDocument();
  });

  it('다른 달로 이동하면 날짜 목록은 닫힌다', async () => {
    const user = userEvent.setup();
    await renderCalendar(makeGames());
    await user.click(grid().getByRole('button', { name: '6월 10일, 게임 2개' }));
    expect(panel().getByText('게임 2개')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '다음 달' }));
    expect(panel().queryByText('게임 2개')).not.toBeInTheDocument();
  });
});
