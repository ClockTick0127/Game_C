import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { errorMessage } from '../api/client';
import { fetchPopular, type PopularParams } from '../api/popular';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import type { PopularGame, PopularPlatform, PopularResponse } from '../types';
import { formatOwners, formatPrice, genreLabel, PLATFORM_LABELS } from '../utils/popular';

/** 처음 수집하는 동안(수십 초)과 출시 정보를 채우는 동안(수십 분)의 갱신 간격 */
const POLL_COLLECTING_MS = 4_000;
const POLL_FILLING_MS = 30_000;

function readParams(searchParams: URLSearchParams): PopularParams {
  const platform = searchParams.get('platform');
  const page = Number(searchParams.get('page'));
  return {
    q: searchParams.get('q') ?? '',
    genre: searchParams.get('genre') ?? '',
    year: searchParams.get('year') ?? '',
    platform: platform === 'windows' || platform === 'mac' || platform === 'linux' ? platform : '',
    sort: searchParams.get('sort') === 'ccu' ? 'ccu' : 'owners',
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

export function PopularPage() {
  useDocumentTitle('인기 있는 게임');
  const [searchParams, setSearchParams] = useSearchParams();
  const params = readParams(searchParams);
  const key = searchParams.toString();

  const [data, setData] = useState<PopularResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 검색어는 입력할 때마다 요청하지 않도록 따로 들고 있다가 멈추면 주소에 반영한다
  const [query, setQuery] = useState(params.q);

  const update = (changes: Partial<PopularParams>) => {
    const next = new URLSearchParams(searchParams);
    for (const [name, value] of Object.entries(changes)) {
      if (value === '' || value === 1 || (name === 'sort' && value === 'owners')) next.delete(name);
      else next.set(name, String(value));
    }
    // 조건이 바뀌면 첫 쪽부터 다시 본다
    if (!('page' in changes)) next.delete('page');
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    if (query === params.q) return;
    const timer = setTimeout(() => update({ q: query.trim() }), 350);
    return () => clearTimeout(timer);
    // update는 렌더마다 새로 만들어지므로 query 변화에만 반응한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const collecting = data !== null && !data.status.ready;
  const filling = data !== null && data.status.ready && data.status.releaseChecked < data.status.total;

  useEffect(() => {
    const controller = new AbortController();
    const load = () =>
      fetchPopular(readParams(new URLSearchParams(key)), controller.signal)
        .then((result) => {
          setData(result);
          setError(null);
        })
        .catch((err) => {
          if (!controller.signal.aborted) setError(errorMessage(err));
        });
    load();

    if (!collecting && !filling) return () => controller.abort();
    const timer = setInterval(load, collecting ? POLL_COLLECTING_MS : POLL_FILLING_MS);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [key, collecting, filling]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const offset = data ? (data.page - 1) * data.pageSize : 0;

  return (
    <div className="popular">
      <h1 className="page-title">인기 있는 게임</h1>
      <p className="popular-intro">
        스팀에서 다들 한 번쯤 켜 봤을 인기 게임들이에요. 요즘 누가 제일 많이 하는지도 함께 볼 수 있어요.
      </p>
      <p className="muted popular-note">
        <a href="https://steamspy.com" target="_blank" rel="noreferrer">
          SteamSpy
        </a>
        의 보유자 수 추정 구간 기준이라, 실제 판매량과는 달라요.
      </p>
      {data?.exchange && (
        <p className="muted popular-note">
          가격은 Steam 미국 스토어의 달러 가격에 환율({data.exchange.date} 기준 1달러 ={' '}
          {data.exchange.krwPerUsd.toLocaleString('ko-KR')}원)을 곱한 예상 금액이에요. 한국 스토어의 실제 가격과 다를 수
          있어요.
        </p>
      )}

      <form className="cal-filters" role="search" onSubmit={(e) => e.preventDefault()}>
        <input
          className="filter-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="게임 이름 검색"
          aria-label="게임 이름 검색"
          maxLength={50}
        />
        <select
          className="filter-select"
          value={params.genre}
          onChange={(e) => update({ genre: e.target.value })}
          aria-label="장르"
        >
          <option value="">모든 장르</option>
          {data?.facets.genres.map((f) => (
            <option key={f.value} value={f.value}>
              {genreLabel(f.value)} ({f.count})
            </option>
          ))}
        </select>
        <select
          className="filter-select"
          value={params.year}
          onChange={(e) => update({ year: e.target.value })}
          aria-label="출시 연도"
        >
          <option value="">모든 연도</option>
          {data?.facets.years.map((f) => (
            <option key={f.value} value={f.value}>
              {f.value}년 ({f.count})
            </option>
          ))}
        </select>
        <select
          className="filter-select"
          value={params.platform}
          onChange={(e) => update({ platform: e.target.value as PopularPlatform | '' })}
          aria-label="플랫폼"
        >
          <option value="">모든 플랫폼</option>
          {data?.facets.platforms.map((f) => (
            <option key={f.value} value={f.value}>
              {PLATFORM_LABELS[f.value]} ({f.count})
            </option>
          ))}
        </select>
        <select
          className="filter-select"
          value={params.sort}
          onChange={(e) => update({ sort: e.target.value as PopularParams['sort'] })}
          aria-label="정렬"
        >
          <option value="owners">보유자 수 순</option>
          <option value="ccu">동시 접속자 순</option>
        </select>
      </form>

      {error && <div className="banner error">인기 게임을 불러오지 못했습니다: {error}</div>}
      {collecting && (
        <div className="banner" role="status">
          인기 게임 데이터를 처음 모으는 중이에요. 30초쯤 걸려요.
        </div>
      )}
      {filling && data && (
        <p className="muted" role="status">
          출시 연도와 플랫폼 정보를 채우는 중이에요 ({data.status.releaseChecked}/{data.status.total}). 연도·플랫폼
          필터에는 정보가 채워진 게임만 나와요.
        </p>
      )}

      {!data && !error && <p className="page-status">불러오는 중…</p>}

      {data?.status.ready && (
        <>
          <p className="popular-count">
            <strong>{data.total.toLocaleString('ko-KR')}</strong>개
          </p>
          {data.games.length === 0 ? (
            <p className="page-status">조건에 맞는 게임이 없어요.</p>
          ) : (
            <ol className="popular-list" start={offset + 1}>
              {data.games.map((game, i) => (
                <PopularRow
                  key={game.appId}
                  game={game}
                  number={offset + i + 1}
                  krwPerUsd={data.exchange?.krwPerUsd ?? null}
                />
              ))}
            </ol>
          )}
          {totalPages > 1 && (
            <nav className="pager" aria-label="페이지">
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => update({ page: data.page - 1 })}
                disabled={data.page <= 1}
              >
                이전
              </button>
              <span>
                {data.page} / {totalPages}
              </span>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => update({ page: data.page + 1 })}
                disabled={data.page >= totalPages}
              >
                다음
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}

function PopularRow({ game, number, krwPerUsd }: { game: PopularGame; number: number; krwPerUsd: number | null }) {
  const price = formatPrice(game.priceUsd, krwPerUsd);
  const platforms = game.platforms
    ? (Object.keys(PLATFORM_LABELS) as PopularPlatform[]).filter((p) => game.platforms![p])
    : [];
  return (
    <li className="popular-item">
      <span className="popular-no" aria-hidden="true">
        {number}
      </span>
      <img src={game.image} alt="" loading="lazy" width={120} height={56} />
      <div className="popular-main">
        <a
          className="popular-name"
          href={`https://store.steampowered.com/app/${game.appId}/`}
          target="_blank"
          rel="noreferrer"
        >
          {game.name}
        </a>
        <span className="popular-sub">
          {[
            game.developer,
            game.releaseYear ? `${game.releaseYear}년` : null,
            platforms.map((p) => PLATFORM_LABELS[p]).join(' · '),
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
        <span className="popular-tags">
          {game.genres.map((genre) => (
            <span key={genre} className="popular-tag">
              {genreLabel(genre)}
            </span>
          ))}
        </span>
      </div>
      <dl className="popular-stats">
        <div>
          <dt>보유자(추정)</dt>
          <dd>{formatOwners(game.ownersMin, game.ownersMax)}명</dd>
        </div>
        <div>
          <dt>어제 최대 동시 접속</dt>
          <dd>{game.ccu.toLocaleString('ko-KR')}명</dd>
        </div>
        {price && (
          <div>
            <dt>가격</dt>
            <dd>
              {price}
              {game.discount > 0 && <span className="popular-off"> -{game.discount}%</span>}
            </dd>
          </div>
        )}
      </dl>
    </li>
  );
}
