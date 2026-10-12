# 当前进度

## 上线前工程审计（2026-10-12）

- 审计起点：`main` / `48c4d74`，工作区原先干净，只有一个工作树，无远端配置。阶段 00–08 及后续功能已实现；运行与维护从 [README](README.md) 开始。
- 正式功能包括实验记录本、复制与移本、化合物结构/CAS、样品、反应/投料/产物/溶剂、文件、搜索、摘要、回收站、手动备份恢复；首页已使用粒子圆盘、左侧导航和全局外观。
- 本次分离后端 `runtime` / `test` 镜像阶段，正式镜像排除测试文件及 pytest、Ruff、mypy、httpx；完整测试源码和维护入口保留。开发前端绑定地址收紧为 `127.0.0.1`。
- 修正架构、数据模型、接口、界面、投料、恢复说明的过期说法；历史任务书明确标为已完成。精简 PLAN、BLOCKED、PROGRESS 和验收流水账，历史由 Git 保留。
- 当前服务只读核验：正式前端 `127.0.0.1:8080`，db/backend 无宿主发布端口；页面与核心列表 API、live/ready 均 200，非法 Host 与跨站 Origin 请求均 403。运行数据库与源码 head 均为 `b8e1f3c605ad`。
- 真实原件只读完整哈希检查：5 个数据库引用文件全部一致，无缺失/哈希不符/临时残留；发现 2 个 Finder `.DS_Store` 孤立元数据文件，未处理。
- 首轮检查发现 10 项高危开发依赖提示：更新 typescript-eslint 至 8.71.1、source-map-js 至 1.2.2，移除受影响的旧传递依赖链。最终 `RDMS_CHECK_CACHED_DEPS=1 scripts/check.sh all` 退出 0：后端 63、前端 38、浏览器 23 项，npm 安装审计 0 vulnerabilities；日志 `/tmp/rdms-release-audit-final.log`。Compose 配置、脚本语法、相对文档链接及 diff 空白检查通过。
- 精简镜像尚未切换至正式服务；本次不执行真实库迁移、备份停服或科研资料写入。用户在报告后明确确认“执行ABCD”；已删除约 113.7 MB 缓存、测试产物、独立原型、历史任务包和工程元数据，保留依据见 [上线前审计](docs/release-audit.md)。独立 18082 预览已停止，正式服务未切换。清理后 `RDMS_CHECK_CACHED_DEPS=1 scripts/check.sh all` 退出 0：后端 63、前端 38、浏览器 23 项通过；日志 `/tmp/rdms-post-cleanup-check.log`。已再次清除本轮生成的 A 类缓存和测试产物，复核清理目标均不存在。正式服务健康、原件哈希一致，文档链接及删除范围核对通过。

## 维护与回退边界

- 业务迁移保留完整链；应用启动由 migration 执行 `alembic upgrade head`，不得重建已有数据库。
- 当前 head：`b8e1f3c605ad`（记录本）。恢复工具要求备份 revision 与所用代码 head 完全一致；旧备份先在匹配代码版本中隔离恢复，不能只回退代码。
- 记录本迁移前备份 `backups/pre-notebooks-20261011`、代码 `78b99ea`；统一备注迁移前备份 `backups/pre-unified-notes-20261011`、代码 `a45b387`。这些为历史回退索引，本次未重新演练恢复。
- 新首页接入前代码 `67591b2`；本次审计前完整工程及历史凭证为 `48c4d74`。功能回退与数据恢复是不同操作，按 [数据安全](docs/data-safety.md) 判断。
- 外部 CAS 凭据/资料限制见 [BLOCKED](BLOCKED.md)，本次不重新联网核实。

## 更新入口调整（2026-10-12）

- 按用户意见移除 Finder 中的“更新 RDMS.app”控件；README 改为使用 `docker compose up --build -d` 更新。底层更新脚本保留，未改动运行服务或数据。
- 尚未重新执行完整检查；本次仅删除桌面应用包并核对 README 操作说明。

## 历史检索

2026-09-22 至 2026-10-12 的完整开发、部署、数据维护授权及验收记录已提交到 Git，避免现役入口重复保留 634 行会话流水账：

```sh
git show 48c4d74:PROGRESS.md
git show 48c4d74:BLOCKED.md
git show 48c4d74:docs/verification.md
```

历史 `/tmp` 日志和测试截图是可再生成证据，可能已被重跑覆盖；旧记录中的“当前”“下一阶段”仅适用于当时。原始需求 `prompt0922.docx` 保留，SHA256 为 `711adf58248533f75ff40375fcc5374b71732073a143ac1cd44e6079ced10be9`。

后续更新本文件时，只记录实际变更、检查结果、部署状态和未闭合事项；详细机制就地更新对应 docs，历史过程由 Git 保存。
