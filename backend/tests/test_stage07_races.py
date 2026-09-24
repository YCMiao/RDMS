"""Independent requests must serialize deletion against new references."""

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

from fastapi.testclient import TestClient


def create(client: TestClient, path: str, body: dict) -> dict:
    response = client.post(path, json=body)
    assert response.status_code == 201, response.text
    return response.json()


def race(first, second):
    barrier = Barrier(2)

    def run(operation):
        barrier.wait()
        return operation()

    with ThreadPoolExecutor(max_workers=2) as pool:
        left = pool.submit(run, first)
        right = pool.submit(run, second)
        return left.result(), right.result()


def test_compound_delete_races_new_sample_reference(client: TestClient) -> None:
    experiment = create(client, "/api/experiments", {"title": "竞态样品", "date": "2026-09-23"})
    compound = create(client, "/api/compounds", {"name": "竞态物质"})
    sample_response, delete_response = race(
        lambda: client.post(
            "/api/samples",
            json={
                "experiment_id": experiment["id"],
                "sample_type": "原液",
                "compound_id": compound["id"],
            },
        ),
        lambda: client.delete(f"/api/compounds/{compound['id']}?expected_version=1"),
    )
    assert (sample_response.status_code, delete_response.status_code) in {(201, 409), (409, 204)}
    if sample_response.status_code == 201:
        assert client.get(f"/api/samples/{sample_response.json()['id']}").status_code == 200
        assert client.get(f"/api/compounds/{compound['id']}").status_code == 200
    else:
        assert "已删除" in sample_response.text
        assert client.get(f"/api/compounds/{compound['id']}").status_code == 404
        assert client.get(f"/api/samples?experiment_id={experiment['id']}").json()["total"] == 0


def test_experiment_delete_races_new_reaction(client: TestClient) -> None:
    experiment = create(client, "/api/experiments", {"title": "竞态反应", "date": "2026-09-23"})
    reaction_response, delete_response = race(
        lambda: client.post(
            f"/api/experiments/{experiment['id']}/reactions", json={"reaction_name": "竞态反应"}
        ),
        lambda: client.delete(f"/api/experiments/{experiment['id']}?expected_version=1"),
    )
    assert reaction_response.status_code in {201, 404}
    assert delete_response.status_code == 204
    if reaction_response.status_code == 201:
        # Parent soft deletion hides the child without independently deleting it.
        assert client.get(f"/api/reactions/{reaction_response.json()['id']}").status_code == 404
        restored = client.post(
            f"/api/experiments/{experiment['id']}/restore", json={"expected_version": 2}
        )
        assert restored.status_code == 200
        assert client.get(f"/api/reactions/{reaction_response.json()['id']}").status_code == 200
