import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider, useToast } from './ToastContext';

function Trigger({ message = '저장에 실패했습니다' }: { message?: string }) {
  const { showError } = useToast();
  return (
    <button type="button" onClick={() => showError(message)}>
      실행
    </button>
  );
}

afterEach(() => vi.useRealTimers());

describe('ToastContext', () => {
  it('알림 영역은 처음부터 aria-live로 존재하고, 메시지는 비어 있다', () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    const region = screen.getByRole('alert');
    expect(region).toHaveAttribute('aria-live', 'assertive');
    expect(region).toBeEmptyDOMElement();
  });

  it('showError로 메시지를 띄우고 닫기 버튼으로 없앤다', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    await user.click(screen.getByRole('button', { name: '실행' }));
    expect(screen.getByRole('alert')).toHaveTextContent('저장에 실패했습니다');

    await user.click(screen.getByRole('button', { name: '알림 닫기' }));
    expect(screen.getByRole('alert')).toBeEmptyDOMElement();
  });

  it('여러 알림이 쌓이고, 6초 뒤 각자 사라진다', () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <Trigger message="첫 번째" />
      </ToastProvider>,
    );
    const button = screen.getByRole('button', { name: '실행' });
    act(() => button.click());
    act(() => vi.advanceTimersByTime(3000));
    act(() => button.click());
    expect(screen.getAllByRole('button', { name: '알림 닫기' })).toHaveLength(2);

    act(() => vi.advanceTimersByTime(3000)); // 첫 알림은 6초가 지났다
    expect(screen.getAllByRole('button', { name: '알림 닫기' })).toHaveLength(1);
    act(() => vi.advanceTimersByTime(3000));
    expect(screen.queryByRole('button', { name: '알림 닫기' })).not.toBeInTheDocument();
  });

  it('Provider 밖에서 쓰면 오류', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Trigger />)).toThrow('ToastProvider');
  });
});
