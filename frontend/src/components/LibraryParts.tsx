import { useState, type CSSProperties, type KeyboardEvent } from 'react';
import type { SteamOwnedGame } from '../types';
import { coverUrls, spineHue } from '../utils/library';
import { formatPlaytime } from '../utils/steam';

/** 표지 이미지. 세로형 → 가로형 → 글자 순으로 물러난다 */
export function Cover({ game }: { game: SteamOwnedGame }) {
  const urls = coverUrls(game.appId);
  const [stage, setStage] = useState(0);
  if (stage >= urls.length) {
    return (
      <span className="case-fallback" aria-hidden="true">
        {game.name}
      </span>
    );
  }
  return <img src={urls[stage]} alt="" loading="lazy" draggable={false} onError={() => setStage(stage + 1)} />;
}

interface PartProps {
  game: SteamOwnedGame;
  editing: boolean;
  held: boolean;
  onPress: () => void;
  /** 배치 바꾸기 중 더블클릭: 다른 쪽 서재로 보낸다 */
  onFlip: () => void;
  onKeyDown: (e: KeyboardEvent) => void;
}

/** 진열장에 전시된 PC 게임 상자 한 개 */
export function GameCase({ game, editing, held, onPress, onFlip, onKeyDown }: PartProps) {
  return (
    <button
      type="button"
      className="case"
      data-app-id={game.appId}
      onClick={onPress}
      onDoubleClick={onFlip}
      onKeyDown={onKeyDown}
      aria-label={`${game.name}, ${formatPlaytime(game.playtimeMinutes)}`}
      aria-pressed={editing ? held : undefined}
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

interface SpineProps extends PartProps {
  /** 서재에서 몇 번째 책인지 (1부터) */
  number: number;
  /** 마우스를 올리거나 포커스가 갔을 때 그 책의 위치와 함께 알린다 (말풍선을 띄우는 데 쓴다). 벗어나면 null */
  onPeek: (peek: { game: SteamOwnedGame; rect: DOMRect } | null) => void;
}

/** 서재에 꽂힌 책 한 권. 등이 보이도록 세워져 있고, 위에는 작은 그림, 아래에는 번호가 있다 */
export function BookSpine({ game, number, editing, held, onPress, onFlip, onKeyDown, onPeek }: SpineProps) {
  const [iconFailed, setIconFailed] = useState(false);
  const style = { '--hue': spineHue(game.appId) } as CSSProperties;
  return (
    <button
      type="button"
      className="spine"
      style={style}
      data-app-id={game.appId}
      onClick={onPress}
      onDoubleClick={onFlip}
      onKeyDown={onKeyDown}
      onMouseEnter={(e) => onPeek({ game, rect: e.currentTarget.getBoundingClientRect() })}
      onMouseLeave={() => onPeek(null)}
      onFocus={(e) => onPeek({ game, rect: e.currentTarget.getBoundingClientRect() })}
      onBlur={() => onPeek(null)}
      aria-label={`${game.name}, ${formatPlaytime(game.playtimeMinutes)}`}
      aria-pressed={editing ? held : undefined}
    >
      <span className="spine-icon" aria-hidden="true">
        {iconFailed || !game.iconUrl ? (
          game.name.charAt(0)
        ) : (
          <img src={game.iconUrl} alt="" loading="lazy" draggable={false} onError={() => setIconFailed(true)} />
        )}
      </span>
      <span className="spine-title" aria-hidden="true">
        {game.name}
      </span>
      <span className="spine-no" aria-hidden="true">
        {number}
      </span>
    </button>
  );
}
