import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { errorMessage } from '../api/client';
import { fetchSuggestions } from '../api/games';
import { useAuth } from '../contexts/AuthContext';
import type { Game, Suggestions } from '../types';
import { PERSONA_LABELS } from '../utils/libraryStats';
import { tasteReason } from '../utils/taste';
import { GameListItem } from './GameListItem';

/** "10월 12일 출시 예정 · PC, PlayStation 5" — 이미 나온 게임이면 "출시" */
function dateSummary(game: Game, todayKey: string): string {
  const [, month, day] = game.released.split('-').map(Number);
  const when = `${month}월 ${day}일 ${game.released >= todayKey ? '출시 예정' : '출시'}`;
  return [when, game.platforms.slice(0, 3).join(', ')].filter(Boolean).join(' · ');
}

type State = { kind: 'error'; message: string } | { kind: 'ok'; data: Suggestions };

/**
 * 게임 검색의 첫 화면. 검색어가 없을 때 비어 보이지 않도록 추천 게임을 보여 준다:
 * Steam을 연동해 서재 취향을 알 수 있으면 취향에 맞는 신작·예정작을, 아니면 곧 나오는 인기 게임을.
 */
export function SearchSuggestions({ onOpen }: { onOpen: (game: Game) => void }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [attempt, setAttempt] = useState(0);
  // 어느 사용자·시도의 결과인지 함께 저장해 두면, 로그인이 바뀌었을 때 이전 결과를 버리고 고르는 중으로 취급할 수 있다
  const requestKey = `${userId}#${attempt}`;
  const [loaded, setLoaded] = useState<{ key: string; state: State } | null>(null);
  const state = loaded?.key === requestKey ? loaded.state : null;

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      let next: State;
      try {
        const data = await fetchSuggestions(controller.signal);
        // 서버가 비어 있는 응답을 주거나(테스트·오류) 추천이 하나도 없으면 아무것도 보여 주지 않는다
        next = { kind: 'ok', data: data ?? { personalized: false, liked: [], games: [] } };
      } catch (err) {
        next = { kind: 'error', message: errorMessage(err) };
      }
      if (!controller.signal.aborted) setLoaded({ key: requestKey, state: next });
    })();
    return () => controller.abort();
  }, [requestKey]);

  if (!state) return <p className="page-status">추천 게임을 고르는 중…</p>;
  if (state.kind === 'error') {
    return (
      <p className="muted suggest-error">
        추천 게임을 불러오지 못했어요.{' '}
        <button type="button" className="btn btn-sm" onClick={() => setAttempt(attempt + 1)}>
          다시 시도
        </button>
      </p>
    );
  }

  const { personalized, liked, games } = state.data;
  if (games.length === 0) return null;
  const todayKey = new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD (보는 사람의 오늘)

  return (
    <section className="suggest" aria-label="추천 게임">
      <h2 className="suggest-title">{personalized ? '내 서재 취향에 맞는 신작·예정작' : '곧 출시되는 인기 게임'}</h2>
      <p className="muted suggest-sub">
        {personalized ? (
          `보유 게임에서 즐겨 하신 ${liked.map((p) => PERSONA_LABELS[p]).join(' · ')} 분위기를 기준으로 골랐어요. 이미 가진 게임은 뺐어요.`
        ) : user?.steamId ? (
          'Steam 서재의 게임 분위기를 더 알아내면 취향에 맞는 게임을 골라 드려요.'
        ) : user ? (
          <>
            <Link to="/mypage">Steam을 연동</Link>하면 서재 취향에 맞는 게임을 골라 드려요.
          </>
        ) : (
          <>
            <Link to="/login">로그인</Link>하고 Steam을 연동하면 서재 취향에 맞는 게임을 골라 드려요.
          </>
        )}
      </p>
      <ul className="search-results">
        {games.map((game) => (
          <li key={game.id}>
            <GameListItem
              game={game}
              summary={dateSummary(game, todayKey)}
              note={
                personalized && game.persona && liked.includes(game.persona)
                  ? `✦ ${tasteReason(game.persona)}`
                  : undefined
              }
              onOpen={onOpen}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
