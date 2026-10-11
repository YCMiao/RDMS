"""Notebook cards, editing and experiment membership APIs."""

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.notebook_schema import (
    NotebookFields,
    NotebookOut,
    NotebookPatch,
    NotebookTransfer,
    TransferPreview,
)
from app.api.records_schema import ExperimentOut, Page
from app.db.session import get_db
from app.models import Notebook
from app.repositories.records import escaped, page_query
from app.services import notebooks
from app.services.records import RecordError

router = APIRouter(tags=["notebooks"])
DB = Depends(get_db)


@router.get("/notebooks", response_model=Page[NotebookOut])
def list_notebooks(
    db: Session = DB,
    q: str | None = None,
    archived: bool | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
) -> dict[str, Any]:
    stmt = select(Notebook)
    if archived is not None:
        stmt = stmt.where(Notebook.archived == archived)
    if q:
        stmt = stmt.where(Notebook.name.ilike(f"%{escaped(q)}%", escape="\\"))
    stmt = stmt.order_by(Notebook.created_at, Notebook.code)
    rows, total = page_query(db, stmt, page, page_size)
    return {
        "items": [notebooks.notebook_output(db, row) for row in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/notebooks/{notebook_id}", response_model=NotebookOut)
def get_notebook(notebook_id: UUID, db: Session = DB) -> dict[str, Any]:
    row = db.get(Notebook, notebook_id)
    if row is None:
        raise RecordError(404, "NOT_FOUND", "记录本不存在")
    return notebooks.notebook_output(db, row)


@router.post("/notebooks", response_model=NotebookOut, status_code=201)
def create_notebook(payload: NotebookFields, db: Session = DB) -> dict[str, Any]:
    return notebooks.create(db, payload)


@router.patch("/notebooks/{notebook_id}", response_model=NotebookOut)
def patch_notebook(notebook_id: UUID, payload: NotebookPatch, db: Session = DB) -> dict[str, Any]:
    return notebooks.patch(db, notebook_id, payload)


@router.post("/experiments/transfer", response_model=list[ExperimentOut])
def transfer_experiments(payload: NotebookTransfer, db: Session = DB) -> list[dict[str, Any]]:
    return notebooks.transfer(db, payload)


@router.post("/experiments/transfer-preview", response_model=TransferPreview)
def transfer_preview(payload: NotebookTransfer, db: Session = DB) -> dict[str, Any]:
    return notebooks.preview(db, payload)
