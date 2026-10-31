import enum
from datetime import UTC, datetime
from typing import Any

import sqlalchemy as sa
from sqlalchemy.engine import Dialect


def utcnow() -> datetime:
    return datetime.now(UTC)


class UTCDateTime(sa.TypeDecorator[datetime]):
    """Timezone-aware UTC timestamp. SQLite drops tzinfo, so it is re-attached on load."""

    impl = sa.DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect: Dialect) -> datetime | None:
        if value is not None:
            if value.tzinfo is None:
                value = value.replace(tzinfo=UTC)
            value = value.astimezone(UTC)
            if dialect.name == "sqlite":
                value = value.replace(tzinfo=None)
        return value

    def process_result_value(self, value: Any, dialect: Dialect) -> datetime | None:
        if value is not None and value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        return value  # type: ignore[no-any-return]


class Role(enum.StrEnum):
    owner = "owner"
    editor = "editor"
    viewer = "viewer"


class InvitationRole(enum.StrEnum):
    editor = "editor"
    viewer = "viewer"


class Rec(enum.StrEnum):
    none = "none"
    daily = "daily"
    weekdays = "weekdays"
    weekly = "weekly"
    monthly = "monthly"
    monthlyLast = "monthlyLast"  # noqa: N815 - value used verbatim by the frontend


ROLE_RANK = {Role.viewer: 0, Role.editor: 1, Role.owner: 2}


def pg_enum(cls: type[enum.Enum], name: str) -> sa.Enum:
    return sa.Enum(cls, name=name, values_callable=lambda e: [m.value for m in e])
