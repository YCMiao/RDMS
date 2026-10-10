# 2026-09-24 周报录入的回滚点

本次录入前的完整数据备份位于 `backups/pre-weekly-import-20260924-2330/`，录入明细和 ID 位于 `backups/weekly-import-20260924.json`。备份已通过 `verify` 并在独立 Compose 项目中实际恢复；备份时默认库的实验、化合物、反应、组分、样品和文件记录均为 0。备份清单记录代码指纹及 Alembic 版本，开工时的 Git 提交为 `74d1c0aa82327f1d62a1edc14fd826ae2b1e6a15`。

如果决定撤销**全部**本次录入，并回到备份时的空白数据状态，先检查备份，再停止当前应用的前端与后端，最后把备份恢复到**全新**项目并占用原本机端口。以下命令应在项目根目录执行；`rdmsrollback0924` 项目名和 `data/rollback-uploads-0924` 目录必须尚未使用，避免覆盖其他数据。

```sh
python3 scripts/rdms_data.py verify --backup ./backups/pre-weekly-import-20260924-2330
docker compose stop frontend backend
python3 scripts/rdms_data.py restore \
  --backup ./backups/pre-weekly-import-20260924-2330 \
  --target-project rdmsrollback0924 \
  --target-upload-root ./data/rollback-uploads-0924 \
  --port 8080
curl --fail http://127.0.0.1:8080/api/health/ready
python3 scripts/rdms_data.py check --project rdmsrollback0924 \
  --upload-root ./data/rollback-uploads-0924 --full-hash
```

恢复成功后，`127.0.0.1:8080` 指向备份时的空白数据库；原 `rdms` 数据库卷和上传目录暂时保留，便于核对和再次挽回。不要直接对原项目运行 `down -v`，也不要将备份恢复到非空目标。若恢复未成功，可用 `docker compose up -d backend frontend` 重新启动原应用。确认新项目符合要求后，再决定是否单独清理旧项目和旧数据；清理不是切换到备份所必需的步骤。

周报 PDF 内文标题年份为 2025，文件名和 PDF 创建时间为 2026；本次记录的 `date` 是周报归档日期，不应作为已核实的实验操作日。若之后得到实验日志中的准确日期，可以在 RDMS 中逐条更正。
