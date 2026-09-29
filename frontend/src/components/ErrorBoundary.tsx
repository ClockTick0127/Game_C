import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  failed: boolean;
}

/** 렌더링 중 예외가 나도 화면 전체가 비지 않도록 안내 화면을 보여준다. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="page-status" role="alert">
        <p>화면을 표시하는 중 문제가 발생했습니다.</p>
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
          새로고침
        </button>
      </div>
    );
  }
}
