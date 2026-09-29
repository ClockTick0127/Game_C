import { useEffect, useRef } from 'react';
import type { Game } from '../types';
import { formatKoreanDate } from '../utils/calendar';
import { DDay } from './DDay';
import { GameDetail } from './GameDetail';
import { GameThumb } from './GameThumb';

interface Props {
  /** 선택한 게임. 있으면 상세 정보를 보여준다. */
  game: Game | null;
  /** 선택한 날짜. 게임이 없으면 그날의 게임 목록을, 게임이 있으면 "목록으로" 버튼을 보여준다. */
  dayKey: string | null;
  dayGames: Game[];
  /** 아무것도 선택하지 않았을 때 보여줄 이번 달 인기 게임 (인기순) */
  month: number;
  popularGames: Game[];
  onSelectGame: (game: Game) => void;
  onBack: () => void;
  onClose: () => void;
}

const TOP_COUNT = 5;

function GamepadIcon() {
  return (
    <svg className="intro-icon" viewBox="0 0 64 40" width="64" height="40" aria-hidden="true">
      <path
        d="M16 4h32a14 14 0 0 1 14 14v4a14 14 0 0 1-24.5 9.3L35 28h-6l-2.5 3.3A14 14 0 0 1 2 22v-4A14 14 0 0 1 16 4z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path d="M15 12v10M10 17h10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="45" cy="14" r="2.6" fill="currentColor" />
      <circle cx="51" cy="20" r="2.6" fill="currentColor" />
    </svg>
  );
}

/** 선택 전 화면 — 게임 타이틀 화면 느낌의 안내 + 이번 달 인기 게임 순위 */
function PanelIntro({
  month,
  popularGames,
  onSelectGame,
}: {
  month: number;
  popularGames: Game[];
  onSelectGame: (game: Game) => void;
}) {
  const top = popularGames.slice(0, TOP_COUNT);

  return (
    <div className="panel-intro">
      <div className="intro-hero">
        <GamepadIcon />
        <p className="press-start">
          <span className="press-start-caret" aria-hidden="true">
            ▶
          </span>
          PRESS START
        </p>
        <p className="intro-copy">
          어떤 게임이 궁금하세요?
          <br />
          캘린더에서 고르면 여기서 자세히 알려드릴게요.
        </p>
      </div>

      {top.length > 0 && (
        <section className="intro-ranking">
          <h3>
            {month + 1}월 인기 게임 TOP {top.length}
          </h3>
          <ol className="ranking-list">
            {top.map((game, i) => (
              <li key={game.id}>
                <button type="button" className="ranking-item" onClick={() => onSelectGame(game)}>
                  <span className={i < 3 ? 'rank top' : 'rank'}>{i + 1}</span>
                  <GameThumb game={game} className="ranking-thumb" />
                  <span className="day-info">
                    <strong>{game.name}</strong>
                    <span>
                      {Number(game.released.slice(5, 7))}월 {Number(game.released.slice(8))}일{' '}
                      <DDay released={game.released} />
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

/**
 * 캘린더 오른쪽에 붙는 게임 정보 패널.
 * 좁은 화면에서는 선택했을 때만 전체 화면으로 열린다 (styles.css의 .side-panel 참고).
 */
export function SidePanel({ game, dayKey, dayGames, month, popularGames, onSelectGame, onBack, onClose }: Props) {
  const open = game !== null || dayKey !== null;
  const panelRef = useRef<HTMLElement>(null);

  // 다른 게임·날짜를 고르면 패널 스크롤을 맨 위로
  useEffect(() => {
    panelRef.current?.scrollTo({ top: 0 });
  }, [game?.id, dayKey]);

  useEffect(() => {
    if (!open) return;
    // 월 선택기처럼 안쪽 요소가 이미 Esc를 처리했다면 패널까지 닫지 않는다
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !e.defaultPrevented && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) {
    return (
      <aside className="side-panel" aria-label="게임 정보">
        <PanelIntro month={month} popularGames={popularGames} onSelectGame={onSelectGame} />
      </aside>
    );
  }

  return (
    <aside ref={panelRef} className="side-panel is-open" aria-label="게임 정보">
      <div className="panel-bar">
        {game && dayKey ? (
          <button type="button" className="panel-back" onClick={onBack}>
            ‹ {Number(dayKey.slice(5, 7))}월 {Number(dayKey.slice(8))}일 목록
          </button>
        ) : (
          <span />
        )}
        <button type="button" className="panel-close" onClick={onClose} aria-label="닫기">
          ×
        </button>
      </div>

      {game ? (
        <GameDetail game={game} />
      ) : (
        <div className="detail-body">
          <h2 className="detail-title">{formatKoreanDate(dayKey!)}</h2>
          <p className="detail-sub">게임 {dayGames.length}개</p>
          <ul className="day-list">
            {dayGames.map((g) => (
              <li key={g.id}>
                <button type="button" className="day-item" onClick={() => onSelectGame(g)}>
                  <GameThumb game={g} className="day-thumb" />
                  <span className="day-info">
                    <strong>{g.name}</strong>
                    <span>{g.platforms.slice(0, 3).join(' · ') || '플랫폼 정보 없음'}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}
