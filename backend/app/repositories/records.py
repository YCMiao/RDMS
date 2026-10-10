"""Read queries for experiment, compound, tag and derived relationships."""

from typing import Any, cast
from uuid import UUID

from sqlalchemy import Select, func, literal, or_, select, union_all
from sqlalchemy.orm import Session

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
from app.services.visibility import visible_reactions, visible_samples


def escaped(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def page_query(
    session: Session, statement: Select[Any], page: int, page_size: int
) -> tuple[list[Any], int]:
    total = (
        session.scalar(select(func.count()).select_from(statement.order_by(None).subquery())) or 0
    )
    rows = session.scalars(statement.offset((page - 1) * page_size).limit(page_size)).all()
    return list(rows), total


def tags_for_record(
    session: Session, model: type[Experiment] | type[Compound], record_id: UUID
) -> list[Tag]:
    link: type[ExperimentTag] | type[CompoundTag]
    if model is Experiment:
        link, column = ExperimentTag, ExperimentTag.experiment_id
    else:
        link, column = CompoundTag, CompoundTag.compound_id
    return list(
        session.scalars(
            select(Tag)
            .join(link, Tag.id == link.tag_id)
            .where(column == record_id)
            .order_by(Tag.name, Tag.id)
        ).all()
    )


def active_record(
    session: Session, model: type[Experiment] | type[Compound], record_id: UUID
) -> Experiment | Compound | None:
    record: Experiment | Compound | None
    if model is Experiment:
        record = session.get(Experiment, record_id)
    else:
        record = session.get(Compound, record_id)
    return record if record is not None and record.deleted_at is None else None


def tags_page(
    session: Session, *, q: str | None, page: int, page_size: int
) -> tuple[list[Tag], int]:
    stmt = select(Tag)
    if q:
        stmt = stmt.where(Tag.name.ilike(f"%{escaped(q.strip())}%", escape="\\"))
    stmt = stmt.order_by(Tag.name, Tag.id)
    rows, total = page_query(session, stmt, page, page_size)
    return cast(list[Tag], rows), total


def compound_reactions_page(
    session: Session, compound_id: UUID, *, page: int, page_size: int
) -> tuple[list[Reaction], int]:
    stmt = (
        visible_reactions()
        .join(ReactionComponent, ReactionComponent.reaction_id == Reaction.id)
        .where(ReactionComponent.compound_id == compound_id, ReactionComponent.deleted_at.is_(None))
        .distinct()
        .order_by(Reaction.created_at.desc(), Reaction.id.desc())
    )
    rows, total = page_query(session, stmt, page, page_size)
    return cast(list[Reaction], rows), total


def compound_samples_page(
    session: Session, compound_id: UUID, *, page: int, page_size: int
) -> tuple[list[Sample], int]:
    stmt = (
        visible_samples()
        .where(Sample.compound_id == compound_id)
        .order_by(Sample.created_at.desc(), Sample.id.desc())
    )
    rows, total = page_query(session, stmt, page, page_size)
    return cast(list[Sample], rows), total


def compound_has_references(session: Session, record_id: UUID) -> bool:
    explicit = session.scalar(
        select(ExperimentCompound.compound_id)
        .join(Experiment, Experiment.id == ExperimentCompound.experiment_id)
        .where(ExperimentCompound.compound_id == record_id, Experiment.deleted_at.is_(None))
        .limit(1)
    )
    sample = session.scalar(
        select(Sample.compound_id)
        .join(Experiment, Experiment.id == Sample.experiment_id)
        .where(
            Sample.compound_id == record_id,
            Sample.deleted_at.is_(None),
            Experiment.deleted_at.is_(None),
        )
        .limit(1)
    )
    reaction = session.scalar(
        select(ReactionComponent.compound_id)
        .join(Reaction, Reaction.id == ReactionComponent.reaction_id)
        .join(Experiment, Experiment.id == Reaction.experiment_id)
        .where(
            ReactionComponent.compound_id == record_id,
            ReactionComponent.deleted_at.is_(None),
            Reaction.deleted_at.is_(None),
            Experiment.deleted_at.is_(None),
        )
        .limit(1)
    )
    return any(value is not None for value in (explicit, sample, reaction))


def records_page(
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
) -> tuple[list[Experiment | Compound], int]:
    stmt = select(model).where(model.deleted_at.is_(None))
    if q:
        pattern = f"%{escaped(q.strip())}%"
        fields = (
            (Experiment.title, Experiment.experiment_code)
            if model is Experiment
            else (
                Compound.name,
                Compound.codename,
                Compound.cas_number,
                Compound.smiles,
            )
        )
        stmt = stmt.where(or_(*(field.ilike(pattern, escape="\\") for field in fields)))
    if tag_id:
        link: type[ExperimentTag] | type[CompoundTag]
        if model is Experiment:
            link, column = ExperimentTag, ExperimentTag.experiment_id
        else:
            link, column = CompoundTag, CompoundTag.compound_id
        stmt = stmt.join(link, column == model.id).where(link.tag_id == tag_id)
    if model is Experiment:
        if status:
            stmt = stmt.where(Experiment.status == status)
        if date_from:
            stmt = stmt.where(Experiment.date >= date_from)
        if date_to:
            stmt = stmt.where(Experiment.date <= date_to)
        stmt = (
            stmt.order_by(Experiment.date.asc(), Experiment.id.asc())
            if sort == "date_asc"
            else stmt.order_by(Experiment.date.desc(), Experiment.id.desc())
        )
    else:
        stmt = (
            stmt.order_by(Compound.name.asc(), Compound.id.asc())
            if sort == "name_asc"
            else stmt.order_by(Compound.created_at.desc(), Compound.id.desc())
        )
    rows, total = page_query(session, stmt, page, page_size)
    return cast(list[Experiment | Compound], rows), total


def source_query() -> Any:
    explicit = (
        select(
            ExperimentCompound.experiment_id.label("experiment_id"),
            ExperimentCompound.compound_id.label("compound_id"),
            literal("explicit").label("source"),
        )
        .join(Experiment, Experiment.id == ExperimentCompound.experiment_id)
        .join(Compound, Compound.id == ExperimentCompound.compound_id)
        .where(Experiment.deleted_at.is_(None), Compound.deleted_at.is_(None))
    )
    sample = (
        select(Sample.experiment_id, Sample.compound_id, literal("sample"))
        .join(Experiment, Experiment.id == Sample.experiment_id)
        .join(Compound, Compound.id == Sample.compound_id)
        .where(
            Sample.deleted_at.is_(None),
            Experiment.deleted_at.is_(None),
            Compound.deleted_at.is_(None),
        )
    )
    reaction = (
        select(Reaction.experiment_id, ReactionComponent.compound_id, literal("reaction"))
        .join(ReactionComponent, ReactionComponent.reaction_id == Reaction.id)
        .join(Experiment, Experiment.id == Reaction.experiment_id)
        .join(Compound, Compound.id == ReactionComponent.compound_id)
        .where(
            Reaction.deleted_at.is_(None),
            ReactionComponent.deleted_at.is_(None),
            Experiment.deleted_at.is_(None),
            Compound.deleted_at.is_(None),
        )
    )
    return union_all(explicit, sample, reaction).subquery()


def relationship_page(
    session: Session,
    *,
    experiment_id: UUID | None = None,
    compound_id: UUID | None = None,
    page: int,
    page_size: int,
) -> tuple[list[tuple[Experiment | Compound, list[str]]], int]:
    sources = source_query()
    key = sources.c.compound_id if experiment_id else sources.c.experiment_id
    clause = (
        sources.c.experiment_id == experiment_id
        if experiment_id
        else sources.c.compound_id == compound_id
    )
    grouped = (
        select(key.label("id"), func.array_agg(func.distinct(sources.c.source)).label("sources"))
        .where(clause)
        .group_by(key)
        .subquery()
    )
    total = session.scalar(select(func.count()).select_from(grouped)) or 0
    if experiment_id:
        stmt = (
            select(Compound, grouped.c.sources)
            .join(grouped, Compound.id == grouped.c.id)
            .order_by(Compound.created_at.desc(), Compound.id.desc())
        )
    else:
        stmt = (
            select(Experiment, grouped.c.sources)
            .join(grouped, Experiment.id == grouped.c.id)
            .order_by(Experiment.created_at.desc(), Experiment.id.desc())
        )
    rows = session.execute(stmt.offset((page - 1) * page_size).limit(page_size)).all()
    return [(item, list(row_sources)) for item, row_sources in rows], total
