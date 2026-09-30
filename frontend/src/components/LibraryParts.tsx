import { useState, type CSSProperties, type KeyboardEvent } from 'react';
import type { SteamOwnedGame } from '../types';
import { useSpinePalette } from '../hooks/useSpinePalette';
import { coverUrls, playtimeLabel } from '../utils/library';

/** 표지 이미지. 세로형 → 가로형 → 글자 순으로 물러난다 */
export function Cover({ game }: { game: SteamOwnedGame }) {
  const urls = game.custom ? (game.coverUrl ? [game.coverUrl] : []) : coverUrls(game.appId);
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
      aria-label={`${game.name}, ${playtimeLabel(game)}`}
      aria-pressed={editing ? held : undefined}
    >
      <span className="case-spine" aria-hidden="true" />
      <span className="case-cover">
        <Cover game={game} />
        <span className="case-shine" aria-hidden="true" />
        <span className="case-caption" aria-hidden="true">
          <strong>{game.name}</strong>
          <span>{playtimeLabel(game)}</span>
        </span>
      </span>
    </button>
  );
}

interface SpineProps extends PartProps {
  /** 마우스를 올리거나 포커스가 갔을 때 그 책의 위치와 함께 알린다 (말풍선을 띄우는 데 쓴다). 벗어나면 null */
  onPeek: (peek: { game: SteamOwnedGame; rect: DOMRect } | null) => void;
}

/**
 * 서재에 꽂힌 게임팩 한 개. 등이 보이도록 세워져 있고, 위에는 게임 아이콘, 그 아래에 제목이 있다.
 * 바탕색과 글자색은 게임의 대표색으로, 제목 폰트는 게임의 분위기(장르·태그)에 맞춰 정한다.
 */
export function BookSpine({ game, editing, held, onPress, onFlip, onKeyDown, onPeek }: SpineProps) {
  const [iconFailed, setIconFailed] = useState(false);
  const colors = useSpinePalette(game.appId, game.coverUrl);
  const style = {
    '--spine-top': colors.top,
    '--spine-bottom': colors.bottom,
    '--spine-accent': colors.accent,
    '--spine-text': colors.text,
  } as CSSProperties;
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
      aria-label={`${game.name}, ${playtimeLabel(game)}`}
      aria-pressed={editing ? held : undefined}
    >
      <span className="spine-icon" aria-hidden="true">
        {iconFailed || !game.iconUrl ? (
          game.name.charAt(0)
        ) : (
          <img src={game.iconUrl} alt="" loading="lazy" draggable={false} onError={() => setIconFailed(true)} />
        )}
      </span>
      <span className={`spine-title font-${game.persona ?? 'default'}`} aria-hidden="true">
        {game.name}
      </span>
      <span className="spine-foot" aria-hidden="true" />
    </button>
  );
}
