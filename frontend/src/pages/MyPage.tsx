import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { errorMessage } from '../api/client';
import * as meApi from '../api/me';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DDay } from '../components/DDay';
import { GameDetailModal } from '../components/GameDetail';
import { GameThumb } from '../components/GameThumb';
import { SteamSection } from '../components/SteamSection';
import { useAuth } from '../contexts/AuthContext';
import { useFavorites } from '../contexts/FavoritesContext';
import { useToast } from '../contexts/ToastContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import type { Game, User } from '../types';
import { daysUntil, formatKoreanDate } from '../utils/calendar';

export function MyPage() {
  useDocumentTitle('마이페이지');
  const { user } = useAuth();
  if (!user) return null; // RequireAuth가 보장하지만 타입을 좁히기 위해

  return (
    <div className="mypage">
      <h1 className="page-title">마이페이지</h1>
      <ProfileSection user={user} />
      <FavoritesSection />
      <SteamSection user={user} />
      <CalendarSubscribeSection />
      <PasswordSection />
      <SessionSection />
      <DeleteAccountSection />
    </div>
  );
}

function ProfileSection({ user }: { user: User }) {
  const { setUser } = useAuth();
  const [editing, setEditing] = useState(false);
  const [nickname, setNickname] = useState(user.nickname);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const nicknameRef = useRef<HTMLInputElement>(null);

  // 수정 모드로 들어가면 닉네임 입력창으로 포커스를 옮긴다
  useEffect(() => {
    if (editing) nicknameRef.current?.focus();
  }, [editing]);

  const startEdit = () => {
    setNickname(user.nickname);
    setError(null);
    setEditing(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      setUser((await meApi.updateNickname(nickname)).user);
      setEditing(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card">
      <h2>프로필</h2>
      <dl className="profile">
        <dt>닉네임</dt>
        <dd>
          {editing ? (
            <form className="inline-form" onSubmit={handleSubmit}>
              <input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                minLength={2}
                maxLength={20}
                required
                ref={nicknameRef}
              />
              <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
                저장
              </button>
              <button type="button" className="btn btn-sm" onClick={() => setEditing(false)}>
                취소
              </button>
            </form>
          ) : (
            <>
              {user.nickname}
              <button type="button" className="btn btn-sm" onClick={startEdit}>
                수정
              </button>
            </>
          )}
          {error && <p className="form-error">{error}</p>}
        </dd>
        <dt>이메일</dt>
        <dd>{user.email}</dd>
        <dt>가입일</dt>
        <dd>{new Date(user.createdAt).toLocaleDateString('ko-KR')}</dd>
      </dl>
    </section>
  );
}

function FavoritesSection() {
  const { favorites, loading, error, reload, toggle } = useFavorites();
  const { showError } = useToast();
  const [selected, setSelected] = useState<Game | null>(null);

  const upcoming = favorites.filter((g) => daysUntil(g.released) >= 0);
  // 이미 출시된 게임은 최근에 나온 것부터
  const released = favorites.filter((g) => daysUntil(g.released) < 0).reverse();

  const handleRemove = async (game: Game) => {
    try {
      await toggle(game);
    } catch (err) {
      showError(`관심 게임을 삭제하지 못했습니다: ${errorMessage(err)}`);
    }
  };

  const renderList = (games: Game[]) => (
    <ul className="fav-list">
      {games.map((game) => (
        <li key={game.id} className="fav-item">
          <button type="button" className="fav-main" onClick={() => setSelected(game)}>
            <GameThumb game={game} className="day-thumb" />
            <span className="day-info">
              <strong>{game.name}</strong>
              <span>
                {formatKoreanDate(game.released)} <DDay released={game.released} />
              </span>
            </span>
          </button>
          <button
            type="button"
            className="fav-remove"
            onClick={() => handleRemove(game)}
            aria-label={`${game.name} 관심 게임에서 삭제`}
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <section className="card">
      <h2>
        관심 게임 <span className="count">{favorites.length}</span>
      </h2>

      {loading ? (
        <p className="muted">불러오는 중…</p>
      ) : error ? (
        <div className="banner error">
          관심 게임을 불러오지 못했습니다: {error}
          <button type="button" onClick={reload}>
            다시 시도
          </button>
        </div>
      ) : favorites.length === 0 ? (
        <p className="muted">
          아직 관심 게임이 없습니다. <Link to="/">캘린더</Link>에서 게임을 눌러 ☆ 버튼으로 추가해 보세요.
        </p>
      ) : (
        <>
          <h3>출시 예정 ({upcoming.length})</h3>
          {upcoming.length ? renderList(upcoming) : <p className="muted">출시 예정인 관심 게임이 없습니다.</p>}
          {released.length > 0 && (
            <>
              <h3>출시됨 ({released.length})</h3>
              {renderList(released)}
            </>
          )}
        </>
      )}

      {selected && <GameDetailModal game={selected} onClose={() => setSelected(null)} />}
    </section>
  );
}

function CalendarSubscribeSection() {
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 구독 주소는 로그인 없이 열리는 비밀 주소라, 필요할 때 눌러서 만들고 보여준다
  const run = async (action: () => Promise<{ token: string }>) => {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      setToken((await action()).token);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
      setConfirmingReset(false);
    }
  };

  const url = token ? `${window.location.origin}/api/calendar/${token}.ics` : '';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setError('복사하지 못했습니다. 주소를 직접 선택해서 복사해 주세요.');
    }
  };

  return (
    <section className="card">
      <h2>캘린더 구독</h2>
      <p className="muted">
        관심 게임의 출시일을 구글 캘린더 · 애플 캘린더 · 아웃룩에서 함께 볼 수 있습니다. 관심 게임을 추가하거나 빼면
        구독한 캘린더에도 자동으로 반영됩니다.
      </p>
      {token ? (
        <>
          <div className="inline-form">
            <input
              className="subscribe-url"
              value={url}
              readOnly
              aria-label="캘린더 구독 주소"
              onFocus={(e) => e.target.select()}
            />
            <button type="button" className="btn btn-primary btn-sm" onClick={handleCopy}>
              {copied ? '복사됨' : '복사'}
            </button>
          </div>
          <p className="muted">
            캘린더 앱의 &quot;URL로 캘린더 추가(구독)&quot;에 붙여넣으세요. 이 주소를 아는 사람은 누구나 관심 게임
            목록을 볼 수 있으니 공유하지 마세요. 외부에서 접속 가능한 서버 주소여야 구글 캘린더가 가져올 수 있습니다.
          </p>
          <button type="button" className="btn btn-sm" onClick={() => setConfirmingReset(true)} disabled={busy}>
            주소 다시 만들기
          </button>
        </>
      ) : (
        <button type="button" className="btn" onClick={() => run(meApi.fetchCalendarToken)} disabled={busy}>
          {busy ? '만드는 중…' : '구독 주소 보기'}
        </button>
      )}
      {error && <p className="form-error">{error}</p>}
      {confirmingReset && (
        <ConfirmDialog
          title="구독 주소 다시 만들기"
          message="새 주소를 만들면 지금 쓰는 주소는 더 이상 동작하지 않습니다. 이미 구독 중인 캘린더는 새 주소로 다시 구독해야 합니다."
          confirmLabel="다시 만들기"
          busy={busy}
          onConfirm={() => run(meApi.resetCalendarToken)}
          onCancel={() => setConfirmingReset(false)}
        />
      )}
    </section>
  );
}

function PasswordSection() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirm) {
      setMessage({ type: 'error', text: '새 비밀번호 확인이 일치하지 않습니다.' });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await meApi.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirm('');
      setMessage({ type: 'success', text: '비밀번호를 변경했습니다. 다른 기기에서는 로그아웃되었습니다.' });
    } catch (err) {
      setMessage({ type: 'error', text: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card">
      <h2>비밀번호 변경</h2>
      <form className="form" onSubmit={handleSubmit}>
        <label className="field">
          <span>현재 비밀번호</span>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        <label className="field">
          <span>새 비밀번호</span>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            maxLength={100}
            required
          />
          <small>8자 이상</small>
        </label>
        <label className="field">
          <span>새 비밀번호 확인</span>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
          />
        </label>
        {message && <p className={message.type === 'error' ? 'form-error' : 'form-success'}>{message.text}</p>}
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? '변경 중…' : '비밀번호 변경'}
        </button>
      </form>
    </section>
  );
}

function SessionSection() {
  const { logoutAll } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await logoutAll();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <section className="card">
      <h2>로그인 관리</h2>
      <p className="muted">다른 기기나 브라우저에 로그인되어 있다면 한 번에 모두 로그아웃할 수 있습니다.</p>
      <button type="button" className="btn" onClick={() => setConfirming(true)} disabled={busy}>
        {busy ? '처리 중…' : '모든 기기에서 로그아웃'}
      </button>
      {error && <p className="form-error">{error}</p>}
      {confirming && (
        <ConfirmDialog
          title="모든 기기에서 로그아웃"
          message="이 기기를 포함한 모든 기기에서 로그아웃합니다. 계속하시겠습니까?"
          confirmLabel="로그아웃"
          busy={busy}
          onConfirm={handleConfirm}
          onCancel={() => setConfirming(false)}
        />
      )}
    </section>
  );
}

function DeleteAccountSection() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // 비밀번호를 입력하고 제출하면 먼저 확인 창을 띄운다
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setConfirming(true);
  };

  const handleConfirm = async () => {
    setDeleting(true);
    setError(null);
    try {
      await meApi.deleteAccount(password);
      // 홈으로 먼저 이동해야 로그아웃 처리 순간 로그인 페이지로 튕기지 않는다
      navigate('/', { replace: true });
      setUser(null);
    } catch (err) {
      setError(errorMessage(err));
      setDeleting(false);
      setConfirming(false);
    }
  };

  return (
    <section className="card danger-zone">
      <h2>회원 탈퇴</h2>
      <p className="muted">탈퇴하면 계정과 관심 게임 목록이 모두 삭제되며 복구할 수 없습니다.</p>
      <form className="inline-form" onSubmit={handleSubmit}>
        <input
          type="password"
          placeholder="현재 비밀번호"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          aria-label="현재 비밀번호"
          required
        />
        <button type="submit" className="btn btn-danger" disabled={deleting}>
          {deleting ? '탈퇴 처리 중…' : '회원 탈퇴'}
        </button>
      </form>
      {error && <p className="form-error">{error}</p>}
      {confirming && (
        <ConfirmDialog
          title="회원 탈퇴"
          message="정말 탈퇴하시겠습니까? 관심 게임을 포함한 모든 정보가 삭제되며 되돌릴 수 없습니다."
          confirmLabel="탈퇴하기"
          danger
          busy={deleting}
          onConfirm={handleConfirm}
          onCancel={() => setConfirming(false)}
        />
      )}
    </section>
  );
}
