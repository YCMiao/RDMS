"""Deleted-record list contract."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel

TrashType = Literal["experiment", "compound", "sample", "reaction", "component", "file"]


class TrashOut(BaseModel):
    id: UUID
    type: TrashType
    label: str
    deleted_at: datetime
    version: int
    parent_active: bool
    restore_block_reason: str | None
    restore_url: str
