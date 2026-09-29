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
afterEach(() => {
  vi.useRealTimers();
  localStorage.clear(); // 보기 방식 선택이 다음 테스트로 넘어가지 않게
});

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

describe('CalendarPage — 검색과 필터', () => {
  const games = () => [
    game(1, '엘든 링', 5, { platforms: ['PC'], genres: ['RPG'] }),
    game(2, '포르자', 5, { platforms: ['Xbox'], genres: ['Racing'] }),
    game(3, '하데스 2', 12, { platforms: ['PC', 'Xbox'], genres: ['Action', 'RPG'] }),
  ];

  it('제목을 검색하면 일치하는 게임만 캘린더에 남고 결과 수를 알려 준다', async () => {
    const user = userEvent.setup();
    await renderCalendar(games());

    await user.type(screen.getByRole('searchbox', { name: '게임 제목 검색' }), '엘든');

    expect(grid().getByRole('button', { name: /엘든 링/ })).toBeInTheDocument();
    expect(grid().queryByRole('button', { name: /포르자/ })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('1개 표시 중 (전체 3개)');
  });

  it('플랫폼과 장르 선택지는 그 달의 게임에서 만들고, 함께 적용하면 둘 다 만족하는 게임만 보인다', async () => {
    const user = userEvent.setup();
    await renderCalendar(games());

    await user.selectOptions(screen.getByRole('combobox', { name: '플랫폼' }), 'PC');
    await user.selectOptions(screen.getByRole('combobox', { name: '장르' }), 'Action');

    expect(grid().getByRole('button', { name: /하데스 2/ })).toBeInTheDocument();
    expect(grid().queryByRole('button', { name: /엘든 링/ })).not.toBeInTheDocument();
    expect(grid().queryByRole('button', { name: /포르자/ })).not.toBeInTheDocument();
  });

  it('맞는 게임이 없으면 안내하고, 초기화하면 모두 돌아온다', async () => {
    const user = userEvent.setup();
    await renderCalendar(games());

    await user.type(screen.getByRole('searchbox', { name: '게임 제목 검색' }), '없는 게임');
    expect(screen.getByText(/조건에 맞는 게임이 이 달에는 없습니다/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '필터 초기화' }));
    expect(screen.queryByText(/조건에 맞는 게임이/)).not.toBeInTheDocument();
    expect(grid().getByRole('button', { name: /포르자/ })).toBeInTheDocument();
  });

  it('로그인하지 않으면 "관심 게임만" 필터를 보여 주지 않는다', async () => {
    await renderCalendar(games());
    expect(screen.queryByRole('checkbox', { name: '관심 게임만' })).not.toBeInTheDocument();
  });

  it('로그인하면 "관심 게임만" 필터로 관심 게임만 볼 수 있다', async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.fetchMe).mockResolvedValue({ user: testUser });
    vi.mocked(meApi.fetchFavorites).mockResolvedValue({ games: [games()[1]!] });
    await renderCalendar(games());

    await user.click(await screen.findByRole('checkbox', { name: '관심 게임만' }));

    await waitFor(() => expect(grid().queryByRole('button', { name: /엘든 링/ })).not.toBeInTheDocument());
    expect(grid().getByRole('button', { name: /포르자/ })).toBeInTheDocument();
  });
});

describe('CalendarPage — 주간·목록 보기', () => {
  /** 오른쪽 패널의 인기 순위에도 같은 게임이 있으므로 캘린더 본문 안에서만 찾는다 */
  const main = () => within(document.querySelector<HTMLElement>('.calendar-main')!);
  const clickView = async (name: string) => {
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name }));
    return user;
  };

  it('주간 보기는 오늘이 속한 주의 게임만 모두 보여 주고, 주 단위로 이동한다', async () => {
    await renderCalendar([game(1, '이번 주 게임', 15), game(2, '다음 주 게임', 22), game(3, '월초 게임', 1)]);
    const user = await clickView('주간');

    expect(screen.getByRole('button', { name: '이전 주' })).toBeInTheDocument();
    expect(main().getByRole('button', { name: /이번 주 게임/ })).toBeInTheDocument();
    expect(main().queryByRole('button', { name: /다음 주 게임/ })).not.toBeInTheDocument();
    expect(main().queryByRole('button', { name: /월초 게임/ })).not.toBeInTheDocument();
    expect(document.querySelector('.cal-grid')).toBeNull();

    await user.click(screen.getByRole('button', { name: '다음 주' }));
    expect(main().getByRole('button', { name: /다음 주 게임/ })).toBeInTheDocument();
    expect(main().queryByRole('button', { name: /이번 주 게임/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '오늘' }));
    expect(main().getByRole('button', { name: /이번 주 게임/ })).toBeInTheDocument();
  });

  it('주가 다음 달로 넘어가면 그 달 정보도 불러온다', async () => {
    await renderCalendar([game(1, '게임', 15)]);
    const user = await clickView('주간');
    for (let i = 0; i < 3; i++) await user.click(screen.getByRole('button', { name: '다음 주' }));

    expect(gamesApi.fetchReleases).toHaveBeenCalledWith(`${year}-07-01`, `${year}-07-31`, expect.any(AbortSignal));
  });

  it('주간 보기에서 날짜를 누르면 그날의 목록이 패널에 열린다', async () => {
    await renderCalendar([game(1, '가 게임', 15), game(2, '나 게임', 15)]);
    const user = await clickView('주간');

    await user.click(screen.getByRole('button', { name: /15일 .*게임 2개/ }));
    expect(panel().getByRole('button', { name: /가 게임/ })).toBeInTheDocument();
    expect(panel().getByRole('button', { name: /나 게임/ })).toBeInTheDocument();
  });

  it('목록 보기는 출시일 순으로 날짜별로 묶어 보여 주고, 게임을 누르면 상세가 열린다', async () => {
    await renderCalendar([game(1, '늦은 게임', 20), game(2, '이른 게임', 3), game(3, '같은 날 게임', 3)]);
    const user = await clickView('목록');

    const headings = within(document.querySelector<HTMLElement>('.list-view')!)
      .getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent);
    expect(headings[0]).toContain('6월 3일');
    expect(headings[1]).toContain('6월 20일');
    const names = within(document.querySelector<HTMLElement>('.list-view')!)
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(names[0]).toContain('이른 게임');
    expect(names[2]).toContain('늦은 게임');

    await user.click(main().getByRole('button', { name: /늦은 게임/ }));
    expect(panel().getByRole('heading', { name: '늦은 게임' })).toBeInTheDocument();
  });

  it('출시 정보가 없는 달의 목록 보기는 안내 문구를 보여 준다', async () => {
    await renderCalendar([]);
    await clickView('목록');
    expect(screen.getByText('이 달에는 표시할 출시 정보가 없습니다.')).toBeInTheDocument();
  });

  it('고른 보기 방식은 기억해 둔다', async () => {
    await renderCalendar([game(1, '게임', 10)]);
    await clickView('목록');
    expect(localStorage.getItem('calendarView')).toBe('list');
  });

  it('필터는 목록 보기에서도 적용된다', async () => {
    await renderCalendar([
      game(1, '엘든 링', 15, { platforms: ['PC'] }),
      game(2, '포르자', 15, { platforms: ['Xbox'] }),
    ]);
    const user = await clickView('목록');
    await user.selectOptions(screen.getByRole('combobox', { name: '플랫폼' }), 'Xbox');
    expect(main().queryByRole('button', { name: /엘든 링/ })).not.toBeInTheDocument();
    expect(main().getByRole('button', { name: /포르자/ })).toBeInTheDocument();
  });
});
