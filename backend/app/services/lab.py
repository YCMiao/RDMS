"""Stage 04 lifecycle rules and queries."""

from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.lab_schema import (
    ComponentFields,
    ComponentPatch,
    ReactionFields,
    ReactionPatch,
    SampleFields,
    SamplePatch,
)
from app.models import Compound, Experiment, Reaction, ReactionComponent, Sample
from app.services import visibility
from app.services.numbering import allocate_code
from app.services.records import RecordError, conflict, lock_record, missing
from app.services.versioning import update_if_version


def out(row: Sample | Reaction | ReactionComponent) -> dict[str, Any]:
    fields = {
        Sample: (
            "sample_code",
            "experiment_id",
            "compound_id",
            "name",
            "sample_type",
            "amount",
            "unit",
            "concentration",
            "concentration_unit",
            "notes",
        ),
        Reaction: (
            "experiment_id",
            "reaction_name",
            "temperature_c",
            "reaction_time_hours",
            "atmosphere",
            "solvent",
            "notes",
        ),
        ReactionComponent: (
            "reaction_id",
            "compound_id",
            "role",
            "amount",
            "unit",
            "mmol",
            "equivalents",
            "yield_percent",
            "sort_order",
            "notes",
        ),
    }[type(row)]
    return {
        key: getattr(row, key) for key in ("id", "created_at", "updated_at", "version", *fields)
    }


def page(session: Session, statement: Any, number: int, size: int) -> dict[str, Any]:
    total = (
        session.scalar(select(func.count()).select_from(statement.order_by(None).subquery())) or 0
    )
    rows = session.scalars(statement.limit(size).offset((number - 1) * size)).all()
    return {"items": [out(row) for row in rows], "page": number, "page_size": size, "total": total}


def samples(
    session: Session,
    *,
    experiment_id: UUID | None,
    compound_id: UUID | None,
    q: str | None,
    number: int,
    size: int,
) -> dict[str, Any]:
    statement = visibility.visible_samples()
    if experiment_id is not None:
        statement = statement.where(Sample.experiment_id == experiment_id)
    if compound_id is not None:
        statement = statement.where(Sample.compound_id == compound_id)
    if q:
        statement = statement.where(
            Sample.sample_code.ilike(f"%{q}%") | Sample.name.ilike(f"%{q}%")
        )
    return page(
        session, statement.order_by(Sample.created_at.desc(), Sample.id.desc()), number, size
    )


def reactions(session: Session, experiment_id: UUID, number: int, size: int) -> dict[str, Any]:
    if (
        session.scalar(
            select(Experiment.id).where(
                Experiment.id == experiment_id, Experiment.deleted_at.is_(None)
            )
        )
        is None
    ):
        raise missing()
    return page(
        session,
        visibility.visible_reactions()
        .where(Reaction.experiment_id == experiment_id)
        .order_by(Reaction.created_at, Reaction.id),
        number,
        size,
    )


def components(session: Session, reaction_id: UUID, number: int, size: int) -> dict[str, Any]:
    if session.scalar(visibility.visible_reactions().where(Reaction.id == reaction_id)) is None:
        raise missing()
    return page(
        session,
        visibility.visible_components()
        .where(ReactionComponent.reaction_id == reaction_id)
        .order_by(ReactionComponent.sort_order, ReactionComponent.created_at, ReactionComponent.id),
        number,
        size,
    )


def get_sample(session: Session, sample_id: UUID) -> dict[str, Any]:
    row = session.scalar(visibility.visible_samples().where(Sample.id == sample_id))
    if row is None:
        raise missing()
    return out(row)


def get_reaction(session: Session, reaction_id: UUID) -> dict[str, Any]:
    row = session.scalar(visibility.visible_reactions().where(Reaction.id == reaction_id))
    if row is None:
        raise missing()
    return out(row)


def validate(values: dict[str, Any], *, component: bool = False) -> None:
    if (values.get("amount") is None) != (values.get("unit") is None):
        raise RecordError(422, "VALIDATION_ERROR", "数量和单位必须同时填写")
    if not component and (values.get("concentration") is None) != (
        values.get("concentration_unit") is None
    ):
        raise RecordError(422, "VALIDATION_ERROR", "浓度和单位必须同时填写")
    if component and values.get("yield_percent") is not None and values.get("role") != "product":
        raise RecordError(422, "VALIDATION_ERROR", "仅产物可填写收率")


def compound_locks(session: Session, ids: set[UUID]) -> None:
    if not ids:
        return
    rows = session.scalars(
        select(Compound).where(Compound.id.in_(ids)).order_by(Compound.id).with_for_update()
    ).all()
    if len(rows) != len(ids) or any(row.deleted_at is not None for row in rows):
        raise conflict("关联化合物不存在或已删除")


def sample_parent(
    session: Session, sample_id: UUID, *, restore: bool = False
) -> tuple[Experiment, Sample]:
    experiment_id = session.scalar(select(Sample.experiment_id).where(Sample.id == sample_id))
    if experiment_id is None:
        raise missing()
    parent = lock_record(session, Experiment, experiment_id, active=False)
    if parent.deleted_at is not None:
        if restore:
            raise conflict("请先恢复所属实验")
        raise missing()
    row = session.scalar(select(Sample).where(Sample.id == sample_id).with_for_update())
    if row is None:
        raise missing()
    assert isinstance(parent, Experiment)
    return parent, row


def reaction_parent(
    session: Session, reaction_id: UUID, *, restore: bool = False
) -> tuple[Experiment, Reaction]:
    experiment_id = session.scalar(select(Reaction.experiment_id).where(Reaction.id == reaction_id))
    if experiment_id is None:
        raise missing()
    parent = lock_record(session, Experiment, experiment_id, active=False)
    if parent.deleted_at is not None:
        if restore:
            raise conflict("请先恢复所属实验")
        raise missing()
    row = session.scalar(select(Reaction).where(Reaction.id == reaction_id).with_for_update())
    if row is None:
        raise missing()
    assert isinstance(parent, Experiment)
    return parent, row


def create_sample(session: Session, payload: SampleFields) -> dict[str, Any]:
    lock_record(session, Experiment, payload.experiment_id)
    if payload.compound_id:
        compound_locks(session, {payload.compound_id})
    values = payload.model_dump()
    validate(values)
    row = Sample(**values, sample_code=allocate_code(session, "SMP"))
    session.add(row)
    session.commit()
    session.refresh(row)
    return out(row)


def patch_sample(session: Session, sample_id: UUID, payload: SamplePatch) -> dict[str, Any]:
    _, row = sample_parent(session, sample_id)
    if row.deleted_at is not None:
        raise missing()
    if row.version != payload.expected_version:
        raise conflict()
    changes = payload.model_dump(exclude_unset=True, exclude={"expected_version"})
    if changes.get("sample_type", "valid") is None or changes.get("sample_type", "valid") == "":
        raise RecordError(422, "VALIDATION_ERROR", "样品类型不能为空")
    if changes.get("compound_id") is not None:
        compound_locks(session, {changes["compound_id"]})
    validate({**out(row), **changes})
    if not update_if_version(session, Sample, sample_id, payload.expected_version, changes):
        raise conflict()
    session.commit()
    session.refresh(row)
    return out(row)


def change_sample(
    session: Session, sample_id: UUID, version: int, *, restore: bool
) -> dict[str, Any] | None:
    _, row = sample_parent(session, sample_id, restore=restore)
    if (row.deleted_at is None) == restore:
        raise missing()
    if row.version != version:
        raise conflict()
    if restore and row.compound_id:
        compound_locks(session, {row.compound_id})
    if not update_if_version(session, Sample, sample_id, version, {}, deleted=not restore):
        raise conflict()
    session.commit()
    session.refresh(row)
    return out(row) if restore else None


def create_reaction(
    session: Session, experiment_id: UUID, payload: ReactionFields
) -> dict[str, Any]:
    lock_record(session, Experiment, experiment_id)
    row = Reaction(experiment_id=experiment_id, **payload.model_dump())
    session.add(row)
    session.commit()
    session.refresh(row)
    return out(row)


def patch_reaction(session: Session, reaction_id: UUID, payload: ReactionPatch) -> dict[str, Any]:
    _, row = reaction_parent(session, reaction_id)
    if row.deleted_at is not None:
        raise missing()
    if row.version != payload.expected_version:
        raise conflict()
    changes = payload.model_dump(exclude_unset=True, exclude={"expected_version"})
    if "reaction_name" in changes and (
        changes["reaction_name"] is None or not changes["reaction_name"].strip()
    ):
        raise RecordError(422, "VALIDATION_ERROR", "反应名称不能为空")
    if not update_if_version(session, Reaction, reaction_id, payload.expected_version, changes):
        raise conflict()
    session.commit()
    session.refresh(row)
    return out(row)


def change_reaction(
    session: Session, reaction_id: UUID, version: int, *, restore: bool
) -> dict[str, Any] | None:
    _, row = reaction_parent(session, reaction_id, restore=restore)
    if (row.deleted_at is None) == restore:
        raise missing()
    if row.version != version:
        raise conflict()
    if restore:
        ids = set(
            session.scalars(
                select(ReactionComponent.compound_id).where(
                    ReactionComponent.reaction_id == reaction_id,
                    ReactionComponent.deleted_at.is_(None),
                )
            ).all()
        )
        compound_locks(session, ids)
    if not update_if_version(session, Reaction, reaction_id, version, {}, deleted=not restore):
        raise conflict()
    session.commit()
    session.refresh(row)
    return out(row) if restore else None


def create_component(
    session: Session, reaction_id: UUID, payload: ComponentFields
) -> dict[str, Any]:
    _, reaction = reaction_parent(session, reaction_id)
    if reaction.deleted_at is not None:
        raise missing()
    compound_locks(session, {payload.compound_id})
    values = payload.model_dump(exclude={"sort_order"})
    validate(values, component=True)
    order = payload.sort_order
    if order is None:
        order = (
            session.scalar(
                select(func.coalesce(func.max(ReactionComponent.sort_order), -1) + 1).where(
                    ReactionComponent.reaction_id == reaction_id
                )
            )
            or 0
        )
    row = ReactionComponent(reaction_id=reaction_id, sort_order=order, **values)
    session.add(row)
    session.commit()
    session.refresh(row)
    return out(row)


def component_row(
    session: Session, reaction_id: UUID, component_id: UUID, *, restore: bool = False
) -> ReactionComponent:
    _, reaction = reaction_parent(session, reaction_id, restore=restore)
    if reaction.deleted_at is not None:
        if restore:
            raise conflict("请先恢复所属反应")
        raise missing()
    row = session.scalar(
        select(ReactionComponent)
        .where(ReactionComponent.id == component_id, ReactionComponent.reaction_id == reaction_id)
        .with_for_update()
    )
    if row is None:
        raise missing()
    return row


def patch_component(
    session: Session, reaction_id: UUID, component_id: UUID, payload: ComponentPatch
) -> dict[str, Any]:
    row = component_row(session, reaction_id, component_id)
    if row.deleted_at is not None:
        raise missing()
    if row.version != payload.expected_version:
        raise conflict()
    changes = payload.model_dump(exclude_unset=True, exclude={"expected_version"})
    if any(changes.get(key, True) is None for key in ("compound_id", "role", "sort_order")):
        raise RecordError(422, "VALIDATION_ERROR", "必填字段不能为 null")
    if changes.get("compound_id"):
        compound_locks(session, {changes["compound_id"]})
    validate({**out(row), **changes}, component=True)
    if not update_if_version(
        session, ReactionComponent, component_id, payload.expected_version, changes
    ):
        raise conflict()
    session.commit()
    session.refresh(row)
    return out(row)


def change_component(
    session: Session, reaction_id: UUID, component_id: UUID, version: int, *, restore: bool
) -> dict[str, Any] | None:
    row = component_row(session, reaction_id, component_id, restore=restore)
    if (row.deleted_at is None) == restore:
        raise missing()
    if row.version != version:
        raise conflict()
    if restore:
        compound_locks(session, {row.compound_id})
    if not update_if_version(
        session, ReactionComponent, component_id, version, {}, deleted=not restore
    ):
        raise conflict()
    session.commit()
    session.refresh(row)
    return out(row) if restore else None
