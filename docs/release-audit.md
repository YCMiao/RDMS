# 上线前工程审计（2026-10-12）

范围为当前 RDMS 工程、直接相关容器及只读数据一致性。起点 `main@48c4d74`，原工作区干净；无远端、PR 或第二工作树。此次是文件与维护审计，不代表全面渗透测试或科研资料正确性认证。

## 结论与事实面

| 事实面 | 状态 | 证据与边界 |
|---|---|---|
| 代码与构建 | changed-and-verified | 后端 runtime/test 分离；开发前端回环绑定；完整隔离检查通过 |
| 现役运行态 | verified-current | 8080 页面与核心 API 返回 200，非法 Host/Origin 返回 403；运行迁移为 b8e1f3c605ad |
| 本次精简镜像部署 | pending | E2E 已使用新 runtime 镜像；正式服务未切换，下一次正常更新才会采用 |
| 文档 | changed-and-verified | 依据 ORM、路由、脚本和测试校准编号、化学结构、收率、首页及恢复边界；历史流水账由 Git 检索 |
| 规则 | verified-current | 项目 AGENTS.md 是唯一项目规则，无子目录规则或软链；保留隔离测试、迁移和数据保护要求 |
| 记忆 | out-of-scope | 生成记忆只读；没有使用历史记忆作为项目证据，也未写入记忆 |
| 工作区清场 | changed-and-verified | 报告后获用户确认，A–D 已清理；完整复验通过，测试生成产物再次清除 |
| 远端与公网发布 | not-applicable | 无 Git 远端；本项目仅本机使用 |

## 已完成的精简与纠正

- 后端正式镜像默认 `runtime` 仅保留运行依赖、app 和完整 Alembic 迁移。pytest、httpx、mypy、Ruff 和 tests 留在独立 `test` 阶段；Compose 的 backend-test 显式选择该阶段。运行仍为非 root。
- Docker 显示镜像大小从 853,177,083 字节降至 675,531,801 字节，减少 177,645,282 字节（约 21%）。这是镜像逻辑大小比较，不等于本次已释放磁盘空间：旧镜像和构建缓存仍保留。新构建重新解析了未锁定的传递依赖，因此差值不完全等于测试工具大小。
- 前端正式镜像原本就只含 nginx 与静态产物，保留现有多阶段构建。开发命令原先绑定 0.0.0.0，现收紧到 127.0.0.1；容器内部后端监听方式与正式端口边界不变。
- PLAN、BLOCKED、PROGRESS 精简为维护入口；旧任务书标记为历史。更新 architecture/data-model/api-contract/ui-spec/reactant-table，消除 CMP/按年实验编号、无 RDKit、仅手工收率、首页统计等过期现役说法。
- 恢复说明明确：备份 revision 必须与使用代码 head 一致；工具没有预检端口占用，恢复前需自行确认。旧周报恢复步骤加上匹配版本要求，避免直接拿当前代码执行旧备份恢复。

## 文件盘点与保留决定

初始 Git 跟踪 190 个文件；对工程内（不含 `.git`）机械枚举 2,173 个文件，包含被忽略的缓存、原件与备份，未发现符号链接。枚举仅记录路径/大小，不输出凭据或科研正文；临时清单 `/tmp/rdms-release-inventory.json`。所有工程 Markdown 已纳入盘点；重点结合模型、API、部署/数据保护脚本核对。业务源码通过现有门禁验证，未声称逐行形式化证明。

| 对象 | 决定 | 原因 |
|---|---|---|
| backend/app、完整 alembic 链与配置 | 保留 | 功能、空库启动、升级与历史备份兼容所需 |
| frontend/src、生成类型、构建配置、package-lock.json | 保留 | 重建和后续维护所需；生成类型由编译使用，不是废文件 |
| 后端与前端测试、E2E、开发依赖、check.sh | 保留在源码 | 更新后验证数据安全与功能完整性所需；测试目录名称中的阶段编号不表示已废弃 |
| Compose、Dockerfile、nginx、.dockerignore、.env.example | 保留 | 启动、网络边界、构建和测试隔离所需 |
| scripts/rdms_data.py、update_rdms.sh、update_rdms.applescript | 保留 | 备份恢复与更新维护脚本；Finder 更新应用包已按 2026-10-12 后续决定删除 |
| README、AGENTS、当前 PROGRESS/BLOCKED、设计与验收文档 | 保留并校准 | 当前维护合同与检查依据 |
| docs/notebooks、compound-identity、weekly-report-import-rollback | 保留 | 编号和不可逆迁移边界、资料来源及旧备份对应版本 |
| prompt0922.docx | 建议保留 | 原始需求来源，仅 27,708 字节；哈希与原记录一致 |
| .env、data、backups、.git、正式数据库卷 | 保护 | 真实配置、科研资料、恢复点与历史唯一证据；均不纳入自动清理 |

## 已授权的清理方案

用户在完整报告后明确回复“确认执行ABCD”（2026-10-12）。下表保留当时批准的范围和估计；实际结果见文末。

| 组 | 候选 | 约体积 | 理由与执行边界 |
|---|---|---:|---|
| A 可再生成产物 | backend/.mypy_cache、.pytest_cache、.ruff_cache；工程源码目录中的 __pycache__；frontend/dist、frontend/test-results、frontend/playwright-report（若存在） | 约 101 MB，另有少量 Python 缓存 | 编译、类型检查与浏览器证据可重建；报告获确认后删除；不触碰 data/backups 内任何同名项 |
| B 已完成原型 | ui-lab/homepage 全目录，包括原型源码、配置、测试和截图 | 约 11.3 MB | 正式 React 首页自有实现，无运行引用。先停止仅 rdms-home-studio 预览项目，再删目录并同步 README 原型说明；8080 不停服 |
| C 历史任务包 | PLAN.md、docs/roadmap.md、docs/tasks/*.md | 不足 40 KB | 原阶段已完成，Git 48c4d74 保留原文；删除时同步 AGENTS 与 architecture 等引用，不删除验收测试 |
| D 桌面元数据 | 根目录和源码目录中的 .DS_Store | 少量 | Finder 生成，限定当前工程且排除 data/backups |

推荐执行 A+B+C+D；保留依赖缓存、当前更新日志、原始需求和业务维护文件。frontend/node_modules 在宿主仅有挂载占位/元数据，删除收益很小，不作为重点。项目没有多余工作树或分支需要清理。上述审计后，用户决定移除 Finder 更新控件，已于 2026-10-12 删除 `更新 RDMS.app`；更新脚本仍保留。

以下对象不随上述确认删除：

- `data/uploads/objects/.DS_Store` 与 `data/uploads/objects/35/.DS_Store`：一致性检查报告为孤立元数据，非业务引用；仍在真实上传根内，本次仅报告。
- 无挂载容器的历史数据库卷 `rdms07src_rdms_postgres`、`rdms07restored_rdms_postgres`、`rdms07restored2_rdms_postgres`、`rdms08fresh_rdms_postgres`、`rdmsweeklyrestore_rdms_postgres`：历史记录包括合成演练和周报恢复，不能仅凭名称判断没有唯一数据，保留待单独审计。
- Docker 旧镜像、缓存、`rdms_frontend_node_modules`、正式 `rdms_rdms_postgres`：不做全局 prune，也不使用 down -v。

## 验证结果与限制

- `RDMS_CHECK_CACHED_DEPS=1 scripts/check.sh all` 退出 0：Ruff/mypy、PostgreSQL 63 项、ESLint/TypeScript/Vitest 38 项及生产构建、隔离 Playwright 23 项。E2E 的迁移和后端使用精简 runtime 镜像，包含真实上传下载与核心闭环。首轮日志 `/tmp/rdms-release-audit-check.log`，依赖修复后最终日志 `/tmp/rdms-release-audit-final.log`；两轮均退出 0。
- 首次构建因沙箱禁止写 Docker 构建器活动缓存而中断；获准使用构建器后完整重跑通过，未修改或放宽测试。
- 额外无网络、无数据挂载镜像检查：非 root；/app/tests 不存在；pytest/httpx/mypy/Ruff 不可导入；FastAPI 与 RDKit 可导入，乙醇 SMILES 可解析。
- 正式运行只读验证：页面 /、/experiments、/compounds，以及 health、notebooks、experiments、compounds、samples、files、trash、dashboard、openapi 请求均 200。拒绝来源测试命中 health 路径，不执行业务写入。此项为 HTTP 复核，正式浏览器交互未重复执行，完整浏览器验证在隔离环境进行。
- Compose 配置、两份 shell 脚本语法、Markdown 相对链接、Git diff 空白检查通过；原始需求 DOCX 哈希保持不变。
- 真实原件 5 个引用的大小与 SHA256 一致；无缺失/不符/临时残留，仅上述 2 个孤立 Finder 文件。consistent=true 不代表孤立项已清除。
- 本次未停服备份或重新演练历史备份恢复；脚本未改，历史演练证据留在 Git。未重新联网核验 CAS 凭据或科研资料。
- 首轮 npm audit 报 10 项 high，根因为开发依赖链的 [braces 深层嵌套栈溢出](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) 和 [source-map-js 索引映射拒绝服务](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)。将 typescript-eslint 8.42.0 更新至 8.71.1，移除受影响 braces/fast-glob 链，锁文件中的 source-map-js 1.2.1 升至 1.2.2；临时副本安装审计及合入工程后的安装审计均返回 0 vulnerabilities，最终完整复验退出 0。未采用强制大版本更新或放宽检查。
- Starlette/anyio、ESLint 与 whatwg-encoding 弃用提示保留；pip 构建层的 root 安装提示不代表应用运行用户为 root。Python 直接依赖固定版本，传递依赖未完整锁定；本次构建通过不保证未来重建字节级一致。依赖审计结果只覆盖 npm 当前公告，不代表后端和基础镜像已完成漏洞扫描。

## 清场执行记录

2026-10-12，按用户报告后确认执行 A–D：仅停止并移除 rdms-home-studio 预览容器和网络；删除缓存、测试产物、ui-lab/homepage、PLAN.md、docs/roadmap.md、9 份历史任务书及根目录/源码目录 .DS_Store，共 113,673,895 字节（约 113.7 MB 文件逻辑大小）。空的 ui-lab 和 docs/tasks 目录一并移除。明细保留于 `/tmp/rdms-cleanup-receipt.json`；源码与历史需求仍可从 Git 48c4d74 检索。

README、AGENTS 和架构目录同步去除现役原型及任务包引用。真实 data/backups 内的两份 Finder 元数据、全部数据库卷、依赖缓存、Docker 镜像、原始需求和更新日志保留。未清空或修改科研数据，未切换正式镜像。清理后 `RDMS_CHECK_CACHED_DEPS=1 scripts/check.sh all` 退出 0：后端 63、前端 38、浏览器 23 项通过；日志 `/tmp/rdms-post-cleanup-check.log`。已再次清除本轮生成的 A 类缓存和测试产物，复核清理目标均不存在。正式服务健康、原件哈希一致，文档链接及删除范围核对通过。
