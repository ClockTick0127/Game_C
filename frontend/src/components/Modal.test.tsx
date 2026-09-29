import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Modal } from './Modal';

afterEach(() => {
  document.body.style.overflow = '';
});

function renderModal(onClose = vi.fn()) {
  const view = render(
    <>
      <button type="button">모달 밖 버튼</button>
      <Modal title="테스트 모달" onClose={onClose}>
        <button type="button">첫 번째</button>
        <button type="button">두 번째</button>
      </Modal>
    </>,
  );
  return { ...view, onClose };
}

describe('Modal', () => {
  it('열리면 포커스가 모달로 들어오고 배경 스크롤이 잠긴다', () => {
    renderModal();
    expect(screen.getByRole('dialog', { name: '테스트 모달' })).toHaveFocus();
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('Tab이 모달 밖으로 나가지 않고 처음과 끝을 오간다', async () => {
    const user = userEvent.setup();
    renderModal();
    const close = screen.getByRole('button', { name: '닫기' });
    const second = screen.getByRole('button', { name: '두 번째' });

    await user.tab(); // 모달 → 닫기 버튼
    expect(close).toHaveFocus();
    await user.tab();
    await user.tab();
    expect(second).toHaveFocus();
    await user.tab(); // 끝에서 다시 처음으로
    expect(close).toHaveFocus();
    await user.tab({ shift: true }); // 처음에서 거꾸로 가면 끝으로
    expect(second).toHaveFocus();
    expect(screen.getByRole('button', { name: '모달 밖 버튼' })).not.toHaveFocus();
  });

  it('Esc, 닫기 버튼, 배경 클릭으로 닫힌다', async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: '닫기' }));
    expect(onClose).toHaveBeenCalledTimes(2);

    await user.click(screen.getByRole('dialog').parentElement!); // 배경
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('모달 안을 클릭해도 닫히지 않는다', async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();
    await user.click(screen.getByRole('button', { name: '첫 번째' }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('안쪽 요소가 이미 처리한 Esc는 무시한다', () => {
    // window 리스너 중 먼저 등록된 쪽이 preventDefault 하면 모달이 닫히지 않아야 한다
    const claim = (e: KeyboardEvent) => e.preventDefault();
    window.addEventListener('keydown', claim);
    const { onClose } = renderModal();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    window.removeEventListener('keydown', claim);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('닫히면 스크롤 잠금을 풀고 원래 포커스를 되돌려 준다', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { rerender } = render(<button type="button">열기 버튼</button>);
    const opener = screen.getByRole('button', { name: '열기 버튼' });
    await user.click(opener);
    expect(opener).toHaveFocus();

    rerender(
      <>
        <button type="button">열기 버튼</button>
        <Modal title="테스트 모달" onClose={onClose}>
          내용
        </Modal>
      </>,
    );
    expect(screen.getByRole('dialog')).toHaveFocus();

    rerender(<button type="button">열기 버튼</button>);
    expect(document.body.style.overflow).not.toBe('hidden');
    expect(screen.getByRole('button', { name: '열기 버튼' })).toHaveFocus();
  });
});
