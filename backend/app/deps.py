import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

from fastapi import Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.users import current_verified_user
from app.db import get_session
from app.models import ROLE_RANK, Calendar, CalendarMember, Role, User


@dataclass
class CalendarAccess:
    calendar: Calendar
    member: CalendarMember
    user: User

    @property
    def role(self) -> Role:
        return self.member.role


def not_found() -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, detail="NOT_FOUND")


def require_role(min_role: Role) -> Callable[..., Awaitable[CalendarAccess]]:
    """Dependency: caller is verified and has at least ``min_role`` in the calendar.

    Non-members get 404 (not 403) so calendar ids cannot be probed.
    """

    async def dependency(
        calendar_id: uuid.UUID,
        user: User = Depends(current_verified_user),
        session: AsyncSession = Depends(get_session),
    ) -> CalendarAccess:
        row = (
            await session.execute(
                select(Calendar, CalendarMember)
                .join(CalendarMember, CalendarMember.calendar_id == Calendar.id)
                .where(Calendar.id == calendar_id, CalendarMember.user_id == user.id)
            )
        ).first()
        if row is None:
            raise not_found()
        calendar, member = row
        if ROLE_RANK[member.role] < ROLE_RANK[min_role]:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="FORBIDDEN")
        return CalendarAccess(calendar=calendar, member=member, user=user)

    return dependency


async def owner_count(session: AsyncSession, calendar_id: uuid.UUID) -> int:
    return (
        await session.scalar(
            select(func.count())
            .select_from(CalendarMember)
            .where(CalendarMember.calendar_id == calendar_id, CalendarMember.role == Role.owner)
        )
    ) or 0
