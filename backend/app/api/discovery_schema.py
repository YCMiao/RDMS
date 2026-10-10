"""Discovery API response contracts."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from app.api.files_schema import FileOut
from app.api.lab_schema import ComponentOut, ReactionOut, SampleOut
from app.api.records_schema import CompoundOut, ExperimentOut, Page


class SearchExperimentOut(ExperimentOut):
    matched_fields: list[Literal["title", "experiment_code"]]


class SearchCompoundOut(CompoundOut):
    matched_fields: list[Literal["name", "cas_number", "codename", "smiles"]]


class SearchOut(BaseModel):
    query: str
    experiments: Page[SearchExperimentOut]
    compounds: Page[SearchCompoundOut]


class DashboardOut(BaseModel):
    experiment_count: int
    compound_count: int
    sample_count: int
    recent_experiments: list[ExperimentOut]
    recent_files: list[FileOut]


class ReactionSummary(BaseModel):
    reaction: ReactionOut
    components: list[ComponentOut]


class SummaryOut(BaseModel):
    experiment: ExperimentOut
    reactions: list[ReactionSummary]
    samples: list[SampleOut]
    files: list[FileOut]
    generated_at: datetime
    source_revision: str
