"""Per-IP rate limits for the auth endpoints, using slowapi's limiter/storage.

fastapi-users generates the auth routes, so instead of slowapi's per-endpoint
decorator a small ASGI middleware matches (method, path). The client IP comes
from the ASGI scope; behind Caddy uvicorn runs with --proxy-headers, so that is
the real client address from X-Forwarded-For.
"""

import json

from fastapi import HTTPException, status
from limits import RateLimitItem, parse
from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.types import ASGIApp, Receive, Scope, Send

from app.config import get_settings

API = "/api/v1"

limiter = Limiter(key_func=get_remote_address, enabled=get_settings().RATE_LIMIT_ENABLED)

LIMITS: dict[tuple[str, str], RateLimitItem] = {
    ("POST", f"{API}/auth/login"): parse("10/minute"),
    ("POST", f"{API}/auth/register"): parse("5/hour"),
    ("POST", f"{API}/auth/request-verify-token"): parse("5/hour"),
    ("POST", f"{API}/auth/forgot-password"): parse("5/hour"),
    # Endpoints that check the current password (guessing protection for stolen sessions).
    ("POST", f"{API}/users/me/password"): parse("10/hour"),
    ("DELETE", f"{API}/users/me"): parse("10/hour"),
}

# Per-user limit for invitation mails: protects the sender reputation against
# a registered user mass-mailing arbitrary addresses.
INVITE_LIMIT = parse("20/hour")

_BODY = json.dumps({"detail": "RATE_LIMIT_EXCEEDED"}).encode()


class RateLimitMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and limiter.enabled:
            path = scope["path"].rstrip("/")
            item = LIMITS.get((scope["method"], path))
            if item is not None:
                client = scope.get("client")
                ip = client[0] if client else "unknown"
                if not limiter.limiter.hit(item, path, ip):
                    await send(
                        {
                            "type": "http.response.start",
                            "status": 429,
                            "headers": [
                                (b"content-type", b"application/json"),
                                (b"content-length", str(len(_BODY)).encode()),
                                (b"retry-after", str(item.get_expiry()).encode()),
                            ],
                        }
                    )
                    await send({"type": "http.response.body", "body": _BODY})
                    return
        await self.app(scope, receive, send)


def enforce_user_limit(name: str, user_key: str, item: RateLimitItem) -> None:
    """Raise 429 if ``user_key`` exceeded ``item`` for the action ``name``."""
    if limiter.enabled and not limiter.limiter.hit(item, name, user_key):
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            detail="RATE_LIMIT_EXCEEDED",
            headers={"Retry-After": str(item.get_expiry())},
        )
