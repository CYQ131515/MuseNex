# 自动化探针（CDP，无第三方依赖）

这些脚本用 Chrome DevTools Protocol 直连无头 Chrome，对画布做交互级验收。
前置：Node ≥ 22（自带 WebSocket）、本地已启动 `./start.sh`（默认 8099），
以及一个可用 Chromium 的 `--remote-debugging-port=9333` 实例：

```bash
CHROME="$HOME/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
"$CHROME" --headless=new --no-sandbox --disable-gpu --remote-debugging-port=9333 \
  --user-data-dir=/tmp/canvas-profile about:blank &
./start.sh 8099 &

node tests/interactions.mjs   # 平移/缩放/拖拽/框选/连线吸附/剪刀删边/快捷键/撤销
node tests/ui.mjs             # 添加面板/搜索/对齐/编组/右键菜单/整理/主题/PNG
node tests/skin.mjs           # 还原度：左栏尺寸、选中 2px #8f8f8f、+ 按钮 56px、连线吸附、滑杆缩放
node tests/app-level.mjs      # 第二轮自研层：节点管理/收起 chip/连线模糊+流光/批量连线/编组工具条/阅读视图/快捷键/交互模式
node tests/features.mjs       # 节点能力层：生成历史/媒体工具条/颜色调整/标注层/整理画布/重命名/编组执行
node tests/local-tools.mjs    # 参数面板/素材库/媒体预览/持久化 v2（标注+历史）
node tests/jobs.mjs           # 生成队列/图片裁剪/视频精确编辑/全部生成历史
node tests/api.mjs            # APIMart 接入：健康/模型分类/真实文本调用/视频额度确认（RUN_PAID=1 才跑真实图片）
node tests/api-canvas.mjs     # 画布内 API 端到端（真实出图/出文）
node tests/models.mjs         # 模型能力排查/节点智能选模型（免费）
node tests/file-build.mjs     # dist 单文件在 file:// 下可运行
```

`APP_URL` 可覆盖被测地址；`CDP_PORT` 可覆盖调试端口（默认 9333）。
