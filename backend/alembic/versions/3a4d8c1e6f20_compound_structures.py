"""Store chemical structures, identifiers, and sourced properties.

Revision ID: 3a4d8c1e6f20
Revises: 9dd700ef716a
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from alembic import op

revision: str = "3a4d8c1e6f20"
down_revision: str | None = "9dd700ef716a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("compound", sa.Column("structure_molfile", sa.Text(), nullable=True))
    op.add_column("compound", sa.Column("inchi_key", sa.String(27), nullable=True))
    op.add_column("compound", sa.Column("exact_mass", sa.Numeric(20, 8), nullable=True))
    op.add_column("compound", sa.Column("cas_number", sa.String(32), nullable=True))
    op.add_column("compound", sa.Column("cas_source", sa.String(100), nullable=True))
    op.add_column(
        "compound",
        sa.Column(
            "physical_properties",
            JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    op.create_index("ix_compound_inchi_key", "compound", ["inchi_key"], unique=False)
    op.create_index("ix_compound_cas_number", "compound", ["cas_number"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_compound_cas_number", table_name="compound")
    op.drop_index("ix_compound_inchi_key", table_name="compound")
    op.drop_column("compound", "physical_properties")
    op.drop_column("compound", "cas_source")
    op.drop_column("compound", "cas_number")
    op.drop_column("compound", "exact_mass")
    op.drop_column("compound", "inchi_key")
    op.drop_column("compound", "structure_molfile")
