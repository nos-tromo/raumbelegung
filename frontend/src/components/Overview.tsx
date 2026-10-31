import { useMemo, useState } from 'react';
import {
  MONTHS,
  WD_S,
  addDays,
  clock,
  mins,
  occursOn,
  overlaps,
  pad,
  pd,
  type Recurring,
} from '../lib/recurrence';

interface Item extends Recurring {
  id: string;
}

type View = '4w' | number;

const DAY_MS = 86_400_000;

function occurrencesOn<T extends Item>(items: readonly T[], day: Date): T[] {
  return items.filter((b) => occursOn(b, day)).sort((a, b) => mins(a.start) - mins(b.start));
}

function DayBlock({ day, occ, offset }: { day: Date; occ: Item[]; offset: number }) {
  const clash = new Set<string>();
  occ.forEach((a, x) =>
    occ.forEach((b, y) => {
      if (x < y && overlaps(a, b)) {
        clash.add(a.id);
        clash.add(b.id);
      }
    }),
  );
  return (
    <div className="day">
      <div className="dayhead">
        {WD_S[day.getDay()]}, {pad(day.getDate())}.{pad(day.getMonth() + 1)}.
        {offset === 0 && <small>heute</small>}
        {offset === 1 && <small>morgen</small>}
      </div>
      <div className="slots">
        {occ.map((b) => (
          <div key={b.id} className={clash.has(b.id) ? 'slot clash' : 'slot'}>
            <span className="time">{clock(b)}</span>
            <span className="t">{b.title}</span>
            {clash.has(b.id) && <span className="tag bad">Überschneidung</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function YearView({
  items,
  year,
  today,
  openMonths,
  onToggle,
}: {
  items: readonly Item[];
  year: number;
  today: Date;
  openMonths: ReadonlySet<string>;
  onToggle: (key: string, open: boolean) => void;
}) {
  const months = useMemo(
    () =>
      MONTHS.map((name, m) => {
        const days = new Date(year, m + 1, 0).getDate();
        const blocks: { day: Date; occ: Item[] }[] = [];
        let n = 0;
        for (let dd = 1; dd <= days; dd++) {
          const day = new Date(year, m, dd, 12);
          const occ = occurrencesOn(items, day);
          if (!occ.length) continue;
          n += occ.length;
          blocks.push({ day, occ });
        }
        return { key: `${String(year)}-${String(m + 1)}`, name, blocks, n };
      }),
    [items, year],
  );
  return (
    <>
      {months.map(({ key, name, blocks, n }) => (
        <details
          key={key}
          className="month"
          open={openMonths.has(key)}
          onToggle={(e) => onToggle(key, e.currentTarget.open)}
        >
          <summary>
            <span className="mn">
              {name} {year}
            </span>
            <span className="cnt">
              {n ? `${String(n)} Termine an ${String(blocks.length)} Tagen` : 'keine Termine'}
            </span>
          </summary>
          {blocks.length ? (
            blocks.map(({ day, occ }) => (
              <DayBlock
                key={day.getDate()}
                day={day}
                occ={occ}
                offset={Math.round((day.getTime() - today.getTime()) / DAY_MS)}
              />
            ))
          ) : (
            <div className="empty">Der Raum ist frei.</div>
          )}
        </details>
      ))}
    </>
  );
}

/** "Belegung": next four weeks or a whole year as month accordions. */
export function Overview({ items, today }: { items: readonly Item[]; today: string }) {
  const todayDate = pd(today);
  const year = todayDate.getFullYear();
  const [view, setView] = useState<View>('4w');
  // Open months survive switching views; by default this month and next January.
  const [openMonths, setOpenMonths] = useState<ReadonlySet<string>>(
    () => new Set([`${String(year)}-${String(todayDate.getMonth() + 1)}`, `${String(year + 1)}-1`]),
  );
  const toggle = (key: string, open: boolean) =>
    setOpenMonths((prev) => {
      if (prev.has(key) === open) return prev;
      const next = new Set(prev);
      if (open) next.add(key);
      else next.delete(key);
      return next;
    });

  const options: { v: View; label: string }[] = [
    { v: '4w', label: '4 Wochen' },
    { v: year, label: String(year) },
    { v: year + 1, label: String(year + 1) },
  ];

  let body;
  if (view !== '4w') {
    body = (
      <YearView
        items={items}
        year={view}
        today={todayDate}
        openMonths={openMonths}
        onToggle={toggle}
      />
    );
  } else {
    const days = [];
    for (let i = 0; i < 28; i++) {
      const day = addDays(todayDate, i);
      const occ = occurrencesOn(items, day);
      if (occ.length) days.push(<DayBlock key={i} day={day} occ={occ} offset={i} />);
    }
    body = days.length ? (
      days
    ) : (
      <div className="empty">
        {items.length
          ? 'In den nächsten vier Wochen ist der Raum frei.'
          : 'Noch keine Buchungen. Der Raum ist frei.'}
      </div>
    );
  }

  return (
    <section aria-labelledby="h-next">
      <div className="viewhead">
        <h2 id="h-next">Belegung</h2>
        <div className="seg" role="group" aria-label="Zeitraum">
          {options.map((o) => (
            <button
              key={String(o.v)}
              type="button"
              aria-pressed={view === o.v}
              onClick={() => setView(o.v)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <div>{body}</div>
    </section>
  );
}
