# SQLAlchemy's Mapped[] attributes don't structurally match fastapi-users'
# UserProtocol/AccessTokenProtocol for mypy, although they behave identically.
# mypy: disable-error-code="type-var"
import uuid
from collections.abc import AsyncIterator
from typing import Any

from fastapi import BackgroundTasks, Depends, HTTPException, Request, status
from fastapi_users import BaseUserManager, FastAPIUsers, InvalidPasswordException, UUIDIDMixin
from fastapi_users.authentication import AuthenticationBackend, CookieTransport
from fastapi_users.authentication.strategy.db import AccessTokenDatabase, DatabaseStrategy
from fastapi_users_db_sqlalchemy import SQLAlchemyUserDatabase
from fastapi_users_db_sqlalchemy.access_token import SQLAlchemyAccessTokenDatabase
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import mailer
from app.config import get_settings
from app.db import get_session
from app.models import AccessToken, User
from app.schemas.user import UserCreate

settings = get_settings()

COOKIE_NAME = "rb_session"
SESSION_LIFETIME = 14 * 24 * 3600
VERIFY_LIFETIME = 24 * 3600
RESET_LIFETIME = 3600
MIN_PASSWORD_LENGTH = 10


async def delete_sessions(
    session: AsyncSession, user_id: uuid.UUID, keep_token: str | None = None
) -> None:
    """Revoke all server-side sessions of a user (optionally except one)."""
    stmt = delete(AccessToken).where(AccessToken.user_id == user_id)
    if keep_token is not None:
        stmt = stmt.where(AccessToken.token != keep_token)
    await session.execute(stmt)
    await session.commit()


class UserManager(UUIDIDMixin, BaseUserManager[User, uuid.UUID]):
    reset_password_token_lifetime_seconds = RESET_LIFETIME
    verification_token_lifetime_seconds = VERIFY_LIFETIME

    user_db: SQLAlchemyUserDatabase[User, uuid.UUID]

    def __init__(
        self,
        user_db: SQLAlchemyUserDatabase[User, uuid.UUID],
        background_tasks: BackgroundTasks | None = None,
    ) -> None:
        super().__init__(user_db)
        self.reset_password_token_secret = settings.SECRET_KEY
        self.verification_token_secret = settings.SECRET_KEY
        self.background_tasks = background_tasks

    def _send(self, template: str, **context: Any) -> None:
        mail = mailer.render(template, **context)
        if self.background_tasks is not None:
            self.background_tasks.add_task(mailer.deliver, mail)
        else:  # pragma: no cover - only outside a request
            import asyncio

            asyncio.get_running_loop().create_task(mailer.deliver(mail))

    async def validate_password(self, password: str, user: UserCreate | User) -> None:  # type: ignore[override]
        if len(password) < MIN_PASSWORD_LENGTH:
            raise InvalidPasswordException(
                reason=f"Das Passwort muss mindestens {MIN_PASSWORD_LENGTH} Zeichen lang sein."
            )
        if user.email and user.email.lower() in password.lower():
            raise InvalidPasswordException(
                reason="Das Passwort darf die E-Mail-Adresse nicht enthalten."
            )

    async def on_after_register(self, user: User, request: Request | None = None) -> None:
        await self.request_verify(user, request)

    async def on_after_request_verify(
        self, user: User, token: str, request: Request | None = None
    ) -> None:
        self._send(
            "verify",
            to=user.email,
            name=user.display_name,
            link=f"{settings.frontend_base}/verify?token={token}",
        )

    async def on_after_forgot_password(
        self, user: User, token: str, request: Request | None = None
    ) -> None:
        self._send(
            "reset",
            to=user.email,
            name=user.display_name,
            link=f"{settings.frontend_base}/reset-password?token={token}",
        )

    async def on_after_reset_password(self, user: User, request: Request | None = None) -> None:
        await delete_sessions(self.user_db.session, user.id)


async def get_user_db(
    session: AsyncSession = Depends(get_session),
) -> AsyncIterator[SQLAlchemyUserDatabase[User, uuid.UUID]]:
    yield SQLAlchemyUserDatabase(session, User)


async def get_access_token_db(
    session: AsyncSession = Depends(get_session),
) -> AsyncIterator[SQLAlchemyAccessTokenDatabase[AccessToken]]:
    yield SQLAlchemyAccessTokenDatabase(session, AccessToken)


async def get_user_manager(
    background_tasks: BackgroundTasks,
    user_db: SQLAlchemyUserDatabase[User, uuid.UUID] = Depends(get_user_db),
) -> AsyncIterator[UserManager]:
    yield UserManager(user_db, background_tasks)


def get_database_strategy(
    access_token_db: AccessTokenDatabase[AccessToken] = Depends(get_access_token_db),
) -> DatabaseStrategy[User, uuid.UUID, AccessToken]:
    return DatabaseStrategy(access_token_db, lifetime_seconds=SESSION_LIFETIME)


cookie_transport = CookieTransport(
    cookie_name=COOKIE_NAME,
    cookie_max_age=SESSION_LIFETIME,
    cookie_secure=settings.COOKIE_SECURE,
    cookie_httponly=True,
    cookie_samesite="lax",
)

auth_backend: AuthenticationBackend[User, uuid.UUID] = AuthenticationBackend(
    name="cookie",
    transport=cookie_transport,
    get_strategy=get_database_strategy,
)

fastapi_users = FastAPIUsers[User, uuid.UUID](get_user_manager, [auth_backend])

current_active_user = fastapi_users.current_user(active=True)
current_active_user_token = fastapi_users.authenticator.current_user_token(active=True)


async def current_verified_user(user: User = Depends(current_active_user)) -> User:
    if not user.is_verified:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="EMAIL_NOT_VERIFIED")
    return user
