import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.types import InvitationRole, Role, UTCDateTime, pg_enum, utcnow


class Calendar(Base):
    __tablename__ = "calendars"

    id: Mapped[uuid.UUID] = mapped_column(sa.Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(sa.String(80))
    description: Mapped[str | None] = mapped_column(sa.String(500))
    timezone: Mapped[str] = mapped_column(sa.String(64))
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        sa.Uuid, sa.ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


class CalendarMember(Base):
    __tablename__ = "calendar_members"

    calendar_id: Mapped[uuid.UUID] = mapped_column(
        sa.Uuid, sa.ForeignKey("calendars.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        sa.Uuid, sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    role: Mapped[Role] = mapped_column(pg_enum(Role, "member_role"))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


class Invitation(Base):
    __tablename__ = "invitations"

    id: Mapped[uuid.UUID] = mapped_column(sa.Uuid, primary_key=True, default=uuid.uuid4)
    calendar_id: Mapped[uuid.UUID] = mapped_column(
        sa.Uuid, sa.ForeignKey("calendars.id", ondelete="CASCADE"), index=True
    )
    email: Mapped[str] = mapped_column(sa.String(320))
    role: Mapped[InvitationRole] = mapped_column(pg_enum(InvitationRole, "invitation_role"))
    # SHA-256 hex digest of the token sent by mail; the token itself is never stored.
    token_hash: Mapped[str] = mapped_column(sa.String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime)
    accepted_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    invited_by: Mapped[uuid.UUID | None] = mapped_column(
        sa.Uuid, sa.ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
