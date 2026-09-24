"""Trash lists only explicitly deleted rows and explains restore dependencies."""

from fastapi.testclient import TestClient


def create(client: TestClient, path: str, body: dict) -> dict:
    response = client.post(path, json=body)
    assert response.status_code == 201, response.text
    return response.json()


def test_trash_hides_implicit_children_and_restores_in_order(client: TestClient) -> None:
    experiment = create(client, "/api/experiments", {"title": "07回收站", "date": "2026-09-23"})
    compound = create(client, "/api/compounds", {"name": "07回收站物质"})
    sample = create(
        client,
        "/api/samples",
        {"experiment_id": experiment["id"], "sample_type": "原液", "compound_id": compound["id"]},
    )
    reaction = create(
        client, f"/api/experiments/{experiment['id']}/reactions", {"reaction_name": "07反应"}
    )
    component = create(
        client,
        f"/api/reactions/{reaction['id']}/components",
        {"compound_id": compound["id"], "role": "product"},
    )
    file = client.post(
        f"/api/experiments/{experiment['id']}/files",
        files={"file": ("trace.txt", b"trace", "text/plain")},
    ).json()
    assert client.delete(f"/api/samples/{sample['id']}?expected_version=1").status_code == 204
    assert (
        client.delete(f"/api/experiments/{experiment['id']}?expected_version=1").status_code == 204
    )
    assert client.get("/api/trash?type=experiment").json()["items"][0]["id"] == experiment["id"]
    sample_trash = client.get("/api/trash?type=sample").json()
    assert any(
        item["id"] == sample["id"] and not item["parent_active"] for item in sample_trash["items"]
    )
    assert all(
        item["id"] != reaction["id"]
        for item in client.get("/api/trash?type=reaction").json()["items"]
    )
    assert all(
        item["id"] != component["id"]
        for item in client.get("/api/trash?type=component").json()["items"]
    )
    assert all(
        item["id"] != file["id"] for item in client.get("/api/trash?type=file").json()["items"]
    )
    assert client.delete(f"/api/compounds/{compound['id']}?expected_version=1").status_code == 204
    experiment_trash = client.get("/api/trash?type=experiment").json()
    row = next(item for item in experiment_trash["items"] if item["id"] == experiment["id"])
    assert row["restore_block_reason"] == "请先恢复关联的化合物"
    assert (
        client.post(row["restore_url"], json={"expected_version": row["version"]}).status_code
        == 409
    )
    assert (
        client.post(
            f"/api/compounds/{compound['id']}/restore", json={"expected_version": 2}
        ).status_code
        == 200
    )
    assert (
        client.post(row["restore_url"], json={"expected_version": row["version"]}).status_code
        == 200
    )
    assert client.get(f"/api/samples/{sample['id']}").status_code == 404
    assert client.get(f"/api/reactions/{reaction['id']}").status_code == 200
    assert client.get(file["download_url"]).status_code == 200
    assert (
        client.post(
            f"/api/samples/{sample['id']}/restore", json={"expected_version": 2}
        ).status_code
        == 200
    )
