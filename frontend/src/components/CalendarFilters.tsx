import { useId } from 'react';
import { isFilterActive, NO_FILTER, type GameFilter } from '../utils/filterGames';

interface Props {
  filter: GameFilter;
  onChange: (filter: GameFilter) => void;
  platforms: string[];
  genres: string[];
  /** 로그인하지 않았으면 "관심 게임만" 필터를 숨긴다 */
  canFilterFavorites: boolean;
  /** 서재 취향을 알아낸 사람에게만 "내 취향만" 필터를 보여 준다 */
  canFilterTaste: boolean;
  /** 필터를 적용한 뒤 / 적용하기 전 게임 수 */
  shownCount: number;
  totalCount: number;
}

export function CalendarFilters({
  filter,
  onChange,
  platforms,
  genres,
  canFilterFavorites,
  canFilterTaste,
  shownCount,
  totalCount,
}: Props) {
  const id = useId();
  const active = isFilterActive(filter);
  const set = (patch: Partial<GameFilter>) => onChange({ ...filter, ...patch });

  return (
    <div className="cal-filters" role="search" aria-label="게임 검색과 필터">
      <input
        type="search"
        className="filter-search"
        placeholder="이 달의 게임 제목 검색"
        aria-label="게임 제목 검색"
        value={filter.query}
        maxLength={100}
        onChange={(e) => set({ query: e.target.value })}
      />

      <select
        className="filter-select"
        aria-label="플랫폼"
        value={filter.platform ?? ''}
        onChange={(e) => set({ platform: e.target.value || null })}
      >
        <option value="">모든 플랫폼</option>
        {platforms.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>

      <select
        className="filter-select"
        aria-label="장르"
        value={filter.genre ?? ''}
        onChange={(e) => set({ genre: e.target.value || null })}
      >
        <option value="">모든 장르</option>
        {genres.map((g) => (
          <option key={g} value={g}>
            {g}
          </option>
        ))}
      </select>

      {canFilterFavorites && (
        <label className="filter-check" htmlFor={`${id}-fav`}>
          <input
            id={`${id}-fav`}
            type="checkbox"
            checked={filter.favoritesOnly}
            onChange={(e) => set({ favoritesOnly: e.target.checked })}
          />
          관심 게임만
        </label>
      )}

      {canFilterTaste && (
        <label className="filter-check" htmlFor={`${id}-taste`}>
          <input
            id={`${id}-taste`}
            type="checkbox"
            checked={filter.tasteOnly}
            onChange={(e) => set({ tasteOnly: e.target.checked })}
          />
          내 취향만 <span aria-hidden="true">✦</span>
        </label>
      )}

      {active && (
        <>
          <span className="filter-result" role="status">
            {shownCount}개 표시 중 (전체 {totalCount}개)
          </span>
          <button type="button" className="btn btn-sm" onClick={() => onChange(NO_FILTER)}>
            필터 초기화
          </button>
        </>
      )}
    </div>
  );
}
