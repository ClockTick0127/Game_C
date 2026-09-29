import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as authApi from '../api/auth';
import * as gamesApi from '../api/games';
import * as meApi from '../api/me';
import winners from '../data/tgaGoty.json';
import { makeGame } from '../test/fixtures';
import { renderApp } from '../test/render';
import { GotyPage } from './GotyPage';

vi.mock('../api/auth');
vi.mock('../api/games');
vi.mock('../api/me');

const FAILING = 'Elden Ring'; // RAWG에서 찾지 못하는 수상작으로 취급한다

beforeEach(() => {
  vi.mocked(authApi.fetchMe).mockResolvedValue({ user: null });
  vi.mocked(meApi.fetchFavorites).mockResolvedValue({ games: [] });
  // 수상작마다 연도를 ID로 쓴 게임을 돌려준다. url이 null이라 스토어 정보는 불러오지 않는다.
  vi.mocked(gamesApi.searchGame).mockImplementation(async (name, year) =>
    name === FAILING ? Promise.reject(new Error('게임을 찾을 수 없습니다.')) : makeGame(year, { name, url: null }),
  );
});

describe('GotyPage', () => {
  it('모든 수상작을 최신 순으로 카드로 보여 준다', async () => {
    renderApp(<GotyPage />);
    const items = await screen.findAllByRole('heading', { level: 2 });

    expect(items).toHaveLength(winners.length);
    expect(items[0]).toHaveTextContent(winners[0]!.name);
    expect(screen.getByRole('heading', { level: 1, name: '역대 GOTY' })).toBeInTheDocument();
    expect(document.title).toContain('역대 GOTY');
  });

  it('각 수상작을 이름과 연도로 검색한다', async () => {
    renderApp(<GotyPage />);
    await waitFor(() => expect(gamesApi.searchGame).toHaveBeenCalledTimes(winners.length));

    for (const w of winners) {
      expect(gamesApi.searchGame).toHaveBeenCalledWith(w.name, w.year, expect.any(AbortSignal));
    }
  });

  it('찾은 수상작만 눌러서 상세를 펼칠 수 있고, 못 찾은 수상작은 눌러도 반응하지 않는다', async () => {
    renderApp(<GotyPage />);
    await waitFor(() => expect(screen.getAllByRole('button', { expanded: false })).toHaveLength(winners.length - 1));

    const failing = screen.getByRole('heading', { name: FAILING });
    expect(within(failing.closest('li')!).queryByRole('button')).not.toBeInTheDocument();
  });

  it('카드를 누르면 상세가 펼쳐지고, 다시 누르면 접힌다', async () => {
    const user = userEvent.setup();
    renderApp(<GotyPage />);
    const first = await screen.findByRole('button', { name: new RegExp(winners[0]!.name) });
    expect(first).toHaveAttribute('aria-expanded', 'false');

    await user.click(first);
    expect(first).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByText(/출시일/)).toBeInTheDocument();

    await user.click(first);
    expect(first).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/출시일/)).not.toBeInTheDocument();
  });

  it('한 번에 하나만 펼친다', async () => {
    const user = userEvent.setup();
    renderApp(<GotyPage />);
    const first = await screen.findByRole('button', { name: new RegExp(winners[0]!.name) });
    const second = screen.getByRole('button', { name: new RegExp(winners[1]!.name) });

    await user.click(first);
    await user.click(second);

    expect(first).toHaveAttribute('aria-expanded', 'false');
    expect(second).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByText(/출시일/)).toHaveLength(1);
  });
});
