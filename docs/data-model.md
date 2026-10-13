# 数据模型与约束

状态：按 2026-10-12 当前 ORM、API 和 Alembic 迁移链校准；业务 API 已实现。字段未特别说明时不能由客户端写入 id、编号、创建时间、删除时间或版本。

## ER 图

```mermaid
erDiagram
  Notebook ||--o{ Experiment : contains
  Experiment ||--o{ ExperimentCompound : links
  Compound ||--o{ ExperimentCompound : links
  Experiment ||--o{ Sample : owns
  Compound o|--o{ Sample : identifies
  Experiment ||--o{ Reaction : owns
  Reaction ||--o{ ReactionComponent : contains
  Compound ||--o{ ReactionComponent : identifies
  Experiment ||--o{ FileAsset : owns
  Sample o|--o{ FileAsset : links
  Experiment ||--o{ ExperimentTag : tagged
  Tag ||--o{ ExperimentTag : labels
  Compound ||--o{ CompoundTag : tagged
  Tag ||--o{ CompoundTag : labels
```

## 通用规则

实体 id 使用 UUID，created_at/updated_at/deleted_at 使用 timestamptz，时间保存 UTC、展示时转换 APP_TIMEZONE。普通业务实体带 version 正整数，创建为 1，任何更新、删除、恢复原子递增。Tag 不做软删除但带 version。关联表不带业务编号。科研数值使用 Numeric(20,8)，JSON 用十进制字符串传递，禁止经过 JavaScript Number 静默损失精度。除温度外数值不得为负；收率可大于 100，以保留原始记录并在 UI 提示复核。

样品编号不可编辑；实验编号仅由新建、跨本转移或恢复流程分配，普通软删除保留原编号与归属，恢复时领取新编号；迁移时已在回收站的旧 EXP 记录清空编号与归属，旧编号永不重新发行。普通文本去除首尾空白，保留内部换行；普通手填 SMILES 保留文本检索语义；结构导入路径由 RDKit 解析并生成规范化资料。实验标题非空；化合物系统名称可空，身份资料规则见 [化合物身份规范](compound-identity.md)。备注和长文本允许空。外键限制物理删除，唯纯关联表可随标签删除清理。

## 实体字段

### Notebook

id 为 UUID；code 唯一固定（NB001 等），name 非空，description 可空，archived 默认 false，next_number 保存本内下一序号，version 和时间戳用于并发更新。记录本可归档，不提供删除接口。编号、移动及恢复规则见 [实验记录本](notebooks.md)。

### Experiment

- experiment_code：有效实验唯一自动编号（NB001-0001）；notebook_id、notebook_number 为所属记录本与本内序号，有效实验必须齐全；迁移时已删除的旧记录可为空。title 非空，最多 300 字符。
- date：必填 date；objective、procedure、observation、result、conclusion：可空 text，每项上限 100000 字符；notes 为统一备注，上限 500000 字符。旧四分类正文仍保留，统一备注为空字符串时不回填旧正文。
- status：draft / in_progress / completed / cancelled，默认 draft；允许任意状态间切换，不设签署或不可逆完成流程。
- 具备通用时间戳、version、deleted_at；title/code 用于文本检索，date/id 用于稳定排序。

### Compound

- name 为可空系统名称，codename 为可空原名或实验代号，均最多 300 字符；cas_number 可空、非唯一，校验格式和校验位；legacy_compound_code 仅内部归档，不再分配或对外返回 CMP 编号。
- smiles 最多 10000 字符，molecular_formula 最多 200 字符；molecular_weight 为可空正数 Numeric(20,8)，单位 g/mol；notes 可空。
- structure_molfile、inchi_key、exact_mass 保存结构及派生信息；cas_source、physical_properties（JSONB）保存核对来源与实验性质。结构导入经 RDKit 解析，替换结构清理旧身份资料。
- UUID 是关联身份；同名、相同 SMILES 或 CAS 不设唯一约束，不自动合并。具备软删除与版本。详见 [身份规范](compound-identity.md)。

### ExperimentCompound

experiment_id、compound_id 组成复合主键，created_at；不承载当量、剂量等反应信息。关联和解除仅影响显式关系，不移除通过 Sample 或 ReactionComponent 形成的关系。

### Sample

- sample_code：唯一自动编号；name：可空，最多 300 字符；experiment_id：必填且创建后不可迁移到另一实验。
- compound_id：可空；sample_type：非空，最多 100 字符，自由文本。
- amount 与 unit 同时为空或同时填写；unit 最多 50 字符，允许用户科研单位文本。
- concentration 与 concentration_unit 同时为空或同时填写；notes：可空。
- 包含软删除和版本。compound_id 可编辑，但不得引用无效化合物。

### Reaction

experiment_id 必填且不可变；reaction_name 非空、最多 300 字符；sort_order 保存反应顺序。温度 temperature_c / temperature_k / temperature_description 三选一，时间 reaction_time_hours / reaction_time_minutes / reaction_time_description 三选一，均可不填；数值时间和 K 非负。atmosphere、solvent 可空、最多 300 字符；workup、purification、notes 可空。含软删除和版本。solvent 是条件描述，ReactionComponent 中的 solvent 用于定量记录，两者不自动相互覆盖。

### ReactionComponent

reaction_id、compound_id 必填；role 为 substrate / reagent / catalyst / ligand / base / solvent / additive / product。amount 和 unit 成对可空；mmol、equivalents、yield_percent 可空且非负。yield_percent 仅 product 可填。is_limiting 在数据库/API 层限非产物角色；当前 UI 仅在反应物编辑中提供；同反应最多一个有效限制反应物且 equivalents=1。stoichiometric_ratio 为产物正计量比；计算与旧值保留规则见 [投料表](reactant-table.md)。sort_order 为非负整数，默认追加到末尾；notes 可空。含软删除和版本，不对 reaction/compound/role 组合去重，以允许分次加料。未给数量的组分允许保存，界面显示“未记录”。

### FileAsset

experiment_id 必填；sample_id 可空且必须属于同一实验；original_filename 保留上传文件原名，最多 255 字符，拒绝 NUL/控制字符和路径分隔符；filename 为服务端 UUID 文件名；file_path 为相对 UPLOAD_ROOT 的存储键，禁止输出给客户端；file_type 为规范化类型；file_size 为 bigint；sha256 为 64 位小写十六进制；instrument_type 为可空自由文本；uploaded_at 为服务端时间；notes 可空。具备通用版本、软删除。普通 PATCH 仅允许 sample_id、instrument_type、notes；二进制内容永不覆盖，替换需新建 FileAsset。

### Tag 和关联表

Tag：id、name（非空最多 50 字符）、normalized_name（去首尾空白并 Unicode casefold 后唯一）、created_at、updated_at、version。ExperimentTag/CompoundTag 分别采用对象 ID 与 tag_id 复合主键。标签是分类，不承载权限。删除标签永久删除分类及其关联，绝不删除实验或化合物；UI 明示。

### NumberCounter

namespace、year、next_value 保存历史计数及样品计数。当前样品按 APP_TIMEZONE 创建年份分配 SMP-YYYY-000001；记录本代号使用 PostgreSQL notebook_code_seq 序列，本内实验号由 Notebook.next_number 分配，跨年不重置；CMP 与旧 EXP 不再用于新建业务记录。样品与本内实验取号与业务插入同事务，失败可回滚；记录本代号的 PostgreSQL sequence 取号不随事务回滚，允许跳号。已提交编号不复用；显示宽度无硬性上限。

## 可见性、删除及并发

有效 Sample 要求自身和所属 Experiment 均未删除；Reaction 同理；ReactionComponent 还要求 Reaction 有效；FileAsset 要求自身和 Experiment 有效，Sample 删除不影响文件从实验访问。所有列表、详情、搜索、统计、下载共用这些规则。

删除 Experiment 只标记父记录，不能批量改写子记录 deleted_at；恢复保留子记录原先删除状态。Reaction 同理处理组分。单独恢复子记录要求父对象有效，否则 409。被有效 Sample、有效 ReactionComponent、有效 ExperimentCompound 引用的 Compound 不能软删除；恢复任何对象前也要确认其指向的 Compound 有效，否则 409 并提示先恢复化合物。

写入采用 version 条件更新；引用检查与删除使用同一事务，锁定被引用父行，避免并发“检查未引用 → 新建引用 → 删除”的竞态。按 Experiment → Reaction → Compound（UUID 排序）→ Sample → FileAsset 的固定顺序取锁；一次事务只获取实际涉及的锁。

## 查询与迁移

化合物参与实验的结果取显式关联、有效样品、有效反应组分的并集，以 experiment_id 去重，返回来源集合 explicit/sample/reaction。化合物详情分别列出分页 experiments、reactions、samples。关系查询按有效记录规则过滤，不能依赖前端隐藏已删除数据。

索引：唯一业务编号、全部外键、实验 date/id、文件 uploaded_at/id、deleted_at 和关系联查组合索引。MVP 子串搜索使用参数化 ILIKE 并转义通配符；不引入搜索引擎，不宣称普通 B-tree 加速任意子串。

所有 schema 修改通过 Alembic；测试从空 PostgreSQL 升级到 head。生产不自动 downgrade，不在已有数据上重建初始迁移。自动生成迁移必须人工检查类型、约束和数据兼容性。

## 账号与数据归属

迁移 `7d3a1b9c602e` 增加 Account、LoginSession、AuthRate；Notebook、Experiment、Compound、Sample、Reaction、ReactionComponent、FileAsset、Tag 增加 owner_id。首个注册事务接收所有无归属历史数据，后续账号独立。Tag normalized_name 按 owner_id 唯一；关联表通过父实体行级策略限制访问。原全局编号不重写。归属不允许通过业务请求修改，详情见 [账号说明](authentication.md)。
