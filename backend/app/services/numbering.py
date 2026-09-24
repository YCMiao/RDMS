"""Allocate durable human-readable identifiers inside the caller's transaction."""

from collections.abc import Callable
from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from sqlalchemy import update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import NumberCounter

Clock = Callable[[], datetime]


def allocate_code(session: Session, namespace: str, *, clock: Clock | None = None) -> str:
    if namespace not in {"EXP", "CMP", "SMP"}:
        raise ValueError("Unknown number namespace")
    now = clock() if clock else datetime.now(UTC)
    if now.tzinfo is None:
        raise ValueError("Clock must return an aware datetime")
    year = 0 if namespace == "CMP" else now.astimezone(ZoneInfo(get_settings().app_timezone)).year
    session.execute(
        insert(NumberCounter)
        .values(namespace=namespace, year=year, next_value=1)
        .on_conflict_do_nothing(index_elements=[NumberCounter.namespace, NumberCounter.year])
    )
    issued = session.execute(
        update(NumberCounter)
        .where(NumberCounter.namespace == namespace, NumberCounter.year == year)
        .values(next_value=NumberCounter.next_value + 1)
        .returning(NumberCounter.next_value - 1)
    ).scalar_one()
    return (
        f"{namespace}-{year:04d}-{issued:04d}"
        if namespace == "EXP"
        else (f"SMP-{year:04d}-{issued:06d}" if namespace == "SMP" else f"CMP-{issued:06d}")
    )
