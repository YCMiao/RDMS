"""Authentication and isolation use the real disposable PostgreSQL database."""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select, text, update

from app.api.auth import COOKIE, token_hash
from app.db.session import SessionLocal
from app.main import app
from app.models import Account, LoginSession

HEADERS = {"X-RDMS-Request": "1"}


def register(http: TestClient) -> dict:
    username = f"user-{uuid4().hex[:12]}"
    response = http.post(
        "/api/auth/register",
        json={
            "username": username,
            "password": "correct-password-long",
            "display_name": "独立用户",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_session_lifecycle_and_csrf(client: TestClient) -> None:
    del client
    with TestClient(app, headers=HEADERS) as http:
        assert http.get("/api/compounds").status_code == 401
        account = register(http)
        cookie = http.cookies.get(COOKIE)
        assert cookie is not None
        assert http.get("/api/auth/me").json() == account
        with SessionLocal() as db:
            stored = db.scalar(select(Account).where(Account.username == account["username"]))
            assert stored is not None
            assert "correct-password-long" not in stored.password_hash
            assert db.get(LoginSession, token_hash(cookie)) is not None
            assert db.get(LoginSession, cookie) is None
        assert (
            http.post(
                "/api/auth/register",
                json={
                    "username": account["username"],
                    "password": "correct-password-long",
                    "display_name": "重复",
                },
            ).status_code
            == 409
        )
        assert http.post("/api/auth/logout", headers={"X-RDMS-Request": ""}).status_code == 403
        assert (
            http.post("/api/auth/logout", headers={"Origin": "http://evil.example"}).status_code
            == 403
        )
        assert http.post("/api/auth/logout").status_code == 204
        assert http.get("/api/auth/me").status_code == 401
        assert (
            http.get("/api/compounds", headers={"Cookie": f"{COOKIE}={cookie}"}).status_code == 401
        )
        bad = http.post(
            "/api/auth/login",
            json={"username": account["username"], "password": "wrong-password-long"},
        )
        assert bad.status_code == 401
        good = http.post(
            "/api/auth/login",
            json={"username": account["username"].upper(), "password": "correct-password-long"},
        )
        assert good.status_code == 200
        assert "HttpOnly" in good.headers["set-cookie"]
        assert "SameSite=strict" in good.headers["set-cookie"]
        session = http.cookies.get(COOKIE)
        with SessionLocal() as db:
            db.execute(
                update(LoginSession)
                .where(LoginSession.token_hash == token_hash(session or ""))
                .values(expires_at=datetime.now(UTC) - timedelta(seconds=1))
            )
            db.commit()
        assert http.get("/api/auth/me").status_code == 401
        assert http.get("/api/dashboard").status_code == 401


def test_password_rotation_revokes_other_sessions(client: TestClient) -> None:
    del client
    with TestClient(app, headers=HEADERS) as first, TestClient(app, headers=HEADERS) as second:
        account = register(first)
        assert (
            second.post(
                "/api/auth/login",
                json={"username": account["username"], "password": "correct-password-long"},
            ).status_code
            == 200
        )
        assert (
            first.post(
                "/api/auth/password",
                json={"current_password": "wrong-password", "new_password": "new-password-long"},
            ).status_code
            == 400
        )
        assert (
            first.post(
                "/api/auth/password",
                json={
                    "current_password": "correct-password-long",
                    "new_password": "new-password-long",
                },
            ).status_code
            == 204
        )
        assert first.get("/api/auth/me").status_code == 200
        assert second.get("/api/auth/me").status_code == 401
        assert (
            second.post(
                "/api/auth/login",
                json={"username": account["username"], "password": "correct-password-long"},
            ).status_code
            == 401
        )
        assert (
            second.post(
                "/api/auth/login",
                json={"username": account["username"], "password": "new-password-long"},
            ).status_code
            == 200
        )


def test_private_records_relations_search_trash_files(client: TestClient) -> None:
    owner_book = client.get("/api/notebooks").json()["items"][0]
    exp = client.post(
        "/api/experiments", json={"title": "私有隔离实验", "date": "2026-10-13"}
    ).json()
    cmp = client.post("/api/compounds", json={"name": "私有隔离化合物"}).json()
    tag = client.post("/api/tags", json={"name": "可重复私有标签"}).json()
    reaction = client.post(
        f"/api/experiments/{exp['id']}/reactions", json={"reaction_name": "私有反应"}
    ).json()
    asset_response = client.post(
        f"/api/experiments/{exp['id']}/files",
        files={"file": ("private.txt", b"private bytes", "text/plain")},
    )
    assert asset_response.status_code == 201, asset_response.text
    asset = asset_response.json()
    with TestClient(app, headers=HEADERS) as other:
        account = register(other)
        for endpoint in (
            f"/compounds/{cmp['id']}",
            f"/experiments/{exp['id']}",
            f"/files/{asset['id']}/download",
            f"/experiments/{exp['id']}/summary",
        ):
            assert other.get(f"/api{endpoint}").status_code == 404
        search = other.get("/api/search?q=私有隔离").json()
        assert search["experiments"]["total"] == search["compounds"]["total"] == 0
        assert other.get("/api/compounds").json()["total"] == 0
        assert other.get("/api/dashboard").json()["experiment_count"] == 0
        assert other.get("/api/notebooks").json()["items"][0]["id"] != owner_book["id"]
        assert other.post("/api/tags", json={"name": "可重复私有标签"}).status_code == 201
        assert (
            other.patch(
                f"/api/tags/{tag['id']}", json={"name": "攻击", "expected_version": 1}
            ).status_code
            == 404
        )
        assert (
            other.post(
                "/api/experiments",
                json={"title": "越权", "date": "2026-10-13", "notebook_id": owner_book["id"]},
            ).status_code
            == 404
        )
        own_exp = other.post(
            "/api/experiments", json={"title": "自己的实验", "date": "2026-10-13"}
        ).json()
        assert (
            other.post(
                f"/api/experiments/{own_exp['id']}/compounds",
                json={"compound_id": cmp["id"], "expected_version": 1},
            ).status_code
            == 404
        )
        assert (
            other.post(
                f"/api/reactions/{reaction['id']}/components",
                json={"compound_id": cmp["id"], "role": "substrate"},
            ).status_code
            == 404
        )
        with SessionLocal(info={"account_id": account["id"]}) as db:
            assert db.scalar(text("SELECT count(*) FROM compound")) == 0
            assert db.scalar(text("SELECT current_user")) == "rdms_member"
        # New requests on the pooled connection retain the correct account after commits.
        assert client.get(f"/api/compounds/{cmp['id']}").status_code == 200
        assert client.delete(f"/api/compounds/{cmp['id']}?expected_version=1").status_code == 204
        assert other.get("/api/trash?type=compound").json()["total"] == 0
        assert (
            other.post(
                f"/api/compounds/{cmp['id']}/restore", json={"expected_version": 2}
            ).status_code
            == 404
        )


def test_first_account_claimed_legacy_notebook(client: TestClient) -> None:
    identity = client.get("/api/auth/me").json()
    with SessionLocal() as db:
        assert (
            db.scalar(
                text(
                    "SELECT owner_id::text FROM notebook "
                    "WHERE id = '00000000-0000-4000-8000-000000000001'"
                )
            )
            == identity["id"]
        )


def test_validation_and_persistent_rate_limit(client: TestClient) -> None:
    del client
    with TestClient(app, headers=HEADERS) as http:
        assert (
            http.post(
                "/api/auth/register",
                json={"username": "invalid space", "password": "short", "display_name": " "},
            ).status_code
            == 422
        )
        username = f"missing-{uuid4().hex[:10]}"
        for _ in range(15):
            assert (
                http.post(
                    "/api/auth/login",
                    json={"username": username, "password": "wrong-password-long"},
                ).status_code
                == 401
            )
        assert (
            http.post(
                "/api/auth/login", json={"username": username, "password": "wrong-password-long"}
            ).status_code
            == 429
        )
