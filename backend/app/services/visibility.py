"""Shared database predicates for effective (visible) business records."""

from typing import Any

from sqlalchemy import Select, exists, select
from sqlalchemy.sql.elements import ColumnElement

from app.models import Experiment, FileAsset, Reaction, ReactionComponent, Sample


def active_experiment(experiment_id: Any) -> ColumnElement[bool]:
    return exists(
        select(Experiment.id).where(Experiment.id == experiment_id, Experiment.deleted_at.is_(None))
    )


def active_reaction(reaction_id: Any) -> ColumnElement[bool]:
    return exists(
        select(Reaction.id).where(
            Reaction.id == reaction_id,
            Reaction.deleted_at.is_(None),
            active_experiment(Reaction.experiment_id),
        )
    )


def visible_samples() -> Select[tuple[Sample]]:
    return select(Sample).where(
        Sample.deleted_at.is_(None), active_experiment(Sample.experiment_id)
    )


def visible_reactions() -> Select[tuple[Reaction]]:
    return select(Reaction).where(
        Reaction.deleted_at.is_(None), active_experiment(Reaction.experiment_id)
    )


def visible_components() -> Select[tuple[ReactionComponent]]:
    return select(ReactionComponent).where(
        ReactionComponent.deleted_at.is_(None), active_reaction(ReactionComponent.reaction_id)
    )


def visible_files() -> Select[tuple[FileAsset]]:
    return select(FileAsset).where(
        FileAsset.deleted_at.is_(None), active_experiment(FileAsset.experiment_id)
    )
