import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

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


@pytest.fixture
def client(upload_root: Path) -> TestClient:
    del upload_root
    return TestClient(app)
