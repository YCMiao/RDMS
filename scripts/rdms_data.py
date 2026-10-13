#!/usr/bin/env python3
"""Read-only storage audit and explicit, isolated RDMS backup/restore."""
from __future__ import annotations

import argparse
import ast
import csv
import hashlib
import io
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parent.parent
COMPOSE_FILE = PROJECT_ROOT / "docker-compose.yml"
SUCCESS = "SUCCESS"


class ProtectionError(RuntimeError):
    pass


def docker_cli() -> str:
    found = shutil.which("docker")
    if found:
        return found
    fallback = Path("/Applications/Docker.app/Contents/Resources/bin/docker")
    if fallback.is_file():
        return str(fallback)
    raise ProtectionError("Docker CLI 不可用")


def require_project(name: str) -> str:
    if not re.fullmatch(r"[a-z][a-z0-9_-]{2,40}", name):
        raise ProtectionError("Compose 项目名只能使用 3–41 位小写字母、数字、_ 或 -")
    return name


def compose(project: str, upload_root: Path, *args: str, port: int | None = None) -> list[str]:
    del upload_root, port
    return [docker_cli(), "compose", "-f", str(COMPOSE_FILE), "-p", require_project(project), *args]


def environment(upload_root: Path, port: int | None = None) -> dict[str, str]:
    result = os.environ.copy()
    result["UPLOAD_HOST_ROOT"] = str(upload_root)
    if port is not None:
        result["APP_HOST_PORT"] = str(port)
    return result


def run(command: list[str], env: dict[str, str], *, input_bytes: bytes | None = None) -> bytes:
    completed = subprocess.run(command, cwd=PROJECT_ROOT, env=env, input=input_bytes, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if completed.returncode:
        message = completed.stderr.decode("utf-8", errors="replace").strip()
        raise ProtectionError(f"命令失败 ({completed.returncode}): {message[-600:]}")
    return completed.stdout


def container_id(project: str, upload_root: Path, service: str, *, port: int | None = None) -> str:
    output = run(compose(project, upload_root, "ps", "-a", "-q", service), environment(upload_root, port)).decode().strip()
    if not output:
        raise ProtectionError(f"找不到 {project} 的 {service} 容器")
    return output.splitlines()[0]


def inspect(container: str, field: str) -> Any:
    output = run([docker_cli(), "inspect", "-f", f"{{{{json .{field}}}}}", container], os.environ.copy())
    return json.loads(output)


def running(project: str, upload_root: Path, service: str, *, port: int | None = None) -> bool:
    try:
        return bool(inspect(container_id(project, upload_root, service, port=port), "State.Running"))
    except ProtectionError:
        return False


def verify_mount(project: str, upload_root: Path) -> None:
    if not running(project, upload_root, "db"):
        raise ProtectionError("源数据库容器未运行")
    backend = container_id(project, upload_root, "backend")
    mounts = inspect(backend, "Mounts")
    actual = [Path(item["Source"]).resolve() for item in mounts if item["Destination"] == "/data/uploads"]
    if len(actual) != 1 or actual[0] != upload_root.resolve():
        raise ProtectionError("指定上传目录与源后端实际挂载目录不一致")


def db_identity(project: str, upload_root: Path, *, port: int | None = None) -> tuple[str, str]:
    values = inspect(container_id(project, upload_root, "db", port=port), "Config.Env")
    mapping = dict(item.split("=", 1) for item in values if "=" in item)
    return mapping["POSTGRES_USER"], mapping["POSTGRES_DB"]


def frontend_port(project: str, upload_root: Path) -> int | None:
    try:
        bindings = inspect(container_id(project, upload_root, "frontend"), "HostConfig.PortBindings")
        values = bindings.get("80/tcp") or []
        return int(values[0]["HostPort"]) if values else None
    except (ProtectionError, ValueError, KeyError, TypeError):
        return None


def database_query(project: str, upload_root: Path, sql: str, *, port: int | None = None) -> bytes:
    user, database = db_identity(project, upload_root, port=port)
    return run(compose(project, upload_root, "exec", "-T", "db", "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", user, "-d", database, "-c", sql), environment(upload_root, port))


def db_files(project: str, upload_root: Path, *, port: int | None = None) -> list[dict[str, str]]:
    raw = database_query(project, upload_root, "COPY (SELECT file_path, file_size, sha256 FROM file_asset ORDER BY file_path) TO STDOUT WITH CSV HEADER", port=port)
    return list(csv.DictReader(io.StringIO(raw.decode("utf-8"))))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def safe_file(root: Path, key: str) -> Path:
    relative = Path(key)
    if relative.is_absolute() or ".." in relative.parts or not key.startswith("objects/"):
        raise ProtectionError(f"不安全的存储键: {key}")
    path = root / relative
    if path.resolve() != path or not path.is_relative_to(root):
        raise ProtectionError(f"符号链接或逃逸路径: {key}")
    return path


def scan(project: str, upload_root: Path, *, full_hash: bool = False, port: int | None = None) -> dict[str, Any]:
    root = upload_root.resolve()
    if not root.is_dir():
        raise ProtectionError("上传目录不存在")
    rows = db_files(project, root, port=port)
    referenced = {item["file_path"] for item in rows}
    findings: dict[str, list[str]] = {"missing": [], "size_mismatch": [], "hash_mismatch": [], "orphan": [], "temporary": [], "unsafe": []}
    for item in rows:
        key = item["file_path"]
        try:
            path = safe_file(root, key)
        except ProtectionError:
            findings["unsafe"].append(key)
            continue
        if not path.is_file():
            findings["missing"].append(key)
        elif path.stat().st_size != int(item["file_size"]):
            findings["size_mismatch"].append(key)
        elif full_hash and sha256(path) != item["sha256"]:
            findings["hash_mismatch"].append(key)
    objects = root / "objects"
    if objects.exists():
        for path in objects.rglob("*"):
            if path.is_file() or path.is_symlink():
                key = path.relative_to(root).as_posix()
                if key not in referenced:
                    findings["orphan"].append(key)
    temporary = root / ".tmp"
    if temporary.exists():
        findings["temporary"] = [path.relative_to(root).as_posix() for path in temporary.rglob("*") if path.is_file() or path.is_symlink()]
    severe = any(findings[name] for name in ("missing", "size_mismatch", "hash_mismatch", "unsafe"))
    return {"project": project, "upload_root": str(root), "referenced_count": len(rows), "findings": {key: sorted(value) for key, value in findings.items()}, "consistent": not severe}


def tree_fingerprint() -> str:
    digest = hashlib.sha256()
    for subtree in ("backend/app", "backend/alembic", "frontend/src", "scripts"):
        for path in sorted((PROJECT_ROOT / subtree).rglob("*")):
            if path.is_file() and "__pycache__" not in path.parts:
                digest.update(path.relative_to(PROJECT_ROOT).as_posix().encode())
                digest.update(sha256(path).encode())
    return digest.hexdigest()


def all_formal_files(root: Path) -> list[Path]:
    objects = root / "objects"
    if not objects.exists():
        return []
    result = []
    for path in sorted(objects.rglob("*")):
        if path.is_symlink():
            raise ProtectionError(f"正式文件目录含符号链接: {path}")
        if path.is_file():
            safe_file(root, path.relative_to(root).as_posix())
            result.append(path)
    return result


def backup(source_project: str, source_root: Path, destination: Path) -> dict[str, Any]:
    source_root = source_root.resolve()
    destination = destination.expanduser().absolute()
    if destination == source_root or destination.is_relative_to(source_root):
        raise ProtectionError("备份目标不能位于上传目录内")
    if destination.exists():
        raise ProtectionError("备份目标已存在；拒绝覆盖")
    verify_mount(source_project, source_root)
    prior = {name: running(source_project, source_root, name) for name in ("frontend", "backend")}
    source_port = frontend_port(source_project, source_root) if prior["frontend"] else None
    destination.mkdir(mode=0o700, parents=True, exist_ok=False)
    env = environment(source_root, source_port)
    failure: Exception | None = None
    manifest: dict[str, Any] | None = None
    try:
        for name in ("frontend", "backend"):
            if prior[name]:
                run(compose(source_project, source_root, "stop", name), env)
        audit = scan(source_project, source_root, full_hash=True)
        if not audit["consistent"]:
            raise ProtectionError("源文件一致性检查失败")
        user, database = db_identity(source_project, source_root)
        dump = destination / "database.dump"
        command = compose(source_project, source_root, "exec", "-T", "db", "pg_dump", "-U", user, "-d", database, "-Fc", "--no-owner", "--no-privileges")
        with dump.open("wb") as output:
            completed = subprocess.run(command, cwd=PROJECT_ROOT, env=env, stdout=output, stderr=subprocess.PIPE, check=False)
        if completed.returncode:
            raise ProtectionError(f"pg_dump 失败 ({completed.returncode}): {completed.stderr.decode(errors='replace')[-600:]}")
        if dump.stat().st_size == 0:
            raise ProtectionError("pg_dump 输出为空")
        file_manifest = []
        for source in all_formal_files(source_root):
            relative = source.relative_to(source_root)
            target = destination / "files" / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
            digest = sha256(source)
            if sha256(target) != digest:
                raise ProtectionError(f"备份文件校验失败: {relative}")
            file_manifest.append({"path": relative.as_posix(), "size": source.stat().st_size, "sha256": digest})
        revision = database_query(source_project, source_root, "COPY (SELECT version_num FROM alembic_version) TO STDOUT").decode().strip()
        db_version = database_query(source_project, source_root, "COPY (SELECT current_setting('server_version')) TO STDOUT").decode().strip()
        manifest = {
            "format_version": 1,
            "created_at": datetime.now(UTC).isoformat(),
            "source_project": source_project,
            "source_upload_root": str(source_root),
            "code_fingerprint": tree_fingerprint(),
            "alembic_revision": revision,
            "postgresql_version": db_version,
            "dump_sha256": sha256(dump),
            "files": file_manifest,
            "temporary_residue": audit["findings"]["temporary"],
            "orphan_files": audit["findings"]["orphan"],
        }
        manifest_path = destination / "manifest.json"
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        verify_payload(destination, require_success=False)
    except Exception as exc:
        failure = exc
        (destination / "failure.log").write_text(f"{datetime.now(UTC).isoformat()} {type(exc).__name__}: {exc}\n", encoding="utf-8")
        raise
    finally:
        restoration_errors = []
        for name in ("backend", "frontend"):
            if prior[name]:
                try:
                    run(compose(source_project, source_root, "up", "-d", "--no-deps", name), env)
                except ProtectionError as exc:
                    restoration_errors.append(str(exc))
        if restoration_errors:
            message = "; ".join(restoration_errors)
            (destination / "failure.log").write_text(f"服务状态恢复失败: {message}\n", encoding="utf-8")
            if failure is None:
                raise ProtectionError(message)
    if manifest is None:
        raise ProtectionError("备份清单未建立")
    marker = destination / ".success-tmp"
    marker.write_text(sha256(destination / "manifest.json") + "\n", encoding="ascii")
    os.replace(marker, destination / SUCCESS)
    return manifest


def verify_payload(backup_dir: Path, *, require_success: bool = True) -> dict[str, Any]:
    backup_dir = backup_dir.resolve()
    manifest_path = backup_dir / "manifest.json"
    if not manifest_path.is_file():
        raise ProtectionError("备份清单缺失")
    if require_success:
        marker = backup_dir / SUCCESS
        if not marker.is_file() or marker.read_text(encoding="ascii").strip() != sha256(manifest_path):
            raise ProtectionError("成功标记缺失或清单已更改")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("format_version") != 1:
        raise ProtectionError("不兼容的备份格式")
    dump = backup_dir / "database.dump"
    if not dump.is_file() or dump.is_symlink() or sha256(dump) != manifest["dump_sha256"]:
        raise ProtectionError("数据库备份损坏")
    files_root = backup_dir / "files"
    if files_root.is_symlink():
        raise ProtectionError("备份文件目录不能是符号链接")
    expected = set()
    for item in manifest["files"]:
        relative = Path(item["path"])
        if relative.is_absolute() or ".." in relative.parts or not item["path"].startswith("objects/"):
            raise ProtectionError("备份清单含不安全文件路径")
        path = files_root / relative
        if (not path.is_file() or path.is_symlink() or
                not path.resolve().is_relative_to(files_root.resolve()) or
                path.stat().st_size != item["size"] or sha256(path) != item["sha256"]):
            raise ProtectionError(f"备份文件损坏: {relative}")
        expected.add(relative.as_posix())
    if files_root.exists() and any(path.is_symlink() for path in files_root.rglob("*")):
        raise ProtectionError("备份文件目录含符号链接")
    actual = {path.relative_to(files_root).as_posix() for path in files_root.rglob("*") if path.is_file()} if files_root.exists() else set()
    if actual != expected:
        raise ProtectionError("备份文件清单与实际文件不一致")
    return manifest


def current_revision() -> str:
    revisions = []
    for path in (PROJECT_ROOT / "backend/alembic/versions").glob("*.py"):
        values = {}
        for node in ast.parse(path.read_text(encoding="utf-8")).body:
            if isinstance(node, ast.Assign):
                targets, value = node.targets, node.value
            elif isinstance(node, ast.AnnAssign):
                targets, value = [node.target], node.value
            else:
                continue
            for target in targets:
                if isinstance(target, ast.Name) and target.id in {"revision", "down_revision"}:
                    values[target.id] = ast.literal_eval(value)
        if "revision" in values and "down_revision" in values:
            revisions.append((values["revision"], values["down_revision"]))
    parents = {parent for _, parent in revisions if parent is not None}
    heads = [revision for revision, _ in revisions if revision not in parents]
    if len(heads) != 1:
        raise ProtectionError("无法确定唯一 Alembic head")
    return heads[0]


def target_is_fresh(project: str, upload_root: Path) -> None:
    if upload_root.exists() and any(upload_root.iterdir()):
        raise ProtectionError("恢复上传目录非空")
    output = run(compose(project, upload_root, "ps", "-a", "-q"), environment(upload_root)).decode().strip()
    if output:
        raise ProtectionError("恢复项目已有容器")
    volumes = run([docker_cli(), "volume", "ls", "-q", "--filter", f"name=^{project}_rdms_postgres$"], os.environ.copy()).decode().strip()
    if volumes:
        raise ProtectionError("恢复项目已有数据库卷")


def restore(backup_dir: Path, target_project: str, target_root: Path, port: int) -> dict[str, Any]:
    manifest = verify_payload(backup_dir)
    if manifest["alembic_revision"] != current_revision():
        raise ProtectionError("备份迁移版本与当前代码不一致；请先选择兼容版本，不自动降级")
    target_project = require_project(target_project)
    target_root = target_root.expanduser().absolute()
    if target_project == manifest["source_project"] or target_root == Path(manifest["source_upload_root"]):
        raise ProtectionError("恢复目标必须与源项目和上传目录隔离")
    if target_root.is_relative_to(backup_dir.resolve()) or backup_dir.resolve().is_relative_to(target_root):
        raise ProtectionError("恢复上传目录不能与备份目录重叠")
    if not 1024 <= port <= 65535:
        raise ProtectionError("恢复端口必须为 1024–65535")
    target_is_fresh(target_project, target_root)
    target_root.mkdir(mode=0o700, parents=True, exist_ok=True)
    env = environment(target_root, port)
    run(compose(target_project, target_root, "up", "-d", "--wait", "db"), env)
    if not running(target_project, target_root, "db", port=port):
        raise ProtectionError("恢复数据库未启动")
    user, database = db_identity(target_project, target_root, port=port)
    # pg_dump excludes cluster roles and ACLs; policies still name rdms_member.
    database_query(target_project, target_root,
        "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rdms_member') "
        "THEN CREATE ROLE rdms_member NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF; END $$", port=port)
    with (backup_dir / "database.dump").open("rb") as dump:
        completed = subprocess.run(compose(target_project, target_root, "exec", "-T", "db", "pg_restore", "-U", user, "-d", database, "--no-owner", "--no-privileges"), cwd=PROJECT_ROOT, env=env, stdin=dump, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if completed.returncode:
        raise ProtectionError(f"pg_restore 失败 ({completed.returncode}): {completed.stderr.decode(errors='replace')[-600:]}")
    database_query(target_project, target_root,
        "GRANT rdms_member TO CURRENT_USER; GRANT USAGE ON SCHEMA public TO rdms_member; "
        "GRANT SELECT, INSERT, UPDATE, DELETE ON notebook, experiment, compound, sample, reaction, "
        "reaction_component, file_asset, tag, experiment_compound, experiment_tag, compound_tag, "
        "number_counter TO rdms_member; "
        "GRANT USAGE, SELECT ON SEQUENCE notebook_code_seq TO rdms_member; "
        "DELETE FROM login_session", port=port)
    for item in manifest["files"]:
        relative = Path(item["path"])
        destination = target_root / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(backup_dir / "files" / relative, destination)
    audit = scan(target_project, target_root, full_hash=True, port=port)
    if not audit["consistent"]:
        raise ProtectionError("恢复后文件一致性检查失败")
    run(compose(target_project, target_root, "up", "-d", "migration", "backend", "frontend"), env)
    return {"target_project": target_project, "target_upload_root": str(target_root), "port": port, "audit": audit}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    check = commands.add_parser("check", help="只读检查源文件和数据库引用")
    check.add_argument("--project", required=True)
    check.add_argument("--upload-root", required=True, type=Path)
    check.add_argument("--full-hash", action="store_true")
    backing = commands.add_parser("backup", help="暂停写入并建立手动备份")
    backing.add_argument("--source-project", required=True)
    backing.add_argument("--source-upload-root", required=True, type=Path)
    backing.add_argument("--destination", required=True, type=Path)
    verify = commands.add_parser("verify", help="离线验证备份包")
    verify.add_argument("--backup", required=True, type=Path)
    restoring = commands.add_parser("restore", help="恢复到新隔离项目")
    restoring.add_argument("--backup", required=True, type=Path)
    restoring.add_argument("--target-project", required=True)
    restoring.add_argument("--target-upload-root", required=True, type=Path)
    restoring.add_argument("--port", type=int, required=True)
    args = parser.parse_args()
    try:
        if args.command == "check":
            result = scan(require_project(args.project), args.upload_root, full_hash=args.full_hash)
            print(json.dumps(result, ensure_ascii=False, indent=2))
            return 0 if result["consistent"] else 1
        if args.command == "backup":
            result = backup(require_project(args.source_project), args.source_upload_root, args.destination)
        elif args.command == "verify":
            result = verify_payload(args.backup)
        else:
            result = restore(args.backup, args.target_project, args.target_upload_root, args.port)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except (ProtectionError, OSError, ValueError, KeyError, json.JSONDecodeError) as exc:
        print(f"数据保护操作失败：{exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
