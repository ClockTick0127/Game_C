import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as authApi from '../api/auth';
import * as meApi from '../api/me';
import { AuthProvider } from '../contexts/AuthContext';
import { FavoritesProvider } from '../contexts/FavoritesContext';
import { ToastProvider } from '../contexts/ToastContext';
import { makeGame, testUser } from '../test/fixtures';
import { MyPage } from './MyPage';

vi.mock('../api/auth');
vi.mock('../api/me');

function renderMyPage() {
  return render(
    <MemoryRouter initialEntries={['/mypage']}>
      <ToastProvider>
        <AuthProvider>
          <FavoritesProvider>
            <MyPage />
          </FavoritesProvider>
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(authApi.fetchMe).mockResolvedValue({ user: testUser });
  vi.mocked(meApi.fetchFavorites).mockResolvedValue({ games: [makeGame(1), makeGame(2)] });
});

describe('마이페이지 — 관심 게임', () => {
  it('관심 게임을 출시 예정 목록으로 보여준다', async () => {
    renderMyPage();
    expect(await screen.findByText('게임 1')).toBeInTheDocument();
    expect(screen.getByText('게임 2')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /출시 예정 \(2\)/ })).toBeInTheDocument();
  });

  it('목록을 불러오지 못하면 "관심 게임이 없다"가 아니라 오류와 다시 시도 버튼을 보여준다', async () => {
    const user = userEvent.setup();
    vi.mocked(meApi.fetchFavorites).mockRejectedValueOnce(new Error('서버 오류'));
    renderMyPage();

    expect(await screen.findByText(/관심 게임을 불러오지 못했습니다: 서버 오류/)).toBeInTheDocument();
    expect(screen.queryByText(/아직 관심 게임이 없습니다/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(await screen.findByText('게임 1')).toBeInTheDocument();
    expect(screen.queryByText(/관심 게임을 불러오지 못했습니다/)).not.toBeInTheDocument();
  });

  it('삭제에 실패하면 브라우저 alert 대신 알림을 띄우고 목록을 되돌린다', async () => {
    const user = userEvent.setup();
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    vi.mocked(meApi.removeFavorite).mockRejectedValue(new Error('서버 오류'));
    renderMyPage();

    await user.click(await screen.findByRole('button', { name: '게임 1 관심 게임에서 삭제' }));

    expect(await screen.findByText(/관심 게임을 삭제하지 못했습니다: 서버 오류/)).toBeInTheDocument();
    expect(screen.getByText('게임 1')).toBeInTheDocument();
    expect(alert).not.toHaveBeenCalled();
  });
});

describe('마이페이지 — 캘린더 구독', () => {
  it('처음에는 주소를 숨기고, 버튼을 누르면 토큰이 든 구독 주소를 보여준다', async () => {
    const user = userEvent.setup();
    vi.mocked(meApi.fetchCalendarToken).mockResolvedValue({ token: 'abc123' });
    renderMyPage();

    expect(screen.queryByLabelText('캘린더 구독 주소')).not.toBeInTheDocument();
    expect(meApi.fetchCalendarToken).not.toHaveBeenCalled();

    await user.click(await screen.findByRole('button', { name: '구독 주소 보기' }));
    const input = await screen.findByLabelText('캘린더 구독 주소');
    expect(input).toHaveValue(`${window.location.origin}/api/calendar/abc123.ics`);
  });

  it('주소를 다시 만들려면 확인 창을 거치고, 새 주소로 바뀐다', async () => {
    const user = userEvent.setup();
    vi.mocked(meApi.fetchCalendarToken).mockResolvedValue({ token: 'old' });
    vi.mocked(meApi.resetCalendarToken).mockResolvedValue({ token: 'new' });
    renderMyPage();

    await user.click(await screen.findByRole('button', { name: '구독 주소 보기' }));
    await user.click(await screen.findByRole('button', { name: '주소 다시 만들기' }));
    expect(meApi.resetCalendarToken).not.toHaveBeenCalled();

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: '다시 만들기' }));
    await waitFor(() =>
      expect(screen.getByLabelText('캘린더 구독 주소')).toHaveValue(`${window.location.origin}/api/calendar/new.ics`),
    );
  });

  it('주소를 만들지 못하면 오류를 보여준다', async () => {
    const user = userEvent.setup();
    vi.mocked(meApi.fetchCalendarToken).mockRejectedValue(new Error('서버 오류'));
    renderMyPage();

    await user.click(await screen.findByRole('button', { name: '구독 주소 보기' }));
    expect(await screen.findByText('서버 오류')).toBeInTheDocument();
  });
});

describe('마이페이지 — 회원 탈퇴', () => {
  async function submitPassword() {
    const user = userEvent.setup();
    renderMyPage();
    await screen.findByText('게임 1');
    await user.type(screen.getByLabelText('현재 비밀번호', { selector: '.danger-zone input' }), 'password-1234');
    await user.click(screen.getByRole('button', { name: '회원 탈퇴' }));
    return user;
  }

  it('제출하면 바로 탈퇴하지 않고 확인 창을 먼저 띄운다', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await submitPassword();

    expect(screen.getByRole('dialog', { name: '회원 탈퇴' })).toBeInTheDocument();
    expect(meApi.deleteAccount).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled(); // 브라우저 기본 confirm은 쓰지 않는다
  });

  it('취소하면 아무 일도 일어나지 않는다', async () => {
    const user = await submitPassword();
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '취소' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(meApi.deleteAccount).not.toHaveBeenCalled();
  });

  it('확인하면 입력한 비밀번호로 탈퇴를 요청한다', async () => {
    vi.mocked(meApi.deleteAccount).mockResolvedValue(undefined);
    const user = await submitPassword();
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '탈퇴하기' }));

    await waitFor(() => expect(meApi.deleteAccount).toHaveBeenCalledWith('password-1234'));
  });

  it('탈퇴에 실패하면 확인 창을 닫고 오류를 보여준다 (비밀번호 틀림 등)', async () => {
    vi.mocked(meApi.deleteAccount).mockRejectedValue(new Error('현재 비밀번호가 올바르지 않습니다.'));
    const user = await submitPassword();
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '탈퇴하기' }));

    expect(await screen.findByText('현재 비밀번호가 올바르지 않습니다.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('마이페이지 — 모든 기기에서 로그아웃', () => {
  it('확인 창에서 확인해야 요청을 보낸다', async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.logoutAll).mockResolvedValue(undefined);
    renderMyPage();
    await screen.findByText('게임 1');

    await user.click(screen.getByRole('button', { name: '모든 기기에서 로그아웃' }));
    const dialog = screen.getByRole('dialog', { name: '모든 기기에서 로그아웃' });
    expect(authApi.logoutAll).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: '로그아웃' }));
    await waitFor(() => expect(authApi.logoutAll).toHaveBeenCalledOnce());
  });

  it('취소하면 요청을 보내지 않는다', async () => {
    const user = userEvent.setup();
    renderMyPage();
    await screen.findByText('게임 1');

    await user.click(screen.getByRole('button', { name: '모든 기기에서 로그아웃' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '취소' }));
    expect(authApi.logoutAll).not.toHaveBeenCalled();
  });
});

describe('마이페이지 — 선호 플랫폼·장르', () => {
  it('고르면 저장 버튼이 켜지고, 저장하면 내 정보가 바뀐다', async () => {
    const user = userEvent.setup();
    vi.mocked(meApi.updatePreferences).mockResolvedValue({
      user: { ...testUser, preferredPlatform: 'PC', preferredGenre: 'RPG' },
    });
    renderMyPage();
    const save = (await screen.findByRole('heading', { name: '선호 플랫폼·장르' })).closest('section')!;
    const scope = within(save);
    expect(scope.getByRole('button', { name: '저장' })).toBeDisabled();

    await user.selectOptions(scope.getByRole('combobox', { name: '플랫폼' }), 'PC');
    await user.selectOptions(scope.getByRole('combobox', { name: '장르' }), 'RPG');
    await user.click(scope.getByRole('button', { name: '저장' }));

    expect(meApi.updatePreferences).toHaveBeenCalledWith('PC', 'RPG');
    expect(await scope.findByRole('status')).toHaveTextContent('저장했어요');
    expect(scope.getByRole('button', { name: '저장' })).toBeDisabled();
  });
});
