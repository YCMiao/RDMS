"""Store Kelvin reaction temperatures without changing existing Celsius records."""

import sqlalchemy as sa

from alembic import op

revision = "a7d0f2b504ec"
down_revision = "f6c9e1a403db"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("reaction", sa.Column("temperature_k", sa.Numeric(20, 8), nullable=True))
    op.drop_constraint(op.f("temperature_exclusive"), "reaction", type_="check")
    op.create_check_constraint(
        "temperature_exclusive",
        "reaction",
        "num_nonnulls(temperature_c, temperature_k, temperature_description) <= 1",
    )
    op.create_check_constraint(
        "kelvin_nonnegative", "reaction", "temperature_k IS NULL OR temperature_k >= 0"
    )


def downgrade() -> None:
    if (
        op.get_bind()
        .execute(sa.text("SELECT EXISTS (SELECT 1 FROM reaction WHERE temperature_k IS NOT NULL)"))
        .scalar()
    ):
        raise RuntimeError("存在 K 温度记录，不能无损降级；请使用迁移前备份隔离恢复。")
    op.drop_constraint(op.f("kelvin_nonnegative"), "reaction", type_="check")
    op.drop_constraint(op.f("temperature_exclusive"), "reaction", type_="check")
    op.drop_column("reaction", "temperature_k")
    op.create_check_constraint(
        "temperature_exclusive",
        "reaction",
        "temperature_c IS NULL OR temperature_description IS NULL",
    )
