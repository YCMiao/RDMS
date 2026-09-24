# RDMS 工作约定

- 先读 `README.md`、`PROGRESS.md` 和 `docs/verification.md`；阶段任务书位于 `docs/tasks/`。
- 本项目仅供本机个人使用。保持前端只绑定回环地址，后端与数据库不发布宿主端口；保留 Host 与写入请求 Origin 检查。
- 业务数据库变更使用 Alembic 迁移，不在启动时用 `create_all` 替代迁移。
- 运行 `scripts/check.sh all` 验证后端 PostgreSQL 测试、前端检查及隔离浏览器端到端流程。
- 测试只能使用独立数据库和临时文件目录；不得修改真实上传数据。
- 普通停止不使用 `docker compose down -v`。备份、校验与隔离恢复按 README 和 `docs/data-safety.md` 执行；不得覆盖非空目标。
- 变更完成后更新 `PROGRESS.md`；有真实阻塞时更新 `BLOCKED.md`，不要把计划当作已验收结果。
