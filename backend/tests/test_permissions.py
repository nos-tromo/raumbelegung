import httpx
import pytest

from tests.conftest import ClientFactory, add_member, booking, create_calendar

API = "/api/v1"


@pytest.fixture
async def team(make_user: ClientFactory) -> dict:
    owner = await make_user("owner@example.org", "Olga")
    editor = await make_user("editor@example.org", "Emil")
    viewer = await make_user("viewer@example.org", "Vera")
    outsider = await make_user("outsider@example.org", "Otto")
    cal = await create_calendar(owner)
    await add_member(owner, cal["id"], editor, "editor@example.org", "editor")
    await add_member(owner, cal["id"], viewer, "viewer@example.org", "viewer")
    me = {}
    for name, c in [
        ("owner", owner),
        ("editor", editor),
        ("viewer", viewer),
        ("outsider", outsider),
    ]:
        me[name] = (await c.get(f"{API}/users/me")).json()["id"]
    return {
        "cal": cal,
        "base": f"{API}/calendars/{cal['id']}",
        "owner": owner,
        "editor": editor,
        "viewer": viewer,
        "outsider": outsider,
        "ids": me,
    }


async def test_calendar_listing_and_roles(team: dict) -> None:
    for who, role in [("owner", "owner"), ("editor", "editor"), ("viewer", "viewer")]:
        cals = (await team[who].get(f"{API}/calendars")).json()
        assert len(cals) == 1
        assert cals[0]["role"] == role and cals[0]["member_count"] == 3
        assert set(cals[0]) == {
            "id",
            "name",
            "description",
            "timezone",
            "role",
            "member_count",
            "created_at",
        }
        assert cals[0]["timezone"] == "Europe/Berlin"
    assert (await team["outsider"].get(f"{API}/calendars")).json() == []


async def test_non_member_gets_404_everywhere(team: dict) -> None:
    o: httpx.AsyncClient = team["outsider"]
    base = team["base"]
    for method, path, body in [
        ("GET", base, None),
        ("PATCH", base, {"name": "x"}),
        ("DELETE", base, None),
        ("GET", f"{base}/members", None),
        ("GET", f"{base}/bookings", None),
        ("POST", f"{base}/bookings", booking()),
        ("POST", f"{base}/bookings/check", booking()),
        ("POST", f"{base}/invitations", {"email": "a@example.org", "role": "viewer"}),
        ("GET", f"{API}/calendars/00000000-0000-0000-0000-000000000000", None),
    ]:
        r = await o.request(method, path, json=body)
        assert r.status_code == 404, (method, path, r.text)


async def test_viewer_is_read_only(team: dict) -> None:
    v: httpx.AsyncClient = team["viewer"]
    base = team["base"]
    assert (await v.get(base)).status_code == 200
    assert (await v.get(f"{base}/bookings")).status_code == 200
    assert (await v.get(f"{base}/members")).status_code == 200
    for method, path, body in [
        ("POST", f"{base}/bookings", booking()),
        ("POST", f"{base}/bookings/check", booking()),
        ("PATCH", base, {"name": "x"}),
        ("DELETE", base, None),
        ("GET", f"{base}/invitations", None),
        ("POST", f"{base}/invitations", {"email": "a@example.org", "role": "viewer"}),
        ("PATCH", f"{base}/members/{team['ids']['editor']}", {"role": "viewer"}),
        ("DELETE", f"{base}/members/{team['ids']['editor']}", None),
    ]:
        r = await v.request(method, path, json=body)
        assert r.status_code == 403, (method, path, r.text)


async def test_editor_deletes_only_own_bookings_owner_deletes_any(team: dict) -> None:
    base = team["base"]
    own = (await team["editor"].post(f"{base}/bookings", json=booking(title="Emil"))).json()
    foreign = (
        await team["owner"].post(f"{base}/bookings", json=booking(title="Olga", date="2026-11-04"))
    ).json()
    assert own["created_by_name"] == "Emil"

    r = await team["editor"].delete(f"{base}/bookings/{foreign['id']}")
    assert r.status_code == 403
    assert (await team["viewer"].delete(f"{base}/bookings/{own['id']}")).status_code == 403
    assert (await team["editor"].delete(f"{base}/bookings/{own['id']}")).status_code == 204
    assert (await team["editor"].delete(f"{base}/bookings/{own['id']}")).status_code == 404

    third = (await team["editor"].post(f"{base}/bookings", json=booking(date="2026-11-05"))).json()
    assert (await team["owner"].delete(f"{base}/bookings/{third['id']}")).status_code == 204
    assert (await team["owner"].delete(f"{base}/bookings/{foreign['id']}")).status_code == 204
    assert (await team["owner"].get(f"{base}/bookings")).json() == []


async def test_editor_cannot_manage_calendar(team: dict) -> None:
    e: httpx.AsyncClient = team["editor"]
    base = team["base"]
    assert (await e.patch(base, json={"name": "x"})).status_code == 403
    assert (await e.delete(base)).status_code == 403
    assert (await e.get(f"{base}/invitations")).status_code == 403
    r = await e.patch(f"{base}/members/{team['ids']['viewer']}", json={"role": "editor"})
    assert r.status_code == 403


async def test_owner_manages_calendar_and_members(team: dict) -> None:
    o: httpx.AsyncClient = team["owner"]
    base = team["base"]
    r = await o.patch(
        base, json={"name": "Saal", "description": "1. OG", "timezone": "Europe/Vienna"}
    )
    assert r.status_code == 200
    assert (r.json()["name"], r.json()["description"], r.json()["timezone"]) == (
        "Saal",
        "1. OG",
        "Europe/Vienna",
    )
    assert (await o.patch(base, json={"timezone": "Mars/Olympus"})).status_code == 422
    assert (await o.patch(base, json={"name": "x" * 81})).status_code == 422

    members = (await o.get(f"{base}/members")).json()
    assert [m["role"] for m in members] == ["owner", "editor", "viewer"]
    assert set(members[0]) == {"user_id", "email", "display_name", "role"}

    r = await o.patch(f"{base}/members/{team['ids']['viewer']}", json={"role": "editor"})
    assert r.status_code == 200 and r.json()["role"] == "editor"
    assert (await team["viewer"].post(f"{base}/bookings", json=booking())).status_code == 201

    r = await o.patch(f"{base}/members/{team['ids']['outsider']}", json={"role": "editor"})
    assert r.status_code == 404

    assert (await o.delete(f"{base}/members/{team['ids']['viewer']}")).status_code == 204
    assert (await team["viewer"].get(base)).status_code == 404

    assert (await o.delete(base)).status_code == 204
    assert (await o.get(base)).status_code == 404
    assert (await team["editor"].get(f"{API}/calendars")).json() == []


async def test_last_owner_cannot_leave_or_be_downgraded(team: dict) -> None:
    o: httpx.AsyncClient = team["owner"]
    base = team["base"]
    owner_id = team["ids"]["owner"]
    r = await o.patch(f"{base}/members/{owner_id}", json={"role": "editor"})
    assert r.status_code == 409 and r.json() == {"detail": "LAST_OWNER"}
    r = await o.delete(f"{base}/members/{owner_id}")
    assert r.status_code == 409 and r.json() == {"detail": "LAST_OWNER"}

    # with a second owner, the first one may step down / leave
    r = await o.patch(f"{base}/members/{team['ids']['editor']}", json={"role": "owner"})
    assert r.status_code == 200
    assert (await o.patch(f"{base}/members/{owner_id}", json={"role": "viewer"})).status_code == 200
    # the remaining owner is now last again
    r = await team["editor"].delete(f"{base}/members/{team['ids']['editor']}")
    assert r.status_code == 409


async def test_members_can_leave(team: dict) -> None:
    base = team["base"]
    r = await team["viewer"].delete(f"{base}/members/{team['ids']['viewer']}")
    assert r.status_code == 204
    assert (await team["viewer"].get(base)).status_code == 404
    r = await team["editor"].delete(f"{base}/members/{team['ids']['editor']}")
    assert r.status_code == 204
