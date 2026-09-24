"""Conditional updates make stale writes fail without overwriting newer data."""

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import update
from sqlalchemy.orm import Session

from app.models import Compound, Experiment, FileAsset, Reaction, ReactionComponent, Sample, Tag

VersionedModel = type[
    Experiment | Compound | Sample | Reaction | ReactionComponent | FileAsset | Tag
]


def update_if_version(
    session: Session,
    model: VersionedModel,
    record_id: UUID,
    expected_version: int,
    values: dict[str, Any],
    *,
    deleted: bool | None = None,
) -> bool:
    if (
        expected_version < 1
        or {"id", "version", "created_at", "updated_at", "deleted_at"} & values.keys()
    ):
        raise ValueError("Invalid version or protected field")
    if model is Tag and deleted is not None:
        raise ValueError("Tags are not soft-deleted")
    changes = {**values, "version": model.version + 1, "updated_at": datetime.now(UTC)}
    if deleted is not None:
        changes["deleted_at"] = datetime.now(UTC) if deleted else None
    result = session.execute(
        update(model)
        .where(model.id == record_id, model.version == expected_version)
        .values(**changes)
    )
    return result.rowcount == 1
