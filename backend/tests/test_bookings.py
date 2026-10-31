import httpx
import pytest

from tests.conftest import ClientFactory, booking, create_calendar


@pytest.fixture
async def ctx(make_user: ClientFactory) -> tuple[httpx.AsyncClient, str]:
    c = await make_user("erika@example.org", "Erika")
    cal = await create_calendar(c)
    return c, f"/api/v1/calendars/{cal['id']}/bookings"


WEEKLY_TUE = booking(
    title="Spielenachmittag", date="2026-11-03", start="14:00", end="17:00", rec="weekly"
)


async def test_create_and_list(ctx: tuple[httpx.AsyncClient, str]) -> None:
    c, url = ctx
    r = await c.post(url, json={**WEEKLY_TUE, "until": "2027-03-30"})
    assert r.status_code == 201, r.text
    b = r.json()
    assert set(b) == {
        "id",
        "title",
        "date",
        "start",
        "end",
        "rec",
        "until",
        "created_by",
        "created_by_name",
        "created_at",
    }
    assert (b["date"], b["start"], b["end"], b["rec"], b["until"]) == (
        "2026-11-03",
        "14:00",
        "17:00",
        "weekly",
        "2027-03-30",
    )
    assert b["created_by_name"] == "Erika"
    me = (await c.get("/api/v1/users/me")).json()
    assert b["created_by"] == me["id"]

    # until is ignored for one-off bookings; title is trimmed
    r = await c.post(url, json=booking(title="  Einmal  ", date="2026-11-05", until="2020-01-01"))
    assert r.status_code == 201 and r.json()["until"] is None and r.json()["title"] == "Einmal"

    r = await c.post(url, json=booking(title="Last", date="2026-11-27", rec="monthlyLast"))
    assert r.status_code == 201 and r.json()["rec"] == "monthlyLast"

    listed = (await c.get(url)).json()
    assert [x["title"] for x in listed] == ["Spielenachmittag", "Einmal", "Last"]


@pytest.mark.parametrize(
    "override",
    [
        {"title": "   "},
        {"title": "x" * 81},
        {"start": "12:00", "end": "12:00"},
        {"start": "13:00", "end": "12:00"},
        {"rec": "weekly", "until": "2026-11-02"},
        {"rec": "yearly"},
        {"start": "9:00"},
        {"start": "10:00:00"},
        {"date": "03.11.2026"},
    ],
)
async def test_validation(ctx: tuple[httpx.AsyncClient, str], override: dict) -> None:
    c, url = ctx
    assert (await c.post(url, json=booking(**override))).status_code == 422
    assert (await c.post(f"{url}/check", json=booking(**override))).status_code == 422


async def test_conflict_check_and_409(ctx: tuple[httpx.AsyncClient, str]) -> None:
    c, url = ctx
    tue = (await c.post(url, json=WEEKLY_TUE)).json()

    # adjacent is fine
    r = await c.post(f"{url}/check", json=booking(date="2026-12-15", start="17:00", end="18:00"))
    assert r.status_code == 200 and r.json() == {"conflicts": []}

    single = booking(title="Geburtstag", date="2026-12-15", start="16:00", end="18:00")
    r = await c.post(f"{url}/check", json=single)
    assert r.status_code == 200
    conflicts = r.json()["conflicts"]
    assert len(conflicts) == 1
    assert conflicts[0]["booking"] == tue
    assert conflicts[0]["dates"] == ["2026-12-15"]

    r = await c.post(url, json=single)
    assert r.status_code == 409
    detail = r.json()["detail"]
    assert detail["code"] == "BOOKING_CONFLICT"
    assert detail["conflicts"] == conflicts
    assert len((await c.get(url)).json()) == 1

    r = await c.post(url, json={**single, "force": True})
    assert r.status_code == 201
    assert len((await c.get(url)).json()) == 2


async def test_series_conflicts_grouped(ctx: tuple[httpx.AsyncClient, str]) -> None:
    c, url = ctx
    tue = (await c.post(url, json=WEEKLY_TUE)).json()
    wed = (
        await c.post(
            url,
            json=booking(
                title="Beratung", date="2026-11-04", start="10:00", end="12:00", rec="monthly"
            ),
        )
    ).json()
    cand = booking(
        date="2026-11-09", start="11:00", end="15:00", rec="weekdays", until="2026-12-31"
    )
    conflicts = (await c.post(f"{url}/check", json=cand)).json()["conflicts"]
    assert [x["booking"]["id"] for x in conflicts] == [tue["id"], wed["id"]]
    assert conflicts[0]["dates"] == [
        "2026-11-10",
        "2026-11-17",
        "2026-11-24",
        "2026-12-01",
        "2026-12-08",
        "2026-12-15",
        "2026-12-22",
        "2026-12-29",
    ]
    assert conflicts[1]["dates"] == ["2026-12-02"]


async def test_created_by_name_null_after_account_deletion(make_user: ClientFactory) -> None:
    owner = await make_user("o@example.org", "Olga")
    cal = await create_calendar(owner)
    url = f"/api/v1/calendars/{cal['id']}/bookings"
    from tests.conftest import add_member

    editor = await make_user("e@example.org", "Emil")
    await add_member(owner, cal["id"], editor, "e@example.org", "editor")
    assert (await editor.post(url, json=booking())).status_code == 201
    r = await editor.request(
        "DELETE", "/api/v1/users/me", json={"password": "correct horse battery"}
    )
    assert r.status_code == 204
    (b,) = (await owner.get(url)).json()
    assert b["created_by"] is None and b["created_by_name"] is None
