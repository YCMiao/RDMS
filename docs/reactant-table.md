# 反应物投料表（2026-09-30）

## 展示与交互

一个实验保留多个独立反应。每个反应按“反应总览 → 反应物与投料 → 产物与收率 → 条件与处理”排列；默认显示总览和投料表，新增和编辑共用按需展开的录入区。表头固定为名称（系统命名）、化学式、CAS、Mw (g/mol)、eq、mmol、mg、mL，投料表不要求结构式；产物与收率在独立区域录入。反应总览保留底物与产物结构图、辅助试剂、反应条件及已有收率；没有结构时显示名称和已有化学式。总览读取全部组分，不受投料表分页或产物过滤影响，新增与编辑投料后自动刷新。已有 product 记录会显示在产物表并可编辑，原 API、摘要与回收站继续读取。产物录入复用组分 API 的 product 角色，保存后同步刷新总览；不会参与反应物 eq 基准或自动推算收率，也不自动创建样品。

参考 Revvity 官方的 [Reactants table 说明](https://support.revvitysignals.com/hc/en-us/articles/21175049180308-Learn-about-the-Reactants-table-of-the-Stoichiometry-grid-in-Signals) 中按试剂行组织身份和计量数据的形式。本次只实现本机个人记录需要的投料表，不包含库存、限量试剂联动或计划投料列。

## 查询与数据

- `POST /api/compounds/cas/lookup` 校验 CAS 格式及校验位，精确检索有效本机化合物。本机命中不访问外部服务；无匹配时使用 PubChem 固定域名请求。
- PubChem 属性查询取 IUPACName、MolecularFormula、MolecularWeight；再次核对同一 CID 的 CAS 同义词。多个候选需要人工选择。PubChem 同义词匹配不是 CAS 官方认证，来源会明确显示和保存。
- 查询只读，500 ms 防抖，旧请求结果不覆盖新输入；失败提示支持重试、本机选择和手动录入。没有资料时不推断名称或分子量。
- 系统名称使用 `compound.name`，原有名称保留为 `codename`；以 CAS 编号，不再生成 CMP 编号。Alembic `b7e1a9302c64` 承接原 `iupac_name` 字段并保留旧资料，详见 [身份规范](compound-identity.md)。替换成不同结构时清理旧系统名称和 CAS。
- `GET /api/reactions/{id}/components?reactants_only=true` 在数据库查询阶段排除产物，计数与分页一致。省略参数保持旧行为。
- 投料保存沿用十进制字符串和版本冲突检查；mg/mmol 补全按 Mw 计算，最多保留数据库支持的八位小数。mL 不自动推算 mmol。同一反应按最早保存的有效正数 mmol/eq 作为基准（排除正在编辑的行），输入 eq 或 mmol 后离开输入框自动换算另一项；按 Mw 补全 mmol 时也补全空白 eq。没有基准时手动填写首组，两项为零或缺失的记录不作为基准。

## 验证位置

- 后端：`backend/tests/test_compound_chemistry.py` 覆盖只读查询、精确匹配、软删除排除、非法 CAS、系统名称保存与搜索、CID/CAS 同义词核对和离线降级。
- 后端：`backend/tests/test_stage04_lab.py` 覆盖投料过滤、计数及历史产物保留。
- 前端：`frontend/src/features/reactant-editor.test.tsx` 覆盖公开候选保存、CAS 请求竞态、多候选选择、液体不换算、失败保留输入及重试不重复建档。
- 浏览器：`frontend/e2e/workflow.spec.ts` 验证本机 CAS 添加、表格列和顺序、展开/收起、编辑与刷新后精度、多反应、投料表隐藏产物、独立产物入口新增/编辑/删除与恢复、用量和收率精度保存，以及窄屏不产生页面横向溢出。自动化测试只使用隔离数据库和临时文件。
