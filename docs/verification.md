# 最终验收索引（2026-09-24）

所有表内“通过”均有实测记录。统一入口 `scripts/check.sh all` 在 2026-09-24 退出码 0：Ruff、mypy、PostgreSQL pytest 26 项；ESLint、TypeScript、Vitest 10 项与生产构建；独立 PostgreSQL/上传临时文件系统上的 Playwright 3 项。新增本机 Host/写入 Origin 边界测试；各阶段的原始执行过程与失败修复见 [PROGRESS.md](../PROGRESS.md)。

| 验收 ID | 实测证据 |
|---|---|
| ENV-01 | 阶段 00：Docker 29.8.0、Compose v5.5.1、引擎、端口与磁盘实测，见 PROGRESS 阶段 00。 |
| BOOT-01 | 阶段 01；阶段 08 另用 `rdms08fresh` 从空 PostgreSQL 卷迁移到 `9dd700ef716a`，db/backend 健康、frontend 运行。 |
| CHECK-01 | 阶段 01 故意失败断言使入口非零，移除后通过；最终 `scripts/check.sh all` 退出 0。 |
| DB-01 | `backend/tests/test_stage02_data.py` 的 schema/非法关系检查；每次 backend 检查从空 tmpfs PostgreSQL 迁移。 |
| NUM-01 | `test_fifty_independent_transactions_and_committed_number_not_reused`：50 个独立事务并发创建。 |
| NUM-02 | `test_calendar_year_timezone_width_and_rollback`：跨年、宽度、回滚及日期更新。 |
| CRUD-01 | `backend/tests/test_stage03_records.py` 的 CRUD、标签失败原子性。 |
| REL-01 | 同文件的关系增删与 Compound 引用阻断测试。 |
| TAG-01 | 同文件的重复标签、标签更新和分类移除测试。 |
| VER-01 | 阶段 03/04/05/07 的过期版本测试；Playwright 长文本用例中另以独立 API 写入制造 409，确认页面本地文本保留、数据库新值未被覆盖。 |
| RXN-01 | `backend/tests/test_stage04_lab.py` 的多反应、重复组分与角色/收率；浏览器闭环实际创建反应及产物组分。 |
| SAMPLE-01 | 同文件的混合物、配对字段和跨实验约束；浏览器闭环实际创建样品。 |
| REL-02 | 同文件的三来源并集、反查及分页。 |
| FILE-01 | `backend/tests/test_stage05_files.py` 支持类型及字节/哈希；Playwright 上传中文名 TXT 后独立 SHA256 与下载字节相同。 |
| FILE-02 | 同文件覆盖超限、空文件、伪装类型、非法文件名/路径和符号链接。 |
| FILE-03 | 同文件覆盖同名独立文件、事务提交前后故障。 |
| FILE-04 | 同文件覆盖父级/样品删除可见性与软删除原件。 |
| SEARCH-01 | `backend/tests/test_stage06_discovery.py` 覆盖中文、`%`、`_`、反斜杠和注入字面匹配。 |
| SEARCH-02 | 同文件覆盖分组独立分页、空查询和删除可见性；浏览器闭环搜索创建的实验。 |
| SUMMARY-01 | 同文件覆盖固定摘要、缺失值、删除过滤和稳定 revision；浏览器闭环检查反应及文件出现在摘要。 |
| DASH-01 | 同文件覆盖有效总数和最近记录。 |
| DELETE-01 | `backend/tests/test_stage07_trash.py` 检查先删子再删父及恢复阻塞；界面回收站测试检查状态和导航。 |
| RACE-01 | `backend/tests/test_stage07_races.py` 的两个独立请求并发事务，验证 Compound/实验删除与新引用竞态。 |
| PERSIST-01 | 阶段 07 合成项目 `rdms07src` 三服务停止/重启后 2 个文件完整；阶段 08 `rdms08fresh` 正常 `down`/`up -d` 后实验与下载文件 SHA256 不变。 |
| BACKUP-01 | 阶段 07 `/private/tmp/rdms-stage07-backup-ok` 隔离恢复到 `rdms07restored2`，2 个文件完整哈希一致，软删除状态及关联保存，新编号 `EXP-2026-0003`。 |
| BACKUP-02 | 阶段 07 篡改/缺失备份文件、pg_dump 注入失败均非零，失败备份无 `SUCCESS`，源服务恢复到原端口。 |
| E2E-01 | `frontend/e2e/workflow.spec.ts` 浏览器真实创建 Compound→实验→样品/反应/组分→上传/下载→搜索→摘要→删除/恢复；Playwright 通过。 |
| UI-01 | 同文件检查 1280×800、1440×900、浅/深色实验表格及按钮对比、长标题/SMILES 无页面横向溢出、中文文件名、键盘焦点、空搜索、网络失败和 409 提示；截图在 `frontend/test-results/`。 |
| DOC-01 | README 含配置、启动、全套检查及备份/恢复；`rdms08fresh` 用独立空卷和目录按步骤启动、停止/重启并实测记录及文件哈希。 |
| LOCAL-01 | `backend/tests/test_local_request_boundary.py` 验证非本机 Host 和跨站写入返回 403、无数据库写入，同源浏览器请求和无 Origin 本机命令行请求可用；部署后实测 `/api/health/ready` 为 200，跨站写入为 403。 |

隔离目标均只含合成数据；默认本机应用项目的数据库卷和上传根未用于验收写入。原始 `prompt0922.docx` SHA256 为 `711adf58248533f75ff40375fcc5374b71732073a143ac1cd44e6079ced10be9`。
