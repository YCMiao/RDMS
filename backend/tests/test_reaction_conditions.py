"""Condition representations, copy/summary and lossless migration on isolated PostgreSQL."""

import importlib.util
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.exc import IntegrityError

from alembic.migration import MigrationContext
from alembic.operations import Operations
from app.core.config import get_settings


def test_condition_modes_persist_switch_and_copy(client: TestClient) -> None:
    exp_response = client.post(
        "/api/experiments", json={"title": "condition modes", "date": "2026-10-10"}
    )
    assert exp_response.status_code == 201
    exp = exp_response.json()
    response = client.post(
        f"/api/experiments/{exp['id']}/reactions",
        json={
            "reaction_name": "conditions",
            "temperature_c": "-10.12345678",
            "reaction_time_hours": "8",
        },
    )
    assert response.status_code == 201, response.text
    row = response.json()
    url = f"/api/reactions/{row['id']}"
    assert row["temperature_c"] == "-10.12345678"
    assert row["temperature_description"] is None and row["reaction_time_minutes"] is None

    def patch(body: dict) -> dict:
        nonlocal row
        result = client.patch(url, json={"expected_version": row["version"], **body})
        assert result.status_code == 200, result.text
        row = result.json()
        assert client.get(url).json() == row
        return row

    patch({"temperature_description": " 室温 ", "reaction_time_minutes": "30.12345678"})
    assert row["temperature_c"] is None and row["temperature_description"] == "室温"
    assert row["reaction_time_hours"] is None and row["reaction_time_minutes"] == "30.12345678"
    patch({"workup": "萃取"})
    assert (
        row["temperature_description"] == "室温" and row["reaction_time_minutes"] == "30.12345678"
    )
    summary = client.get(f"/api/experiments/{exp['id']}/summary", params={"format": "markdown"})
    assert summary.status_code == 200
    assert "温度：室温" in summary.text and "时间：30.12 min" in summary.text

    copied = client.post(
        f"/api/experiments/{exp['id']}/copy",
        json={"expected_version": exp["version"], "title": "minute copy", "date": "2026-10-10"},
    )
    assert copied.status_code == 201, copied.text
    copy_row = client.get(f"/api/experiments/{copied.json()['id']}/reactions").json()["items"][0]
    for key in (
        "temperature_c",
        "temperature_description",
        "reaction_time_hours",
        "reaction_time_minutes",
        "reaction_time_description",
    ):
        assert copy_row[key] == row[key]

    patch({"reaction_time_description": "过夜"})
    assert row["reaction_time_minutes"] is None and row["reaction_time_hours"] is None
    summary = client.get(f"/api/experiments/{exp['id']}/summary", params={"format": "markdown"})
    assert "温度：室温；时间：过夜" in summary.text
    copied = client.post(
        f"/api/experiments/{exp['id']}/copy",
        json={
            "expected_version": exp["version"],
            "title": "description copy",
            "date": "2026-10-10",
        },
    )
    assert copied.status_code == 201, copied.text
    copy_row = client.get(f"/api/experiments/{copied.json()['id']}/reactions").json()["items"][0]
    assert (
        copy_row["temperature_description"] == "室温"
        and copy_row["reaction_time_description"] == "过夜"
    )

    for invalid in (
        {"reaction_time_minutes": "-1"},
        {"reaction_time_minutes": 30},
        {"reaction_time_minutes": "0.123456789"},
        {"temperature_c": "25", "temperature_description": "回流"},
        {"reaction_time_hours": "8", "reaction_time_minutes": "30"},
        {"reaction_time_description": "x" * 301},
    ):
        assert (
            client.patch(url, json={"expected_version": row["version"], **invalid}).status_code
            == 422
        )
        assert client.get(url).json() == row
    # Legacy Celsius/hours writes select numeric mode and clear previous descriptions.
    patch({"temperature_c": "0", "reaction_time_hours": "1.23456789"})
    assert row["temperature_description"] is None and row["reaction_time_description"] is None
    assert row["reaction_time_minutes"] is None and row["reaction_time_hours"] == "1.23456789"
    assert (
        client.patch(
            url, json={"expected_version": row["version"] - 1, "temperature_description": "覆盖"}
        ).status_code
        == 409
    )
    patch(
        {
            "temperature_c": None,
            "temperature_description": None,
            "reaction_time_hours": None,
            "reaction_time_minutes": None,
            "reaction_time_description": None,
        }
    )
    assert all(
        row[key] is None
        for key in (
            "temperature_c",
            "temperature_description",
            "reaction_time_hours",
            "reaction_time_minutes",
            "reaction_time_description",
        )
    )


def test_condition_migration_preserves_legacy_values_and_guards_downgrade() -> None:
    engine = create_engine(get_settings().database_url)
    path = Path("alembic/versions/c9e2f4a601bd_reaction_condition_descriptions.py")
    spec = importlib.util.spec_from_file_location("conditions_migration", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    with engine.connect() as connection, connection.begin() as transaction:
        connection.execute(
            text("""
            CREATE TEMP TABLE reaction (
                id integer PRIMARY KEY, temperature_c numeric(20,8),
                reaction_time_hours numeric(20,8), version integer, deleted_at timestamptz
            )
        """)
        )
        connection.execute(
            text(
                "INSERT INTO reaction VALUES (1, -10.12345678, 8.12345678, 7, "
                "NULL), (2, 0, 0, 3, now())"
            )
        )
        before = connection.execute(text("SELECT * FROM reaction ORDER BY id")).all()
        with Operations.context(MigrationContext.configure(connection)):
            module.upgrade()
        assert (
            connection.execute(
                text(
                    "SELECT id, temperature_c, reaction_time_hours, version, "
                    "deleted_at FROM reaction ORDER BY id"
                )
            ).all()
            == before
        )
        assert connection.execute(
            text(
                "SELECT temperature_description, reaction_time_minutes, "
                "reaction_time_description FROM reaction"
            )
        ).all() == [(None, None, None), (None, None, None)]
        with pytest.raises(IntegrityError), connection.begin_nested():
            connection.execute(
                text("UPDATE reaction SET temperature_description = '室温' WHERE id = 1")
            )
        for values in (
            "reaction_time_minutes = -1",
            "reaction_time_minutes = 30",
        ):
            with pytest.raises(IntegrityError), connection.begin_nested():
                connection.execute(text(f"UPDATE reaction SET {values} WHERE id = 1"))
        connection.execute(
            text(
                "UPDATE reaction SET temperature_c = NULL, "
                "temperature_description = '室温' WHERE id = 1"
            )
        )
        with (
            Operations.context(MigrationContext.configure(connection)),
            pytest.raises(RuntimeError, match="不能无损降级"),
        ):
            module.downgrade()
        assert (
            connection.execute(
                text("SELECT temperature_description FROM reaction WHERE id = 1")
            ).scalar()
            == "室温"
        )
        connection.execute(
            text(
                "UPDATE reaction SET temperature_c = -10.12345678, "
                "temperature_description = NULL WHERE id = 1"
            )
        )
        with Operations.context(MigrationContext.configure(connection)):
            module.downgrade()
        assert connection.execute(text("SELECT * FROM reaction ORDER BY id")).all() == before
        transaction.rollback()
    engine.dispose()
