"""Samples and reactions API."""

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.api.lab_schema import (
    ComponentFields,
    ComponentOut,
    ComponentPatch,
    ReactionFields,
    ReactionOut,
    ReactionPatch,
    SampleFields,
    SampleOut,
    SamplePatch,
)
from app.api.records_schema import Page, VersionInput
from app.db.session import get_db
from app.services import lab

router = APIRouter(tags=["lab"])
DB = Depends(get_db)


@router.get("/samples", response_model=Page[SampleOut])
def samples(
    experiment_id: UUID | None = None,
    compound_id: UUID | None = None,
    q: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: Session = DB,
) -> dict[str, Any]:
    return lab.samples(
        db, experiment_id=experiment_id, compound_id=compound_id, q=q, number=page, size=page_size
    )


@router.post("/samples", response_model=SampleOut, status_code=201)
def create_sample(payload: SampleFields, db: Session = DB) -> dict[str, Any]:
    return lab.create_sample(db, payload)


@router.get("/samples/{sample_id}", response_model=SampleOut)
def get_sample(sample_id: UUID, db: Session = DB) -> dict[str, Any]:
    return lab.get_sample(db, sample_id)


@router.patch("/samples/{sample_id}", response_model=SampleOut)
def patch_sample(sample_id: UUID, payload: SamplePatch, db: Session = DB) -> dict[str, Any]:
    return lab.patch_sample(db, sample_id, payload)


@router.delete("/samples/{sample_id}", status_code=204)
def delete_sample(
    sample_id: UUID, expected_version: int = Query(ge=1), db: Session = DB
) -> Response:
    lab.change_sample(db, sample_id, expected_version, restore=False)
    return Response(status_code=204)


@router.post("/samples/{sample_id}/restore", response_model=SampleOut)
def restore_sample(sample_id: UUID, payload: VersionInput, db: Session = DB) -> dict[str, Any]:
    return lab.change_sample(db, sample_id, payload.expected_version, restore=True) or {}


@router.get("/experiments/{experiment_id}/reactions", response_model=Page[ReactionOut])
def reactions(
    experiment_id: UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: Session = DB,
) -> dict[str, Any]:
    return lab.reactions(db, experiment_id, page, page_size)


@router.post("/experiments/{experiment_id}/reactions", response_model=ReactionOut, status_code=201)
def create_reaction(
    experiment_id: UUID, payload: ReactionFields, db: Session = DB
) -> dict[str, Any]:
    return lab.create_reaction(db, experiment_id, payload)


@router.get("/reactions/{reaction_id}", response_model=ReactionOut)
def get_reaction(reaction_id: UUID, db: Session = DB) -> dict[str, Any]:
    return lab.get_reaction(db, reaction_id)


@router.patch("/reactions/{reaction_id}", response_model=ReactionOut)
def patch_reaction(reaction_id: UUID, payload: ReactionPatch, db: Session = DB) -> dict[str, Any]:
    return lab.patch_reaction(db, reaction_id, payload)


@router.delete("/reactions/{reaction_id}", status_code=204)
def delete_reaction(
    reaction_id: UUID, expected_version: int = Query(ge=1), db: Session = DB
) -> Response:
    lab.change_reaction(db, reaction_id, expected_version, restore=False)
    return Response(status_code=204)


@router.post("/reactions/{reaction_id}/restore", response_model=ReactionOut)
def restore_reaction(reaction_id: UUID, payload: VersionInput, db: Session = DB) -> dict[str, Any]:
    return lab.change_reaction(db, reaction_id, payload.expected_version, restore=True) or {}


@router.get("/reactions/{reaction_id}/components", response_model=Page[ComponentOut])
def components(
    reaction_id: UUID,
    reactants_only: bool = False,
    solvents_only: bool = False,
    exclude_solvents: bool = False,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: Session = DB,
) -> dict[str, Any]:
    return lab.components(
        db,
        reaction_id,
        page,
        page_size,
        reactants_only=reactants_only,
        solvents_only=solvents_only,
        exclude_solvents=exclude_solvents,
    )


@router.post("/reactions/{reaction_id}/components", response_model=ComponentOut, status_code=201)
def create_component(
    reaction_id: UUID, payload: ComponentFields, db: Session = DB
) -> dict[str, Any]:
    return lab.create_component(db, reaction_id, payload)


@router.patch("/reactions/{reaction_id}/components/{component_id}", response_model=ComponentOut)
def patch_component(
    reaction_id: UUID, component_id: UUID, payload: ComponentPatch, db: Session = DB
) -> dict[str, Any]:
    return lab.patch_component(db, reaction_id, component_id, payload)


@router.delete("/reactions/{reaction_id}/components/{component_id}", status_code=204)
def delete_component(
    reaction_id: UUID, component_id: UUID, expected_version: int = Query(ge=1), db: Session = DB
) -> Response:
    lab.change_component(db, reaction_id, component_id, expected_version, restore=False)
    return Response(status_code=204)


@router.post(
    "/reactions/{reaction_id}/components/{component_id}/restore", response_model=ComponentOut
)
def restore_component(
    reaction_id: UUID, component_id: UUID, payload: VersionInput, db: Session = DB
) -> dict[str, Any]:
    return (
        lab.change_component(db, reaction_id, component_id, payload.expected_version, restore=True)
        or {}
    )
