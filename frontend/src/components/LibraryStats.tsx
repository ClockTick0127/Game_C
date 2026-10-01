import { useState, type ReactNode } from 'react';
import { errorMessage } from '../api/client';
import * as meApi from '../api/me';
import type { AchievementSummary, GameLog, SteamOwnedGame } from '../types';
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
          <span className="stat-bar-label">{r.label}</span>
          <span className="stat-bar-track" aria-hidden="true">
            <span className="stat-bar-fill" style={{ width: `${(r.value / max) * 100}%` }} />
          </span>
          <span className="stat-bar-text">{r.text}</span>
        </li>
      ))}
    </ul>
  );
}

function Box({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="stat-box" aria-label={title}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

interface Props {
  /** Steam 보유 게임 (플레이 시간이 있는 쪽) */
  games: SteamOwnedGame[];
  logs: Record<number, GameLog>;
  /** 서재에 있는 모든 게임의 번호 (직접 추가한 게임 포함). 남긴 기록 중 서재에 있는 것만 센다 */
  libraryIds: Set<number>;
}

/** 서재 통계: 이미 받아 둔 플레이 시간·분위기·기록으로 계산하고, 업적 달성률만 눌렀을 때 Steam에서 가져온다 */
export function LibraryStats({ games, logs, libraryIds }: Props) {
  const summary = summarizeLibrary(games);
  const { bars, pending } = byPersona(games);
  const years = byLastPlayedYear(games);
  const top = topPlayed(games);
  const logSummary = summarizeLogs(logs, libraryIds);

  return (
    <section className="stats" aria-label="서재 통계">
      <ul className="stat-cards">
        <li>
          <strong>{summary.games.toLocaleString('ko-KR')}개</strong>
          <span>Steam 보유 게임</span>
        </li>
        <li>
          <strong>{formatHours(summary.totalMinutes)}</strong>
          <span>총 플레이 시간</span>
        </li>
        <li>
          <strong>
            {summary.unplayed.toLocaleString('ko-KR')}개 ({percent(summary.unplayed, summary.games)}%)
          </strong>
          <span>아직 안 해 본 게임</span>
        </li>
        <li>
          <strong>{formatHours(summary.averageMinutes)}</strong>
          <span>플레이한 게임당 평균</span>
        </li>
      </ul>

      <div className="stat-grid">
        <Box title="분위기별 플레이 시간">
          {bars.length === 0 ? (
            <p className="muted">
              {pending > 0 ? '분위기를 알아내는 중이에요. 잠시 뒤에 다시 열어 보세요.' : '보유 게임이 없어요.'}
            </p>
          ) : (
            <Bars
              rows={bars.map((b) => ({
                key: b.persona,
                label: PERSONA_LABELS[b.persona],
                value: b.minutes,
                text: `${formatHours(b.minutes)} · ${b.games}개`,
              }))}
            />
          )}
          <p className="stat-note muted">
            게임 태그로 짐작한 분위기라 실제 장르와 다를 수 있어요.
            {pending > 0 && ` 분위기를 아직 모르는 게임 ${pending}개는 빠져 있어요.`}
          </p>
        </Box>

        <Box title="마지막 플레이 연도">
          {years.length === 0 ? (
            <p className="muted">플레이한 기록이 있는 게임이 없어요.</p>
          ) : (
            <Bars
              rows={years.map((y) => ({
                key: String(y.year),
                label: `${y.year}년`,
                value: y.games,
                text: `${y.games}개`,
              }))}
            />
          )}
          <p className="stat-note muted">Steam은 구매일을 알려 주지 않아서, 마지막으로 플레이한 해로 보여 줘요.</p>
        </Box>

        <Box title="가장 오래 한 게임">
          {top.length === 0 ? (
            <p className="muted">플레이한 기록이 있는 게임이 없어요.</p>
          ) : (
            <ol className="stat-top">
              {top.map((g) => (
                <li key={g.appId}>
                  <span className="stat-top-name">{g.name}</span>
                  <span className="stat-bar-text">{formatHours(g.playtimeMinutes)}</span>
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
              <Bars
                rows={GAME_STATUSES.map((s) => ({
                  key: s,
                  label: `${STATUS_ICONS[s]} ${STATUS_LABELS[s]}`,
                  value: logSummary.counts[s],
                  text: `${logSummary.counts[s]}개`,
                }))}
              />
              <p className="stat-note">
                {logSummary.averageRating === null
                  ? '별점을 남긴 게임이 아직 없어요.'
                  : `평균 별점 ★${logSummary.averageRating} (${logSummary.rated}개 게임)`}
              </p>
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

  return (
    <Box title="업적 달성률">
      {(loaded.state === 'idle' || loaded.state === 'error' || loaded.state === 'loading') && (
        <div className="stat-achievement-start">
          <button type="button" className="btn btn-sm" onClick={load} disabled={loaded.state === 'loading'}>
            {loaded.state === 'loading' ? '불러오는 중… (몇 초 걸려요)' : '업적 달성률 계산하기'}
          </button>
          <span className="muted">플레이 시간이 긴 게임 20개까지만 확인해요.</span>
        </div>
      )}
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
            <strong>{stats.percent}%</strong> 달성 · 업적 {stats.achieved.toLocaleString('ko-KR')} /{' '}
            {stats.total.toLocaleString('ko-KR')}개 · 모두 달성한 게임 {stats.perfect}개
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
