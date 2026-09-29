import { useEffect, useState } from 'react';
import { searchGame } from '../api/games';
import { GameDetail } from '../components/GameDetail';
import { GameThumb } from '../components/GameThumb';
import winners from '../data/tgaGoty.json';
import type { Game } from '../types';

type Winner = (typeof winners)[number];

/** RAWG에서 못 찾았을 때도 카드를 그릴 수 있도록 만드는 대체 정보. url이 null이라 클릭해도 열리지 않는다. */
function fallbackGame(w: Winner): Game {
  return { id: w.year, name: w.name, released: '', image: null, rating: 0, metacritic: null, platforms: [], genres: w.genres, url: null };
}

export function GotyPage() {
  // 수상작 이름 → RAWG 게임 정보. 아직 불러오는 중이면 키가 없고, 못 찾았으면 null
  const [found, setFound] = useState<Record<string, Game | null>>({});
  // 펼쳐 둔 수상작의 게임 ID. 한 번에 하나만 펼친다.
  const [openId, setOpenId] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    for (const w of winners) {
      searchGame(w.name, w.year, controller.signal)
        .then((game) => setFound((prev) => ({ ...prev, [w.name]: game })))
        .catch(() => {
          if (!controller.signal.aborted) setFound((prev) => ({ ...prev, [w.name]: null }));
        });
    }
    return () => controller.abort();
  }, []);

  return (
    <div className="goty">
      <header className="goty-header">
        <h1>역대 GOTY</h1>
        <p>
          The Game Awards가 선정한 올해의 게임(Game of the Year) 수상작입니다. 2014년 첫 시상식부터 {winners.length}
          개 작품. 게임을 누르면 상세 정보를 볼 수 있어요.
        </p>
      </header>

      <ol className="goty-list">
        {winners.map((w) => {
          const game = found[w.name];
          const inner = (
            <>
              <span className="goty-year">{w.year}</span>
              <GameThumb game={game ?? fallbackGame(w)} className={game === undefined ? 'goty-thumb is-loading' : 'goty-thumb'} />
              <div className="goty-info">
                <h2>{w.name}</h2>
                <p className="goty-dev">{w.developer}</p>
                <ul className="goty-genres">
                  {w.genres.map((g) => (
                    <li key={g}>{g}</li>
                  ))}
                </ul>
              </div>
              <span className="goty-badge">🏆 GOTY</span>
              {game && <span className="goty-chevron" aria-hidden />}
            </>
          );
          return (
            <li key={w.year}>
              {game ? (
                <>
                  <button
                    type="button"
                    className={openId === game.id ? 'goty-card is-clickable is-open' : 'goty-card is-clickable'}
                    aria-expanded={openId === game.id}
                    onClick={() => setOpenId(openId === game.id ? null : game.id)}
                  >
                    {inner}
                  </button>
                  {openId === game.id && (
                    <div className="goty-detail">
                      <div className="goty-detail-inner">
                        <GameDetail game={game} />
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="goty-card">{inner}</div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
