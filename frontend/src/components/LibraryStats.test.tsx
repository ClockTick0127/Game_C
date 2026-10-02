import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as meApi from '../api/me';
import type { AchievementSummary, GameLog, Persona, SteamOwnedGame } from '../types';
import { LibraryStats } from './LibraryStats';

vi.mock('../api/me');

const g = (
  appId: number,
  name: string,
  playtimeMinutes: number,
  persona: Persona | null,
  lastPlayedAt: string | null = null,
): SteamOwnedGame => ({ appId, name, playtimeMinutes, lastPlayedAt, image: '', iconUrl: null, persona });

const GAMES = [
  g(1, 'Terraria', 600, 'retro', '2024-06-01T00:00:00.000Z'),
  g(2, 'Portal', 90, 'scifi', '2022-03-01T00:00:00.000Z'),
  g(3, 'Zero', 0, 'default'),
  g(4, 'Unknown', 30, null, '2024-01-01T00:00:00.000Z'),
];

const log = (gameId: number, status: GameLog['status'], rating: number | null): GameLog => ({
  gameId,
  status,
  rating,
  note: '',
});

/** 올해를 2024년으로 고정해서 "올해 플레이한 게임"이 실행하는 날짜에 흔들리지 않게 한다 */
const THIS_YEAR = 2024;

function renderStats(logs: Record<number, GameLog> = {}, games = GAMES, onOpen = vi.fn()) {
  render(
    <LibraryStats
      games={games}
      logs={logs}
      libraryIds={new Set(games.map((x) => x.appId))}
      onOpen={onOpen}
      thisYear={THIS_YEAR}
    />,
  );
  return { user: userEvent.setup(), onOpen };
}

const box = (title: string) => screen.getByRole('region', { name: title });

beforeEach(() => vi.resetAllMocks());

describe('LibraryStats — KPI 띠', () => {
  it('안 해 본 게임, 올해 플레이한 게임, 플레이한 게임당 평균, 클리어한 게임을 보여 준다', () => {
    renderStats({ 1: log(1, 'cleared', 5), 2: log(2, 'cleared', 4) });
    const kpis = within(screen.getByRole('region', { name: '서재 통계' }))
      .getAllByRole('list')[0]!
      .querySelectorAll('li');
    expect([...kpis].map((li) => li.textContent)).toEqual([
      '1개 (25%)아직 안 해 본 게임',
      '2개올해 플레이한 게임', // 2024년이 마지막 플레이인 게임: Terraria, Unknown
      '4.0시간플레이한 게임당 평균',
      '2개클리어한 게임',
    ]);
  });

  it('툴바와 겹치는 "보유 게임 수"와 "총 플레이 시간"은 띠에 없다', () => {
    renderStats();
    expect(screen.queryByText('Steam 보유 게임')).not.toBeInTheDocument();
    expect(screen.queryByText('총 플레이 시간')).not.toBeInTheDocument();
  });

  it('올해 플레이한 게임이 없으면 0개', () => {
    renderStats({}, [g(1, 'Old', 60, 'retro', '2019-01-01T00:00:00.000Z')]);
    const strong = screen.getByText('올해 플레이한 게임').previousElementSibling;
    expect(strong).toHaveTextContent('0개');
  });
});

describe('LibraryStats', () => {
  it('분위기별 플레이 시간을 많은 순으로 보여 주고, 분위기를 모르는 게임은 빠졌다고 알린다', () => {
    renderStats();
    const rows = within(box('분위기별 플레이 시간')).getAllByRole('listitem');
    expect(rows.map((r) => r.textContent)).toEqual(['레트로·도트10.0시간 · 1개', 'SF1.5시간 · 1개', '기타0분 · 1개']);
    expect(
      within(box('분위기별 플레이 시간')).getByText(/분위기를 아직 모르는 게임 1개는 빠져 있어요/),
    ).toBeInTheDocument();
    expect(within(box('분위기별 플레이 시간')).queryByText(/그 외/)).not.toBeInTheDocument();
  });

  it('분위기는 상위 5개만 막대로 보이고, 나머지는 "그 외 N가지 · 합계 시간"으로 접는다', () => {
    const personas: Persona[] = ['action', 'fantasy', 'scifi', 'horror', 'retro', 'cute', 'sports'];
    // 시간이 많은 순서가 persona 배열의 앞쪽이 되도록 60분씩 줄인다
    const many = personas.map((p, i) => g(i + 1, `G${i}`, (personas.length - i) * 60, p));
    renderStats({}, many);

    const section = box('분위기별 플레이 시간');
    expect(within(section).getAllByRole('listitem')).toHaveLength(5);
    // 6번째(cute: 120분)와 7번째(sports: 60분) → 2가지, 합계 3.0시간
    expect(within(section).getByText('그 외 2가지 · 3.0시간')).toBeInTheDocument();
  });

  it('분위기 막대는 가장 긴 것을 100%로 하는 상대 비율이다', () => {
    renderStats();
    const widths = [...box('분위기별 플레이 시간').querySelectorAll<HTMLElement>('.stat-bar-fill')].map(
      (el) => el.style.width,
    );
    expect(widths[0]).toBe('100%');
    expect(widths[1]).toBe('15%'); // 90분 / 600분
  });

  it('게임이 하나도 없어도 깨지지 않는다', () => {
    renderStats({}, []);
    expect(within(box('분위기별 플레이 시간')).getByText('보유 게임이 없어요.')).toBeInTheDocument();
    expect(within(box('마지막 플레이 연도')).getByText(/플레이한 기록이 있는 게임이 없어요/)).toBeInTheDocument();
  });
});

describe('LibraryStats — 마지막 플레이 연도 차트', () => {
  it('연도별 막대를 오래된 해부터 그리고, 중간에 빈 해는 0개 막대로 채운다', () => {
    renderStats();
    const section = box('마지막 플레이 연도');
    const titles = [...section.querySelectorAll('svg g title')].map((t) => t.textContent);
    expect(titles).toEqual(['2022년 · 1개', '2023년 · 0개', '2024년 · 2개']);
  });

  it('올해 막대만 포인트 색이고, 막대 높이는 가장 많은 해를 기준으로 하며 0개는 2px만 남는다', () => {
    renderStats();
    const bars = [...box('마지막 플레이 연도').querySelectorAll<SVGRectElement>('.stat-year-bar')];
    expect(bars.map((b) => b.classList.contains('now'))).toEqual([false, false, true]);
    const heights = bars.map((b) => Number(b.getAttribute('height')));
    expect(heights[1]).toBe(2); // 0개
    expect(heights[2]).toBeGreaterThan(heights[0]!); // 2개 > 1개
    expect(heights[0]! / heights[2]!).toBeCloseTo(0.5, 1);
  });

  it('차트는 스크린리더에 숨기고, 같은 값을 글 목록으로 남긴다', () => {
    renderStats();
    const section = box('마지막 플레이 연도');
    expect(section.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    const list = within(section).getAllByRole('listitem');
    expect(list.map((li) => li.textContent)).toEqual(['2022년 1개', '2024년 2개']);
    expect(within(section).getByText(/구매일을 알려 주지 않아서/)).toBeInTheDocument();
  });
});

describe('LibraryStats — 가장 오래 한 게임', () => {
  it('플레이 시간 순으로 보여 준다 (안 한 게임은 뺀다)', () => {
    renderStats();
    const items = within(box('가장 오래 한 게임')).getAllByRole('button');
    expect(items.map((b) => b.textContent)).toEqual(['Terraria10.0시간', 'Portal1.5시간', 'Unknown30분']);
  });

  it('누르면 그 게임을 열도록 알린다', async () => {
    const { user, onOpen } = renderStats();
    await user.click(within(box('가장 오래 한 게임')).getByRole('button', { name: /Portal/ }));
    expect(onOpen).toHaveBeenCalledWith(GAMES[1]);
  });
});

describe('LibraryStats — 내 기록', () => {
  it('남긴 기록이 없으면 안내한다', () => {
    renderStats();
    expect(within(box('내 기록')).getByText(/아직 남긴 기록이 없어요/)).toBeInTheDocument();
  });

  it('상태별 수는 범례(0개 포함)로, 평균 별점은 글자로 보여 준다', () => {
    renderStats({ 1: log(1, 'cleared', 5), 2: log(2, 'cleared', 4), 4: log(4, 'dropped', null) });
    const rows = within(box('내 기록')).getAllByRole('listitem');
    expect(rows.map((r) => r.textContent)).toEqual(['▶ 하는 중0개', '✓ 클리어2개', '≡ 쌓아둠0개', '✕ 포기1개']);
    expect(within(box('내 기록')).getByText('평균 별점 ★4.5 (2개 게임)')).toBeInTheDocument();
  });

  it('쌓인 막대는 기록한 게임 대비 비율로 그리고, 0개인 상태의 조각은 생략한다', () => {
    renderStats({ 1: log(1, 'cleared', 5), 2: log(2, 'cleared', 4), 4: log(4, 'dropped', null) });
    const pieces = [...box('내 기록').querySelectorAll<HTMLElement>('.stat-stack span')];
    expect(pieces.map((p) => p.style.width)).toEqual(['66.66666666666666%', '33.33333333333333%']);
  });

  it('별 그래픽은 평균을 0.5 단위로 채우고 스크린리더에는 숨긴다', () => {
    renderStats({ 1: log(1, 'cleared', 5), 2: log(2, 'cleared', 4) });
    const stars = box('내 기록').querySelector('.stat-stars')!;
    expect(stars).toHaveAttribute('aria-hidden', 'true');
    // 4.5점: 별 5개 중 앞의 네 개는 가득, 다섯 번째는 반만
    const offsets = [...stars.querySelectorAll('linearGradient')].map((gr) =>
      gr.querySelector('stop')!.getAttribute('offset'),
    );
    expect(offsets).toEqual(['1', '1', '1', '1', '0.5']);
  });

  it('별점이 하나도 없으면 별 그래픽 없이 안내만 한다', () => {
    renderStats({ 1: log(1, 'playing', null) });
    expect(within(box('내 기록')).getByText('별점을 남긴 게임이 아직 없어요.')).toBeInTheDocument();
    expect(box('내 기록').querySelector('.stat-stars')).toBeNull();
  });
});

describe('LibraryStats — 업적 달성률', () => {
  const summary = (overrides: Partial<AchievementSummary> = {}): AchievementSummary => ({
    private: false,
    games: [
      { appId: 1, name: 'Terraria', total: 10, achieved: 5 },
      { appId: 2, name: 'Portal', total: 2, achieved: 2 },
    ],
    checked: 3,
    hidden: 0,
    failed: 0,
    ...overrides,
  });

  it('처음에는 Steam을 부르지 않고, 안내 한 줄과 계산 버튼만 보인다', () => {
    renderStats();
    expect(meApi.fetchAchievementSummary).not.toHaveBeenCalled();
    const section = box('업적 달성률');
    expect(within(section).getByText('플레이 시간이 긴 게임 20개까지만 확인해요.')).toBeInTheDocument();
    expect(within(section).getByRole('button', { name: '업적 달성률 계산하기' })).toBeInTheDocument();
  });

  it('버튼을 누르면 가져와서 큰 숫자와 달성 수, "모두 달성" 칩, 게임별 막대로 보여 준다', async () => {
    vi.mocked(meApi.fetchAchievementSummary).mockResolvedValue(summary());
    const { user } = renderStats();

    await user.click(screen.getByRole('button', { name: '업적 달성률 계산하기' }));
    const section = box('업적 달성률');
    expect(await within(section).findByText('58%')).toBeInTheDocument(); // (5+2) / (10+2)
    expect(section).toHaveTextContent('달성');
    expect(section).toHaveTextContent('업적 7 / 12개');
    expect(within(section).getByText('모두 달성 1개')).toBeInTheDocument();
    expect(
      within(section)
        .getAllByRole('listitem')
        .map((r) => r.textContent),
    ).toEqual(['Terraria5 / 10 (50%)', 'Portal2 / 2 (100%)']);
    expect(section).toHaveTextContent('확인한 게임 3개 중 업적이 있는 게임 2개');
    expect(meApi.fetchAchievementSummary).toHaveBeenCalledTimes(1);
    // 결과가 나오면 계산 버튼과 안내 문구는 사라진다
    expect(within(section).queryByRole('button', { name: '업적 달성률 계산하기' })).not.toBeInTheDocument();
    expect(within(section).queryByText(/20개까지만 확인해요/)).not.toBeInTheDocument();
  });

  it('업적 막대는 최대값이 아니라 100%를 기준으로 그린다 (90%가 끝까지 차지 않는다)', async () => {
    vi.mocked(meApi.fetchAchievementSummary).mockResolvedValue(
      summary({
        games: [
          { appId: 1, name: 'Almost', total: 10, achieved: 9 },
          { appId: 2, name: 'Half', total: 10, achieved: 5 },
          { appId: 3, name: 'Done', total: 4, achieved: 4 },
        ],
      }),
    );
    const { user } = renderStats();
    await user.click(screen.getByRole('button', { name: '업적 달성률 계산하기' }));
    await within(box('업적 달성률')).findByText('Almost');

    const widths = [...box('업적 달성률').querySelectorAll<HTMLElement>('.stat-bar-fill')].map((el) => el.style.width);
    expect(widths).toEqual(['90%', '50%', '100%']);
  });

  it('불러오는 동안에는 버튼이 잠긴다', async () => {
    vi.mocked(meApi.fetchAchievementSummary).mockReturnValue(new Promise(() => {}));
    const { user } = renderStats();
    await user.click(screen.getByRole('button', { name: '업적 달성률 계산하기' }));
    expect(screen.getByRole('button', { name: /불러오는 중/ })).toBeDisabled();
  });

  it('실패하면 오류를 보여 주고 다시 누를 수 있다', async () => {
    vi.mocked(meApi.fetchAchievementSummary).mockRejectedValueOnce(new Error('Steam에서 정보를 가져오지 못했습니다.'));
    vi.mocked(meApi.fetchAchievementSummary).mockResolvedValue(summary());
    const { user } = renderStats();
    await user.click(screen.getByRole('button', { name: '업적 달성률 계산하기' }));
    expect(
      await screen.findByText(/업적을 불러오지 못했습니다: Steam에서 정보를 가져오지 못했습니다/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '업적 달성률 계산하기' }));
    expect(await within(box('업적 달성률')).findByText('58%')).toBeInTheDocument();
    expect(screen.queryByText(/업적을 불러오지 못했습니다/)).not.toBeInTheDocument();
  });

  it('비공개·실패한 게임 수를 알리고, 실패가 있으면 다시 불러오기를 둔다', async () => {
    vi.mocked(meApi.fetchAchievementSummary).mockResolvedValueOnce(summary({ hidden: 2, failed: 1 }));
    vi.mocked(meApi.fetchAchievementSummary).mockResolvedValue(summary());
    const { user } = renderStats();
    await user.click(screen.getByRole('button', { name: '업적 달성률 계산하기' }));
    expect(await screen.findByText(/업적이 비공개인 게임 2개 · 불러오지 못한 게임 1개/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '다시 불러오기' }));
    await waitFor(() => expect(screen.queryByText(/불러오지 못한 게임/)).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: '다시 불러오기' })).not.toBeInTheDocument();
  });

  it('업적이 있는 게임이 없으면 그렇게 알린다', async () => {
    vi.mocked(meApi.fetchAchievementSummary).mockResolvedValueOnce(summary({ games: [], checked: 2 }));
    const { user } = renderStats();
    await user.click(screen.getByRole('button', { name: '업적 달성률 계산하기' }));
    expect(await screen.findByText('업적이 있는 게임이 없어요.')).toBeInTheDocument();
  });

  it('게임 세부 정보가 비공개면 그렇게 알린다', async () => {
    vi.mocked(meApi.fetchAchievementSummary).mockResolvedValueOnce(summary({ private: true, games: [], checked: 0 }));
    const { user } = renderStats();
    await user.click(screen.getByRole('button', { name: '업적 달성률 계산하기' }));
    expect(await screen.findByText(/게임 세부 정보가 비공개라 업적을 볼 수 없어요/)).toBeInTheDocument();
  });
});
