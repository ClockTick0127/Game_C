import type { IosApp, RelatedGames } from '../types';

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
