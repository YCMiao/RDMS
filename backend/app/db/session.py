from collections.abc import Generator
from typing import Any

from fastapi import Request
from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Session, SessionTransaction, sessionmaker

from app.core.config import get_settings

engine = create_engine(get_settings().database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


@event.listens_for(Session, "after_begin")
def private_transaction(
    session: Session, transaction: SessionTransaction, connection: Connection
) -> None:
    del transaction
    if session.info.get("summary_snapshot"):
        connection.execute(text("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"))
    account_id: Any = session.info.get("account_id")
    if account_id is not None:
        connection.execute(text("SET LOCAL ROLE rdms_member"))
        connection.execute(
            text("SELECT set_config('rdms.account_id', :id, true)"), {"id": str(account_id)}
        )


def get_db(request: Request) -> Generator[Session, None, None]:
    from app.api.auth import require_account

    account = require_account(request)
    with SessionLocal(info={"account_id": account.id}) as session:
        yield session
