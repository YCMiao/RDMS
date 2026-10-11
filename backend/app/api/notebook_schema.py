"""Notebook management and atomic experiment transfers."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

from app.api.records_schema import VersionInput, WriteModel


class NotebookFields(WriteModel):
    name: str = Field(min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=1000)

    @field_validator("name")
    @classmethod
    def name_trim(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("记录本名称不能为空")
        return value.strip()


class NotebookPatch(NotebookFields, VersionInput):
    archived: bool = False


class NotebookOut(BaseModel):
    id: UUID
    code: str
    name: str
    description: str | None
    archived: bool
    version: int
    experiment_count: int
    created_at: datetime
    updated_at: datetime
    last_experiment_at: datetime | None


class TransferItem(VersionInput):
    id: UUID


class NotebookTransfer(WriteModel):
    expected_next_number: int | None = Field(default=None, ge=1)
    notebook_id: UUID
    experiments: list[TransferItem] = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def unique_items(self) -> "NotebookTransfer":
        if len({item.id for item in self.experiments}) != len(self.experiments):
            raise ValueError("实验不能重复选择")
        return self


class ExperimentRestore(VersionInput):
    notebook_id: UUID | None = None


class TransferPreviewItem(BaseModel):
    id: UUID
    title: str
    experiment_code: str


class TransferPreview(BaseModel):
    next_number: int
    items: list[TransferPreviewItem]
