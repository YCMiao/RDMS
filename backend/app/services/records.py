"""Stage 03 transactions and record serialization."""

from typing import Any
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.records_schema import (
    CompoundFields,
    CompoundPatch,
    ExperimentFields,
    ExperimentPatch,
    TagPatch,
)
from app.models import (
    Compound,
    CompoundTag,
    Experiment,
    ExperimentCompound,
    ExperimentTag,
    Reaction,
    ReactionComponent,
    Sample,
    Tag,
)
from app.repositories import records as repository
from app.services.numbering import allocate_code
from app.services.versioning import update_if_version


class RecordError(Exception):
    def __init__(self, status: int, code: str, message: str):
        self.status = status
        self.code = code
        self.message = message


def missing() -> RecordError:
    return RecordError(404, "NOT_FOUND", "记录不存在或已删除")


def conflict(message: str = "记录已被修改，请刷新后重试") -> RecordError:
    return RecordError(409, "VERSION_CONFLICT", message)


def lock_record(
    session: Session,
    model: type[Experiment] | type[Compound],
    record_id: UUID,
    *,
    active: bool = True,
) -> Experiment | Compound:
    record: Experiment | Compound | None
    if model is Experiment:
        record = session.scalar(
            select(Experiment).where(Experiment.id == record_id).with_for_update()
        )
    else:
        record = session.scalar(select(Compound).where(Compound.id == record_id).with_for_update())
    if record is None or (active and record.deleted_at is not None):
        raise missing()
    return record


def check_version(record: Experiment | Compound | Tag, version: int) -> None:
    if record.version != version:
        raise conflict()


def get_tags(
    session: Session, model: type[Experiment] | type[Compound], record_id: UUID
) -> list[dict[str, Any]]:
    tags = repository.tags_for_record(session, model, record_id)
    return [{"id": tag.id, "name": tag.name, "version": tag.version} for tag in tags]


def output(session: Session, record: Experiment | Compound) -> dict[str, Any]:
    keys = (
        (
            "experiment_code",
            "title",
            "date",
            "objective",
            "procedure",
            "observation",
            "result",
            "conclusion",
            "status",
        )
        if isinstance(record, Experiment)
        else (
            "compound_code",
            "name",
            "smiles",
            "molecular_formula",
            "molecular_weight",
            "notes",
            "structure_molfile",
            "inchi_key",
            "exact_mass",
            "cas_number",
            "cas_source",
            "physical_properties",
        )
    )
    result = {
        key: getattr(record, key) for key in ("id", "created_at", "updated_at", "version", *keys)
    }
    result["tags"] = get_tags(
        session, Experiment if isinstance(record, Experiment) else Compound, record.id
    )
    return result


def require_tags(session: Session, ids: list[UUID]) -> list[UUID]:
    unique = sorted(set(ids))
    if len(unique) != len(ids):
        raise RecordError(422, "VALIDATION_ERROR", "标签不能重复选择")
    if unique:
        found = set(
            session.scalars(
                select(Tag.id)
                .where(Tag.id.in_(unique))
                .order_by(Tag.id)
                .with_for_update(read=True, key_share=True)
            ).all()
        )
        if found != set(unique):
            raise RecordError(422, "VALIDATION_ERROR", "包含不存在的标签")
    return unique


def replace_tags(
    session: Session, model: type[Experiment] | type[Compound], record_id: UUID, ids: list[UUID]
) -> None:
    unique = require_tags(session, ids)
    link: type[ExperimentTag] | type[CompoundTag]
    if model is Experiment:
        link, column = ExperimentTag, ExperimentTag.experiment_id
    else:
        link, column = CompoundTag, CompoundTag.compound_id
    session.execute(delete(link).where(column == record_id))
    session.add_all(
        [
            link(
                **(
                    {"experiment_id": record_id}
                    if model is Experiment
                    else {"compound_id": record_id}
                ),
                tag_id=tag_id,
            )
            for tag_id in unique
        ]
    )
    session.flush()


def create_record(
    session: Session,
    model: type[Experiment] | type[Compound],
    payload: ExperimentFields | CompoundFields,
) -> dict[str, Any]:
    values = payload.model_dump(exclude={"tag_ids"})
    if model is Compound and values.get("structure_molfile"):
        from app.services.chemistry import parse_structure

        parsed = parse_structure(values["structure_molfile"], "molfile")
        values.update(
            structure_molfile=parsed.molfile,
            smiles=parsed.smiles,
            molecular_formula=parsed.molecular_formula,
            molecular_weight=parsed.molecular_weight,
            exact_mass=parsed.exact_mass,
            inchi_key=parsed.inchi_key,
        )
    record = model(
        **values,
        **(
            {"experiment_code": allocate_code(session, "EXP")}
            if model is Experiment
            else {"compound_code": allocate_code(session, "CMP")}
        ),
    )
    session.add(record)
    session.flush()
    replace_tags(session, model, record.id, payload.tag_ids)
    session.commit()
    session.refresh(record)
    return output(session, record)


def update_record(
    session: Session,
    model: type[Experiment] | type[Compound],
    record_id: UUID,
    payload: ExperimentPatch | CompoundPatch,
) -> dict[str, Any]:
    record = lock_record(session, model, record_id)
    check_version(record, payload.expected_version)
    values = payload.model_dump(exclude_unset=True, exclude={"expected_version", "tag_ids"})
    if (
        isinstance(record, Compound)
        and record.structure_molfile
        and "structure_molfile" not in values
    ):
        for derived in ("smiles", "molecular_formula", "molecular_weight"):
            values.pop(derived, None)
    if model is Compound and "structure_molfile" in values:
        if values["structure_molfile"]:
            from app.services.chemistry import parse_structure

            parsed = parse_structure(values["structure_molfile"], "molfile")
            values.update(
                structure_molfile=parsed.molfile,
                smiles=parsed.smiles,
                molecular_formula=parsed.molecular_formula,
                molecular_weight=parsed.molecular_weight,
                exact_mass=parsed.exact_mass,
                inchi_key=parsed.inchi_key,
            )
            if isinstance(record, Compound) and record.inchi_key != parsed.inchi_key:
                values.setdefault("cas_number", None)
                values.setdefault("cas_source", None)
                values.setdefault("physical_properties", [])
        else:
            values.update(
                structure_molfile=None,
                inchi_key=None,
                exact_mass=None,
                cas_number=None,
                cas_source=None,
                physical_properties=[],
            )
    if "date" in values and values["date"] is None:
        raise RecordError(422, "VALIDATION_ERROR", "日期不能为空")
    for field in (
        "objective",
        "procedure",
        "observation",
        "result",
        "conclusion",
        "smiles",
        "molecular_formula",
        "notes",
    ):
        if isinstance(values.get(field), str):
            values[field] = values[field].strip()
    if "tag_ids" in payload.model_fields_set:
        replace_tags(session, model, record_id, payload.tag_ids or [])
    if not update_if_version(session, model, record_id, payload.expected_version, values):
        raise conflict()
    session.commit()
    session.refresh(record)
    return output(session, record)


def change_deleted(
    session: Session,
    model: type[Experiment] | type[Compound],
    record_id: UUID,
    version: int,
    *,
    restore: bool,
) -> dict[str, Any] | None:
    record = lock_record(session, model, record_id, active=False)
    if restore and record.deleted_at is None or not restore and record.deleted_at is not None:
        raise missing()
    check_version(record, version)
    if model is Compound and not restore and repository.compound_has_references(session, record_id):
        raise conflict("化合物仍被有效实验、样品或反应引用")
    if restore and model is Experiment:
        compound_ids = set(
            session.scalars(
                select(ExperimentCompound.compound_id).where(
                    ExperimentCompound.experiment_id == record_id
                )
            ).all()
        )
        compound_ids.update(
            item
            for item in session.scalars(
                select(Sample.compound_id).where(
                    Sample.experiment_id == record_id,
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
                    Reaction.experiment_id == record_id,
                    Reaction.deleted_at.is_(None),
                    ReactionComponent.deleted_at.is_(None),
                )
            ).all()
        )
        if compound_ids:
            compounds = session.scalars(
                select(Compound)
                .where(Compound.id.in_(compound_ids))
                .order_by(Compound.id)
                .with_for_update()
            ).all()
            if len(compounds) != len(compound_ids) or any(
                compound.deleted_at is not None for compound in compounds
            ):
                raise conflict("请先恢复关联的化合物")
    if not update_if_version(session, model, record_id, version, {}, deleted=not restore):
        raise conflict()
    session.commit()
    session.refresh(record)
    return output(session, record) if restore else None


def tag_output(tag: Tag) -> dict[str, Any]:
    return {"id": tag.id, "name": tag.name, "version": tag.version}


def create_tag(session: Session, name: str) -> dict[str, Any]:
    tag = Tag(name=name, normalized_name=name.casefold())
    session.add(tag)
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise conflict("标签名称已存在") from exc
    session.refresh(tag)
    return tag_output(tag)


def update_tag(session: Session, tag_id: UUID, payload: TagPatch) -> dict[str, Any]:
    tag = session.scalar(select(Tag).where(Tag.id == tag_id).with_for_update())
    if tag is None:
        raise missing()
    check_version(tag, payload.expected_version)
    try:
        update_if_version(
            session,
            Tag,
            tag_id,
            payload.expected_version,
            {"name": payload.name, "normalized_name": payload.name.casefold()},
        )
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise conflict("标签名称已存在") from exc
    session.refresh(tag)
    return tag_output(tag)


def delete_tag(session: Session, tag_id: UUID, version: int) -> None:
    # Take a compatible key-share lock before parent locks. Writers lock the parent
    # before taking a key-share tag lock, so this order avoids a lock cycle.
    tag = session.scalar(
        select(Tag).where(Tag.id == tag_id).with_for_update(read=True, key_share=True)
    )
    if tag is None:
        raise missing()
    check_version(tag, version)
    experiment_ids = set(
        session.scalars(
            select(ExperimentTag.experiment_id).where(ExperimentTag.tag_id == tag_id)
        ).all()
    )
    compound_ids = set(
        session.scalars(select(CompoundTag.compound_id).where(CompoundTag.tag_id == tag_id)).all()
    )
    experiments = session.scalars(
        select(Experiment)
        .where(Experiment.id.in_(experiment_ids))
        .order_by(Experiment.id)
        .with_for_update()
    ).all()
    compounds = session.scalars(
        select(Compound)
        .where(Compound.id.in_(compound_ids))
        .order_by(Compound.id)
        .with_for_update()
    ).all()
    session.scalar(select(Tag.id).where(Tag.id == tag_id).with_for_update())
    current_experiments = set(
        session.scalars(
            select(ExperimentTag.experiment_id).where(ExperimentTag.tag_id == tag_id)
        ).all()
    )
    current_compounds = set(
        session.scalars(select(CompoundTag.compound_id).where(CompoundTag.tag_id == tag_id)).all()
    )
    if current_experiments - experiment_ids or current_compounds - compound_ids:
        raise conflict("标签关联同时发生变化，请重试删除")
    for experiment in experiments:
        update_if_version(session, Experiment, experiment.id, experiment.version, {})
    for compound in compounds:
        update_if_version(session, Compound, compound.id, compound.version, {})
    session.delete(tag)
    session.commit()


def link_compound(
    session: Session, experiment_id: UUID, compound_id: UUID, version: int, *, remove: bool = False
) -> None:
    experiment = lock_record(session, Experiment, experiment_id)
    check_version(experiment, version)
    # Compound is always locked after Experiment; stage 04 writers must use this order.
    compound = lock_record(session, Compound, compound_id)
    del compound
    existing = session.get(ExperimentCompound, (experiment_id, compound_id))
    if remove:
        if existing is None:
            raise missing()
        session.delete(existing)
    else:
        if existing is not None:
            raise conflict("显式关联已经存在")
        session.add(ExperimentCompound(experiment_id=experiment_id, compound_id=compound_id))
    if not update_if_version(session, Experiment, experiment_id, version, {}):
        raise conflict()
    session.commit()


def list_records(
    session: Session,
    model: type[Experiment] | type[Compound],
    *,
    q: str | None,
    tag_id: UUID | None,
    page: int,
    page_size: int,
    sort: str,
    status: str | None = None,
    date_from: Any = None,
    date_to: Any = None,
) -> dict[str, Any]:
    rows, total = repository.records_page(
        session,
        model,
        q=q,
        tag_id=tag_id,
        page=page,
        page_size=page_size,
        sort=sort,
        status=status,
        date_from=date_from,
        date_to=date_to,
    )
    return {
        "items": [output(session, row) for row in rows],
        "page": page,
        "page_size": page_size,
        "total": total,
    }


def relation_page(
    session: Session,
    *,
    experiment_id: UUID | None = None,
    compound_id: UUID | None = None,
    page: int,
    page_size: int,
) -> dict[str, Any]:
    if experiment_id:
        record = repository.active_record(session, Experiment, experiment_id)
    else:
        if compound_id is None:
            raise ValueError("A relationship query requires a record ID")
        record = repository.active_record(session, Compound, compound_id)
    if record is None:
        raise missing()
    rows, total = repository.relationship_page(
        session,
        experiment_id=experiment_id,
        compound_id=compound_id,
        page=page,
        page_size=page_size,
    )
    items = [
        {
            ("compound" if experiment_id else "experiment"): output(session, item),
            "sources": sorted(sources),
        }
        for item, sources in rows
    ]
    return {"items": items, "page": page, "page_size": page_size, "total": total}
