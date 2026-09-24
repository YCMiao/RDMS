# 阶段 01 工程骨架

你是本阶段执行者。本任务依赖当前工程文件，不依赖此前聊天。先读 PLAN.md、PROGRESS.md、BLOCKED.md，核对实际实现后接续；不要从头重写已完成模块。目标优先级：数据安全与正确性 > 功能闭环 > 易维护 > 速度。

## 前提和约定

- 前置：00 已完成，Docker/Compose 引擎可用；否则不能宣称启动验收通过。
- 必读：PLAN.md、docs/architecture.md、docs/api-contract.md 的通用协议和健康检查、docs/acceptance.md。
- 默认决策：仅本机个人使用，中文界面，Asia/Shanghai；按详细规格实现，不自行加入 AI、多用户或自动科学计算。
- 开工前写不超过 10 行回执：理解的目标、顺序、最大风险。下述验收入口若尚不存在，先按阶段职责建立和亲测，不能把拟定命令说成已运行。

## 修改范围

允许建立 frontend/、backend/、scripts/check.sh、Docker 配置、.env.example、.gitignore、README.md，更新设计和进度文档。禁止写入真实 data/、修改原始 DOCX或开发业务 CRUD。

## 执行步骤

1. 建立前后端分离目录，锁定 Python/Node/PostgreSQL 基线及实际依赖版本；记录每项依赖用途。frontend 用 npm 锁文件，Python 使用可重复安装的锁定依赖清单。
2. Compose 建立 frontend、backend、db 和一次性 migration；数据库健康后迁移，迁移成功再启 backend。frontend 仅绑定 127.0.0.1:8080；其余仅内网。
3. 后端建立配置、Session 生命周期、基础异常响应、请求 ID、live/ready、OpenAPI；Alembic 可运行但暂不建立业务模型。
4. 前端建立布局、路由、主题和 API 客户端；仅显示明确的未实现页面，不伪造科研数据或完成状态。
5. 建立独立测试数据库与临时文件目录，真实后端健康检查测试、前端布局测试；实现 scripts/check.sh 的 backend/frontend 入口和失败传播，e2e 尚未实现时明确非零提示未就绪。
6. README 记录亲测的启动、检查、停止步骤及持久化边界；.env.example 不含真实秘密，.gitignore 排除 .env、data、备份和测试产物。

## 验收

BOOT-01、CHECK-01；亲测 Compose 空环境启动、OpenAPI、健康接口、浏览器布局、端口发布。运行 backend/frontend 检查；故意临时加入失败断言确认非零，再移除并重跑。不能删除真实测试来恢复绿色。

测试场景编号对应 docs/acceptance.md。记录实际命令、退出码和结果；Docker、数据库或测试工具不可用时写清未验证。不得通过 skip、删除测试、放宽断言、整体 mock 核心业务、吞掉退出码或伪造输出达标。新项目允许新增测试和必要脚本，但不能为迁就缺陷悄悄改既定验收要求。

## 断点与阻塞处理

完成一项就更新 PROGRESS.md；环境或规格阻塞写入 BLOCKED.md（证据、影响、已尝试方法、可继续部分）。同一失败三次后换诊断路线或缩小复现；不能反复删除数据。必要设计改动记录 architecture.md 的原因与影响。不要触碰工程外目录或未经授权安装系统工具；不可逆操作停止并记录，不用扩大权限来绕过限制。

## 完成条件

1. 三服务和迁移依赖实际可运行，README 命令亲测，检查入口不是占位；更新进度后停止，下一阶段 02。
2. 修改范围守约，原始 DOCX 和用户数据保持完整；交付真实验证证据、进度与阻塞，不只报告“完成”。本阶段结束即停止，不自动开始下一阶段。
