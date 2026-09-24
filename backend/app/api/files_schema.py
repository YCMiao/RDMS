"""Public file metadata models."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.api.records_schema import VersionInput


class FilePatch(VersionInput):
    sample_id: UUID | None = None
    instrument_type: str | None = Field(default=None, max_length=300)
    notes: str | None = None


class FileOut(BaseModel):
    id: UUID
    experiment_id: UUID
    sample_id: UUID | None
    original_filename: str
    file_type: str
    file_size: int
    sha256: str
    instrument_type: str | None
    uploaded_at: datetime
    notes: str | None
    created_at: datetime
    updated_at: datetime
    version: int
    download_url: str
