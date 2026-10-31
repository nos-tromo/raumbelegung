"""1:1 port of the recurrence logic in Raumbelegung.html (occursOn, overlaps,
candidateDates, findConflicts, describe).

Dates and times are local calendar values without a timezone, as in the original.
Any change here must also be made in frontend/src/lib/recurrence.ts and the
fixtures in shared/recurrence-cases.json must be regenerated from the original.
"""

from __future__ import annotations

import calendar
import datetime as dt
from collections.abc import Hashable, Iterable, Mapping
from dataclasses import dataclass
from typing import Any

DEFAULT_HORIZON = 730

# Index 0 = Sunday, like JavaScript's Date.getDay().
WD = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"]
WD_S = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"]


@dataclass(frozen=True, slots=True)
class Slot:
    """The parts of a booking the recurrence logic needs."""

    date: dt.date
    start: dt.time
    end: dt.time
    rec: str
    until: dt.date | None = None
    id: Hashable | None = None

    @classmethod
    def from_dict(cls, d: Mapping[str, Any]) -> Slot:
        until = d.get("until") or None  # JS treats "" like null
        return cls(
            date=dt.date.fromisoformat(d["date"]),
            start=dt.time.fromisoformat(d.get("start", "00:00")),
            end=dt.time.fromisoformat(d.get("end", "00:00")),
            rec=d.get("rec", "none"),
            until=dt.date.fromisoformat(until) if until else None,
            id=d.get("id"),
        )


def js_day(d: dt.date) -> int:
    """Weekday like JS getDay(): 0 = Sunday ... 6 = Saturday."""
    return (d.weekday() + 1) % 7


def nth(d: dt.date) -> int:
    """Which occurrence of its weekday in the month (1..5) - ceil(day / 7)."""
    return -(-d.day // 7)


def mins(t: dt.time) -> int:
    return t.hour * 60 + t.minute


def occurs_on(b: Slot, d: dt.date) -> bool:
    if d < b.date:
        return False
    if b.until and d > b.until:
        return False
    if b.rec == "none":
        return d == b.date
    if b.rec == "daily":
        return True
    if b.rec == "weekdays":
        return 1 <= js_day(d) <= 5
    if js_day(d) != js_day(b.date):
        return False
    if b.rec == "weekly":
        return True
    if b.rec == "monthlyLast":
        return d.day + 7 > calendar.monthrange(d.year, d.month)[1]
    return nth(d) == nth(b.date)


def overlaps(a: Slot, b: Slot) -> bool:
    return mins(a.start) < mins(b.end) and mins(b.start) < mins(a.end)


def candidate_dates(b: Slot, horizon: int = DEFAULT_HORIZON) -> list[dt.date]:
    if b.rec == "none":
        return [b.date]
    out: list[dt.date] = []
    for i in range(horizon + 1):
        d = b.date + dt.timedelta(days=i)
        if b.until and d > b.until:
            break
        if occurs_on(b, d):
            out.append(d)
    return out


@dataclass(slots=True)
class Conflict:
    other: Slot
    dates: list[dt.date]


def find_conflicts(
    b: Slot, others: Iterable[Slot], horizon: int = DEFAULT_HORIZON
) -> list[Conflict]:
    """Conflicts grouped per other booking, in first-seen order, dates ascending."""
    # overlaps() does not depend on the date, so filtering up front gives the
    # same result (and order) as the original nested loop, just faster.
    relevant = [o for o in others if not (o.id and o.id == b.id) and overlaps(b, o)]
    found: dict[Any, Conflict] = {}
    if not relevant:
        return []
    for d in candidate_dates(b, horizon):
        for o in relevant:
            if occurs_on(o, d):
                if o.id not in found:
                    found[o.id] = Conflict(other=o, dates=[])
                found[o.id].dates.append(d)
    return list(found.values())


def _dmy(d: dt.date) -> str:
    return f"{d.day:02d}.{d.month:02d}.{d.year}"


def describe(b: Slot) -> str:
    d = b.date
    until = " bis " + _dmy(b.until) if b.until else ""
    if b.rec == "daily":
        return "täglich" + until
    if b.rec == "weekdays":
        return "Montag bis Freitag" + until
    if b.rec == "monthlyLast":
        return "jeden letzten " + WD[js_day(d)] + " im Monat" + until
    if b.rec == "weekly":
        return "jeden " + WD[js_day(d)] + until
    if b.rec == "monthly":
        return "jeden " + str(nth(d)) + ". " + WD[js_day(d)] + " im Monat" + until
    return WD_S[js_day(d)] + ", " + _dmy(d)
