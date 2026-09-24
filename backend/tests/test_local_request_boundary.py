from fastapi.testclient import TestClient


def test_host_and_origin_boundary(client: TestClient) -> None:
    assert client.get("/api/health/live", headers={"Host": "attacker.example"}).status_code == 403
    assert client.get("/api/health/live", headers={"Host": "127.0.0.1:8080"}).status_code == 200

    payload = {"title": "来源检查不应写入", "date": "2026-09-23"}
    blocked = client.post(
        "/api/experiments",
        json=payload,
        headers={"Host": "127.0.0.1:8080", "Origin": "http://attacker.example"},
    )
    assert blocked.status_code == 403
    assert blocked.json()["error"]["code"] == "FORBIDDEN_ORIGIN"
    assert blocked.headers["X-Request-ID"]
    assert client.get("/api/experiments?q=来源检查不应写入").json()["total"] == 0

    allowed = client.post(
        "/api/experiments",
        json=payload,
        headers={"Host": "127.0.0.1:8080", "Origin": "http://127.0.0.1:8080"},
    )
    assert allowed.status_code == 201, allowed.text
    assert client.post(
        "/api/experiments",
        json={"title": "本机命令行", "date": "2026-09-23"},
        headers={"Host": "127.0.0.1:8080"},
    ).status_code == 201
