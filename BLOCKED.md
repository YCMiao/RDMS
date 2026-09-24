# 阻塞与待处理事项

## 当前记录

当前无未解决阻塞。阶段 00–08 已通过必需验收；完整索引见 `docs/verification.md`。Git 仓库尚无提交，交付文件保持未跟踪，属版本控制交接事项，不影响现有运行或测试。

### ST03-001 前端镜像构建网络中断（已解决）

- 发现日期：2026-09-23。首次执行 `docker compose up --build -d` 时，前端 Dockerfile 的 `npm ci` 报 `ECONNRESET`，该命令退出 1；后端和前端独立检查均已通过。
- 影响与处置：使用已通过的 Vite 生产产物临时组装本机前端镜像继续只读联调，未改数据库卷或用户数据。网络恢复后按原 Dockerfile 运行 `docker compose build frontend` 退出 0，随后标准 `docker compose up --build -d` 退出 0；运行接口健康及业务列表只读请求成功。临时镜像已由标准镜像替换。
- 当前状态：不再阻塞阶段 03。若未来再次出现 npm 下载错误，先检查网络或重试构建，不需要更改数据库或安装系统工具。

### ENV-001 Docker 可用性（已解决）

- 历史证据：规划时运行 `docker --version` 与 `docker compose version` 均返回 `command not found`。
- 解决证据：用户完成设置后，应用内 CLI 返回 Docker 29.8.0、Compose v5.5.1，context 为 desktop-linux。获准在沙箱外运行只读 `docker info --format 'Server={{.ServerVersion}} OS={{.OSType}} Architecture={{.Architecture}}'`，退出码 0，输出 `Server=29.8.0 OS=linux Architecture=aarch64`。
- 路径说明：用户命令已安装在 `/Users/yuchensmacbookair/.docker/bin/docker`，链接至应用内 CLI。当前代理会话 PATH 尚未包含该目录；后续模型可用绝对路径 `/Applications/Docker.app/Contents/Resources/bin/docker`，或仅为当前 shell 加入用户命令目录，无需重新安装。
- 权限说明：沙箱内连接用户 Docker socket 返回 permission denied；这不代表引擎故障。后续需要连接引擎的操作仍应遵循各自环境的权限规则。
- 验证边界：只确认 CLI、Compose 插件和引擎响应；未拉取镜像、创建容器或验证项目启动、PostgreSQL 测试与备份还原。
- 下一步：阶段 00 已完成；进入阶段 01 时无需再次要求用户安装或首次启动 Docker。

阶段 00 已于 2026-09-22 完成复核：CLI 29.8.0、Compose v5.5.1、context desktop-linux；沙箱外只读 `docker info` 再次退出码 0，输出 `Server=29.8.0 OS=linux Architecture=aarch64`。后续无需再把 ENV-001 当作未解决问题。

### 阶段 01 已处理事项

- 已初始化本地 Git main 分支，并建立 `.gitignore`；`.env`、`data/`、上传、备份、依赖和测试产物均被排除。当前没有创建提交或远程。
- Docker Hub 获取 Python 和 nginx 镜像时各出现一次 OAuth 超时；缩小为单镜像拉取后均成功，最终 Compose 构建与启动通过，不是当前阻塞。
- npm 10 在解析 Vitest 4.1.11 的可选 peer dependency 时出现已知 Arborist `Cannot read properties of null (reading 'edgesOut')`。改用 npm 11 在隔离目录生成 lockfile后，Node 22/npm 10 的 `npm ci`、测试和生产构建全部通过，npm audit 为 0 vulnerabilities。此项已解决。
- 后端测试显示 Starlette 对 anyio 旧别名的一条弃用警告，前端安装显示 ESLint 9.35.0 生命周期提示；两者不影响当前运行或检查。后续正常依赖维护时升级，阶段 01 不为消除提示盲目追新。
- 当前服务保持运行，仅 `127.0.0.1:8080` 对宿主开放。普通 `docker compose down`/`up -d` 已验证不会删除数据库卷；不要使用 `down -v` 作为常规停止方式。

以上为阶段 00–01 的历史记录；应用开发现已推进至阶段 03。

## 后续记录格式

问题 ID、发现日期、具体证据、影响范围、已尝试方法、可继续部分、解除条件。解决后保留记录并标明解决证据；没有剩余阻塞时明确写“当前无未解决阻塞”。
