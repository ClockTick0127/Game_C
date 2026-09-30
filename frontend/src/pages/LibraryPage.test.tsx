import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  iconUrl: `https://example.com/icon-${appId}.jpg`,
  persona: null,
});

// 플레이 시간 순: Terraria(1) > Portal(2) > Alpha(4) > Zero(3)
const GAMES = [
  game(1, 'Terraria', 600),
  game(2, 'Portal', 90, '2025-06-01T00:00:00.000Z'),
  game(3, 'Zero', 0),
  game(4, 'Alpha', 10),
];

const renderLibrary = () => renderApp(<LibraryPage />, { route: '/library', path: '/library' });
const labelName = (el: Element) => el.getAttribute('aria-label')!.split(',')[0]!;
/** 진열장(표지가 보이는 상자)에 꽂힌 게임 이름 */
const shelfNames = () => [...document.querySelectorAll('.shelf .case[data-app-id]')].map(labelName);
/** 서재(책등)에 꽂힌 게임 이름 */
const libraryNames = () => [...document.querySelectorAll('.stacks .spine')].map(labelName);
const item = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name},`) });
const slot = (name: string) => item(name).closest('li')!;

beforeEach(() => {
  vi.mocked(authApi.fetchMe).mockResolvedValue({ user: linkedUser });
  vi.mocked(meApi.fetchFavorites).mockResolvedValue({ games: [] });
  vi.mocked(meApi.fetchLibraryOrder).mockResolvedValue({ order: [] });
  vi.mocked(meApi.saveLibraryOrder).mockResolvedValue(undefined);
  vi.mocked(meApi.fetchCustomGames).mockResolvedValue({ games: [] });
  vi.mocked(meApi.fetchSteamGames).mockResolvedValue({ private: false, games: GAMES });
});

const enterEdit = async (user: ReturnType<typeof userEvent.setup>) => {
  await screen.findByRole('button', { name: '배치 바꾸기' });
  await user.click(screen.getByRole('button', { name: '배치 바꾸기' }));
};

describe('LibraryPage — 진열장과 서재', () => {
  it('저장한 배치가 없으면 진열장은 비어 있고, 모든 게임이 서재에 플레이 시간 순으로 꽂힌다', async () => {
    renderLibrary();
    expect(await screen.findByText(/진열장이 비어 있어요/)).toBeInTheDocument();
    expect(libraryNames()).toEqual(['Terraria', 'Portal', 'Alpha', 'Zero']);
    expect(screen.getByText('게임 4개 · 총 12시간 플레이')).toBeInTheDocument();
  });

  it('진열장에는 저장한 게임이 내가 정한 순서로, 서재에는 나머지가 꽂힌다', async () => {
    vi.mocked(meApi.fetchLibraryOrder).mockResolvedValue({ order: [3, 1] });
    renderLibrary();
    await screen.findByRole('button', { name: /^Zero,/ });
    expect(shelfNames()).toEqual(['Zero', 'Terraria']);
    expect(libraryNames()).toEqual(['Portal', 'Alpha']);
  });

  it('정렬과 검색은 서재에만 적용되고 진열장은 그대로다', async () => {
    const user = userEvent.setup();
    vi.mocked(meApi.fetchLibraryOrder).mockResolvedValue({ order: [3] });
    renderLibrary();
    await screen.findByRole('button', { name: /^Zero,/ });

    await user.selectOptions(screen.getByLabelText('정렬'), 'name');
    expect(libraryNames()).toEqual(['Alpha', 'Portal', 'Terraria']);

    await user.type(screen.getByLabelText('서재에서 검색'), 'port');
    expect(libraryNames()).toEqual(['Portal']);
    expect(shelfNames()).toEqual(['Zero']);

    await user.clear(screen.getByLabelText('서재에서 검색'));
    await user.type(screen.getByLabelText('서재에서 검색'), 'zzz');
    expect(await screen.findByText('찾는 게임이 서재에 없어요.')).toBeInTheDocument();
  });

  it('책이나 상자를 누르면 업적을 보여 주고 스토어 링크가 있다', async () => {
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
    await user.click(await screen.findByRole('button', { name: /^Terraria,/ }));

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

  it('책 위에 마우스를 올리면 그 책 위에 이름과 플레이 시간 말풍선이 뜨고, 벗어나면 사라진다', async () => {
    const user = userEvent.setup();
    renderLibrary();
    const book = await screen.findByRole('button', { name: /^Terraria,/ });
    expect(document.querySelector('.spine-tip')).toBeNull();

    await user.hover(book);
    const tip = document.querySelector('.spine-tip')!;
    expect(tip).toHaveTextContent('Terraria');
    expect(tip).toHaveTextContent('10.0시간');

    await user.unhover(book);
    expect(document.querySelector('.spine-tip')).toBeNull();
  });

  it('말풍선은 스크롤하면 닫힌다', async () => {
    const user = userEvent.setup();
    renderLibrary();
    await user.hover(await screen.findByRole('button', { name: /^Terraria,/ }));
    expect(document.querySelector('.spine-tip')).not.toBeNull();

    fireEvent.scroll(window);
    await waitFor(() => expect(document.querySelector('.spine-tip')).toBeNull());
  });

  it('서재가 150권을 넘으면 더 꺼내 볼 수 있다', async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 155 }, (_, i) => game(i + 1, `Game ${i + 1}`, 1000 - i));
    vi.mocked(meApi.fetchSteamGames).mockResolvedValue({ private: false, games: many });
    renderLibrary();
    await screen.findByRole('button', { name: /^Game 1,/ });
    expect(libraryNames()).toHaveLength(150);

    await user.click(screen.getByRole('button', { name: /더 꺼내 보기 \(5권 남음\)/ }));
    expect(libraryNames()).toHaveLength(155);
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

  it('보유 게임이 없으면 그렇게 알려 준다', async () => {
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
    await waitFor(() => expect(libraryNames()).toHaveLength(4));
  });

  it('진열장 배치를 못 불러와도 서재는 보여 준다', async () => {
    vi.mocked(meApi.fetchLibraryOrder).mockRejectedValue(new Error('실패'));
    renderLibrary();
    await screen.findByRole('button', { name: /^Terraria,/ });
    expect(libraryNames()).toHaveLength(4);
    expect(shelfNames()).toEqual([]);
  });

  it('진열장 표지 이미지가 없으면 글자 표지로 대신한다', async () => {
    vi.mocked(meApi.fetchLibraryOrder).mockResolvedValue({ order: [1] });
    renderLibrary();
    const button = await screen.findByRole('button', { name: /^Terraria,/ });
    button.querySelector('img')!.dispatchEvent(new Event('error')); // 세로형 → 가로형
    await waitFor(() => expect(button.querySelector('img')!.getAttribute('src')).toContain('header.jpg'));
    button.querySelector('img')!.dispatchEvent(new Event('error')); // 가로형 → 글자
    await waitFor(() => expect(button.querySelector('.case-fallback')).toHaveTextContent('Terraria'));
  });

  it('공식 아이콘이 없는 게임은 처음부터 이름의 첫 글자로 보여 준다', async () => {
    vi.mocked(meApi.fetchSteamGames).mockResolvedValue({
      private: false,
      games: [{ ...game(7, 'Noicon', 5), iconUrl: null }],
    });
    renderLibrary();
    const button = await screen.findByRole('button', { name: /^Noicon,/ });
    expect(button.querySelector('.spine-icon img')).toBeNull();
    expect(button.querySelector('.spine-icon')).toHaveTextContent('N');
  });

  it('책등 그림을 불러오지 못하면 이름의 첫 글자로 대신한다', async () => {
    renderLibrary();
    const button = await screen.findByRole('button', { name: /^Terraria,/ });
    expect(button.querySelector('.spine-icon img')).toHaveAttribute('src', 'https://example.com/icon-1.jpg');
    button.querySelector('img')!.dispatchEvent(new Event('error'));
    await waitFor(() => expect(button.querySelector('.spine-icon')).toHaveTextContent('T'));
  });
});

describe('LibraryPage — 배치 바꾸기', () => {
  it('서재의 책을 집어 "진열장 맨 끝에 꽂기"를 누르면 진열장으로 옮겨지고, 완료하면 저장한다', async () => {
    const user = userEvent.setup();
    renderLibrary();
    await enterEdit(user);

    await user.click(item('Portal')); // 집기
    expect(item('Portal')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/'Portal'을\(를\) 들고 있어요/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '진열장 맨 끝에 꽂기' }));
    expect(shelfNames()).toEqual(['Portal']);
    expect(libraryNames()).toEqual(['Terraria', 'Alpha', 'Zero']);

    await user.click(screen.getByRole('button', { name: '완료' }));
    await waitFor(() => expect(meApi.saveLibraryOrder).toHaveBeenCalledWith([2]));
    // 편집이 끝나도 저장한 배치가 그대로 보인다
    expect(await screen.findByRole('button', { name: '배치 바꾸기' })).toBeInTheDocument();
    expect(shelfNames()).toEqual(['Portal']);
  });

  it('진열장의 상자를 집어 다른 상자를 누르면 그 자리로 옮겨진다', async () => {
    const user = userEvent.setup();
    vi.mocked(meApi.fetchLibraryOrder).mockResolvedValue({ order: [1, 2, 3] });
    renderLibrary();
    await enterEdit(user);

    await user.click(item('Zero'));
    await user.click(item('Terraria'));
    expect(shelfNames()).toEqual(['Zero', 'Terraria', 'Portal']);

    await user.click(screen.getByRole('button', { name: '완료' }));
    await waitFor(() => expect(meApi.saveLibraryOrder).toHaveBeenCalledWith([3, 1, 2]));
  });

  it('서재의 책을 집어 진열장의 상자를 누르면 그 앞에 끼워진다', async () => {
    const user = userEvent.setup();
    vi.mocked(meApi.fetchLibraryOrder).mockResolvedValue({ order: [1, 2] });
    renderLibrary();
    await enterEdit(user);

    await user.click(item('Alpha'));
    await user.click(item('Portal'));
    expect(shelfNames()).toEqual(['Terraria', 'Alpha', 'Portal']);
    expect(libraryNames()).toEqual(['Zero']);
  });

  it('진열장의 상자를 집어 서재의 책을 누르거나 "진열장에서 빼기"를 누르면 서재로 돌아간다', async () => {
    const user = userEvent.setup();
    vi.mocked(meApi.fetchLibraryOrder).mockResolvedValue({ order: [1, 2] });
    renderLibrary();
    await enterEdit(user);

    await user.click(item('Terraria'));
    await user.click(item('Zero')); // 서재의 책을 누르면 빠진다
    expect(shelfNames()).toEqual(['Portal']);
    expect(libraryNames()).toContain('Terraria');

    await user.click(item('Portal'));
    await user.click(screen.getByRole('button', { name: '진열장에서 빼기' }));
    expect(shelfNames()).toEqual([]);
    expect(libraryNames()).toHaveLength(4);
  });

  it('서재의 책을 더블클릭하면 진열장 맨 끝으로 넘어간다 (집은 상태도 풀린다)', async () => {
    const user = userEvent.setup();
    vi.mocked(meApi.fetchLibraryOrder).mockResolvedValue({ order: [1] });
    renderLibrary();
    await enterEdit(user);

    await user.dblClick(item('Portal'));
    expect(shelfNames()).toEqual(['Terraria', 'Portal']);
    expect(libraryNames()).not.toContain('Portal');
    expect(screen.getByText(/더블클릭하면 반대쪽 서재로 넘어가요/)).toBeInTheDocument(); // 아무것도 들고 있지 않다
  });

  it('진열장의 상자를 더블클릭하면 서재로 돌아간다', async () => {
    const user = userEvent.setup();
    vi.mocked(meApi.fetchLibraryOrder).mockResolvedValue({ order: [1, 2] });
    renderLibrary();
    await enterEdit(user);

    await user.dblClick(item('Terraria'));
    expect(shelfNames()).toEqual(['Portal']);
    expect(libraryNames()).toContain('Terraria');
    expect(screen.queryByRole('button', { name: '진열장에서 빼기' })).not.toBeInTheDocument();
  });

  it('더블클릭으로 옮긴 배치도 완료하면 저장된다', async () => {
    const user = userEvent.setup();
    renderLibrary();
    await enterEdit(user);
    await user.dblClick(item('Zero'));
    await user.dblClick(item('Terraria'));

    await user.click(screen.getByRole('button', { name: '완료' }));
    await waitFor(() => expect(meApi.saveLibraryOrder).toHaveBeenCalledWith([3, 1]));
  });

  it('편집 중이 아닐 때 더블클릭해도 배치는 바뀌지 않는다', async () => {
    const user = userEvent.setup();
    renderLibrary();
    await screen.findByRole('button', { name: '배치 바꾸기' });
    await user.dblClick(item('Terraria'));
    expect(shelfNames()).toEqual([]);
    expect(libraryNames()).toHaveLength(4);
  });

  it('집은 상자를 방향키로 한 칸씩 옮기고, Esc로 내려놓는다', async () => {
    const user = userEvent.setup();
    vi.mocked(meApi.fetchLibraryOrder).mockResolvedValue({ order: [1, 2, 3] });
    renderLibrary();
    await enterEdit(user);

    await user.click(item('Terraria'));
    await user.keyboard('{ArrowRight}');
    expect(shelfNames()).toEqual(['Portal', 'Terraria', 'Zero']);
    await user.keyboard('{ArrowRight}{ArrowRight}'); // 맨 끝에서는 더 못 간다
    expect(shelfNames()).toEqual(['Portal', 'Zero', 'Terraria']);
    await user.keyboard('{ArrowLeft}');
    expect(shelfNames()).toEqual(['Portal', 'Terraria', 'Zero']);

    await user.keyboard('{Escape}');
    expect(item('Terraria')).toHaveAttribute('aria-pressed', 'false');
  });

  it('서재의 책을 끌어 진열장의 상자 위에 놓으면 그 앞에 꽂힌다', async () => {
    const user = userEvent.setup();
    vi.mocked(meApi.fetchLibraryOrder).mockResolvedValue({ order: [1] });
    renderLibrary();
    await enterEdit(user);

    const dataTransfer = { setData: vi.fn(), effectAllowed: '' };
    fireEvent.dragStart(slot('Zero'), { dataTransfer });
    fireEvent.dragOver(slot('Terraria'), { dataTransfer });
    fireEvent.drop(slot('Terraria'), { dataTransfer });
    fireEvent.dragEnd(slot('Terraria'), { dataTransfer });

    expect(shelfNames()).toEqual(['Zero', 'Terraria']);
  });

  it('진열장의 상자를 서재 쪽에 끌어다 놓으면 진열장에서 빠진다', async () => {
    const user = userEvent.setup();
    vi.mocked(meApi.fetchLibraryOrder).mockResolvedValue({ order: [1, 2] });
    renderLibrary();
    await enterEdit(user);

    const dataTransfer = { setData: vi.fn(), effectAllowed: '' };
    fireEvent.dragStart(slot('Terraria'), { dataTransfer });
    fireEvent.dragOver(document.querySelector('.stacks')!, { dataTransfer });
    fireEvent.drop(document.querySelector('.stacks')!, { dataTransfer });

    expect(shelfNames()).toEqual(['Portal']);
  });

  it('진열장의 맨 끝 빈자리로 끌어 놓으면 맨 뒤에 꽂힌다', async () => {
    const user = userEvent.setup();
    vi.mocked(meApi.fetchLibraryOrder).mockResolvedValue({ order: [1, 2] });
    renderLibrary();
    await enterEdit(user);

    const end = document.querySelector('.case-slot')!.closest('li')!;
    const dataTransfer = { setData: vi.fn(), effectAllowed: '' };
    fireEvent.dragStart(slot('Terraria'), { dataTransfer });
    fireEvent.dragOver(end, { dataTransfer });
    fireEvent.drop(end, { dataTransfer });

    expect(shelfNames()).toEqual(['Portal', 'Terraria']);
  });

  it('"진열장 비우기"로 진열장의 모든 게임을 서재로 돌려보낸다', async () => {
    const user = userEvent.setup();
    vi.mocked(meApi.fetchLibraryOrder).mockResolvedValue({ order: [1, 2] });
    renderLibrary();
    await enterEdit(user);

    await user.click(screen.getByRole('button', { name: '진열장 비우기' }));
    expect(shelfNames()).toEqual([]);
    await user.click(screen.getByRole('button', { name: '완료' }));
    await waitFor(() => expect(meApi.saveLibraryOrder).toHaveBeenCalledWith([]));
  });

  it('취소하면 저장하지 않고 원래 배치로 돌아온다', async () => {
    const user = userEvent.setup();
    vi.mocked(meApi.fetchLibraryOrder).mockResolvedValue({ order: [1] });
    renderLibrary();
    await enterEdit(user);
    await user.click(item('Portal'));
    await user.click(screen.getByRole('button', { name: '진열장 맨 끝에 꽂기' }));
    expect(shelfNames()).toEqual(['Terraria', 'Portal']);

    await user.click(screen.getByRole('button', { name: '취소' }));
    expect(meApi.saveLibraryOrder).not.toHaveBeenCalled();
    expect(shelfNames()).toEqual(['Terraria']);
  });

  it('편집 중에는 눌러도 업적 창이 열리지 않고, 편집을 시작하면 검색어를 지운다', async () => {
    const user = userEvent.setup();
    renderLibrary();
    await screen.findByRole('button', { name: '배치 바꾸기' });
    await user.type(screen.getByLabelText('서재에서 검색'), 'port');
    expect(libraryNames()).toEqual(['Portal']);

    await user.click(screen.getByRole('button', { name: '배치 바꾸기' }));
    expect(libraryNames()).toHaveLength(4);
    expect(screen.queryByLabelText('서재에서 검색')).not.toBeInTheDocument();

    await user.click(item('Terraria'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(meApi.fetchSteamAchievements).not.toHaveBeenCalled();
  });

  it('저장에 실패하면 오류를 보여 주고 편집 중인 배치를 그대로 둔다', async () => {
    const user = userEvent.setup();
    vi.mocked(meApi.saveLibraryOrder).mockRejectedValue(new Error('서버에 연결할 수 없습니다.'));
    renderLibrary();
    await enterEdit(user);
    await user.click(item('Portal'));
    await user.click(screen.getByRole('button', { name: '진열장 맨 끝에 꽂기' }));
    await user.click(screen.getByRole('button', { name: '완료' }));

    expect(await screen.findByText(/배치를 저장하지 못했습니다: 서버에 연결할 수 없습니다/)).toBeInTheDocument();
    expect(shelfNames()).toEqual(['Portal']);
    expect(screen.getByRole('button', { name: '완료' })).toBeEnabled();
  });

  it('더 이상 갖고 있지 않은 게임이 저장된 진열장에 남아 있어도 무시한다', async () => {
    vi.mocked(meApi.fetchLibraryOrder).mockResolvedValue({ order: [999, 2] });
    renderLibrary();
    await screen.findByRole('button', { name: /^Portal,/ });
    expect(shelfNames()).toEqual(['Portal']);
  });
});

describe('LibraryPage — 게임팩 책등', () => {
  const spine = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name},`) });

  it('게임 분위기에 맞는 제목 폰트 클래스를 붙이고, 아직 모르는 게임은 기본 폰트다', async () => {
    vi.mocked(meApi.fetchSteamGames).mockResolvedValue({
      private: false,
      games: [
        { ...game(1, 'Elden', 600), persona: 'fantasy' },
        game(2, 'Portal', 90),
        { ...game(3, 'Neon', 5), persona: 'scifi' },
      ],
    });
    renderLibrary();
    await screen.findByRole('button', { name: /^Elden,/ });
    expect(spine('Elden').querySelector('.spine-title')).toHaveClass('font-fantasy');
    expect(spine('Neon').querySelector('.spine-title')).toHaveClass('font-scifi');
    expect(spine('Portal').querySelector('.spine-title')).toHaveClass('font-default');
  });

  it('게임팩처럼 아래쪽에 포인트 띠가 있고, 위쪽 플랫폼 표시는 없다', async () => {
    renderLibrary();
    const book = await screen.findByRole('button', { name: /^Terraria,/ });
    expect(book.querySelector('.spine-band')).toBeNull();
    expect(book).not.toHaveTextContent('PC');
    expect(book.querySelector('.spine-foot')).not.toBeNull();
  });

  it('책등 색을 CSS 변수로 넘긴다 (대표색을 아직 못 뽑았으면 게임마다 정해진 임시 색)', async () => {
    renderLibrary();
    const book = await screen.findByRole('button', { name: /^Terraria,/ });
    for (const name of ['--spine-top', '--spine-bottom', '--spine-accent', '--spine-text']) {
      expect(book.style.getPropertyValue(name)).toMatch(/^hsl\(/);
    }
    // 게임마다 색이 다르다
    expect(spine('Portal').style.getPropertyValue('--spine-top')).not.toBe(book.style.getPropertyValue('--spine-top'));
  });

  describe('분위기를 서버가 알아내는 동안', () => {
    afterEach(() => vi.useRealTimers());

    it('주기적으로 다시 불러와 알아낸 분위기를 반영하고, 다 알아내면 그만 부른다', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
      vi.mocked(meApi.fetchSteamGames)
        .mockResolvedValueOnce({ private: false, games: [game(1, 'Neon', 600)], stylesPending: 1 })
        .mockResolvedValue({
          private: false,
          games: [{ ...game(1, 'Neon', 600), persona: 'scifi' }],
          stylesPending: 0,
        });
      renderLibrary();
      await screen.findByRole('button', { name: /^Neon,/ });
      expect(spine('Neon').querySelector('.spine-title')).toHaveClass('font-default');
      expect(meApi.fetchSteamGames).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(15_000);
      await waitFor(() => expect(spine('Neon').querySelector('.spine-title')).toHaveClass('font-scifi'));
      expect(meApi.fetchSteamGames).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(60_000); // 다 알아냈으니 더 부르지 않는다
      expect(meApi.fetchSteamGames).toHaveBeenCalledTimes(2);
    });

    it('처음부터 다 알고 있으면 다시 불러오지 않는다', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
      vi.mocked(meApi.fetchSteamGames).mockResolvedValue({
        private: false,
        games: [{ ...game(1, 'Neon', 600), persona: 'scifi' }],
        stylesPending: 0,
      });
      renderLibrary();
      await screen.findByRole('button', { name: /^Neon,/ });
      await vi.advanceTimersByTimeAsync(60_000);
      expect(meApi.fetchSteamGames).toHaveBeenCalledTimes(1);
    });

    it('다시 불러오다 실패해도 화면은 그대로이고 다음 주기에 다시 시도한다', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
      vi.mocked(meApi.fetchSteamGames)
        .mockResolvedValueOnce({ private: false, games: [game(1, 'Neon', 600)], stylesPending: 1 })
        .mockRejectedValueOnce(new Error('일시 오류'))
        .mockResolvedValue({
          private: false,
          games: [{ ...game(1, 'Neon', 600), persona: 'scifi' }],
          stylesPending: 0,
        });
      renderLibrary();
      await screen.findByRole('button', { name: /^Neon,/ });

      await vi.advanceTimersByTimeAsync(15_000);
      expect(spine('Neon')).toBeInTheDocument();
      expect(screen.queryByText(/불러오지 못했습니다/)).not.toBeInTheDocument();

      await vi.advanceTimersByTimeAsync(15_000);
      await waitFor(() => expect(spine('Neon').querySelector('.spine-title')).toHaveClass('font-scifi'));
    });
  });
});

describe('LibraryPage — 직접 추가한 게임', () => {
  const searched = {
    id: 3498,
    name: 'Grand Theft Auto V',
    released: '2013-09-17',
    image: 'https://media.rawg.io/a.jpg',
    rating: 4,
    metacritic: null,
    platforms: ['PC', 'PlayStation 5'],
    genres: [],
    url: null,
  };

  it('저장해 둔 게임이 Steam 게임과 함께 서재에 꽂히고, 눌러서 서재에서 뺄 수 있다', async () => {
    vi.mocked(meApi.fetchCustomGames).mockResolvedValue({
      games: [{ id: 3498, name: searched.name, image: searched.image }],
    });
    vi.mocked(meApi.removeCustomGame).mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderLibrary();
    await user.click(await screen.findByRole('button', { name: /^Grand Theft Auto V,/ }));
    await user.click(screen.getByRole('button', { name: '서재에서 빼기' }));

    await waitFor(() => expect(meApi.removeCustomGame).toHaveBeenCalledWith(3498));
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Grand Theft Auto V,/ })).not.toBeInTheDocument());
  });

  it('게임을 검색해서 추가하면 서재에 꽂힌다', async () => {
    vi.mocked(meApi.searchLibraryGames).mockResolvedValue({ games: [searched] });
    vi.mocked(meApi.addCustomGame).mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderLibrary();
    await user.click(await screen.findByRole('button', { name: '게임 추가' }));
    await user.type(screen.getByRole('searchbox', { name: '추가할 게임 검색' }), 'gta{Enter}');
    await user.click(await screen.findByRole('button', { name: '추가' }));

    expect(meApi.addCustomGame).toHaveBeenCalledWith({ id: 3498, name: searched.name, image: searched.image });
    expect(await screen.findByRole('button', { name: '추가됨' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /닫기|close/i }));
    expect(screen.getByRole('button', { name: /^Grand Theft Auto V,/ })).toBeInTheDocument();
  });
});
