import { mins, pd } from './recurrence';
import type { Booking } from './types';

/** Series first (Mon → Sun, daily/weekdays on top), then upcoming single dates. */
export function sortForList(items: readonly Booking[], today: string): Booking[] {
  return items
    .filter((b) => b.rec !== 'none' || b.date >= today)
    .sort((a, b) => {
      const ra = a.rec === 'none' ? 1 : 0;
      const rb = b.rec === 'none' ? 1 : 0;
      if (ra !== rb) return ra - rb;
      if (!ra) {
        const wk = (x: Booking) =>
          x.rec === 'daily' || x.rec === 'weekdays' ? -1 : (pd(x.date).getDay() + 6) % 7;
        return wk(a) - wk(b) || mins(a.start) - mins(b.start);
      }
      return a.date.localeCompare(b.date) || mins(a.start) - mins(b.start);
    });
}
