"""Local account authentication. Session secrets never enter JavaScript or the database."""

import hashlib
import hmac
import re
import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Request, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import delete, func, select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.models import Account, AuthRate, LoginSession, Notebook
from app.services.records import RecordError

router = APIRouter(prefix="/auth", tags=["auth"])
COOKIE = "rdms_session"
SESSION_SECONDS = 7 * 24 * 3600
OWNED = (
    "notebook",
    "experiment",
    "compound",
    "sample",
    "reaction",
    "reaction_component",
    "file_asset",
    "tag",
)


class Credentials(BaseModel):
    model_config = ConfigDict(extra="forbid")
    username: str = Field(min_length=3, max_length=40)
    password: str = Field(min_length=12, max_length=128)

    @field_validator("username")
    @classmethod
    def username_valid(cls, value: str) -> str:
        value = value.strip().lower()
        if not re.fullmatch(r"[a-z0-9][a-z0-9_.-]{2,39}", value):
            raise ValueError("账号须为 3–40 位英文字母、数字、点、下划线或连字符")
        return value


class Registration(Credentials):
    display_name: str = Field(min_length=1, max_length=80)

    @field_validator("display_name")
    @classmethod
    def display_name_valid(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("请填写姓名或昵称")
        return value.strip()


class AccountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    username: str
    display_name: str


class PasswordChange(BaseModel):
    model_config = ConfigDict(extra="forbid")
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=12, max_length=128)


def password_hash(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(
        password.encode(), salt=salt, n=32768, r=8, p=1, maxmem=64 * 1024 * 1024
    )
    return f"scrypt${salt.hex()}${digest.hex()}"


def password_matches(password: str, encoded: str) -> bool:
    _, salt, expected = encoded.split("$")
    digest = hashlib.scrypt(
        password.encode(), salt=bytes.fromhex(salt), n=32768, r=8, p=1, maxmem=64 * 1024 * 1024
    )
    return hmac.compare_digest(digest.hex(), expected)


DUMMY_HASH = password_hash("dummy-account-password")


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def limit_attempts(request: Request, action: str, username: str = "") -> None:
    now = datetime.now(UTC)
    peer = request.client.host if request.client else "local"
    # Persistent counters are shared by all workers; proxy headers are never trusted here.
    buckets = [(f"{action}:ip:{peer}", 60), (f"{action}:account:{username}", 15)]
    with SessionLocal() as db:
        db.execute(delete(AuthRate).where(AuthRate.started_at < now - timedelta(days=1)))
        blocked = False
        for key, maximum in buckets:
            hashed = token_hash(key)
            db.execute(
                insert(AuthRate)
                .values(key=hashed, started_at=now, attempts=0)
                .on_conflict_do_nothing()
            )
            rate = db.scalar(select(AuthRate).where(AuthRate.key == hashed).with_for_update())
            assert rate is not None
            if rate.started_at < now - timedelta(minutes=15):
                rate.started_at, rate.attempts = now, 0
            rate.attempts += 1
            blocked |= rate.attempts > maximum
        db.commit()
    if blocked:
        raise RecordError(429, "RATE_LIMITED", "尝试次数过多，请 15 分钟后再试")


def require_account(request: Request) -> Account:
    token = request.cookies.get(COOKIE, "")
    if not token or len(token) > 128:
        raise RecordError(401, "UNAUTHENTICATED", "请先登录")
    with SessionLocal() as db:
        account = db.scalar(
            select(Account)
            .join(LoginSession, LoginSession.account_id == Account.id)
            .where(
                LoginSession.token_hash == token_hash(token),
                LoginSession.expires_at > datetime.now(UTC),
            )
        )
        if account is None:
            raise RecordError(401, "UNAUTHENTICATED", "登录已失效，请重新登录")
        db.expunge(account)
        return account


def issue_session(db: Session, account: Account, response: Response) -> None:
    token = secrets.token_urlsafe(32)
    db.execute(delete(LoginSession).where(LoginSession.expires_at <= datetime.now(UTC)))
    db.add(
        LoginSession(
            token_hash=token_hash(token),
            account_id=account.id,
            expires_at=datetime.now(UTC) + timedelta(seconds=SESSION_SECONDS),
        )
    )
    response.set_cookie(
        COOKIE,
        token,
        max_age=SESSION_SECONDS,
        httponly=True,
        secure=get_settings().auth_cookie_secure,
        samesite="strict",
        path="/api",
    )
    response.headers["Cache-Control"] = "no-store"


@router.post("/register", response_model=AccountOut, status_code=201)
def register(payload: Registration, request: Request, response: Response) -> Account:
    limit_attempts(request, "register", payload.username)
    encoded = password_hash(payload.password)
    with SessionLocal() as db:
        # Serialize bootstrap and duplicate checks across workers and concurrent requests.
        db.execute(text("SELECT pg_advisory_xact_lock(724391058)"))
        first = db.scalar(select(func.count()).select_from(Account)) == 0
        if db.scalar(select(Account.id).where(Account.username == payload.username)):
            raise RecordError(409, "ACCOUNT_EXISTS", "该账号已注册，请登录或换一个账号")
        account = Account(
            username=payload.username, display_name=payload.display_name, password_hash=encoded
        )
        db.add(account)
        db.flush()
        if first:
            for table in OWNED:
                db.execute(
                    text(f"UPDATE {table} SET owner_id = :id WHERE owner_id IS NULL"),
                    {"id": account.id},
                )
        else:
            number = db.scalar(text("SELECT nextval('notebook_code_seq')"))
            db.add(Notebook(code=f"NB{number:03d}", name="我的实验", owner_id=account.id))
        previous = request.cookies.get(COOKIE)
        if previous:
            db.execute(delete(LoginSession).where(LoginSession.token_hash == token_hash(previous)))
        issue_session(db, account, response)
        db.commit()
        return account


@router.post("/login", response_model=AccountOut)
def login(payload: Credentials, request: Request, response: Response) -> Account:
    limit_attempts(request, "login", payload.username)
    with SessionLocal() as db:
        account = db.scalar(
            select(Account).where(Account.username == payload.username).with_for_update()
        )
        valid = password_matches(payload.password, account.password_hash if account else DUMMY_HASH)
        if account is None or not valid:
            raise RecordError(401, "INVALID_CREDENTIALS", "账号或密码错误")
        previous = request.cookies.get(COOKIE)
        if previous:
            db.execute(delete(LoginSession).where(LoginSession.token_hash == token_hash(previous)))
        issue_session(db, account, response)
        db.commit()
        return account


@router.get("/me", response_model=AccountOut)
def me(request: Request, response: Response) -> Account:
    response.headers["Cache-Control"] = "no-store"
    return require_account(request)


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response) -> None:
    with SessionLocal() as db:
        db.execute(
            delete(LoginSession).where(
                LoginSession.token_hash == token_hash(request.cookies.get(COOKIE, ""))
            )
        )
        db.commit()
    response.delete_cookie(
        COOKIE,
        path="/api",
        secure=get_settings().auth_cookie_secure,
        httponly=True,
        samesite="strict",
    )
    response.headers["Cache-Control"] = "no-store"


@router.post("/password", status_code=204)
def change_password(payload: PasswordChange, request: Request, response: Response) -> None:
    identity = require_account(request)
    limit_attempts(request, "password", identity.username)
    with SessionLocal() as db:
        account = db.scalar(select(Account).where(Account.id == identity.id).with_for_update())
        assert account is not None
        if not password_matches(payload.current_password, account.password_hash):
            raise RecordError(400, "INVALID_PASSWORD", "当前密码错误")
        account.password_hash = password_hash(payload.new_password)
        db.execute(delete(LoginSession).where(LoginSession.account_id == account.id))
        issue_session(db, account, response)
        db.commit()
