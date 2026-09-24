"""Stage 02 PostgreSQL integration checks; no database behavior is mocked."""

from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import UUID, uuid4

import pytest
from sqlalchemy import create_engine, inspect, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import (
    Compound,
    Experiment,
    FileAsset,
    NumberCounter,
    Reaction,
    ReactionComponent,
    Sample,
)
from app.services.numbering import allocate_code
from app.services.versioning import update_if_version
from app.services.visibility import visible_components, visible_files, visible_samples


@pytest.fixture(scope="module")
def db_engine():  # type: ignore[no-untyped-def]
    engine = create_engine(get_settings().database_url, pool_size=55, max_overflow=0)
    yield engine
    engine.dispose()


def make_experiment(session: Session, *, year: int = 2035) -> Experiment:
    experiment = Experiment(
        experiment_code=allocate_code(
            session, "EXP", clock=lambda: datetime(year, 1, 1, tzinfo=UTC)
        ),
        title="实验",
        date=date(year, 1, 1),
    )
    session.add(experiment)
    session.flush()
    return experiment


def make_compound(session: Session) -> Compound:
    compound = Compound(compound_code=allocate_code(session, "CMP"), name="化合物")
    session.add(compound)
    session.flush()
    return compound


def test_schema_contains_all_tables_and_constraints(db_engine) -> None:  # type: ignore[no-untyped-def]
    inspector = inspect(db_engine)
    assert {
        "experiment",
        "compound",
        "experiment_compound",
        "sample",
        "reaction",
        "reaction_component",
        "file_asset",
        "tag",
        "experiment_tag",
        "compound_tag",
        "number_counter",
    } <= set(inspector.get_table_names())
    for table in ("experiment", "compound", "sample"):
        assert any(
            c["column_names"]
            == [
                {
                    "experiment": "experiment_code",
                    "compound": "compound_code",
                    "sample": "sample_code",
                }[table]
            ]
            for c in inspector.get_unique_constraints(table)
        )
    assert any(
        c["name"] == "fk_file_sample_same_experiment"
        for c in inspector.get_foreign_keys("file_asset")
    )


def test_database_rejects_invalid_relationships_and_values(db_engine) -> None:  # type: ignore[no-untyped-def]
    with Session(db_engine) as session:
        exp = make_experiment(session)
        other = make_experiment(session)
        compound = make_compound(session)
        sample = Sample(
            sample_code=allocate_code(session, "SMP"), experiment_id=exp.id, sample_type="粉末"
        )
        session.add(sample)
        session.commit()
        exp_id, other_id, compound_id, sample_id = exp.id, other.id, compound.id, sample.id
        exp_code = exp.experiment_code

    invalid = [
        Experiment(experiment_code=exp_code, title="重复", date=date(2035, 1, 1)),
        Sample(sample_code="SMP-2035-999999", experiment_id=uuid4(), sample_type="粉末"),
        Sample(
            sample_code="SMP-2035-999998",
            experiment_id=exp_id,
            sample_type="粉末",
            amount=Decimal("1.0"),
        ),
        FileAsset(
            experiment_id=other_id,
            sample_id=sample_id,
            original_filename="a.txt",
            filename="a",
            file_path="a",
            file_type="text/plain",
            file_size=1,
            sha256="0" * 64,
        ),
        ReactionComponent(reaction_id=uuid4(), compound_id=compound_id, role="invalid"),
    ]
    for record in invalid:
        with Session(db_engine) as session, pytest.raises(IntegrityError):
            session.add(record)
            session.commit()

    with Session(db_engine) as session:
        reaction = Reaction(experiment_id=exp_id, reaction_name="反应")
        session.add(reaction)
        session.commit()
        reaction_id = reaction.id
    for role, yield_percent in (("reagent", Decimal("10")), ("product", Decimal("-1"))):
        with Session(db_engine) as session, pytest.raises(IntegrityError):
            session.add(
                ReactionComponent(
                    reaction_id=reaction_id,
                    compound_id=compound_id,
                    role=role,
                    yield_percent=yield_percent,
                )
            )
            session.commit()
    with Session(db_engine) as session:
        session.add(
            ReactionComponent(
                reaction_id=reaction_id,
                compound_id=compound_id,
                role="product",
                yield_percent=Decimal("125"),
            )
        )
        session.commit()


def test_fifty_independent_transactions_and_committed_number_not_reused(db_engine) -> None:  # type: ignore[no-untyped-def]
    def create_one(index: int) -> tuple[str, str]:
        with Session(db_engine) as session:
            compound = Compound(compound_code=allocate_code(session, "CMP"), name=f"并发{index}")
            session.add(compound)
            session.commit()
            return compound.compound_code, str(compound.id)

    with ThreadPoolExecutor(max_workers=50) as pool:
        created = list(pool.map(create_one, range(50)))
    codes = {code for code, _ in created}
    assert len(codes) == 50
    with Session(db_engine) as session:
        assert update_if_version(session, Compound, UUID(created[0][1]), 1, {}, deleted=True)
        session.commit()
    later_code, _ = create_one(51)
    assert later_code not in codes
    assert int(later_code.split("-")[-1]) > max(int(code.split("-")[-1]) for code in codes)


def test_calendar_year_timezone_width_and_rollback(db_engine) -> None:  # type: ignore[no-untyped-def]
    before = datetime(2041, 12, 31, 15, 59, tzinfo=UTC)
    after = datetime(2041, 12, 31, 16, 1, tzinfo=UTC)
    with Session(db_engine) as session:
        first = allocate_code(session, "EXP", clock=lambda: before)
        next_year = allocate_code(session, "EXP", clock=lambda: after)
        cmp_first = allocate_code(session, "CMP", clock=lambda: before)
        cmp_second = allocate_code(session, "CMP", clock=lambda: after)
        assert first.startswith("EXP-2041-")
        assert next_year.startswith("EXP-2042-")
        assert int(cmp_second.split("-")[-1]) == int(cmp_first.split("-")[-1]) + 1
        experiment = Experiment(experiment_code=first, title="跨年", date=date(2041, 12, 31))
        session.add(experiment)
        session.commit()
        experiment_id = experiment.id
    with Session(db_engine) as session:
        assert update_if_version(session, Experiment, experiment_id, 1, {"date": date(2042, 1, 1)})
        session.commit()
        assert session.get(Experiment, experiment_id).experiment_code == first
    with Session(db_engine) as session:
        allocate_code(session, "SMP", clock=lambda: after)
        session.execute(
            update(NumberCounter)
            .where(NumberCounter.namespace == "SMP", NumberCounter.year == 2042)
            .values(next_value=1_000_000)
        )
        session.commit()
    with Session(db_engine) as session:
        assert allocate_code(session, "SMP", clock=lambda: after) == "SMP-2042-1000000"
        session.rollback()
    with Session(db_engine) as session:
        assert allocate_code(session, "SMP", clock=lambda: after) == "SMP-2042-1000000"
        session.commit()
    with Session(db_engine) as session:
        code = allocate_code(session, "EXP", clock=lambda: datetime(2050, 1, 1, tzinfo=UTC))
        session.add(Experiment(experiment_code=code, title="将回滚", date=date(2050, 1, 1)))
        session.flush()
        session.rollback()
    with Session(db_engine) as session:
        assert session.scalar(select(Experiment).where(Experiment.experiment_code == code)) is None
        assert allocate_code(session, "EXP", clock=lambda: datetime(2050, 1, 1, tzinfo=UTC)) == code
        session.rollback()


def test_visibility_does_not_mutate_child_deletion(db_engine) -> None:  # type: ignore[no-untyped-def]
    with Session(db_engine) as session:
        exp = make_experiment(session)
        compound = make_compound(session)
        sample = Sample(
            sample_code=allocate_code(session, "SMP"), experiment_id=exp.id, sample_type="溶液"
        )
        reaction = Reaction(experiment_id=exp.id, reaction_name="可见性")
        session.add_all([sample, reaction])
        session.flush()
        component = ReactionComponent(
            reaction_id=reaction.id, compound_id=compound.id, role="product"
        )
        file = FileAsset(
            experiment_id=exp.id,
            sample_id=sample.id,
            original_filename="a.txt",
            filename="a",
            file_path="a",
            file_type="text/plain",
            file_size=1,
            sha256="0" * 64,
        )
        session.add_all([component, file])
        session.commit()
        exp_id, sample_id, component_id, file_id = exp.id, sample.id, component.id, file.id
    with Session(db_engine) as session:
        assert update_if_version(session, Experiment, exp_id, 1, {}, deleted=True)
        session.commit()
        assert session.get(Sample, sample_id).deleted_at is None
        assert session.get(ReactionComponent, component_id).deleted_at is None
        assert session.get(FileAsset, file_id).deleted_at is None
        assert (
            session.scalar(
                select(Sample.id).where(
                    Sample.id == sample_id,
                    Sample.id.in_(visible_samples().with_only_columns(Sample.id)),
                )
            )
            is None
        )
        assert (
            session.scalars(
                visible_components().where(ReactionComponent.id == component_id)
            ).first()
            is None
        )
        assert session.scalars(visible_files().where(FileAsset.id == file_id)).first() is None
