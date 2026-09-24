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

已有数据库卷的安装要启用 CAS 密钥时，只在现有 `.env` 增加 `CAS_COMMON_CHEMISTRY_API_KEY=...`；不要重新复制 `.env.example` 或改动原数据库密码。示例密码只用于首次初始化，不能自动修改已有卷中的密码。

## 启动与检查

在 macOS 上更新应用，可以在 Finder 中双击项目根目录的 **更新 RDMS.app**，点击“更新”。它先构建镜像并验证现有数据库连接，再切换前后端服务；连接失败时会保留正在运行的服务并显示原因。完成后自动打开浏览器，详细过程在项目根目录的 `.rdms-update.log`。更新不会清空数据库或原始文件。

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

- `/experiments`：创建、筛选、编辑、删除实验。详情以反应式为中心展示底物和产物的二维结构、试剂与当量、溶剂及条件；每个反应单独记录后处理、纯化、组分用量和收率。一般操作、观察与结论收在可展开区域，样品、文件和摘要仍与实验关联。
- `/compounds`：创建、筛选、编辑、删除化合物；详情按页查看实验、反应、样品来源。
- `/compounds/import`：在 Chrome 或 Safari 粘贴 ChemDraw 的 MOL、SMILES、CDXML 文本，或选择结构文件；本机生成结构图、分子式、分子量、精确质量和 InChIKey，提示同结构记录。点击“查询 CAS 与理化性质”后才向公开服务发送 InChIKey；CAS 号和实验性质由用户核对后选择保存。
- `/samples`：创建、查找、编辑、删除与恢复样品。
- `/files`：按实验上传和查找原始文件，下载、编辑元数据、删除与恢复。单文件上限默认 100 MiB，支持 PDF、CSV、TXT、PNG、JPEG、JCAMP-DX、ZIP；多文件逐个上传。
- `/search`：实验和化合物分组搜索、独立分页和命中字段；顶部可直接搜索。
- 首页展示有效记录统计和最近五条实验、文件；实验详情可生成、复制和下载规则 Markdown 摘要。
- 实验详情可管理多个反应及组分，并查看样品与原始文件。结构图来自已导入结构的化合物；未导入结构时显示名称和用量。
- `/settings`：创建、改名和删除标签，查看六类记录回收站及恢复阻塞原因。删除标签会清除分类关联，不删除科研记录。
- 更新、删除和关联操作使用版本号；遇到冲突时刷新记录再决定如何处理。回收站仅列出自身被删除的记录。

### ChemDraw 结构导入

在 ChemDraw 中选中单个分子，使用 **Copy As → MOL** 或 **Copy As → SMILES**，然后在结构导入页粘贴。也可导出 `.mol`、单记录 `.sdf`、`.smi` 或 `.cdxml` 后选择文件。浏览器可能只向网页提供普通复制的图片或专有剪贴板格式；此时请用 Copy As 或文件导入。含 R 基、查询原子、多分子结构或多记录 SDF 需要先整理成单一明确结构。

分子式、分子量、精确质量和 InChIKey 根据导入结构在本机计算。密度、熔点、沸点等是条件相关的实验资料，不能仅由二维结构可靠确定；查询结果会保留来源和原始文字，需人工选择。CAS Common Chemistry 查询需要向 CAS 申请 API 密钥并在 `.env` 设置 `CAS_COMMON_CHEMISTRY_API_KEY`；未配置时仍可查询 PubChem，PubChem 同义词中的 CAS 仅显示为待核对候选。未发表结构可以跳过公开查询。替换结构会重新计算结构资料并清除旧结构对应的 CAS 与实验性质。

页面上的分子量最多显示 2 位小数，精确质量最多显示 4 位小数；不足的位数不补零。此规则只用于显示，保存的计算值和用户输入值不会因此截断。

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

后端使用 FastAPI/Pydantic Settings 提供 API 和配置，SQLAlchemy/psycopg 连接 PostgreSQL，Alembic 管理迁移，Pillow 校验图像，RDKit 解析和描绘化学结构，Uvicorn 提供服务；Ruff、mypy、pytest/httpx 用于检查。前端使用 React、React Router、TanStack Query、Tailwind CSS 与 shadcn/ui 兼容的 Radix/CVA 组件结构；Vite 构建，ESLint、TypeScript、Vitest 与 Testing Library 检查，openapi-typescript 生成接口类型。

## 当前限制

- 备份需手动执行，不提供定时备份或自动清理；恢复只接受新项目和空目录。
- 仅供本机个人使用，前端只监听回环地址。
- 本机个人使用边界固定为回环地址；不得直接改成局域网或公网监听。
