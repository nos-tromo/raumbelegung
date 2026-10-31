// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe as group, expect, it } from 'vitest';
import {
  DEFAULT_HORIZON,
  addDays,
  candidateDates,
  describe,
  findConflicts,
  iso,
  occursOn,
  overlaps,
  pd,
  recLabels,
  todayIso,
  type Recurring,
  type TimeRange,
} from './recurrence';

// Shared fixtures, generated from the original JS in Raumbelegung.html:
// ../shared/recurrence-cases.json, seen from frontend/.
const fixturePath = new URL('../../../shared/recurrence-cases.json', import.meta.url);

interface Cases {
  occursOn: { name: string; booking: Recurring; day: string; expected: boolean }[];
  overlaps: { name: string; a: TimeRange; b: TimeRange; expected: boolean }[];
  conflicts: {
    name: string;
    candidate: Recurring;
    others: Recurring[];
    horizon?: number;
    expected: { id: string; dates: string[] }[];
  }[];
  describe: { booking: Recurring; expected: string }[];
}

const cases = JSON.parse(readFileSync(fixturePath, 'utf8')) as Cases;

group(`recurrence fixtures (TZ=${process.env.TZ ?? 'local'})`, () => {
  it('has cases in every section', () => {
    expect(cases.occursOn.length).toBeGreaterThan(0);
    expect(cases.overlaps.length).toBeGreaterThan(0);
    expect(cases.conflicts.length).toBeGreaterThan(0);
    expect(cases.describe.length).toBeGreaterThan(0);
  });

  it.each(cases.occursOn.map((c) => [c.name, c] as const))('occursOn: %s', (_name, c) => {
    expect(occursOn(c.booking, pd(c.day))).toBe(c.expected);
  });

  it.each(cases.overlaps.map((c) => [c.name, c] as const))('overlaps: %s', (_name, c) => {
    expect(overlaps(c.a, c.b)).toBe(c.expected);
    expect(overlaps(c.b, c.a)).toBe(c.expected);
  });

  it.each(cases.conflicts.map((c) => [c.name, c] as const))('findConflicts: %s', (_name, c) => {
    const found = findConflicts(c.candidate, c.others, c.horizon ?? DEFAULT_HORIZON);
    expect(found.map((f) => ({ id: f.other.id, dates: f.dates.map(iso) }))).toEqual(c.expected);
  });

  it.each(cases.describe.map((c) => [c.expected, c] as const))('describe: %s', (_name, c) => {
    expect(describe(c.booking)).toBe(c.expected);
  });
});

group('date helpers', () => {
  it('pd/iso round-trip over two DST changes', () => {
    let d = pd('2026-01-01');
    for (let i = 0; i < 800; i++) {
      const next = addDays(d, 1);
      expect(next.getHours()).toBe(12);
      expect(Math.round((next.getTime() - d.getTime()) / 86400000)).toBe(1);
      d = next;
    }
    expect(iso(d)).toBe('2028-03-11');
  });

  it('candidateDates for a single booking is just the first date', () => {
    const dates = candidateDates(
      { title: 'X', date: '2026-03-29', start: '10:00', end: '11:00', rec: 'none' },
      730,
    );
    expect(dates.map(iso)).toEqual(['2026-03-29']);
  });

  it('todayIso respects the calendar time zone', () => {
    const now = new Date('2026-10-31T23:30:00Z');
    expect(todayIso('Europe/Berlin', now)).toBe('2026-11-01');
    expect(todayIso('America/Los_Angeles', now)).toBe('2026-10-31');
    expect(todayIso('Not/AZone', now)).toBe(iso(now));
  });

  it('recLabels follow the chosen date', () => {
    const l = recLabels('2026-11-04');
    expect(l.weekly).toBe('Wöchentlich (jeden Mittwoch)');
    expect(l.monthly).toBe('Monatlich (jeden 1. Mittwoch)');
    expect(l.monthlyLast).toBe('Monatlich (jeden letzten Mittwoch)');
    expect(recLabels('').weekly).toBe('Wöchentlich');
  });
});
