import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import mailer
from app.auth.users import current_active_user, current_verified_user
from app.config import get_settings
from app.db import get_session
from app.deps import CalendarAccess, not_found, require_role
from app.models import Calendar, CalendarMember, Invitation, InvitationRole, Role, User
from app.ratelimit import INVITE_LIMIT, enforce_user_limit
from app.schemas.calendar import (
    InvitationAccepted,
    InvitationCreate,
    InvitationInfo,
    InvitationRead,
)

INVITATION_LIFETIME = timedelta(days=7)
ROLE_LABELS = {InvitationRole.editor: "Bearbeiten", InvitationRole.viewer: "Nur ansehen"}

calendar_router = APIRouter(prefix="/calendars/{calendar_id}/invitations", tags=["invitations"])
token_router = APIRouter(prefix="/invitations", tags=["invitations"])


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _read(inv: Invitation) -> InvitationRead:
    return InvitationRead(
        id=inv.id,
        email=inv.email,
        role=inv.role,
        expires_at=inv.expires_at,
        created_at=inv.created_at,
    )


@calendar_router.post("", response_model=InvitationRead, status_code=status.HTTP_201_CREATED)
async def create_invitation(
    body: InvitationCreate,
    background_tasks: BackgroundTasks,
    access: CalendarAccess = Depends(require_role(Role.owner)),
    session: AsyncSession = Depends(get_session),
) -> InvitationRead:
    enforce_user_limit("invite", str(access.user.id), INVITE_LIMIT)
    cal = access.calendar
    is_member = await session.scalar(
        select(CalendarMember.user_id)
        .join(User, User.id == CalendarMember.user_id)
        .where(CalendarMember.calendar_id == cal.id, User.email == body.email)
    )
    if is_member is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="ALREADY_MEMBER")

    # A new invitation replaces any still-open one for the same address.
    await session.execute(
        delete(Invitation).where(
            Invitation.calendar_id == cal.id,
            Invitation.email == body.email,
            Invitation.accepted_at.is_(None),
        )
    )
    token = secrets.token_urlsafe(32)
    now = datetime.now(UTC)
    inv = Invitation(
        calendar_id=cal.id,
        email=body.email,
        role=body.role,
        token_hash=hash_token(token),
        expires_at=now + INVITATION_LIFETIME,
        invited_by=access.user.id,
        created_at=now,
    )
    session.add(inv)
    await session.commit()

    mail = mailer.render(
        "invite",
        to=body.email,
        inviter=access.user.display_name,
        calendar_name=cal.name,
        role_label=ROLE_LABELS[body.role],
        link=f"{get_settings().frontend_base}/invite/{token}",
    )
    background_tasks.add_task(mailer.deliver, mail)
    return _read(inv)


@calendar_router.get("", response_model=list[InvitationRead])
async def list_invitations(
    access: CalendarAccess = Depends(require_role(Role.owner)),
    session: AsyncSession = Depends(get_session),
) -> list[InvitationRead]:
    rows = await session.scalars(
        select(Invitation)
        .where(
            Invitation.calendar_id == access.calendar.id,
            Invitation.accepted_at.is_(None),
            Invitation.expires_at > datetime.now(UTC),
        )
        .order_by(Invitation.created_at)
    )
    return [_read(i) for i in rows]


@calendar_router.delete("/{invitation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_invitation(
    invitation_id: uuid.UUID,
    access: CalendarAccess = Depends(require_role(Role.owner)),
    session: AsyncSession = Depends(get_session),
) -> Response:
    inv = await session.get(Invitation, invitation_id)
    if inv is None or inv.calendar_id != access.calendar.id:
        raise not_found()
    await session.delete(inv)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


async def _open_invitation(session: AsyncSession, token: str) -> tuple[Invitation, Calendar]:
    row = (
        await session.execute(
            select(Invitation, Calendar)
            .join(Calendar, Calendar.id == Invitation.calendar_id)
            .where(
                Invitation.token_hash == hash_token(token),
                Invitation.accepted_at.is_(None),
                Invitation.expires_at > datetime.now(UTC),
            )
        )
    ).first()
    if row is None:
        raise not_found()
    return row[0], row[1]


@token_router.get("/{token}", response_model=InvitationInfo)
async def get_invitation(
    token: str,
    _user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_session),
) -> InvitationInfo:
    inv, cal = await _open_invitation(session, token)
    inviter = await session.get(User, inv.invited_by) if inv.invited_by else None
    return InvitationInfo(
        calendar_name=cal.name,
        role=inv.role,
        email=inv.email,
        invited_by_name=inviter.display_name if inviter else None,
    )


@token_router.post("/{token}/accept", response_model=InvitationAccepted)
async def accept_invitation(
    token: str,
    user: User = Depends(current_verified_user),
    session: AsyncSession = Depends(get_session),
) -> InvitationAccepted:
    inv, cal = await _open_invitation(session, token)
    if inv.email.lower() != user.email.lower():
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="INVITATION_EMAIL_MISMATCH")
    existing = await session.get(CalendarMember, (cal.id, user.id))
    if existing is None:  # already a member: keep the current role
        session.add(CalendarMember(calendar_id=cal.id, user_id=user.id, role=Role(inv.role.value)))
    inv.accepted_at = datetime.now(UTC)
    await session.commit()
    return InvitationAccepted(calendar_id=cal.id)
