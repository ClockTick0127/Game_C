import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { errorMessage } from '../api/client';
import { findGames } from '../api/games';
import * as meApi from '../api/me';
import { DDay } from '../components/DDay';
import { GameDetailModal } from '../components/GameDetail';
import { GameThumb } from '../components/GameThumb';
import { LibraryAddButton } from '../components/LibraryAddButton';
import { useAuth } from '../contexts/AuthContext';
import { useFavorites } from '../contexts/FavoritesContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import type { Game } from '../types';

type Result = { kind: 'error'; message: string } | { kind: 'ok'; games: Game[] };

/** "2020 · PC, PlayStation 5 · RPG, Action" — 출시일이 정해지지 않은 게임은 "출시일 미정" */
function summary(game: Game): string {
  return [
    game.released ? game.released.slice(0, 4) : '출시일 미정',
    game.platforms.slice(0, 3).join(', '),
    game.genres.slice(0, 2).join(', '),
  ]
    .filter(Boolean)
    .join(' · ');
}

/** /search?q=… — 그 달에 나온 게임이 아니라 RAWG의 모든 게임을 이름으로 찾아 상세를 보고 관심 게임에 담는다 */
export function SearchPage() {
  useDocumentTitle('게임 검색');
  const { user } = useAuth();
  const userId = user?.id;
  const { isFavorite } = useFavorites();
  const [searchParams, setSearchParams] = useSearchParams();
  const q = (searchParams.get('q') ?? '').trim();

  const [input, setInput] = useState(q);
  const [selected, setSelected] = useState<Game | null>(null);
  // 다시 시도 버튼이 누를 때마다 올려서 이펙트를 다시 실행한다
  const [attempt, setAttempt] = useState(0);
  // 어느 검색의 결과인지 함께 저장해 두면, 검색어가 바뀌었을 때 이전 결과를 버리고 찾는 중으로 취급할 수 있다
  const requestKey = `${q}#${attempt}`;
  const [loaded, setLoaded] = useState<{ key: string; result: Result } | null>(null);
  const result = loaded?.key === requestKey ? loaded.result : null;

  useEffect(() => {
    if (!q) return;
    const controller = new AbortController();
    const finish = (r: Result) => !controller.signal.aborted && setLoaded({ key: requestKey, result: r });
    findGames(q, controller.signal)
      .then(({ games }) => finish({ kind: 'ok', games }))
      .catch((err) => finish({ kind: 'error', message: errorMessage(err) }));
    return () => controller.abort();
  }, [q, requestKey]);

  // 서재에 직접 추가한 게임의 RAWG 번호. 어느 사용자의 것인지 함께 기억해, 로그인한 사용자가 바뀌면 다시 불러온다
  const [library, setLibrary] = useState<{ userId: number; ids: Set<number> } | null>(null);
  useEffect(() => {
    if (userId === undefined) return;
    let cancelled = false;
    meApi
      .fetchCustomGames()
      // 목록을 못 불러와도 추가는 할 수 있게 둔다. 이미 있는 게임을 다시 추가해도 서버는 한 번만 저장한다
      .then(({ games }) => !cancelled && setLibrary({ userId, ids: new Set(games.map((g) => g.id)) }))
      .catch(() => !cancelled && setLibrary({ userId, ids: new Set() }));
    return () => {
      cancelled = true;
    };
  }, [userId]);
  const libraryIds = library && library.userId === userId ? library.ids : null;

  const addToLibrary = async (game: Game) => {
    await meApi.addCustomGame({ id: game.id, name: game.name, image: game.image });
    setLibrary((cur) => (cur && cur.userId === userId ? { ...cur, ids: new Set(cur.ids).add(game.id) } : cur));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next = input.trim();
    if (next) setSearchParams({ q: next });
  };

  return (
    <div className="search-page">
      <h1 className="page-title">게임 검색</h1>
      <p className="library-intro">
        출시 시기와 상관없이 어떤 게임이든 이름으로 찾아 자세히 보고, 관심 게임에 담을 수 있어요. 한글 이름도 찾아져요.
      </p>

      <form className="add-game-form" onSubmit={submit} role="search">
        <input
          className="filter-search"
          type="search"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="게임 이름 (예: 엘든 링, Hades)"
          aria-label="게임 이름"
          maxLength={100}
        />
        <button type="submit" className="btn btn-primary btn-sm" disabled={!input.trim()}>
          검색
        </button>
      </form>

      {!q ? null : !result ? (
        <p className="page-status">&quot;{q}&quot;을(를) 찾는 중…</p>
      ) : result.kind === 'error' ? (
        <div className="banner error">
          검색하지 못했습니다: {result.message}
          <button type="button" onClick={() => setAttempt(attempt + 1)}>
            다시 시도
          </button>
        </div>
      ) : result.games.length === 0 ? (
        <p className="shelf-empty">
          &quot;{q}&quot;에 해당하는 게임이 없어요. 다른 이름(영어 원제 등)으로 찾아 보세요.
        </p>
      ) : (
        <>
          <p className="muted search-count" role="status">
            &quot;{q}&quot; 검색 결과 {result.games.length}개
          </p>
          <ul className="search-results">
            {result.games.map((game) => (
              <li key={game.id}>
                <button type="button" className="list-item" onClick={() => setSelected(game)}>
                  <GameThumb game={game} className="day-thumb" />
                  <span className="day-info">
                    <strong>
                      {game.name}
                      {isFavorite(game.id) && (
                        <span className="list-star" aria-label="관심 게임">
                          {' '}
                          ★
                        </span>
                      )}
                    </strong>
                    <span>{summary(game)}</span>
                  </span>
                  {game.released && <DDay released={game.released} />}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {selected && (
        <GameDetailModal
          game={selected}
          onClose={() => setSelected(null)}
          actions={
            <LibraryAddButton game={selected} added={libraryIds?.has(selected.id) ?? null} onAdd={addToLibrary} />
          }
        />
      )}
    </div>
  );
}
