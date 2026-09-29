import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTheme, readStoredTheme } from '../utils/theme';
import { ThemeToggle } from './ThemeToggle';

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

describe('ThemeToggle', () => {
  it('누를 때마다 시스템 → 라이트 → 다크 → 시스템 순으로 바뀌고 <html>과 저장소에 반영된다', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    const button = () => screen.getByRole('button', { name: /테마/ });
    const html = document.documentElement;

    expect(button()).toHaveAccessibleName('테마: 시스템 설정. 눌러서 변경');
    expect(html).not.toHaveAttribute('data-theme');

    await user.click(button());
    expect(button()).toHaveAccessibleName('테마: 라이트. 눌러서 변경');
    expect(html).toHaveAttribute('data-theme', 'light');
    expect(localStorage.getItem('theme')).toBe('light');

    await user.click(button());
    expect(html).toHaveAttribute('data-theme', 'dark');
    expect(localStorage.getItem('theme')).toBe('dark');

    await user.click(button());
    expect(html).not.toHaveAttribute('data-theme');
    expect(localStorage.getItem('theme')).toBeNull();
  });

  it('저장된 선택을 처음부터 적용한다', () => {
    localStorage.setItem('theme', 'dark');
    render(<ThemeToggle />);
    expect(screen.getByRole('button', { name: /테마/ })).toHaveAccessibleName('테마: 다크. 눌러서 변경');
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  });
});

describe('theme 유틸', () => {
  it('잘못된 저장값은 무시하고, 저장소를 못 쓰면 시스템 설정으로 동작한다', () => {
    localStorage.setItem('theme', 'purple');
    expect(readStoredTheme()).toBe('system');

    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readStoredTheme()).toBe('system');
  });

  it('순서는 시스템 → 라이트 → 다크', () => {
    expect(nextTheme('system')).toBe('light');
    expect(nextTheme('light')).toBe('dark');
    expect(nextTheme('dark')).toBe('system');
  });
});
