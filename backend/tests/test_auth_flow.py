import httpx

from app.auth import mailer
from app.ratelimit import limiter
from tests.conftest import (
    PASSWORD,
    ClientFactory,
    last_mail,
    login,
    new_client,
    register,
    token_from,
)

NEW_PASSWORD = "a brand new passphrase"


async def test_full_auth_flow(client: httpx.AsyncClient) -> None:
    r = await register(client, "Anna@Example.org", "Anna")
    assert r.status_code == 201, r.text
    user = r.json()
    assert set(user) == {"id", "email", "display_name", "is_verified"}
    assert user["email"] == "anna@example.org"  # stored lowercased
    assert user["is_verified"] is False

    mail = last_mail("anna@example.org", "verify")
    assert "http://frontend.test/verify?token=" in mail.text
    assert "bestätige" in mail.subject
    assert "http://frontend.test/verify?token=" in mail.html

    r = await client.post("/api/v1/auth/verify", json={"token": token_from(mail)})
    assert r.status_code == 200 and r.json()["is_verified"] is True
    r = await client.post("/api/v1/auth/verify", json={"token": token_from(mail)})
    assert r.status_code == 400 and r.json()["detail"] == "VERIFY_USER_ALREADY_VERIFIED"
    r = await client.post("/api/v1/auth/verify", json={"token": "garbage"})
    assert r.json()["detail"] == "VERIFY_USER_BAD_TOKEN"

    r = await login(client, "ANNA@example.org")  # login is case-insensitive
    assert r.status_code == 204
    cookie = r.headers["set-cookie"]
    assert cookie.startswith("rb_session=")
    assert "HttpOnly" in cookie and "SameSite=lax" in cookie and "Max-Age=1209600" in cookie
    assert "Secure" not in cookie  # COOKIE_SECURE=false in tests

    r = await client.get("/api/v1/users/me")
    assert r.status_code == 200 and r.json()["display_name"] == "Anna"

    r = await client.post("/api/v1/auth/logout")
    assert r.status_code == 204
    assert (await client.get("/api/v1/users/me")).status_code == 401

    # Keep a second session alive to check it is revoked by the reset.
    other = new_client()
    assert (await login(other, "anna@example.org")).status_code == 204

    r = await client.post("/api/v1/auth/forgot-password", json={"email": "anna@example.org"})
    assert r.status_code == 202
    mail = last_mail("anna@example.org", "reset")
    assert "http://frontend.test/reset-password?token=" in mail.text
    token = token_from(mail)

    r = await client.post("/api/v1/auth/reset-password", json={"token": token, "password": "short"})
    assert r.status_code == 400 and r.json()["detail"]["code"] == "RESET_PASSWORD_INVALID_PASSWORD"
    r = await client.post(
        "/api/v1/auth/reset-password", json={"token": token, "password": NEW_PASSWORD}
    )
    assert r.status_code == 200
    # token is single-use (bound to the old password hash)
    r = await client.post(
        "/api/v1/auth/reset-password", json={"token": token, "password": NEW_PASSWORD}
    )
    assert r.status_code == 400 and r.json()["detail"] == "RESET_PASSWORD_BAD_TOKEN"

    assert (await other.get("/api/v1/users/me")).status_code == 401  # sessions revoked
    await other.aclose()

    r = await login(client, "anna@example.org", PASSWORD)
    assert r.status_code == 400 and r.json()["detail"] == "LOGIN_BAD_CREDENTIALS"
    assert (await login(client, "anna@example.org", NEW_PASSWORD)).status_code == 204
    assert (await client.get("/api/v1/users/me")).status_code == 200


async def test_unverified_user_is_blocked_from_calendars(make_user: ClientFactory) -> None:
    c = await make_user("ben@example.org", verified=False)
    me = await c.get("/api/v1/users/me")
    assert me.status_code == 200 and me.json()["is_verified"] is False
    for method, path in [
        ("GET", "/api/v1/calendars"),
        ("POST", "/api/v1/calendars"),
        ("GET", "/api/v1/calendars/00000000-0000-0000-0000-000000000000/bookings"),
    ]:
        r = await c.request(method, path, json={"name": "X"} if method == "POST" else None)
        assert r.status_code == 403, (path, r.text)
        assert r.json() == {"detail": "EMAIL_NOT_VERIFIED"}

    r = await c.post("/api/v1/auth/request-verify-token", json={"email": "ben@example.org"})
    assert r.status_code == 202
    assert len([m for m in mailer.outbox if m.template == "verify"]) == 2


async def test_unauthenticated_gets_401(client: httpx.AsyncClient) -> None:
    assert (await client.get("/api/v1/users/me")).status_code == 401
    assert (await client.get("/api/v1/calendars")).status_code == 401


async def test_csrf_header_required(client: httpx.AsyncClient) -> None:
    async with httpx.AsyncClient(transport=client._transport, base_url="http://testserver") as bare:
        r = await bare.post("/api/v1/auth/register", json={"email": "x@example.org"})
        assert r.status_code == 403 and r.json() == {"detail": "CSRF_HEADER_MISSING"}
        r = await bare.post(
            "/api/v1/auth/login",
            data={"username": "x", "password": "y"},
            headers={"X-Requested-With": "fetch"},
        )
        assert r.status_code == 403
        # safe methods do not need the header
        assert (await bare.get("/api/v1/health")).status_code == 200


async def test_password_rules_and_duplicates(client: httpx.AsyncClient) -> None:
    r = await register(client, "carla@example.org", password="kurz")
    assert r.status_code == 400
    assert r.json()["detail"]["code"] == "REGISTER_INVALID_PASSWORD"
    assert "10 Zeichen" in r.json()["detail"]["reason"]

    r = await register(client, "carla@example.org", password="xxCARLA@example.orgxx")
    assert r.status_code == 400 and "E-Mail" in r.json()["detail"]["reason"]

    assert (await register(client, "carla@example.org")).status_code == 201
    r = await register(client, "CARLA@example.org")
    assert r.status_code == 400 and r.json()["detail"] == "REGISTER_USER_ALREADY_EXISTS"

    r = await client.post(
        "/api/v1/auth/register",
        json={"email": "d@example.org", "password": PASSWORD, "display_name": "  "},
    )
    assert r.status_code == 422

    # unknown e-mail: still 202, no mail
    before = len(mailer.outbox)
    assert (
        await client.post("/api/v1/auth/forgot-password", json={"email": "nobody@example.org"})
    ).status_code == 202
    assert (
        await client.post("/api/v1/auth/request-verify-token", json={"email": "nobody@example.org"})
    ).status_code == 202
    assert len(mailer.outbox) == before


async def test_update_profile_and_change_password(make_user: ClientFactory) -> None:
    c = await make_user("dora@example.org", "Dora")
    r = await c.patch("/api/v1/users/me", json={"display_name": "  Dora D.  "})
    assert r.status_code == 200 and r.json()["display_name"] == "Dora D."

    other = new_client()
    assert (await login(other, "dora@example.org")).status_code == 204

    r = await c.post(
        "/api/v1/users/me/password",
        json={"current_password": "wrong password!", "new_password": NEW_PASSWORD},
    )
    assert r.status_code == 400 and r.json()["detail"] == "BAD_CURRENT_PASSWORD"
    r = await c.post(
        "/api/v1/users/me/password", json={"current_password": PASSWORD, "new_password": "short"}
    )
    assert r.status_code == 400 and r.json()["detail"]["code"] == "INVALID_PASSWORD"

    r = await c.post(
        "/api/v1/users/me/password",
        json={"current_password": PASSWORD, "new_password": NEW_PASSWORD},
    )
    assert r.status_code == 204
    assert (await c.get("/api/v1/users/me")).status_code == 200  # current session kept
    assert (await other.get("/api/v1/users/me")).status_code == 401  # other sessions revoked
    assert (await login(other, "dora@example.org", NEW_PASSWORD)).status_code == 204
    await other.aclose()


async def test_rate_limit_forgot_password(client: httpx.AsyncClient) -> None:
    limiter.enabled = True
    limiter.reset()
    try:
        for _ in range(5):
            r = await client.post("/api/v1/auth/forgot-password", json={"email": "x@example.org"})
            assert r.status_code == 202
        r = await client.post("/api/v1/auth/forgot-password", json={"email": "x@example.org"})
        assert r.status_code == 429 and r.json() == {"detail": "RATE_LIMIT_EXCEEDED"}
        # other endpoints have their own budget
        assert (await login(client, "x@example.org")).status_code == 400
    finally:
        limiter.reset()
        limiter.enabled = False


async def test_health(client: httpx.AsyncClient) -> None:
    r = await client.get("/api/v1/health")
    assert r.status_code == 200 and r.json() == {"status": "ok"}


async def test_rate_limit_password_change(make_user: ClientFactory) -> None:
    c = await make_user("guess@example.org")
    limiter.enabled = True
    limiter.reset()
    try:
        body = {"current_password": "falsch-falsch", "new_password": "neues passwort 123"}
        for _ in range(10):
            r = await c.post("/api/v1/users/me/password", json=body)
            assert r.status_code == 400 and r.json() == {"detail": "BAD_CURRENT_PASSWORD"}
        r = await c.post("/api/v1/users/me/password", json=body)
        assert r.status_code == 429
    finally:
        limiter.reset()
        limiter.enabled = False
