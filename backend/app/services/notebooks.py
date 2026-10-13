"""Notebook allocation and membership changes share the caller's transaction."""

from typing import Any
from uuid import UUID

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.api.notebook_schema import NotebookFields, NotebookPatch, NotebookTransfer
from app.models import Experiment, Notebook
from app.services.records import RecordError, check_version, conflict, lock_record, output

DEFAULT_NOTEBOOK = UUID("00000000-0000-4000-8000-000000000001")


def writable(session: Session, notebook_id: UUID | None) -> Notebook:
    if notebook_id is None and session.info.get("account_id"):
        row = session.scalar(
            select(Notebook)
            .where(Notebook.archived.is_(False))
            .order_by(Notebook.created_at, Notebook.id)
            .limit(1)
            .with_for_update()
        )
    else:
        row = session.scalar(
            select(Notebook)
            .where(Notebook.id == (notebook_id or DEFAULT_NOTEBOOK))
            .with_for_update()
        )
    if row is None:
        raise RecordError(404, "NOT_FOUND", "记录本不存在")
    if row.archived:
        raise conflict("记录本已归档，请选择其他记录本")
    return row


def allocate(session: Session, notebook_id: UUID | None) -> dict[str, Any]:
    row = writable(session, notebook_id)
    number = row.next_number
    row.next_number += 1
    session.flush()
    return {
        "notebook_id": row.id,
        "notebook_number": number,
        "experiment_code": f"{row.code}-{number:04d}",
    }


def notebook_output(session: Session, row: Notebook) -> dict[str, Any]:
    count, last = session.execute(
        select(func.count(Experiment.id), func.max(Experiment.updated_at)).where(
            Experiment.notebook_id == row.id, Experiment.deleted_at.is_(None)
        )
    ).one()
    return {
        key: getattr(row, key)
        for key in (
            "id",
            "code",
            "name",
            "description",
            "archived",
            "version",
            "created_at",
            "updated_at",
        )
    } | {"experiment_count": count, "last_experiment_at": last}


def create(session: Session, payload: NotebookFields) -> dict[str, Any]:
    number = session.scalar(text("SELECT nextval('notebook_code_seq')"))
    row = Notebook(code=f"NB{number:03d}", **payload.model_dump())
    session.add(row)
    session.commit()
    session.refresh(row)
    return notebook_output(session, row)


def patch(session: Session, notebook_id: UUID, payload: NotebookPatch) -> dict[str, Any]:
    row = session.scalar(select(Notebook).where(Notebook.id == notebook_id).with_for_update())
    if row is None:
        raise RecordError(404, "NOT_FOUND", "记录本不存在")
    if row.version != payload.expected_version:
        raise conflict()
    for key, value in payload.model_dump(exclude_unset=True, exclude={"expected_version"}).items():
        setattr(row, key, value)
    row.version += 1
    session.commit()
    session.refresh(row)
    return notebook_output(session, row)


def transfer(session: Session, payload: NotebookTransfer) -> list[dict[str, Any]]:
    rows = []
    for item in sorted(payload.experiments, key=lambda item: item.id):
        row = lock_record(session, Experiment, item.id)
        assert isinstance(row, Experiment)
        check_version(row, item.expected_version)
        rows.append(row)
    target = writable(session, payload.notebook_id)
    if (
        payload.expected_next_number is not None
        and target.next_number != payload.expected_next_number
    ):
        raise conflict("目标记录本编号已变化，请重新选择记录本预览")
    # Keep the source notebook's number order for a batch transfer.
    rows.sort(key=lambda row: (str(row.notebook_id), row.notebook_number or 0, str(row.id)))
    for row in rows:
        if row.notebook_id == payload.notebook_id:
            continue
        for key, value in allocate(session, payload.notebook_id).items():
            setattr(row, key, value)
        row.version += 1
    session.commit()
    return [output(session, row) for row in rows]


def preview(session: Session, payload: NotebookTransfer) -> dict[str, Any]:
    target = session.get(Notebook, payload.notebook_id)
    if target is None:
        raise RecordError(404, "NOT_FOUND", "记录本不存在")
    if target.archived:
        raise conflict("记录本已归档，请选择其他记录本")
    rows = []
    for item in payload.experiments:
        row = session.get(Experiment, item.id)
        if row is None or row.deleted_at is not None:
            raise RecordError(404, "NOT_FOUND", "实验不存在")
        check_version(row, item.expected_version)
        rows.append(row)
    rows.sort(key=lambda row: (str(row.notebook_id), row.notebook_number or 0, str(row.id)))
    number = target.next_number
    items = []
    for row in rows:
        code = row.experiment_code
        if row.notebook_id != target.id:
            code = f"{target.code}-{number:04d}"
            number += 1
        items.append({"id": row.id, "title": row.title, "experiment_code": code})
    return {"next_number": target.next_number, "items": items}
