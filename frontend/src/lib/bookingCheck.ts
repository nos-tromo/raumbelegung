import { z } from 'zod';
import {
  REC_VALUES,
  clock,
  describe,
  findConflicts,
  fmt,
  mins,
  pd,
  type Rec,
  type Recurring,
} from './recurrence';
import type { BookingIn, Conflict } from './types';

export interface BookingFormValues {
  title: string;
  date: string;
  start: string;
  end: string;
  rec: Rec;
  until: string;
}

const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const hhmm = /^\d{2}:\d{2}$/;

/** Same rules as the backend's BookingIn validation (422 otherwise). */
export const bookingSchema = z
  .object({
    title: z.string().trim().min(1, 'Veranstaltung eintragen').max(80, 'Höchstens 80 Zeichen'),
    date: z.string().regex(isoDate, 'Datum eintragen'),
    start: z.string().regex(hhmm, 'Beginn eintragen'),
    end: z.string().regex(hhmm, 'Ende eintragen'),
    rec: z.enum(REC_VALUES),
    until: z.union([z.literal(''), z.string().regex(isoDate)]),
  })
  .refine((v) => mins(v.end) > mins(v.start), {
    path: ['end'],
    message: 'Das Ende muss nach dem Beginn liegen.',
  })
  .refine((v) => v.rec === 'none' || !v.until || v.until >= v.date, {
    path: ['until'],
    message: 'Die Serie darf nicht vor dem ersten Termin enden.',
  });

/** Payload for the API; `until` only for series, like the original. */
export function toBookingIn(v: BookingFormValues): BookingIn {
  const data: BookingIn = {
    title: v.title.trim(),
    date: v.date,
    start: v.start,
    end: v.end,
    rec: v.rec,
  };
  if (v.rec !== 'none' && v.until) data.until = v.until;
  return data;
}

export type CheckResult =
  | { kind: 'info' | 'bad'; heading: string; text: string; valid: false }
  | { kind: 'ok'; heading: string; text: string; valid: true }
  | { kind: 'conflict'; heading: string; lines: string[]; valid: true };

/** One line per conflicting booking, worded like the original. */
export function conflictLine(other: Recurring, dates: Date[]): string {
  const n = dates.length;
  const first = dates[0];
  const when = !first
    ? ''
    : n === 1
      ? 'am ' + fmt(first)
      : `${String(n)} Termine, erstmals am ${fmt(first)}`;
  return `${other.title} (${describe(other)}, ${clock(other)}): ${when}`;
}

export function serverConflictLines(conflicts: Conflict[]): string[] {
  return conflicts.map((c) => conflictLine(c.booking, c.dates.map(pd)));
}

/** Live room check, as `refreshForm()` in the original. */
export function checkBooking(v: BookingFormValues, existing: readonly Recurring[]): CheckResult {
  const title = v.title.trim();
  if (!title || !v.date || !v.start || !v.end) {
    return {
      kind: 'info',
      heading: 'Raumprüfung',
      text: 'Veranstaltung, Datum und Uhrzeit eintragen, dann prüfe ich den Raum.',
      valid: false,
    };
  }
  if (mins(v.end) <= mins(v.start)) {
    return {
      kind: 'bad',
      heading: 'Uhrzeit prüfen',
      text: 'Das Ende muss nach dem Beginn liegen.',
      valid: false,
    };
  }
  if (v.rec !== 'none' && v.until && v.until < v.date) {
    return {
      kind: 'bad',
      heading: 'Enddatum prüfen',
      text: 'Die Serie darf nicht vor dem ersten Termin enden.',
      valid: false,
    };
  }
  const found = findConflicts(toBookingIn(v), existing);
  if (!found.length) {
    return {
      kind: 'ok',
      heading: 'Raum frei',
      text: 'Keine Überschneidung mit bestehenden Terminen.',
      valid: true,
    };
  }
  return {
    kind: 'conflict',
    heading: 'Raum bereits vergeben',
    lines: found.map((c) => conflictLine(c.other, c.dates)),
    valid: true,
  };
}
