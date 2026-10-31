import os
import re
import tempfile
from collections.abc import AsyncIterator, Awaitable, Callable
from pathlib import Path

# Configure the app before anything imports it. Tests run on a temporary SQLite
# file by default; set TEST_DATABASE_URL to run them against PostgreSQL
# (the database is wiped on every test).
_TMP = Path(tempfile.mkdtemp(prefix="rb-test-"))
os.environ.update(
    DATABASE_URL=os.environ.get("TEST_DATABASE_URL") or f"sqlite+aiosqlite:///{_TMP / 'test.db'}",
    SECRET_KEY="test-secret-key-that-is-long-enough-for-hs256",
    FRONTEND_URL="http://frontend.test",
    MAIL_BACKEND="memory",
    RATE_LIMIT_ENABLED="false",
    COOKIE_SECURE="false",
)

import httpx  # noqa: E402
import pytest_asyncio  # noqa: E402

from app.auth import mailer  # noqa: E402
from app.db import Base, engine  # noqa: E402
from app.main import app  # noqa: E402

PASSWORD = "correct horse battery"
XHR = {"X-Requested-With": "XMLHttpRequest"}

ClientFactory = Callable[..., Awaitable[httpx.AsyncClient]]


@pytest_asyncio.fixture(autouse=True)
async def _db() -> AsyncIterator[None]:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    mailer.outbox.clear()
    yield
    await engine.dispose()


def new_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver", headers=XHR
    )


@pytest_asyncio.fixture
async def client() -> AsyncIterator[httpx.AsyncClient]:
    async with new_client() as c:
        yield c


def last_mail(to: str, template: str | None = None) -> mailer.SentMail:
    for mail in reversed(mailer.outbox):
        if mail.to == to.lower() and (template is None or mail.template == template):
            return mail
    raise AssertionError(f"no mail to {to} ({template}) in outbox: {mailer.outbox}")


def token_from(mail: mailer.SentMail) -> str:
    m = re.search(r"token=([A-Za-z0-9_\-\.]+)", mail.text) or re.search(
        r"/invite/([A-Za-z0-9_\-]+)", mail.text
    )
    assert m, mail.text
    return m.group(1)


async def register(
    c: httpx.AsyncClient, email: str, name: str = "Test", password: str = PASSWORD
) -> httpx.Response:
    return await c.post(
        "/api/v1/auth/register", json={"email": email, "password": password, "display_name": name}
    )


async def login(c: httpx.AsyncClient, email: str, password: str = PASSWORD) -> httpx.Response:
    return await c.post("/api/v1/auth/login", data={"username": email, "password": password})


@pytest_asyncio.fixture
async def make_user() -> AsyncIterator[ClientFactory]:
    """Factory: register (+ verify) a user and return a logged-in client."""
    clients: list[httpx.AsyncClient] = []

    async def factory(
        email: str, name: str | None = None, verified: bool = True
    ) -> httpx.AsyncClient:
        c = new_client()
        clients.append(c)
        r = await register(c, email, name or email.split("@")[0].title())
        assert r.status_code == 201, r.text
        if verified:
            r = await c.post(
                "/api/v1/auth/verify", json={"token": token_from(last_mail(email, "verify"))}
            )
            assert r.status_code == 200, r.text
        r = await login(c, email)
        assert r.status_code == 204, r.text
        return c

    yield factory
    for c in clients:
        await c.aclose()


async def create_calendar(c: httpx.AsyncClient, name: str = "Gemeinderaum") -> dict:
    r = await c.post("/api/v1/calendars", json={"name": name})
    assert r.status_code == 201, r.text
    return r.json()


async def add_member(
    owner: httpx.AsyncClient, cal_id: str, member: httpx.AsyncClient, email: str, role: str
) -> None:
    r = await owner.post(
        f"/api/v1/calendars/{cal_id}/invitations", json={"email": email, "role": role}
    )
    assert r.status_code == 201, r.text
    token = token_from(last_mail(email, "invite"))
    r = await member.post(f"/api/v1/invitations/{token}/accept")
    assert r.status_code == 200, r.text


def booking(**kw: object) -> dict:
    data: dict[str, object] = {
        "title": "Chorprobe",
        "date": "2026-11-03",
        "start": "18:00",
        "end": "20:00",
        "rec": "none",
    }
    data.update(kw)
    return data
