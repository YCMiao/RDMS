"""Add unified experiment notes without changing legacy fields."""

import sqlalchemy as sa

from alembic import op

revision: str = "f6c9e1a403db"
down_revision: str | None = "e5b8d0f302ca"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("experiment", sa.Column("notes", sa.Text(), nullable=True))


def downgrade() -> None:
    connection = op.get_bind()
    if connection.execute(
        sa.text("SELECT EXISTS (SELECT 1 FROM experiment WHERE notes IS NOT NULL)")
    ).scalar():
        raise RuntimeError(
            "Experiment notes exist; restore a verified backup into an isolated target instead."
        )
    op.drop_column("experiment", "notes")
