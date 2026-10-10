"""Strict transport models for samples, reactions, and components."""

from datetime import datetime
from decimal import Decimal
from typing import Literal, Self
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

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
        "reaction_time_minutes",
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


class ReactionConditions(NumericInput):
    temperature_c: Decimal | None = Field(default=None, max_digits=20, decimal_places=8)
    temperature_description: str | None = Field(default=None, max_length=300)
    reaction_time_hours: Decimal | None = Field(default=None, ge=0, max_digits=20, decimal_places=8)
    reaction_time_minutes: Decimal | None = Field(
        default=None, ge=0, max_digits=20, decimal_places=8
    )
    reaction_time_description: str | None = Field(default=None, max_length=300)

    @field_validator("temperature_description", "reaction_time_description")
    @classmethod
    def description(cls, value: str | None) -> str | None:
        return value.strip() or None if value is not None else None

    @model_validator(mode="after")
    def exclusive_conditions(self) -> Self:
        if self.temperature_c is not None and self.temperature_description is not None:
            raise ValueError("温度请选择摄氏度或描述，不能同时填写")
        if (
            sum(
                value is not None
                for value in (
                    self.reaction_time_hours,
                    self.reaction_time_minutes,
                    self.reaction_time_description,
                )
            )
            > 1
        ):
            raise ValueError("时间请选择 h、min 或描述，不能同时填写")
        return self


class ReactionFields(ReactionConditions):
    reaction_name: str = Field(min_length=1, max_length=300)
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


class ReactionPatch(ReactionConditions, VersionInput):
    reaction_name: str | None = Field(default=None, min_length=1, max_length=300)
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
    sort_order: int
    reaction_name: str
    temperature_c: Decimal | None
    temperature_description: str | None
    reaction_time_hours: Decimal | None
    reaction_time_minutes: Decimal | None
    reaction_time_description: str | None
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
