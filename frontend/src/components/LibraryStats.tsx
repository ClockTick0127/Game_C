import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { errorMessage } from '../api/client';
import * as meApi from '../api/me';
import type { AchievementSummary, GameLog, GameStatus, SteamOwnedGame } from '../types';
import { GAME_STATUSES, STATUS_ICONS, STATUS_LABELS } from '../utils/library';
import {
  achievementStats,
  byLastPlayedYear,
  byPersona,
  formatHours,
  percent,
  PERSONA_LABELS,
  summarizeLibrary,
  summarizeLogs,
  topPlayed,
} from '../utils/libraryStats';
import { Cover } from './LibraryParts';

/** 분위기별 막대에 보여 주는 개수. 나머지는 "그 외 N가지"로 접는다 */
const PERSONA_ROWS = 5;

interface BarRow {
  key: string;
  label: string;
  /** 막대 길이를 정하는 값 */
  value: number;
  /** 막대 옆에 적는 글 */
  text: string;
}

/**
 * 가로 막대 목록. max를 주지 않으면 가장 긴 막대를 100%로 해서 나머지를 비율로 그린다(개수·시간처럼 절대 기준이 없는 값).
 * 달성률처럼 0~100이 의미를 갖는 값은 max=100을 줘서, 90%가 막대 끝까지 차 보이지 않게 한다.
 * 값은 글로도 적어 두므로 막대는 스크린리더에 숨긴다
 */
function Bars({ rows, max: fixedMax }: { rows: BarRow[]; max?: number }) {
  const max = fixedMax ?? Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="stat-bars">
      {rows.map((r) => (
        <li key={r.key}>
          <span className="stat-bar-label" title={r.label}>
            {r.label}
          </span>
          <span className="stat-bar-track" aria-hidden="true">
            <span className="stat-bar-fill" style={{ width: `${(r.value / max) * 100}%` }} />
          </span>
          <span className="stat-bar-text">{r.text}</span>
        </li>
      ))}
    </ul>
  );
}

function Box({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="stat-box" aria-label={title}>
      <div className="stat-box-head">
        <h3>{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/** 요소의 폭(px). 그림을 폭에 맞춰 1:1로 그리려고 잰다. 재지 못하는 환경(테스트)에서는 fallback을 쓴다 */
function useWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth || fallback));
    observer.observe(el);
    return () => observer.disconnect();
  }, [fallback]);
  return [ref, width] as const;
}

const CHART_HEIGHT = 120;
const CHART_TOP = 18; // 막대 위 개수 글자 자리
const CHART_BOTTOM = 20; // 연도 글자 자리

/** 첫 해부터 마지막 해까지 빠진 해를 0개로 채운다 (가로축이 시간 순서대로 고르게 흐르게) */
function fillYears(years: { year: number; games: number }[]): { year: number; games: number }[] {
  if (years.length === 0) return [];
  const byYear = new Map(years.map((y) => [y.year, y.games]));
  const first = years[0]!.year;
  const last = years[years.length - 1]!.year;
  return Array.from({ length: last - first + 1 }, (_, i) => ({ year: first + i, games: byYear.get(first + i) ?? 0 }));
}

/**
 * 마지막 플레이 연도 세로 막대 차트(SVG). 가장 많은 해를 100%로 한 상대 높이이고 올해만 포인트 색이다.
 * 막대가 좁아져도 글자가 작아지지 않게 SVG를 컨테이너 폭(px)으로 그린다. 값은 아래의 글 목록(스크린리더용)에도 있다
 */
function YearChart({ years, thisYear }: { years: { year: number; games: number }[]; thisYear: number }) {
  const [ref, width] = useWidth<HTMLDivElement>(720);
  const rows = fillYears(years);
  const max = Math.max(...rows.map((r) => r.games), 1);
  const slot = width / rows.length;
  const barWidth = Math.min(slot * 0.62, 44);
  const plotHeight = CHART_HEIGHT - CHART_TOP - CHART_BOTTOM;
  // 칸이 좁으면 연도를 두 자리로 줄인다 ('24)
  const label = (year: number) => (slot < 36 ? `’${String(year).slice(2)}` : String(year));

  return (
    <div ref={ref} className="stat-year-chart">
      <svg
        width={width}
        height={CHART_HEIGHT}
        viewBox={`0 0 ${width} ${CHART_HEIGHT}`}
        aria-hidden="true"
        focusable="false"
      >
        {rows.map((r, i) => {
          const h = r.games === 0 ? 2 : Math.max(2, (r.games / max) * plotHeight);
          const x = i * slot + (slot - barWidth) / 2;
          const y = CHART_TOP + plotHeight - h;
          return (
            <g key={r.year}>
              <title>{`${r.year}년 · ${r.games}개`}</title>
              {/* 막대가 낮아도 칸 전체가 툴팁에 반응하도록 투명한 칸을 깐다 */}
              <rect x={i * slot} y={0} width={slot} height={CHART_HEIGHT} fill="transparent" />
              <rect
                className={r.year === thisYear ? 'stat-year-bar now' : 'stat-year-bar'}
                x={x}
                y={y}
                width={barWidth}
                height={h}
                rx={Math.min(3, barWidth / 2)}
              />
              {r.games > 0 && (
                <text className="stat-year-count" x={i * slot + slot / 2} y={y - 5} textAnchor="middle">
                  {r.games}
                </text>
              )}
              <text className="stat-year-label" x={i * slot + slot / 2} y={CHART_HEIGHT - 5} textAnchor="middle">
                {label(r.year)}
              </text>
            </g>
          );
        })}
      </svg>
      <ul className="sr-only">
        {years.map((y) => (
          <li key={y.year}>
            {y.year}년 {y.games}개
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 별 5개 그래픽. 평균을 0.5 단위로 반올림해서 그만큼 채운다 (채운 별 var(--star), 빈 별 var(--surface-3)) */
function Stars({ rating }: { rating: number }) {
  const id = useId();
  const filled = Math.round(rating * 2) / 2;
  const STAR = 'M8 .8l2.1 4.6 5 .6-3.7 3.4 1 5L8 12l-4.4 2.4 1-5L.9 6l5-.6z';
  return (
    <svg className="stat-stars" width="84" height="16" viewBox="0 0 84 16" aria-hidden="true" focusable="false">
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.min(1, Math.max(0, filled - i));
        const gradient = `${id}-${i}`;
        return (
          <g key={i} transform={`translate(${i * 17} 0)`}>
            <defs>
              <linearGradient id={gradient}>
                <stop offset={fill} stopColor="var(--star)" />
                <stop offset={fill} stopColor="var(--surface-3)" />
              </linearGradient>
            </defs>
            <path d={STAR} fill={`url(#${gradient})`} />
          </g>
        );
      })}
    </svg>
  );
}

const STATUS_COLORS: Record<GameStatus, string> = {
  playing: 'var(--accent)',
  cleared: 'var(--success)',
  backlog: 'var(--gold)',
  dropped: 'var(--text-dim)',
};

interface Props {
  /** Steam 보유 게임 (플레이 시간이 있는 쪽) */
  games: SteamOwnedGame[];
  logs: Record<number, GameLog>;
  /** 서재에 있는 모든 게임의 번호 (직접 추가한 게임 포함). 남긴 기록 중 서재에 있는 것만 센다 */
  libraryIds: Set<number>;
  /** "가장 오래 한 게임"을 누르면 그 게임의 창을 연다 */
  onOpen: (game: SteamOwnedGame) => void;
  /** "올해"로 볼 해. 마지막 플레이 연도(UTC)와 같은 기준이다 */
  thisYear?: number;
}

/** 서재 통계: 이미 받아 둔 플레이 시간·분위기·기록으로 계산하고, 업적 달성률만 눌렀을 때 Steam에서 가져온다 */
export function LibraryStats({ games, logs, libraryIds, onOpen, thisYear = new Date().getUTCFullYear() }: Props) {
  const summary = summarizeLibrary(games);
  const { bars, pending } = byPersona(games);
  const years = byLastPlayedYear(games);
  const top = topPlayed(games);
  const logSummary = summarizeLogs(logs, libraryIds);
  const playedThisYear = years.find((y) => y.year === thisYear)?.games ?? 0;

  const shownBars = bars.slice(0, PERSONA_ROWS);
  const foldedBars = bars.slice(PERSONA_ROWS);

  return (
    <section className="stats" aria-label="서재 통계">
      {/* 툴바가 이미 보유 게임 수와 총 플레이 시간을 보여 주므로 그 밖의 값만 한 줄 띠로 */}
      <ul className="stat-kpis">
        <li>
          <strong className="accent">
            {summary.unplayed.toLocaleString('ko-KR')}개 ({percent(summary.unplayed, summary.games)}%)
          </strong>
          <span>아직 안 해 본 게임</span>
        </li>
        <li>
          <strong>{playedThisYear.toLocaleString('ko-KR')}개</strong>
          <span>올해 플레이한 게임</span>
        </li>
        <li>
          <strong>{formatHours(summary.averageMinutes)}</strong>
          <span>플레이한 게임당 평균</span>
        </li>
        <li>
          <strong>{logSummary.counts.cleared.toLocaleString('ko-KR')}개</strong>
          <span>클리어한 게임</span>
        </li>
      </ul>

      <Box title="마지막 플레이 연도">
        {years.length === 0 ? (
          <p className="muted">플레이한 기록이 있는 게임이 없어요.</p>
        ) : (
          <YearChart years={years} thisYear={thisYear} />
        )}
        <p className="stat-note muted">Steam은 구매일을 알려 주지 않아서, 마지막으로 플레이한 해로 보여 줘요.</p>
      </Box>

      <div className="stat-grid">
        <Box title="분위기별 플레이 시간">
          {bars.length === 0 ? (
            <p className="muted">
              {pending > 0 ? '분위기를 알아내는 중이에요. 잠시 뒤에 다시 열어 보세요.' : '보유 게임이 없어요.'}
            </p>
          ) : (
            <>
              <Bars
                rows={shownBars.map((b) => ({
                  key: b.persona,
                  label: PERSONA_LABELS[b.persona],
                  value: b.minutes,
                  text: `${formatHours(b.minutes)} · ${b.games}개`,
                }))}
              />
              {foldedBars.length > 0 && (
                <p className="stat-more">
                  그 외 {foldedBars.length}가지 · {formatHours(foldedBars.reduce((sum, b) => sum + b.minutes, 0))}
                </p>
              )}
            </>
          )}
          <p className="stat-note muted">
            게임 태그로 짐작한 분위기라 실제 장르와 다를 수 있어요.
            {pending > 0 && ` 분위기를 아직 모르는 게임 ${pending}개는 빠져 있어요.`}
          </p>
        </Box>

        <Box title="가장 오래 한 게임">
          {top.length === 0 ? (
            <p className="muted">플레이한 기록이 있는 게임이 없어요.</p>
          ) : (
            <ol className="stat-top">
              {top.map((g) => (
                <li key={g.appId}>
                  <button type="button" className="stat-top-item" onClick={() => onOpen(g)}>
                    <span className="stat-top-thumb" aria-hidden="true">
                      <Cover game={g} />
                    </span>
                    <span className="stat-top-name">{g.name}</span>
                    <span className="stat-top-time">{formatHours(g.playtimeMinutes)}</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </Box>

        <Box title="내 기록">
          {logSummary.logged === 0 ? (
            <p className="muted">아직 남긴 기록이 없어요. 게임을 눌러 상태와 별점을 남겨 보세요.</p>
          ) : (
            <>
              <div className="stat-stack" aria-hidden="true">
                {GAME_STATUSES.filter((s) => logSummary.counts[s] > 0).map((s) => (
                  <span
                    key={s}
                    style={{
                      width: `${(logSummary.counts[s] / logSummary.logged) * 100}%`,
                      background: STATUS_COLORS[s],
                    }}
                  />
                ))}
              </div>
              <ul className="stat-legend">
                {GAME_STATUSES.map((s) => (
                  <li key={s}>
                    <span className="stat-legend-dot" style={{ background: STATUS_COLORS[s] }} aria-hidden="true" />
                    <span className="stat-legend-label">
                      {STATUS_ICONS[s]} {STATUS_LABELS[s]}
                    </span>
                    <span className="stat-legend-count">{logSummary.counts[s]}개</span>
                  </li>
                ))}
              </ul>
              <div className="stat-rating">
                {logSummary.averageRating !== null && <Stars rating={logSummary.averageRating} />}
                <p className="stat-note">
                  {logSummary.averageRating === null
                    ? '별점을 남긴 게임이 아직 없어요.'
                    : `평균 별점 ★${logSummary.averageRating} (${logSummary.rated}개 게임)`}
                </p>
              </div>
            </>
          )}
        </Box>
      </div>

      <AchievementStats />
    </section>
  );
}

type Loaded =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'done'; summary: AchievementSummary };

/** 업적 달성률. 게임마다 Steam을 불러야 해서 서재를 열 때마다 계산하지 않고, 버튼을 눌렀을 때만 가져온다 */
function AchievementStats() {
  const [loaded, setLoaded] = useState<Loaded>({ state: 'idle' });

  const load = async () => {
    setLoaded({ state: 'loading' });
    try {
      setLoaded({ state: 'done', summary: await meApi.fetchAchievementSummary() });
    } catch (err) {
      setLoaded({ state: 'error', message: errorMessage(err) });
    }
  };

  const waiting = loaded.state !== 'done';
  return (
    <Box
      title="업적 달성률"
      action={
        waiting && (
          <button type="button" className="btn btn-sm" onClick={load} disabled={loaded.state === 'loading'}>
            {loaded.state === 'loading' ? '불러오는 중… (몇 초 걸려요)' : '업적 달성률 계산하기'}
          </button>
        )
      }
    >
      {waiting && <p className="stat-hint muted">플레이 시간이 긴 게임 20개까지만 확인해요.</p>}
      {loaded.state === 'error' && <p className="form-error">업적을 불러오지 못했습니다: {loaded.message}</p>}
      {loaded.state === 'done' && <AchievementResult summary={loaded.summary} onReload={load} />}
    </Box>
  );
}

function AchievementResult({ summary, onReload }: { summary: AchievementSummary; onReload: () => void }) {
  if (summary.private) {
    return <p className="muted">게임 세부 정보가 비공개라 업적을 볼 수 없어요.</p>;
  }
  const stats = achievementStats(summary);
  return (
    <>
      {summary.games.length === 0 ? (
        <p className="muted">업적이 있는 게임이 없어요.</p>
      ) : (
        <>
          <p className="stat-achievement-total">
            <strong>{stats.percent}%</strong>
            <span className="stat-achievement-unit">달성</span>
            <span className="stat-achievement-count">
              업적 {stats.achieved.toLocaleString('ko-KR')} / {stats.total.toLocaleString('ko-KR')}개
            </span>
            <span className="stat-chip">모두 달성 {stats.perfect}개</span>
          </p>
          <Bars
            max={100}
            rows={summary.games.map((g) => ({
              key: String(g.appId),
              label: g.name,
              value: percent(g.achieved, g.total),
              text: `${g.achieved} / ${g.total} (${percent(g.achieved, g.total)}%)`,
            }))}
          />
        </>
      )}
      <p className="stat-note muted">
        확인한 게임 {summary.checked}개 중 업적이 있는 게임 {summary.games.length}개
        {summary.hidden > 0 && ` · 업적이 비공개인 게임 ${summary.hidden}개`}
        {summary.failed > 0 && ` · 불러오지 못한 게임 ${summary.failed}개`}
      </p>
      {summary.failed > 0 && (
        <button type="button" className="btn btn-sm" onClick={onReload}>
          다시 불러오기
        </button>
      )}
    </>
  );
}
