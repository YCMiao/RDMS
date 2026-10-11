from datetime import date
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.api.records_schema import (
    CompoundBulkTag,
    CompoundBulkTagOut,
    CompoundFields,
    CompoundOut,
    CompoundPatch,
    ExperimentCopy,
    ExperimentFields,
    ExperimentOut,
    ExperimentPatch,
    ExperimentRelationOut,
    LinkInput,
    Page,
    ReactionBrief,
    RelationOut,
    SampleBrief,
    TagCreate,
    TagOut,
    TagPatch,
    VersionInput,
)
from app.db.session import get_db
from app.models import Compound, Experiment
from app.repositories import records as repository
from app.services import records

router = APIRouter(tags=["records"])
DB = Depends(get_db)


@router.get("/experiments", response_model=Page[ExperimentOut])
def experiments(
    db: Session = DB,
    q: str | None = None,
    status_filter: str | None = Query(None, alias="status"),
    date_from: date | None = None,
    date_to: date | None = None,
    tag_id: UUID | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    sort: Literal["date_desc", "date_asc", "created_desc", "name_asc"] = "date_desc",
) -> dict[str, object]:
    if status_filter and status_filter not in {"draft", "in_progress", "completed", "cancelled"}:
        raise records.RecordError(422, "VALIDATION_ERROR", "无效的实验状态")
    return records.list_records(
        db,
        Experiment,
        q=q,
        tag_id=tag_id,
        page=page,
        page_size=page_size,
        sort=sort if sort in {"date_desc", "date_asc"} else "date_desc",
        status=status_filter,
        date_from=date_from,
        date_to=date_to,
    )


@router.post("/experiments", response_model=ExperimentOut, status_code=201)
def create_experiment(payload: ExperimentFields, db: Session = DB) -> dict[str, object]:
    return records.create_record(db, Experiment, payload)


@router.post("/experiments/{record_id}/copy", response_model=ExperimentOut, status_code=201)
def copy_experiment(
    record_id: UUID, payload: ExperimentCopy, db: Session = DB
) -> dict[str, object]:
    from app.services.experiment_copy import copy_experiment as copy

    return copy(db, record_id, payload)


@router.get("/experiments/{record_id}", response_model=ExperimentOut)
def get_experiment(record_id: UUID, db: Session = DB) -> dict[str, object]:
    record = repository.active_record(db, Experiment, record_id)
    if record is None:
        raise records.missing()
    return records.output(db, record)


@router.patch("/experiments/{record_id}", response_model=ExperimentOut)
def patch_experiment(
    record_id: UUID, payload: ExperimentPatch, db: Session = DB
) -> dict[str, object]:
    return records.update_record(db, Experiment, record_id, payload)


@router.delete("/experiments/{record_id}", status_code=204)
def delete_experiment(
    record_id: UUID, expected_version: int = Query(ge=1), db: Session = DB
) -> Response:
    records.change_deleted(db, Experiment, record_id, expected_version, restore=False)
    return Response(status_code=204)


@router.post("/experiments/{record_id}/restore", response_model=ExperimentOut)
def restore_experiment(
    record_id: UUID, payload: VersionInput, db: Session = DB
) -> dict[str, object]:
    return records.change_deleted(db, Experiment, record_id, payload.expected_version, restore=True)  # type: ignore[return-value]


@router.get("/experiments/{record_id}/compounds", response_model=Page[RelationOut])
def experiment_compounds(
    record_id: UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: Session = DB,
) -> dict[str, object]:
    return records.relation_page(db, experiment_id=record_id, page=page, page_size=page_size)


@router.post("/experiments/{record_id}/compounds", status_code=201)
def add_compound(record_id: UUID, payload: LinkInput, db: Session = DB) -> dict[str, str]:
    records.link_compound(db, record_id, payload.compound_id, payload.expected_version)
    return {"status": "linked"}


@router.delete("/experiments/{record_id}/compounds/{compound_id}", status_code=204)
def remove_compound(
    record_id: UUID,
    compound_id: UUID,
    expected_version: int = Query(ge=1),
    db: Session = DB,
) -> Response:
    records.link_compound(db, record_id, compound_id, expected_version, remove=True)
    return Response(status_code=204)


@router.get("/compounds", response_model=Page[CompoundOut])
def compounds(
    db: Session = DB,
    q: str | None = None,
    tag_id: UUID | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    sort: Literal["created_desc", "name_asc", "date_desc", "date_asc"] = "created_desc",
) -> dict[str, object]:
    return records.list_records(
        db,
        Compound,
        q=q,
        tag_id=tag_id,
        page=page,
        page_size=page_size,
        sort=sort if sort in {"created_desc", "name_asc"} else "created_desc",
    )


@router.post("/compounds", response_model=CompoundOut, status_code=201)
def create_compound(payload: CompoundFields, db: Session = DB) -> dict[str, object]:
    return records.create_record(db, Compound, payload)


@router.post("/compounds/bulk-tag", response_model=CompoundBulkTagOut)
def bulk_tag_compounds(payload: CompoundBulkTag, db: Session = DB) -> dict[str, object]:
    return records.bulk_tag_compounds(db, payload)


@router.get("/compounds/{record_id}", response_model=CompoundOut)
def get_compound(record_id: UUID, db: Session = DB) -> dict[str, object]:
    record = repository.active_record(db, Compound, record_id)
    if record is None:
        raise records.missing()
    return records.output(db, record)


@router.patch("/compounds/{record_id}", response_model=CompoundOut)
def patch_compound(record_id: UUID, payload: CompoundPatch, db: Session = DB) -> dict[str, object]:
    return records.update_record(db, Compound, record_id, payload)


@router.delete("/compounds/{record_id}", status_code=204)
def delete_compound(
    record_id: UUID, expected_version: int = Query(ge=1), db: Session = DB
) -> Response:
    records.change_deleted(db, Compound, record_id, expected_version, restore=False)
    return Response(status_code=204)


@router.post("/compounds/{record_id}/restore", response_model=CompoundOut)
def restore_compound(record_id: UUID, payload: VersionInput, db: Session = DB) -> dict[str, object]:
    return records.change_deleted(db, Compound, record_id, payload.expected_version, restore=True)  # type: ignore[return-value]


@router.get("/compounds/{record_id}/experiments", response_model=Page[ExperimentRelationOut])
def compound_experiments(
    record_id: UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: Session = DB,
) -> dict[str, object]:
    return records.relation_page(db, compound_id=record_id, page=page, page_size=page_size)


@router.get("/compounds/{record_id}/reactions", response_model=Page[ReactionBrief])
def compound_reactions(
    record_id: UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: Session = DB,
) -> dict[str, object]:
    record = repository.active_record(db, Compound, record_id)
    if record is None:
        raise records.missing()
    items, total = repository.compound_reactions_page(db, record_id, page=page, page_size=page_size)
    return {
        "items": [
            {
                "id": item.id,
                "experiment_id": item.experiment_id,
                "reaction_name": item.reaction_name,
            }
            for item in items
        ],
        "page": page,
        "page_size": page_size,
        "total": total,
    }


@router.get("/compounds/{record_id}/samples", response_model=Page[SampleBrief])
def compound_samples(
    record_id: UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: Session = DB,
) -> dict[str, object]:
    record = repository.active_record(db, Compound, record_id)
    if record is None:
        raise records.missing()
    items, total = repository.compound_samples_page(db, record_id, page=page, page_size=page_size)
    return {
        "items": [
            {
                "id": item.id,
                "experiment_id": item.experiment_id,
                "sample_code": item.sample_code,
                "name": item.name,
                "sample_type": item.sample_type,
            }
            for item in items
        ],
        "page": page,
        "page_size": page_size,
        "total": total,
    }


@router.get("/tags", response_model=Page[TagOut])
def tags(
    db: Session = DB,
    q: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
) -> dict[str, object]:
    items, total = repository.tags_page(db, q=q, page=page, page_size=page_size)
    return {
        "items": [records.tag_output(item) for item in items],
        "page": page,
        "page_size": page_size,
        "total": total,
    }


@router.post("/tags", response_model=TagOut, status_code=201)
def create_tag(payload: TagCreate, db: Session = DB) -> dict[str, object]:
    return records.create_tag(db, payload.name)


@router.patch("/tags/{tag_id}", response_model=TagOut)
def patch_tag(tag_id: UUID, payload: TagPatch, db: Session = DB) -> dict[str, object]:
    return records.update_tag(db, tag_id, payload)


@router.delete("/tags/{tag_id}", status_code=204)
def delete_tag(tag_id: UUID, expected_version: int = Query(ge=1), db: Session = DB) -> Response:
    records.delete_tag(db, tag_id, expected_version)
    return Response(status_code=204)
