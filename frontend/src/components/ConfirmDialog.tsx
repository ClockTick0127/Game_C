import { Modal } from './Modal';

interface Props {
  title: string;
  message: string;
  confirmLabel: string;
  /** 되돌릴 수 없는 작업이면 확인 버튼을 경고색으로 보여준다 */
  danger?: boolean;
  /** 확인 후 작업이 진행 중이면 버튼을 잠근다 */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** 브라우저 기본 confirm() 대신 쓰는 확인 창. Esc·바깥 클릭·취소 버튼으로 닫힌다. */
export function ConfirmDialog({ title, message, confirmLabel, danger, busy, onConfirm, onCancel }: Props) {
  return (
    <Modal title={title} onClose={onCancel} className="modal-confirm">
      <div className="confirm-body">
        <h2>{title}</h2>
        <p>{message}</p>
        <div className="confirm-actions">
          <button type="button" className="btn" onClick={onCancel}>
            취소
          </button>
          <button type="button" className={danger ? 'btn btn-danger' : 'btn btn-primary'} onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
