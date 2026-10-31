import uuid
from datetime import datetime
from functools import lru_cache
from typing import Annotated
from zoneinfo import available_timezones

from pydantic import AfterValidator, BaseModel, EmailStr, StringConstraints, field_validator

from app.models import InvitationRole, Role

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
Description = Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)]


@lru_cache(maxsize=1)
def _zones() -> frozenset[str]:
    return frozenset(available_timezones())


def _check_tz(v: str) -> str:
    if v not in _zones():
        raise ValueError("unknown timezone")
    return v


Timezone = Annotated[str, AfterValidator(_check_tz)]


def _empty_to_none(v: str | None) -> str | None:
    return v or None


class CalendarCreate(BaseModel):
    name: Name
    description: Description | None = None
    timezone: Timezone | None = None

    _desc = field_validator("description", mode="after")(_empty_to_none)


class CalendarUpdate(BaseModel):
    name: Name | None = None
    description: Description | None = None
    timezone: Timezone | None = None

    _desc = field_validator("description", mode="after")(_empty_to_none)


class CalendarRead(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    timezone: str
    role: Role
    member_count: int
    created_at: datetime


class MemberRead(BaseModel):
    user_id: uuid.UUID
    email: str
    display_name: str
    role: Role


class MemberUpdate(BaseModel):
    role: Role


class InvitationCreate(BaseModel):
    email: EmailStr
    role: InvitationRole

    @field_validator("email", mode="after")
    @classmethod
    def _lower(cls, v: str) -> str:
        return v.lower()


class InvitationRead(BaseModel):
    id: uuid.UUID
    email: str
    role: InvitationRole
    expires_at: datetime
    created_at: datetime


class InvitationInfo(BaseModel):
    calendar_name: str
    role: InvitationRole
    email: str
    invited_by_name: str | None


class InvitationAccepted(BaseModel):
    calendar_id: uuid.UUID
