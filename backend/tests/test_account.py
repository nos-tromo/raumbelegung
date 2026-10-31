from tests.conftest import (
    PASSWORD,
    ClientFactory,
    add_member,
    booking,
    create_calendar,
    login,
    new_client,
)

API = "/api/v1"


async def test_delete_account_last_owner(make_user: ClientFactory) -> None:
    owner = await make_user("owner@example.org", "Olga")
    cal_a = await create_calendar(owner, "A-Raum")
    cal_b = await create_calendar(owner, "B-Raum")
    co = await make_user("co@example.org", "Cora")
    await add_member(owner, cal_b["id"], co, "co@example.org", "editor")

    r = await owner.request("DELETE", f"{API}/users/me", json={"password": "wrong password"})
    assert r.status_code == 400 and r.json()["detail"] == "BAD_CURRENT_PASSWORD"

    r = await owner.request("DELETE", f"{API}/users/me", json={"password": PASSWORD})
    assert r.status_code == 409
    detail = r.json()["detail"]
    assert detail["code"] == "LAST_OWNER"
    assert {c["id"] for c in detail["calendars"]} == {cal_a["id"], cal_b["id"]}

    # resolve: delete A, hand B over to Cora
    assert (await owner.delete(f"{API}/calendars/{cal_a['id']}")).status_code == 204
    co_id = (await co.get(f"{API}/users/me")).json()["id"]
    r = await owner.patch(f"{API}/calendars/{cal_b['id']}/members/{co_id}", json={"role": "owner"})
    assert r.status_code == 200
    assert (
        await owner.post(f"{API}/calendars/{cal_b['id']}/bookings", json=booking())
    ).status_code == 201

    r = await owner.request("DELETE", f"{API}/users/me", json={"password": PASSWORD})
    assert r.status_code == 204
    assert (await owner.get(f"{API}/users/me")).status_code == 401
    async with new_client() as c:
        assert (await login(c, "owner@example.org")).status_code == 400

    members = (await co.get(f"{API}/calendars/{cal_b['id']}/members")).json()
    assert [m["email"] for m in members] == ["co@example.org"]
    (b,) = (await co.get(f"{API}/calendars/{cal_b['id']}/bookings")).json()
    assert b["created_by"] is None and b["created_by_name"] is None


async def test_export(make_user: ClientFactory) -> None:
    c = await make_user("exp@example.org", "Export")
    cal = await create_calendar(c, "Raum 1")
    await c.post(f"{API}/calendars/{cal['id']}/bookings", json=booking())
    r = await c.get(f"{API}/users/me/export")
    assert r.status_code == 200
    assert r.headers["content-disposition"].startswith("attachment;")
    data = r.json()
    assert data["user"]["email"] == "exp@example.org"
    assert data["memberships"] == [
        {
            "calendar_id": cal["id"],
            "calendar_name": "Raum 1",
            "role": "owner",
            "joined_at": data["memberships"][0]["joined_at"],
        }
    ]
    assert len(data["bookings"]) == 1 and data["bookings"][0]["calendar_name"] == "Raum 1"
    assert "hashed_password" not in r.text
