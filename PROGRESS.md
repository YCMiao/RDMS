# 执行进度

## 当前状态

2026-09-24：阶段 08 集成验收与交接已完成；00–08 的必需验收均有实测记录，索引见 [最终验收](docs/verification.md)。当前代码已通过后端、前端、真实浏览器的完整检查。

已完成只读核验：初始工程只有 prompt0922.docx；当前命令环境找不到 docker 和 docker compose；Node.js v26.5.0、npm 11.17.0、Python 3.14.7、Git 2.54.0。以上为规划时快照，接手时重新核验。没有确认 Docker Desktop 是否安装，也没有验证容器运行能力。

最新 Docker 核验（2026-09-22，阶段 00 复核）：当前终端可从 `/Users/yuchensmacbookair/.docker/bin/docker` 找到 CLI；应用内绝对路径执行 `docker --version`、`docker compose version` 和 `docker context show` 均退出码 0，结果分别为 29.8.0、v5.5.1、desktop-linux。沙箱内 `docker info` 因 Docker socket 权限被拒绝而退出非零；按权限流程获准在沙箱外只读复核后退出码 0，返回 `Server=29.8.0 OS=linux Architecture=aarch64`。Docker CLI、Compose 和引擎均可用。

接手注意：若后续代理 PATH 中找不到 Docker，可使用 `/Applications/Docker.app/Contents/Resources/bin/docker` 绝对路径，不必重新安装。未拉取镜像、创建容器或运行应用测试；这些不属于阶段 00。

原始文档 SHA256：`711adf58248533f75ff40375fcc5374b71732073a143ac1cd44e6079ced10be9`。保留原文，不覆盖。

规划包检查：19 份 Markdown 文档齐全，其中 9 份独立任务书均小于 4000 字符；相对链接目标存在，代码围栏成对，任务书必需章节齐全；原始 DOCX 哈希未变；没有生成应用代码或其他非文档文件。检查通过不代表应用测试通过。

## 阶段状态

| 阶段 | 状态 |
|---|---|
| 00 环境核验 | 已完成：ENV-01 通过，详见下方实测记录 |
| 01 工程骨架 | 已完成：BOOT-01、CHECK-01 通过 |
| 02 数据与编号 | 已完成：DB-01、NUM-01、NUM-02 通过 |
| 03 实验化合物标签 | 已完成：CRUD-01、REL-01、TAG-01、VER-01 通过 |
| 04 样品与反应 | 已完成：RXN-01、SAMPLE-01、REL-02、VER-01 通过 |
| 05 文件管理 | 已完成：FILE-01..04、VER-01 通过 |
| 06 搜索总览摘要 | 已完成：SEARCH-01/02、SUMMARY-01、DASH-01 通过 |
| 07 数据保护 | 已完成：DELETE-01、RACE-01、PERSIST-01、BACKUP-01/02、VER-01 通过 |
| 08 发布验收 | 已完成：E2E-01、UI-01、DOC-01 与 `scripts/check.sh all` 通过 |

### 阶段 00（2026-09-22）

- 实际修改：仅更新 `PROGRESS.md` 与 `BLOCKED.md`；未创建应用代码、安装工具、启动服务或修改系统配置。
- 工程现状：工作目录正确；未发现适用的 `AGENTS.md`；目录不是 Git 仓库，因此 `git status`/`git ls-files` 均退出码 128。当前没有 `.gitignore`、`.env`、`data/`、上传、数据库或备份目录；阶段 01 必须先建立忽略规则，再创建任何运行数据。
- 原始需求：`shasum -a 256 prompt0922.docx` 退出码 0，SHA256 为 `711adf58248533f75ff40375fcc5374b71732073a143ac1cd44e6079ced10be9`，与既有记录一致。
- Docker：`docker --version`、`docker compose version`、`docker context show` 均退出码 0，分别得到 Docker 29.8.0、Compose v5.5.1、desktop-linux。沙箱内 `docker info` 因 socket 权限退出非零；获准在沙箱外只读复核后退出码 0，得到 `Server=29.8.0 OS=linux Architecture=aarch64`。
- 端口与文件系统：`lsof -nP -iTCP:8080 -sTCP:LISTEN` 退出码 1且无输出，表示当前未发现 8080 监听者；工程目录写入探针创建与清理均退出码 0；`df -h .` 退出码 0，当前卷约 460 GiB，总计已用 300 GiB、可用 137 GiB。
- 宿主工具：`node --version`、`npm --version`、`python3 --version`、`git --version` 均退出码 0，结果为 Node.js v26.5.0、npm 11.17.0、Python 3.14.7、Git 2.54.0。应用将按架构文档使用容器固定版本，不要求改变宿主默认版本。
- 数据隔离：设计要求测试使用独立 PostgreSQL 与临时上传根，真实运行数据、备份和 `.env` 不进入版本控制。当前应用尚未建立，故没有数据库集成测试可运行，也没有用户运行数据可清空或迁移；阶段 01 建立骨架时必须落实对应目录和忽略规则。
- 验收结论：ENV-01 通过。阶段 00 完成，可以进入阶段 01；BOOT-01、CHECK-01 及应用启动均未执行，不能据此声称应用可运行。

### 阶段 01（2026-09-23）

- 实际修改：初始化本地 Git（main，未创建提交或远程）；新增 `.gitignore`、`.env.example`、`README.md`、`docker-compose.yml`、`backend/`、`frontend/`、`scripts/check.sh`，并在 `docs/architecture.md` 记录实际容器基线。原始 DOCX 未修改，未开发业务 CRUD。
- 运行基线：Python 3.12.11、Node.js 22.20.0、PostgreSQL 17.6、nginx 1.29.1；Python 直接依赖精确固定，前端 `package-lock.json` 已提交候选。因 npm 10 的 Arborist `edgesOut` 已知缺陷，安全升级后的 lockfile 由 npm 11 隔离生成，再由 Node 22/npm 10 的 `npm ci`、测试和构建验证。
- Compose：`docker compose up --build -d` 成功；db 健康后 migration 执行 `0001_baseline` 并退出 0，随后 backend 健康、frontend 启动。仅 frontend 发布 `127.0.0.1:8080->80`；db 的 5432 与 backend 的 8000 只在 Compose 网络中。
- HTTP 实测：`GET /api/health/live`、`GET /api/health/ready` 均返回 200 与 `{"status":"ok"}`；响应包含 `X-Request-ID`。`GET /api/openapi.json` 返回 RDMS API 0.1.0 和两个健康路径；首页返回中文 RDMS 构建产物。openapi-typescript 已从运行中的真实契约生成 `frontend/src/types/api.generated.ts`。
- 后端检查：`scripts/check.sh backend` 最终退出码 0；Ruff 通过，mypy 对 11 个源文件无问题，pytest 使用独立 `rdms_test` PostgreSQL tmpfs 与 `/tmp/rdms-test-uploads`，3 项测试通过。Starlette/anyio 有一条上游弃用警告，不影响结果。
- 前端检查：`scripts/check.sh frontend` 最终退出码 0；ESLint、TypeScript、Vitest 4.1.11（2 项测试）和 Vite 7.3.6 生产构建通过；npm audit 为 0 vulnerabilities。ESLint 9.35.0 显示生命周期弃用提示，后续依赖维护时升级，不影响当前检查。
- 失败传播：临时加入 `assert 1 == 2` 后，`scripts/check.sh backend` 由 pytest 报告 `1 failed, 3 passed` 并返回非零；移除临时断言后重跑为 3 passed。`scripts/check.sh e2e` 明确提示阶段 08 才建立并返回非零；`scripts/check.sh all` 对阶段 01 适用的 backend/frontend 检查最终退出码 0。
- 持久化边界：执行不带 `-v` 的 `docker compose down` 后重新 `up -d`，服务恢复健康，`alembic_version` 仍为 `0001_baseline`。`data/`、`.env`、备份和测试产物均在忽略规则中；本阶段只产生空上传目录，没有写入科研数据。
- 已知过程问题：首次获取 Python/nginx 镜像各遇到一次 Docker Hub OAuth 超时，单独重试镜像拉取后成功；不影响最终验收。
- 验收结论：BOOT-01、CHECK-01 通过。当前三服务保持运行，可访问 `http://127.0.0.1:8080`；阶段 01 完成，可以进入阶段 02。E2E 仍未实现，不能宣称完整业务可用。

### 阶段 02（2026-09-23）

- 开工回执：按数据模型、迁移、编号、可见性与版本基础、PostgreSQL 测试的顺序实施；最大风险是迁移与现有数据库状态不一致，因此先用独立测试库验证。
- 实际修改：新增 11 张业务/关联/计数表的 ORM 模型和 `9dd700ef716a_stage02_schema.py` 迁移；计数器以 `INSERT ... ON CONFLICT DO NOTHING` 加 `UPDATE ... RETURNING` 在调用方事务中取号；新增有效记录查询与条件版本更新基础。`FileAsset(sample_id, experiment_id)` 复合外键保证附件样品属于同一实验。共享配置变更：`backend-test` 运行测试前执行 `alembic upgrade head`。
- 设计对照：全部原文实体保留；科研数值为 `Numeric(20,8)`，时间戳为带时区类型，编号唯一约束覆盖软删除记录。状态和角色用字符串加数据库 CHECK 实现，避免 PostgreSQL 原生 enum 将来增加值时额外迁移；未改变外部取值。文件名非法字符、标签 Unicode casefold、引用对象有效性及父行锁属于后续业务服务校验，当前未宣称已实现 API 规则。
- 检查：`docker compose --profile test run --rm backend-test sh -c 'ruff format app && ruff check app tests alembic && mypy app && alembic upgrade head && alembic check'` 退出码 0；无待生成迁移。`scripts/check.sh backend` 在全新临时 PostgreSQL 上退出码 0，从空库升级 `0001_baseline` → `9dd700ef716a`，Ruff/mypy 通过，8 项 pytest 通过（1 条 Starlette/anyio 上游弃用警告）。
- DB-01：`backend/tests/test_stage02_data.py` 检查全部表、编号唯一约束、复合外键；实际插入非法外键、重复编号、缺失单位、跨实验附件、非法角色和非法收率均由 PostgreSQL 拒绝。
- NUM-01：50 个线程各用独立 Session/事务创建化合物，50 个编号互不重复；软删除后新编号不复用。NUM-02：可控 UTC 时钟验证 Asia/Shanghai 跨年、CMP 不重置、日期更新编号不变、超过补零宽度继续增长；回滚后无半条业务记录且未提交取号可重试。
- 应用库：`docker compose run --build --rm migration` 退出码 0，现有库从 `0001_baseline` 升级；`psql` 只读查询确认版本 `9dd700ef716a`。后端容器内 `/api/health/ready` 返回 200。宿主机沙箱 `curl 127.0.0.1:8080` 返回连接失败（退出码 7），不据此判断公网/浏览器可达性。
- 原始 `prompt0922.docx` SHA256 仍为 `711adf58248533f75ff40375fcc5374b71732073a143ac1cd44e6079ced10be9`。未修改真实科研数据、业务 API 或前端。下一阶段仅按 `docs/tasks/03-records.md` 开始，不在本阶段提前开发。

### 阶段 03（2026-09-23）

- 开工回执：按现有模型核对、事务和查询、API、OpenAPI 类型、中文页面、真实数据库测试的顺序实施；最大风险是版本写入与引用删除之间的竞态，因此同一事务锁定父记录和化合物。未提前开发样品、反应和文件 CRUD。
- 实际修改：新增实验、化合物、标签的创建/查询/更新/软删除/恢复 API，稳定分页、字段搜索、日期与状态筛选、标签原子替换；显式实验–化合物关联与解除，关系查询合并 explicit/sample/reaction 来源并由数据库分页。查询集中在 `backend/app/repositories/records.py`，事务与版本处理在 service，路由负责协议映射。关联变化递增父版本；标签删除只移除分类并递增受影响记录版本。无新迁移，继续使用 `9dd700ef716a`。
- 界面：新增实验列表与页面新建、化合物列表与对话框新建、两类详情编辑、标签管理、分页选择器及来源展示；可读错误、冲突提示、空状态、删除确认和当前页面的即时恢复。前端 API 类型来自阶段 03 OpenAPI，当前运行契约与生成时的 JSON 比较结果为 `True`。完整回收站和浏览器 E2E 仍属于后续阶段。
- 后端验证：`scripts/check.sh backend` 最终退出码 0；清理遗留 `db-test` 后从空 `rdms_test` PostgreSQL tmpfs 升级 `0001_baseline` → `9dd700ef716a`，Ruff/mypy 对 20 个源文件通过，12 项 pytest 通过（1 条已知 Starlette/anyio 弃用警告）。测试覆盖 CRUD、未知字段、编号、标签规范化冲突、关系分页、样品/反应来源、过期写入、事务失败无半条记录、软删除及恢复阻塞。测试上传根 `/tmp/rdms-test-uploads`。
- 前端验证：`scripts/check.sh frontend` 最终退出码 0；ESLint、TypeScript、4 项 Vitest 及 Vite 生产构建通过，`npm audit` 0 vulnerabilities。实验页面和化合物对话框的创建交互测试核对提交中没有客户端编号，并展示服务端编号。阶段 08 的 E2E 未运行，不能宣称完成浏览器端到端自动化。
- 运行联调：首次 `docker compose up --build -d` 因前端 `npm ci` 遇 `ECONNRESET` 退出 1；用已通过的 Vite 构建产物临时组装镜像完成只读联调。网络恢复后，原项目 `docker compose build frontend` 退出 0，随后标准 `docker compose up --build -d` 退出 0；db/backend 健康、frontend 启动。前端代理内 `GET /api/health/ready` 返回 `{"status":"ok"}`，实验和化合物列表均返回有效空分页；应用库迁移版本只读核对为 `9dd700ef716a`。未在应用库写入测试科研记录。
- 数据边界：原始 `prompt0922.docx` SHA256 仍为 `711adf58248533f75ff40375fcc5374b71732073a143ac1cd44e6079ced10be9`；未修改原始文件、真实科研数据或数据库卷。当前 Git 仓库仍无提交，全部项目文件保持未跟踪状态，未擅自创建提交。
- 验收结论：CRUD-01、REL-01、TAG-01、VER-01 通过；阶段 03 完成。下一阶段只按 `docs/tasks/04-reactions.md` 开始，不在本阶段提前开发。

### 阶段 04（2026-09-23）

- 开工回执：按 03 交付核对、样品/反应接口与事务、界面、独立数据库与前端检查、运行联调的顺序执行；最大风险是软删除与恢复时的引用一致性。
- 实际修改：新增样品 CRUD/恢复与自动 SMP 编号，反应及多角色组分 CRUD/恢复，字段与十进制字符串验证、父级有效性、版本检查、关联化合物锁。样品来源实验不可变，数量/单位和浓度/单位配对；组分允许同一化合物分次加料，顺序默认追加，产物收率手工保存。沿用阶段 03 的 explicit/sample/reaction 并集与反查。未新增迁移。
- 中文界面：新增样品列表/创建/详情编辑，实验详情样品与多反应区、组分添加/编辑/删除；化合物选择从真实 API 搜索并可进入新建页面。OpenAPI 类型已重生，页面使用版本号写入并显示错误。
- 后端检查：`scripts/check.sh backend` 最终退出码 0；Ruff、mypy（23 个源文件）、独立 PostgreSQL tmpfs 迁移与 14 项 pytest 通过。测试覆盖混合物无化合物、跨实验字段拒绝、数值对校验、重复组分、两个反应、来源双向合并、分页、过期版本、父级隐藏及关联化合物删除后的恢复冲突。1 条既有 Starlette/anyio 弃用警告。
- 前端检查：`scripts/check.sh frontend` 最终退出码 0；ESLint、TypeScript、Vitest 6 项、Vite 生产构建通过。新增交互测试覆盖混合物样品创建与一个实验中创建两个反应。`npm audit` 为 0 vulnerabilities。
- 运行联调：标准 `docker compose up --build -d` 退出码 0，db/backend 健康、frontend 运行；容器内经前端代理只读请求 `/api/health/ready` 为 `{"status":"ok"}`，`/api/samples` 为空分页，未知实验的反应路径返回预期 404。未向应用数据库写入测试科研记录。
- 数据边界：原始 `prompt0922.docx` SHA256 仍为 `711adf58248533f75ff40375fcc5374b71732073a143ac1cd44e6079ced10be9`；未清空数据库卷或用户文件。仓库仍无提交，项目文件保持未跟踪。
- 验收结论：RXN-01、SAMPLE-01、REL-02、VER-01 通过；阶段 04 完成。下一阶段按 `docs/tasks/05-files.md` 执行。

### 阶段 05（2026-09-23）

- 开工回执：按存储安全/契约核对、流式上传与校验、事务补偿、下载和元数据、中文页面、独立测试与运行联调的顺序执行；最大风险是数据库与原件状态分叉。
- 实际修改：新增 FileAsset 上传/列表/详情/下载/元数据 PATCH/软删除/恢复 API；1 MiB 分块计数与 SHA256，默认 100 MiB 服务端上限，空文件拒绝。支持 PDF、CSV、TXT、PNG、JPEG、JCAMP-DX、ZIP；按扩展名验证实际内容，图像限制像素并解码，ZIP 仅读取中央目录。UUID 存储键、同文件系统临时路径、原子硬链接发布、提交失败清理本次文件；提交成功后响应失败保留原件。下载按 ID 检查有效性、路径、符号链接、大小，返回 nosniff 和 RFC 5987 文件名。
- 界面与配置：新增 `/files` 全局列表、实验详情附件区、文件详情编辑/下载/删除/恢复；多文件选择拆为逐个 multipart 请求并逐个显示结果。样品关联支持真实搜索及分页。Nginx 上传体上限 105 MiB，后端仍按实际流式字节数严格执行 100 MiB。新增固定 Pillow 11.3.0 依赖；无迁移。
- 后端检查：`scripts/check.sh backend` 退出码 0；Ruff、mypy（26 个源文件）、独立 PostgreSQL tmpfs 迁移及 20 项 pytest 通过。测试用小型合成文件、独立 hashlib 和下载字节比对；覆盖所有允许后缀、同名独立原件、伪装/空文件/NUL/路径穿越/超限、父级与跨实验样品拒绝、软删除与恢复、符号链接逃逸、提交前后故障注入以及中断临时残留。1 条既有 Starlette/anyio 弃用警告。
- 前端检查：`scripts/check.sh frontend` 退出码 0；ESLint、TypeScript、Vitest 7 项、Vite 生产构建通过；逐个 multipart 请求及不附加 JSON Content-Type 的交互测试通过。`npm audit` 0 vulnerabilities。
- 运行联调：标准 `docker compose up --build -d` 退出码 0；db/backend 健康、frontend 运行。容器内只读请求 `/api/health/ready` 为 `{"status":"ok"}`，`/api/files` 为空分页；Nginx 当前配置实际读得 `client_max_body_size 105m`。不在应用数据库写入测试科研文件。
- 数据边界：原始 DOCX SHA256 `711adf58248533f75ff40375fcc5374b71732073a143ac1cd44e6079ced10be9` 未变；未清空或覆盖真实 `data/`、数据库卷。测试上传根在独立容器的 `/tmp/rdms-test-uploads`。中断留下的 `.tmp` 不会自动删除，阶段 07 只读一致性检查将报告它。
- 验收结论：FILE-01..04、VER-01 通过；阶段 05 完成。下一阶段按 `docs/tasks/06-discovery.md` 执行。

### 阶段 06（2026-09-23）

- 开工回执：按搜索/统计/摘要契约核对、数据库查询与固定模板、中文页面、独立测试和只读运行联调执行；最大风险是删除可见性与多表摘要在并发修改下不一致。
- 实际修改：新增 `/search`、`/dashboard`、`/experiments/{id}/summary` JSON/Markdown。搜索复用字面 ILIKE 转义，实验 title/code、化合物 name/code/SMILES 分组独立数据库分页、稳定 created_at/id 排序并返回 matched_fields。Dashboard 统计有效实验/化合物/样品与最近五条有效实验/文件。摘要使用 PostgreSQL REPEATABLE READ READ ONLY 快照，按固定顺序读取实验、反应及组分、样品、文件；规范化 JSON 排序后 SHA256 生成 source_revision，generated_at 不参与哈希。Markdown 空值“未记录”，不推断科学数值。
- 界面：顶部真实搜索、分组搜索页、首页有效数量与最近记录、实验详情摘要预览/复制/下载；摘要前端只读取一次 Markdown 响应，以保证显示的版本与下载内容一致。前端 OpenAPI 类型来自当前后端契约。无新迁移或基础设施。
- 后端检查：`scripts/check.sh backend` 退出码 0；Ruff、mypy（29 个源文件）、独立 PostgreSQL tmpfs 迁移和 22 项 pytest 通过。测试覆盖中文、%/_/反斜杠字面搜索、注入字符串、组间独立分页、删除可见性、统计变化、摘要数值/空值/文件、重复 revision 与删除后 revision 变化。1 条既有 Starlette/anyio 弃用警告。
- 前端检查：`scripts/check.sh frontend` 退出码 0；ESLint、TypeScript、Vitest 9 项、Vite 生产构建通过；新增搜索分组与单次 Markdown 摘要交互测试。`npm audit` 0 vulnerabilities。
- 运行联调：标准 `docker compose up --build -d` 退出码 0；db/backend 健康、frontend 运行。容器内只读请求 `/api/health/ready`、`/api/dashboard`、空结果 `/api/search?q=nonexistent` 返回预期 200 和结构。未写应用数据库测试数据。
- 数据边界：原始 `prompt0922.docx` 与应用数据库卷、原始文件未修改；本阶段测试仅用独立数据库和临时上传根。阶段 07 继续备份、回收站与恢复演练。
- 验收结论：SEARCH-01/02、SUMMARY-01、DASH-01 通过；阶段 06 完成。下一阶段按 `docs/tasks/07-protection.md` 执行。

### 阶段 07（2026-09-23）

- 开工回执：按回收站与恢复依赖、引用竞态、只读存储检查、手动备份、隔离恢复和故障演练实施；最大风险是暂停写入后失败未恢复原服务状态。
- 实际修改：新增 `/api/trash` 六类分页回收站及恢复阻塞原因；设置页加入入口。`scripts/rdms_data.py` 提供 `check`、`backup`、`verify`、`restore`；备份停写后校验数据库所引用文件、生成 `pg_dump`、全部正式文件与 SHA256 清单，恢复原服务状态后才发布 `SUCCESS`。恢复仅接受全新项目和空上传根，先离线校验备份与迁移版本，再恢复数据库和文件、执行完整哈希检查。没有自动清理用户数据。
- 后端检查：`scripts/check.sh backend` 退出 0，Ruff、mypy、独立 PostgreSQL 测试共 25 项通过。新增独立请求并发测试覆盖删除 Compound 与创建样品引用、删除实验与创建反应；回收站测试确认父级隐藏的子记录不会重复列出，先删子项后恢复父项仍保持子项删除。
- 前端检查：`scripts/check.sh frontend` 退出 0，ESLint、TypeScript、Vitest 10 项、Vite 构建通过；回收站交互测试确认阻塞原因、禁用按钮和带版本恢复请求。
- 隔离备份：合成源项目 `rdms07src`、上传根 `/private/tmp/rdms-stage07-source`、端口 18080；成功备份 `/private/tmp/rdms-stage07-backup-ok` 的 `SUCCESS` 与清单验证通过。清单版本 `9dd700ef716a`、PostgreSQL 17.6、2 个文件（含单独软删除文件），dump SHA256 `f6abfec38d8c46193da6db231580a8ac0f4b31f0ce6ebb08bfbeb2c0fa6f2dcf`。恢复至全新项目 `rdms07restored2`、根 `/private/tmp/rdms-stage07-restored2`、端口 18082 成功；完整哈希检查 2/2 文件一致、无缺失/孤立/残留。实验、反应及组分仍有效，单独删除的样品和文件仍隐藏，已删除文件在回收站可见；活动文件下载 SHA256 `61cdbed4f3912c3cced4e6efd99819ad9fc4e539991cbbdddb0c1c8c47e7a8c4` 与清单一致。恢复后新实验获得 `EXP-2026-0003`，未复用源项目已有的 0001/0002。
- 故障演练：复制备份后分别篡改文件、删除文件，`verify` 与损坏包 `restore` 均退出 1；损坏恢复项目没有创建。模拟 `pg_dump` 返回 91，`backup` 退出 1，记录 `failure.log`、无 `SUCCESS`；源 backend/frontend/db 恢复运行，前端仍绑定 18080。针对非空恢复根再次 `restore` 退出 1。首次演练发现前端源端口未传回、以及新 DB 未等待健康；已修复并在全新目标复验，失败产物没有 `SUCCESS`。
- 持久化：对 `rdms07src` 执行 `docker compose stop frontend backend db` 后不带 `-v` 重启三服务，`check --full-hash` 退出 0，数据库引用的 2 个文件仍完整。原始 DOCX 哈希仍为既定值；未向默认应用数据库写入合成科研数据。
- 验收结论：DELETE-01、RACE-01、PERSIST-01、BACKUP-01/02、VER-01 通过。下一阶段按 `docs/tasks/08-release.md` 执行完整浏览器验收与交接。

### 阶段 08（2026-09-24）

- 开工回执：先建立真实 PostgreSQL/文件存储的浏览器检查，再跑完整科研闭环、界面状态、全新安装和交接文档；最大风险是 E2E 误接默认项目数据卷，因此使用独立 Compose 文件、数据库和上传 tmpfs。
- 实际修改：新增 `docker-compose.e2e.yml`、Playwright 配置与三项真实浏览器用例；`scripts/check.sh e2e/all` 串行执行。测试项目 `rdms-stage08-e2e` 的 PostgreSQL 和上传目录均为 tmpfs，前后端走真实网络与业务逻辑。设置页加入数据保护说明，移除过时阶段标记与占位文案，回收阻塞项可切换到依赖类型的回收站。README 与验收文档校准为现行命令。
- E2E-01：Playwright 浏览器创建化合物、实验、样品、反应和产物组分，上传中文名 TXT；独立 SHA256 与 API 元数据、下载字节相等；搜索命中、摘要含反应和文件，实验软删除后 API 404、恢复后 API 200 且文件仍可下载。测试用独立 PostgreSQL、真实后端和文件存储，不模拟核心请求。
- UI-01：1280×800 与 1440×900、浅/深色、实验表格、长中文标题和长 SMILES 无页面横向溢出；键盘可见焦点、空搜索提示、断网时可读错误、409 时本地未保存文本保留且不覆盖数据库新值。截图存于 `frontend/test-results/`，未把截图代替业务断言。
- DOC-01：`rdms08fresh` 以新项目名、全新 PostgreSQL 卷和 `/private/tmp/rdms-stage08-fresh` 从空库按 README 启动，初始实验总数 0，迁移后 db/backend 健康、frontend 运行；创建合成实验 `EXP-2026-0001` 与 TXT 文件，正常 `docker compose down`（无 `-v`）后 `up -d`，记录与下载均返回 200，SHA256 保持 `12e86291e07848ef0a810ba7e11ac8beedf38b88896770ded8bbcade9a84b562`。未使用默认应用数据卷。
- 最终检查：`scripts/check.sh all` 退出码 0；Ruff/mypy 与 PostgreSQL pytest 25 项、ESLint/TypeScript/Vitest 10 项、Vite 生产构建、Playwright 3 项全部通过。Playwright 固定 `@playwright/test@1.55.1` 与匹配的浏览器镜像；npm audit 0 vulnerabilities。首次浏览器测试定位搜索标题链接错误，修正为编号链接；首次全套检查暴露 Vitest 误收集 E2E 和并发竞态中预期的 409，已分别限定 Vitest 收集范围并加强竞态断言，重跑通过。
- 最终视觉复核：1280 深色实验表格截图发现“新建实验”链接文字与背景同色；根因是未分层的全局 `a { color: inherit }` 覆盖 Tailwind 链接按钮文字色。移除该覆盖后增加浏览器计算样式对比断言，重跑 `scripts/check.sh all` 退出码 0，截图中文字可见。1440 截图由同一用例生成。
- 默认项目交付：标准 `docker compose up --build -d` 退出码 0，db/backend 健康、frontend 运行；前端代理内 `GET /api/health/ready` 返回 200 `{"status":"ok"}`，`GET /api/trash?type=experiment` 返回空分页，首页返回中文 HTML。隔离验收容器已清理；07/08 合成项目仅停止服务，保留其独立数据库卷与文件供复查。
- 数据边界：`prompt0922.docx` SHA256 再次核对为 `711adf58248533f75ff40375fcc5374b71732073a143ac1cd44e6079ced10be9`；没有清空默认应用数据库或覆盖真实文件。Git 仓库仍无提交，所有交付文件为未跟踪状态，交接时应先检查并按团队流程纳入版本控制。
- 验收结论：E2E-01、UI-01、DOC-01 通过；其余 ID 对应证据见 `docs/verification.md`。00–08 的任务书目标已执行完毕。

### 交付复核（2026-09-24）

- 文档核对发现架构和数据安全规范要求限制 Host 及浏览器写入 Origin，但旧后端中间件尚未执行；已补上本机 Host 白名单、同源写入校验及统一 403 错误与请求 ID，Nginx 保留原始 Host 端口供校验。无 Origin 的本机命令行请求仍可用。新增独立测试验证跨站请求不落库。
- 同步架构、数据安全、路线图、总计划与验收索引，新增简短 `AGENTS.md` 交接约定；原任务书保留为历史依据。数据保护设计中的文件发布表述与实际原子硬链接实现对齐。
- `scripts/check.sh all` 退出码 0：Ruff、mypy、独立 PostgreSQL pytest 26 项，前端 lint/类型/Vitest 10 项/生产构建，以及隔离 Playwright 3 项通过。标准 `docker compose up --build -d` 退出码 0，当前 db/backend 健康、frontend 运行；只读就绪接口返回 `{"status":"ok"}`，当前后端对跨站 POST 返回 403 `FORBIDDEN_ORIGIN`。
- 用户数据边界保持：未清空或覆盖默认数据库卷、`data/` 与原始需求文档。阶段 07/08 的合成备份和隔离数据保留供复查；Git 仍未创建提交，全部交付文件待按团队流程纳入版本控制。阶段 00–08 与交付复核完成，当前无下一阶段任务书。

## 后续每阶段记录模板

### 阶段编号与日期

- 开工回执（不超过 10 行）：目标、执行顺序、最大风险。
- 实际修改：路径与行为变化。
- 检查：命令、退出码、结果摘要；注明测试数据库和存储目录。
- 未完成及限制：不得省略未执行的检查。
- 下一阶段及接手注意事项：明确任务书路径。
