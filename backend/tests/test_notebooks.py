"""Notebook migration, allocation, transfers, archive guards and restore membership."""

import importlib.util
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from alembic.migration import MigrationContext
from alembic.operations import Operations
from app.core.config import get_settings
from app.models import Notebook


def notebook(client: TestClient, name: str) -> dict:
    response = client.post("/api/notebooks", json={"name": name})
    assert response.status_code == 201, response.text
    return response.json()


def experiment(client: TestClient, book: dict, title: str = "本内实验") -> dict:
    response = client.post(
        "/api/experiments", json={"title": title, "date": "2026-10-11", "notebook_id": book["id"]}
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_notebook_numbering_transfer_preview_restore_and_archive(client: TestClient) -> None:
    first, second = notebook(client, "第一本"), notebook(client, "第二本")
    original = experiment(client, first)
    assert original["experiment_code"] == f"{first['code']}-0001"
    other = experiment(client, second)
    assert other["notebook_number"] == 1
    reaction = client.post(
        f"/api/experiments/{original['id']}/reactions",
        json={"reaction_name": "保留反应", "temperature_k": "298.15"},
    ).json()
    transfer = {
        "notebook_id": second["id"],
        "experiments": [{"id": original["id"], "expected_version": original["version"]}],
    }
    preview = client.post("/api/experiments/transfer-preview", json=transfer).json()
    assert preview["items"][0]["experiment_code"] == f"{second['code']}-0002"
    # Concurrent allocation invalidates the preview instead of silently using a different number.
    experiment(client, second)
    rejected = client.post(
        "/api/experiments/transfer",
        json={**transfer, "expected_next_number": preview["next_number"]},
    )
    assert rejected.status_code == 409
    assert client.get(f"/api/experiments/{original['id']}").json() == original
    moved = client.post("/api/experiments/transfer", json=transfer)
    assert moved.status_code == 200, moved.text
    row = moved.json()[0]
    assert row["notebook_number"] == 3 and row["id"] == original["id"]
    assert client.get(f"/api/reactions/{reaction['id']}").json() == reaction
    assert client.get(f"/api/notebooks/{first['id']}").json()["experiment_count"] == 0
    assert client.get(f"/api/experiments?notebook_id={first['id']}").json()["total"] == 0
    assert client.get(f"/api/experiments?q={original['experiment_code']}").json()["total"] == 0
    assert (
        client.delete(f"/api/experiments/{row['id']}?expected_version={row['version']}").status_code
        == 204
    )
    restored = client.post(
        f"/api/experiments/{row['id']}/restore",
        json={"expected_version": row["version"] + 1, "notebook_id": first["id"]},
    )
    assert restored.status_code == 200, restored.text
    assert restored.json()["experiment_code"] == f"{first['code']}-0002"
    archived = client.patch(
        f"/api/notebooks/{first['id']}",
        json={"expected_version": first["version"], "name": "改名", "archived": True},
    ).json()
    assert archived["code"] == first["code"] and archived["experiment_count"] == 1
    assert (
        client.post(
            "/api/experiments",
            json={"title": "拒绝", "date": "2026-10-11", "notebook_id": first["id"]},
        ).status_code
        == 409
    )
    assert (
        client.post(
            f"/api/experiments/{restored.json()['id']}/copy",
            json={
                "title": "拒绝复制",
                "date": "2026-10-11",
                "expected_version": restored.json()["version"],
            },
        ).status_code
        == 409
    )
    copied = client.post(
        f"/api/experiments/{restored.json()['id']}/copy",
        json={
            "title": "跨本副本",
            "date": "2026-10-11",
            "expected_version": restored.json()["version"],
            "notebook_id": second["id"],
        },
    )
    assert copied.status_code == 201, copied.text
    assert copied.json()["notebook_number"] == 4
    assert (
        client.patch(
            f"/api/notebooks/{first['id']}",
            json={"expected_version": first["version"], "name": "过期"},
        ).status_code
        == 409
    )


def test_batch_transfer_conflict_rolls_back_memberships_and_counter(client: TestClient) -> None:
    source, target = notebook(client, "批量原本"), notebook(client, "批量目标")
    rows = [experiment(client, source) for _ in range(2)]
    response = client.post(
        "/api/experiments/transfer",
        json={
            "notebook_id": target["id"],
            "experiments": [
                {"id": row["id"], "expected_version": row["version"] + index}
                for index, row in enumerate(rows)
            ],
        },
    )
    assert response.status_code == 409
    for row in rows:
        assert client.get(f"/api/experiments/{row['id']}").json() == row
    assert experiment(client, target)["notebook_number"] == 1
    response = client.post(
        "/api/experiments/transfer",
        json={
            "notebook_id": target["id"],
            "experiments": [
                {"id": row["id"], "expected_version": row["version"]} for row in rows[::-1]
            ],
        },
    )
    assert response.status_code == 200
    assert [row["id"] for row in response.json()] == [row["id"] for row in rows]
    assert [row["notebook_number"] for row in response.json()] == [2, 3]


def test_notebook_concurrent_numbers_cross_year_and_large_width(client: TestClient) -> None:
    book = notebook(client, "并发本")
    with ThreadPoolExecutor(max_workers=16) as pool:
        rows = list(pool.map(lambda index: experiment(client, book, f"并发-{index}"), range(32)))
    assert sorted(row["notebook_number"] for row in rows) == list(range(1, 33))
    engine = create_engine(get_settings().database_url)
    with Session(engine) as session:
        stored = session.get(Notebook, UUID(book["id"]))
        assert stored is not None
        stored.next_number = 10000
        session.commit()
    assert experiment(client, book)["experiment_code"] == f"{book['code']}-10000"
    response = client.post(
        "/api/experiments", json={"title": "跨年", "date": "2027-01-01", "notebook_id": book["id"]}
    )
    assert response.json()["experiment_code"] == f"{book['code']}-10001"
    engine.dispose()


def test_notebook_migration_excludes_trash_and_preserves_content() -> None:
    engine = create_engine(get_settings().database_url)
    path = Path("alembic/versions/b8e1f3c605ad_lab_notebooks.py")
    spec = importlib.util.spec_from_file_location("notebook_migration", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    schema = f"notebook_test_{uuid4().hex}"
    with engine.connect() as connection, connection.begin() as transaction:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
        connection.execute(text(f'SET LOCAL search_path TO "{schema}"'))
        connection.execute(
            text(
                "CREATE TABLE experiment (id uuid PRIMARY KEY, experiment_code "
                "varchar(32) NOT NULL UNIQUE, title text, created_at timestamptz "
                "DEFAULT now(), updated_at timestamptz DEFAULT now(), version integer, "
                "deleted_at timestamptz)"
            )
        )
        for index, code in enumerate(
            ["EXP-2026-10000", "EXP-2025-0010", "EXP-2026-9999", "EXP-2024-0001"]
        ):
            connection.execute(
                text(
                    "INSERT INTO experiment (id, experiment_code, title, version, "
                    "deleted_at) VALUES (:id, :code, :title, :version, CASE WHEN :deleted "
                    "THEN now() ELSE NULL END)"
                ),
                {
                    "id": uuid4(),
                    "code": code,
                    "title": f"内容{index}",
                    "version": index + 2,
                    "deleted": index == 3,
                },
            )
        before = connection.execute(
            text(
                "SELECT id, title, version, created_at, updated_at, deleted_at FROM "
                "experiment ORDER BY id"
            )
        ).all()
        with Operations.context(MigrationContext.configure(connection)):
            module.upgrade()
        assert (
            connection.execute(
                text(
                    "SELECT id, title, version, created_at, updated_at, deleted_at FROM "
                    "experiment ORDER BY id"
                )
            ).all()
            == before
        )
        rows = connection.execute(
            text(
                "SELECT title, experiment_code, notebook_number FROM experiment WHERE "
                "deleted_at IS NULL ORDER BY notebook_number"
            )
        ).all()
        assert rows == [
            ("内容1", "NB001-0001", 1),
            ("内容2", "NB001-0002", 2),
            ("内容0", "NB001-0003", 3),
        ]
        assert connection.execute(
            text(
                "SELECT notebook_id, notebook_number, experiment_code FROM experiment "
                "WHERE deleted_at IS NOT NULL"
            )
        ).one() == (None, None, None)
        assert connection.scalar(text("SELECT next_number FROM notebook")) == 4
        with (
            Operations.context(MigrationContext.configure(connection)),
            pytest.raises(RuntimeError),
        ):
            module.downgrade()
        transaction.rollback()
    engine.dispose()
