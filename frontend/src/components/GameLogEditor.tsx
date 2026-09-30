import { useState } from 'react';
import { errorMessage } from '../api/client';
import type { GameLog, GameLogInput, GameStatus } from '../types';
import { GAME_STATUSES, MAX_NOTE_LENGTH, STATUS_ICONS, STATUS_LABELS } from '../utils/library';

interface Props {
  /** 이미 남긴 기록. 없으면 undefined */
  log: GameLog | undefined;
  onSave: (value: GameLogInput) => Promise<void>;
  onClear: () => Promise<void>;
}

/** 게임 하나의 플레이 상태(태그)·별점·메모를 고치는 칸. 저장 버튼을 눌러야 서버에 반영된다 */
export function GameLogEditor({ log, onSave, onClear }: Props) {
  const [status, setStatus] = useState<GameStatus | null>(log?.status ?? null);
  const [rating, setRating] = useState<number | null>(log?.rating ?? null);
  const [note, setNote] = useState(log?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const trimmed = note.trim();
  const empty = status === null && rating === null && trimmed === '';
  const dirty = status !== (log?.status ?? null) || rating !== (log?.rating ?? null) || trimmed !== (log?.note ?? '');

  /** 값을 바꾸면 "저장했어요"는 더 이상 사실이 아니다 */
  const edit = (change: () => void) => {
    change();
    setSaved(false);
  };

  const run = async (action: () => Promise<void>, done: () => void) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      done();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(
      () => onSave({ status, rating, note: trimmed }),
      () => {
        setNote(trimmed);
        setSaved(true);
      },
    );

  const clear = () =>
    run(onClear, () => {
      setStatus(null);
      setRating(null);
      setNote('');
      setSaved(false);
    });

  return (
    <section className="log-editor" aria-label="내 기록">
      <h3>내 기록</h3>

      <div className="log-row">
        <div className="status-tags" role="group" aria-label="플레이 상태">
          {GAME_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              className="status-tag"
              data-status={s}
              aria-pressed={status === s}
              // 누른 태그를 다시 누르면 상태를 정하지 않은 것으로 돌아간다
              onClick={() => edit(() => setStatus(status === s ? null : s))}
            >
              <span aria-hidden="true">{STATUS_ICONS[s]}</span> {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      <div className="log-row">
        <div className="stars" role="group" aria-label="별점">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              className={rating !== null && n <= rating ? 'star-btn on' : 'star-btn'}
              aria-label={`별 ${n}개`}
              aria-pressed={rating === n}
              // 고른 별을 다시 누르면 별점을 지운다
              onClick={() => edit(() => setRating(rating === n ? null : n))}
            >
              ★
            </button>
          ))}
        </div>
        <span className="muted log-rating-text">{rating === null ? '별점 없음' : `${rating} / 5`}</span>
      </div>

      <textarea
        className="log-note"
        value={note}
        onChange={(e) => edit(() => setNote(e.target.value))}
        placeholder="한줄평이나 메모를 남겨 보세요"
        aria-label="메모"
        maxLength={MAX_NOTE_LENGTH}
        rows={3}
      />
      <span className="log-count muted" aria-hidden="true">
        {note.length} / {MAX_NOTE_LENGTH}
      </span>

      <div className="log-actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={busy || empty || !dirty}>
          {busy ? '저장 중…' : '저장'}
        </button>
        {log && (
          <button type="button" className="btn btn-sm" onClick={clear} disabled={busy}>
            기록 지우기
          </button>
        )}
        {saved && (
          <span className="form-success" role="status">
            저장했어요.
          </span>
        )}
      </div>
      {error && <p className="form-error">{error}</p>}
    </section>
  );
}
