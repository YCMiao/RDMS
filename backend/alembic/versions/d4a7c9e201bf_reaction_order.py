"""Persist reaction order instead of ordering copied reactions by random UUID.

Revision ID: d4a7c9e201bf
Revises: c9e2f4a601bd
"""

import sqlalchemy as sa

from alembic import op

revision: str = "d4a7c9e201bf"
down_revision: str | None = "c9e2f4a601bd"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "reaction", sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0")
    )
    # Preserve the currently displayed order, including deleted reactions, during upgrade.
    op.execute("""
        UPDATE reaction r SET sort_order = ordered.position
        FROM (SELECT id, row_number() OVER (
            PARTITION BY experiment_id ORDER BY created_at, id
        ) AS position FROM reaction) ordered WHERE r.id = ordered.id
    """)
    op.create_check_constraint("reaction_order_nonnegative", "reaction", "sort_order >= 0")


def downgrade() -> None:
    op.drop_constraint("reaction_order_nonnegative", "reaction", type_="check")
    op.drop_column("reaction", "sort_order")
