import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse, Response
from fastapi_users import InvalidPasswordException
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.auth.users import (
    UserManager,
    current_active_user,
    current_active_user_token,
    delete_sessions,
    get_user_manager,
)
from app.db import get_session
from app.models import Booking, Calendar, CalendarMember, Role, User
from app.schemas.booking import BookingRead
from app.schemas.user import AccountDelete, PasswordChange, UserRead, UserUpdate

router = APIRouter(prefix="/users/me", tags=["account"])


@router.get("", response_model=UserRead)
async def read_me(user: User = Depends(current_active_user)) -> User:
    return user


@router.patch("", response_model=UserRead)
async def update_me(
    body: UserUpdate,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_session),
) -> User:
    user.display_name = body.display_name
    await session.commit()
    return user


def _check_password(manager: UserManager, password: str, user: User) -> None:
    ok, _ = manager.password_helper.verify_and_update(password, user.hashed_password)
    if not ok:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="BAD_CURRENT_PASSWORD")


@router.post("/password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(
    body: PasswordChange,
    user_token: tuple[User, str] = Depends(current_active_user_token),
    manager: UserManager = Depends(get_user_manager),
    session: AsyncSession = Depends(get_session),
) -> Response:
    """Change the password. All *other* sessions are revoked; the current one stays."""
    user, token = user_token
    _check_password(manager, body.current_password, user)
    try:
        await manager.validate_password(body.new_password, user)
    except InvalidPasswordException as e:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_PASSWORD", "reason": e.reason},
        ) from e
    user.hashed_password = manager.password_helper.hash(body.new_password)
    await session.commit()
    await delete_sessions(session, user.id, keep_token=token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


async def _sole_owner_calendars(session: AsyncSession, user_id: uuid.UUID) -> list[Calendar]:
    other = aliased(CalendarMember)
    other_owners = (
        select(func.count())
        .select_from(other)
        .where(
            other.calendar_id == CalendarMember.calendar_id,
            other.role == Role.owner,
            other.user_id != user_id,
        )
        .scalar_subquery()
    )
    rows = await session.scalars(
        select(Calendar)
        .join(CalendarMember, CalendarMember.calendar_id == Calendar.id)
        .where(
            and_(CalendarMember.user_id == user_id, CalendarMember.role == Role.owner),
            other_owners == 0,
        )
        .order_by(Calendar.name)
    )
    return list(rows)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def delete_me(
    body: AccountDelete,
    user: User = Depends(current_active_user),
    manager: UserManager = Depends(get_user_manager),
    session: AsyncSession = Depends(get_session),
) -> Response:
    """Delete the account. Own bookings stay (created_by becomes NULL via FK)."""
    _check_password(manager, body.password, user)
    blocking = await _sole_owner_calendars(session, user.id)
    if blocking:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail={
                "code": "LAST_OWNER",
                "calendars": [{"id": str(c.id), "name": c.name} for c in blocking],
            },
        )
    await session.delete(user)  # FKs: sessions/memberships CASCADE, bookings etc. SET NULL
    await session.commit()
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    response.delete_cookie("rb_session", path="/")
    return response


@router.get("/export")
async def export_me(
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_session),
) -> JSONResponse:
    """Art. 20 GDPR export: profile, memberships, own bookings."""
    memberships = (
        await session.execute(
            select(CalendarMember, Calendar)
            .join(Calendar, Calendar.id == CalendarMember.calendar_id)
            .where(CalendarMember.user_id == user.id)
            .order_by(Calendar.name)
        )
    ).all()
    bookings = await session.scalars(
        select(Booking).where(Booking.created_by == user.id).order_by(Booking.date)
    )
    cal_names = {c.id: c.name for _, c in memberships}
    data: dict[str, Any] = {
        "exported_at": datetime.now(UTC).isoformat(),
        "user": {
            "id": str(user.id),
            "email": user.email,
            "display_name": user.display_name,
            "is_verified": user.is_verified,
            "created_at": user.created_at.isoformat(),
        },
        "memberships": [
            {
                "calendar_id": str(c.id),
                "calendar_name": c.name,
                "role": m.role.value,
                "joined_at": m.created_at.isoformat(),
            }
            for m, c in memberships
        ],
        "bookings": [
            {
                "calendar_id": str(b.calendar_id),
                "calendar_name": cal_names.get(b.calendar_id),
                **BookingRead.build(b, user.display_name).model_dump(mode="json"),
            }
            for b in bookings
        ],
    }
    return JSONResponse(
        data,
        headers={"Content-Disposition": 'attachment; filename="raumbelegung-export.json"'},
    )
