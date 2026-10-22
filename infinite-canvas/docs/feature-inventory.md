# 无限画布 · 全量功能逆向清单

> 目标：`runninghub.cn/project` 无限画布（React Flow 12 + 自研应用层）。
> 方法：静态提取主 bundle（10.9MB）、CanvasEditorShell、两个 CSS，共提取 `canvas.*` i18n **3331 条**、294 个功能分组。
> 状态口径：✅ 已本地实现；🟡 部分实现；🔴 未实现；⛔ 按要求不实现（账号/云端付费）。

**总计：3331 条 key / 294 个分组。** 下表按 key 数量排序，覆盖前 70 个分组（占 92% 文本量），其余分组多为具体业务节点内部文案。

| 分组 | key 数 | 状态 | 说明 |
| --- | ---: | --- | --- |
| `nodeConfig` | 818 | 🟡 部分实现 | 图片/视频/音频/LLM 参数已接 APIMart 真实模型；其余业务节点专属面板未做 |
| `videoRemakeNode` | 258 | 🟡 部分实现 | 视频生成已接真实 API（Seedance 等），翻拍业务编排未做 |
| `scriptNode` | 203 | 🟡 部分实现 | 文本编辑；分镜/表格/Agent 生成未做 |
| `imageToolbar` | 163 | 🟡 部分实现 | 已做下载/复制/翻转/旋转/调整/裁剪/历史/信息/标注；抠图/扩图/局部重绘需模型服务 |
| `scriptAgent` | 113 | 🟡 部分实现 | 文本/LLM 节点已接真实 chat API；剧本 Agent 多步编排未做 |
| `audioNode` | 100 | 🟡 部分实现 | TTS 已接真实 API（alloy/echo/…）；音乐/歌词/音色库未做 |
| `home` | 88 | ⛔ 不实现 | 站点首页/作品广场 |
| `assetLibrary` | 87 | ✅ 已实现（本地版） | 本地素材库：分类/搜索/缩略图/拖入画布/批量下载；云端文件夹与团队资产未做 |
| `videoNode` | 86 | 🟡 部分实现 | 视频节点 + 真实 API 生成 + 精确编辑；多视频输出/高级参数未做 |
| `agent` | 63 | 🔴 未实现 |  |
| `nodeManager` | 63 | ✅ 已实现 | 节点管理：列表/网格、搜索、全选、批量删除/下载、展开收起、重命名 |
| `quickCreate` | 60 | 🔴 未实现 | 快速创建入口 |
| `videoParams` | 60 | ✅ 已实现 | 视频参数 + 精确编辑（矩形/画笔/箭头/文字/橡皮/标记、撤销重做、颜色、加入提示词） |
| `styleLibrary` | 53 | 🔴 未实现 | 风格库 |
| `portraitQuality` | 47 | 🔴 未实现 | 人像质量参数 |
| `aiApp` | 43 | 🔴 未实现 |  |
| `modelConfigParams` | 40 | 🔴 未实现 | 模型参数编排 |
| `textNode` | 40 | ✅ 已实现 | 文本节点编辑 |
| `assetLibraryModal` | 37 | 🔴 未实现 |  |
| `presetPicker` | 34 | 🔴 未实现 | 预设选择器 |
| `videoAnalysisNode` | 30 | 🔴 未实现 | 视频分析节点 |
| `videoComposeNode` | 29 | 🔴 未实现 | 视频合成节点 |
| `remakeRequestNode` | 28 | 🔴 未实现 | 翻拍请求节点 |
| `quickCutNode` | 24 | 🔴 未实现 | 快剪节点 |
| `accountPanel` | 23 | ⛔ 不实现 | 账号/登录/充值，按要求不碰 |
| `contextMenu` | 22 | ✅ 已实现 | 右键菜单：重命名/复制/粘贴/删除/置顶/断开/历史/媒体信息/复制图片/展开图片视频/编组执行 |
| `cameraControl` | 20 | 🔴 未实现 | 3D 相机参数 |
| `groupToolbar` | 20 | ✅ 已实现（执行=本地模拟） | 编组：8 色、横向/纵向/网格、执行、解散、删除 |
| `historyPanel` | 20 | ✅ 已实现（本地版） | 全部生成历史 + 分类 + 批量下载；云端历史未做 |
| `elementReferencePicker` | 18 | 🔴 未实现 | 元素引用选择器 |
| `modelAuth` | 17 | ⛔ 不实现 | 模型授权/API Key |
| `topaz` | 16 | 🔴 未实现 | Topaz 模型接入 |
| `parameterPresets` | 15 | ✅ 已实现（本地参数预设） | 参数面板内联预设；独立预设库未做 |
| `stack` | 15 | 🟡 部分实现 | 素材栈节点已建模；拖入/解栈交互未做 |
| `mention` | 14 | 🔴 未实现 | @ 素材引用 |
| `teamInvite` | 14 | ⛔ 不实现 | 团队邀请，云端 |
| `galleryPicker` | 13 | ✅ 已实现（本地版） | 素材库选择器（本地图片列表） |
| `imageNode` | 13 | 🟡 部分实现 | 图片节点 + 真实 API 出图 + 工具条 + 参数；局部编辑（重绘/扩图）未做 |
| `remakeWorkbench` | 13 | 🔴 未实现 |  |
| `timeAgo` | 13 | ✅ 已实现 | 相对时间 |
| `roleDesign` | 12 | 🔴 未实现 |  |
| `aiWatermarkSetting` | 11 | 🔴 未实现 |  |
| `inplaceEditor` | 11 | 🔴 未实现 |  |
| `lighting` | 11 | 🔴 未实现 | 3D 灯光 |
| `promptEnhance` | 11 | ✅ 已实现（本地模板） | 提示词增强（本地规则） |
| `imageParamsReferencePicker` | 10 | 🔴 未实现 |  |
| `feedback` | 9 | 🔴 未实现 |  |
| `imageParams` | 9 | ✅ 已实现 | 底部参数面板：模型/比例/分辨率/数量/风格/种子/负向 |
| `videoDraft` | 9 | 🔴 未实现 |  |
| `cloudSoftware` | 8 | 🔴 未实现 |  |
| `groupParams` | 8 | 🔴 未实现 |  |
| `mediaPreview` | 8 | ✅ 已实现 | 媒体预览：名称/类型/来源/模型/完成时间 |
| `aiAppModal` | 7 | 🔴 未实现 |  |
| `director` | 7 | 🔴 未实现 |  |
| `generateShortcutTip` | 7 | ✅ 已实现 | 生成入口与快捷键提示 |
| `nodeOutputHistory` | 7 | ✅ 已实现 | 生成历史浮层 + 设为主图 + 全部下载 + 当前主图 |
| `nodes` | 7 | 🔴 未实现 |  |
| `openCut` | 7 | 🔴 未实现 |  |
| `organizeCanvas` | 7 | ✅ 已实现 | 左/中/右整理 + 保留/还原 |
| `share` | 7 | 🔴 未实现 |  |
| `activity` | 6 | 🔴 未实现 |  |
| `message` | 6 | 🔴 未实现 |  |
| `referenceMedia` | 6 | 🔴 未实现 |  |
| `canvasAssetModal` | 5 | 🔴 未实现 |  |
| `cropper` | 5 | 🔴 未实现 |  |
| `hyperframes` | 5 | 🔴 未实现 |  |
| `imageParamsCard` | 5 | 🔴 未实现 |  |
| `llmTokenBilling` | 5 | 🔴 未实现 |  |
| `nodeContent` | 5 | 🔴 未实现 |  |
| `oneClickRemake` | 5 | 🔴 未实现 |  |

## 实现覆盖估算

- 已实现分组覆盖约 **421** 条 key
- 部分实现约 **1398** 条
- 未实现约 **795** 条（其中大量是单一业务节点的专属表单）
- 按要求不做 **147** 条（账号/支付/团队/首页/模板市场/协同）

> 注：key 数量不等于功能数量，很多分组是同一表单的字段文案；本表用于说明"哪些系统还没挖"。

## 第七轮补充：模型能力排查

- 使用官方 `GET /v1/models?expand=parameters&category=...` 元数据（category / capability_tags / 参数 Schema），
  不再靠模型名前缀猜测。
- 318 个模型中筛出：图片 53、视频 57、文本 181、音频 9；排除 14 个非生成模型、4 个未归类非 chat。
- 画布节点按类别取候选模型；有上游图片时自动收窄到支持参考图/首帧的模型；误选自动纠正。
- 明细：[`model-audit.md`](model-audit.md)。

## 附：模型节点 → APIMart 映射（第六轮实测）

| 画布节点 | API | 请求要点 | 结果解析 |
| --- | --- | --- | --- |
| 文本 / LLM | `/v1/chat/completions` | OpenAI messages + temperature/max_tokens | `choices[0].message.content` |
| 图片 | `/v1/images/generations` | `model/prompt/size/resolution/seed/image_urls/negative_prompt` | 提交→`task_id`→轮询→`result.images[].url[]` |
| 视频 | `/v1/videos/generations` | `model/prompt/size/resolution/duration/generate_audio` | 同上，`result.videos[].url[]`（容错解析） |
| 音频 | `/v1/audio/speech` | `model/input/voice/speed/response_format` | 二进制音频 → dataURL |
| 参考图 | `/v1/uploads/images` | multipart `file` | `{url}` → `image_urls:[{url}]` |

> 视频结果解析做了容错：`images/videos/video/audios/output/url` 都会尝试提取。
