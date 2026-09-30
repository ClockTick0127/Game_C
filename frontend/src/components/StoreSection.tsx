import { useStoreInfo } from '../hooks/useStoreInfo';
import type { Metacritic, SteamReviews } from '../types';
import { GameExtras } from './GameExtras';
import { IosAppCard, PriceCompare, RelatedGamesList } from './StoreExtras';

/** Steam 스토어와 같은 색 구분: 긍정(파랑) · 복합적(노랑) · 부정(빨강) */
function tone(score: number): 'positive' | 'mixed' | 'negative' {
  if (score >= 6) return 'positive';
  if (score === 5) return 'mixed';
  return 'negative';
}

function Players({ count }: { count: number | null }) {
  if (count === null) return null;
  return <p className="steam-players">지금 {count.toLocaleString('ko-KR')}명이 플레이 중이에요.</p>;
}

function SteamRating({ steam, onPc }: { steam: SteamReviews | null; onPc: boolean }) {
  if (!steam) {
    // PC 게임인데 못 찾은 경우는 Steam에 없다고 단정할 수 없다 (출시 전이라 스토어 페이지가 없는 경우 등)
    return <p className="steam-empty">{onPc ? 'Steam에서 찾지 못했어요.' : 'PC(Steam) 버전이 없는 게임이에요.'}</p>;
  }
  if (steam.total === 0) return <p className="steam-empty">아직 Steam 평가가 없어요.</p>;

  const count = `리뷰 ${steam.total.toLocaleString('ko-KR')}개`;
  if (!steam.label || steam.percent === null) {
    // 리뷰가 10개 미만이면 Steam이 등급을 매기지 않는다
    return <p className="steam-empty">{count} · 평가 집계 전이에요.</p>;
  }

  const t = tone(steam.score);
  return (
    <a className="steam-rating" href={steam.url} target="_blank" rel="noreferrer" title="Steam에서 리뷰 보기">
      <span className="steam-line">
        <strong className={`steam-label ${t}`}>{steam.label}</strong>
        <span className="steam-count">
          {steam.percent}% · {count}
        </span>
      </span>
      <span className="steam-bar" aria-hidden="true">
        <span className={`steam-bar-fill ${t}`} style={{ width: `${steam.percent}%` }} />
      </span>
    </a>
  );
}

/** 메타크리틱과 같은 색 구분: 75점 이상 초록 · 50~74점 노랑 · 50점 미만 빨강 */
function metascoreTone(score: number): 'good' | 'mixed' | 'bad' {
  if (score >= 75) return 'good';
  if (score >= 50) return 'mixed';
  return 'bad';
}

function Metascore({ metacritic }: { metacritic: Metacritic }) {
  const content = (
    <>
      <span className={`metascore-badge ${metascoreTone(metacritic.score)}`}>{metacritic.score}</span>
      <span className="metascore-text">
        <strong>메타스코어{metacritic.platform && ` (${metacritic.platform})`}</strong>
        <span>메타크리틱 평론가 점수</span>
      </span>
    </>
  );

  return metacritic.url ? (
    <a className="metascore" href={metacritic.url} target="_blank" rel="noreferrer" title="메타크리틱에서 보기">
      {content}
      <span className="metascore-link" aria-hidden="true">
        ↗
      </span>
    </a>
  ) : (
    <div className="metascore">{content}</div>
  );
}

interface Props {
  gameId: number;
  onPc: boolean;
  /** RAWG가 가진 메타스코어. Steam에 점수가 없을 때 대신 쓴다 (예전 게임 위주로 있고 플랫폼은 알 수 없다). */
  rawgMetacritic: number | null;
}

/** 게임 상세의 평가(메타스코어 · Steam) + 스토어 바로가기. 상세를 열 때 불러온다. */
export function StoreSection({ gameId, onPc, rawgMetacritic }: Props) {
  const state = useStoreInfo(gameId);

  if (state.status === 'error') {
    return <p className="store-error muted small">스토어 정보를 불러오지 못했어요.</p>;
  }

  const loading = state.status === 'loading';
  const info = state.status === 'success' ? state.data : null;
  const metacritic =
    info?.metacritic ?? (rawgMetacritic !== null ? { score: rawgMetacritic, url: null, platform: null } : null);

  return (
    <div className="store-section" aria-busy={loading}>
      {info?.details && <GameExtras details={info.details} />}

      {/* 점수가 없으면 영역 자체를 숨긴다 (없다고 평가가 나쁜 것은 아니다) */}
      {!loading && metacritic && (
        <div className="store-block">
          <h3>메타스코어</h3>
          <Metascore metacritic={metacritic} />
        </div>
      )}

      <div className="store-block">
        <h3>Steam 사용자 평가</h3>
        {loading ? (
          <span className="skeleton skeleton-line" />
        ) : (
          <>
            <SteamRating steam={info!.steam} onPc={onPc} />
            <Players count={info!.steam?.currentPlayers ?? null} />
          </>
        )}
      </div>

      {!loading && info!.prices && (
        <div className="store-block">
          <h3>PC 스토어 가격 비교</h3>
          <PriceCompare prices={info!.prices} />
        </div>
      )}

      {!loading && info!.ios && (
        <div className="store-block">
          <h3>iOS App Store</h3>
          <IosAppCard app={info!.ios} />
        </div>
      )}

      {(loading || info!.stores.length > 0) && (
        <div className="store-block">
          <h3>스토어 바로가기</h3>
          <div className="store-links">
            {loading ? (
              <>
                <span className="skeleton skeleton-pill" />
                <span className="skeleton skeleton-pill" />
              </>
            ) : (
              info!.stores.map((store) => (
                <a
                  key={store.slug}
                  className={`store-btn store-${store.slug}`}
                  href={store.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {store.name} <span aria-hidden="true">↗</span>
                </a>
              ))
            )}
          </div>
        </div>
      )}

      {info?.related && (info.related.additions.length > 0 || info.related.series.length > 0) && (
        <div className="store-block">
          <h3>관련 게임</h3>
          <RelatedGamesList related={info.related} />
        </div>
      )}
    </div>
  );
}
