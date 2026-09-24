import os
import tempfile
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import text

from app.core.config import get_settings
from app.db.session import engine

router = APIRouter(prefix="/health", tags=["health"])


class HealthResponse(BaseModel):
    status: Literal["ok", "unavailable"]


@router.get("/live", response_model=HealthResponse)
def live() -> HealthResponse:
    return HealthResponse(status="ok")


def storage_is_writable(upload_root: Path) -> bool:
    upload_root.mkdir(parents=True, exist_ok=True)
    descriptor, path = tempfile.mkstemp(prefix=".ready-", dir=upload_root)
    try:
        os.write(descriptor, b"ready")
    finally:
        os.close(descriptor)
        Path(path).unlink(missing_ok=True)
    return True


@router.get("/ready", response_model=HealthResponse)
def ready() -> HealthResponse | JSONResponse:
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        storage_is_writable(get_settings().upload_root)
    except (OSError, RuntimeError):
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"status": "unavailable"},
        )
    except Exception:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"status": "unavailable"},
        )
    return HealthResponse(status="ok")
