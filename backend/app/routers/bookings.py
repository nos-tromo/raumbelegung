import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.deps import CalendarAccess, not_found, require_role
from app.domain.recurrence import Slot, find_conflicts
from app.models import Booking, Calendar, Role, User
from app.schemas.booking import (
    BookingCreate,
    BookingIn,
    BookingRead,
    ConflictRead,
    ConflictsRead,
)

router = APIRouter(prefix="/calendars/{calendar_id}/bookings", tags=["bookings"])


async def _load(session: AsyncSession, calendar_id: uuid.UUID) -> list[BookingRead]:
    rows = (
        await session.execute(
            select(Booking, User.display_name)
            .outerjoin(User, User.id == Booking.created_by)
            .where(Booking.calendar_id == calendar_id)
            .order_by(Booking.date, Booking.start_time, Booking.created_at)
        )
    ).all()
    return [BookingRead.build(b, name) for b, name in rows]


def _slot(b: BookingRead) -> Slot:
    return Slot(date=b.date, start=b.start, end=b.end, rec=b.rec.value, until=b.until, id=b.id)


async def _conflicts(
    session: AsyncSession, calendar_id: uuid.UUID, body: BookingIn
) -> list[ConflictRead]:
    existing = await _load(session, calendar_id)
    by_id = {b.id: b for b in existing}
    return [
        ConflictRead(booking=by_id[c.other.id], dates=c.dates)  # type: ignore[index]
        for c in find_conflicts(body.slot(), [_slot(b) for b in existing])
    ]


@router.get("", response_model=list[BookingRead])
async def list_bookings(
    access: CalendarAccess = Depends(require_role(Role.viewer)),
    session: AsyncSession = Depends(get_session),
) -> list[BookingRead]:
    return await _load(session, access.calendar.id)


@router.post("/check", response_model=ConflictsRead)
async def check_booking(
    body: BookingIn,
    access: CalendarAccess = Depends(require_role(Role.editor)),
    session: AsyncSession = Depends(get_session),
) -> ConflictsRead:
    return ConflictsRead(conflicts=await _conflicts(session, access.calendar.id, body))


@router.post("", response_model=BookingRead, status_code=status.HTTP_201_CREATED)
async def create_booking(
    body: BookingCreate,
    access: CalendarAccess = Depends(require_role(Role.editor)),
    session: AsyncSession = Depends(get_session),
) -> BookingRead:
    cal_id = access.calendar.id
    # Serialise concurrent creates per calendar (no-op on SQLite).
    await session.execute(select(Calendar.id).where(Calendar.id == cal_id).with_for_update())
    if not body.force:
        conflicts = await _conflicts(session, cal_id, body)
        if conflicts:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                detail={
                    "code": "BOOKING_CONFLICT",
                    "conflicts": [c.model_dump(mode="json") for c in conflicts],
                },
            )
    booking = Booking(
        calendar_id=cal_id,
        title=body.title,
        date=body.date,
        start_time=body.start,
        end_time=body.end,
        rec=body.rec,
        until=body.until,
        created_by=access.user.id,
    )
    session.add(booking)
    await session.commit()
    return BookingRead.build(booking, access.user.display_name)


@router.delete("/{booking_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_booking(
    booking_id: uuid.UUID,
    access: CalendarAccess = Depends(require_role(Role.editor)),
    session: AsyncSession = Depends(get_session),
) -> Response:
    booking = await session.get(Booking, booking_id)
    if booking is None or booking.calendar_id != access.calendar.id:
        raise not_found()
    if access.role != Role.owner and booking.created_by != access.user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="FORBIDDEN")
    await session.delete(booking)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
