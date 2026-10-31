export const DEFAULT_TIMEZONE = 'Europe/Berlin';

export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

const FALLBACK = [
  'Europe/Berlin',
  'Europe/Vienna',
  'Europe/Zurich',
  'Europe/Luxembourg',
  'Europe/Brussels',
  'Europe/Amsterdam',
  'Europe/Paris',
  'Europe/London',
  'Europe/Rome',
  'Europe/Madrid',
  'Europe/Warsaw',
  'Europe/Prague',
  'UTC',
];

/** IANA zones for the select, with the given value always included. */
export function timeZones(current?: string): string[] {
  let list: string[] = FALLBACK;
  try {
    const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
    const all = intl.supportedValuesOf?.('timeZone');
    if (all?.length) list = all;
  } catch {
    // keep fallback
  }
  if (current && !list.includes(current)) list = [current, ...list];
  return list;
}
