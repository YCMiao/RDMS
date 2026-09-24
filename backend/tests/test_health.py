from fastapi.testclient import TestClient
from sqlalchemy import text

from app.db.session import engine


def test_live_returns_request_id(client: TestClient) -> None:
    response = client.get("/api/health/live", headers={"X-Request-ID": "test-live-01"})

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert response.headers["X-Request-ID"] == "test-live-01"


def test_ready_uses_real_postgresql_and_storage(client: TestClient) -> None:
    with engine.connect() as connection:
        assert connection.execute(text("SELECT current_database()")).scalar_one() == "rdms_test"

    response = client.get("/api/health/ready")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_openapi_exposes_health_routes(client: TestClient) -> None:
    response = client.get("/api/openapi.json")

    assert response.status_code == 200
    paths = response.json()["paths"]
    assert "/api/health/live" in paths
    assert "/api/health/ready" in paths
