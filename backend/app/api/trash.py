"""Read-only trash endpoint."""

from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.records_schema import Page
from app.api.trash_schema import TrashOut, TrashType
from app.db.session import get_db
from app.services import trash

router = APIRouter(tags=["trash"])
DB = Depends(get_db)


@router.get("/trash", response_model=Page[TrashOut])
def list_trash(
    type: TrashType = "experiment",
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: Session = DB,
) -> dict[str, Any]:
    return trash.page(db, type, page, page_size)
