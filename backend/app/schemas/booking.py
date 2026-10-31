import datetime as dt
import uuid
from typing import Annotated, Self

from pydantic import (
    BaseModel,
    BeforeValidator,
    PlainSerializer,
    StringConstraints,
    model_validator,
)

from app.domain.recurrence import Slot
from app.models import Booking as BookingModel
from app.models import Rec


def _parse_hhmm(v: object) -> object:
    if isinstance(v, str):
        parts = v.split(":")
        if len(parts) != 2 or not all(p.isdigit() and len(p) == 2 for p in parts):
            raise ValueError("expected HH:MM")
    return v


HHMM = Annotated[
    dt.time,
    BeforeValidator(_parse_hhmm),
    PlainSerializer(lambda t: t.strftime("%H:%M"), return_type=str),
]
Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]


class BookingIn(BaseModel):
    title: Title
    date: dt.date
    start: HHMM
    end: HHMM
    rec: Rec
    until: dt.date | None = None

    @model_validator(mode="after")
    def _check(self) -> Self:
        if self.rec == Rec.none:
            self.until = None  # until is ignored for one-off bookings
        if self.end <= self.start:
            raise ValueError("end must be after start")
        if self.until is not None and self.until < self.date:
            raise ValueError("until must not be before date")
        return self

    def slot(self) -> Slot:
        return Slot(
            date=self.date, start=self.start, end=self.end, rec=self.rec.value, until=self.until
        )


class BookingCreate(BookingIn):
    force: bool = False


class BookingRead(BaseModel):
    id: uuid.UUID
    title: str
    date: dt.date
    start: HHMM
    end: HHMM
    rec: Rec
    until: dt.date | None
    created_by: uuid.UUID | None
    created_by_name: str | None
    created_at: dt.datetime

    @classmethod
    def build(cls, b: BookingModel, creator_name: str | None) -> "BookingRead":
        return cls(
            id=b.id,
            title=b.title,
            date=b.date,
            start=b.start_time,
            end=b.end_time,
            rec=b.rec,
            until=b.until,
            created_by=b.created_by,
            created_by_name=creator_name if b.created_by else None,
            created_at=b.created_at,
        )


class ConflictRead(BaseModel):
    booking: BookingRead
    dates: list[dt.date]


class ConflictsRead(BaseModel):
    conflicts: list[ConflictRead]
