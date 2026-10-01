import { useState } from 'react';
import { Link } from 'react-router';
import { errorMessage } from '../api/client';
import * as meApi from '../api/me';
import { useAuth } from '../contexts/AuthContext';
import type { User } from '../types';
import { showcasePath } from '../utils/showcase';

/** 서재의 진열장 공개 여부 토글. 공개 중이면 공유할 주소를 보여 준다 */
export function ShowcaseShare({ user }: { user: User }) {
  const { setUser } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const toggle = async (next: boolean) => {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      setUser((await meApi.setProfilePublic(next)).user);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const path = showcasePath(user.nickname);
  const url = `${window.location.origin}${path}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setError('복사하지 못했습니다. 주소를 직접 선택해서 복사해 주세요.');
    }
  };

  return (
    <section className="showcase-share" aria-label="진열장 공개">
      <label className="showcase-toggle">
        <input
          type="checkbox"
          checked={user.profilePublic}
          disabled={busy}
          onChange={(e) => toggle(e.target.checked)}
        />
        <span>진열장 공개</span>
      </label>
      <p className="muted">
        {user.profilePublic
          ? '아래 주소를 아는 사람은 로그인하지 않아도 내 진열장을 볼 수 있어요. 닉네임을 바꾸면 주소도 바뀌어요.'
          : '공개하면 로그인하지 않은 사람도 진열장에 꽂은 게임의 이름·표지·플레이 시간·상태·별점을 볼 수 있어요. 메모와 서재의 나머지 게임은 보이지 않아요.'}
      </p>
      {user.profilePublic && (
        <div className="inline-form">
          <input
            className="subscribe-url"
            value={url}
            readOnly
            aria-label="진열장 공개 주소"
            onFocus={(e) => e.target.select()}
          />
          <button type="button" className="btn btn-primary btn-sm" onClick={copy}>
            {copied ? '복사됨' : '복사'}
          </button>
          <Link className="btn btn-sm" to={path}>
            열어 보기
          </Link>
        </div>
      )}
      {error && <p className="form-error">{error}</p>}
    </section>
  );
}
