"""Add explicit limiting reactants and product stoichiometry without rewriting records."""

import sqlalchemy as sa

from alembic import op

revision: str = "e5b8d0f302ca"
down_revision: str | None = "d4a7c9e201bf"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "reaction_component",
        sa.Column("is_limiting", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "reaction_component", sa.Column("stoichiometric_ratio", sa.Numeric(20, 8), nullable=True)
    )
    op.create_check_constraint(
        "limiting_one_eq",
        "reaction_component",
        "NOT is_limiting OR (role <> 'product' AND equivalents IS NOT NULL AND equivalents = 1)",
    )
    op.create_check_constraint(
        "product_ratio_positive",
        "reaction_component",
        "stoichiometric_ratio IS NULL OR (role = 'product' AND stoichiometric_ratio > 0)",
    )
    op.create_index(
        "ix_component_one_limiting",
        "reaction_component",
        ["reaction_id"],
        unique=True,
        postgresql_where=sa.text("is_limiting AND deleted_at IS NULL"),
    )


def downgrade() -> None:
    # Refuse to discard explicit scientific setup added after this migration.
    if op.get_bind().scalar(
        sa.text(
            "SELECT EXISTS (SELECT 1 FROM reaction_component "
            "WHERE is_limiting OR stoichiometric_ratio IS NOT NULL)"
        )
    ):
        raise RuntimeError("已有限制反应物或产物计量比，拒绝丢失记录的降级；请从迁移前备份隔离恢复")
    op.drop_index("ix_component_one_limiting", table_name="reaction_component")
    op.drop_constraint("product_ratio_positive", "reaction_component", type_="check")
    op.drop_constraint("limiting_one_eq", "reaction_component", type_="check")
    op.drop_column("reaction_component", "stoichiometric_ratio")
    op.drop_column("reaction_component", "is_limiting")
