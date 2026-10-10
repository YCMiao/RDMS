"""Preserve systematic names separately from user compound labels."""

import sqlalchemy as sa

from alembic import op

revision: str = "8c2d4e6f901a"
down_revision: str | None = "6b4f2c9e1d07"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("compound", sa.Column("iupac_name", sa.String(300), nullable=True))


def downgrade() -> None:
    op.drop_column("compound", "iupac_name")
