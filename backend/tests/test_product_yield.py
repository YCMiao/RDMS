"""Explicit limiting reactants, decimal yield and preservation on isolated PostgreSQL."""

import importlib.util
from decimal import Decimal
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.exc import IntegrityError

from alembic.migration import MigrationContext
from alembic.operations import Operations
from app.core.config import get_settings


def post(client: TestClient, path: str, body: dict) -> dict:
    response = client.post(path, json=body)
    assert response.status_code == 201, response.text
    return response.json()


def setup(client: TestClient) -> tuple[dict, dict, dict, str]:
    exp = post(client, "/api/experiments", {"title": "收率验证", "date": "2026-10-10"})
    reaction = post(client, f"/api/experiments/{exp['id']}/reactions", {"reaction_name": "合成"})
    source = post(client, "/api/compounds", {"name": "底物", "molecular_weight": "100"})
    target = post(client, "/api/compounds", {"name": "产物", "molecular_weight": "300"})
    return exp, source, target, f"/api/reactions/{reaction['id']}/components"


def test_decimal_yield_units_ratio_and_manual_preservation(client: TestClient) -> None:
    _, source, target, path = setup(client)
    limiting = post(
        client,
        path,
        {
            "compound_id": source["id"],
            "role": "substrate",
            "is_limiting": True,
            "mmol": "2",
            "equivalents": "5",
        },
    )
    assert limiting["equivalents"] == "1.00000000"
    product = post(
        client,
        path,
        {
            "compound_id": target["id"],
            "role": "product",
            "amount": "960",
            "unit": "mg",
            "stoichiometric_ratio": "2",
            "calculate_yield": True,
            "yield_percent": "999",
        },
    )
    assert product["yield_percent"] == "80.00000000"
    product = client.patch(
        f"{path}/{product['id']}",
        json={
            "expected_version": product["version"],
            "amount": "1.44",
            "unit": "g",
            "calculate_yield": True,
        },
    ).json()
    assert product["yield_percent"] == "120.00000000"
    zero = client.patch(
        f"{path}/{product['id']}",
        json={"expected_version": product["version"], "amount": "0", "calculate_yield": True},
    ).json()
    assert Decimal(zero["yield_percent"]) == 0
    manual = client.patch(
        f"{path}/{product['id']}",
        json={"expected_version": zero["version"], "yield_percent": "57.12345678"},
    ).json()
    assert manual["yield_percent"] == "57.12345678"
    assert (
        client.patch(
            f"{path}/{limiting['id']}", json={"expected_version": limiting["version"], "mmol": "3"}
        ).status_code
        == 200
    )
    unchanged = client.patch(
        f"{path}/{product['id']}",
        json={"expected_version": manual["version"], "notes": "仅编辑备注"},
    ).json()
    assert unchanged["yield_percent"] == "57.12345678"
    assert (
        client.patch(
            f"{path}/{product['id']}",
            json={"expected_version": manual["version"], "calculate_yield": True},
        ).status_code
        == 409
    )


def test_limiting_uniqueness_restore_and_copy(client: TestClient) -> None:
    exp, source, target, path = setup(client)
    one = post(
        client,
        path,
        {"compound_id": source["id"], "role": "substrate", "is_limiting": True, "mmol": "1"},
    )
    two = post(client, path, {"compound_id": target["id"], "role": "reagent", "mmol": "2"})
    assert (
        client.post(
            path, json={"compound_id": target["id"], "role": "reagent", "is_limiting": True}
        ).status_code
        == 409
    )
    assert (
        client.patch(
            f"{path}/{two['id']}", json={"expected_version": two["version"], "is_limiting": True}
        ).status_code
        == 409
    )
    assert (
        client.patch(
            f"{path}/{one['id']}", json={"expected_version": one["version"], "equivalents": "9"}
        ).json()["equivalents"]
        == "1.00000000"
    )
    one = next(row for row in client.get(path).json()["items"] if row["id"] == one["id"])
    assert client.delete(f"{path}/{one['id']}?expected_version={one['version']}").status_code == 204
    assert (
        client.patch(
            f"{path}/{two['id']}", json={"expected_version": two["version"], "is_limiting": True}
        ).status_code
        == 200
    )
    assert (
        client.post(
            f"{path}/{one['id']}/restore", json={"expected_version": one["version"] + 1}
        ).status_code
        == 409
    )
    trash = client.get("/api/trash?type=component").json()
    assert (
        next(item for item in trash["items"] if item["id"] == one["id"])["restore_block_reason"]
        == "已有一个限制反应物，请先取消原来的勾选"
    )
    copied = post(
        client,
        f"/api/experiments/{exp['id']}/copy",
        {"expected_version": exp["version"], "title": "收率副本", "date": "2026-10-10"},
    )
    reaction = client.get(f"/api/experiments/{copied['id']}/reactions").json()["items"][0]
    rows = client.get(f"/api/reactions/{reaction['id']}/components").json()["items"]
    assert len(rows) == 1 and rows[0]["is_limiting"] and rows[0]["equivalents"] == "1.00000000"
    summary = client.get(f"/api/experiments/{copied['id']}/summary?format=markdown").text
    assert "限制反应物" in summary


def test_mass_basis_and_missing_inputs_do_not_write(client: TestClient) -> None:
    _, source, target, path = setup(client)
    payload = {
        "compound_id": target["id"],
        "role": "product",
        "amount": "240",
        "unit": "mg",
        "calculate_yield": True,
    }
    assert client.post(path, json=payload).status_code == 422
    limiting = post(
        client,
        path,
        {
            "compound_id": source["id"],
            "role": "substrate",
            "is_limiting": True,
            "amount": "100",
            "unit": "mg",
        },
    )
    product = post(client, path, payload)
    assert (
        product["stoichiometric_ratio"] == "1.00000000"
        and product["yield_percent"] == "80.00000000"
    )
    for changes in (
        {"stoichiometric_ratio": "0"},
        {"stoichiometric_ratio": "-1"},
        {"unit": "mL"},
        {"is_limiting": True},
    ):
        assert client.post(path, json={**payload, **changes}).status_code == 422
    unknown = post(client, "/api/compounds", {"name": "未知分子量"})
    assert client.post(path, json={**payload, "compound_id": unknown["id"]}).status_code == 422
    assert (
        client.patch(
            f"{path}/{limiting['id']}", json={"expected_version": limiting["version"], "mmol": "0"}
        ).status_code
        == 200
    )
    assert client.post(path, json=payload).status_code == 422
    assert client.get(path).json()["total"] == 2


def test_yield_migration_preserves_old_rows_and_guards_downgrade() -> None:
    engine = create_engine(get_settings().database_url)
    spec = importlib.util.spec_from_file_location(
        "yield_migration", Path("alembic/versions/e5b8d0f302ca_limiting_reactant_yield.py")
    )
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    with engine.connect() as connection, connection.begin() as transaction:
        connection.execute(
            text(
                "CREATE TEMP TABLE reaction_component (id integer PRIMARY KEY, "
                "reaction_id integer, role text, equivalents numeric(20,8), "
                "yield_percent numeric(20,8), version integer, created_at timestamptz, "
                "updated_at timestamptz, deleted_at timestamptz)"
            )
        )
        connection.execute(
            text(
                "INSERT INTO reaction_component VALUES "
                "(1,1,'substrate',2,NULL,4,now(),now(),NULL), "
                "(2,1,'product',NULL,57.12345678,3,now(),now(),NULL), "
                "(3,1,'substrate',NULL,NULL,2,now(),now(),now())"
            )
        )
        columns = (
            "id, reaction_id, role, equivalents, yield_percent, version, "
            "created_at, updated_at, deleted_at"
        )
        before = connection.execute(
            text(f"SELECT {columns} FROM reaction_component ORDER BY id")
        ).all()
        with Operations.context(MigrationContext.configure(connection)):
            module.upgrade()
        assert (
            connection.execute(text(f"SELECT {columns} FROM reaction_component ORDER BY id")).all()
            == before
        )
        assert (
            connection.execute(
                text("SELECT is_limiting, stoichiometric_ratio FROM reaction_component")
            ).all()
            == [(False, None)] * 3
        )
        with pytest.raises(IntegrityError), connection.begin_nested():
            connection.execute(text("UPDATE reaction_component SET is_limiting=true WHERE id=1"))
        connection.execute(
            text("UPDATE reaction_component SET is_limiting=true, equivalents=1 WHERE id=1")
        )
        with pytest.raises(IntegrityError), connection.begin_nested():
            connection.execute(
                text(
                    "INSERT INTO reaction_component "
                    "(id,reaction_id,role,equivalents,is_limiting) "
                    "VALUES (4,1,'reagent',1,true)"
                )
            )
        with (
            Operations.context(MigrationContext.configure(connection)),
            pytest.raises(RuntimeError),
        ):
            module.downgrade()
        connection.execute(
            text("UPDATE reaction_component SET is_limiting=false, equivalents=2 WHERE id=1")
        )
        with Operations.context(MigrationContext.configure(connection)):
            module.downgrade()
        assert (
            connection.execute(text("SELECT * FROM reaction_component ORDER BY id")).all() == before
        )
        transaction.rollback()
    engine.dispose()


def test_concurrent_limiting_selection_serializes(client: TestClient) -> None:
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier

    _, source, target, path = setup(client)
    barrier = Barrier(2)

    def select_limiting(compound_id: str) -> int:
        barrier.wait()
        return client.post(
            path,
            json={
                "compound_id": compound_id,
                "role": "substrate",
                "is_limiting": True,
                "mmol": "1",
            },
        ).status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(select_limiting, item["id"]) for item in (source, target)]
        assert sorted(future.result() for future in futures) == [201, 409]
    assert client.get(path).json()["total"] == 1
