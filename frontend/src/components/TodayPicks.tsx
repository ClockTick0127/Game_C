import { useState } from 'react';
import type { GameLog, SteamOwnedGame } from '../types';
import { gameLabel } from '../utils/library';
import { PICK_KIND_LABELS, recommendGames } from '../utils/recommend';
import { Cover } from './LibraryParts';

interface Props {
  games: SteamOwnedGame[];
  logs: Record<number, GameLog>;
  onOpen: (game: SteamOwnedGame) => void;
}

/**
 * "오늘 뭐 하지?" 패널 — 카운터 위에 오늘 꺼내 둔 게임 세 장.
 * 진열장이 "꽂아 둔 게임"이라면 이쪽은 "오늘 꺼내 놓은 게임"이라, 같은 게임 상자(.case)를 선반 위에 세워 보여 준다.
 * 서재 위쪽 "오늘 뭐 하지?" 버튼(LibraryPage)을 눌러 펼친다.
 */
export function TodayPicks({ games, logs, onOpen }: Props) {
  // 펼칠 때 한 번 뽑고, 다시 뽑기를 눌러야 바뀐다 (기록을 고쳐도 화면의 추천이 갑자기 바뀌지 않게)
  const [draw, setDraw] = useState(() => ({ round: 0, picks: recommendGames(games, logs) }));
  const { round, picks } = draw;

  return (
    <section className="today-picks" aria-label="오늘 뭐 하지?">
      <div className="today-head">
        <p className="today-eyebrow" aria-hidden="true">
          오늘의 추천 · {picks.length}개
        </p>
        <button
          type="button"
          className="today-reroll"
          onClick={() => setDraw({ round: round + 1, picks: recommendGames(games, logs) })}
        >
          <span className="today-reroll-icon" aria-hidden="true">
            ↻
          </span>
          다시 뽑기
        </button>
      </div>

      {picks.length === 0 ? (
        <p className="today-empty">
          오늘 꺼내 둘 게임이 없어요. 쌓아 둔 게임이나 아직 안 해 본 게임이 있으면 골라 드려요. (클리어·포기한 게임과
          충분히 해 본 게임은 빼요)
        </p>
      ) : (
        // key가 바뀌면 카드가 새로 그려져 등장 효과가 다시 나온다
        <ul className="today-list" key={round}>
          {picks.map(({ game, kind, reasons }, i) => (
            <li key={game.appId} style={{ animationDelay: `${i * 60}ms` }}>
              <button
                type="button"
                className="today-card"
                data-kind={kind}
                onClick={() => onOpen(game)}
                aria-label={`${game.name}, ${gameLabel(game, logs[game.appId])}. ${reasons.join(' ')}`}
              >
                <span className="today-stage" aria-hidden="true">
                  {/* 진열장과 같은 게임 상자. 종류 스티커는 상자와 함께 떠오르도록 상자 안에 붙인다 */}
                  <span className="case">
                    <span className="case-spine" />
                    <span className="case-cover">
                      <Cover game={game} />
                      <span className="case-shine" />
                    </span>
                    <span className="today-sticker">{PICK_KIND_LABELS[kind]}</span>
                  </span>
                </span>
                {/* 이유는 첫 번째만 보여 주고, 나머지(취향)는 aria-label에만 있다 */}
                <span className="today-text" aria-hidden="true">
                  <strong className="today-name">{game.name}</strong>
                  <span className="today-reason">{reasons[0]}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
