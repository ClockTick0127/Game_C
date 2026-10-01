import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ApiError, errorMessage } from '../api/client';
import * as profilesApi from '../api/profiles';
import { Cover, GameCase } from '../components/LibraryParts';
import { Modal } from '../components/Modal';
import { useAuth } from '../contexts/AuthContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import type { Showcase } from '../types';
import { gameLabel, showcaseToOwned } from '../utils/library';

type Result = { kind: 'notFound' } | { kind: 'error'; message: string } | { kind: 'ok'; data: Showcase };

const noop = () => {};

/** /u/닉네임 — 로그인 없이 볼 수 있는 남의 진열장 */
export function ShowcasePage() {
  const { nickname = '' } = useParams();
  const { user } = useAuth();
  // 다시 시도 버튼이 누를 때마다 올려서 이펙트를 다시 실행한다
  const [attempt, setAttempt] = useState(0);
  // 어느 요청의 결과인지 함께 저장해 두면, 닉네임이 바뀌었을 때 이전 사람의 결과를 보여 주지 않고 불러오는 중으로 취급할 수 있다
  const requestKey = `${nickname}#${attempt}`;
  const [loaded, setLoaded] = useState<{ key: string; result: Result } | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const state: Result | null = loaded?.key === requestKey ? loaded.result : null;

  useDocumentTitle(state?.kind === 'ok' ? `${state.data.nickname}의 진열장` : '진열장');

  useEffect(() => {
    const controller = new AbortController();
    const finish = (result: Result) => !controller.signal.aborted && setLoaded({ key: requestKey, result });
    profilesApi
      .fetchShowcase(nickname, controller.signal)
      .then((data) => finish({ kind: 'ok', data }))
      .catch((err) =>
        finish(
          err instanceof ApiError && err.status === 404
            ? { kind: 'notFound' }
            : { kind: 'error', message: errorMessage(err) },
        ),
      );
    return () => controller.abort();
  }, [nickname, requestKey]);

  const items = useMemo(() => (state?.kind === 'ok' ? state.data.games.map(showcaseToOwned) : []), [state]);
  const selected = items.find((i) => i.game.appId === selectedId) ?? null;

  if (!state) return <p className="page-status">진열장을 불러오는 중…</p>;

  if (state.kind === 'notFound') {
    return (
      <div className="library">
        <h1 className="page-title">진열장을 찾을 수 없어요</h1>
        <div className="card">
          <p className="muted">
            주소가 틀렸거나, 주인이 진열장을 공개하지 않았어요.
            {user && (
              <>
                {' '}
                내 진열장은 <Link to="/library">내 서재</Link>에서 공개할 수 있어요.
              </>
            )}
          </p>
        </div>
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="library">
        <div className="banner error">
          진열장을 불러오지 못했습니다: {state.message}
          <button type="button" onClick={() => setAttempt(attempt + 1)}>
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  const owner = state.data.nickname;
  const isMine = user?.profilePublic && user.nickname.toLowerCase() === owner.toLowerCase();

  return (
    <div className="library">
      <h1 className="page-title">{owner}님의 진열장</h1>
      <p className="library-intro">
        {owner}님이 자랑하고 싶은 게임을 꽂아 둔 진열장이에요.
        {isMine && (
          <>
            {' '}
            내 진열장이에요. 공개 설정은 <Link to="/library">내 서재</Link>에서 바꿀 수 있어요.
          </>
        )}
      </p>

      <h2 className="shelf-title">
        진열장 <span className="count">{items.length}</span>
      </h2>
      {items.length === 0 ? (
        <p className="shelf-empty">아직 진열장에 꽂은 게임이 없어요.</p>
      ) : (
        <ul className="shelf">
          {items.map(({ game, log }) => (
            <li key={game.appId}>
              <GameCase
                game={game}
                log={log}
                editing={false}
                held={false}
                onPress={() => setSelectedId(game.appId)}
                onFlip={noop}
                onKeyDown={noop}
              />
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <Modal title={selected.game.name} onClose={() => setSelectedId(null)} className="library-modal">
          <div className="library-modal-head">
            <div className="case case-static" aria-hidden="true">
              <span className="case-spine" />
              <span className="case-cover">
                <Cover game={selected.game} />
                <span className="case-shine" />
              </span>
            </div>
            <div>
              <h2>{selected.game.name}</h2>
              <p className="muted">{gameLabel(selected.game, selected.log)}</p>
              {!selected.game.custom && (
                <a href={`https://store.steampowered.com/app/${selected.game.appId}/`} target="_blank" rel="noreferrer">
                  Steam 스토어에서 보기
                </a>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
