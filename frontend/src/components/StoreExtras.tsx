import type { IosApp, Prices, RelatedGames } from '../types';

const usd = (value: number) => (value === 0 ? '무료' : `$${value.toFixed(2)}`);

/** PC 스토어별 가격 비교 (CheapShark, USD). 각 줄은 해당 스토어 구매 페이지로 연결된다. */
export function PriceCompare({ prices }: { prices: Prices }) {
  const { deals, cheapestEver } = prices;
  const best = deals[0]?.price;
  return (
    <div className="price-compare">
      {deals.length > 0 && (
        <ul className="price-list">
          {deals.map((deal) => (
            <li key={deal.store}>
              <a href={deal.url} target="_blank" rel="noreferrer" title={`${deal.store}에서 보기`}>
                <span className="price-store">{deal.store}</span>
                {deal.savingsPercent > 0 && <span className="price-off">-{deal.savingsPercent}%</span>}
                <span className={deal.price === best ? 'price-value best' : 'price-value'}>{usd(deal.price)}</span>
                <span aria-hidden="true">↗</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {cheapestEver && (
        <p className="price-note">
          역대 최저가 <strong>{usd(cheapestEver.price)}</strong>
          {cheapestEver.date && ` (${cheapestEver.date.replaceAll('-', '.')})`}
        </p>
      )}
      <p className="price-note">가격은 USD 기준이며 스토어 지역과 환율에 따라 다를 수 있어요.</p>
    </div>
  );
}

function RelatedList({ title, games }: { title: string; games: RelatedGames['additions'] }) {
  if (games.length === 0) return null;
  return (
    <div className="related-group">
      <h4>{title}</h4>
      <ul className="related-list">
        {games.map((game) => (
          <li key={game.id}>
            <span className="related-name">{game.name}</span>
            <span className="related-date">{game.released ? game.released.replaceAll('-', '.') : '출시일 미정'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** DLC·에디션과 같은 시리즈의 다른 게임 */
export function RelatedGamesList({ related }: { related: RelatedGames }) {
  return (
    <>
      <RelatedList title="DLC · 에디션" games={related.additions} />
      <RelatedList title="같은 시리즈" games={related.series} />
    </>
  );
}

/** iOS App Store 정보 (Apple 공개 API). 한국 스토어에 없는 앱은 미국 스토어 기준이다. */
export function IosAppCard({ app }: { app: IosApp }) {
  return (
    <div className="ios-app">
      <a className="ios-head" href={app.url} target="_blank" rel="noreferrer" title="App Store에서 보기">
        <span className="ios-name">{app.name}</span>
        <span className="ios-price">{app.price ?? ''}</span>
        <span aria-hidden="true">↗</span>
      </a>

      <dl className="detail-meta">
        <dt>평점</dt>
        <dd>
          {app.rating !== null
            ? `★ ${app.rating.toFixed(1)} · ${app.ratingCount.toLocaleString('ko-KR')}명 평가`
            : '아직 없음'}
        </dd>
        {app.seller && (
          <>
            <dt>판매자</dt>
            <dd>{app.seller}</dd>
          </>
        )}
        {app.ageRating && (
          <>
            <dt>연령 등급</dt>
            <dd>{app.ageRating}</dd>
          </>
        )}
        <dt>한국어</dt>
        <dd>{app.koreanSupport ? '지원' : '지원 안 함'}</dd>
        {app.sizeMb !== null && (
          <>
            <dt>용량</dt>
            <dd>{app.sizeMb >= 1000 ? `${(app.sizeMb / 1000).toFixed(1)}GB` : `${app.sizeMb}MB`}</dd>
          </>
        )}
      </dl>

      {app.storefront === 'US' && <p className="price-note">한국 App Store에는 없어 미국 스토어 정보예요.</p>}

      {app.screenshots.length > 0 && (
        <div className="extras-shots ios-shots">
          {app.screenshots.map((src, i) => (
            <img key={src} src={src} alt={`App Store 스크린샷 ${i + 1}`} loading="lazy" referrerPolicy="no-referrer" />
          ))}
        </div>
      )}
    </div>
  );
}
