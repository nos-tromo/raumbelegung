import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.config import INSECURE_DEFAULT_SECRET, get_settings
from app.csrf import CSRFHeaderMiddleware
from app.db import engine
from app.ratelimit import RateLimitMiddleware
from app.routers import auth, bookings, calendars, health, invitations, me, members

API_PREFIX = "/api/v1"

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    yield
    await engine.dispose()


def create_app() -> FastAPI:
    settings = get_settings()
    if settings.SECRET_KEY == INSECURE_DEFAULT_SECRET or len(settings.SECRET_KEY) < 32:
        if settings.COOKIE_SECURE:  # COOKIE_SECURE=true means production
            raise RuntimeError("SECRET_KEY must be set to a random value of at least 32 chars")
        logging.getLogger("app").warning("SECRET_KEY is insecure - fine for development only")
    docs = settings.ENABLE_DOCS
    app = FastAPI(
        title="Raumbelegung API",
        version="1.0.0",
        lifespan=lifespan,
        docs_url=f"{API_PREFIX}/docs" if docs else None,
        redoc_url=None,
        openapi_url=f"{API_PREFIX}/openapi.json" if docs else None,
    )
    app.add_middleware(CSRFHeaderMiddleware, prefix="/api")
    app.add_middleware(RateLimitMiddleware)

    for router in (
        auth.router,
        me.router,
        calendars.router,
        members.router,
        invitations.calendar_router,
        invitations.token_router,
        bookings.router,
        health.router,
    ):
        app.include_router(router, prefix=API_PREFIX)
    return app


app = create_app()
