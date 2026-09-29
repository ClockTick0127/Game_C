import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CalendarHeader } from './CalendarHeader';

function renderHeader(overrides: Partial<React.ComponentProps<typeof CalendarHeader>> = {}) {
  const props = {
    year: 2026,
    month: 8,
    totalCount: 12,
    loading: false,
    view: 'month' as const,
    unit: '달' as const,
    onViewChange: vi.fn(),
    onPrev: vi.fn(),
    onNext: vi.fn(),
    onToday: vi.fn(),
    onJump: vi.fn(),
    ...overrides,
  };
  render(<CalendarHeader {...props} />);
  return props;
}

describe('CalendarHeader — 보기 방식', () => {
  it('현재 보기를 눌린 상태로 표시하고, 다른 보기를 누르면 알린다', async () => {
    const user = userEvent.setup();
    const props = renderHeader({ view: 'week' });
    expect(screen.getByRole('button', { name: '주간' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '월간' })).toHaveAttribute('aria-pressed', 'false');

    await user.click(screen.getByRole('button', { name: '목록' }));
    expect(props.onViewChange).toHaveBeenCalledWith('list');
  });

  it('주간 보기에서는 이동 버튼이 주 단위이고 기간을 보여준다', () => {
    renderHeader({ view: 'week', unit: '주', rangeLabel: '9월 13일 – 19일' });
    expect(screen.getByRole('button', { name: '이전 주' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다음 주' })).toBeInTheDocument();
    expect(screen.getByText('9월 13일 – 19일')).toBeInTheDocument();
  });
});

describe('CalendarHeader', () => {
  it('현재 달과 게임 수를 보여준다 (month는 0부터라 9월)', () => {
    renderHeader();
    expect(screen.getByRole('button', { name: /2026년 9월/ })).toBeInTheDocument();
    expect(screen.getByText('출시 예정·출시작 12개')).toBeInTheDocument();
  });

  it('불러오는 중에는 개수 대신 안내를 보여준다', () => {
    renderHeader({ loading: true });
    expect(screen.getByText('불러오는 중…')).toBeInTheDocument();
  });

  it('이전·다음·오늘 버튼이 콜백을 부른다', async () => {
    const user = userEvent.setup();
    const props = renderHeader();
    await user.click(screen.getByRole('button', { name: '이전 달' }));
    await user.click(screen.getByRole('button', { name: '다음 달' }));
    await user.click(screen.getByRole('button', { name: '오늘' }));
    expect(props.onPrev).toHaveBeenCalledOnce();
    expect(props.onNext).toHaveBeenCalledOnce();
    expect(props.onToday).toHaveBeenCalledOnce();
  });

  describe('연·월 선택기', () => {
    it('월을 누르면 입력한 연도의 그 달로 이동하고 닫힌다', async () => {
      const user = userEvent.setup();
      const props = renderHeader();
      await user.click(screen.getByRole('button', { name: /2026년 9월/ }));

      const year = screen.getByRole('textbox', { name: '연도 입력' });
      await user.clear(year);
      await user.type(year, '2030');
      await user.click(screen.getByRole('button', { name: '3월' }));

      expect(props.onJump).toHaveBeenCalledWith(2030, 2);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('범위를 벗어난 연도는 이동할 수 없다', async () => {
      const user = userEvent.setup();
      const props = renderHeader();
      await user.click(screen.getByRole('button', { name: /2026년 9월/ }));

      const year = screen.getByRole('textbox', { name: '연도 입력' });
      await user.clear(year);
      await user.type(year, '1800');
      expect(screen.getByRole('button', { name: '3월' })).toBeDisabled();
      expect(year).toHaveAttribute('aria-invalid', 'true');
      expect(props.onJump).not.toHaveBeenCalled();
    });

    it('Enter로 현재 선택한 달에 이동한다', async () => {
      const user = userEvent.setup();
      const props = renderHeader();
      await user.click(screen.getByRole('button', { name: /2026년 9월/ }));
      await user.keyboard('{Enter}'); // 입력창에 자동 포커스되어 있다
      expect(props.onJump).toHaveBeenCalledWith(2026, 8);
    });

    it('Esc는 선택기만 닫고, 뒤쪽(게임 패널 등)이 같은 키로 닫히지 않도록 표시한다', async () => {
      const user = userEvent.setup();
      renderHeader();
      await user.click(screen.getByRole('button', { name: /2026년 9월/ }));
      expect(screen.getByRole('dialog', { name: '연도와 월 선택' })).toBeInTheDocument();

      let prevented = false;
      const spy = (e: KeyboardEvent) => {
        prevented = e.defaultPrevented;
      };
      window.addEventListener('keydown', spy);
      await user.keyboard('{Escape}');
      window.removeEventListener('keydown', spy);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(prevented).toBe(true);
    });
  });
});
