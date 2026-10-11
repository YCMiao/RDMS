"""Group active experiments into numbered lab notebooks; discard old identifiers."""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "b8e1f3c605ad"
down_revision = "a7d0f2b504ec"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE SEQUENCE notebook_code_seq START WITH 2")
    op.create_table(
        "notebook",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("code", sa.String(32), nullable=False, unique=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.String(1000)),
        sa.Column("archived", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("next_number", sa.BigInteger(), nullable=False, server_default="1"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.CheckConstraint("length(btrim(name)) > 0", name="name_nonempty"),
        sa.CheckConstraint("next_number > 0", name="next_positive"),
        sa.CheckConstraint("version > 0", name="version_positive"),
    )
    op.execute(
        "INSERT INTO notebook (id, code, name) VALUES "
        "('00000000-0000-4000-8000-000000000001', 'NB001', '已有实验')"
    )
    op.add_column("experiment", sa.Column("notebook_id", postgresql.UUID(as_uuid=True)))
    op.add_column("experiment", sa.Column("notebook_number", sa.BigInteger()))
    op.create_foreign_key(
        "fk_experiment_notebook", "experiment", "notebook", ["notebook_id"], ["id"]
    )
    op.create_index("ix_experiment_notebook_id", "experiment", ["notebook_id"])
    op.alter_column("experiment", "experiment_code", nullable=True)
    op.execute("""
        WITH ordered AS (
            SELECT id, row_number() OVER (
                ORDER BY split_part(experiment_code, '-', 2)::bigint,
                         split_part(experiment_code, '-', 3)::bigint, created_at, id
            ) AS n FROM experiment WHERE deleted_at IS NULL
        ) UPDATE experiment e SET notebook_id = '00000000-0000-4000-8000-000000000001',
            notebook_number = ordered.n,
            experiment_code = 'NB001-' ||
                lpad(ordered.n::text, greatest(4, length(ordered.n::text)), '0')
          FROM ordered WHERE e.id = ordered.id
    """)
    op.execute("UPDATE experiment SET experiment_code = NULL WHERE deleted_at IS NOT NULL")
    op.execute(
        "UPDATE notebook SET next_number = (SELECT count(*) + 1 FROM experiment "
        "WHERE deleted_at IS NULL) WHERE code = 'NB001'"
    )
    op.create_unique_constraint(
        "uq_experiment_notebook_number", "experiment", ["notebook_id", "notebook_number"]
    )
    op.create_check_constraint(
        "notebook_pair",
        "experiment",
        "(notebook_id IS NULL AND notebook_number IS NULL) OR "
        "(notebook_id IS NOT NULL AND notebook_number IS NOT NULL AND notebook_number > 0)",
    )
    op.create_check_constraint(
        "active_notebook",
        "experiment",
        "deleted_at IS NOT NULL OR (notebook_id IS NOT NULL AND experiment_code IS NOT NULL)",
    )


def downgrade() -> None:
    raise RuntimeError("旧实验编号已按授权移除；回退请从迁移前备份隔离恢复。")
