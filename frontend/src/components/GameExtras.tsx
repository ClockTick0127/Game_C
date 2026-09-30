import type { GameDetails, SteamStore } from '../types';

const MAX_CHIPS = 12;

function Price({ price }: { price: NonNullable<SteamStore['price']> }) {
  if (price.free) return <>무료</>;
  return (
    <>
      {price.discountPercent > 0 && price.initial && <s className="price-initial">{price.initial}</s>}
      {price.final}
      {price.discountPercent > 0 && <strong className="price-discount">-{price.discountPercent}%</strong>}
    </>
  );
}

/** 게임 상세의 소개 · 제작 정보 · 스크린샷. RAWG와 Steam에서 가져온 값 중 있는 것만 보여준다. */
export function GameExtras({ details }: { details: GameDetails }) {
  const { steam } = details;
  const facts: [string, React.ReactNode][] = [];
  if (details.developers.length) facts.push(['개발사', details.developers.join(', ')]);
  if (details.publishers.length) facts.push(['유통사', details.publishers.join(', ')]);
  if (steam?.releaseText) facts.push(['Steam 출시', steam.releaseText]);
  if (steam?.price) facts.push(['Steam 가격', <Price key="price" price={steam.price} />]);
  if (steam && steam.languages.length) facts.push(['한국어', steam.koreanSupport ? '지원' : '지원 안 함 (Steam 기준)']);
  if (details.playtimeHours) facts.push(['평균 플레이', `약 ${details.playtimeHours}시간`]);
  if (details.ageRating) facts.push(['연령 등급', `ESRB ${details.ageRating}`]);

  // Steam 분류만 15개 넘게 오는 게임도 있어 화면이 지저분해지므로 앞쪽만 보여준다
  const chips = [...new Set([...(steam?.categories ?? []), ...details.tags])].slice(0, MAX_CHIPS);
  const screenshots = steam?.screenshots ?? [];
  if (!details.description && !facts.length && !chips.length && !screenshots.length && !details.website) return null;

  return (
    <div className="extras">
      {details.description && <p className="extras-desc">{details.description}</p>}

      {facts.length > 0 && (
        <dl className="detail-meta">
          {facts.map(([label, value]) => (
            <div key={label} className="extras-fact">
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}

      {chips.length > 0 && (
        <ul className="extras-chips">
          {chips.map((chip) => (
            <li key={chip}>{chip}</li>
          ))}
        </ul>
      )}

      {screenshots.length > 0 && (
        <div className="extras-shots">
          {screenshots.map((shot, i) => (
            <a key={shot.full} href={shot.full} target="_blank" rel="noreferrer" title="크게 보기">
              <img src={shot.thumbnail} alt={`스크린샷 ${i + 1}`} loading="lazy" referrerPolicy="no-referrer" />
            </a>
          ))}
        </div>
      )}

      {details.website && (
        <a className="detail-link" href={details.website} target="_blank" rel="noreferrer">
          공식 웹사이트 ↗
        </a>
      )}
    </div>
  );
}
