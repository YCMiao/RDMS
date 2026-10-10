"""Allow reaction temperature descriptions and minutes or time descriptions.

Revision ID: c9e2f4a601bd
Revises: b7e1a9302c64
"""

import sqlalchemy as sa

from alembic import op

revision: str = "c9e2f4a601bd"
down_revision: str | None = "b7e1a9302c64"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("reaction", sa.Column("temperature_description", sa.String(300), nullable=True))
    op.add_column("reaction", sa.Column("reaction_time_minutes", sa.Numeric(20, 8), nullable=True))
    op.add_column("reaction", sa.Column("reaction_time_description", sa.String(300), nullable=True))
    op.create_check_constraint(
        "temperature_exclusive",
        "reaction",
        "temperature_c IS NULL OR temperature_description IS NULL",
    )
    op.create_check_constraint(
        "time_exclusive",
        "reaction",
        "num_nonnulls(reaction_time_hours, reaction_time_minutes, reaction_time_description) <= 1",
    )
    op.create_check_constraint(
        "minutes_nonnegative",
        "reaction",
        "reaction_time_minutes IS NULL OR reaction_time_minutes >= 0",
    )


def downgrade() -> None:
    # Refuse to silently discard recorded descriptions or convert precise minutes.
    if (
        op.get_bind()
        .execute(
            sa.text(
                "SELECT EXISTS (SELECT 1 FROM reaction WHERE "
                "temperature_description IS NOT NULL OR reaction_time_minutes IS "
                "NOT NULL OR reaction_time_description IS NOT NULL)"
            )
        )
        .scalar()
    ):
        raise RuntimeError("反应含描述或分钟记录，不能无损降级；请使用迁移前备份隔离恢复。")
    for name in ("minutes_nonnegative", "time_exclusive", "temperature_exclusive"):
        op.drop_constraint(op.f(name), "reaction", type_="check")
    for name in ("reaction_time_description", "reaction_time_minutes", "temperature_description"):
        op.drop_column("reaction", name)
