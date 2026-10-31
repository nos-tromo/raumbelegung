"""Initial schema: users, sessions, calendars, members, invitations, bookings.

Revision ID: 0001
Revises:
Create Date: 2026-10-31 16:45:35.647930
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("hashed_password", sa.String(length=1024), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("is_verified", sa.Boolean(), nullable=False),
        sa.Column("is_superuser", sa.Boolean(), nullable=False),
        sa.Column("display_name", sa.String(length=80), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)

    op.create_table(
        "access_tokens",
        sa.Column("token", sa.String(length=43), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_access_tokens_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("token", name=op.f("pk_access_tokens")),
    )
    op.create_index(
        op.f("ix_access_tokens_created_at"),
        "access_tokens",
        ["created_at"],
        unique=False,
    )
    op.create_index(op.f("ix_access_tokens_user_id"), "access_tokens", ["user_id"], unique=False)

    op.create_table(
        "calendars",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column("timezone", sa.String(length=64), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["users.id"],
            name=op.f("fk_calendars_created_by_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_calendars")),
    )
    op.create_table(
        "bookings",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("calendar_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=80), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("end_time", sa.Time(), nullable=False),
        sa.Column(
            "rec",
            sa.Enum(
                "none",
                "daily",
                "weekdays",
                "weekly",
                "monthly",
                "monthlyLast",
                name="booking_rec",
            ),
            nullable=False,
        ),
        sa.Column("until", sa.Date(), nullable=True),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            '"until" IS NULL OR "until" >= "date"',
            name=op.f("ck_bookings_until_after_date"),
        ),
        sa.CheckConstraint("end_time > start_time", name=op.f("ck_bookings_end_after_start")),
        sa.ForeignKeyConstraint(
            ["calendar_id"],
            ["calendars.id"],
            name=op.f("fk_bookings_calendar_id_calendars"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["users.id"],
            name=op.f("fk_bookings_created_by_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_bookings")),
    )
    op.create_index(
        "ix_bookings_calendar_id_date",
        "bookings",
        ["calendar_id", "date"],
        unique=False,
    )
    op.create_index(op.f("ix_bookings_created_by"), "bookings", ["created_by"], unique=False)

    op.create_table(
        "calendar_members",
        sa.Column("calendar_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column(
            "role",
            sa.Enum("owner", "editor", "viewer", name="member_role"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["calendar_id"],
            ["calendars.id"],
            name=op.f("fk_calendar_members_calendar_id_calendars"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_calendar_members_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("calendar_id", "user_id", name=op.f("pk_calendar_members")),
    )
    op.create_index(
        op.f("ix_calendar_members_user_id"),
        "calendar_members",
        ["user_id"],
        unique=False,
    )

    op.create_table(
        "invitations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("calendar_id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("role", sa.Enum("editor", "viewer", name="invitation_role"), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("invited_by", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["calendar_id"],
            ["calendars.id"],
            name=op.f("fk_invitations_calendar_id_calendars"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["invited_by"],
            ["users.id"],
            name=op.f("fk_invitations_invited_by_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_invitations")),
        sa.UniqueConstraint("token_hash", name=op.f("uq_invitations_token_hash")),
    )
    op.create_index(
        op.f("ix_invitations_calendar_id"), "invitations", ["calendar_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_invitations_calendar_id"), table_name="invitations")

    op.drop_table("invitations")
    op.drop_index(op.f("ix_calendar_members_user_id"), table_name="calendar_members")

    op.drop_table("calendar_members")
    op.drop_index(op.f("ix_bookings_created_by"), table_name="bookings")
    op.drop_index("ix_bookings_calendar_id_date", table_name="bookings")

    op.drop_table("bookings")
    op.drop_table("calendars")
    op.drop_index(op.f("ix_access_tokens_user_id"), table_name="access_tokens")
    op.drop_index(op.f("ix_access_tokens_created_at"), table_name="access_tokens")

    op.drop_table("access_tokens")
    op.drop_index(op.f("ix_users_email"), table_name="users")

    op.drop_table("users")

    # PostgreSQL keeps enum types after DROP TABLE.
    bind = op.get_bind()
    for name in ("booking_rec", "member_role", "invitation_role"):
        sa.Enum(name=name).drop(bind, checkfirst=True)
