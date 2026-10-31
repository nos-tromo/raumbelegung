import hashlib
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update

from app.auth import mailer
from app.db import SessionLocal
from app.models import Invitation
from tests.conftest import ClientFactory, create_calendar, last_mail, token_from

API = "/api/v1"


async def test_invitation_flow(make_user: ClientFactory) -> None:
    owner = await make_user("owner@example.org", "Olga")
    cal = await create_calendar(owner, "Jugendraum")
    base = f"{API}/calendars/{cal['id']}/invitations"

    r = await owner.post(base, json={"email": "Gast@Example.org", "role": "editor"})
    assert r.status_code == 201, r.text
    inv = r.json()
    assert set(inv) == {"id", "email", "role", "expires_at", "created_at"}
    assert inv["email"] == "gast@example.org" and inv["role"] == "editor"
    expires = datetime.fromisoformat(inv["expires_at"])
    assert timedelta(days=6, hours=23) < expires - datetime.now(UTC) <= timedelta(days=7)

    mail = last_mail("gast@example.org", "invite")
    assert "http://frontend.test/invite/" in mail.text
    assert "Jugendraum" in mail.subject and "Olga" in mail.text
    token = token_from(mail)

    # only the hash is stored
    async with SessionLocal() as s:
        stored = (await s.scalars(select(Invitation))).one()
    assert stored.token_hash == hashlib.sha256(token.encode()).hexdigest()
    assert token not in stored.token_hash

    assert [i["id"] for i in (await owner.get(base)).json()] == [inv["id"]]

    # someone else (verified) cannot accept, but may look at it
    intruder = await make_user("intruder@example.org")
    r = await intruder.get(f"{API}/invitations/{token}")
    assert r.status_code == 200
    assert r.json() == {
        "calendar_name": "Jugendraum",
        "role": "editor",
        "email": "gast@example.org",
        "invited_by_name": "Olga",
    }
    r = await intruder.post(f"{API}/invitations/{token}/accept")
    assert r.status_code == 403 and r.json() == {"detail": "INVITATION_EMAIL_MISMATCH"}

    # invitee registers but is not verified yet
    guest = await make_user("gast@example.org", "Gast", verified=False)
    assert (await guest.get(f"{API}/invitations/{token}")).status_code == 200
    r = await guest.post(f"{API}/invitations/{token}/accept")
    assert r.status_code == 403 and r.json() == {"detail": "EMAIL_NOT_VERIFIED"}
    r = await guest.post(
        f"{API}/auth/verify", json={"token": token_from(last_mail("gast@example.org", "verify"))}
    )
    assert r.status_code == 200

    r = await guest.post(f"{API}/invitations/{token}/accept")
    assert r.status_code == 200 and r.json() == {"calendar_id": cal["id"]}
    cals = (await guest.get(f"{API}/calendars")).json()
    assert [(c["id"], c["role"]) for c in cals] == [(cal["id"], "editor")]

    # used up
    assert (await guest.post(f"{API}/invitations/{token}/accept")).status_code == 404
    assert (await guest.get(f"{API}/invitations/{token}")).status_code == 404
    assert (await owner.get(base)).json() == []

    r = await owner.post(base, json={"email": "gast@example.org", "role": "viewer"})
    assert r.status_code == 409 and r.json() == {"detail": "ALREADY_MEMBER"}


async def test_invitation_validation_and_revocation(make_user: ClientFactory) -> None:
    owner = await make_user("owner@example.org")
    cal = await create_calendar(owner)
    base = f"{API}/calendars/{cal['id']}/invitations"

    assert (
        await owner.post(base, json={"email": "x@example.org", "role": "owner"})
    ).status_code == 422
    assert (
        await owner.post(base, json={"email": "kein-mail", "role": "viewer"})
    ).status_code == 422
    r = await owner.post(base, json={"email": "owner@example.org", "role": "viewer"})
    assert r.status_code == 409

    first = (await owner.post(base, json={"email": "x@example.org", "role": "viewer"})).json()
    old_token = token_from(last_mail("x@example.org", "invite"))
    second = (await owner.post(base, json={"email": "x@example.org", "role": "editor"})).json()
    new_token = token_from(last_mail("x@example.org", "invite"))
    # re-inviting replaces the open invitation
    assert [i["id"] for i in (await owner.get(base)).json()] == [second["id"]]
    assert (await owner.get(f"{API}/invitations/{old_token}")).status_code == 404
    assert first["id"] != second["id"]

    assert (await owner.delete(f"{base}/{second['id']}")).status_code == 204
    assert (await owner.delete(f"{base}/{second['id']}")).status_code == 404
    assert (await owner.get(f"{API}/invitations/{new_token}")).status_code == 404


async def test_expired_invitation(make_user: ClientFactory) -> None:
    owner = await make_user("owner@example.org")
    cal = await create_calendar(owner)
    await owner.post(
        f"{API}/calendars/{cal['id']}/invitations",
        json={"email": "late@example.org", "role": "viewer"},
    )
    token = token_from(last_mail("late@example.org", "invite"))
    async with SessionLocal() as s:
        await s.execute(
            update(Invitation).values(expires_at=datetime.now(UTC) - timedelta(minutes=1))
        )
        await s.commit()
    late = await make_user("late@example.org")
    assert (await late.get(f"{API}/invitations/{token}")).status_code == 404
    assert (await late.post(f"{API}/invitations/{token}/accept")).status_code == 404
    assert (await owner.get(f"{API}/calendars/{cal['id']}/invitations")).json() == []


async def test_invitation_requires_login(client) -> None:  # type: ignore[no-untyped-def]
    assert (await client.get(f"{API}/invitations/whatever")).status_code == 401


async def test_invitation_rate_limit_per_user(make_user: ClientFactory) -> None:
    from app.ratelimit import limiter

    owner = await make_user("spammer@example.org")
    cal = await create_calendar(owner)
    base = f"{API}/calendars/{cal['id']}/invitations"
    limiter.enabled = True
    limiter.reset()
    try:
        for i in range(20):
            r = await owner.post(base, json={"email": f"x{i}@example.org", "role": "viewer"})
            assert r.status_code == 201, r.text
        r = await owner.post(base, json={"email": "x99@example.org", "role": "viewer"})
        assert r.status_code == 429 and r.json() == {"detail": "RATE_LIMIT_EXCEEDED"}
        assert int(r.headers["retry-after"]) > 0
        assert not any(m.to == "x99@example.org" for m in mailer.outbox)
    finally:
        limiter.reset()
        limiter.enabled = False
