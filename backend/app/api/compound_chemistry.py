"""Structure preview and explicitly requested reference lookups."""

from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.records_schema import CompoundOut
from app.db.session import get_db
from app.models import Compound
from app.repositories.records import active_record
from app.services.chemistry import parse_structure
from app.services.compound_lookup import _valid_cas, lookup, lookup_cas
from app.services.records import missing, output

router = APIRouter(tags=["compound chemistry"])
DB = Depends(get_db)


class StructureInput(BaseModel):
    structure: str = Field(min_length=1, max_length=100000)
    format: Literal["auto", "smiles", "molfile", "cdxml"] = "auto"


class DuplicateOut(BaseModel):
    id: str
    cas_number: str | None
    name: str | None
    codename: str | None


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
            {
                "id": str(item.id),
                "cas_number": item.cas_number,
                "name": item.name,
                "codename": item.codename,
            }
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


class CasLookupInput(BaseModel):
    cas_number: str = Field(max_length=32)

    @field_validator("cas_number")
    @classmethod
    def valid_cas(cls, value: str) -> str:
        value = value.strip()
        if not _valid_cas(value):
            raise ValueError("CAS 号格式或校验位无效")
        return value


class ReagentCandidate(BaseModel):
    name: str
    cas_number: str
    molecular_formula: str
    molecular_weight: str
    source: str
    source_url: str


class CasLookupResult(BaseModel):
    local_matches: list[CompoundOut]
    candidates: list[ReagentCandidate]
    warnings: list[str]


@router.post("/compounds/cas/lookup", response_model=CasLookupResult)
def lookup_reagent(payload: CasLookupInput, db: Session = DB) -> dict[str, object]:
    matches = db.scalars(
        select(Compound)
        .where(Compound.cas_number == payload.cas_number, Compound.deleted_at.is_(None))
        .order_by(Compound.created_at, Compound.id)
    ).all()
    if matches:
        return {
            "local_matches": [output(db, row) for row in matches],
            "candidates": [],
            "warnings": [],
        }
    return {"local_matches": [], **lookup_cas(payload.cas_number)}
