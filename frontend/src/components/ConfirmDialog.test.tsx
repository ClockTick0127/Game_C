import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';

function renderDialog(props: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ConfirmDialog
      title="회원 탈퇴"
      message="정말 탈퇴하시겠습니까?"
      confirmLabel="탈퇴하기"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...props}
    />,
  );
  return { onConfirm, onCancel };
}

describe('ConfirmDialog', () => {
  it('제목과 메시지를 대화상자로 보여준다', () => {
    renderDialog();
    const dialog = screen.getByRole('dialog', { name: '회원 탈퇴' });
    expect(dialog).toHaveTextContent('정말 탈퇴하시겠습니까?');
  });

  it('확인 버튼은 onConfirm, 취소 버튼은 onCancel을 부른다', async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = renderDialog();

    await user.click(screen.getByRole('button', { name: '탈퇴하기' }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onCancel).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: '취소' }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('Esc로 취소된다', async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = renderDialog();
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('작업 중(busy)에는 확인 버튼이 잠긴다', () => {
    renderDialog({ busy: true });
    expect(screen.getByRole('button', { name: '탈퇴하기' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '취소' })).toBeEnabled();
  });

  it('danger면 경고색 버튼을 쓴다', () => {
    renderDialog({ danger: true });
    expect(screen.getByRole('button', { name: '탈퇴하기' })).toHaveClass('btn-danger');
  });
});
