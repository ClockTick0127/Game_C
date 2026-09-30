import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { errorMessage } from '../api/client';
import * as meApi from '../api/me';
import { useAuth } from '../contexts/AuthContext';
import type { SteamAchievements, SteamOwnedGame, SteamOwnedGames, SteamStatus, User } from '../types';
import { formatPlaytime, steamAuthUrl, steamResult } from '../utils/steam';
import { ConfirmDialog } from './ConfirmDialog';
import { SteamWishlist } from './SteamWishlist';

const PAGE_SIZE = 30;

/** 마이페이지의 Steam 연동: 계정 연결·해제, 보유 게임, 게임별 업적 */
export function SteamSection({ user }: { user: User }) {
  const [searchParams] = useSearchParams();
  const result = steamResult(searchParams.get('steam'));

  return (
    <section className="card">
      <h2>Steam 연동</h2>
      {result && <p className={result.type === 'error' ? 'form-error' : 'form-success'}>{result.text}</p>}
      {user.steamId ? (
        <LinkedSteam />
      ) : (
        <>
          <p className="muted">
            Steam 계정을 연동하면 &quot;Steam으로 로그인&quot;을 쓸 수 있고, 보유 게임과 업적을 볼 수 있습니다. Steam
            비밀번호는 Steam 페이지에서만 입력하며 이 사이트에는 전달되지 않습니다.
          </p>
          {/* Steam 페이지로 이동해야 하므로 라우터 링크가 아니라 일반 링크를 쓴다 */}
          <a className="btn steam-btn" href={steamAuthUrl('link')}>
            Steam 계정 연동
          </a>
        </>
      )}
    </section>
  );
}

function LinkedSteam() {
  const { setUser } = useAuth();
  const [status, setStatus] = useState<SteamStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    meApi
      .fetchSteamStatus()
      .then(setStatus)
      .catch((err) => setError(errorMessage(err)));
  }, []);

  const handleUnlink = async () => {
    setBusy(true);
    try {
      setUser((await meApi.unlinkSteam()).user);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <>
      <div className="steam-profile">
        {status?.profile?.avatar && <img src={status.profile.avatar} alt="" width={48} height={48} />}
        <div>
          <strong>{status?.profile?.name ?? 'Steam 계정 연동됨'}</strong>
          {status?.profile?.url && (
            <>
              {' '}
              <a href={status.profile.url} target="_blank" rel="noopener noreferrer">
                프로필 보기
              </a>
            </>
          )}
        </div>
        <button type="button" className="btn btn-sm" onClick={() => setConfirming(true)} disabled={busy}>
          연동 해제
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}
      {status &&
        (status.configured ? (
          <SteamGames />
        ) : (
          <p className="muted">서버에 Steam API 키가 설정되지 않아 보유 게임과 업적은 볼 수 없습니다.</p>
        ))}
      {/* 위시리스트는 Steam 공개 API를 쓰므로 서버에 API 키가 없어도 된다 */}
      {status && <SteamWishlist />}
      {confirming && (
        <ConfirmDialog
          title="Steam 연동 해제"
          message="연동을 해제하면 Steam으로 로그인할 수 없게 됩니다. 이메일과 비밀번호로는 계속 로그인할 수 있습니다."
          confirmLabel="해제"
          busy={busy}
          onConfirm={handleUnlink}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
}

function SteamGames() {
  const [data, setData] = useState<SteamOwnedGames | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await meApi.fetchSteamGames());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  if (!data) {
    return (
      <>
        <button type="button" className="btn" onClick={load} disabled={loading}>
          {loading ? '불러오는 중…' : '보유 게임 불러오기'}
        </button>
        {error && <p className="form-error">{error}</p>}
      </>
    );
  }

  if (data.private) {
    return (
      <p className="muted">
        보유 게임을 볼 수 없습니다. Steam 프로필의 &quot;게임 세부 정보&quot;를 &quot;공개&quot;로 바꾼 뒤 다시 시도해
        주세요. (Steam → 프로필 편집 → 개인정보 보호 설정)
      </p>
    );
  }

  return (
    <>
      <h3>
        보유 게임 <span className="count">{data.games.length}</span>
      </h3>
      <ul className="steam-games">
        {data.games.slice(0, shown).map((game) => (
          <li key={game.appId}>
            <SteamGameRow
              game={game}
              open={selected === game.appId}
              onToggle={() => setSelected(selected === game.appId ? null : game.appId)}
            />
          </li>
        ))}
      </ul>
      {shown < data.games.length && (
        <button type="button" className="btn btn-sm" onClick={() => setShown(shown + PAGE_SIZE)}>
          더 보기 ({data.games.length - shown}개 남음)
        </button>
      )}
    </>
  );
}

function SteamGameRow({ game, open, onToggle }: { game: SteamOwnedGame; open: boolean; onToggle: () => void }) {
  return (
    <>
      <button type="button" className="steam-game" onClick={onToggle} aria-expanded={open}>
        <img src={game.image} alt="" loading="lazy" width={92} height={43} />
        <span className="day-info">
          <strong>{game.name}</strong>
          <span>{formatPlaytime(game.playtimeMinutes)}</span>
        </span>
      </button>
      {open && <SteamAchievementList appId={game.appId} />}
    </>
  );
}

export function SteamAchievementList({ appId }: { appId: number }) {
  const [data, setData] = useState<SteamAchievements | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    meApi
      .fetchSteamAchievements(appId)
      .then((result) => !controller.signal.aborted && setData(result))
      .catch((err) => !controller.signal.aborted && setError(errorMessage(err)));
    return () => controller.abort();
  }, [appId]);

  if (error) return <p className="form-error">{error}</p>;
  if (!data) return <p className="muted">업적을 불러오는 중…</p>;
  if (data.private) {
    return <p className="muted">업적을 볼 수 없습니다. Steam 프로필의 게임 세부 정보를 공개로 바꿔 주세요.</p>;
  }
  if (!data.supported) return <p className="muted">이 게임에는 업적이 없습니다.</p>;

  const unlocked = data.achievements.filter((a) => a.achieved).length;
  return (
    <div className="steam-achievements">
      <p>
        <strong>
          업적 {unlocked} / {data.achievements.length}
        </strong>{' '}
        ({Math.round((unlocked / data.achievements.length) * 100)}%)
      </p>
      <ul>
        {data.achievements.map((a) => (
          <li key={a.id} className={a.achieved ? 'unlocked' : 'locked'}>
            <span aria-hidden="true">{a.achieved ? '🏆' : '🔒'}</span>
            <span>
              <strong>{a.name}</strong>
              {a.description && <small>{a.description}</small>}
              {a.unlockedAt && <small>{new Date(a.unlockedAt).toLocaleDateString('ko-KR')} 달성</small>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
