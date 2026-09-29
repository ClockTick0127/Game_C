import type { Game } from '../types.ts';

/** iCalendar(.ics, RFC 5545) 텍스트를 만든다. DB나 서버 상태와 무관한 순수 함수 모음. */
/** RFC 5545 TEXT 값 이스케이프 */
function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** 한 줄은 75옥텟을 넘지 않아야 하므로 넘으면 CRLF + 공백으로 이어 쓴다. 글자(UTF-8) 중간에서는 자르지 않는다. */
function fold(line: string): string {
  const parts: string[] = [];
  let current = '';
  let bytes = 0;
  for (const char of line) {
    const size = Buffer.byteLength(char);
    // 이어지는 줄은 맨 앞 공백 1옥텟을 쓴다
    const limit = parts.length === 0 ? 75 : 74;
    if (bytes + size > limit) {
      parts.push(current);
      current = '';
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

const compactDate = (key: string) => key.replaceAll('-', '');

/** 종일 일정의 DTEND는 마지막 날의 다음 날이다 */
function nextDay(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + 1)).toISOString().slice(0, 10).replaceAll('-', '');
}

function toEvent(game: Game, stamp: string): string[] {
  const description = [
    game.platforms.length ? `플랫폼: ${game.platforms.join(', ')}` : '',
    game.genres.length ? `장르: ${game.genres.join(', ')}` : '',
    game.url ?? '',
  ]
    .filter(Boolean)
    .join('\n');
  return [
    'BEGIN:VEVENT',
    `UID:game-${game.id}@game-calendar`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${compactDate(game.released)}`,
    `DTEND;VALUE=DATE:${nextDay(game.released)}`,
    `SUMMARY:${escapeText(game.name)}`,
    ...(description ? [`DESCRIPTION:${escapeText(description)}`] : []),
    ...(game.url ? [`URL:${game.url}`] : []),
    'TRANSP:TRANSPARENT',
    'END:VEVENT',
  ];
}

export function buildIcs(calendarName: string, games: Game[], now = new Date()): string {
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//game-calendar//favorites//KO',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calendarName)}`,
    // 캘린더 앱이 다시 가져오는 주기 힌트 (지원하는 앱에서만 반영된다)
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    'X-PUBLISHED-TTL:PT6H',
    ...games.flatMap((game) => toEvent(game, stamp)),
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}
