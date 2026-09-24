from __future__ import annotations

from datetime import date as Date
from datetime import datetime
from decimal import Decimal
from typing import Literal, TypeVar
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class WriteModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class VersionInput(WriteModel):
    expected_version: int = Field(ge=1)


class TagCreate(WriteModel):
    name: str = Field(min_length=1, max_length=50)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("名称不能为空")
        if len(value.casefold()) > 50:
            raise ValueError("规范化后的名称不能超过 50 字符")
        return value


class TagPatch(TagCreate, VersionInput):
    pass


class TagOut(BaseModel):
    id: UUID
    name: str
    version: int


class ExperimentFields(WriteModel):
    title: str = Field(min_length=1, max_length=300)
    date: Date
    objective: str | None = Field(default=None, max_length=100000)
    procedure: str | None = Field(default=None, max_length=100000)
    observation: str | None = Field(default=None, max_length=100000)
    result: str | None = Field(default=None, max_length=100000)
    conclusion: str | None = Field(default=None, max_length=100000)
    status: Literal["draft", "in_progress", "completed", "cancelled"] = "draft"
    tag_ids: list[UUID] = Field(default_factory=list)

    @field_validator("title")
    @classmethod
    def clean_title(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("标题不能为空")
        return value

    @field_validator("objective", "procedure", "observation", "result", "conclusion")
    @classmethod
    def clean_text(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None


class ExperimentPatch(VersionInput):
    title: str | None = Field(default=None, min_length=1, max_length=300)
    date: Date | None = None
    objective: str | None = Field(default=None, max_length=100000)
    procedure: str | None = Field(default=None, max_length=100000)
    observation: str | None = Field(default=None, max_length=100000)
    result: str | None = Field(default=None, max_length=100000)
    conclusion: str | None = Field(default=None, max_length=100000)
    status: Literal["draft", "in_progress", "completed", "cancelled"] | None = None
    tag_ids: list[UUID] | None = None

    @field_validator("title")
    @classmethod
    def clean_title(cls, value: str | None) -> str:
        if value is None or not value.strip():
            raise ValueError("标题不能为空")
        return value.strip()

    @field_validator("status", "tag_ids")
    @classmethod
    def no_null_required_values(cls, value: object) -> object:
        if value is None:
            raise ValueError("此字段不能为 null")
        return value


class CompoundFields(WriteModel):
    name: str = Field(min_length=1, max_length=300)
    smiles: str | None = Field(default=None, max_length=10000)
    molecular_formula: str | None = Field(default=None, max_length=200)
    molecular_weight: Decimal | None = Field(default=None, gt=0, max_digits=20, decimal_places=8)
    notes: str | None = None
    tag_ids: list[UUID] = Field(default_factory=list)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("名称不能为空")
        return value

    @field_validator("smiles", "molecular_formula", "notes")
    @classmethod
    def clean_text(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None

    @field_validator("molecular_weight", mode="before")
    @classmethod
    def decimal_string(cls, value: object) -> object:
        if value is not None and not isinstance(value, str):
            raise ValueError("请以十进制字符串填写分子量")
        return value


class CompoundPatch(VersionInput):
    name: str | None = Field(default=None, min_length=1, max_length=300)
    smiles: str | None = Field(default=None, max_length=10000)
    molecular_formula: str | None = Field(default=None, max_length=200)
    molecular_weight: Decimal | None = Field(default=None, gt=0, max_digits=20, decimal_places=8)
    notes: str | None = None
    tag_ids: list[UUID] | None = None

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str | None) -> str:
        if value is None or not value.strip():
            raise ValueError("名称不能为空")
        return value.strip()

    @field_validator("molecular_weight", mode="before")
    @classmethod
    def decimal_string(cls, value: object) -> object:
        if value is not None and not isinstance(value, str):
            raise ValueError("请以十进制字符串填写分子量")
        return value

    @field_validator("tag_ids")
    @classmethod
    def no_null_tags(cls, value: list[UUID] | None) -> list[UUID]:
        if value is None:
            raise ValueError("标签集合不能为 null")
        return value


class RecordBase(BaseModel):
    id: UUID
    created_at: datetime
    updated_at: datetime
    version: int
    tags: list[TagOut]


class ExperimentOut(RecordBase):
    experiment_code: str
    title: str
    date: Date
    objective: str | None
    procedure: str | None
    observation: str | None
    result: str | None
    conclusion: str | None
    status: str


class CompoundOut(RecordBase):
    compound_code: str
    name: str
    smiles: str | None
    molecular_formula: str | None
    molecular_weight: Decimal | None
    notes: str | None


class RelationOut(BaseModel):
    compound: CompoundOut
    sources: list[Literal["explicit", "sample", "reaction"]]


class ExperimentRelationOut(BaseModel):
    experiment: ExperimentOut
    sources: list[Literal["explicit", "sample", "reaction"]]


class ReactionBrief(BaseModel):
    id: UUID
    experiment_id: UUID
    reaction_name: str


class SampleBrief(BaseModel):
    id: UUID
    experiment_id: UUID
    sample_code: str
    name: str | None
    sample_type: str


T = TypeVar("T")


class Page[T](BaseModel):
    items: list[T]
    page: int
    page_size: int
    total: int


class LinkInput(VersionInput):
    compound_id: UUID
