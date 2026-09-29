import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

interface Toast {
  id: number;
  message: string;
}

interface ToastValue {
  /** 화면 아래에 오류 안내를 잠깐 띄운다 (브라우저 기본 alert() 대신) */
  showError: (message: string) => void;
}

const ToastContext = createContext<ToastValue | null>(null);

const DISMISS_AFTER_MS = 6000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const showError = useCallback(
    (message: string) => {
      const id = nextId.current++;
      setToasts((list) => [...list, { id, message }]);
      setTimeout(() => dismiss(id), DISMISS_AFTER_MS);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ showError }), [showError]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* 스크린 리더가 새 알림을 바로 읽어 주도록 aria-live 영역은 항상 그려 둔다 */}
      <div className="toast-region" role="alert" aria-live="assertive">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            <span>{t.message}</span>
            <button type="button" onClick={() => dismiss(t.id)} aria-label="알림 닫기">
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastValue {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast는 ToastProvider 안에서만 사용할 수 있습니다.');
  return value;
}
