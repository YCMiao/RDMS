"""Persistent business entities for the RDMS schema."""

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

NUMERIC = Numeric(20, 8)


class Timestamped:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Versioned(Timestamped):
    version: Mapped[int] = mapped_column(Integer, server_default="1")
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Experiment(Versioned, Base):
    __tablename__ = "experiment"
    __table_args__ = (
        CheckConstraint("version > 0", name="version_positive"),
        CheckConstraint("length(btrim(title)) > 0", name="title_nonempty"),
        CheckConstraint(
            "status IN ('draft','in_progress','completed','cancelled')", name="status_valid"
        ),
        CheckConstraint(
            "objective IS NULL OR length(objective) <= 100000", name="objective_length"
        ),
        CheckConstraint(
            "procedure IS NULL OR length(procedure) <= 100000", name="procedure_length"
        ),
        CheckConstraint(
            "observation IS NULL OR length(observation) <= 100000", name="observation_length"
        ),
        CheckConstraint("result IS NULL OR length(result) <= 100000", name="result_length"),
        CheckConstraint(
            "conclusion IS NULL OR length(conclusion) <= 100000", name="conclusion_length"
        ),
        Index("ix_experiment_date_id", "date", "id"),
        Index("ix_experiment_deleted_at", "deleted_at"),
    )
    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    experiment_code: Mapped[str] = mapped_column(String(32), unique=True)
    title: Mapped[str] = mapped_column(String(300))
    date: Mapped[date] = mapped_column(Date)
    objective: Mapped[str | None] = mapped_column(Text)
    procedure: Mapped[str | None] = mapped_column(Text)
    observation: Mapped[str | None] = mapped_column(Text)
    result: Mapped[str | None] = mapped_column(Text)
    conclusion: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), server_default="draft")


class Compound(Versioned, Base):
    __tablename__ = "compound"
    __table_args__ = (
        CheckConstraint("version > 0", name="version_positive"),
        CheckConstraint("length(btrim(name)) > 0", name="name_nonempty"),
        CheckConstraint("molecular_weight IS NULL OR molecular_weight > 0", name="weight_positive"),
        Index("ix_compound_deleted_at", "deleted_at"),
    )
    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    compound_code: Mapped[str] = mapped_column(String(32), unique=True)
    name: Mapped[str] = mapped_column(String(300))
    smiles: Mapped[str | None] = mapped_column(String(10000))
    molecular_formula: Mapped[str | None] = mapped_column(String(200))
    molecular_weight: Mapped[Decimal | None] = mapped_column(NUMERIC)
    notes: Mapped[str | None] = mapped_column(Text)


class ExperimentCompound(Base):
    __tablename__ = "experiment_compound"
    __table_args__ = (Index("ix_experiment_compound_compound", "compound_id", "experiment_id"),)
    experiment_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("experiment.id", ondelete="RESTRICT"), primary_key=True
    )
    compound_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("compound.id", ondelete="RESTRICT"), primary_key=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Sample(Versioned, Base):
    __tablename__ = "sample"
    __table_args__ = (
        CheckConstraint("version > 0", name="version_positive"),
        CheckConstraint("length(btrim(sample_type)) > 0", name="type_nonempty"),
        CheckConstraint("(amount IS NULL) = (unit IS NULL)", name="amount_unit_pair"),
        CheckConstraint(
            "(concentration IS NULL) = (concentration_unit IS NULL)", name="concentration_unit_pair"
        ),
        CheckConstraint("amount IS NULL OR amount >= 0", name="amount_nonnegative"),
        CheckConstraint(
            "concentration IS NULL OR concentration >= 0", name="concentration_nonnegative"
        ),
        Index("ix_sample_experiment_deleted", "experiment_id", "deleted_at"),
        Index("ix_sample_compound_deleted", "compound_id", "deleted_at"),
        UniqueConstraint("id", "experiment_id", name="uq_sample_id_experiment"),
    )
    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    sample_code: Mapped[str] = mapped_column(String(32), unique=True)
    name: Mapped[str | None] = mapped_column(String(300))
    experiment_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("experiment.id", ondelete="RESTRICT")
    )
    compound_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("compound.id", ondelete="RESTRICT")
    )
    sample_type: Mapped[str] = mapped_column(String(100))
    amount: Mapped[Decimal | None] = mapped_column(NUMERIC)
    unit: Mapped[str | None] = mapped_column(String(50))
    concentration: Mapped[Decimal | None] = mapped_column(NUMERIC)
    concentration_unit: Mapped[str | None] = mapped_column(String(50))
    notes: Mapped[str | None] = mapped_column(Text)


class Reaction(Versioned, Base):
    __tablename__ = "reaction"
    __table_args__ = (
        CheckConstraint("version > 0", name="version_positive"),
        CheckConstraint("length(btrim(reaction_name)) > 0", name="name_nonempty"),
        CheckConstraint(
            "reaction_time_hours IS NULL OR reaction_time_hours >= 0", name="time_nonnegative"
        ),
        Index("ix_reaction_experiment_deleted", "experiment_id", "deleted_at"),
    )
    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    experiment_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("experiment.id", ondelete="RESTRICT")
    )
    reaction_name: Mapped[str] = mapped_column(String(300))
    temperature_c: Mapped[Decimal | None] = mapped_column(NUMERIC)
    reaction_time_hours: Mapped[Decimal | None] = mapped_column(NUMERIC)
    atmosphere: Mapped[str | None] = mapped_column(String(300))
    solvent: Mapped[str | None] = mapped_column(String(300))
    notes: Mapped[str | None] = mapped_column(Text)


class ReactionComponent(Versioned, Base):
    __tablename__ = "reaction_component"
    __table_args__ = (
        CheckConstraint("version > 0", name="version_positive"),
        CheckConstraint(
            "role IN ('substrate','reagent','catalyst','ligand',"
            "'base','solvent','additive','product')",
            name="role_valid",
        ),
        CheckConstraint("(amount IS NULL) = (unit IS NULL)", name="amount_unit_pair"),
        CheckConstraint("amount IS NULL OR amount >= 0", name="amount_nonnegative"),
        CheckConstraint("mmol IS NULL OR mmol >= 0", name="mmol_nonnegative"),
        CheckConstraint("equivalents IS NULL OR equivalents >= 0", name="equivalents_nonnegative"),
        CheckConstraint("yield_percent IS NULL OR yield_percent >= 0", name="yield_nonnegative"),
        CheckConstraint("yield_percent IS NULL OR role = 'product'", name="yield_product_only"),
        CheckConstraint("sort_order >= 0", name="sort_nonnegative"),
        Index("ix_component_reaction_order", "reaction_id", "sort_order", "created_at", "id"),
        Index("ix_component_compound_deleted", "compound_id", "deleted_at"),
    )
    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    reaction_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("reaction.id", ondelete="RESTRICT")
    )
    compound_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("compound.id", ondelete="RESTRICT")
    )
    role: Mapped[str] = mapped_column(String(20))
    amount: Mapped[Decimal | None] = mapped_column(NUMERIC)
    unit: Mapped[str | None] = mapped_column(String(50))
    mmol: Mapped[Decimal | None] = mapped_column(NUMERIC)
    equivalents: Mapped[Decimal | None] = mapped_column(NUMERIC)
    yield_percent: Mapped[Decimal | None] = mapped_column(NUMERIC)
    sort_order: Mapped[int] = mapped_column(Integer, server_default="0")
    notes: Mapped[str | None] = mapped_column(Text)


class FileAsset(Versioned, Base):
    __tablename__ = "file_asset"
    __table_args__ = (
        CheckConstraint("version > 0", name="version_positive"),
        CheckConstraint("file_size >= 0", name="size_nonnegative"),
        CheckConstraint("sha256 ~ '^[0-9a-f]{64}$'", name="sha256_valid"),
        ForeignKeyConstraint(
            ["sample_id", "experiment_id"],
            ["sample.id", "sample.experiment_id"],
            name="fk_file_sample_same_experiment",
            ondelete="RESTRICT",
        ),
        Index("ix_file_experiment_deleted", "experiment_id", "deleted_at"),
        Index("ix_file_sample", "sample_id"),
        Index("ix_file_uploaded_id", "uploaded_at", "id"),
    )
    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    experiment_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("experiment.id", ondelete="RESTRICT")
    )
    sample_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True))
    original_filename: Mapped[str] = mapped_column(String(255))
    filename: Mapped[str] = mapped_column(String(255))
    file_path: Mapped[str] = mapped_column(Text)
    file_type: Mapped[str] = mapped_column(String(100))
    file_size: Mapped[int] = mapped_column(BigInteger)
    sha256: Mapped[str] = mapped_column(String(64))
    instrument_type: Mapped[str | None] = mapped_column(String(300))
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    notes: Mapped[str | None] = mapped_column(Text)


class Tag(Timestamped, Base):
    __tablename__ = "tag"
    __table_args__ = (
        CheckConstraint("version > 0", name="version_positive"),
        CheckConstraint("length(btrim(name)) > 0", name="name_nonempty"),
    )
    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(50))
    normalized_name: Mapped[str] = mapped_column(String(50), unique=True)
    version: Mapped[int] = mapped_column(Integer, server_default="1")


class ExperimentTag(Base):
    __tablename__ = "experiment_tag"
    __table_args__ = (Index("ix_experiment_tag_tag", "tag_id", "experiment_id"),)
    experiment_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("experiment.id", ondelete="CASCADE"), primary_key=True
    )
    tag_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("tag.id", ondelete="CASCADE"), primary_key=True
    )


class CompoundTag(Base):
    __tablename__ = "compound_tag"
    __table_args__ = (Index("ix_compound_tag_tag", "tag_id", "compound_id"),)
    compound_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("compound.id", ondelete="CASCADE"), primary_key=True
    )
    tag_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("tag.id", ondelete="CASCADE"), primary_key=True
    )


class NumberCounter(Base):
    __tablename__ = "number_counter"
    __table_args__ = (
        CheckConstraint("namespace IN ('EXP','CMP','SMP')", name="namespace_valid"),
        CheckConstraint(
            "(namespace = 'CMP' AND year = 0) OR "
            "(namespace IN ('EXP','SMP') AND year BETWEEN 1 AND 9999)",
            name="year_valid",
        ),
        CheckConstraint("next_value > 0", name="next_positive"),
    )
    namespace: Mapped[str] = mapped_column(String(3), primary_key=True)
    year: Mapped[int] = mapped_column(Integer, primary_key=True)
    next_value: Mapped[int] = mapped_column(BigInteger)
