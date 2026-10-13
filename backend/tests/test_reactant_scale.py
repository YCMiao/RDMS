"""Reaction-wide scaling must preserve ratios and commit atomically on PostgreSQL."""

from decimal import Decimal

import pytest
from fastapi.testclient import TestClient


def post(client: TestClient, path: str, body: dict) -> dict:
    response = client.post(path, json=body)
    assert response.status_code == 201, response.text
    return response.json()


def setup(client: TestClient) -> tuple[dict, dict, dict, str]:
    exp = post(client, "/api/experiments", {"title": "投料规模验证", "date": "2026-10-13"})
    reaction = post(client, f"/api/experiments/{exp['id']}/reactions", {"reaction_name": "合成"})
    source = post(client, "/api/compounds", {"name": "底物", "molecular_weight": "100"})
    target = post(client, "/api/compounds", {"name": "试剂", "molecular_weight": "300"})
    return exp, source, target, f"/api/reactions/{reaction['id']}/components"


@pytest.mark.parametrize("limiting", [False, True])
def test_scale_from_excess_reactant_preserves_eq_units_and_products(
    client: TestClient, limiting: bool
) -> None:
    _, source, target, path = setup(client)
    base = post(
        client,
        path,
        {
            "compound_id": source["id"],
            "role": "substrate",
            "is_limiting": limiting,
            "equivalents": "1",
            "mmol": "1",
            "amount": "0.1",
            "unit": "g",
        },
    )
    excess = post(
        client,
        path,
        {
            "compound_id": target["id"],
            "role": "reagent",
            "equivalents": "1.05",
            "mmol": "1.05",
            "amount": "315",
            "unit": "mg",
        },
    )
    liquid = post(
        client,
        path,
        {
            "compound_id": source["id"],
            "role": "base",
            "equivalents": "4",
            "mmol": "4",
            "amount": "0.7",
            "unit": "mL",
        },
    )
    solvent = post(
        client, path, {"compound_id": source["id"], "role": "solvent", "amount": "20", "unit": "mL"}
    )
    product = post(
        client,
        path,
        {
            "compound_id": target["id"],
            "role": "product",
            "amount": "200",
            "unit": "mg",
            "yield_percent": "57.12345678",
        },
    )
    unknown = post(
        client,
        path,
        {"compound_id": source["id"], "role": "additive", "amount": "12", "unit": "mg"},
    )
    snapshot = {row["id"]: row["version"] for row in (base, excess, liquid, unknown)}
    response = client.patch(
        f"{path}/{excess['id']}",
        json={
            "expected_version": excess["version"],
            "mmol": "2.1",
            "amount": "630",
            "rescale_reactants": True,
            "expected_component_versions": snapshot,
        },
    )
    assert response.status_code == 200, response.text
    rows = {row["id"]: row for row in client.get(path).json()["items"]}
    assert Decimal(rows[base["id"]]["mmol"]) == 2
    assert Decimal(rows[base["id"]]["amount"]) == Decimal("0.2")
    assert rows[base["id"]]["unit"] == "g"
    assert Decimal(rows[excess["id"]]["equivalents"]) == Decimal("1.05")
    assert Decimal(rows[liquid["id"]]["mmol"]) == 8
    assert Decimal(rows[liquid["id"]]["amount"]) == Decimal("0.7")
    assert rows[solvent["id"]] == solvent
    assert rows[product["id"]] == product
    assert rows[unknown["id"]] == unknown
    # A scaled sibling's old editor cannot overwrite the newly saved dose.
    assert (
        client.patch(
            f"{path}/{base['id']}", json={"expected_version": base["version"], "notes": "stale"}
        ).status_code
        == 409
    )
    # Notes-only edits never rescale or normalize historical doses.
    before = client.get(path).json()["items"]
    response = client.patch(
        f"{path}/{excess['id']}",
        json={"expected_version": response.json()["version"], "notes": "only notes"},
    )
    assert response.status_code == 200
    after = client.get(path).json()["items"]
    assert [row for row in before if row["id"] != excess["id"]] == [
        row for row in after if row["id"] != excess["id"]
    ]


def test_scaling_rejects_changed_table_and_rolls_back_all_updates(client: TestClient) -> None:
    _, source, target, path = setup(client)
    base = post(
        client,
        path,
        {"compound_id": source["id"], "role": "substrate", "mmol": "1", "equivalents": "1"},
    )
    other = post(
        client,
        path,
        {"compound_id": target["id"], "role": "reagent", "mmol": "2", "equivalents": "2"},
    )
    snapshot = {row["id"]: row["version"] for row in (base, other)}
    client.patch(
        f"{path}/{other['id']}", json={"expected_version": other["version"], "notes": "new"}
    )
    before = client.get(path).json()
    payload = {
        "expected_version": base["version"],
        "mmol": "3",
        "rescale_reactants": True,
        "expected_component_versions": snapshot,
    }
    assert client.patch(f"{path}/{base['id']}", json=payload).status_code == 409
    assert client.get(path).json() == before
    payload["expected_component_versions"] = {row["id"]: row["version"] for row in before["items"]}
    payload["mmol"] = "999999999999"
    assert client.patch(f"{path}/{base['id']}", json=payload).status_code == 422
    assert client.get(path).json() == before
    payload["mmol"] = "0"
    assert client.patch(f"{path}/{base['id']}", json=payload).status_code == 422
    assert client.get(path).json() == before
