"""Structure preview and explicitly requested reference lookups."""

from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models import Compound
from app.repositories.records import active_record
from app.services.chemistry import parse_structure
from app.services.compound_lookup import lookup
from app.services.records import missing

router = APIRouter(tags=["compound chemistry"])
DB = Depends(get_db)


class StructureInput(BaseModel):
    structure: str = Field(min_length=1, max_length=100000)
    format: Literal["auto", "smiles", "molfile", "cdxml"] = "auto"


class DuplicateOut(BaseModel):
    id: str
    compound_code: str
    name: str


class StructurePreview(BaseModel):
    structure_molfile: str
    smiles: str
    molecular_formula: str
    molecular_weight: Decimal
    exact_mass: Decimal
    inchi_key: str
    svg: str
    duplicates: list[DuplicateOut]


class LookupInput(BaseModel):
    inchi_key: str = Field(pattern=r"^[A-Z]{14}-[A-Z]{10}-[A-Z]$", max_length=27)


class SourceValue(BaseModel):
    name: str
    value: str
    source: str
    source_url: str | None = None


class CasCandidate(BaseModel):
    cas_number: str
    name: str
    source: str
    source_url: str


class LookupResult(BaseModel):
    candidates: list[CasCandidate]
    properties: list[SourceValue]
    pubchem_cid: int | None
    warnings: list[str]


@router.post("/compounds/structure/preview", response_model=StructurePreview)
def preview(payload: StructureInput, db: Session = DB) -> dict[str, object]:
    result = parse_structure(payload.structure, payload.format)
    duplicates = db.scalars(
        select(Compound)
        .where(Compound.inchi_key == result.inchi_key, Compound.deleted_at.is_(None))
        .order_by(Compound.created_at.desc())
        .limit(5)
    ).all()
    return {
        "structure_molfile": result.molfile,
        "smiles": result.smiles,
        "molecular_formula": result.molecular_formula,
        "molecular_weight": result.molecular_weight,
        "exact_mass": result.exact_mass,
        "inchi_key": result.inchi_key,
        "svg": result.svg,
        "duplicates": [
            {"id": str(item.id), "compound_code": item.compound_code, "name": item.name}
            for item in duplicates
        ],
    }


@router.post("/compounds/structure/lookup", response_model=LookupResult)
def lookup_structure(payload: LookupInput) -> dict[str, object]:
    return lookup(payload.inchi_key)


@router.get("/compounds/{record_id}/structure.svg", response_class=Response)
def compound_svg(record_id: str, db: Session = DB) -> Response:
    from uuid import UUID

    try:
        compound_id = UUID(record_id)
    except ValueError:
        raise missing() from None
    record = active_record(db, Compound, compound_id)
    if record is None or not isinstance(record, Compound) or not record.structure_molfile:
        raise missing()
    result = parse_structure(record.structure_molfile, "molfile")
    return Response(
        result.svg, media_type="image/svg+xml", headers={"Cache-Control": "private, max-age=60"}
    )
