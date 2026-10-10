"""Reaction order upgrade preserves scientific values, timestamps and deleted rows."""

import importlib.util
from pathlib import Path

from sqlalchemy import create_engine, text

from alembic.migration import MigrationContext
from alembic.operations import Operations
from app.core.config import get_settings


def test_order_upgrade_preserves_legacy_order_and_metadata() -> None:
    engine = create_engine(get_settings().database_url)
    spec = importlib.util.spec_from_file_location(
        "order_migration", Path("alembic/versions/d4a7c9e201bf_reaction_order.py")
    )
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    with engine.connect() as connection, connection.begin() as transaction:
        connection.execute(
            text("""
            CREATE TEMP TABLE reaction (
                id integer PRIMARY KEY, experiment_id integer, created_at timestamptz,
                temperature_c numeric(20,8), version integer, deleted_at timestamptz
            )
        """)
        )
        connection.execute(
            text("""
            INSERT INTO reaction VALUES
            (2, 1, '2026-10-10', -10.12345678, 4, NULL),
            (1, 1, '2026-10-10', 25, 3, now()),
            (3, 2, '2026-10-09', 0, 1, NULL)
        """)
        )
        before = connection.execute(text("SELECT * FROM reaction ORDER BY id")).all()
        with Operations.context(MigrationContext.configure(connection)):
            module.upgrade()
        assert connection.execute(
            text("SELECT id, sort_order FROM reaction ORDER BY id")
        ).all() == [(1, 1), (2, 2), (3, 1)]
        assert (
            connection.execute(
                text("""
            SELECT id, experiment_id, created_at, temperature_c, version, deleted_at
            FROM reaction ORDER BY id
        """)
            ).all()
            == before
        )
        with Operations.context(MigrationContext.configure(connection)):
            module.downgrade()
        assert connection.execute(text("SELECT * FROM reaction ORDER BY id")).all() == before
        transaction.rollback()
    engine.dispose()
