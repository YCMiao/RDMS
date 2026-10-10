"""Stage 04 API behavior on isolated PostgreSQL."""

from uuid import uuid4

from fastapi.testclient import TestClient


def create(client: TestClient, path: str, body: dict) -> dict:
    response = client.post(path, json=body)
    assert response.status_code == 201, response.text
    return response.json()


def test_samples_reactions_sources_and_versions(client: TestClient) -> None:
    exp = create(client, "/api/experiments", {"title": "04 验收", "date": "2026-09-23"})
    other = create(client, "/api/experiments", {"title": "另一实验", "date": "2026-09-23"})
    cmp = create(client, "/api/compounds", {"name": "04 化合物"})
    sample = create(
        client,
        "/api/samples",
        {"experiment_id": exp["id"], "sample_type": "混合物", "amount": "1.25000000", "unit": "mg"},
    )
    assert sample["sample_code"].startswith("SMP-2026-")
    assert sample["compound_id"] is None
    assert (
        client.post(
            "/api/samples",
            json={"experiment_id": exp["id"], "sample_type": "非法", "amount": "1.0"},
        ).status_code
        == 422
    )
    assert (
        client.patch(
            f"/api/samples/{sample['id']}",
            json={"expected_version": 1, "experiment_id": other["id"]},
        ).status_code
        == 422
    )
    sample = client.patch(
        f"/api/samples/{sample['id']}",
        json={
            "expected_version": 1,
            "compound_id": cmp["id"],
            "concentration": "0.12345678",
            "concentration_unit": "M",
        },
    ).json()
    assert sample["version"] == 2 and sample["concentration"] == "0.12345678"
    assert (
        client.patch(
            f"/api/samples/{sample['id']}", json={"expected_version": 1, "name": "覆盖"}
        ).status_code
        == 409
    )
    assert (
        client.post(
            "/api/samples",
            json={"experiment_id": exp["id"], "sample_type": "非法", "amount": 1.25, "unit": "mg"},
        ).status_code
        == 422
    )
    r1 = create(
        client,
        f"/api/experiments/{exp['id']}/reactions",
        {
            "reaction_name": "反应 A",
            "temperature_c": "-10.50000000",
            "reaction_time_hours": "2.00000000",
            "workup": "饱和氯化铵淬灭，乙酸乙酯萃取",
            "purification": "硅胶柱，石油醚/乙酸乙酯 4:1",
        },
    )
    assert r1["workup"] == "饱和氯化铵淬灭，乙酸乙酯萃取"
    assert r1["purification"] == "硅胶柱，石油醚/乙酸乙酯 4:1"
    changed_reaction = client.patch(
        f"/api/reactions/{r1['id']}",
        json={"expected_version": 1, "workup": "水洗后干燥", "purification": None},
    )
    assert changed_reaction.status_code == 200, changed_reaction.text
    assert changed_reaction.json()["workup"] == "水洗后干燥"
    assert changed_reaction.json()["purification"] is None
    r2 = create(client, f"/api/experiments/{exp['id']}/reactions", {"reaction_name": "反应 B"})
    assert r1["id"] != r2["id"]
    c1 = create(
        client,
        f"/api/reactions/{r1['id']}/components",
        {"compound_id": cmp["id"], "role": "substrate", "amount": "1.00000000", "unit": "mg"},
    )
    c2 = create(
        client,
        f"/api/reactions/{r1['id']}/components",
        {"compound_id": cmp["id"], "role": "reagent", "amount": "2.00000000", "unit": "mg"},
    )
    assert c2["sort_order"] == c1["sort_order"] + 1
    assert (
        client.post(
            f"/api/reactions/{r1['id']}/components",
            json={"compound_id": cmp["id"], "role": "reagent", "yield_percent": "45"},
        ).status_code
        == 422
    )
    product = create(
        client,
        f"/api/reactions/{r2['id']}/components",
        {"compound_id": cmp["id"], "role": "product", "yield_percent": "72.50000000"},
    )
    assert product["yield_percent"] == "72.50000000"
    reactants = client.get(f"/api/reactions/{r2['id']}/components?reactants_only=true").json()
    assert reactants["items"] == [] and reactants["total"] == 0
    assert client.get(f"/api/reactions/{r2['id']}/components").json()["total"] == 1
    assert (
        client.get(f"/api/reactions/{r1['id']}/components?reactants_only=true&page_size=1").json()[
            "total"
        ]
        == 2
    )

    assert client.get(f"/api/experiments/{exp['id']}/reactions").json()["total"] == 2
    assert client.get(f"/api/reactions/{r1['id']}/components?page_size=1").json()["total"] == 2
    sources = client.get(f"/api/experiments/{exp['id']}/compounds").json()
    assert sources["total"] == 1 and set(sources["items"][0]["sources"]) == {"sample", "reaction"}
    reverse = client.get(f"/api/compounds/{cmp['id']}/experiments").json()
    assert set(reverse["items"][0]["sources"]) == {"sample", "reaction"}
    assert client.get(f"/api/compounds/{cmp['id']}/samples").json()["total"] == 1
    assert client.get(f"/api/compounds/{cmp['id']}/reactions").json()["total"] == 2
    assert client.delete(f"/api/compounds/{cmp['id']}?expected_version=1").status_code == 409
    assert (
        client.delete(
            f"/api/reactions/{r1['id']}/components/{c1['id']}?expected_version=1"
        ).status_code
        == 204
    )
    assert client.get(f"/api/reactions/{r1['id']}/components").json()["total"] == 1
    assert (
        client.post(
            f"/api/reactions/{r1['id']}/components/{c1['id']}/restore", json={"expected_version": 2}
        ).status_code
        == 200
    )
    assert client.delete(f"/api/reactions/{r1['id']}?expected_version=2").status_code == 204
    assert client.get(f"/api/reactions/{r1['id']}").status_code == 404
    assert client.get(f"/api/reactions/{r1['id']}/components").status_code == 404
    assert (
        client.post(f"/api/reactions/{r1['id']}/restore", json={"expected_version": 3}).status_code
        == 200
    )
    assert client.delete(f"/api/samples/{sample['id']}?expected_version=2").status_code == 204
    assert client.get(f"/api/samples/{sample['id']}").status_code == 404
    assert (
        client.post(
            f"/api/samples/{sample['id']}/restore", json={"expected_version": 3}
        ).status_code
        == 200
    )
    assert client.delete(f"/api/experiments/{exp['id']}?expected_version=1").status_code == 204
    assert client.get(f"/api/samples/{sample['id']}").status_code == 404
    assert client.get(f"/api/experiments/{exp['id']}/compounds").status_code == 404
    assert client.get(f"/api/compounds/{cmp['id']}/experiments").json()["total"] == 0
    assert (
        client.post(
            f"/api/samples/{sample['id']}/restore", json={"expected_version": 4}
        ).status_code
        == 409
    )
    assert (
        client.post(
            f"/api/experiments/{exp['id']}/restore", json={"expected_version": 2}
        ).status_code
        == 200
    )
    assert client.get(f"/api/samples/{sample['id']}").status_code == 200
    assert client.get(f"/api/experiments/{exp['id']}/compounds").json()["total"] == 1
    assert client.get(f"/api/samples?experiment_id={other['id']}").json()["total"] == 0
    assert client.get(f"/api/samples/{uuid4()}").status_code == 404


def test_parent_restore_rejects_deleted_compound(client: TestClient) -> None:
    exp = create(client, "/api/experiments", {"title": "恢复依赖", "date": "2026-09-23"})
    compound = create(client, "/api/compounds", {"name": "恢复依赖化合物"})
    sample = create(
        client,
        "/api/samples",
        {"experiment_id": exp["id"], "sample_type": "分离物", "compound_id": compound["id"]},
    )
    reaction = create(
        client, f"/api/experiments/{exp['id']}/reactions", {"reaction_name": "恢复反应"}
    )
    component = create(
        client,
        f"/api/reactions/{reaction['id']}/components",
        {"compound_id": compound["id"], "role": "product"},
    )
    assert client.delete(f"/api/experiments/{exp['id']}?expected_version=1").status_code == 204
    assert client.get(f"/api/samples/{sample['id']}").status_code == 404
    assert client.get(f"/api/reactions/{reaction['id']}").status_code == 404
    assert client.delete(f"/api/compounds/{compound['id']}?expected_version=1").status_code == 204
    blocked = client.post(f"/api/experiments/{exp['id']}/restore", json={"expected_version": 2})
    assert blocked.status_code == 409
    assert (
        client.post(
            f"/api/compounds/{compound['id']}/restore", json={"expected_version": 2}
        ).status_code
        == 200
    )
    assert (
        client.post(
            f"/api/experiments/{exp['id']}/restore", json={"expected_version": 2}
        ).status_code
        == 200
    )
    assert client.get(f"/api/samples/{sample['id']}").status_code == 200
    assert (
        client.get(f"/api/reactions/{reaction['id']}/components").json()["items"][0]["id"]
        == component["id"]
    )
