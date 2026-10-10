"""Identity migration and API contract, using isolated PostgreSQL only."""

import importlib.util
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

from alembic.migration import MigrationContext
from alembic.operations import Operations
from app.core.config import get_settings


def test_identity_migration_preserves_labels_and_references() -> None:
    engine = create_engine(get_settings().database_url)
    path = Path("alembic/versions/b7e1a9302c64_compound_identity.py")
    spec = importlib.util.spec_from_file_location("identity_migration", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    with engine.connect() as connection, connection.begin() as transaction:
        # Temporary tables shadow live test tables; rollback also removes the DDL.
        connection.execute(
            text("""
            CREATE TEMP TABLE compound (
                id integer PRIMARY KEY, compound_code varchar(32) NOT NULL UNIQUE,
                name varchar(300) NOT NULL, iupac_name varchar(300),
                cas_number varchar(32), notes text, version integer,
                deleted_at timestamptz,
                CONSTRAINT name_nonempty CHECK (length(btrim(name)) > 0)
            )
        """)
        )
        connection.execute(
            text("""
            CREATE TEMP TABLE identity_reference (
                compound_id integer REFERENCES compound(id)
            )
        """)
        )
        connection.execute(
            text("""
            INSERT INTO compound VALUES
            (1, 'CMP-000001', 'EtOH', 'ethanol', '64-17-5', '原备注', 7, NULL),
            (2, 'CMP-000002', '未知中间体', NULL, NULL, NULL, 3, now())
        """)
        )
        connection.execute(text("INSERT INTO identity_reference VALUES (1), (2)"))
        before = connection.execute(
            text("SELECT id, cas_number, notes, version, deleted_at FROM compound ORDER BY id")
        ).all()
        with Operations.context(MigrationContext.configure(connection)):
            module.upgrade()
        assert (
            connection.execute(
                text("SELECT id, cas_number, notes, version, deleted_at FROM compound ORDER BY id")
            ).all()
            == before
        )
        assert connection.execute(
            text("SELECT legacy_compound_code, codename, name FROM compound ORDER BY id")
        ).all() == [("CMP-000001", "EtOH", "ethanol"), ("CMP-000002", "未知中间体", None)]
        assert connection.execute(text("SELECT count(*) FROM identity_reference")).scalar() == 2
        with Operations.context(MigrationContext.configure(connection)):
            module.downgrade()
        assert connection.execute(
            text("SELECT name FROM compound ORDER BY id")
        ).scalars().all() == ["EtOH", "未知中间体"]
        transaction.rollback()
    engine.dispose()


def test_cas_identity_and_codename_search(client: TestClient) -> None:
    response = client.post(
        "/api/compounds",
        json={"name": "biphenyl", "codename": "identity-BP", "cas_number": "92-52-4"},
    )
    assert response.status_code == 201, response.text
    compound = response.json()
    assert compound["name"] == "biphenyl"
    assert compound["codename"] == "identity-BP"
    assert "compound_code" not in compound
    assert "legacy_compound_code" not in compound
    for term in ("identity-BP", "92-52-4", "biphenyl"):
        assert compound["id"] in [
            item["id"] for item in client.get("/api/compounds", params={"q": term}).json()["items"]
        ]
        result = client.get("/api/search", params={"q": term}).json()["compounds"]["items"]
        assert compound["id"] in [item["id"] for item in result]
    assert client.post("/api/compounds", json={"codename": "未公开中间体"}).status_code == 201
    assert client.post("/api/compounds", json={"cas_number": "92-52-5"}).status_code == 422
    assert (
        client.patch(
            f"/api/compounds/{compound['id']}",
            json={"expected_version": 1, "cas_number": "92-52-5"},
        ).status_code
        == 422
    )
    assert client.post("/api/compounds", json={}).status_code == 422
