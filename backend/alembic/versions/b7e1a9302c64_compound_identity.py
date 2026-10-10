"""Use CAS identity and preserve original names as codenames."""

import sqlalchemy as sa

from alembic import op

revision: str = "b7e1a9302c64"
down_revision: str | None = "8c2d4e6f901a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Renames preserve UUIDs, all references, deleted records and original labels.
    op.drop_constraint("name_nonempty", "compound", type_="check")
    op.alter_column("compound", "name", new_column_name="codename", nullable=True)
    op.alter_column("compound", "iupac_name", new_column_name="name")
    op.alter_column(
        "compound", "compound_code", new_column_name="legacy_compound_code", nullable=True
    )
    op.execute("UPDATE compound SET name = NULLIF(btrim(name), '')")
    op.create_check_constraint("name_nonempty", "compound", "length(btrim(name)) > 0")


def downgrade() -> None:
    # New compounds have no legacy number. Never manufacture one during rollback.
    if op.get_bind().scalar(
        sa.text("SELECT count(*) FROM compound WHERE legacy_compound_code IS NULL")
    ):
        raise RuntimeError("新记录没有旧编号；请使用迁移前备份进行隔离恢复")
    op.drop_constraint("name_nonempty", "compound", type_="check")
    op.alter_column("compound", "name", new_column_name="iupac_name")
    op.alter_column("compound", "codename", new_column_name="name", nullable=False)
    op.alter_column(
        "compound", "legacy_compound_code", new_column_name="compound_code", nullable=False
    )
    op.create_check_constraint("name_nonempty", "compound", "length(btrim(name)) > 0")
