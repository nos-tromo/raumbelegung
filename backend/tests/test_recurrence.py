import json
from datetime import date
from pathlib import Path

import pytest

from app.domain.recurrence import Slot, describe, find_conflicts, occurs_on, overlaps

CASES = json.loads(
    (Path(__file__).resolve().parents[2] / "shared" / "recurrence-cases.json").read_text("utf-8")
)


def _name(case: dict) -> str:
    return case.get("name") or case.get("expected", "")


@pytest.mark.parametrize("case", CASES["occursOn"], ids=_name)
def test_occurs_on(case: dict) -> None:
    b = Slot.from_dict(case["booking"])
    assert occurs_on(b, date.fromisoformat(case["day"])) is case["expected"]


@pytest.mark.parametrize("case", CASES["overlaps"], ids=_name)
def test_overlaps(case: dict) -> None:
    a = Slot.from_dict({"date": "2026-01-01", **case["a"]})
    b = Slot.from_dict({"date": "2026-01-01", **case["b"]})
    assert overlaps(a, b) is case["expected"]


@pytest.mark.parametrize("case", CASES["conflicts"], ids=_name)
def test_conflicts(case: dict) -> None:
    cand = Slot.from_dict(case["candidate"])
    others = [Slot.from_dict(o) for o in case["others"]]
    kwargs = {"horizon": case["horizon"]} if "horizon" in case else {}
    got = [
        {"id": c.other.id, "dates": [d.isoformat() for d in c.dates]}
        for c in find_conflicts(cand, others, **kwargs)
    ]
    assert got == case["expected"]


@pytest.mark.parametrize("case", CASES["describe"], ids=_name)
def test_describe(case: dict) -> None:
    assert describe(Slot.from_dict(case["booking"])) == case["expected"]


def test_fixture_counts() -> None:
    # Guard against the fixture file silently shrinking.
    assert len(CASES["occursOn"]) >= 21
    assert len(CASES["conflicts"]) >= 8
