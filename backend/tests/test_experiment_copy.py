"""Experiment copy uses isolated PostgreSQL and preserves independent product records."""

from fastapi.testclient import TestClient

from app.services import records


def create(client: TestClient, path: str, body: dict) -> dict:
    response = client.post(path, json=body)
    assert response.status_code == 201, response.text
    return response.json()


def test_copy_setup_has_new_identity_and_independent_reactions(client: TestClient) -> None:
    tag = create(client, "/api/tags", {"name": "copy test"})
    source = create(
        client,
        "/api/experiments",
        {
            "title": "原实验",
            "date": "2026-09-10",
            "status": "completed",
            "objective": "目的",
            "procedure": "操作",
            "observation": "观察",
            "result": "结果",
            "conclusion": "结论",
            "tag_ids": [tag["id"]],
        },
    )
    compound = create(client, "/api/compounds", {"name": "copy reagent"})
    assert (
        client.post(
            f"/api/experiments/{source['id']}/compounds",
            json={
                "compound_id": compound["id"],
                "expected_version": source["version"],
            },
        ).status_code
        == 201
    )
    source = client.get(f"/api/experiments/{source['id']}").json()
    for name in ["A", "B"]:
        reaction = create(
            client,
            f"/api/experiments/{source['id']}/reactions",
            {
                "reaction_name": name,
                "temperature_c": "25.12345678",
                "solvent": "MeOH",
                "workup": "水洗",
                "purification": "硅胶柱",
                "notes": "反应备注",
            },
        )
        create(
            client,
            f"/api/reactions/{reaction['id']}/components",
            {
                "compound_id": compound["id"],
                "role": "substrate",
                "amount": "92.12345678",
                "unit": "mg",
                "mmol": "2",
                "equivalents": "1",
                "notes": "投料备注",
            },
        )
        product = create(
            client,
            f"/api/reactions/{reaction['id']}/components",
            {
                "compound_id": compound["id"],
                "role": "product",
                "yield_percent": "80",
                "amount": "30.12345678",
                "unit": "mg",
                "mmol": "0.8",
                "stoichiometric_ratio": "2",
                "notes": "产物备注",
            },
        )
        removed = create(
            client,
            f"/api/reactions/{reaction['id']}/components",
            {
                "compound_id": compound["id"],
                "role": "reagent",
            },
        )
        assert (
            client.delete(
                f"/api/reactions/{reaction['id']}/components/{removed['id']}?expected_version=1"
            ).status_code
            == 204
        )
        assert product["yield_percent"] == "80.00000000"
    create(client, "/api/samples", {"experiment_id": source["id"], "sample_type": "产物"})
    copied = create(
        client,
        f"/api/experiments/{source['id']}/copy",
        {
            "expected_version": source["version"],
            "title": "新实验",
            "date": "2026-10-10",
        },
    )
    assert copied["id"] != source["id"] and copied["experiment_code"] != source["experiment_code"]
    assert copied["status"] == "draft" and copied["version"] == 1
    assert copied["objective"] == "目的" and copied["procedure"] == "操作"
    assert all(copied[key] is None for key in ["observation", "result", "conclusion"])
    assert copied["tags"] == source["tags"]
    reactions = client.get(f"/api/experiments/{copied['id']}/reactions").json()["items"]
    assert len(reactions) == 2
    for reaction in reactions:
        assert reaction["temperature_c"] == "25.12345678"
        assert reaction["workup"] == "水洗" and reaction["purification"] == "硅胶柱"
        components = client.get(f"/api/reactions/{reaction['id']}/components").json()["items"]
        assert len(components) == 2
        copied_product = next(row for row in components if row["role"] == "product")
        assert copied_product["id"] != product["id"]
        assert copied_product["amount"] == "30.12345678"
        assert copied_product["yield_percent"] == "80.00000000"
        assert copied_product["stoichiometric_ratio"] == "2.00000000"
        assert copied_product["notes"] == "产物备注"
        assert (
            components[0]["amount"] == "92.12345678"
            and components[0]["compound_id"] == compound["id"]
        )
    assert client.get(f"/api/samples?experiment_id={copied['id']}").json()["total"] == 0
    assert client.get(f"/api/files?experiment_id={copied['id']}").json()["total"] == 0
    assert client.get(f"/api/experiments/{source['id']}").json() == source
    changed = client.patch(
        f"/api/reactions/{reactions[0]['id']}",
        json={"expected_version": 1, "reaction_name": "独立编辑"},
    )
    assert changed.status_code == 200
    assert (
        client.get(f"/api/experiments/{source['id']}/reactions").json()["items"][0]["reaction_name"]
        == "A"
    )
    assert (
        client.post(
            f"/api/experiments/{source['id']}/copy",
            json={"expected_version": source["version"] + 1, "title": "冲突", "date": "2026-10-10"},
        ).status_code
        == 409
    )
    assert client.delete(f"/api/experiments/{copied['id']}?expected_version=1").status_code == 204
    assert (
        client.post(
            f"/api/experiments/{copied['id']}/copy",
            json={"expected_version": 1, "title": "已删", "date": "2026-10-10"},
        ).status_code
        == 404
    )


def test_copy_failure_rolls_back_new_record_and_number(client: TestClient, monkeypatch) -> None:
    source = create(client, "/api/experiments", {"title": "rollback source", "date": "2026-10-10"})

    def fail(*args, **kwargs):
        raise records.RecordError(422, "VALIDATION_ERROR", "故障注入")

    with monkeypatch.context() as patch:
        patch.setattr(records, "replace_tags", fail)
        assert (
            client.post(
                f"/api/experiments/{source['id']}/copy",
                json={"expected_version": 1, "title": "失败副本", "date": "2026-10-10"},
            ).status_code
            == 422
        )
    assert client.get("/api/experiments?q=失败副本").json()["total"] == 0
    next_record = create(
        client, "/api/experiments", {"title": "rollback next", "date": "2026-10-10"}
    )
    assert (
        int(next_record["experiment_code"].split("-")[-1])
        == int(source["experiment_code"].split("-")[-1]) + 1
    )


def test_copy_preserves_order_across_pages_and_copy_of_copy(client: TestClient) -> None:
    source = create(client, "/api/experiments", {"title": "ordered source", "date": "2026-10-10"})
    names = [f"Step {index:02d}" for index in range(1, 13)]
    for name in names:
        create(client, f"/api/experiments/{source['id']}/reactions", {"reaction_name": name})

    def ordered_rows(experiment_id: str) -> list[dict]:
        return [
            row
            for page in (1, 2, 3)
            for row in client.get(
                f"/api/experiments/{experiment_id}/reactions", params={"page": page, "page_size": 5}
            ).json()["items"]
        ]

    original = ordered_rows(source["id"])
    assert [row["reaction_name"] for row in original] == names
    for _ in range(2):
        source = create(
            client,
            f"/api/experiments/{source['id']}/copy",
            {"expected_version": source["version"], "title": "ordered copy", "date": "2026-10-10"},
        )
        rows = ordered_rows(source["id"])
        # The same transaction timestamp is intentional; explicit order breaks UUID ties.
        assert len({row["created_at"] for row in rows}) == 1
        assert [row["reaction_name"] for row in rows] == names
        assert [row["sort_order"] for row in rows] == list(range(1, 13))
        summary = client.get(f"/api/experiments/{source['id']}/summary").json()
        assert [group["reaction"]["reaction_name"] for group in summary["reactions"]] == names
    create(client, f"/api/experiments/{source['id']}/reactions", {"reaction_name": "Step 13"})
    assert (
        client.get(
            f"/api/experiments/{source['id']}/reactions", params={"page": 3, "page_size": 5}
        ).json()["items"][-1]["sort_order"]
        == 13
    )
