# 执行进度

## 复制实验窗口与产物复制（2026-10-11）

- 用户明确指定三项：复制窗口在视口居中，沿用原字体与主题并收紧宽度；原实验改为下拉选择，输入标题/编号后自动筛选，无匹配时显示空项，超过 25 项保留分页；搜索或翻页立即清除旧选择。创建入口仍有重复提交保护、版本检查和失败保留输入。
- 复制现在包含活跃产物组分，保留化合物引用、用量/单位、mmol、计量比、收率、排序和备注，生成独立组分 UUID，不重新计算数值；已删除组分仍排除。草稿状态、反应顺序及其他复制规则不变，样品/附件与实验观察/结果/结论不复制。不追补之前已有副本或修改原实验。
- Git 修改前基线为 `82be3bc`，本项独立提交可撤销后重建 backend/frontend 回滚，无迁移。已有数据库和上传内容未写入或删除。
- 已运行 `scripts/check.sh all`：后端独立 PostgreSQL 45 项、前端 31 项与 lint/类型/构建通过，浏览器首次遇到下拉菜单定位问题，改用 combobox 精确定位。重跑浏览器依赖安装 ECONNRESET；前端重新安装也有网络延迟，暂停冗余安装后复用缓存、关闭非必要审计补齐一个缺失包，完整 `npm run check` 再次退出 0（31 项）。只读挂载已验证同版本依赖到原隔离 E2E Compose，最终浏览器 12 项退出 0；覆盖居中坐标、搜索匹配与无匹配、窄屏边界、产物复制、修改副本产物后原组分完全相同。隔离测试容器和网络已清理。
- 日志 `/tmp/rdms-copy-refresh-check.log`、`/tmp/rdms-copy-refresh-frontend-final2.log`、`/tmp/rdms-copy-refresh-e2e-offline.log`；桌面/窄屏截图 `frontend/test-results/experiment-copy-dialog.png`、`frontend/test-results/experiment-copy-dialog-mobile.png` 已目视核对。README 同步当前规则。
- 只构建并切换本机 backend/frontend，不运行迁移或更换数据库卷；部署退出 0，就绪返回 `{"status":"ok"}`。日志 `/tmp/rdms-copy-refresh-deploy.log`。

## 实验反应单页展示与编号（2026-10-10）

- 用户指定范围仅为实验详情反应区：每页请求并展示一个反应，按原显示顺序标为 REACTION 1、REACTION 2 等，上一页/下一页切换；新建后打开新增反应，删除最后一页后回到有效页，重新进入实验从第一页开始。编号只用于展示，不改写反应名称或数据库顺序。
- 切页或新建反应前，当前条件有未保存修改或反应物/产物录入表单打开时先确认；取消切换保留输入。过期分页响应不覆盖当前页，保存后继续保留按钮旁反馈。
- 修改前 Git 基线为 `65c4eb9`；本项可独立撤销并重建 frontend 回滚，无后端或数据库迁移。已有科研记录和上传文件未改动。
- `scripts/check.sh all` 最终退出 0：独立 PostgreSQL 45 项、前端 31 项及检查/构建、隔离浏览器 12 项通过。首次浏览器依赖下载 ECONNRESET 中断，完整重跑后通过。覆盖单页/连续编号、创建后定位、删除末页、未保存修改的取消/确认、多步复制顺序、刷新和保存重访；日志 `/tmp/rdms-one-reaction-check.log`，截图 `frontend/test-results/reaction-overview-and-table.png` 已目视核对。隔离测试容器与网络清理完成。
- 仅构建并更新本机 frontend，部署退出 0，就绪返回 `{"status":"ok"}`；日志 `/tmp/rdms-one-reaction-deploy.log`。README 已同步。

## 限制反应物与产物质量自动计算收率（2026-10-10）

- 用户批准的完整功能：添加/编辑反应物可勾选“限制反应物”，每个反应最多一个，eq 固定为 1；产物计量比默认 1（每 1 mol 限制反应物生成的产物 mol 数），填入或修改质量/单位/计量比/产物身份后预览收率，可手动修改。超过 100% 提醒核查但允许保存，缺少限制反应物 mmol/质量与 Mw、产物 Mw 或质量单位时指出缺项，不假定 mL 对应质量。
- Alembic `e5b8d0f302ca` 只新增 `is_limiting`（旧行为 false）和 `stoichiometric_ratio`（旧行为 NULL），带单限制反应物部分唯一索引、非产物/1 eq 与产物正计量比约束。业务写入沿用父实验/反应锁与版本检查，服务端在显式请求计算时使用 Decimal 重新计算并保留八位小数；不信任客户端预览值。手填收率、旧产物打开/仅改备注不会重算，限制反应物后续编辑也不批量覆盖旧产物收率。复制实验保留限制反应物，摘要显示标记与计量比，回收站恢复冲突给出原因。API 类型从代码 OpenAPI 重新生成。
- 代码基线 `36d1f12`；迁移前完整备份 `backups/pre-auto-yield-20261010/` 与离线 verify 均退出 0，原 schema 为 `d4a7c9e201bf`。新字段已使用后直接降级会拒绝丢失内容；需要 schema 回退时按 README 从迁移前备份隔离恢复，不覆盖非空目标。
- `scripts/check.sh all` 后端独立 PostgreSQL 45 项、前端 30 项及检查/构建通过；首次完整检查先修正格式及零值 Decimal 字符串断言，随后浏览器出现原恢复用例未等待响应与新增单位控件定位问题，修正测试后 12 项通过。截图发现输入框挤出边框，修正局部列宽并增加桌面/窄屏控件边界验证，最终 `scripts/check.sh frontend` 和 `scripts/check.sh e2e` 退出 0（30 项 / 12 项）。再补充旧手填收率与理论值不一致时打开/仅改备注仍保留的回归用例，复用相同容器与依赖运行 `npm run check` 退出 0，最终前端 31 项；包含科学计算单位/计量比/零值/超 100%、手填覆盖、缺项、不写失败记录、并发唯一、删除恢复冲突、复制和迁移原字段保存。所有测试使用隔离数据库与临时上传根，测试容器及网络已清理。
- 验证日志：`/tmp/rdms-auto-yield-check.log`、`/tmp/rdms-auto-yield-frontend-final.log`、`/tmp/rdms-auto-yield-e2e-final.log`、`/tmp/rdms-auto-yield-preservation-final.log`；截图 `frontend/test-results/product-auto-yield.png` 已目视核对。README 与投料表说明同步。
- `scripts/update_rdms.sh` 退出 0，本机 schema 为 `e5b8d0f302ca`，就绪 ok。真实库部署前后精确 JSONB 文本快照逐表比对（仅排除新增两列）原业务字段完全相同：7 实验、17 化合物、12 反应、57 组分、1 文件及其他表均未变化；新增字段未用于任何旧行，未写入验收数据。上传全哈希检查一致且每个备份原件 SHA256/大小与部署后原件相同。备份内 `yield-audit/` 保留前后快照与比对结果；未删除真实记录或文件。

## 样品页按需展开新建表单（2026-10-10）

- 用户批准范围仅为样品页新建入口。默认显示列表与搜索，标题旁“新建样品”展开原表单；取消时非空输入需确认，拒绝取消保留内容，确认取消清空并收起。创建成功后收起并刷新列表，失败仍保留输入。字段与 API 写入内容不变，未改动已有样品。
- 修改前基线为 `270a7d0`（此前完整快照 `8bb718f`）。本项独立提交可撤销后重建 frontend 回滚，无 schema 或后端修改。
- `scripts/check.sh all` 后端独立 PostgreSQL 40 项、前端 26 项及 lint/类型/构建通过；浏览器依赖下载 ECONNRESET 导致完整入口退出 1。重跑 `scripts/check.sh e2e` 退出 0，11 项通过，隔离容器与网络清理完成。日志 `/tmp/rdms-sample-toggle-check.log`、`/tmp/rdms-sample-toggle-e2e.log`。新增验证覆盖默认隐藏、成功收起、取消拒绝保留/确认清空且不写入；浏览器创建闭环通过，`frontend/test-results/sample-list.png` 已目视核对。
- 仅构建并切换本机 frontend，退出 0，就绪返回 `{"status":"ok"}`；日志 `/tmp/rdms-sample-toggle-deploy.log`。未执行迁移或修改真实科研记录、数据库卷、上传文件。

## 首页状态卡片简化（2026-10-10）

- 用户批准范围仅为首页状态卡片。修改前将全部现有代码与文档保存为 Git 快照 `8bb718fe073e111a50e7e6e195f91ec6c0ee9fd4`；真实数据库、上传目录、备份与 .env 不纳入 Git。
- 正常及检查中不显示状态卡片；异常时显示“服务暂不可用，请重试”，移除卡片技术说明和 API 文档入口。保留原健康检查，其他页面与业务行为不变。
- `scripts/check.sh all` 退出 0：后端独立 PostgreSQL 40 项、前端 25 项及 lint/类型/构建、隔离浏览器 11 项通过。前端测试覆盖正常隐藏和异常提示。日志 `/tmp/rdms-ui-status-check.log`；首次沙箱限制 Docker 缓存写入，获准重跑后通过。隔离测试容器及网络已清理。
- 仅构建并切换本机 frontend，部署命令退出 0，就绪返回 `{"status":"ok"}`，日志 `/tmp/rdms-ui-status-deploy.log`。未执行迁移、修改真实科研记录或上传文件。回滚应撤销此项独立提交并重建 frontend；Git 快照用于代码回滚，不替代科研数据备份。

## 实验复制保留反应顺序及已有副本纠正（2026-10-10）

- 根因：复制在同一 PostgreSQL 事务中创建所有反应，`now()` 生成相同 created_at，旧列表/摘要以 created_at、随机 UUID 排序，导致副本顺序随机。新增 Alembic `d4a7c9e201bf` 和 Reaction.sort_order，按旧显示顺序回填所有现有行，保留原时间戳、内容和版本；新建在父实验锁内追加序号，复制按来源顺序分配序号，列表/分页/摘要统一使用序号。原本正常的实验顺序不变，前端类型同步新增只读序号。
- `scripts/check.sh all` 最终退出 0（`/tmp/rdms-order-check-final.log`）：Ruff/mypy、隔离 PostgreSQL 40 项、前端 24 项及 lint/类型/构建、隔离浏览器 11 项通过。回归覆盖 12 步跨页、同时间戳、连续两次复制、摘要、追加第 13 步，迁移测试覆盖旧值/时间/版本/软删除行不变；浏览器从单步扩展为三步复制并刷新核对顺序。首次检查发现可空聚合结果的类型问题，修正后全套通过，测试容器和网络已清理。
- 真实数据：只读确认 EXP-2026-0004 相对 EXP-2026-0001、EXP-2026-0006 相对 EXP-2026-0003 倒序；EXP-2026-0007 已正确。完整备份 `backups/pre-reaction-order-20261010/` 校验通过后部署，默认库迁移至 d4a7c9e201bf，更新脚本退出 0、就绪正常；迁移后逐表比对（排除新增序号）原字段完全相同。
- 按用户授权，仅纠正 0004/0006 四条反应序号。事务锁定父实验和反应，校验名称反向匹配、复制时间特征和原版本后一次提交；四行版本各加 1、updated_at 更新，其他科学字段、UUID、创建时间、投料、产物、附件、关联、原实验和正常副本均逐字段未变。API 列表和摘要读回的顺序均与来源一致，上传全哈希检查一致。前后完整快照、版本保护修复脚本及写入结果保存在备份的 order-audit/。

## 温度/时间可选数值、单位或描述（2026-10-10）

- 按用户新要求替代上次“文字写在备注”的限制：温度选择 °C 或描述；时间选择 h、min 或描述。描述可直接记录室温、冰浴、回流、过夜等，保存结果继续在按钮旁提示并在失败时保留输入。界面以同一行的两组条件控件选择方式、填写内容，数值保留完整精度；总览按所选表示展示，描述不转换为推测数值。
- Alembic `c9e2f4a601bd` 增加 `temperature_description`、`reaction_time_minutes`、`reaction_time_description`，原 °C/h 字段、精度、UUID、版本和时间戳保持不变。API 和数据库约束同一条件只有一种表示，分钟数非负；PATCH 写入新的非空表示时清除旧表示，兼容旧 Celsius/hours 请求，空值可清空。已有描述/分钟数据时拒绝丢失内容的直接降级，需用迁移前备份隔离恢复。实验复制与 JSON/Markdown 摘要支持新字段，前端类型从当前 OpenAPI 重新生成。
- `scripts/check.sh all` 最终退出 0（`/tmp/rdms-modes-check-all.log`）：Ruff/mypy、独立 PostgreSQL 38 项、前端 24 项及 lint/类型/构建、隔离浏览器 11 项通过。新增迁移测试覆盖旧非零/零值、软删除行与元数据保留、互斥约束、可无损降级及有新内容时降级拒绝；API/UI 测试覆盖模式互切、原精度、负数/非法输入不写入、重访、复制独立性、摘要、零值及窄屏。E2E 依赖 tmpfs 显式加 exec，消除上次依赖程序 EACCES，本次完整入口无需临时覆盖。测试容器与网络已清理；截图 `frontend/test-results/reaction-condition-modes.png` 已目视核对。
- 更新前完整备份 `backups/pre-condition-modes-20261010/` 的离线校验通过，迁移前版本 `b7e1a9302c64`。`scripts/update_rdms.sh` 退出 0，默认库已迁移至 `c9e2f4a601bd`，就绪接口正常。前后逐表完整 JSON 比对（仅排除新加的三列）确认所有原业务记录完全相同，上传全哈希检查一致；新字段未向旧记录填入猜测内容，未向真实库写测试数据。

## 反应条件保存反馈与重访验证（2026-10-10）

- 本机只读核对：第二个反应 `48066b68-b388-459e-b4a2-4133f4ad3160` 的保存日志有 HTTP 422，数据库条件字段仍为空；未记录请求正文，不能据此确定用户当时具体填错哪一项。隔离浏览器复现温度填写 RT 时整个保存被拒绝，而旧提示位于卡片顶部，底部保存处不可见。未推测或补写用户丢失的条件。
- 已仅构建并切换本机 frontend，就绪检查正常；真实实验的两条反应更新前后完整 JSON 相同，没有向默认科研库写测试数据或操作上传文件。
- 最小修复：反应条件有独立保存反馈，成功/失败信息显示在保存按钮旁；422 映射到中文字段名与数值要求，失败保留全部输入，编辑后清除旧提示；保存过程中禁用重复保存和删除。温度/时间保留十进制字符串及原始精度，提示室温/过夜等描述写入备注，不推算科学数值。另修正数据库零值 `0E-8` 在编辑框显示为 `0`，非零精度不变。无后端或 schema 变更。
- 验证：`scripts/check.sh all` 后端 PostgreSQL 36 项、前端 23 项及 lint/类型/构建通过；浏览器依赖安装因 tmpfs 执行权限 EACCES 中断，整体退出 1。以原隔离 Compose 配合 `/tmp/rdms-products-offline-e2e.yml` 使用已检查的依赖卷，最终浏览器 10 项通过；期间修正新测试的文本框定位和零值表示断言。格式修正后前端检查重新通过。日志 `/tmp/rdms-condition-check-final.log`、`/tmp/rdms-condition-frontend-final.log`、`/tmp/rdms-condition-e2e-final2.log`。新增测试覆盖字段拒绝后的原文保留、修正重试、多反应独立保存、8 位小数、零值、重访及第一反应完整不变。独立测试数据库与上传临时目录已清理。

## 补充产物记录入口（2026-10-10）

- 每个反应在投料表之后新增独立“产物与收率”区和“记录产物”按钮。复用现有 ReactantEditor 的化合物选择/CAS/手动建档逻辑，以 product 模式保存既有组分 API；可记录多个产物、产物量及单位、mmol、收率和备注，并带版本号编辑、软删除。产物不进入反应物投料表或 eq/mmol 基准，不自动推算收率或新建样品。现有产物可读写，原反应总览在新增/编辑/删除后同步刷新；回收站恢复后刷新可见。
- 未新增后端接口或数据库迁移；共享录入表单对反应物继续隐藏产物和收率。产物默认从本机化合物库选择，也可按 CAS 查找或手动录入；保留保存失败时输入与已建化合物复用。README 与投料表说明已同步。
- `scripts/check.sh all` 后端 PostgreSQL 36 项及 Ruff/mypy、前端 22 项及 lint/类型/构建通过，浏览器安装 ECONNRESET 导致整体退出 1；重跑 `scripts/check.sh e2e` 依赖安装仍中断。采用临时覆盖 `/tmp/rdms-products-offline-e2e.yml` 只读挂载已通过前端检查的同版本依赖，离线执行 Playwright；首次发现旧表头断言范围需限于投料表、零值 Decimal 以 0E-8 序列化，修正断言后最终 9 项通过（退出 0），包括新增/编辑/刷新/删除/恢复、完整八位精度、0% 收率、总览同步与窄屏。日志 `/tmp/rdms-products-check.log`、`/tmp/rdms-products-offline-e2e-final.log`；所有功能测试使用隔离数据库和临时上传目录。
- 为避免之前多次宿主依赖清理 ENOTEMPTY，E2E 的 node_modules 改用 tmpfs，并关闭非验收必需的 npm 审计网络请求；实际依赖下载仍有网络中断，本次验收使用上述已安装依赖覆盖。测试容器与网络已清理，外部前端依赖卷保留。
- 产物表截图 `frontend/test-results/product-entry.png` 已目视核对。仅构建并切换默认 frontend，部署后 WebKit 只读验证真实实验的产物表单，`/tmp/rdms-product-live.png` 已目视核对，无页面错误；就绪 ok。真实库更新前后均为 1 实验、4 化合物、1 反应、4 组分、0 文件，上传全哈希检查一致；未向真实库写入验收产物，继续保留入口 no-store 与回环边界。


## 从现有实验复制为独立草稿（2026-10-10）

- 按用户确认范围，在实验列表“新建实验”旁新增“从现有实验复制”。弹窗支持按标题/编号查找、分页选择原实验、自定义标题及日期；默认标题加“副本”、日期为本机今天。确认创建前不写数据，创建后进入新实验详情。
- 新增 `POST /api/experiments/{id}/copy`，以原实验版本检查及父级锁保证读取一致，在一个事务内分配新 EXP 编号并复制目的、操作、标签、直接化合物关联、有效反应条件/后处理/纯化及非产物投料；使用新实验、反应、组分 ID，复用有效化合物，不新增化合物。新状态为草稿、版本 1；不复制观察、结果、结论、产物/收率、样品、附件或已删除记录。失败回滚全部创建及编号计数。无数据库迁移。
- 后端新增 `test_experiment_copy.py` 验证多个反应、精度、标签与关联、原记录未变、副本独立编辑、结果/产物/样品/文件排除、版本冲突、已删源拒绝和故障回滚；隔离 PostgreSQL 36 项、Ruff/mypy 通过。前端最终 lint/类型/21 项测试/构建通过，生成 API 类型并同步 README。
- `scripts/check.sh all` 后端与前端通过，浏览器安装因宿主旧依赖目录 ENOTEMPTY 中断，整体退出 217；采用原隔离 Compose 加临时新依赖卷覆盖重跑浏览器退出 0，8 项通过，包含选择来源→创建独立草稿→刷新持久化。测试项目、网络及临时依赖卷已清理。日志 `/tmp/rdms-copy-check.log`、`/tmp/rdms-copy-frontend-final.log`、`/tmp/rdms-copy-e2e.log`。截图 `frontend/test-results/experiment-copy-dialog.png` 目视发现关闭按钮折行，已限制收缩并通过最终构建修正。
- `scripts/update_rdms.sh` 退出 0；最终前端另行重建更新按钮布局。部署后的 WebKit 只读验证复制弹窗，`/tmp/rdms-copy-live.png` 已目视检查，无 pageerror；真实库更新前后均为 1 实验、4 化合物、1 反应、4 组分、0 文件，上传全哈希检查一致，就绪 ok。未在真实库创建测试副本，前端继续只绑定回环地址，保留入口 no-store 防旧脚本缓存配置。


## 更新后白屏与入口缓存修复（2026-10-10）

- 用户报告网址可打开但页面空白。实际首页、当前 JS 与就绪接口均返回 200；Safari 访问日志仍请求旧脚本 `/assets/index-DbAq9g7K.js`，实测该不存在的脚本地址被 SPA fallback 返回 HTML。更新后的入口与旧脚本引用不一致是已证实的加载风险。
- 仅修改 `frontend/nginx.conf`：入口及 SPA 页面 `Cache-Control: no-store`，关闭 HTML ETag 与 If-Modified-Since 的 304 响应；`/assets/` 缺失资源明确返回 404，避免 HTML 被当作模块脚本。保留安全响应头与原代理、回环边界。只构建并切换 frontend，未修改业务代码、数据库或上传文件；已打开带刷新参数的新本机入口以绕开旧缓存。
- 部署后实测带旧 If-Modified-Since 的首页返回 200/no-store，旧脚本返回 404，当前 JS 为 application/javascript，就绪接口 ok。临时只读浏览器脚本 `/tmp/rdms-page-smoke.cjs` 用 Chromium 与 WebKit 分别加载首页、实验、化合物、设置，全部渲染且无 pageerror；所有业务请求限定 GET，未写真实库。
- `scripts/check.sh all` 后端 34 项、前端 21 项及 lint/类型/构建通过，浏览器安装因旧 node_modules 目录 ENOTEMPTY 中断，整体退出 217。用原隔离 Compose 加临时覆盖 `/tmp/rdms-cache-e2e-override.yml`（新临时依赖卷、关闭 npm 审计）重跑退出 0，7 项通过；随后仅对该隔离项目清理容器、网络及临时依赖卷。日志 `/tmp/rdms-cache-check.log`、`/tmp/rdms-cache-e2e.log`。默认项目数据卷未删除，上传全哈希检查一致。


## eq 与 mmol 按本反应基准自动换算（2026-10-10）

- 最小功能改动集中于 `frontend/src/features/reactant-editor.tsx`，复用现有组分 API 按页读取本反应第一组有效正数 mmol/eq（排除正在编辑的行及产物），不新增后端接口或迁移。输入 eq 或 mmol 后离开输入框，按固定比例更新另一项；按 Mw 补全 mmol 时同步补全空白 eq。没有基准时仍手工录入首组；不从 mL 推测 mmol，不批量改写其他已保存投料。
- 前端新增分页、零值排除、双向换算及 Mw 联动回归，修正旧 CAS 测试的重复响应模拟；浏览器在隔离数据库实际验证 1 eq = 2 mmol、后续 1.05 eq 自动得 2.1 mmol，保存并刷新后保持一致。README 与投料表说明同步。
- 两次 `scripts/check.sh all` 的后端 PostgreSQL 34 项通过，前端 npm ci 因 ECONNRESET 中断，整体退出 1。临时关闭测试容器 npm 审计后完成安装；最终同一 frontend-test 容器配置运行 `npm run check` 退出 0，lint、类型检查、21 项测试及构建全部通过。浏览器使用原隔离 Compose 加 `/tmp/rdms-eq-e2e-override.yml`（仅关闭 npm 审计、优先缓存）退出 0，7 项通过；已清理全部 E2E 容器与网络。日志 `/tmp/rdms-eq-frontend-final.log`、`/tmp/rdms-eq-e2e.log`。
- 只构建并切换默认项目 frontend，未切换 backend/db。就绪接口 ok，更新前后真实库均为 1 实验、2 化合物、1 反应、2 组分、0 文件；上传全哈希检查一致。前端仍仅绑定回环地址，保留现有未提交改动。


## 清空本机业务数据，保留功能（2026-10-09）

- 按用户明确要求，仅清空默认 `rdms` 项目的业务数据。先建立 `backups/pre-clear-20261009/` 完整数据库与上传文件备份，成功标记、dump SHA256 和 4 个文件哈希均经 `verify` 校验通过；历史备份保留。
- 停止 frontend/backend 写入后，核对实际上传挂载及全部业务表，在事务中清空 11 个业务表并重置编号计数；删除已与备份逐个比对的 4 个上传文件。清空前为 7 实验、7 化合物、11 反应、19 组分、4 样品、4 文件、3 编号计数；清空后全部业务表为 0，回收站为空，上传完整哈希检查无引用、孤立或临时文件。
- 保留全部功能代码、现有未提交改动、数据库结构及 Alembic `b7e1a9302c64`、本机配置与密钥；未删除数据库卷，未使用 `down -v`。服务恢复后就绪接口为 ok，总览统计与最近记录为空，前端仍只绑定 `127.0.0.1:8080`，后端及数据库未发布宿主端口。
- 已运行 `scripts/check.sh all`：后端隔离 PostgreSQL 34 项、前端 20 项及 lint/类型/构建通过；首次浏览器依赖安装因 ECONNRESET 中断，整体退出 1。重跑 `scripts/check.sh e2e` 退出 0，7 项浏览器验收通过，隔离容器及网络自动清理。日志为 `/tmp/rdms-clear-check-20261009.log` 和 `/tmp/rdms-clear-e2e-20261009.log`；测试未向清空后的真实数据库或上传目录写入记录。


## 恢复反应总览，保留纯表格投料（2026-10-01）

- 用户澄清“不需要结构式”仅针对投料表。每个反应现按“反应总览 → 反应物与投料 → 条件与处理”排列。总览恢复底物与已有产物的结构图、名称、用量/当量、已有收率，箭头上下展示辅助试剂及条件；未录入结构时显示名称及已有化学式，不推断结构。
- 新增 `frontend/src/features/reaction-overview.tsx`，读取全部组分页，独立于投料表的产物过滤与分页。新增、编辑、删除投料后刷新总览，读取失败可重试。投料表继续不含结构图和产物行，CAS 查询、按需展开添加界面与单实验多反应保持可用。
- 恢复版本 `scripts/check.sh all` 退出码 0：后端独立 PostgreSQL 32 项、前端 20 项及 lint/类型/构建、隔离浏览器 6 项通过。浏览器核对结构图、已有产物收率、总览位于投料表之前、表格无结构及产物、编辑用量后总览同步刷新、多反应和窄屏布局。截图 `frontend/test-results/reaction-overview-and-table.png` 已目视核对，测试容器与网络已清理。
- `scripts/update_rdms.sh` 退出码 0；本机就绪接口返回 200，实际提供的前端资源同时含反应总览与投料表。backend/db 健康，前端仍只绑定 `127.0.0.1:8080`。本次无新增迁移，未向真实实验库或上传目录写入测试数据。README、投料表说明及验证索引已同步。


## 反应物投料表与 CAS 自动查找（2026-09-30）

- 按用户要求，实验中继续保留多个反应；每个反应先展示投料表，再展示条件、后处理与纯化。表格逐行展示系统名称、化学式、CAS、Mw、eq、mmol、mg 和 mL。当时误将“不需要结构式”扩大为移除总览，现已按后续澄清恢复，见上方记录。投料表移除产物/收率录入，历史产物数据保留，服务端过滤保证反应物数量和分页一致。
- 新增/编辑详细界面按需展开，支持 CAS 自动查找、本机试剂库和手动录入。CAS 校验格式及校验位，500 ms 防抖并丢弃过期查询结果；本机精确匹配优先，未命中时查询 PubChem，复核 CID 的 CAS 同义词。多候选要求选择，失败可重试或手动填写。查询与取消不建档，保存后才新建试剂；保存投料失败时保留输入并复用已建试剂。
- Alembic `8c2d4e6f901a` 新增可空 `compound.iupac_name`，原名称不改写。投料表优先显示 IUPAC 名称，既有记录缺失则标注待补充，可在化合物编辑页补充。外部返回英文 IUPAC 名称并保存出处；换为不同结构时清除旧系统名称。mg/mmol 可按 Mw 补全空白项，mL 不在缺少密度或浓度时自动换算，eq 手动填写。数值展示沿用最多两位小数，编辑不截断原始精度。
- 最终 `scripts/check.sh all` 退出码 0：Ruff/mypy、独立 PostgreSQL 后端 32 项、前端 lint/类型检查/Vitest 20 项/构建、隔离 Playwright 6 项全部通过。浏览器验证 CAS 添加、编辑 mL、刷新保留八位小数、多反应、历史产物保留、条件前的表格顺序与窄屏不溢出；截图 `frontend/test-results/reactant-table.png` 已目视核对。测试发现空表的表头语义不明确，已添加列 scope；编辑测试按下拉框的可访问角色定位。E2E 容器和网络已自动清理。
- 公开乙醇 CAS `64-17-5` 查询实际返回 ethanol、C2H6O、46.07、CID 702，无警告。查询不依赖原 CAS Common Chemistry 密钥。
- 更新前核对真实上传目录一致性，并建立 `backups/pre-reactant-table-20260930/`，`verify` 通过。`scripts/update_rdms.sh` 退出码 0，迁移至 `8c2d4e6f901a`；更新前后实验 5、化合物 7、反应 7、组分 8、文件 0，数量不变，上传全哈希检查一致。服务健康，只有前端绑定 `127.0.0.1:8080`。测试未向默认科研数据库或上传目录写入合成数据。
- 使用说明与参考来源见 `docs/reactant-table.md`，README 和 `docs/verification.md` 已同步。本次基于现有未提交改动继续开发，没有回退既有工作。


## 数值显示精度统一（2026-09-25）

- 检查化合物、实验反应式、组分表格、样品与反应编辑框、结构预览和实验 Markdown 摘要的数值展示。一般数值最多显示两位小数，精确质量最多四位；不补尾零。CAS/理化性质的来源原文及用户自由文本保持原样。
- 编辑框只去除 PostgreSQL `Numeric(20,8)` 序列化带来的尾零，不舍入有意义的非零位；前端显示用舍入不改变 API 中的保存值。实验摘要的 Markdown 数值单独格式化，摘要 JSON 和版本依据继续使用原始数值。
- `scripts/check.sh all` 退出码 0：独立 PostgreSQL 后端 29 项、前端 16 项、隔离浏览器 6 项通过；新增测试检查舍入、不补零和编辑其他字段时保留精度。测试结束后端到端容器和网络自动清理，没有向默认科研数据库或上传目录写入测试数据。
- `scripts/update_rdms.sh` 退出码 0，默认项目 db/backend/frontend 健康，前端只绑定 `127.0.0.1:8080`；本次无数据库迁移。

## 隔离测试容器清理（2026-09-25）

- 清理本次 `scripts/check.sh all` 遗留的 `rdms-stage08-e2e` 容器和网络；未使用 `down -v`，默认 RDMS 的数据库、后端和前端继续运行。
- 调整 `scripts/check.sh`：端到端检查正常结束时立即执行 `docker compose -f docker-compose.e2e.yml down --remove-orphans`，失败或中断退出时也通过退出钩子清理。
- 重新运行 `scripts/check.sh e2e`，6 项浏览器测试通过；运行结束后 `rdms-stage08-e2e` 的 `ps -a` 为空，默认 RDMS 服务仍正常。`/bin/sh -n scripts/check.sh` 通过。

## 实验与化合物导航修复（2026-09-25）

- 首次更新后用户报告化合物列表仍显示“请求字段无效”。实际 Nginx 日志确认 Safari 已打开的标签页继续发送 `/api/compounds?...sort=date_desc` 并收到 422；同一页面重新载入新脚本后发送 `sort=created_desc` 返回 200。原先只在路由元素加 key，不能修复已经运行旧脚本的标签页。
- 补充修复：列表请求和排序控件按当前模块归一化排序值；后端兼容另一模块的排序值并映射为当前模块默认排序，让更新前已打开的标签页也能继续使用。独立 PostgreSQL 测试核对兼容请求与默认请求返回一致。
- 再次运行 `scripts/check.sh all` 退出码 0：后端 29 项、前端 13 项、隔离浏览器 6 项通过。再次运行 `scripts/update_rdms.sh` 退出码 0，db/backend/frontend 健康；本机实际请求 `/api/compounds?...sort=date_desc` 和 `/api/experiments?...sort=created_desc` 均返回 200，新前端资源已提供。未向默认科研数据库或上传目录写入测试数据。
- 故障原因：两个列表路由复用同一个 `RecordList` 组件，直接切换时沿用前一模块的排序状态；实验使用 `date_desc`，化合物使用 `created_desc`，后端对不属于当前模块的排序值返回 422。经过总览会卸载列表，因此能暂时避开故障。
- 修复：为两个列表路由设置不同组件 key，切换模块时重新初始化各自筛选和排序状态；新增隔离浏览器用例覆盖从实验或化合物直接进入另一模块、再切回原模块。
- `scripts/check.sh all` 退出码 0：后端独立 PostgreSQL 测试 29 项、前端测试 13 项及构建、隔离浏览器测试 6 项均通过；没有向默认科研数据库或上传目录写入测试数据。
- `scripts/update_rdms.sh` 退出码 0，前端已重建并切换到本机 `127.0.0.1:8080`；db/backend/frontend 健康，就绪检查通过。更新脚本先对现有数据库做只读连接预检，未清空数据库或原始文件。

## 2026-09-24 周报实验录入

- 开工前对默认 `rdms` 项目的数据库和上传目录创建备份 `backups/pre-weekly-import-20260924-2330/`，`verify` 通过；备份前实验、化合物、反应、组分、样品和文件均为 0。代码起点为 Git `74d1c0aa82327f1d62a1edc14fd826ae2b1e6a15`，备份清单记录 Alembic `6b4f2c9e1d07` 和数据库 dump SHA256。
- 隔离恢复到 `rdmsweeklyrestore` 和 `data/weekly-restore-uploads`，恢复后的数据库版本和空记录数与备份相符，`127.0.0.1:18081/api/health/ready` 返回 200，文件一致性检查通过。演练中构建器首次因沙箱无权写 Docker 活动状态失败；获准补全独立项目构建后启动成功，原 `rdms` 项目未被覆盖。
- 根据 9 月 12 日与 19 日两份周报，仅录入实验事实：5 个化合物、5 条实验（3 已完成、2 进行中）、7 个反应步骤、8 个组分；无样品或附件。实际 ID 和来源见忽略目录中的 `backups/weekly-import-20260924.json`。42 mg、403 mg 的 NH₂-4C-FP 批次和 117 mg 的 6HF-4C-FP 批次分开记录；后两条进行中实验未填写不存在的产量或收率。文献与计划未录入。
- 日期字段必填，因此使用 PDF 文件名和创建时间支持的 2026-09-12 / 2026-09-19 作为**周报归档日期**，并在实验中注明不是已确认的实验日期。PDF 内文标题写的是 2025 年，存在年份冲突。原文 `DMC/MeOH`、`bine` 作为待核对字样保留；未推断结构、SMILES、分子式、分子量或不明确的 Br-ester 身份。
- 录入后只读核对默认库为实验 5、化合物 5、反应 7、组分 8、文件 0；文件一致性检查通过。`scripts/check.sh all` 通过：后端 PostgreSQL 29 项、前端 13 项、隔离浏览器 5 项。恢复/切换步骤见 [周报录入回滚说明](docs/weekly-report-import-rollback.md)。

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

### 化合物结构导入增强（2026-09-24）

- 实际修改：新增 RDKit 本机结构解析、MOL/SMILES/CDXML 导入、SVG 结构图、分子式/分子量/精确质量/InChIKey 计算、同结构提醒；通过 Alembic `3a4d8c1e6f20` 增加结构、CAS 与带来源实验性质存储。结构改变时重算派生字段并清除旧结构的 CAS 与性质。化合物列表可搜 CAS，详情显示结构与来源资料。
- 公开资料：只有用户点击查询时才发送 InChIKey。配置密钥后尝试 CAS Common Chemistry 搜索及详情核对；无密钥时仍查询 PubChem，并将 CAS 同义词标为待人工核对。密度等实验值保留原文及来源，用户选择后保存。CAS API 需申请密钥，本机未配置，故其真实密钥调用尚未验收；模拟响应测试已覆盖身份核对与性质来源。
- 隔离验证：`scripts/check.sh all` 退出码 0；Ruff/mypy、独立 PostgreSQL 后端 29 项 pytest、前端 lint/类型/Vitest 10 项及生产构建、隔离 Chromium Playwright 4 项通过。新增测试覆盖 MOL 导入、错误手填派生值被重算、结构替换、CAS 搜索、重复结构、查询仅由显式操作触发及浏览器建档流程。
- 本机联调：更新前默认库版本 `9dd700ef716a`，化合物/实验记录均为 0；`rdms_data.py check --full-hash` 显示引用文件 0 且一致。`docker compose up --build -d` 退出 0，默认库已迁移至 `3a4d8c1e6f20`，db/backend 健康、frontend 仅绑定 `127.0.0.1:8080`，就绪接口和 `/compounds/import` 返回 200。用公开乙醇 InChIKey 实测 PubChem 返回 CID 702、CAS 候选 `64-17-5` 和含温度的密度原文；未将该合成验收数据写入默认库。
- 限制：Chrome/Safari 可能不给网页提供 ChemDraw 普通复制的专有剪贴板内容，此时使用 Copy As → MOL/SMILES 或结构文件；二维结构无法可靠推导实验密度。真实 CAS API 密钥路径需获得密钥后再联调。

### 一键更新修复（2026-09-24）

- 实际故障：用户启用 CAS 密钥后，更新日志显示迁移连接 PostgreSQL 时 `password authentication failed for user "rdms"`；新 `.env` 的 `POSTGRES_PASSWORD` 与 `DATABASE_URL` 彼此一致，但与已初始化数据库卷的原密码不同。旧更新脚本直接执行 `compose up --build -d frontend`，先切换依赖服务，迁移失败后后端停机。
- 恢复：只将本机 `.env` 中两项数据库密码恢复为已通过只读连接测试的现有卷密码，保留用户填写的 CAS 密钥与其他设置，文件权限设为仅当前用户可读写。`docker compose up -d` 后 db/backend 健康、frontend 继续绑定本机回环地址，就绪接口返回 `{"status":"ok"}`；未删除或重建数据库卷。
- 更新器：改为先检查 Docker 与 Compose 配置、构建镜像、在独立一次性容器中以当前配置只读连接现有数据库，全部通过后才启动新服务并等待健康，再检查就绪接口。AppleScript 应用已重新编译；失败弹窗显示明确原因并保留日志。
- 验证：用仅在测试进程中设置的错误 `DATABASE_URL` 运行更新脚本，预检退出 1 且原 backend/db/frontend 保持运行、就绪接口仍返回 200；正常配置运行同脚本退出 0，日志输出本机 URL，服务健康。`/bin/sh -n`、AppleScript 编译/反编译和 `git diff --check` 通过。

### 默认项目重新初始化（2026-09-24）

- 用户明确要求清除试用产生的垃圾数据及已占用编号。只处理默认 Compose 项目 `rdms`，保留代码、`.env` 中的 CAS 密钥和其他隔离验收项目。
- 重置前只读核对：默认库有 3 条 Compound、1 条 NumberCounter；Experiment、Sample、Reaction、FileAsset、Tag 均为 0。上传根 `data/uploads` 的完整哈希检查一致，引用文件、孤立文件、临时残留均为 0。
- 先用 `scripts/rdms_data.py backup` 建立 `backups/pre-reset-20260924-compounds`，再用 `verify` 核对成功标记、数据库 dump 哈希及文件清单；备份迁移版本 `3a4d8c1e6f20`，文件数 0。备份保留在被 Git 忽略的 `backups/` 中，供误操作时恢复。
- 执行：`docker compose down` 不带 `-v`；核对 `rdms_rdms_postgres` 的 Compose 项目标记为 `rdms`、没有容器挂载且上传目录为空后，仅删除该命名卷；随后 `docker compose up -d --wait --no-build` 创建新卷并从空库执行 Alembic 迁移。
- 重置后核对：11 个业务表（含 `number_counter`）全部为 0，Alembic 版本仍为 `3a4d8c1e6f20`；`/api/compounds` 总数 0、Dashboard 三类记录数均为 0、健康接口返回 `ok`，上传完整哈希检查一致且无文件。CAS 密钥配置仍存在，`.env` 权限为 600；backend/db/frontend 均运行，前端仍只绑定回环地址。`scripts/check.sh all` 使用隔离测试库退出码 0，后端 29 项、前端 10 项、浏览器 4 项通过。未在新默认库写入验证记录，编号计数器保持空表。

## 后续每阶段记录模板

### 阶段编号与日期

- 开工回执（不超过 10 行）：目标、执行顺序、最大风险。
- 实际修改：路径与行为变化。
- 检查：命令、退出码、结果摘要；注明测试数据库和存储目录。
- 未完成及限制：不得省略未执行的检查。
- 下一阶段及接手注意事项：明确任务书路径。

### 前端视觉优化（2026-09-24）

- 根据样品、搜索和设置页截图，增加“创建样品”与上一区块之间的留白，并把样品名称和化合物选择区调整为更宽的表单行；备注框保留原有高度。
- 统一记录页面原生下拉框的宽度、高度、边框与焦点样式，使其与相邻输入框对齐。样品列表搜索和回收站类型筛选改为清晰的筛选区块。
- 为总览最近记录、文件列表、样品列表、搜索提示及无结果、回收站空状态加入一致的图标状态卡片；设置页的本机数据与备份说明改为分行信息区。
- `scripts/check.sh all` 最终退出码 0：后端 29 项、前端 10 项、隔离浏览器 4 项通过。已在本机 Chrome 复核样品、搜索和设置页截图，修正视觉复核发现的备注框高度问题，并重新验证。
- 已重建并更新本机运行中的 frontend；`/api/health/ready` 返回 `{"status":"ok"}`。测试使用隔离数据库和临时文件目录，未向默认科研数据库写入合成记录，也未修改原始上传文件。

### 实验反应页重建（2026-09-24）

- 实验详情改以反应记录为首屏主体。每个反应显示底物与产物的二维结构、用量、当量和收率；箭头区呈现试剂、溶剂、温度、时间和气氛。无结构的化合物保留名称及用量提示，支持多个反应、组分编辑和删除。
- 通过 Alembic `6b4f2c9e1d07` 为反应新增可空的后处理与纯化字段，支持创建、更新、清空；固定 Markdown 摘要也包含这两个步骤。实验层的操作、观察、结果和结论收进可展开区域，既有字段及数据不丢失。样品、相关化合物、原始文件和摘要继续可用。
- `scripts/check.sh all` 退出码 0：Ruff、mypy、独立 PostgreSQL 后端 29 项测试、前端 lint/类型/Vitest 10 项/构建、隔离浏览器 5 项通过。浏览器新增用例实际检查结构图、当量、反应条件及处理字段；完整创建与保存闭环通过。
- 更新前只读确认默认库实验、化合物、反应均为 0，版本 `3a4d8c1e6f20`。运行 `scripts/update_rdms.sh` 后 db/backend/frontend 健康，默认库升至 `6b4f2c9e1d07` 且这三类记录仍为 0；新增两列已存在。前端只绑定 `127.0.0.1:8080`，就绪接口和实验新建页返回 200。测试未写入默认库或原始上传目录。

### 化合物质量显示精度（2026-09-24）

- 分子量在结构预览、详情、列表和编辑框中最多显示 2 位小数；精确质量在预览和详情中最多显示 4 位小数。使用零个最小小数位，不补尾零。仅改变页面呈现，原始计算结果和用户录入值继续按现有精度保存；编辑其他字段时不会把格式化值覆盖回数据库。
- `scripts/check.sh all` 退出码 0：后端 29 项、前端 13 项、隔离浏览器 5 项通过。新增单元测试覆盖四舍五入与不足位数不补零，编辑测试覆盖原始分子量保留，浏览器测试覆盖乙醇的预览、详情和列表显示。
- `scripts/update_rdms.sh` 退出码 0，db/backend/frontend 健康，本机服务地址仍为 `127.0.0.1:8080`。本次没有数据库迁移，也没有向默认科研数据库写入测试记录。

### CAS Common Chemistry 授权故障排查（2026-09-26）

- 本机后端已加载配置的 CAS 密钥，并按 `X-API-KEY` 发送；直接向 CAS 搜索接口查询公开乙醇标识及名称均收到 HTTP 401 `Unauthorized`。CAS 响应未说明是密钥过期、撤销还是接口权限未开通，需向 CAS 核对；未记录或输出密钥内容。
- 同一查询的 PubChem 回退正常，返回乙醇 CID 702。后端现在将 CAS 的 401/403 与网络等一般故障区分，页面提示核对密钥有效期和权限；原有 PubChem 回退继续工作。
- `scripts/check.sh all` 退出码 0：后端 30 项、前端 16 项、隔离浏览器 6 项通过。隔离测试容器已由脚本清理。`scripts/update_rdms.sh` 退出码 0，db/backend/frontend 健康；本机公开乙醇只读查询实测返回新提示和 CID 702。未向默认数据库或上传目录写入测试数据。


### 化合物 CAS 编号、系统名称与代号规范（2026-10-01）

- 实际修改：Alembic `b7e1a9302c64` 将旧名称保留为 `codename`、系统名称规范到 `name`，旧 CMP 编号仅内部归档；停止 CMP 分配。列表、详情、搜索、关联选择、重复结构提示、回收站、反应总览和投料表统一使用 CAS / 系统名称 / 代号，实验和样品编号不变。创建/编辑校验 CAS 校验位，未确认者保持空值。
- 资料补全：用户授权联网核查七条已录入结构。五条系统名称匹配 PubChem 完整 InChIKey，另两条从结构命名后经 OPSIN 反向解析验证相同完整 InChIKey；七条名称已写入本机。原四条 CAS 均核对匹配，NH₂-4C-FP 保持盐酸盐。三条 CAS 仍未查到可靠来源，详细证据和名称来源在 `docs/compound-identity.md`；CAS 官方接口拒绝当前密钥，限制已记入 `BLOCKED.md`。
- 数据保护：迁移前备份 `backups/pre-compound-identity-20261001` 的 dump 哈希与成功标记验证通过，备份版本 `8c2d4e6f901a`。迁移与七次带版本号的名称更新后，逐字段比对确认旧名称完整保留，结构、分子式、分子量、CAS、性质、备注、标签与关联均未变化；5 实验、7 化合物、7 反应及全部组分数量不变。前后数据和来源留存备份内 `identity-audit/`，真实上传目录只做完整哈希检查，结果一致。
- 验证：最终 `scripts/check.sh all` 退出码 0（`/tmp/rdms-identity-check-final.log`）；Ruff/mypy、隔离 PostgreSQL 34 项、前端 20 项及 lint/类型/构建、隔离 Chromium 7 项全部通过。新增迁移验证覆盖原名、软删除、版本及引用保留和可降级历史记录；新增 API/浏览器验证覆盖 CAS/代号搜索、保存不改写用量性质及不再出现 CMP。搜索页与反应总览截图已目视检查。
- 交付：`scripts/update_rdms.sh` 退出码 0，本机就绪接口返回 ok，默认库已迁移到 `b7e1a9302c64`；原总览、投料表、多反应及条件布局保留。新增记录没有旧编号时直接迁移降级会拒绝制造 CMP 编号，需要按 README 从迁移前备份做隔离恢复。

## 2026-09-30 周报录入与全库资料检查（2026-10-01）

- 依据用户提供的周报及本次明确确认，862 mg NH₂-4C-FP 更新原 EXP-2026-0005，690 mg Acid-6-HF 更新原 EXP-2026-0004，均转为完成并保留原归档日期；新增 EXP-2026-0006（2026-09-29投料、尚未脱保护）、EXP-2026-0007（HATU缩合低转化率、终产物约30 mg）。误用溴乙酸乙酯批次按用户要求不录入，下周计划不作实验事实录入。
- 保存两步反应、中间体关联、已报告投料/处理/NMR和推测边界。增加4条样品记录：862 mg、690 mg、约30 mg产物及约270 mg含未反应羧酸的回收混合物；注明分离量不是当前库存，回收固体不作为终产物。57%和69%明确为两步总收率。
- 录入前完整备份 `backups/pre-weekly-import-20260930-20261001/` 的 verify 通过；4条受影响实验各附同一来源PDF，逐个下载SHA256与原件相同。录入后全库为7实验、7化合物、11反应、19组分、4样品、4文件、0标签；六类回收站均空。全部7条化合物及EXP-2026-0001–0003完整逐字段未变，受影响实验摘要读回成功。上传目录完整哈希检查一致。
- 全部列表逐页核对后，发现投料表尚缺独立试剂/溶剂记录、四条CAS来源状态与已核验文档不同步、旧备注历史表述未同步、旧NMR/样品记录不完整；CAS三缺项、归档日与真实操作日、DMC/bine、单步收率、中间体量、纯度和低转化原因等需确认。完整问题与证据保存在备份的 `import-audit/findings.md`、`full-after.json`、`writes.json`，本次在对话内汇报；未将缺项猜测成已确认事实。
- `scripts/check.sh all` 最终退出0：隔离PostgreSQL后端34项、前端20项及lint/类型/构建、隔离浏览器7项通过。首次Docker构建状态写入受沙箱限制，获准重跑后通过；测试容器网络自动清理。没有应用代码或数据库schema变更，未向真实科研库写入测试数据。
