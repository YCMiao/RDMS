"""Add workup and purification to reactions.

Revision ID: 6b4f2c9e1d07
Revises: 3a4d8c1e6f20
"""

import sqlalchemy as sa

from alembic import op

revision: str = "6b4f2c9e1d07"
down_revision: str | None = "3a4d8c1e6f20"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("reaction", sa.Column("workup", sa.Text(), nullable=True))
    op.add_column("reaction", sa.Column("purification", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("reaction", "purification")
    op.drop_column("reaction", "workup")
