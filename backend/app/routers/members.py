import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.deps import CalendarAccess, not_found, owner_count, require_role
from app.models import CalendarMember, Role, User
from app.schemas.calendar import MemberRead, MemberUpdate

router = APIRouter(prefix="/calendars/{calendar_id}/members", tags=["members"])

ROLE_ORDER = {Role.owner: 0, Role.editor: 1, Role.viewer: 2}


def _read(member: CalendarMember, user: User) -> MemberRead:
    return MemberRead(
        user_id=user.id, email=user.email, display_name=user.display_name, role=member.role
    )


async def _get_member(
    session: AsyncSession, calendar_id: uuid.UUID, user_id: uuid.UUID
) -> tuple[CalendarMember, User]:
    row = (
        await session.execute(
            select(CalendarMember, User)
            .join(User, User.id == CalendarMember.user_id)
            .where(CalendarMember.calendar_id == calendar_id, CalendarMember.user_id == user_id)
        )
    ).first()
    if row is None:
        raise not_found()
    return row[0], row[1]


def _last_owner() -> HTTPException:
    return HTTPException(status.HTTP_409_CONFLICT, detail="LAST_OWNER")


@router.get("", response_model=list[MemberRead])
async def list_members(
    access: CalendarAccess = Depends(require_role(Role.viewer)),
    session: AsyncSession = Depends(get_session),
) -> list[MemberRead]:
    rows = list(
        (
            await session.execute(
                select(CalendarMember, User)
                .join(User, User.id == CalendarMember.user_id)
                .where(CalendarMember.calendar_id == access.calendar.id)
            )
        ).all()
    )
    rows.sort(key=lambda r: (ROLE_ORDER[r[0].role], r[1].display_name.lower()))
    return [_read(m, u) for m, u in rows]


@router.patch("/{user_id}", response_model=MemberRead)
async def update_member(
    user_id: uuid.UUID,
    body: MemberUpdate,
    access: CalendarAccess = Depends(require_role(Role.owner)),
    session: AsyncSession = Depends(get_session),
) -> MemberRead:
    member, user = await _get_member(session, access.calendar.id, user_id)
    if (
        member.role == Role.owner
        and body.role != Role.owner
        and await owner_count(session, access.calendar.id) <= 1
    ):
        raise _last_owner()
    member.role = body.role
    await session.commit()
    return _read(member, user)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    user_id: uuid.UUID,
    access: CalendarAccess = Depends(require_role(Role.viewer)),
    session: AsyncSession = Depends(get_session),
) -> Response:
    """Owners can remove anyone; everybody can remove themselves (leave)."""
    if user_id != access.user.id and access.role != Role.owner:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="FORBIDDEN")
    member, _ = await _get_member(session, access.calendar.id, user_id)
    if member.role == Role.owner and await owner_count(session, access.calendar.id) <= 1:
        raise _last_owner()
    await session.delete(member)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
