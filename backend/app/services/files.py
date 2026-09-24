"""Immutable local file storage and versioned metadata."""

import hashlib
import os
import re
import tempfile
import zipfile
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

from fastapi import UploadFile
from PIL import Image, UnidentifiedImageError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.files_schema import FilePatch
from app.core.config import get_settings
from app.models import Experiment, FileAsset, Sample
from app.services.records import RecordError, conflict, lock_record, missing
from app.services.versioning import update_if_version
from app.services.visibility import visible_files

TYPES = {
    ".pdf": "application/pdf",
    ".csv": "text/csv",
    ".txt": "text/plain",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".jdx": "chemical/x-jcamp-dx",
    ".dx": "chemical/x-jcamp-dx",
    ".zip": "application/zip",
}
CHUNK = 1024 * 1024
MAX_PIXELS = 50_000_000


def file_output(row: FileAsset) -> dict[str, Any]:
    fields = (
        "id",
        "experiment_id",
        "sample_id",
        "original_filename",
        "file_type",
        "file_size",
        "sha256",
        "instrument_type",
        "uploaded_at",
        "notes",
        "created_at",
        "updated_at",
        "version",
    )
    result = {key: getattr(row, key) for key in fields}
    result["download_url"] = f"/api/files/{row.id}/download"
    return result


def clean_name(name: str | None) -> tuple[str, str]:
    if (
        not name
        or len(name) > 255
        or name in {".", ".."}
        or any(ord(char) < 32 or ord(char) == 127 or char in "/\\" for char in name)
    ):
        raise RecordError(422, "VALIDATION_ERROR", "文件名无效")
    suffix = Path(name).suffix.lower()
    if suffix not in TYPES:
        raise RecordError(415, "UNSUPPORTED_MEDIA_TYPE", "不支持此文件类型")
    return name, suffix


def storage_root() -> Path:
    root = get_settings().upload_root
    root.mkdir(parents=True, exist_ok=True)
    if root.is_symlink():
        raise RecordError(503, "STORAGE_UNAVAILABLE", "上传目录不能是符号链接")
    return root.resolve()


def safe_dir(root: Path, name: str) -> Path:
    path = root / name
    if path.is_symlink():
        raise RecordError(503, "STORAGE_UNAVAILABLE", "存储目录不能是符号链接")
    path.mkdir(mode=0o700, exist_ok=True)
    if path.resolve() != path or not path.is_dir():
        raise RecordError(503, "STORAGE_UNAVAILABLE", "存储目录不可用")
    return path


def safe_path(root: Path, key: str) -> Path:
    path = root / key
    if (
        path.resolve() != path
        or not path.is_relative_to(root)
        or any(part.is_symlink() for part in [path, *path.parents] if part.is_relative_to(root))
    ):
        raise RecordError(503, "STORAGE_UNAVAILABLE", "文件存储路径不安全")
    return path


def inspect_file(path: Path, suffix: str) -> None:
    try:
        with path.open("rb") as stream:
            head = stream.read(16)
        if suffix == ".pdf":
            if not head.startswith(b"%PDF-"):
                raise ValueError("PDF 文件头无效")
        elif suffix in {".png", ".jpg", ".jpeg"}:
            expected = (
                head.startswith(b"\x89PNG\r\n\x1a\n")
                if suffix == ".png"
                else head.startswith(b"\xff\xd8\xff")
            )
            if not expected:
                raise ValueError("图像签名无效")
            with Image.open(path) as picture:
                if picture.width * picture.height > MAX_PIXELS:
                    raise ValueError("图像像素数量超限")
                picture.verify()
            with Image.open(path) as picture:
                picture.load()
        elif suffix == ".zip":
            with zipfile.ZipFile(path) as archive:
                archive.infolist()
        else:
            raw = path.read_bytes()
            try:
                decoded = raw.decode("utf-8-sig")
            except UnicodeDecodeError:
                decoded = raw.decode("gb18030")
            if "\x00" in decoded or sum(
                ord(char) < 32 and char not in "\r\n\t" for char in decoded
            ) > max(1, len(decoded) // 100):
                raise ValueError("包含二进制内容")
            if suffix in {".jdx", ".dx"} and (
                not re.search(r"(?im)^##TITLE\s*=", decoded)
                or not re.search(r"(?im)^##END\s*=", decoded)
            ):
                raise ValueError("JCAMP-DX 缺少 TITLE 或 END")
    except (
        OSError,
        ValueError,
        UnicodeError,
        zipfile.BadZipFile,
        UnidentifiedImageError,
        Image.DecompressionBombError,
    ) as exc:
        raise RecordError(422, "VALIDATION_ERROR", "文件内容与扩展名不符或文件损坏") from exc


def sample_lock(session: Session, experiment_id: UUID, sample_id: UUID | None) -> None:
    if sample_id is None:
        return
    row = session.scalar(select(Sample).where(Sample.id == sample_id).with_for_update())
    if row is None or row.deleted_at is not None or row.experiment_id != experiment_id:
        raise conflict("样品不存在、已删除或不属于此实验")


def upload(
    session: Session,
    experiment_id: UUID,
    file: UploadFile,
    sample_id: UUID | None,
    instrument_type: str | None,
    notes: str | None,
) -> dict[str, Any]:
    name, suffix = clean_name(file.filename)
    if instrument_type is not None and len(instrument_type) > 300:
        raise RecordError(422, "VALIDATION_ERROR", "仪器类型过长")
    root = storage_root()
    temporary = safe_dir(root, ".tmp")
    digest = hashlib.sha256()
    size = 0
    temp_path: Path | None = None
    final_path: Path | None = None
    published = False
    committed = False
    try:
        with tempfile.NamedTemporaryFile(dir=temporary, prefix="upload-", delete=False) as target:
            temp_path = Path(target.name)
            while block := file.file.read(CHUNK):
                size += len(block)
                if size > get_settings().max_upload_bytes:
                    raise RecordError(413, "FILE_TOO_LARGE", "文件超过上传上限")
                digest.update(block)
                target.write(block)
            target.flush()
            os.fsync(target.fileno())
        if size == 0:
            raise RecordError(422, "VALIDATION_ERROR", "不能上传空文件")
        inspect_file(temp_path, suffix)
        lock_record(session, Experiment, experiment_id)
        sample_lock(session, experiment_id, sample_id)
        identifier = uuid4()
        safe_dir(safe_dir(root, "objects"), identifier.hex[:2])
        key = f"objects/{identifier.hex[:2]}/{identifier}{suffix}"
        final_path = safe_path(root, key)
        os.link(temp_path, final_path, follow_symlinks=False)
        published = True
        temp_path.unlink()
        temp_path = None
        row = FileAsset(
            id=identifier,
            experiment_id=experiment_id,
            sample_id=sample_id,
            original_filename=name,
            filename=f"{identifier}{suffix}",
            file_path=key,
            file_type=TYPES[suffix],
            file_size=size,
            sha256=digest.hexdigest(),
            instrument_type=instrument_type,
            notes=notes,
        )
        session.add(row)
        session.commit()
        committed = True
        session.refresh(row)
        return file_output(row)
    except Exception:
        session.rollback()
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)
        if published and not committed and final_path is not None:
            final_path.unlink(missing_ok=True)
        raise


def files_page(
    session: Session,
    *,
    experiment_id: UUID | None,
    sample_id: UUID | None,
    file_type: str | None,
    q: str | None,
    page: int,
    size: int,
) -> dict[str, Any]:
    statement = visible_files()
    if experiment_id is not None:
        statement = statement.where(FileAsset.experiment_id == experiment_id)
    if sample_id is not None:
        statement = statement.where(FileAsset.sample_id == sample_id)
    if file_type:
        statement = statement.where(FileAsset.file_type == file_type)
    if q:
        statement = statement.where(FileAsset.original_filename.ilike(f"%{q}%"))
    total = (
        session.scalar(select(func.count()).select_from(statement.order_by(None).subquery())) or 0
    )
    rows = session.scalars(
        statement.order_by(FileAsset.uploaded_at.desc(), FileAsset.id.desc())
        .limit(size)
        .offset((page - 1) * size)
    ).all()
    return {
        "items": [file_output(row) for row in rows],
        "page": page,
        "page_size": size,
        "total": total,
    }


def get_file(session: Session, file_id: UUID) -> FileAsset:
    row = session.scalar(visible_files().where(FileAsset.id == file_id))
    if row is None:
        raise missing()
    return row


def patch_file(session: Session, file_id: UUID, payload: FilePatch) -> dict[str, Any]:
    experiment_id = session.scalar(select(FileAsset.experiment_id).where(FileAsset.id == file_id))
    if experiment_id is None:
        raise missing()
    lock_record(session, Experiment, experiment_id)
    changes = payload.model_dump(exclude_unset=True, exclude={"expected_version"})
    if "sample_id" in changes:
        sample_lock(session, experiment_id, changes["sample_id"])
    row = session.scalar(select(FileAsset).where(FileAsset.id == file_id).with_for_update())
    if row is None or row.deleted_at is not None:
        raise missing()
    if row.version != payload.expected_version:
        raise conflict()
    if not update_if_version(session, FileAsset, file_id, payload.expected_version, changes):
        raise conflict()
    session.commit()
    session.refresh(row)
    return file_output(row)


def change_file(
    session: Session, file_id: UUID, version: int, *, restore: bool
) -> dict[str, Any] | None:
    experiment_id = session.scalar(select(FileAsset.experiment_id).where(FileAsset.id == file_id))
    if experiment_id is None:
        raise missing()
    parent = lock_record(session, Experiment, experiment_id, active=False)
    if parent.deleted_at is not None:
        if restore:
            raise conflict("请先恢复所属实验")
        raise missing()
    row = session.scalar(select(FileAsset).where(FileAsset.id == file_id).with_for_update())
    if row is None or (row.deleted_at is None) == restore:
        raise missing()
    if row.version != version:
        raise conflict()
    if restore:
        sample_lock(session, experiment_id, row.sample_id)
    if not update_if_version(session, FileAsset, file_id, version, {}, deleted=not restore):
        raise conflict()
    session.commit()
    session.refresh(row)
    return file_output(row) if restore else None


def download_path(row: FileAsset) -> tuple[Path, str]:
    root = storage_root()
    path = safe_path(root, row.file_path)
    if not path.is_file() or path.stat().st_size != row.file_size:
        raise RecordError(503, "STORAGE_UNAVAILABLE", "原始文件缺失或大小不符")
    return path, row.original_filename
