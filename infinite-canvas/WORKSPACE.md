# 无限画布工作区 · 代码与算法说明

本目录是「无限画布」的完整工程（逆向 runninghub 画布后的重建），MuseNex 直接加载其单文件构建产物：

- 运行入口：`dist/infinite-canvas.html`（单文件，样式/脚本全部内联）
- 源码：`src/`
  - `canvas.js`：React Flow 风格的画布引擎（节点、边、贝塞尔连线 curvature 0.25、框选、吸附、端口、缩放手柄、小地图、标注层）
  - `viewport.js`：视口变换与滚轮/触控板分类
  - `store.js`：文档模型（nodes/edges/selection）、撤销事务、节点工厂 `createNode`
  - `ui.js`：工具栏、添加面板、节点管理器、媒体预览、参数面板、导出
  - `api.js` + `model-catalog.js`：APIMart 模型分类与生成任务
  - `main.js`：启动、全局快捷键、粘贴/拖放、调试句柄 `window.__canvas`
- 服务端：`server.mjs`（本地静态站点 + APIMart 代理；MuseNex 已把代理内置到 `shell/main.js`，无需单独启动）
- 构建：`node build.mjs` → `dist/infinite-canvas.html`；更新后复制覆盖到本目录 dist 并重新执行 MuseNex 的 `scripts/build-app.mjs`
- 测试：`tests/`

与 MuseNex 的桥接（由 `shell/preload-view.js` 注入）：

- `window.__museAddImages(items)`：参考板发来的图片 → 构造 `File` → 触发画布 `drop-files`，生成图片节点
- `window.__musePullSelected()`：读取选中节点 `data.media` → dataURL → 交给参考板
- `window.__museSetTheme(theme)`：同步暗/亮主题

数据：画布文档保存在浏览器 localStorage（自定义协议 `musenex://canvas/` 的稳定 origin 下）；
迁移旧数据请用画布菜单「导出画布 JSON」→ 在 MuseNex 画布中导入。
