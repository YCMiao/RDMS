"""Accounts, revocable sessions and database-enforced private data."""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "7d3a1b9c602e"
down_revision = "b8e1f3c605ad"
branch_labels = None
depends_on = None

OWNED = (
    "notebook",
    "experiment",
    "compound",
    "sample",
    "reaction",
    "reaction_component",
    "file_asset",
    "tag",
)
LINKS = {
    "experiment_compound": "EXISTS (SELECT 1 FROM experiment WHERE id = "
    "experiment_id) AND EXISTS (SELECT 1 FROM compound WHERE id = "
    "compound_id)",
    "experiment_tag": "EXISTS (SELECT 1 FROM experiment WHERE id = "
    "experiment_id) AND EXISTS (SELECT 1 FROM tag WHERE id = tag_id)",
    "compound_tag": "EXISTS (SELECT 1 FROM compound WHERE id = "
    "compound_id) AND EXISTS (SELECT 1 FROM tag WHERE id = tag_id)",
}


def upgrade() -> None:
    op.create_table(
        "account",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("username", sa.String(40), nullable=False, unique=True),
        sa.Column("display_name", sa.String(80), nullable=False),
        sa.Column("password_hash", sa.String(256), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )
    op.create_table(
        "login_session",
        sa.Column("token_hash", sa.String(64), primary_key=True),
        sa.Column(
            "account_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("account.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False, index=True),
    )
    op.create_table(
        "auth_rate",
        sa.Column("key", sa.String(64), primary_key=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
    )
    for table in OWNED:
        op.add_column(
            table,
            sa.Column(
                "owner_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("account.id"),
                nullable=True,
                server_default=sa.text(
                    "nullif(current_setting('rdms.account_id', true), '')::uuid"
                ),
            ),
        )
        op.create_index(f"ix_{table}_owner", table, ["owner_id"])
    op.drop_constraint("tag_normalized_name_key", "tag", type_="unique")
    op.create_unique_constraint("uq_tag_owner_name", "tag", ["owner_id", "normalized_name"])
    op.execute(
        "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = "
        "'rdms_member') THEN CREATE ROLE rdms_member NOLOGIN NOSUPERUSER "
        "NOBYPASSRLS; END IF; END $$"
    )
    op.execute("GRANT rdms_member TO CURRENT_USER")
    op.execute("GRANT USAGE ON SCHEMA public TO rdms_member")
    for table in (*OWNED, *LINKS, "number_counter"):
        op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON {table} TO rdms_member")
    op.execute("GRANT USAGE, SELECT ON SEQUENCE notebook_code_seq TO rdms_member")
    references = {
        "experiment": "notebook_id IS NULL OR EXISTS (SELECT 1 FROM "
        "notebook WHERE id = notebook_id)",
        "sample": "EXISTS (SELECT 1 FROM experiment WHERE id = "
        "experiment_id) AND (compound_id IS NULL OR EXISTS (SELECT 1 FROM "
        "compound WHERE id = compound_id))",
        "reaction": "EXISTS (SELECT 1 FROM experiment WHERE id = experiment_id)",
        "reaction_component": "EXISTS (SELECT 1 FROM reaction WHERE id = "
        "reaction_id) AND EXISTS (SELECT 1 FROM compound WHERE id = "
        "compound_id)",
        "file_asset": "EXISTS (SELECT 1 FROM experiment WHERE id = "
        "experiment_id) AND (sample_id IS NULL OR EXISTS (SELECT 1 FROM "
        "sample WHERE id = sample_id))",
    }
    for table in (*OWNED, *LINKS):
        predicate = (
            "owner_id = nullif(current_setting('rdms.account_id', true), '')::uuid"
            if table in OWNED
            else LINKS[table]
        )
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        check = f"({predicate}) AND ({references[table]})" if table in references else predicate
        op.execute(
            f"CREATE POLICY private_records ON {table} TO rdms_member USING ({predicate})"
            f" WITH CHECK ({check})"
        )


def downgrade() -> None:
    if op.get_bind().scalar(sa.text("SELECT EXISTS (SELECT 1 FROM account)")):
        raise RuntimeError("Accounts exist; restore a pre-auth backup in isolation instead.")
    for table in (*OWNED, *LINKS):
        op.execute(f"DROP POLICY private_records ON {table}")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")
    op.drop_constraint("uq_tag_owner_name", "tag", type_="unique")
    op.create_unique_constraint("tag_normalized_name_key", "tag", ["normalized_name"])
    for table in OWNED:
        op.drop_index(f"ix_{table}_owner", table_name=table)
        op.drop_column(table, "owner_id")
    op.drop_table("auth_rate")
    op.drop_table("login_session")
    op.drop_table("account")
