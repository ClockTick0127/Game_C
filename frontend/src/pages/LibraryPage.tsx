import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { errorMessage } from '../api/client';
import * as meApi from '../api/me';
import { Modal } from '../components/Modal';
import { SteamAchievementList } from '../components/SteamSection';
import { useAuth } from '../contexts/AuthContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import type { SteamOwnedGame, SteamOwnedGames } from '../types';
import { coverUrls, filterAndSort, formatTotalHours, SORT_LABELS, type LibrarySort } from '../utils/library';
import { formatPlaytime } from '../utils/steam';

/** 한 번에 꺼내 놓는 상자 수. 수천 개를 한꺼번에 그리면 이미지 요청이 몰린다 */
const PAGE_SIZE = 60;

export function LibraryPage() {
  useDocumentTitle('내 서재');
  const { user } = useAuth();

  const [data, setData] = useState<SteamOwnedGames | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<LibrarySort>('playtime');
  const [shown, setShown] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<SteamOwnedGame | null>(null);

  const linked = Boolean(user?.steamId);
  // 다시 시도 버튼이 누를 때마다 올려서 이펙트를 다시 실행한다
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!linked) return;
    const controller = new AbortController();
    meApi
      .fetchSteamGames()
      .then((result) => !controller.signal.aborted && setData(result))
      .catch((err) => !controller.signal.aborted && setError(errorMessage(err)));
    return () => controller.abort();
  }, [linked, attempt]);

  const retry = () => {
    setError(null);
    setAttempt(attempt + 1);
  };

  const games = useMemo(() => (data ? filterAndSort(data.games, query, sort) : []), [data, query, sort]);
  const totalMinutes = useMemo(() => data?.games.reduce((sum, g) => sum + g.playtimeMinutes, 0) ?? 0, [data]);

  return (
    <div className="library">
      <h1 className="page-title">내 서재</h1>
      <p className="library-intro">Steam에 있는 내 게임들을 책장에 꽂아 봤어요. 상자를 누르면 업적을 볼 수 있어요.</p>

      {!linked ? (
        <div className="card">
          <p className="muted">
            Steam 계정을 연동하면 내 게임이 서재에 꽂혀요. <Link to="/mypage">마이페이지</Link>에서 연동해 주세요.
          </p>
        </div>
      ) : error ? (
        <div className="banner error">
          내 게임을 불러오지 못했습니다: {error}
          <button type="button" onClick={retry}>
            다시 시도
          </button>
        </div>
      ) : !data ? (
        <p className="page-status">서재를 정리하는 중…</p>
      ) : data.private ? (
        <div className="card">
          <p className="muted">
            보유 게임을 볼 수 없어요. Steam 프로필의 &quot;게임 세부 정보&quot;를 &quot;공개&quot;로 바꾼 뒤 다시 열어
            주세요. (Steam → 프로필 편집 → 개인정보 보호 설정)
          </p>
        </div>
      ) : data.games.length === 0 ? (
        <div className="card">
          <p className="muted">아직 서재가 비어 있어요. Steam에서 게임을 담으면 여기에 꽂혀요.</p>
        </div>
      ) : (
        <>
          <div className="cal-filters" role="search">
            <input
              className="filter-search"
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setShown(PAGE_SIZE);
              }}
              placeholder="내 게임 검색"
              aria-label="내 게임 검색"
              maxLength={50}
            />
            <select
              className="filter-select"
              value={sort}
              onChange={(e) => setSort(e.target.value as LibrarySort)}
              aria-label="정렬"
            >
              {(Object.keys(SORT_LABELS) as LibrarySort[]).map((key) => (
                <option key={key} value={key}>
                  {SORT_LABELS[key]}
                </option>
              ))}
            </select>
            <span className="filter-result">
              {games.length === data.games.length
                ? `게임 ${data.games.length.toLocaleString('ko-KR')}개 · 총 ${formatTotalHours(totalMinutes)} 플레이`
                : `${games.length.toLocaleString('ko-KR')} / ${data.games.length.toLocaleString('ko-KR')}개`}
            </span>
          </div>

          {games.length === 0 ? (
            <p className="page-status">찾는 게임이 서재에 없어요.</p>
          ) : (
            <ul className="shelf">
              {games.slice(0, shown).map((game) => (
                <li key={game.appId}>
                  <GameCase game={game} onOpen={() => setSelected(game)} />
                </li>
              ))}
            </ul>
          )}
          {shown < games.length && (
            <div className="pager">
              <button type="button" className="btn" onClick={() => setShown(shown + PAGE_SIZE)}>
                더 꺼내 보기 ({(games.length - shown).toLocaleString('ko-KR')}개 남음)
              </button>
            </div>
          )}
        </>
      )}

      {selected && <GameModal game={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

/** 표지 이미지. 세로형 → 가로형 → 글자 순으로 물러난다 */
function Cover({ game }: { game: SteamOwnedGame }) {
  const urls = coverUrls(game.appId);
  const [stage, setStage] = useState(0);
  if (stage >= urls.length) {
    return (
      <span className="case-fallback" aria-hidden="true">
        {game.name}
      </span>
    );
  }
  return <img src={urls[stage]} alt="" loading="lazy" onError={() => setStage(stage + 1)} />;
}

/** 책장에 꽂힌 PC 게임 상자 한 개 */
function GameCase({ game, onOpen }: { game: SteamOwnedGame; onOpen: () => void }) {
  return (
    <button
      type="button"
      className="case"
      onClick={onOpen}
      aria-label={`${game.name}, ${formatPlaytime(game.playtimeMinutes)}`}
    >
      <span className="case-spine" aria-hidden="true" />
      <span className="case-cover">
        <Cover game={game} />
        <span className="case-shine" aria-hidden="true" />
        <span className="case-caption" aria-hidden="true">
          <strong>{game.name}</strong>
          <span>{formatPlaytime(game.playtimeMinutes)}</span>
        </span>
      </span>
    </button>
  );
}

function GameModal({ game, onClose }: { game: SteamOwnedGame; onClose: () => void }) {
  return (
    <Modal title={game.name} onClose={onClose} className="library-modal">
      <div className="library-modal-head">
        <div className="case case-static" aria-hidden="true">
          <span className="case-spine" />
          <span className="case-cover">
            <Cover game={game} />
            <span className="case-shine" />
          </span>
        </div>
        <div>
          <h2>{game.name}</h2>
          <p className="muted">
            플레이 시간 {formatPlaytime(game.playtimeMinutes)}
            {game.lastPlayedAt && ` · 마지막 플레이 ${new Date(game.lastPlayedAt).toLocaleDateString('ko-KR')}`}
          </p>
          <a href={`https://store.steampowered.com/app/${game.appId}/`} target="_blank" rel="noreferrer">
            Steam 스토어에서 보기
          </a>
        </div>
      </div>
      <SteamAchievementList appId={game.appId} />
    </Modal>
  );
}
