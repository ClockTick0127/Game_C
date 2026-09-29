import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

function Bomb(): never {
  throw new Error('의도한 테스트 오류');
}

describe('ErrorBoundary', () => {
  it('오류가 없으면 자식을 그대로 보여준다', () => {
    render(
      <ErrorBoundary>
        <p>정상 화면</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('정상 화면')).toBeInTheDocument();
  });

  it('자식이 렌더링 중 예외를 던지면 안내와 새로고침 버튼을 보여준다', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('화면을 표시하는 중 문제가 발생했습니다.');
    expect(screen.getByRole('button', { name: '새로고침' })).toBeInTheDocument();
    // 원인 파악을 위해 오류를 콘솔에도 남긴다
    expect(log).toHaveBeenCalled();
  });
});
