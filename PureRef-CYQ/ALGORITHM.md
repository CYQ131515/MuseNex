# 参考板工作区 · 代码与算法说明

渲染层为原生 JS（无框架），按职责拆分为：

| 文件 | 职责 | 关键算法 |
| --- | --- | --- |
| `renderer/store.js` | 场景模型、图片加载、撤销栈、排列/对齐/统一、`.prcyq` 序列化 | 场景快照撤销（JSON 快照 + 上限）；`packItems` 基于内容面积推导目标行宽；`normalizeSelected` 五种归一化；容器 = 魔数 + JSON 头（绝对偏移） + 图片二进制段 |
| `renderer/render.js` | 相机、画布绘制、便签 DOM、选中框、裁剪 UI | 视口变换 `screen = world*zoom + cam`；指针锚定缩放 `cam' = p - (p-cam)*(z'/z)`；旋转矩形命中检测用逆旋转；网格自适应步长（`step*z >= 14`） |
| `renderer/interact.js` | 指针/键盘/滚轮/拖放、无边框窗口 | 手势状态机（pan / marquee / move / rotate / scale / flip / opacity / crop / draw / pick / resize-window）；邻居吸附 6px 容差 + 参考线；⇧ 轴向约束 |
| `renderer/ui.js` | 工具栏、设置、对话框、导出、层级、命令面板、工作区桥 | 导出时用离屏 canvas 重绘；便签导出为「HTML → 文本 run → Canvas 排版」的降级渲染；设置项由描述表驱动 |
| `renderer/i18n.js` | 动作表（id/中英文/默认快捷键/分组） | 快捷键字符串规范化（Alt→Mod→Ctrl→Shift）后查表分发 |

数据与状态：

- 撤销：每次修改前 `pushUndo()` 存 JSON 快照（图片位图不重复存），默认 200 步，连续拖动只在开始时入栈。
- 父子/分组：item 使用世界坐标 + `parentId`，组包围盒由子项并集实时计算；组锁定后点选自动上浮到组。
- 保存：`PRCYQ1\n` + JSON 头 + 图片段；临时文件 + rename 原子写；自动保存到 `autosave.prcyq`。
- 工作区桥：`shell/preload-main.js` 暴露 `window.musenex`，与外壳通过 IPC 通信；工作区列表由根目录 `muse.config.json` 驱动。

扩展约定：

1. 新增画布功能：优先在 `store.js` 增模型/算法，`ui.js` 加动作，`i18n.js` 注册快捷键。
2. 新增工作区：在 `muse.config.json` 加条目 + 新目录；如需要图片互通，实现 `__museAddImages` / `__musePullSelected` 并在 manifest 声明 `capabilities`。
