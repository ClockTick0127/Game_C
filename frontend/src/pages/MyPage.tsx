import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { errorMessage } from '../api/client';
import * as meApi from '../api/me';
import { DDay } from '../components/DDay';
import { GameDetailModal } from '../components/GameDetail';
import { GameThumb } from '../components/GameThumb';
import { useAuth } from '../contexts/AuthContext';
import { useFavorites } from '../contexts/FavoritesContext';
import type { Game, User } from '../types';
import { daysUntil, formatKoreanDate } from '../utils/calendar';

export function MyPage() {
  const { user } = useAuth();
  if (!user) return null; // RequireAuth가 보장하지만 타입을 좁히기 위해

  return (
    <div className="mypage">
      <h1 className="page-title">마이페이지</h1>
      <ProfileSection user={user} />
      <FavoritesSection />
      <PasswordSection />
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
              <input value={nickname} onChange={(e) => setNickname(e.target.value)} minLength={2} maxLength={20} required autoFocus />
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
  const { favorites, loading, toggle } = useFavorites();
  const [selected, setSelected] = useState<Game | null>(null);

  const upcoming = favorites.filter((g) => daysUntil(g.released) >= 0);
  // 이미 출시된 게임은 최근에 나온 것부터
  const released = favorites.filter((g) => daysUntil(g.released) < 0).reverse();

  const handleRemove = async (game: Game) => {
    try {
      await toggle(game);
    } catch (err) {
      alert(`관심 게임을 삭제하지 못했습니다: ${errorMessage(err)}`);
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
          <button type="button" className="fav-remove" onClick={() => handleRemove(game)} aria-label={`${game.name} 관심 게임에서 삭제`}>
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
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
        </label>
        {message && <p className={message.type === 'error' ? 'form-error' : 'form-success'}>{message.text}</p>}
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? '변경 중…' : '비밀번호 변경'}
        </button>
      </form>
    </section>
  );
}

function DeleteAccountSection() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!confirm('정말 탈퇴하시겠습니까? 관심 게임을 포함한 모든 정보가 삭제되며 되돌릴 수 없습니다.')) return;

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
    </section>
  );
}
