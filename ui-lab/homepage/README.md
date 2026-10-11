# RDMS 首页视觉演示区

独立静态原型：空间与粒子主题。正式前端、数据库、上传文件与现有 8080 服务均不参与此演示。

## 启动 / 停止

在 RDMS 根目录运行：

```sh
docker compose -f ui-lab/homepage/compose.yml up -d
docker compose -f ui-lab/homepage/compose.yml down
```

macOS 若找不到 docker，使用 `/Applications/Docker.app/Contents/Resources/bin/docker`。

访问 http://127.0.0.1:18082 。文件只读挂载，修改 `site/` 后刷新即可；无需安装依赖、重建正式前端或迁移数据库。不要对本目录运行正式项目的部署命令。

## 边界

- 独立 Compose 项目 `rdms-home-studio`，仅发布回环地址 18082；只挂载此目录静态资源，不包含生产数据或 .env。
- 仅 GET/HEAD，校验 Host；无写入接口，无 API 代理。CSP 禁止连接其他服务和加载第三方资源。
- 顶部导航和“进入实验室”在新标签页打开正式 8080 对应页面；演示页自身不读取真实数据。
- 动画为本地 Canvas 2D，无外部字体、图库或网络依赖。30fps 上限、像素比限制、后台暂停；支持手动暂停及系统减少动态效果。
- 页面默认为深色，可切换浅色；主题偏好只保存在此端口的独立 localStorage 中。
- 尚未替换正式首页。接入正式 React 页面前需由用户确认视觉方案。

`tests/preview.spec.cjs` 验证页面导航、暂停、主题、减少动态效果、窄屏与隔离边界；截图保存在被忽略的 `test-results/`。
