"""Read-only trash listing and restoration dependency diagnostics."""

from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.trash_schema import TrashType
from app.models import (
    Compound,
    Experiment,
    ExperimentCompound,
    FileAsset,
    Reaction,
    ReactionComponent,
    Sample,
)

MODELS = {
    "experiment": Experiment,
    "compound": Compound,
    "sample": Sample,
    "reaction": Reaction,
    "component": ReactionComponent,
    "file": FileAsset,
}


def active(
    session: Session,
    model: type[Experiment] | type[Compound] | type[Sample] | type[Reaction],
    item_id: UUID | None,
) -> bool:
    if item_id is None:
        return True
    row: Any = session.get(model, item_id)
    return row is not None and row.deleted_at is None


def reason(session: Session, kind: TrashType, row: Any) -> tuple[bool, str | None]:
    if kind in {"experiment", "compound"}:
        if kind == "experiment":
            compound_ids = set(
                session.scalars(
                    select(ExperimentCompound.compound_id).where(
                        ExperimentCompound.experiment_id == row.id
                    )
                ).all()
            )
            compound_ids.update(
                item
                for item in session.scalars(
                    select(Sample.compound_id).where(
                        Sample.experiment_id == row.id,
                        Sample.deleted_at.is_(None),
                        Sample.compound_id.is_not(None),
                    )
                ).all()
                if item is not None
            )
            compound_ids.update(
                session.scalars(
                    select(ReactionComponent.compound_id)
                    .join(Reaction, Reaction.id == ReactionComponent.reaction_id)
                    .where(
                        Reaction.experiment_id == row.id,
                        Reaction.deleted_at.is_(None),
                        ReactionComponent.deleted_at.is_(None),
                    )
                ).all()
            )
            if compound_ids and session.scalar(
                select(Compound.id)
                .where(Compound.id.in_(compound_ids), Compound.deleted_at.is_not(None))
                .limit(1)
            ):
                return True, "请先恢复关联的化合物"
        return True, None
    if kind == "sample":
        parent_ok = active(session, Experiment, row.experiment_id)
        if not parent_ok:
            return False, "请先恢复所属实验"
        if row.compound_id and not active(session, Compound, row.compound_id):
            return True, "请先恢复关联的化合物"
        return True, None
    if kind == "reaction":
        parent_ok = active(session, Experiment, row.experiment_id)
        if not parent_ok:
            return False, "请先恢复所属实验"
        ids = set(
            session.scalars(
                select(ReactionComponent.compound_id).where(
                    ReactionComponent.reaction_id == row.id, ReactionComponent.deleted_at.is_(None)
                )
            ).all()
        )
        if ids and session.scalar(
            select(Compound.id)
            .where(Compound.id.in_(ids), Compound.deleted_at.is_not(None))
            .limit(1)
        ):
            return True, "请先恢复关联的化合物"
        return True, None
    if kind == "component":
        reaction = session.get(Reaction, row.reaction_id)
        parent_ok = (
            reaction is not None
            and reaction.deleted_at is None
            and active(session, Experiment, reaction.experiment_id)
        )
        if not parent_ok:
            return False, "请先恢复所属反应及实验"
        if not active(session, Compound, row.compound_id):
            return True, "请先恢复关联的化合物"
        if row.is_limiting and session.scalar(
            select(ReactionComponent.id).where(
                ReactionComponent.reaction_id == row.reaction_id,
                ReactionComponent.deleted_at.is_(None),
                ReactionComponent.is_limiting.is_(True),
                ReactionComponent.id != row.id,
            )
        ):
            return True, "已有一个限制反应物，请先取消原来的勾选"
        return True, None
    parent_ok = active(session, Experiment, row.experiment_id)
    if not parent_ok:
        return False, "请先恢复所属实验"
    if row.sample_id and not active(session, Sample, row.sample_id):
        return True, "请先恢复关联的样品"
    return True, None


def label(kind: TrashType, row: Any) -> str:
    if kind == "experiment":
        return f"{row.experiment_code} · {row.title}" if row.experiment_code else row.title
    if kind == "compound":
        return f"{row.cas_number or 'CAS 待确认'} · {row.name or row.codename or '名称待补充'}"
    if kind == "sample":
        return f"{row.sample_code} · {row.name or row.sample_type}"
    if kind == "reaction":
        return str(row.reaction_name)
    if kind == "component":
        return f"{row.role} · {row.compound_id}"
    return str(row.original_filename)


def url(kind: TrashType, row: Any) -> str:
    if kind == "component":
        return f"/api/reactions/{row.reaction_id}/components/{row.id}/restore"
    if kind == "reaction":
        return f"/api/reactions/{row.id}/restore"
    return f"/api/{'files' if kind == 'file' else kind + 's'}/{row.id}/restore"


def page(session: Session, kind: TrashType, number: int, size: int) -> dict[str, Any]:
    model: Any = MODELS[kind]
    statement = select(model).where(model.deleted_at.is_not(None))
    total = session.scalar(select(func.count()).select_from(statement.subquery())) or 0
    rows = session.scalars(
        statement.order_by(model.deleted_at.desc(), model.id.desc())
        .limit(size)
        .offset((number - 1) * size)
    ).all()
    items = []
    for raw_row in rows:
        row: Any = raw_row
        parent_active, block = reason(session, kind, row)
        items.append(
            {
                "id": row.id,
                "type": kind,
                "label": label(kind, row),
                "deleted_at": row.deleted_at,
                "version": row.version,
                "parent_active": parent_active,
                "restore_block_reason": block,
                "restore_url": url(kind, row),
            }
        )
    return {"items": items, "page": number, "page_size": size, "total": total}
