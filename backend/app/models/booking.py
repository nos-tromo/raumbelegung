import datetime as dt
import uuid

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.types import Rec, UTCDateTime, pg_enum, utcnow


class Booking(Base):
    __tablename__ = "bookings"
    __table_args__ = (
        sa.CheckConstraint("end_time > start_time", name="end_after_start"),
        sa.CheckConstraint('"until" IS NULL OR "until" >= "date"', name="until_after_date"),
        sa.Index("ix_bookings_calendar_id_date", "calendar_id", "date"),
    )

    id: Mapped[uuid.UUID] = mapped_column(sa.Uuid, primary_key=True, default=uuid.uuid4)
    calendar_id: Mapped[uuid.UUID] = mapped_column(
        sa.Uuid, sa.ForeignKey("calendars.id", ondelete="CASCADE")
    )
    title: Mapped[str] = mapped_column(sa.String(80))
    date: Mapped[dt.date] = mapped_column(sa.Date)
    start_time: Mapped[dt.time] = mapped_column(sa.Time)
    end_time: Mapped[dt.time] = mapped_column(sa.Time)
    rec: Mapped[Rec] = mapped_column(pg_enum(Rec, "booking_rec"))
    until: Mapped[dt.date | None] = mapped_column(sa.Date)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        sa.Uuid, sa.ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    created_at: Mapped[dt.datetime] = mapped_column(UTCDateTime, default=utcnow)
    updated_at: Mapped[dt.datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)
