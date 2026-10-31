import uuid

from fastapi import APIRouter, Depends, status
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.users import current_verified_user
from app.config import get_settings
from app.db import get_session
from app.deps import CalendarAccess, require_role
from app.models import Calendar, CalendarMember, Role, User
from app.schemas.calendar import CalendarCreate, CalendarRead, CalendarUpdate

router = APIRouter(prefix="/calendars", tags=["calendars"])


async def _member_count(session: AsyncSession, calendar_id: uuid.UUID) -> int:
    return (
        await session.scalar(
            select(func.count())
            .select_from(CalendarMember)
            .where(CalendarMember.calendar_id == calendar_id)
        )
    ) or 0


def _read(calendar: Calendar, role: Role, member_count: int) -> CalendarRead:
    return CalendarRead(
        id=calendar.id,
        name=calendar.name,
        description=calendar.description,
        timezone=calendar.timezone,
        role=role,
        member_count=member_count,
        created_at=calendar.created_at,
    )


@router.get("", response_model=list[CalendarRead])
async def list_calendars(
    user: User = Depends(current_verified_user),
    session: AsyncSession = Depends(get_session),
) -> list[CalendarRead]:
    counts = (
        select(CalendarMember.calendar_id, func.count().label("n"))
        .group_by(CalendarMember.calendar_id)
        .subquery()
    )
    rows = (
        await session.execute(
            select(Calendar, CalendarMember.role, counts.c.n)
            .join(CalendarMember, CalendarMember.calendar_id == Calendar.id)
            .join(counts, counts.c.calendar_id == Calendar.id)
            .where(CalendarMember.user_id == user.id)
            .order_by(func.lower(Calendar.name), Calendar.created_at)
        )
    ).all()
    return [_read(c, role, n) for c, role, n in rows]


@router.post("", response_model=CalendarRead, status_code=status.HTTP_201_CREATED)
async def create_calendar(
    body: CalendarCreate,
    user: User = Depends(current_verified_user),
    session: AsyncSession = Depends(get_session),
) -> CalendarRead:
    calendar = Calendar(
        name=body.name,
        description=body.description,
        timezone=body.timezone or get_settings().DEFAULT_TIMEZONE,
        created_by=user.id,
    )
    session.add(calendar)
    await session.flush()
    session.add(CalendarMember(calendar_id=calendar.id, user_id=user.id, role=Role.owner))
    await session.commit()
    return _read(calendar, Role.owner, 1)


@router.get("/{calendar_id}", response_model=CalendarRead)
async def get_calendar(
    access: CalendarAccess = Depends(require_role(Role.viewer)),
    session: AsyncSession = Depends(get_session),
) -> CalendarRead:
    return _read(access.calendar, access.role, await _member_count(session, access.calendar.id))


@router.patch("/{calendar_id}", response_model=CalendarRead)
async def update_calendar(
    body: CalendarUpdate,
    access: CalendarAccess = Depends(require_role(Role.owner)),
    session: AsyncSession = Depends(get_session),
) -> CalendarRead:
    calendar = access.calendar
    fields = body.model_dump(exclude_unset=True)
    if fields.get("name") is not None:
        calendar.name = fields["name"]
    if "description" in fields:
        calendar.description = fields["description"]
    if fields.get("timezone") is not None:
        calendar.timezone = fields["timezone"]
    await session.commit()
    return _read(calendar, access.role, await _member_count(session, calendar.id))


@router.delete("/{calendar_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_calendar(
    access: CalendarAccess = Depends(require_role(Role.owner)),
    session: AsyncSession = Depends(get_session),
) -> Response:
    # members, invitations and bookings go with it (ON DELETE CASCADE)
    await session.delete(access.calendar)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
