"""Original file metadata and transfer API."""

from typing import Annotated, Any
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Query, Response, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.files_schema import FileOut, FilePatch
from app.api.records_schema import Page, VersionInput
from app.db.session import get_db
from app.models import Experiment
from app.services import files
from app.services.records import missing

router = APIRouter(tags=["files"])
DB = Depends(get_db)


@router.get("/files", response_model=Page[FileOut])
def all_files(
    experiment_id: UUID | None = None,
    sample_id: UUID | None = None,
    file_type: str | None = None,
    q: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: Session = DB,
) -> dict[str, Any]:
    return files.files_page(
        db,
        experiment_id=experiment_id,
        sample_id=sample_id,
        file_type=file_type,
        q=q,
        page=page,
        size=page_size,
    )


@router.get("/experiments/{experiment_id}/files", response_model=Page[FileOut])
def experiment_files(
    experiment_id: UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: Session = DB,
) -> dict[str, Any]:
    if (
        db.scalar(
            select(Experiment.id).where(
                Experiment.id == experiment_id, Experiment.deleted_at.is_(None)
            )
        )
        is None
    ):
        raise missing()
    return files.files_page(
        db,
        experiment_id=experiment_id,
        sample_id=None,
        file_type=None,
        q=None,
        page=page,
        size=page_size,
    )


@router.post("/experiments/{experiment_id}/files", response_model=FileOut, status_code=201)
def upload_file(
    experiment_id: UUID,
    file: Annotated[UploadFile, File()],
    sample_id: Annotated[UUID | None, Form()] = None,
    instrument_type: Annotated[str | None, Form()] = None,
    notes: Annotated[str | None, Form()] = None,
    db: Session = DB,
) -> dict[str, Any]:
    return files.upload(db, experiment_id, file, sample_id, instrument_type, notes)


@router.get("/files/{file_id}", response_model=FileOut)
def get_file(file_id: UUID, db: Session = DB) -> dict[str, Any]:
    return files.file_output(files.get_file(db, file_id))


@router.patch("/files/{file_id}", response_model=FileOut)
def patch_file(file_id: UUID, payload: FilePatch, db: Session = DB) -> dict[str, Any]:
    return files.patch_file(db, file_id, payload)


@router.get("/files/{file_id}/download")
def download_file(file_id: UUID, db: Session = DB) -> FileResponse:
    row = files.get_file(db, file_id)
    path, name = files.download_path(row)
    fallback = "attachment" + path.suffix
    encoded = quote(name, safe="")
    return FileResponse(
        path,
        media_type=row.file_type,
        headers={
            "Content-Disposition": f"attachment; filename={fallback}; filename*=UTF-8''{encoded}",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.delete("/files/{file_id}", status_code=204)
def delete_file(file_id: UUID, expected_version: int = Query(ge=1), db: Session = DB) -> Response:
    files.change_file(db, file_id, expected_version, restore=False)
    return Response(status_code=204)


@router.post("/files/{file_id}/restore", response_model=FileOut)
def restore_file(file_id: UUID, payload: VersionInput, db: Session = DB) -> dict[str, Any]:
    return files.change_file(db, file_id, payload.expected_version, restore=True) or {}
