import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.types import UTCDateTime, utcnow


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(sa.Uuid, primary_key=True, default=uuid.uuid4)
    # Always stored lowercased (normalised in the schemas / user manager).
    email: Mapped[str] = mapped_column(sa.String(320), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(sa.String(1024))
    is_active: Mapped[bool] = mapped_column(sa.Boolean, default=True)
    is_verified: Mapped[bool] = mapped_column(sa.Boolean, default=False)
    is_superuser: Mapped[bool] = mapped_column(sa.Boolean, default=False)
    display_name: Mapped[str] = mapped_column(sa.String(80))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


class AccessToken(Base):
    """Server-side session (fastapi-users DatabaseStrategy)."""

    __tablename__ = "access_tokens"

    token: Mapped[str] = mapped_column(sa.String(43), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        sa.Uuid, sa.ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, index=True)
