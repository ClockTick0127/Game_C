import type { Game } from '../types';

/** 게임 이미지가 없으면 이름 첫 글자로 대체 썸네일을 그린다. */
export function GameThumb({ game, className }: { game: Game; className: string }) {
  if (game.image) {
    return <img className={className} src={game.image} alt="" loading="lazy" />;
  }
  const hue = (game.id * 47) % 360;
  return (
    <div
      className={`${className} thumb-fallback`}
      style={{ background: `linear-gradient(135deg, hsl(${hue} 60% 45%), hsl(${(hue + 50) % 360} 60% 30%))` }}
      aria-hidden
    >
      {game.name.charAt(0)}
    </div>
  );
}
