import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as authApi from '../api/auth';
import * as meApi from '../api/me';
import { deferred, testUser } from '../test/fixtures';
import { renderApp } from '../test/render';
import { LoginPage } from './LoginPage';

vi.mock('../api/auth');
vi.mock('../api/me');

beforeEach(() => {
  vi.mocked(authApi.fetchMe).mockResolvedValue({ user: null });
  vi.mocked(meApi.fetchFavorites).mockResolvedValue({ games: [] });
});

async function fillAndSubmit(
  user: ReturnType<typeof userEvent.setup>,
  email = 'a@example.com',
  password = 'password-1234',
) {
  await user.type(await screen.findByLabelText('이메일'), email);
  await user.type(screen.getByLabelText('비밀번호'), password);
  await user.click(screen.getByRole('button', { name: '로그인' }));
}

describe('LoginPage', () => {
  it('입력한 이메일과 비밀번호로 로그인하고 홈으로 이동한다', async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.login).mockResolvedValue({ user: testUser });
    renderApp(<LoginPage />, { route: '/login', path: '/login' });

    await fillAndSubmit(user);

    expect(authApi.login).toHaveBeenCalledWith('a@example.com', 'password-1234');
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/));
  });

  it('redirect 쿼리가 있으면 로그인 후 그 경로로 돌아간다', async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.login).mockResolvedValue({ user: testUser });
    renderApp(<LoginPage />, { route: '/login?redirect=%2Fmypage', path: '/login' });

    await fillAndSubmit(user);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/mypage$/));
  });

  it('외부 주소로 보내려는 redirect는 무시하고 홈으로 이동한다 (오픈 리다이렉트 방지)', async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.login).mockResolvedValue({ user: testUser });
    renderApp(<LoginPage />, { route: '/login?redirect=%2F%2Fevil.example.com', path: '/login' });

    await fillAndSubmit(user);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/));
  });

  it('실패하면 서버 메시지를 보여 주고 다시 시도할 수 있게 버튼을 되살린다', async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.login).mockRejectedValue(new Error('이메일 또는 비밀번호가 올바르지 않습니다.'));
    renderApp(<LoginPage />, { route: '/login', path: '/login' });

    await fillAndSubmit(user, 'a@example.com', 'wrong-password');

    expect(await screen.findByText('이메일 또는 비밀번호가 올바르지 않습니다.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '로그인' })).toBeEnabled();
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/login$/);
  });

  it('요청 중에는 버튼을 잠그고 안내 문구를 바꾼다 (중복 제출 방지)', async () => {
    const user = userEvent.setup();
    const pending = deferred<{ user: typeof testUser }>();
    vi.mocked(authApi.login).mockReturnValue(pending.promise);
    renderApp(<LoginPage />, { route: '/login', path: '/login' });

    await fillAndSubmit(user);

    expect(screen.getByRole('button', { name: '로그인 중…' })).toBeDisabled();
    pending.resolve({ user: testUser });
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/));
  });

  it('이미 로그인한 상태면 폼을 보여 주지 않고 바로 이동한다', async () => {
    vi.mocked(authApi.fetchMe).mockResolvedValue({ user: testUser });
    renderApp(<LoginPage />, { route: '/login?redirect=%2Fmypage', path: '/login' });

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/mypage$/));
    expect(screen.queryByRole('button', { name: '로그인' })).not.toBeInTheDocument();
  });

  it('회원가입 링크에도 돌아갈 경로를 이어 준다', async () => {
    renderApp(<LoginPage />, { route: '/login?redirect=%2Fmypage', path: '/login' });
    expect(await screen.findByRole('link', { name: '회원가입' })).toHaveAttribute('href', '/signup?redirect=%2Fmypage');
  });
});
