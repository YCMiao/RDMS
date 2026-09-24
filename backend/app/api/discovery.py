"""Search, dashboard and experiment summary endpoints."""

from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.api.discovery_schema import DashboardOut, SearchOut, SummaryOut
from app.db.session import get_db
from app.services import discovery
from app.services.records import RecordError

router = APIRouter(tags=["discovery"])
DB = Depends(get_db)


@router.get("/search", response_model=SearchOut)
def search(
    q: str,
    experiment_page: int = Query(1, ge=1),
    compound_page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: Session = DB,
) -> dict[str, Any]:
    if not q.strip() or len(q.strip()) > 200:
        raise RecordError(422, "VALIDATION_ERROR", "搜索词需为 1–200 个字符")
    return discovery.search(db, q, experiment_page, compound_page, page_size)


@router.get("/dashboard", response_model=DashboardOut)
def dashboard(db: Session = DB) -> dict[str, Any]:
    return discovery.dashboard(db)


@router.get("/experiments/{experiment_id}/summary", response_model=SummaryOut)
def summary(
    experiment_id: UUID,
    format: Literal["json", "markdown"] = "json",
    db: Session = DB,
) -> SummaryOut | Response:
    result = discovery.summary(db, experiment_id)
    if format == "markdown":
        return Response(
            discovery.markdown(result),
            media_type="text/markdown; charset=utf-8",
            headers={
                "Content-Disposition": (
                    f"attachment; filename={result.experiment.experiment_code}-summary.md"
                )
            },
        )
    return result
