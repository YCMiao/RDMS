"""Copy an experiment and its active reaction setup in one transaction."""

from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.records_schema import ExperimentCopy
from app.models import Compound, Experiment, ExperimentCompound, Reaction, ReactionComponent
from app.services import records
from app.services.notebooks import allocate


def copy_experiment(session: Session, source_id: UUID, payload: ExperimentCopy) -> dict[str, Any]:
    source = records.lock_record(session, Experiment, source_id)
    assert isinstance(source, Experiment)
    records.check_version(source, payload.expected_version)
    reactions = session.scalars(
        select(Reaction)
        .where(Reaction.experiment_id == source_id, Reaction.deleted_at.is_(None))
        .order_by(Reaction.sort_order, Reaction.created_at, Reaction.id)
    ).all()
    components = session.scalars(
        select(ReactionComponent)
        .join(Reaction, Reaction.id == ReactionComponent.reaction_id)
        .where(
            Reaction.experiment_id == source_id,
            Reaction.deleted_at.is_(None),
            ReactionComponent.deleted_at.is_(None),
        )
        .order_by(ReactionComponent.sort_order, ReactionComponent.created_at, ReactionComponent.id)
    ).all()
    links = session.scalars(
        select(ExperimentCompound.compound_id).where(ExperimentCompound.experiment_id == source_id)
    ).all()
    compound_ids = sorted(set(links) | {item.compound_id for item in components})
    active_ids = set(
        session.scalars(
            select(Compound.id)
            .where(Compound.id.in_(compound_ids), Compound.deleted_at.is_(None))
            .order_by(Compound.id)
            .with_for_update(read=True, key_share=True)
        ).all()
    )
    target = Experiment(
        **allocate(session, payload.notebook_id or source.notebook_id),
        title=payload.title,
        date=payload.date,
        status="draft",
        objective=source.objective,
        procedure=source.procedure,
        **{key: None for key in ("observation", "result", "conclusion")},
    )
    session.add(target)
    session.flush()
    records.replace_tags(
        session,
        Experiment,
        target.id,
        [],
    )
    session.add_all(
        [
            ExperimentCompound(experiment_id=target.id, compound_id=id)
            for id in links
            if id in active_ids
        ]
    )
    for index, reaction in enumerate(reactions, start=1):
        copied = Reaction(
            experiment_id=target.id,
            sort_order=index,
            **{
                key: getattr(reaction, key)
                for key in (
                    "reaction_name",
                    "temperature_c",
                    "temperature_k",
                    "temperature_description",
                    "reaction_time_hours",
                    "reaction_time_minutes",
                    "reaction_time_description",
                    "atmosphere",
                    "solvent",
                    "workup",
                    "purification",
                    "notes",
                )
            },
        )
        session.add(copied)
        session.flush()
        for component in components:
            if component.reaction_id != reaction.id or component.compound_id not in active_ids:
                continue
            session.add(
                ReactionComponent(
                    reaction_id=copied.id,
                    **{
                        key: getattr(component, key)
                        for key in (
                            "compound_id",
                            "role",
                            "amount",
                            "unit",
                            "mmol",
                            "equivalents",
                            "is_limiting",
                            "yield_percent",
                            "stoichiometric_ratio",
                            "sort_order",
                            "notes",
                        )
                    },
                )
            )
    session.commit()
    session.refresh(target)
    return records.output(session, target)
