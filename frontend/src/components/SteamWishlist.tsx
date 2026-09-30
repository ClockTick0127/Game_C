import { useState } from 'react';
import { errorMessage } from '../api/client';
import * as meApi from '../api/me';
import { useFavorites } from '../contexts/FavoritesContext';
import type { SteamWishlist as Wishlist, SteamWishlistImportResult, SteamWishlistItem } from '../types';
import { formatKoreanDate } from '../utils/calendar';

const PAGE_SIZE = 30;
/** 서버가 한 번에 받는 최대 개수 (게임마다 RAWG 검색이 나가므로 나눠서 보낸다) */
const CHUNK = 10;

interface Summary {
  added: number;
  exists: number;
  /** 찾지 못했거나 출시일이 없어 넣지 못한 게임 이름 */
  skipped: { name: string; reason: string }[];
}

function skipReason(r: SteamWishlistImportResult): string {
  if (r.status === 'notFound') return '같은 이름의 게임을 찾지 못함';
  if (r.status === 'noDate') return '출시일 미정';
  return r.message ?? '조회 실패';
}

/** 마이페이지 Steam 연동의 위시리스트 가져오기: 위시리스트 게임을 골라 관심 게임에 추가한다 */
export function SteamWishlist() {
  const { reload } = useFavorites();
  const [data, setData] = useState<Wishlist | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [shown, setShown] = useState(PAGE_SIZE);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    setSummary(null);
    try {
      const wishlist = await meApi.fetchSteamWishlist();
      setData(wishlist);
      // 아직 관심 게임이 아닌 것은 모두 골라 둔다
      setSelected(new Set(wishlist.items.filter((i) => !i.favorite).map((i) => i.appId)));
      setShown(PAGE_SIZE);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const toggle = (appId: number) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(appId)) next.delete(appId);
      else next.add(appId);
      return next;
    });

  const importSelected = async () => {
    if (!data) return;
    const byAppId = new Map(data.items.map((i) => [i.appId, i]));
    const appIds = data.items.filter((i) => selected.has(i.appId) && !i.favorite).map((i) => i.appId);
    const result: Summary = { added: 0, exists: 0, skipped: [] };
    const done = new Set<number>();
    setProgress({ done: 0, total: appIds.length });
    setError(null);
    setSummary(null);
    try {
      for (let i = 0; i < appIds.length; i += CHUNK) {
        const { results } = await meApi.importSteamWishlist(appIds.slice(i, i + CHUNK));
        for (const r of results) {
          if (r.status === 'added') result.added++;
          else if (r.status === 'exists') result.exists++;
          else result.skipped.push({ name: byAppId.get(r.appId)?.name ?? String(r.appId), reason: skipReason(r) });
          if (r.status === 'added' || r.status === 'exists') done.add(r.appId);
        }
        setProgress({ done: Math.min(i + CHUNK, appIds.length), total: appIds.length });
        // 묶음 전체가 조회 실패면 RAWG 쪽 문제(한도 초과 등)이므로 더 보내지 않는다. 실패한 게임은 선택된 채 남아 다시 시도할 수 있다
        if (results.length > 0 && results.every((r) => r.status === 'error')) {
          throw new Error(results[0]!.message ?? '게임 정보를 가져오지 못했습니다.');
        }
      }
    } catch (err) {
      setError(`가져오는 중 문제가 생겼습니다: ${errorMessage(err)}`);
    } finally {
      setProgress(null);
      // 추가된 게임은 목록에서 "관심 게임"으로 바꾸고 선택을 푼다. 오류로 중단됐어도 그때까지의 결과는 반영한다
      setData(
        (cur) => cur && { ...cur, items: cur.items.map((i) => (done.has(i.appId) ? { ...i, favorite: true } : i)) },
      );
      setSelected((cur) => new Set([...cur].filter((id) => !done.has(id))));
      setSummary(result);
      if (done.size > 0) reload();
    }
  };

  if (!data) {
    return (
      <div className="wishlist">
        <h3>위시리스트</h3>
        <p className="muted">
          Steam 위시리스트의 게임을 관심 게임으로 가져와 캘린더와 구독 주소에서 볼 수 있습니다. Steam 프로필의
          &quot;게임 세부 정보&quot;가 공개여야 합니다.
        </p>
        <button type="button" className="btn" onClick={load} disabled={loading}>
          {loading ? '불러오는 중…' : '위시리스트 불러오기'}
        </button>
        {error && <p className="form-error">{error}</p>}
      </div>
    );
  }

  const candidates = data.items.filter((i) => !i.favorite);
  const selectedCount = candidates.filter((i) => selected.has(i.appId)).length;
  const busy = progress !== null;

  return (
    <div className="wishlist">
      <h3>
        위시리스트 <span className="count">{data.items.length}</span>
      </h3>
      {data.items.length === 0 ? (
        <p className="muted">
          위시리스트가 비어 있거나 비공개입니다. Steam 프로필의 &quot;게임 세부 정보&quot;를 &quot;공개&quot;로 바꾼 뒤
          다시 시도해 주세요. (Steam → 프로필 편집 → 개인정보 보호 설정)
        </p>
      ) : (
        <>
          <div className="wishlist-toolbar">
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setSelected(new Set(candidates.map((i) => i.appId)))}
              disabled={busy || candidates.length === 0}
            >
              전체 선택
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setSelected(new Set())}
              disabled={busy || selectedCount === 0}
            >
              선택 해제
            </button>
            {data.excluded > 0 && <span className="muted">DLC·데모 {data.excluded}개 제외</span>}
          </div>
          <ul className="steam-games wishlist-items">
            {data.items.slice(0, shown).map((item) => (
              <li key={item.appId}>
                <WishlistRow item={item} checked={selected.has(item.appId)} disabled={busy} onToggle={toggle} />
              </li>
            ))}
          </ul>
          {shown < data.items.length && (
            <button type="button" className="btn btn-sm" onClick={() => setShown(shown + PAGE_SIZE)}>
              더 보기 ({data.items.length - shown}개 남음)
            </button>
          )}
          <div className="wishlist-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={importSelected}
              disabled={busy || selectedCount === 0}
            >
              {busy
                ? `추가하는 중… ${progress.done} / ${progress.total}`
                : `선택한 ${selectedCount}개 관심 게임에 추가`}
            </button>
            <button type="button" className="btn btn-sm" onClick={load} disabled={busy || loading}>
              다시 불러오기
            </button>
          </div>
        </>
      )}
      {error && <p className="form-error">{error}</p>}
      {summary && (
        <div className="form-success wishlist-summary" role="status">
          <p>
            관심 게임에 {summary.added}개를 추가했습니다.
            {summary.exists > 0 && ` 이미 있던 게임 ${summary.exists}개.`}
            {summary.skipped.length > 0 && ` 넣지 못한 게임 ${summary.skipped.length}개.`}
          </p>
          {summary.skipped.length > 0 && (
            <ul>
              {summary.skipped.map((s) => (
                <li key={s.name}>
                  {s.name} <span className="muted">({s.reason})</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function WishlistRow({
  item,
  checked,
  disabled,
  onToggle,
}: {
  item: SteamWishlistItem;
  checked: boolean;
  disabled: boolean;
  onToggle: (appId: number) => void;
}) {
  return (
    <label className={`steam-game wishlist-item${item.favorite ? ' is-favorite' : ''}`}>
      <input
        type="checkbox"
        checked={item.favorite || checked}
        disabled={disabled || item.favorite}
        onChange={() => onToggle(item.appId)}
        aria-label={item.name}
      />
      <img src={item.image} alt="" loading="lazy" width={92} height={43} />
      <span className="day-info">
        <strong>{item.name}</strong>
        <span>{item.released ? formatKoreanDate(item.released) : '출시일 미정'}</span>
      </span>
      {item.favorite && <span className="wishlist-badge">★ 관심 게임</span>}
    </label>
  );
}
