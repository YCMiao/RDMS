import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event, text
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Session, SessionTransaction

os.environ.setdefault(
    "DATABASE_URL", "postgresql+psycopg://rdms_test:rdms_test_only@db-test:5432/rdms_test"
)
os.environ.setdefault("UPLOAD_ROOT", "/tmp/rdms-test-uploads")

from app.main import app  # noqa: E402


@pytest.fixture
def upload_root() -> Path:
    root = Path(os.environ["UPLOAD_ROOT"])
    root.mkdir(parents=True, exist_ok=True)
    return root


@pytest.fixture(scope="session")
def auth_cookies():  # type: ignore[no-untyped-def]
    http = TestClient(app, headers={"X-RDMS-Request": "1"})
    response = http.post(
        "/api/auth/register",
        json={
            "username": "test-owner",
            "password": "test-owner-password",
            "display_name": "测试用户",
        },
    )
    assert response.status_code == 201, response.text
    owner_id = response.json()["id"]

    def synthetic_owner(
        session: Session, transaction: SessionTransaction, connection: Connection
    ) -> None:
        del transaction
        if "account_id" not in session.info:
            connection.execute(
                text("SELECT set_config('rdms.account_id', :id, true)"), {"id": owner_id}
            )

    event.listen(Session, "after_begin", synthetic_owner)
    yield http.cookies
    event.remove(Session, "after_begin", synthetic_owner)
    http.close()


@pytest.fixture
def client(upload_root: Path, auth_cookies) -> TestClient:
    del upload_root
    return TestClient(app, cookies=auth_cookies, headers={"X-RDMS-Request": "1"})
