"""Create the stage 01 baseline revision.

Revision ID: 0001_baseline
Revises:
Create Date: 2026-09-22
"""

from collections.abc import Sequence

revision: str = "0001_baseline"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Reserve an explicit migration baseline before business tables exist."""


def downgrade() -> None:
    """The empty baseline has nothing to remove."""
