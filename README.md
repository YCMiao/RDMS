# RDMS

RDMS 是面向个人化学与生命科学研究的本机数据管理系统，提供实验、化合物、标签、样品、反应、原始文件、搜索、总览、规则摘要和回收站，并提供手动备份与隔离恢复工具。

## 运行基线

- Docker Desktop 29.8.0、Docker Compose v5.5.1（阶段 00 实测环境）
- 容器内 Python 3.12.11、Node.js 22.20.0、PostgreSQL 17.6
- 本机只开放 `127.0.0.1:8080`；数据库和后端不发布宿主端口

宿主机的 Node.js、Python 和 PostgreSQL 版本不参与应用运行，无需为本项目修改。

## 配置

第一次运行时复制示例配置并修改本机开发密码：

```sh
cp .env.example .env
```

`.env`、`data/`、`backups/` 和测试产物已被 `.gitignore` 排除。不要把真实数据库密码、上传文件或备份提交到版本控制。

## 启动与检查

```sh
docker compose up --build -d
docker compose ps
curl --fail http://127.0.0.1:8080/api/health/live
curl --fail http://127.0.0.1:8080/api/health/ready
```

浏览器访问 <http://127.0.0.1:8080>，API 文档位于 <http://127.0.0.1:8080/api/docs>。

若当前终端找不到 `docker`，可将上面命令中的 `docker` 替换为：

```text
/Applications/Docker.app/Contents/Resources/bin/docker
```

运行当前检查：

```sh
scripts/check.sh backend
scripts/check.sh frontend
scripts/check.sh e2e
scripts/check.sh all
```

后端检查会先清理上次遗留的临时 `db-test` 容器，再使用独立的 `rdms_test` PostgreSQL、数据库 tmpfs 和 `/tmp/rdms-test-uploads`，不会连接应用数据卷。E2E 使用固定的 Playwright 浏览器镜像和独立的 `rdms-stage08-e2e` Compose 项目；测试数据库与上传目录均为容器临时文件系统，重跑时清理该隔离项目的旧容器。`all` 串行执行全部三项。

服务运行后，可从当前 OpenAPI 重新生成前端 API 类型：

```sh
docker compose --profile test run --rm frontend-test npm run generate:api
```

## 当前可用功能

- `/experiments`：创建、筛选、编辑、删除实验，管理标签和显式关联的化合物。
- `/compounds`：创建、筛选、编辑、删除化合物；详情按页查看实验、反应、样品来源。
- `/samples`：创建、查找、编辑、删除与恢复样品。
- `/files`：按实验上传和查找原始文件，下载、编辑元数据、删除与恢复。单文件上限默认 100 MiB，支持 PDF、CSV、TXT、PNG、JPEG、JCAMP-DX、ZIP；多文件逐个上传。
- `/search`：实验和化合物分组搜索、独立分页和命中字段；顶部可直接搜索。
- 首页展示有效记录统计和最近五条实验、文件；实验详情可生成、复制和下载规则 Markdown 摘要。
- 实验详情可管理多个反应及组分，并查看样品与原始文件。
- `/settings`：创建、改名和删除标签，查看六类记录回收站及恢复阻塞原因。删除标签会清除分类关联，不删除科研记录。
- 更新、删除和关联操作使用版本号；遇到冲突时刷新记录再决定如何处理。回收站仅列出自身被删除的记录。

## 停止与数据边界

普通停止不会删除 PostgreSQL 命名卷或 `data/uploads`：

```sh
docker compose down
```

不要把 `docker compose down -v` 当作常规停止命令；它会删除数据库卷。原始上传文件和数据库必须一起备份。

## 数据检查、备份与恢复

先确认 `.env` 中的 `UPLOAD_HOST_ROOT` 与运行中后端实际挂载目录一致。默认项目名为 `rdms`；下面的路径示例需按本机配置调整。备份时工具会短暂停止前端与后端写入，并在成功或失败后恢复原运行状态；目标目录必须尚不存在。

```sh
python3 scripts/rdms_data.py check --project rdms --upload-root ./data/uploads --full-hash
python3 scripts/rdms_data.py backup --source-project rdms --source-upload-root ./data/uploads --destination ./backups/manual-20260924
python3 scripts/rdms_data.py verify --backup ./backups/manual-20260924
```

恢复只接受新的 Compose 项目名、空上传目录和未占用的本机端口；它不会覆盖现有数据库卷或文件。验证备份后会恢复数据库和原件、再次比对所有文件哈希，再启动服务。下例是隔离演练，实际操作应换成新目录和项目名：

```sh
python3 scripts/rdms_data.py restore --backup ./backups/manual-20260924 --target-project rdmsrestore --target-upload-root ./data/restore-uploads --port 18081
```

`check` 只报告缺失、大小/哈希不符、孤立文件与临时残留，不自动修复。备份包的 `SUCCESS` 只有在备份和源服务恢复都成功后写入；失败时请查看目标目录的 `failure.log`。

## 依赖用途

后端使用 FastAPI/Pydantic Settings 提供 API 和配置，SQLAlchemy/psycopg 连接 PostgreSQL，Alembic 管理迁移，Pillow 校验图像，Uvicorn 提供服务；Ruff、mypy、pytest/httpx 用于检查。前端使用 React、React Router、TanStack Query、Tailwind CSS 与 shadcn/ui 兼容的 Radix/CVA 组件结构；Vite 构建，ESLint、TypeScript、Vitest 与 Testing Library 检查，openapi-typescript 生成接口类型。

## 当前限制

- 备份需手动执行，不提供定时备份或自动清理；恢复只接受新项目和空目录。
- 仅供本机个人使用，前端只监听回环地址。
- 本机个人使用边界固定为回环地址；不得直接改成局域网或公网监听。
