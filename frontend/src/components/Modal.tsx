import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  title: string;
  onClose: () => void;
  /** .modal에 더할 클래스 (크기 조정 등) */
  className?: string;
  children: ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({ title, onClose, className, children }: Props) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 모달 안의 다른 요소(예: 드롭다운)가 이미 Esc를 처리했다면 모달까지 닫지 않는다
      if (e.key === 'Escape' && !e.defaultPrevented) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // 열릴 때 포커스를 모달 안으로 옮기고 배경 스크롤을 막는다. 닫힐 때 원래 있던 곳으로 되돌린다.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    modalRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      opener?.focus();
    };
  }, []);

  // Tab이 모달 밖으로 빠져나가지 않게 처음과 끝을 이어 준다.
  // JSX의 onKeyDown이 아니라 DOM 리스너로 다는 이유: role="dialog" 요소에 React 이벤트 핸들러를 붙이면 접근성 규칙(jsx-a11y)에 걸리고,
  // 여기서는 화면 요소에 반응하는 것이 아니라 대화상자 전체의 포커스 이동을 관리하는 것이기 때문이다.
  useEffect(() => {
    const modal = modalRef.current;
    if (!modal) return;

    const trapFocus = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const items = [...modal.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) {
        e.preventDefault();
        return;
      }
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === modal)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    modal.addEventListener('keydown', trapFocus);
    return () => modal.removeEventListener('keydown', trapFocus);
  }, []);

  return (
    // 바깥(배경) 클릭은 마우스 사용자를 위한 편의 기능이다. 키보드 사용자는 Esc와 닫기 버튼을 쓴다.
    // 배경 자체를 눌렀을 때만 닫고, 모달 안을 누른 클릭은 무시한다.
    <div className="modal-backdrop" role="presentation" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={modalRef}
        className={className ? `modal ${className}` : 'modal'}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <button type="button" className="modal-close" onClick={onClose} aria-label="닫기">
          ×
        </button>
        {children}
      </div>
    </div>
  );
}
