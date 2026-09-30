import { useEffect, useMemo, useState, type DragEvent, type KeyboardEvent } from 'react';
import { Link } from 'react-router';
import { errorMessage } from '../api/client';
import * as meApi from '../api/me';
import { BookSpine, Cover, GameCase } from '../components/LibraryParts';
import { Modal } from '../components/Modal';
import { SteamAchievementList } from '../components/SteamSection';
import { useAuth } from '../contexts/AuthContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import type { SteamOwnedGame, SteamOwnedGames } from '../types';
import { filterAndSort, formatTotalHours, placeAt, removeFrom, SORT_LABELS, type LibrarySort } from '../utils/library';
import { formatPlaytime } from '../utils/steam';

/** 평소에 서재에 꽂아 두는 책 수. 배치를 바꿀 때는 옮길 자리가 화면 밖에 없도록 전부 꺼낸다 */
const PAGE_SIZE = 150;

type Where = 'shelf' | 'library';

export function LibraryPage() {
  useDocumentTitle('내 서재');
  const { user } = useAuth();

  const [data, setData] = useState<SteamOwnedGames | null>(null);
  /** 진열장에 전시한 게임 (앱 번호, 내가 정한 순서). 나머지는 서재에 자동 정렬로 꽂힌다 */
  const [shelfIds, setShelfIds] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<LibrarySort>('playtime');
  const [shown, setShown] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<SteamOwnedGame | null>(null);
  const [peek, setPeek] = useState<{ game: SteamOwnedGame; rect: DOMRect } | null>(null);

  // 배치 바꾸기: draft는 편집 중인 진열장. 완료를 눌러야 서버에 저장된다
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<number[]>([]);
  const [held, setHeld] = useState<number | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [overId, setOverId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const linked = Boolean(user?.steamId);
  // 다시 시도 버튼이 누를 때마다 올려서 이펙트를 다시 실행한다
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!linked) return;
    const controller = new AbortController();
    // 진열장 배치를 못 불러와도 서재는 보여 준다 (진열장은 빈 채로)
    Promise.all([meApi.fetchSteamGames(), meApi.fetchLibraryOrder().catch(() => ({ order: [] as number[] }))])
      .then(([games, saved]) => {
        if (controller.signal.aborted) return;
        setData(games);
        setShelfIds(saved.order);
      })
      .catch((err) => !controller.signal.aborted && setError(errorMessage(err)));
    return () => controller.abort();
  }, [linked, attempt]);

  const retry = () => {
    setError(null);
    setAttempt(attempt + 1);
  };

  const byId = useMemo(() => new Map(data?.games.map((g) => [g.appId, g]) ?? []), [data]);
  const currentShelf = editing ? draft : shelfIds;
  // 더 이상 갖고 있지 않은 게임은 진열장에서 빠진다
  const shelfGames = useMemo(() => currentShelf.flatMap((id) => byId.get(id) ?? []), [currentShelf, byId]);
  const libraryGames = useMemo(() => {
    if (!data) return [];
    const onShelf = new Set(currentShelf);
    // 편집 중에는 검색어를 무시하고 전체를 대상으로 한다
    return filterAndSort(
      data.games.filter((g) => !onShelf.has(g.appId)),
      editing ? '' : query,
      sort,
    );
  }, [data, currentShelf, editing, query, sort]);
  const totalMinutes = useMemo(() => data?.games.reduce((sum, g) => sum + g.playtimeMinutes, 0) ?? 0, [data]);
  const visibleLibrary = editing ? libraryGames : libraryGames.slice(0, shown);

  const whereIs = (id: number): Where => (draft.includes(id) ? 'shelf' : 'library');
  const heldGame = held === null ? null : (byId.get(held) ?? null);

  // 말풍선은 화면 기준 위치라서, 스크롤하면 책과 어긋나기 전에 닫는다
  useEffect(() => {
    if (!peek) return;
    const close = () => setPeek(null);
    window.addEventListener('scroll', close, { passive: true });
    return () => window.removeEventListener('scroll', close);
  }, [peek]);

  // 상자를 옮기면 화면의 DOM이 재배열되면서 포커스를 잃는 브라우저가 있어, 들고 있는 상자로 포커스를 되돌린다
  useEffect(() => {
    if (editing && held !== null) document.querySelector<HTMLElement>(`[data-app-id="${held}"]`)?.focus();
  }, [draft, held, editing]);

  const startEdit = () => {
    setDraft(shelfGames.map((g) => g.appId));
    setQuery('');
    setHeld(null);
    setSaveError(null);
    setEditing(true);
  };

  const stopEdit = () => {
    setEditing(false);
    setHeld(null);
    setDragging(null);
    setOverId(null);
    setSaveError(null);
  };

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await meApi.saveLibraryOrder(draft);
      setShelfIds(draft);
      stopEdit();
    } catch (err) {
      setSaveError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  /** id를 진열장 targetId 자리에 꽂는다 (null이면 맨 끝). 서재에서 꺼내 온 게임이면 진열장에 새로 들어간다 */
  const put = (id: number, targetId: number | null) => setDraft((list) => placeAt(list, id, targetId));
  const takeOff = (id: number) => setDraft((list) => removeFrom(list, id));

  /** 편집 중에 상자·책을 누르면: 아무것도 안 들었으면 집고, 들고 있으면 여기에 놓는다 (터치·마우스 공통) */
  const press = (game: SteamOwnedGame, where: Where) => {
    if (!editing) {
      setSelected(game);
    } else if (held === null) {
      setHeld(game.appId);
    } else if (held === game.appId) {
      setHeld(null);
    } else if (where === 'shelf') {
      put(held, game.appId);
      setHeld(null);
    } else if (whereIs(held) === 'shelf') {
      // 진열장에서 들고 있던 것을 서재의 책을 눌러 돌려보낸다
      takeOff(held);
      setHeld(null);
    } else {
      setHeld(game.appId); // 서재 안에서는 다른 책으로 바꿔 든다
    }
  };

  /**
   * 배치 바꾸기 중 더블클릭: 진열장의 게임은 서재로, 서재의 게임은 진열장 맨 끝으로 보낸다.
   * 더블클릭은 클릭 두 번(집었다 내려놓음)이 먼저 일어나므로, 여기서는 들고 있는 것을 정리하고 옮기기만 한다.
   */
  const flip = (game: SteamOwnedGame) => {
    if (!editing) return;
    if (whereIs(game.appId) === 'shelf') takeOff(game.appId);
    else put(game.appId, null);
    setHeld(null);
  };

  /** 진열장에서 들고 있는 상자를 방향키로 한 칸씩 옮긴다. Esc는 내려놓는다 */
  const key = (e: KeyboardEvent, game: SteamOwnedGame) => {
    if (!editing || held !== game.appId) return;
    if (e.key === 'Escape') {
      e.preventDefault(); // 편집 전체를 취소하는 것은 아니다
      setHeld(null);
      return;
    }
    const step =
      e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : 0;
    if (step === 0 || whereIs(game.appId) !== 'shelf') return;
    e.preventDefault();
    const target = draft[draft.indexOf(game.appId) + step];
    if (target !== undefined) put(game.appId, target);
  };

  // 끌어 놓기는 마우스 전용 보조 수단이다. 같은 일을 하는 키보드·터치 방법(누르기, 방향키, 편집 표시줄 버튼)이 있다.
  const dragSource = (game: SteamOwnedGame) => ({
    draggable: editing,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(game.appId)); // Firefox는 데이터가 있어야 드래그가 시작된다
      setDragging(game.appId);
      setHeld(null);
    },
    onDragEnd: () => {
      setDragging(null);
      setOverId(null);
    },
  });

  /** 진열장의 상자(또는 맨 끝 빈자리, targetId=null) 위에 놓으면 그 자리에 꽂힌다 */
  const shelfTarget = (targetId: number | null) => ({
    onDragOver: (e: DragEvent) => {
      if (dragging === null) return;
      e.preventDefault(); // 놓을 수 있는 곳이라고 알린다
      const id = targetId ?? -1;
      if (overId !== id) setOverId(id);
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (dragging !== null) put(dragging, targetId);
      setDragging(null);
      setOverId(null);
    },
  });

  /** 서재 쪽에 놓으면 진열장에서 빠진다 */
  const libraryTarget = {
    onDragOver: (e: DragEvent) => {
      if (dragging !== null && whereIs(dragging) === 'shelf') e.preventDefault();
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      if (dragging !== null) takeOff(dragging);
      setDragging(null);
      setOverId(null);
    },
  };

  const heldOnShelf = held !== null && whereIs(held) === 'shelf';
  const classNames = (...names: (string | false)[]) => names.filter(Boolean).join(' ');

  return (
    <div className="library">
      <h1 className="page-title">내 서재</h1>
      <p className="library-intro">
        진열장에는 자랑하고 싶은 게임을, 아래 서재에는 나머지 게임을 꽂아 뒀어요. 누르면 업적을 볼 수 있어요.
      </p>

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
          {editing ? (
            <div className="library-edit-bar">
              <p role="status">
                {heldGame
                  ? `'${heldGame.name}'을(를) 들고 있어요. ${
                      heldOnShelf
                        ? '진열장에서 놓을 자리의 상자를 누르거나 ←→ 키로 옮기세요. 서재의 책을 누르면 진열장에서 빠져요.'
                        : '진열장에서 꽂을 자리의 상자를 누르세요.'
                    } (Esc로 내려놓기)`
                  : '옮길 상자나 책을 눌러 집으세요. 끌어서 옮기거나, 더블클릭하면 반대쪽 서재로 넘어가요. 마치면 완료를 눌러 저장하세요.'}
              </p>
              <div className="library-edit-actions">
                {held !== null && !heldOnShelf && (
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => {
                      put(held, null);
                      setHeld(null);
                    }}
                  >
                    진열장 맨 끝에 꽂기
                  </button>
                )}
                {held !== null && heldOnShelf && (
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => {
                      takeOff(held);
                      setHeld(null);
                    }}
                  >
                    진열장에서 빼기
                  </button>
                )}
                {draft.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => {
                      setDraft([]);
                      setHeld(null);
                    }}
                  >
                    진열장 비우기
                  </button>
                )}
                <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
                  {saving ? '저장 중…' : '완료'}
                </button>
                <button type="button" className="btn btn-sm" onClick={stopEdit} disabled={saving}>
                  취소
                </button>
              </div>
              {saveError && <p className="form-error">배치를 저장하지 못했습니다: {saveError}</p>}
            </div>
          ) : (
            <div className="cal-filters" role="search">
              <input
                className="filter-search"
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setShown(PAGE_SIZE);
                }}
                placeholder="서재에서 검색"
                aria-label="서재에서 검색"
                maxLength={50}
              />
              <select
                className="filter-select"
                value={sort}
                onChange={(e) => setSort(e.target.value as LibrarySort)}
                aria-label="정렬"
              >
                {(Object.keys(SORT_LABELS) as LibrarySort[]).map((k) => (
                  <option key={k} value={k}>
                    {SORT_LABELS[k]}
                  </option>
                ))}
              </select>
              <button type="button" className="btn btn-sm" onClick={startEdit}>
                배치 바꾸기
              </button>
              <span className="filter-result">
                게임 {data.games.length.toLocaleString('ko-KR')}개 · 총 {formatTotalHours(totalMinutes)} 플레이
              </span>
            </div>
          )}

          <h2 className="shelf-title">
            내 진열장 <span className="count">{shelfGames.length}</span>
          </h2>
          {shelfGames.length === 0 && !editing ? (
            <p className="shelf-empty">
              진열장이 비어 있어요. <strong>배치 바꾸기</strong>를 눌러 좋아하는 게임을 꽂아 보세요.
            </p>
          ) : (
            <ul className={classNames('shelf', editing && 'editing')}>
              {shelfGames.map((game) => (
                <li
                  key={game.appId}
                  className={classNames(
                    held === game.appId && 'is-held',
                    overId === game.appId && dragging !== game.appId && 'is-over',
                  )}
                  {...(editing ? { ...dragSource(game), ...shelfTarget(game.appId) } : {})}
                >
                  <GameCase
                    game={game}
                    editing={editing}
                    held={held === game.appId}
                    onPress={() => press(game, 'shelf')}
                    onFlip={() => flip(game)}
                    onKeyDown={(e) => key(e, game)}
                  />
                </li>
              ))}
              {editing && (
                <li className={classNames(overId === -1 && 'is-over')} {...shelfTarget(null)}>
                  <button
                    type="button"
                    className="case case-slot"
                    disabled={held === null}
                    onClick={() => {
                      if (held !== null) put(held, null);
                      setHeld(null);
                    }}
                  >
                    <span aria-hidden="true">+</span>
                    <span className="case-slot-label">맨 끝에 꽂기</span>
                  </button>
                </li>
              )}
            </ul>
          )}

          <h2 className="shelf-title">
            서재 <span className="count">{libraryGames.length}</span>
          </h2>
          {visibleLibrary.length === 0 ? (
            <p className="shelf-empty">
              {query.trim() && !editing ? '찾는 게임이 서재에 없어요.' : '모든 게임이 진열장에 있어요.'}
            </p>
          ) : (
            <ul className={classNames('stacks', editing && 'editing')} {...(editing ? libraryTarget : {})}>
              {visibleLibrary.map((game) => (
                <li
                  key={game.appId}
                  className={classNames(held === game.appId && 'is-held')}
                  {...(editing ? dragSource(game) : {})}
                >
                  <BookSpine
                    game={game}
                    editing={editing}
                    held={held === game.appId}
                    onPress={() => press(game, 'library')}
                    onFlip={() => flip(game)}
                    onKeyDown={(e) => key(e, game)}
                    onPeek={setPeek}
                  />
                </li>
              ))}
            </ul>
          )}
          {!editing && shown < libraryGames.length && (
            <div className="pager">
              <button type="button" className="btn" onClick={() => setShown(shown + PAGE_SIZE)}>
                더 꺼내 보기 ({(libraryGames.length - shown).toLocaleString('ko-KR')}권 남음)
              </button>
            </div>
          )}
        </>
      )}

      {peek && <SpineTip game={peek.game} rect={peek.rect} />}
      {selected && <GameModal game={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

/** 마우스를 올린 책 위에 뜨는 말풍선. 화면 위쪽에 붙어 있어 위에 둘 자리가 없으면 책 아래에 띄운다 */
function SpineTip({ game, rect }: { game: SteamOwnedGame; rect: DOMRect }) {
  const below = rect.top < 90;
  // 좌우로 화면 밖으로 나가지 않게 한다
  const left = Math.min(Math.max(rect.left + rect.width / 2, 110), window.innerWidth - 110);
  return (
    // 이름과 플레이 시간은 책 버튼의 aria-label로 이미 읽히므로 보조 기술에는 숨긴다
    <div
      className="spine-tip"
      aria-hidden="true"
      style={{ left, top: below ? rect.bottom + 12 : rect.top - 30, transform: below ? 'translateX(-50%)' : undefined }}
    >
      <strong>{game.name}</strong>
      <span>{formatPlaytime(game.playtimeMinutes)}</span>
    </div>
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
