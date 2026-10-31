from collections.abc import Iterator

import httpx
import pytest

from app.config import get_settings
from app.main import create_app


@pytest.fixture
def fresh_settings(monkeypatch: pytest.MonkeyPatch) -> Iterator[pytest.MonkeyPatch]:
    get_settings.cache_clear()
    yield monkeypatch
    monkeypatch.undo()
    get_settings.cache_clear()


async def test_docs_can_be_disabled(fresh_settings: pytest.MonkeyPatch) -> None:
    fresh_settings.setenv("ENABLE_DOCS", "false")
    app = create_app()
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
        assert (await c.get("/api/v1/docs")).status_code == 404
        assert (await c.get("/api/v1/openapi.json")).status_code == 404


def test_production_refuses_insecure_secret(fresh_settings: pytest.MonkeyPatch) -> None:
    fresh_settings.setenv("COOKIE_SECURE", "true")
    fresh_settings.setenv("SECRET_KEY", "change-me-in-production")
    with pytest.raises(RuntimeError, match="SECRET_KEY"):
        create_app()
