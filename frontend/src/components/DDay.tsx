import { daysUntil } from '../utils/calendar';

/** 출시까지 남은 날 뱃지. 이미 출시된 게임은 표시하지 않는다. */
export function DDay({ released }: { released: string }) {
  const days = daysUntil(released);
  if (days < 0) return null;
  return <span className={days <= 7 ? 'dday soon' : 'dday'}>{days === 0 ? 'D-DAY' : `D-${days}`}</span>;
}
