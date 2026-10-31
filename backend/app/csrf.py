"""Minimal CSRF protection: state-changing API requests must carry
``X-Requested-With: XMLHttpRequest``. Browsers never send that header cross-site
without a CORS preflight, and the API does not allow CORS."""

import json

from starlette.types import ASGIApp, Receive, Scope, Send

UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
_BODY = json.dumps({"detail": "CSRF_HEADER_MISSING"}).encode()


class CSRFHeaderMiddleware:
    def __init__(self, app: ASGIApp, prefix: str = "/api") -> None:
        self.app = app
        self.prefix = prefix

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if (
            scope["type"] == "http"
            and scope["method"] in UNSAFE_METHODS
            and scope["path"].startswith(self.prefix)
        ):
            headers = dict(scope["headers"])
            if headers.get(b"x-requested-with", b"").lower() != b"xmlhttprequest":
                await send(
                    {
                        "type": "http.response.start",
                        "status": 403,
                        "headers": [
                            (b"content-type", b"application/json"),
                            (b"content-length", str(len(_BODY)).encode()),
                        ],
                    }
                )
                await send({"type": "http.response.body", "body": _BODY})
                return
        await self.app(scope, receive, send)
