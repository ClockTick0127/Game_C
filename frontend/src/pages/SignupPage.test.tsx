import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as authApi from '../api/auth';
import * as meApi from '../api/me';
import { testUser } from '../test/fixtures';
import { renderApp } from '../test/render';
import { SignupPage } from './SignupPage';

vi.mock('../api/auth');
vi.mock('../api/me');

beforeEach(() => {
  vi.mocked(authApi.fetchMe).mockResolvedValue({ user: null });
  vi.mocked(meApi.fetchFavorites).mockResolvedValue({ games: [] });
});

async function fillForm(
  user: ReturnType<typeof userEvent.setup>,
  { password = 'password-1234', confirm = 'password-1234' } = {},
) {
  await user.type(await screen.findByLabelText('이메일'), 'new@example.com');
  await user.type(screen.getByLabelText(/닉네임/), '새회원');
  await user.type(screen.getByLabelText(/^비밀번호$|^비밀번호8자 이상$/), password);
  await user.type(screen.getByLabelText('비밀번호 확인'), confirm);
  await user.click(screen.getByRole('button', { name: '가입하기' }));
}

describe('SignupPage', () => {
  it('입력한 정보로 가입하고 홈으로 이동한다', async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.signup).mockResolvedValue({ user: testUser });
    renderApp(<SignupPage />, { route: '/signup', path: '/signup' });

    await fillForm(user);

    expect(authApi.signup).toHaveBeenCalledWith('new@example.com', 'password-1234', '새회원');
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/));
  });

  it('비밀번호 확인이 다르면 서버에 요청하지 않고 안내한다', async () => {
    const user = userEvent.setup();
    renderApp(<SignupPage />, { route: '/signup', path: '/signup' });

    await fillForm(user, { confirm: 'different-password' });

    expect(screen.getByText('비밀번호 확인이 일치하지 않습니다.')).toBeInTheDocument();
    expect(authApi.signup).not.toHaveBeenCalled();
  });

  it('서버가 거절하면(이미 가입된 이메일 등) 그 메시지를 보여 주고 다시 시도할 수 있다', async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.signup).mockRejectedValue(new Error('이미 가입된 이메일입니다.'));
    renderApp(<SignupPage />, { route: '/signup', path: '/signup' });

    await fillForm(user);

    expect(await screen.findByText('이미 가입된 이메일입니다.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '가입하기' })).toBeEnabled();
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/signup$/);
  });

  it('가입 후 redirect 경로로 돌아가고, 로그인 링크에도 그 경로를 이어 준다', async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.signup).mockResolvedValue({ user: testUser });
    renderApp(<SignupPage />, { route: '/signup?redirect=%2Fgoty', path: '/signup' });

    expect(await screen.findByRole('link', { name: '로그인' })).toHaveAttribute('href', '/login?redirect=%2Fgoty');
    await fillForm(user);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/goty$/));
  });
});
