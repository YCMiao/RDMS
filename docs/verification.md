# 最终验收索引（更新于 2026-10-01）

所有表内“通过”均有实测记录。2026-09-30 最新 `scripts/check.sh all` 退出码 0：Ruff、mypy、独立 PostgreSQL pytest 32 项；ESLint、TypeScript、Vitest 20 项与生产构建；独立 PostgreSQL/上传临时文件系统上的 Playwright 6 项。阶段历史与后续变更实测见 [PROGRESS.md](../PROGRESS.md)。

| 验收 ID | 实测证据 |
|---|---|
| ENV-01 | 阶段 00：Docker 29.8.0、Compose v5.5.1、引擎、端口与磁盘实测，见 PROGRESS 阶段 00。 |
| BOOT-01 | 阶段 01；阶段 08 另用 `rdms08fresh` 从空 PostgreSQL 卷迁移到 `9dd700ef716a`，db/backend 健康、frontend 运行。 |
| CHECK-01 | 阶段 01 故意失败断言使入口非零，移除后通过；最终 `scripts/check.sh all` 退出 0。 |
| DB-01 | `backend/tests/test_stage02_data.py` 的 schema/非法关系检查；每次 backend 检查从空 tmpfs PostgreSQL 迁移。 |
| NUM-01 | `test_fifty_independent_transactions_and_committed_number_not_reused`：50 个独立事务并发创建。 |
| NUM-02 | `test_calendar_year_timezone_width_and_rollback`：跨年、宽度、回滚及日期更新。 |
| CAS-CREATE-01 | `frontend/e2e/workflow.spec.ts` 验证化合物列表 CAS 入口顺序、无效编号、查询失败重试、多候选显式选择、结构与来源保存、本机匹配不重复创建，以及居中弹窗桌面/窄屏边界。实验 CAS 流程复用同一查询/预览与建档函数，并由原单元/浏览器流程回归验证。 |
| NAV-01 | `backend/tests/test_record_neighbors.py` 验证相邻实验/化合物与列表的排序、筛选、本内范围、回收站排除一致；`frontend/e2e/workflow.spec.ts` 验证跨页切换、首尾禁用、表单重载、未保存保护、返回筛选列表及窄屏无溢出。 |
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
| CHEM-01 | `backend/tests/test_compound_chemistry.py` 验证结构解析、派生值重算、重复检测、CAS 搜索及显式查询；`frontend/e2e/workflow.spec.ts` 在隔离浏览器中完成结构建档与重复提示。2026-09-24 `scripts/check.sh all` 退出 0：后端 29 项、前端 10 项、Playwright 4 项。默认服务迁移到 `3a4d8c1e6f20` 后健康；公开乙醇 InChIKey 实测 PubChem 返回 CID 702、CAS 候选及密度原文。CAS Common Chemistry 真密钥未配置，尚未做带密钥实测。 |
| EXP-01 | `backend/tests/test_stage04_lab.py` 验证反应后处理和纯化创建、更新、清空；`test_stage06_discovery.py` 验证摘要包含这两个字段；`frontend/e2e/workflow.spec.ts` 验证结构图、当量、条件及后处理在实验详情出现。最近一次 `scripts/check.sh all` 退出码 0；默认库迁移到 `6b4f2c9e1d07` 后健康，实验、化合物、反应记录数仍为 0。 |
| MASS-01 | `frontend/src/lib/format-mass.test.ts` 验证分子量最多 2 位、精确质量最多 4 位且不补尾零；`frontend/src/features/records.test.tsx` 验证仅编辑名称时原始分子量不被显示值覆盖；`frontend/e2e/workflow.spec.ts` 验证结构预览、详情和列表显示。 |
| DOSE-01 | `backend/tests/test_compound_chemistry.py` 验证 CAS 校验、本机精确只读匹配、系统名称保存/搜索、PubChem CID 同义词核对和离线返回；`test_stage04_lab.py` 验证反应物分页过滤及历史产物保留。`frontend/src/features/reactant-editor.test.tsx` 验证请求竞态、候选选择、保存失败保留输入和复用已建试剂。`frontend/e2e/workflow.spec.ts` 完成 CAS 添加 → mg/mmol 补全 → 改为 mL → 刷新核对原始精度，并检查投料表顺序、多反应、按需展开和窄屏布局；总览恢复后的截图 `frontend/test-results/reaction-overview-and-table.png` 已目视核对。公开乙醇 `64-17-5` 只读网络实测返回 ethanol、C2H6O、46.07 和来源 CID 702。 |
| OVERVIEW-01 | 2026-10-01 完成收尾：`frontend/e2e/workflow.spec.ts` 验证总览位于投料表之前，已有产物结构图、收率和条件可见，投料表不含结构图及产物；编辑投料后总览同步更新，多反应和窄屏布局继续通过。恢复版本 `scripts/check.sh all` 退出码 0：后端 32、前端 20、浏览器 6 项；截图 `frontend/test-results/reaction-overview-and-table.png` 已目视核对。 |
| IDENTITY-01 | 2026-10-01：`test_compound_identity.py` 用临时表验证旧名称、软删除、版本与引用完整迁移，API 验证 CAS 校验、代号/名称/CAS 搜索和旧编号不再返回；浏览器新增 CAS/系统名称/代号保存搜索用例。最终全套检查退出 0：后端 34、前端 20、浏览器 7 项；`frontend/test-results/compound-identity.png` 和反应总览截图已目视核对。默认库名称补全及前后逐字段比对属于用户授权的数据维护，不是验收造数；记录见 `docs/compound-identity.md` 与 PROGRESS。 |

隔离目标均只含合成数据；默认本机应用项目的数据库卷和上传根未用于验收写入。原始 `prompt0922.docx` SHA256 为 `711adf58248533f75ff40375fcc5374b71732073a143ac1cd44e6079ced10be9`。

2026-10-10 eq/mmol 自动换算：隔离后端 34 项、前端 21 项及检查/构建、浏览器 7 项通过。浏览器验证按 2 mmol/eq 换算并保存刷新；完整入口因 npm 安装网络中断后分项补验，详情及日志见 PROGRESS。

2026-10-10 实验复制：后端隔离 PostgreSQL 36 项，前端 21 项与 lint/类型/构建，隔离浏览器 8 项通过；新增测试验证独立草稿、精度与关联保留、历史结果排除及原实验未变，故障注入验证全部回滚。完整入口因旧 npm 依赖目录中断后分项补验，详见 PROGRESS。

2026-10-10 产物入口：隔离后端 36 项、前端 22 项与检查/构建、浏览器 9 项通过。新增 UI 验证产物新增、编辑、完整精度与 0% 收率、刷新、删除、恢复、总览同步和窄屏；完整入口网络中断后用已检查依赖离线补验，详见 PROGRESS。

2026-10-10 反应条件保存反馈：后端隔离 PostgreSQL 36 项、前端 23 项及检查/构建、隔离浏览器 10 项通过。验证字段校验失败后就地提示并保留输入、修正后保存、条件/处理重访完整保留、多反应互不覆盖、8 位小数与零值；完整入口因浏览器依赖执行权限中断后使用已检查依赖补验，详见 PROGRESS。

2026-10-10 温度/时间表示：`scripts/check.sh all` 退出 0，后端独立 PostgreSQL 38 项、前端 24 项与检查/构建、隔离浏览器 11 项通过。新测试 `test_reaction_conditions.py` 及浏览器条件模式用例验证 °C/描述、h/min/描述、迁移保留旧数值及元数据、精度/零值、互斥规则、重访、复制和摘要；默认库迁移前备份已验证，迁移后原业务记录逐表相同。详见 PROGRESS。

2026-10-10 复制反应顺序：`scripts/check.sh all` 退出 0，隔离后端 40 项、前端 24 项与检查/构建、浏览器 11 项通过。序号迁移保留旧字段与显示顺序，12 步跨页/连续复制/摘要/新建追加及浏览器三步复制刷新验证通过；授权纠正 EXP-2026-0004 与 0006，除序号及四行版本更新时间外全库原记录逐字段未变。详见 PROGRESS。

2026-10-10 限制反应物与自动收率：隔离后端 PostgreSQL 45 项、最终前端 31 项与 lint/类型/构建、隔离浏览器 12 项通过。`test_product_yield.py` 验证 Decimal 计算、单位/计量比、零值/超 100%、手填保留、缺项失败不写、并发单限制反应物、删除恢复冲突、复制、旧字段/元数据迁移保留及有新字段时拒绝有损降级；UI 验证质量/计量比联动、默认 1、eq 固定、手动覆盖、旧手填值仅改备注仍保留，以及桌面/窄屏控件不越界。完整检查初次浏览器用例等待/定位问题修正后分项重验均通过。迁移前备份 verify 通过，部署后旧字段精确快照完全一致、原件哈希相同，详见 PROGRESS。

2026-10-11 实验记录本：缓存模式 `scripts/check.sh all` 退出 0，后端 54 项、前端 31 项及检查/构建、隔离浏览器 17 项通过。新增 `test_notebooks.py` 验证本内编号、原子转移/预览冲突、归档、跨本复制、恢复和迁移回收站排除，浏览器验证卡片及操作闭环。真实库 7 个有效实验按原编号顺序重新编号，正文及其他原有表逐项一致，原件完整哈希检查通过；备份、Git 基线和部署证据见 PROGRESS。

2026-10-11 第 3 项布局与留白：缓存模式完整检查退出 0，后端 63、前端 31、隔离浏览器 21 项通过。新增 `新增区按需展开保留输入，反应顶部切换和区块留白适配窄屏` 验证折叠保留文字和已选文件、顶部反应切换、分页留白、输入高度与 1280/390px 无页面横向溢出；原闭环覆盖更多菜单建档、反应创建、上传保存与未保存切换保护。截图及日志见 PROGRESS。
