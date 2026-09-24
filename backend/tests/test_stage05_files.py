"""Stage 05 file transfer and metadata checks using test-only storage."""

import hashlib
import io
import zipfile
from pathlib import Path

from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import engine
from app.models import FileAsset


def create(client: TestClient, path: str, body: dict) -> dict:
    response = client.post(path, json=body)
    assert response.status_code == 201, response.text
    return response.json()


def send(
    client: TestClient, experiment_id: str, name: str, content: bytes, **fields: str
) -> object:
    return client.post(
        f"/api/experiments/{experiment_id}/files",
        files={"file": (name, content, "application/octet-stream")},
        data=fields,
    )


def test_allowed_types_bytes_and_metadata(client: TestClient, upload_root: Path) -> None:
    experiment = create(client, "/api/experiments", {"title": "文件实验", "date": "2026-09-23"})
    sample = create(
        client, "/api/samples", {"experiment_id": experiment["id"], "sample_type": "溶液"}
    )
    png = io.BytesIO()
    Image.new("RGB", (2, 2), "red").save(png, format="PNG")
    jpeg = io.BytesIO()
    Image.new("RGB", (2, 2), "red").save(jpeg, format="JPEG")
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w") as bundle:
        bundle.writestr("readme.txt", "fixture")
    fixtures = [
        ("report.PDF", b"%PDF-1.4\nfixture"),
        ("table.csv", "列,数值\n甲,1\n".encode()),
        ("notes.txt", "中文备注".encode("gb18030")),
        ("image.png", png.getvalue()),
        ("photo.jpeg", jpeg.getvalue()),
        ("spectrum.jdx", b"##TITLE=Fixture\n##END=\n"),
        ("spectrum.dx", b"##TITLE=Fixture\n##END=\n"),
        ("bundle.zip", archive.getvalue()),
    ]
    saved = []
    for name, content in fixtures:
        response = send(
            client,
            experiment["id"],
            name,
            content,
            sample_id=sample["id"],
            instrument_type="synthetic",
        )
        assert response.status_code == 201, response.text
        item = response.json()
        assert item["original_filename"] == name
        assert item["file_size"] == len(content)
        assert item["sha256"] == hashlib.sha256(content).hexdigest()
        assert "file_path" not in item and "filename" not in item
        download = client.get(item["download_url"])
        assert download.status_code == 200 and download.content == content
        assert download.headers["x-content-type-options"] == "nosniff"
        assert "filename*=UTF-8''" in download.headers["content-disposition"]
        saved.append(item)
    assert client.get(f"/api/experiments/{experiment['id']}/files").json()["total"] == len(fixtures)
    assert client.get(f"/api/files?sample_id={sample['id']}").json()["total"] == len(fixtures)
    with Session(engine) as session:
        paths = session.scalars(
            select(FileAsset.file_path).where(FileAsset.experiment_id == experiment["id"])
        ).all()
    assert len(paths) == len(set(paths))
    assert all((upload_root / path).is_file() for path in paths)
    duplicate = send(client, experiment["id"], "report.PDF", fixtures[0][1])
    assert duplicate.status_code == 201
    with Session(engine) as session:
        duplicate_path = session.scalar(
            select(FileAsset.file_path).where(FileAsset.id == duplicate.json()["id"])
        )
    assert duplicate_path not in paths
    first = saved[0]
    assert (
        client.patch(
            f"/api/files/{first['id']}", json={"expected_version": 1, "file_size": 1}
        ).status_code
        == 422
    )
    updated = client.patch(
        f"/api/files/{first['id']}",
        json={"expected_version": 1, "notes": "保留原件", "sample_id": None},
    )
    assert updated.status_code == 200 and updated.json()["version"] == 2
    assert (
        client.patch(
            f"/api/files/{first['id']}", json={"expected_version": 1, "notes": "覆盖"}
        ).status_code
        == 409
    )
    assert client.delete(f"/api/files/{first['id']}?expected_version=2").status_code == 204
    assert client.get(first["download_url"]).status_code == 404
    assert (upload_root / paths[0]).exists() or any((upload_root / path).exists() for path in paths)
    assert (
        client.post(f"/api/files/{first['id']}/restore", json={"expected_version": 3}).status_code
        == 200
    )
    assert client.get(first["download_url"]).content == fixtures[0][1]
    assert client.delete(f"/api/samples/{sample['id']}?expected_version=1").status_code == 204
    assert client.get(saved[1]["download_url"]).status_code == 200
    assert (
        client.delete(f"/api/experiments/{experiment['id']}?expected_version=1").status_code == 204
    )
    assert client.get(saved[1]["download_url"]).status_code == 404
    assert (
        client.post(
            f"/api/files/{saved[1]['id']}/restore", json={"expected_version": 1}
        ).status_code
        == 409
    )


def test_rejected_files_leave_no_metadata(
    client: TestClient, upload_root: Path, monkeypatch
) -> None:
    experiment = create(client, "/api/experiments", {"title": "拒绝文件", "date": "2026-09-23"})
    bad = [
        ("../escape.txt", b"hello", 422),
        ("empty.txt", b"", 422),
        ("fake.pdf", b"not a PDF", 422),
        ("fake.png", b"not a PNG", 422),
        ("fake.zip", b"not a ZIP", 422),
        ("bad.jdx", b"##TITLE=Only", 422),
        ("binary.txt", b"abc\x00def", 422),
        ("script.exe", b"hello", 415),
    ]
    for name, body, expected in bad:
        response = send(client, experiment["id"], name, body)
        assert response.status_code == expected, (name, response.text)
    assert client.get(f"/api/experiments/{experiment['id']}/files").json()["total"] == 0
    monkeypatch.setattr(get_settings(), "max_upload_bytes", 8)
    assert send(client, experiment["id"], "large.txt", b"123456789").status_code == 413
    assert client.get(f"/api/experiments/{experiment['id']}/files").json()["total"] == 0
    temporary = upload_root / ".tmp"
    assert not list(temporary.glob("upload-*"))


def test_failed_commit_removes_only_new_file(
    client: TestClient, upload_root: Path, monkeypatch
) -> None:
    experiment = create(client, "/api/experiments", {"title": "提交故障", "date": "2026-09-23"})
    before = (
        set((upload_root / "objects").rglob("*")) if (upload_root / "objects").exists() else set()
    )
    original_commit = Session.commit

    def fail_commit(self: Session) -> None:
        raise RuntimeError("injected database commit failure")

    with monkeypatch.context() as patch:
        patch.setattr(Session, "commit", fail_commit)
        try:
            send(client, experiment["id"], "failed.txt", b"original bytes")
        except RuntimeError as exc:
            assert "injected database commit failure" in str(exc)
        else:
            raise AssertionError("fault injection did not reach commit")
    after = (
        set((upload_root / "objects").rglob("*")) if (upload_root / "objects").exists() else set()
    )
    assert not [path for path in after - before if path.is_file()]
    assert client.get(f"/api/experiments/{experiment['id']}/files").json()["total"] == 0
    assert not list((upload_root / ".tmp").glob("upload-*"))
    assert original_commit is Session.commit


def test_response_failure_after_commit_preserves_original(
    client: TestClient, upload_root: Path, monkeypatch
) -> None:
    experiment = create(client, "/api/experiments", {"title": "响应故障", "date": "2026-09-23"})
    original_refresh = Session.refresh

    def fail_refresh(self: Session, instance: object, *args: object, **kwargs: object) -> None:
        if isinstance(instance, FileAsset):
            raise RuntimeError("injected response failure")
        original_refresh(self, instance, *args, **kwargs)

    with monkeypatch.context() as patch:
        patch.setattr(Session, "refresh", fail_refresh)
        try:
            send(client, experiment["id"], "retained.txt", b"must survive")
        except RuntimeError as exc:
            assert "injected response failure" in str(exc)
        else:
            raise AssertionError("fault injection did not reach refresh")
    listing = client.get(f"/api/experiments/{experiment['id']}/files").json()
    assert listing["total"] == 1
    item = listing["items"][0]
    assert client.get(item["download_url"]).content == b"must survive"
    with Session(engine) as session:
        path = session.scalar(select(FileAsset.file_path).where(FileAsset.id == item["id"]))
    assert path is not None and (upload_root / path).is_file()


def test_cross_experiment_sample_and_residue(client: TestClient, upload_root: Path) -> None:
    first = create(client, "/api/experiments", {"title": "文件父级 A", "date": "2026-09-23"})
    second = create(client, "/api/experiments", {"title": "文件父级 B", "date": "2026-09-23"})
    sample = create(client, "/api/samples", {"experiment_id": second["id"], "sample_type": "溶液"})
    temporary = upload_root / ".tmp"
    temporary.mkdir(exist_ok=True)
    residue = temporary / "upload-interrupted"
    residue.write_bytes(b"incomplete")
    blocked = send(client, first["id"], "data.txt", b"valid data", sample_id=sample["id"])
    assert blocked.status_code == 409
    assert client.get(f"/api/experiments/{first['id']}/files").json()["total"] == 0
    valid = send(client, first["id"], "data.txt", b"valid data")
    assert valid.status_code == 201
    assert residue.read_bytes() == b"incomplete"


def test_parent_and_symlink_guards(client: TestClient, upload_root: Path) -> None:
    experiment = create(client, "/api/experiments", {"title": "路径守卫", "date": "2026-09-23"})
    sample = create(
        client, "/api/samples", {"experiment_id": experiment["id"], "sample_type": "原件"}
    )
    result = send(client, experiment["id"], "safe.txt", b"safe", sample_id=sample["id"])
    assert result.status_code == 201
    item = result.json()
    assert client.delete(f"/api/files/{item['id']}?expected_version=1").status_code == 204
    assert client.delete(f"/api/samples/{sample['id']}?expected_version=1").status_code == 204
    assert (
        client.post(f"/api/files/{item['id']}/restore", json={"expected_version": 2}).status_code
        == 409
    )
    assert (
        send(client, experiment["id"], "more.txt", b"more", sample_id=sample["id"]).status_code
        == 409
    )
    assert (
        client.post(
            f"/api/samples/{sample['id']}/restore", json={"expected_version": 2}
        ).status_code
        == 200
    )
    assert (
        client.post(f"/api/files/{item['id']}/restore", json={"expected_version": 2}).status_code
        == 200
    )
    with Session(engine) as session:
        row = session.get(FileAsset, item["id"])
        assert row is not None
        original = row.file_path
        escape = upload_root / "outside.txt"
        escape.write_bytes(b"other")
        link = (upload_root / original).parent / "evil.txt"
        link.symlink_to(escape)
        row.file_path = str(link.relative_to(upload_root))
        session.commit()
    assert client.get(item["download_url"]).status_code == 503
    with Session(engine) as session:
        row = session.get(FileAsset, item["id"])
        assert row is not None
        row.file_path = original
        session.commit()
    assert client.get(item["download_url"]).content == b"safe"
    assert (
        client.delete(f"/api/experiments/{experiment['id']}?expected_version=1").status_code == 204
    )
    assert send(client, experiment["id"], "late.txt", b"late").status_code == 404
