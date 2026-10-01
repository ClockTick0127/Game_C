import { useState } from 'react';
import type { GameLog, SteamOwnedGame } from '../types';
import { gameLabel } from '../utils/library';
import { recommendGames } from '../utils/recommend';
import { Cover } from './LibraryParts';

interface Props {
  games: SteamOwnedGame[];
  logs: Record<number, GameLog>;
  onOpen: (game: SteamOwnedGame) => void;
}

/** "오늘 뭐 하지?" — 서재의 상태·별점·플레이 시간으로 지금 할 만한 게임을 골라 주고 이유를 알려 준다 */
export function TodayPicks({ games, logs, onOpen }: Props) {
  // 열 때 한 번 뽑고, 다시 뽑기를 눌러야 바뀐다 (기록을 고쳐도 화면의 추천이 갑자기 바뀌지 않게)
  const [picks, setPicks] = useState(() => recommendGames(games, logs));

  return (
    <section className="today-picks" aria-label="오늘 뭐 하지?">
      <div className="today-head">
        <h2 className="shelf-title">오늘 뭐 하지?</h2>
        <button type="button" className="btn btn-sm" onClick={() => setPicks(recommendGames(games, logs))}>
          다시 뽑기
        </button>
      </div>
      {picks.length === 0 ? (
        <p className="shelf-empty">
          추천할 게임이 없어요. 쌓아 둔 게임이나 아직 안 해 본 게임이 있으면 골라 드려요. (클리어·포기한 게임과 충분히
          해 본 게임은 빼요)
        </p>
      ) : (
        <ul className="today-list">
          {picks.map(({ game, reasons }) => (
            <li key={game.appId}>
              <button
                type="button"
                className="today-card"
                onClick={() => onOpen(game)}
                aria-label={`${game.name}, ${gameLabel(game, logs[game.appId])}. ${reasons.join(' ')}`}
              >
                <span className="today-cover" aria-hidden="true">
                  <Cover game={game} />
                </span>
                <span className="today-info" aria-hidden="true">
                  <strong>{game.name}</strong>
                  <span className="today-meta">{gameLabel(game, logs[game.appId])}</span>
                  {reasons.map((reason, i) => (
                    <span key={reason} className={i === 0 ? 'today-reason main' : 'today-reason'}>
                      {reason}
                    </span>
                  ))}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
