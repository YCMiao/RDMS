# RDMS 离线分发版

分发 `dist/RDMS-Demo.zip`，解压后双击其中的 `RDMS-Demo.html`。也可直接发送 HTML 单文件。接收者无需安装运行环境、启动服务器、联网或登录。

界面直接复用正式 React 页面和样式，无附加横幅、导览或演示按钮。示例数据由独立源码生成，不读取正式数据库、账号、上传目录、环境变量或备份。业务修改、上传的 Blob 与外观偏好仅存在当前文档内存，刷新恢复预置数据；多个窗口互不共享。主动下载的附件和摘要属于用户保存的文件，不会自动清理。

可以演示记录本、新建/编辑/复制/移本实验、多反应、投料与规模联动、产物与收率、溶剂、化合物与标签、样品、文件上传下载、搜索、摘要、删除与恢复。预置结构图和派生值由项目 RDKit 从公开简单结构生成；运行时仅支持精确匹配内置 SMILES/MOL（如 `CCO`），未知结构明确报错。CAS 仅匹配内置记录；公开服务查询与密码修改不可用。账号菜单保留正式外观，退出会重置并返回首页。内置附件为虚构文本。

构建：项目根目录运行 `scripts/build-demo.sh`，只使用构建容器，不启动服务。开发机已安装依赖时也可在 `frontend` 运行 `npm run build:demo`，随后按脚本打包。输出均在 `demo/dist/`，不提交构建产物；HTML 内联全部样式、脚本及结构数据，用 HashRouter 支持 `file://` 页面切换，CSP 禁止网络连接，正式构建继续使用登录门禁、BrowserRouter 与原 API。

离线验收（容器不接网络，Chromium 和 WebKit 均直接打开 HTML）：

```sh
docker run --rm --network none --ipc=host \
  -v "$PWD/frontend:/work" -v "$PWD/demo:/demo:ro" -w /work \
  mcr.microsoft.com/playwright:v1.55.1-noble \
  node node_modules/playwright/cli.js test --config playwright.demo.config.ts
```

另按项目约定运行 `RDMS_CHECK_CACHED_DEPS=1 scripts/check.sh all` 验证正式版本。离线测试拒绝访问 localStorage、sessionStorage、IndexedDB 和 CacheStorage，并检查无 HTTP 请求、刷新重置、下载字节、化学结构、复制编号及窄屏布局。
