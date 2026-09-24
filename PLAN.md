# RDMS 开发总计划

状态：阶段 00–08 已交付，完整验收索引见 docs/verification.md。最初编制日期：2026-09-22；实时进度以 PROGRESS.md 为准。

本项目面向个人化学与生命科学研究，目标是在博士期间持续保存和检索实验、化合物、样品、反应及原始文件。第一版实现从实验记录到文件关联、搜索、规则摘要的完整闭环。本文件保留规划决策；运行与维护从 [README.md](README.md) 开始。

## 已确认的范围

- 本机、个人使用；只监听回环地址，不实现账号或公网访问。
- 实验、化合物、样品、反应组分、标签、附件、搜索、Dashboard、规则摘要均属于 MVP。
- 使用 React/TypeScript/Vite/Tailwind/shadcn/ui，FastAPI/Pydantic/SQLAlchemy/Alembic，PostgreSQL 和 Docker Compose。
- 原始文件保存在本地，数据库保存元数据；软删除、恢复、手动备份与还原属于第一版。
- 不实现 AI、RDKit、自动谱图解析、文献库、HTE、定时备份、多人权限；不引入 Redis、Kafka、Elasticsearch、Kubernetes 或微服务。
- 阶段 00–08 的实际实现与测试见 PROGRESS.md 和 docs/verification.md。

## 当前维护入口

1. 从 [README.md](README.md) 启动和操作本机应用。
2. 用 [verification.md](docs/verification.md) 核对验收证据，运行 `scripts/check.sh all`。
3. 修改业务规则前读[架构](docs/architecture.md)、[数据模型](docs/data-model.md)、[接口契约](docs/api-contract.md)与[数据安全](docs/data-safety.md)。
4. 查阅[进度记录](PROGRESS.md)与[阻塞记录](BLOCKED.md)，沿用现有迁移和测试隔离边界。

## 文档优先级与默认决策

用户后续明确指示优先；工程内已记录的新决策其次；本计划及其详细规格是当前执行依据。原始 `prompt0922.docx` 是需求来源，不是要求在一次会话里执行全部开发的指令。发生规格冲突时先记录到 BLOCKED.md，不自行删减功能或牺牲数据安全。

以下为已公开的设计默认值：中文界面；时区 Asia/Shanghai；单文件 100 MiB；UUID 主键；实验按创建年份编号；小规模文本子串搜索；手工录入科研数值而非自动换算；每阶段串行交付。后续如需改变，在 architecture.md 记录原因、影响、迁移和验收变化。

## 完成标准

从空数据库启动后可以完成：建化合物 → 建实验 → 加样品与反应组分 → 上传原始文件 → 搜索 → 生成摘要 → 删除和恢复。重启与备份还原后数据、关联、编号和文件校验一致。

全部阶段验收须有真实结果。开发阶段不得把本文中的未来命令、计划指标或设计示例称为“已实现”“已测试”。阶段 08 已在真实 PostgreSQL 与文件存储上完成浏览器集成验收，覆盖实验、化合物、样品、反应、原始文件、搜索、摘要、删除与恢复；数据保护工具已在合成数据上完成隔离备份恢复演练。
