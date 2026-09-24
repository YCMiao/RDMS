"""Stage 06 search, dashboard and summary on isolated PostgreSQL."""

from fastapi.testclient import TestClient


def create(client: TestClient, path: str, body: dict) -> dict:
    response = client.post(path, json=body)
    assert response.status_code == 201, response.text
    return response.json()


def test_literal_search_and_independent_pages(client: TestClient) -> None:
    stem = "06专用查找甲"
    experiment = create(client, "/api/experiments", {"title": f"{stem}%_\\", "date": "2026-09-23"})
    second = create(client, "/api/experiments", {"title": f"{stem}第二", "date": "2026-09-23"})
    compound = create(client, "/api/compounds", {"name": f"{stem}化合物", "smiles": "C%_N\\"})
    assert client.get("/api/search?q=%20%20").status_code == 422
    assert client.get(f"/api/search?q={stem}&page_size=1").json()["experiments"]["total"] == 2
    page_one = client.get(f"/api/search?q={stem}&page_size=1").json()
    page_two = client.get(f"/api/search?q={stem}&page_size=1&experiment_page=2").json()
    assert {
        page_one["experiments"]["items"][0]["id"],
        page_two["experiments"]["items"][0]["id"],
    } == {experiment["id"], second["id"]}
    assert page_one["compounds"]["total"] == 1
    assert "name" in page_one["compounds"]["items"][0]["matched_fields"]
    literal = client.get("/api/search", params={"q": "%_\\"}).json()
    assert any(item["id"] == experiment["id"] for item in literal["experiments"]["items"])
    smiles = client.get("/api/search", params={"q": "C%_N\\"}).json()
    assert smiles["compounds"]["items"][0]["id"] == compound["id"]
    assert "smiles" in smiles["compounds"]["items"][0]["matched_fields"]
    assert (
        client.get("/api/search", params={"q": "' OR 1=1 --"}).json()["experiments"]["total"] == 0
    )
    assert (
        client.delete(f"/api/experiments/{experiment['id']}?expected_version=1").status_code == 204
    )
    assert client.get("/api/search", params={"q": "%_\\"}).json()["experiments"]["total"] == 0
    assert client.get(f"/api/search?q={stem}&page_size=1").json()["experiments"]["total"] == 1


def test_dashboard_visibility_and_deterministic_summary(client: TestClient) -> None:
    before = client.get("/api/dashboard").json()
    experiment = create(
        client,
        "/api/experiments",
        {"title": "06摘要固定", "date": "2026-09-23", "objective": "仅记录观察"},
    )
    compound = create(client, "/api/compounds", {"name": "06摘要物质"})
    sample = create(
        client,
        "/api/samples",
        {
            "experiment_id": experiment["id"],
            "sample_type": "混合液",
            "amount": "1.25000000",
            "unit": "mL",
        },
    )
    reaction = create(
        client,
        f"/api/experiments/{experiment['id']}/reactions",
        {
            "reaction_name": "尝试反应",
            "temperature_c": "25.00000000",
            "workup": "水相萃取",
            "purification": "硅胶柱",
        },
    )
    component = create(
        client,
        f"/api/reactions/{reaction['id']}/components",
        {"compound_id": compound["id"], "role": "product", "yield_percent": "42.00000000"},
    )
    uploaded = client.post(
        f"/api/experiments/{experiment['id']}/files",
        files={"file": ("观察.txt", "观察原件".encode(), "text/plain")},
    )
    assert uploaded.status_code == 201, uploaded.text
    file = uploaded.json()
    after = client.get("/api/dashboard").json()
    assert after["experiment_count"] == before["experiment_count"] + 1
    assert after["compound_count"] == before["compound_count"] + 1
    assert after["sample_count"] == before["sample_count"] + 1
    assert len(after["recent_experiments"]) <= 5 and len(after["recent_files"]) <= 5
    assert after["recent_experiments"][0]["id"] == experiment["id"]
    assert after["recent_files"][0]["id"] == file["id"]
    first = client.get(f"/api/experiments/{experiment['id']}/summary")
    assert first.status_code == 200, first.text
    content = first.json()
    assert content["experiment"]["objective"] == "仅记录观察"
    assert content["reactions"][0]["components"][0]["yield_percent"] == "42.00000000"
    assert content["reactions"][0]["reaction"]["workup"] == "水相萃取"
    assert content["samples"][0]["id"] == sample["id"]
    assert content["samples"][0]["amount"] == "1.25000000"
    assert content["files"][0]["sha256"] == file["sha256"]
    repeated = client.get(f"/api/experiments/{experiment['id']}/summary").json()
    assert repeated["source_revision"] == content["source_revision"]
    md = client.get(f"/api/experiments/{experiment['id']}/summary?format=markdown")
    assert md.status_code == 200
    assert "后处理：水相萃取" in md.text and "纯化：硅胶柱" in md.text
    assert "## 目的\n仅记录观察" in md.text and "## 结论\n未记录" in md.text
    assert "42.00000000" in md.text and "观察.txt" in md.text
    assert (
        client.delete(
            f"/api/reactions/{reaction['id']}/components/{component['id']}?expected_version=1"
        ).status_code
        == 204
    )
    assert client.delete(f"/api/files/{file['id']}?expected_version=1").status_code == 204
    changed = client.get(f"/api/experiments/{experiment['id']}/summary").json()
    assert changed["source_revision"] != content["source_revision"]
    assert changed["reactions"][0]["components"] == [] and changed["files"] == []
    assert (
        client.delete(f"/api/experiments/{experiment['id']}?expected_version=1").status_code == 204
    )
    assert client.get(f"/api/experiments/{experiment['id']}/summary").status_code == 404
    final = client.get("/api/dashboard").json()
    assert final["experiment_count"] == before["experiment_count"]
    assert final["sample_count"] == before["sample_count"]
