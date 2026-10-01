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

function renderStats(logs: Record<number, GameLog> = {}, games = GAMES) {
  render(<LibraryStats games={games} logs={logs} libraryIds={new Set(games.map((x) => x.appId))} />);
  return { user: userEvent.setup() };
}

const box = (title: string) => screen.getByRole('region', { name: title });

beforeEach(() => vi.resetAllMocks());

describe('LibraryStats', () => {
  it('요약 카드: 보유 게임, 총 플레이 시간, 안 해 본 게임, 플레이한 게임당 평균', () => {
    renderStats();
    const cards = screen.getAllByRole('listitem').slice(0, 4);
    expect(cards.map((c) => c.textContent)).toEqual([
      '4개Steam 보유 게임',
      '12.0시간총 플레이 시간',
      '1개 (25%)아직 안 해 본 게임',
      '4.0시간플레이한 게임당 평균',
    ]);
  });

  it('분위기별 플레이 시간을 많은 순으로 보여 주고, 분위기를 모르는 게임은 빠졌다고 알린다', () => {
    renderStats();
    const rows = within(box('분위기별 플레이 시간')).getAllByRole('listitem');
    expect(rows.map((r) => r.textContent)).toEqual(['레트로·도트10.0시간 · 1개', 'SF1.5시간 · 1개', '기타0분 · 1개']);
    expect(
      within(box('분위기별 플레이 시간')).getByText(/분위기를 아직 모르는 게임 1개는 빠져 있어요/),
    ).toBeInTheDocument();
  });

  it('마지막 플레이 연도별 게임 수를 오래된 해부터 보여 주고, 구매일이 아닌 이유를 알린다', () => {
    renderStats();
    const rows = within(box('마지막 플레이 연도')).getAllByRole('listitem');
    expect(rows.map((r) => r.textContent)).toEqual(['2022년1개', '2024년2개']);
    expect(within(box('마지막 플레이 연도')).getByText(/구매일을 알려 주지 않아서/)).toBeInTheDocument();
  });

  it('가장 오래 한 게임을 플레이 시간 순으로 보여 준다 (안 한 게임은 뺀다)', () => {
    renderStats();
    const rows = within(box('가장 오래 한 게임')).getAllByRole('listitem');
    expect(rows.map((r) => r.textContent)).toEqual(['Terraria10.0시간', 'Portal1.5시간', 'Unknown30분']);
  });

  it('남긴 기록이 없으면 안내하고, 있으면 상태별 수와 평균 별점을 보여 준다', () => {
    const { rerender } = render(<LibraryStats games={GAMES} logs={{}} libraryIds={new Set([1, 2, 3, 4])} />);
    expect(within(box('내 기록')).getByText(/아직 남긴 기록이 없어요/)).toBeInTheDocument();

    rerender(
      <LibraryStats
        games={GAMES}
        logs={{ 1: log(1, 'cleared', 5), 2: log(2, 'cleared', 4), 4: log(4, 'dropped', null) }}
        libraryIds={new Set([1, 2, 3, 4])}
      />,
    );
    const rows = within(box('내 기록')).getAllByRole('listitem');
    expect(rows.map((r) => r.textContent)).toEqual(['▶ 하는 중0개', '✓ 클리어2개', '≡ 쌓아둠0개', '✕ 포기1개']);
    expect(within(box('내 기록')).getByText('평균 별점 ★4.5 (2개 게임)')).toBeInTheDocument();
  });

  it('게임이 하나도 없어도 깨지지 않는다', () => {
    renderStats({}, []);
    expect(within(box('분위기별 플레이 시간')).getByText('보유 게임이 없어요.')).toBeInTheDocument();
    expect(within(box('마지막 플레이 연도')).getByText(/플레이한 기록이 있는 게임이 없어요/)).toBeInTheDocument();
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

  it('처음에는 Steam을 부르지 않고, 버튼을 누르면 가져와서 보여 준다', async () => {
    vi.mocked(meApi.fetchAchievementSummary).mockResolvedValue(summary());
    const { user } = renderStats();
    expect(meApi.fetchAchievementSummary).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: '업적 달성률 계산하기' }));
    const section = box('업적 달성률');
    expect(await within(section).findByText('58%')).toBeInTheDocument(); // (5+2) / (10+2)
    expect(section).toHaveTextContent('업적 7 / 12개 · 모두 달성한 게임 1개');
    expect(
      within(section)
        .getAllByRole('listitem')
        .map((r) => r.textContent),
    ).toEqual(['Terraria5 / 10 (50%)', 'Portal2 / 2 (100%)']);
    expect(section).toHaveTextContent('확인한 게임 3개 중 업적이 있는 게임 2개');
    expect(meApi.fetchAchievementSummary).toHaveBeenCalledTimes(1);
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

  it('분위기 막대는 가장 긴 것을 100%로 하는 상대 비율이다', () => {
    renderStats();
    const widths = [...box('분위기별 플레이 시간').querySelectorAll<HTMLElement>('.stat-bar-fill')].map(
      (el) => el.style.width,
    );
    expect(widths[0]).toBe('100%');
    expect(widths[1]).toBe('15%'); // 90분 / 600분
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
