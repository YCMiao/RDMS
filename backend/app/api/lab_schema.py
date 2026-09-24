"""Strict transport models for samples, reactions, and components."""

from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.api.records_schema import VersionInput, WriteModel

Role = Literal[
    "substrate", "reagent", "catalyst", "ligand", "base", "solvent", "additive", "product"
]


class NumericInput(WriteModel):
    @field_validator(
        "amount",
        "concentration",
        "temperature_c",
        "reaction_time_hours",
        "mmol",
        "equivalents",
        "yield_percent",
        check_fields=False,
        mode="before",
    )
    @classmethod
    def decimal_string(cls, value: object) -> object:
        if value is not None and not isinstance(value, str):
            raise ValueError("科研数值必须使用十进制字符串")
        return value


class SampleFields(NumericInput):
    experiment_id: UUID
    compound_id: UUID | None = None
    name: str | None = Field(default=None, max_length=300)
    sample_type: str = Field(min_length=1, max_length=100)
    amount: Decimal | None = Field(default=None, ge=0, max_digits=20, decimal_places=8)
    unit: str | None = Field(default=None, min_length=1, max_length=50)
    concentration: Decimal | None = Field(default=None, ge=0, max_digits=20, decimal_places=8)
    concentration_unit: str | None = Field(default=None, min_length=1, max_length=50)
    notes: str | None = None

    @field_validator("sample_type")
    @classmethod
    def nonempty(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("样品类型不能为空")
        return value


class SamplePatch(NumericInput, VersionInput):
    compound_id: UUID | None = None
    name: str | None = Field(default=None, max_length=300)
    sample_type: str | None = Field(default=None, min_length=1, max_length=100)
    amount: Decimal | None = Field(default=None, ge=0, max_digits=20, decimal_places=8)
    unit: str | None = Field(default=None, min_length=1, max_length=50)
    concentration: Decimal | None = Field(default=None, ge=0, max_digits=20, decimal_places=8)
    concentration_unit: str | None = Field(default=None, min_length=1, max_length=50)
    notes: str | None = None

    @field_validator("sample_type")
    @classmethod
    def nonempty_patch(cls, value: str | None) -> str:
        if value is None or not value.strip():
            raise ValueError("样品类型不能为空")
        return value.strip()


class ReactionFields(NumericInput):
    reaction_name: str = Field(min_length=1, max_length=300)
    temperature_c: Decimal | None = Field(default=None, max_digits=20, decimal_places=8)
    reaction_time_hours: Decimal | None = Field(default=None, ge=0, max_digits=20, decimal_places=8)
    atmosphere: str | None = Field(default=None, max_length=300)
    solvent: str | None = Field(default=None, max_length=300)
    workup: str | None = Field(default=None, max_length=100000)
    purification: str | None = Field(default=None, max_length=100000)
    notes: str | None = None

    @field_validator("reaction_name")
    @classmethod
    def nonempty(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("反应名称不能为空")
        return value


class ReactionPatch(NumericInput, VersionInput):
    reaction_name: str | None = Field(default=None, min_length=1, max_length=300)
    temperature_c: Decimal | None = Field(default=None, max_digits=20, decimal_places=8)
    reaction_time_hours: Decimal | None = Field(default=None, ge=0, max_digits=20, decimal_places=8)
    atmosphere: str | None = Field(default=None, max_length=300)
    solvent: str | None = Field(default=None, max_length=300)
    workup: str | None = Field(default=None, max_length=100000)
    purification: str | None = Field(default=None, max_length=100000)
    notes: str | None = None


class ComponentFields(NumericInput):
    compound_id: UUID
    role: Role
    amount: Decimal | None = Field(default=None, ge=0, max_digits=20, decimal_places=8)
    unit: str | None = Field(default=None, min_length=1, max_length=50)
    mmol: Decimal | None = Field(default=None, ge=0, max_digits=20, decimal_places=8)
    equivalents: Decimal | None = Field(default=None, ge=0, max_digits=20, decimal_places=8)
    yield_percent: Decimal | None = Field(default=None, ge=0, max_digits=20, decimal_places=8)
    sort_order: int | None = Field(default=None, ge=0)
    notes: str | None = None


class ComponentPatch(NumericInput, VersionInput):
    compound_id: UUID | None = None
    role: Role | None = None
    amount: Decimal | None = Field(default=None, ge=0, max_digits=20, decimal_places=8)
    unit: str | None = Field(default=None, min_length=1, max_length=50)
    mmol: Decimal | None = Field(default=None, ge=0, max_digits=20, decimal_places=8)
    equivalents: Decimal | None = Field(default=None, ge=0, max_digits=20, decimal_places=8)
    yield_percent: Decimal | None = Field(default=None, ge=0, max_digits=20, decimal_places=8)
    sort_order: int | None = Field(default=None, ge=0)
    notes: str | None = None


class EntityBase(BaseModel):
    id: UUID
    created_at: datetime
    updated_at: datetime
    version: int


class SampleOut(EntityBase):
    sample_code: str
    experiment_id: UUID
    compound_id: UUID | None
    name: str | None
    sample_type: str
    amount: Decimal | None
    unit: str | None
    concentration: Decimal | None
    concentration_unit: str | None
    notes: str | None


class ReactionOut(EntityBase):
    experiment_id: UUID
    reaction_name: str
    temperature_c: Decimal | None
    reaction_time_hours: Decimal | None
    atmosphere: str | None
    solvent: str | None
    workup: str | None
    purification: str | None
    notes: str | None


class ComponentOut(EntityBase):
    reaction_id: UUID
    compound_id: UUID
    role: Role
    amount: Decimal | None
    unit: str | None
    mmol: Decimal | None
    equivalents: Decimal | None
    yield_percent: Decimal | None
    sort_order: int
    notes: str | None
