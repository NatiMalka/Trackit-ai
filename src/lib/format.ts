const HE = 'he-IL';

const dayMonth = new Intl.DateTimeFormat(HE, { day: 'numeric', month: 'short' });
const dayMonthYear = new Intl.DateTimeFormat(HE, { day: 'numeric', month: 'short', year: 'numeric' });
const timeOnly = new Intl.DateTimeFormat(HE, { hour: '2-digit', minute: '2-digit' });
const weekday = new Intl.DateTimeFormat(HE, { weekday: 'long' });

export const MS_DAY = 86_400_000;

export function toDate(value: Date | string | number): Date {
  return value instanceof Date ? value : new Date(value);
}

export function startOfDay(value: Date | string | number): Date {
  const d = toDate(value);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Whole days between two instants, ignoring time of day. */
export function daysBetween(from: Date | string | number, to: Date | string | number = Date.now()) {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / MS_DAY);
}

export function formatDate(value: Date | string | number) {
  const d = toDate(value);
  return d.getFullYear() === new Date().getFullYear() ? dayMonth.format(d) : dayMonthYear.format(d);
}

export function formatTime(value: Date | string | number) {
  return timeOnly.format(toDate(value));
}

export function formatWeekday(value: Date | string | number) {
  return weekday.format(toDate(value));
}

/** "לפני 3 ימים" / "היום" / "אתמול" — the phrasing users scan fastest. */
export function relativeDays(value: Date | string | number) {
  const days = daysBetween(value);
  if (days <= 0) return 'היום';
  if (days === 1) return 'אתמול';
  if (days === 2) return 'לפני יומיים';
  if (days < 7) return `לפני ${days} ימים`;
  if (days < 14) return 'לפני שבוע';
  if (days < 30) return `לפני ${Math.floor(days / 7)} שבועות`;
  if (days < 60) return 'לפני חודש';
  return `לפני ${Math.floor(days / 30)} חודשים`;
}

/** Hebrew day count with correct singular/dual/plural. */
export function dayCount(days: number) {
  if (days === 0) return 'היום';
  if (days === 1) return 'יום אחד';
  if (days === 2) return 'יומיים';
  return `${days} ימים`;
}

/**
 * Hebrew package count. Hebrew has a dual form and puts the numeral after the
 * noun for one, so "1 חבילות" is doubly wrong and immediately reads as machine
 * output.
 */
export function packageCount(count: number) {
  if (count === 1) return 'חבילה אחת';
  if (count === 2) return 'שתי חבילות';
  return `${count} חבילות`;
}

/** An ETA window collapsed to the shortest phrase that stays accurate. */
export function formatEtaRange(from: string | Date, to: string | Date) {
  const a = toDate(from);
  const b = toDate(to);
  const aDays = daysBetween(Date.now(), a);
  const bDays = daysBetween(Date.now(), b);

  if (bDays < 0) return 'חלף התאריך המשוער';
  if (aDays <= 0 && bDays <= 0) return 'היום';
  if (aDays <= 0 && bDays === 1) return 'היום או מחר';
  if (aDays === bDays) return `${formatWeekday(a)}, ${formatDate(a)}`;
  if (bDays <= 7) return `${formatDate(a)} – ${formatDate(b)} (בעוד ${aDays}–${bDays} ימים)`;
  return `${formatDate(a)} – ${formatDate(b)}`;
}

/**
 * Tracking numbers are displayed as-is. Grouping them into blocks of four looks
 * tidy for pure-digit couriers but mangles mixed formats like LP00123456789012,
 * and users need to compare the string character-for-character against the one
 * in their email. Pair with the `ltr` and `tnum` utilities at the call site.
 */
export function prettyTracking(tn: string) {
  return tn.trim().toUpperCase();
}
