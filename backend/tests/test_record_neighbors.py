"""Neighbor navigation shares list ordering and visibility, independent of page size."""

from uuid import uuid4

from fastapi.testclient import TestClient


def test_experiment_neighbors_follow_filtered_notebook_list(client: TestClient) -> None:
    prefix = f"Neighbors-{uuid4()}"
    notebook = client.post("/api/notebooks", json={"name": prefix}).json()
    other = client.post("/api/notebooks", json={"name": prefix + "-other"}).json()
    items = []
    for index, title in enumerate(["C", "A", "B", "A", "Trash", "Draft", "Old", "Other"]):
        response = client.post(
            "/api/experiments",
            json={
                "title": prefix + title,
                "notebook_id": other["id"] if title == "Other" else notebook["id"],
                "status": "draft" if title == "Draft" else "completed",
                "date": "2026-09-01" if title == "Old" else f"2026-10-{10 + index % 3:02}",
            },
        )
        assert response.status_code == 201
        items.append(response.json())
    deleted = items[4]
    assert client.delete(f"/api/experiments/{deleted['id']}?expected_version=1").status_code == 204
    filters = {
        "q": prefix,
        "notebook_id": notebook["id"],
        "status": "completed",
        "date_from": "2026-10-01",
        "date_to": "2026-10-31",
    }
    for sort in ["date_asc", "date_desc", "code_asc", "code_desc", "title_asc", "title_desc"]:
        ordered = []
        for page in [1, 2]:
            result = client.get(
                "/api/experiments", params={**filters, "sort": sort, "page_size": 2, "page": page}
            ).json()
            assert result["total"] == 4
            ordered.extend(row["id"] for row in result["items"])
        for index, record_id in enumerate(ordered):
            response = client.get(
                f"/api/experiments/{record_id}/neighbors", params={**filters, "sort": sort}
            )
            assert response.status_code == 200
            assert response.json() == {
                "previous_id": ordered[index - 1] if index else None,
                "next_id": ordered[index + 1] if index + 1 < len(ordered) else None,
                "position": index + 1,
            }
    assert client.get(f"/api/experiments/{deleted['id']}/neighbors").status_code == 404
    empty = client.get(f"/api/experiments/{items[5]['id']}/neighbors", params=filters).json()
    assert empty == {"previous_id": None, "next_id": None, "position": None}
    all_ids = client.get("/api/experiments", params={"q": prefix}).json()["items"]
    assert any(row["id"] == items[7]["id"] for row in all_ids)


def test_compound_neighbors_follow_search_tags_and_sort(client: TestClient) -> None:
    prefix = f"Neighbors-{uuid4()}"
    tag = client.post("/api/tags", json={"name": prefix}).json()
    items = []
    for name in ["C", "A", "A", "B", "Hidden", "Trash"]:
        response = client.post(
            "/api/compounds",
            json={"name": prefix + name, "tag_ids": [] if name == "Hidden" else [tag["id"]]},
        )
        assert response.status_code == 201
        items.append(response.json())
    assert client.delete(f"/api/compounds/{items[5]['id']}?expected_version=1").status_code == 204
    for sort in ["created_desc", "name_asc"]:
        filters = {"q": prefix, "tag_id": tag["id"], "sort": sort}
        rows = client.get("/api/compounds", params=filters).json()["items"]
        ordered = [row["id"] for row in rows]
        assert len(ordered) == 4
        for index, record_id in enumerate(ordered):
            response = client.get(f"/api/compounds/{record_id}/neighbors", params=filters)
            assert response.status_code == 200
            assert response.json() == {
                "previous_id": ordered[index - 1] if index else None,
                "next_id": ordered[index + 1] if index + 1 < len(ordered) else None,
                "position": index + 1,
            }
    assert client.get(f"/api/compounds/{uuid4()}/neighbors").status_code == 404
