/**
 * 1:1 port of the booking logic in Raumbelegung.html (lines 185–242).
 *
 * Dates are local calendar dates (YYYY-MM-DD) without a time zone. Every Date
 * object here is set to 12:00 local time, so day arithmetic stays correct
 * across DST changes in any browser time zone.
 *
 * The backend has the same logic in backend/app/domain/recurrence.py; both must
 * pass shared/recurrence-cases.json. Change them together.
 */

export const REC_VALUES = [
  'none',
  'daily',
  'weekdays',
  'weekly',
  'monthly',
  'monthlyLast',
] as const;
export type Rec = (typeof REC_VALUES)[number];

export interface Recurring {
  id?: string | null;
  title: string;
  date: string;
  start: string;
  end: string;
  rec: Rec;
  until?: string | null;
}

export interface TimeRange {
  start: string;
  end: string;
}

export interface FoundConflict<T extends Recurring> {
  other: T;
  dates: Date[];
}

export const DEFAULT_HORIZON = 730;

export const WD = [
  'Sonntag',
  'Montag',
  'Dienstag',
  'Mittwoch',
  'Donnerstag',
  'Freitag',
  'Samstag',
] as const;
export const WD_S = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'] as const;
export const MONTHS = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
] as const;

export const pad = (n: number): string => String(n).padStart(2, '0');

/** Parse YYYY-MM-DD into a local Date at noon. */
export const pd = (s: string): Date => {
  const [y = 0, m = 1, d = 1] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
};

export const iso = (d: Date): string =>
  String(d.getFullYear()) + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());

export const fmt = (d: Date): string =>
  WD_S[d.getDay()]! +
  ', ' +
  pad(d.getDate()) +
  '.' +
  pad(d.getMonth() + 1) +
  '.' +
  String(d.getFullYear());

export const mins = (t: string): number => {
  const [h = 0, m = 0] = t.split(':').map(Number);
  return h * 60 + m;
};

/** Which occurrence of its weekday within the month (1–5). */
export const nth = (d: Date): number => Math.ceil(d.getDate() / 7);

export const addDays = (d: Date, n: number): Date =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12);

export function occursOn(b: Recurring, d: Date): boolean {
  const s = iso(d);
  if (s < b.date) return false;
  if (b.until && s > b.until) return false;
  if (b.rec === 'none') return s === b.date;
  if (b.rec === 'daily') return true;
  if (b.rec === 'weekdays') return d.getDay() >= 1 && d.getDay() <= 5;
  const st = pd(b.date);
  if (d.getDay() !== st.getDay()) return false;
  if (b.rec === 'weekly') return true;
  if (b.rec === 'monthlyLast')
    return d.getDate() + 7 > new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return nth(d) === nth(st);
}

export function overlaps(a: TimeRange, b: TimeRange): boolean {
  return mins(a.start) < mins(b.end) && mins(b.start) < mins(a.end);
}

export function candidateDates(b: Recurring, horizon: number): Date[] {
  const first = pd(b.date);
  if (b.rec === 'none') return [first];
  const out: Date[] = [];
  for (let i = 0; i <= horizon; i++) {
    const d = addDays(first, i);
    if (b.until && iso(d) > b.until) break;
    if (occursOn(b, d)) out.push(d);
  }
  return out;
}

export function findConflicts<T extends Recurring>(
  b: Recurring,
  others: readonly T[],
  horizon = DEFAULT_HORIZON,
): FoundConflict<T>[] {
  // Keyed by id like the original; items without id share the key undefined.
  const map = new Map<string | null | undefined, FoundConflict<T>>();
  for (const d of candidateDates(b, horizon)) {
    for (const o of others) {
      if (o.id && o.id === b.id) continue;
      if (occursOn(o, d) && overlaps(b, o)) {
        let entry = map.get(o.id);
        if (!entry) {
          entry = { other: o, dates: [] };
          map.set(o.id, entry);
        }
        entry.dates.push(d);
      }
    }
  }
  return [...map.values()];
}

export function describe(b: Recurring): string {
  const d = pd(b.date);
  const u = b.until ? pd(b.until) : null;
  const until = u
    ? ' bis ' + pad(u.getDate()) + '.' + pad(u.getMonth() + 1) + '.' + String(u.getFullYear())
    : '';
  const wd = WD[d.getDay()]!;
  if (b.rec === 'daily') return 'täglich' + until;
  if (b.rec === 'weekdays') return 'Montag bis Freitag' + until;
  if (b.rec === 'monthlyLast') return 'jeden letzten ' + wd + ' im Monat' + until;
  if (b.rec === 'weekly') return 'jeden ' + wd + until;
  if (b.rec === 'monthly') return 'jeden ' + String(nth(d)) + '. ' + wd + ' im Monat' + until;
  return fmt(d);
}

/* ---------- Helpers outside the original logic block ---------- */

export const clock = (b: TimeRange): string => b.start + '–' + b.end;

/** Today's date (YYYY-MM-DD) in the given IANA time zone, or the browser's zone. */
export function todayIso(timeZone?: string, now: Date = new Date()): string {
  if (timeZone) {
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(now);
      const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
      const s = `${get('year')}-${get('month')}-${get('day')}`;
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    } catch {
      // Unknown time zone: fall back to the browser's local date.
    }
  }
  return iso(now);
}

/** Labels for the rec select, depending on the chosen first date (like the original). */
export function recLabels(date: string | null | undefined): Record<Rec, string> {
  const d = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? pd(date) : null;
  const wd = d ? WD[d.getDay()]! : '';
  return {
    none: 'Einmalig',
    daily: 'Täglich',
    weekdays: 'Montag bis Freitag',
    weekly: d ? `Wöchentlich (jeden ${wd})` : 'Wöchentlich',
    monthly: d ? `Monatlich (jeden ${String(nth(d))}. ${wd})` : 'Monatlich',
    monthlyLast: d ? `Monatlich (jeden letzten ${wd})` : 'Monatlich, letzter Wochentag',
  };
}
