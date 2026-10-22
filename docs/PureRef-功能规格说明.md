# PureRef 功能规格说明（逆向整理）

> 目标软件：PureRef 2.1.3（macOS Universal 2，`PureRef.app`，Qt 6.2.4 构建）
> 文档性质：**不含代码**的行为规格。用于作为 MuseNex 参考板的实现依据与验收基线。
> 证据来源：`00-target/PureRef.app` 静态分析（Mach-O 段、`__cstring` 字符串表、内嵌 Qt 资源清单）、真实运行观察（菜单、设置、对话框、窗口、快捷键设置页）、官方手册与默认快捷键页交叉校验。证据索引见 `docs/逆向证据.md`。

---

## 1. 产品定位与总体目标

PureRef 是一款**极简的参考图查看 / 拼贴工具**：把任意来源的图片拖进一块无限画布，随意缩放、旋转、排列、标注、分组，用于绘画、3D、设计、影视前期的参考板。

核心设计原则（由其行为反推）：

1. **画布优先**：没有常驻工具栏、没有面板占屏；所有控件在需要时出现，鼠标移开即消失。
2. **零心理负担**：拖入即用；不弹登录、不建工程、不改原图（裁剪/缩放/优化都是非破坏或显式操作）。
3. **窗口即工具**：窗口本身可以置顶、半透明、鼠标穿透、锁定，成为绘图软件旁边的"参考层"。
4. **全部操作可键控**：每个动作都有可重绑的快捷键，鼠标手势（左键拖、右键拖）也可重绑。
5. **单文件场景**：一个 `.pur` 文件包含画布状态 + 图片数据（可嵌入），拷走即可复现。

**MuseNex 参考板的差异**：去除登录/授权/更新/遥测/在线检查，纯本地运行；文件格式改为自有 `.prcyq`（不承诺读取 `.pur`）；其余交互与功能对齐。

---

## 2. 信息架构

```
应用
├── 窗口（每个窗口 = 一个场景）
│   ├── 标题栏（悬停显示；可配置常显/隐藏）
│   │   ├── 关闭 / 最小化 / 最大化
│   │   ├── 置顶图钉（pin）
│   │   └── 场景名（未保存时前缀 *，可双击重命名）
│   ├── 画布（无限、可缩放、可平移）
│   │   ├── 图片项 GraphicsImageItem
│   │   ├── 文本项（便签）GraphicsTextItem
│   │   ├── 绘制项 GraphicsDrawItem
│   │   └── 分组项 GraphicsGroupItem（可嵌套）
│   ├── 底部浮动工具栏（随上下文变化）
│   ├── 左上：层级面板（Hierarchy，可停靠/浮动，⌘J）
│   ├── 右上：场景状态图标（可选位置：右上/右下/左上/左下）
│   └── 浮层：设置、命令面板、帮助、菜单、Toast
├── 设置（⌘U，7 个分页）
├── 命令面板（⇧⌘P / F3）
├── 最近文件（空场景或打开菜单时显示缩略图）
└── 多窗口 / 多场景（⌘N 新窗口，⌘K 新场景）
```

### 2.1 窗口与场景的关系

- 一个窗口同一时刻只承载一个场景；`新建场景`会清空当前窗口画布（有未保存修改时先弹未保存警告）。
- `新建窗口`（⌥⇧⌘N）打开独立窗口，可同时并排多个场景。
- **Overlay selection（叠加选择）模式**：每个选中图片变成独立的无边框窗口，背景消失，图片浮在其他应用之上；用于把参考图散落在屏幕各处。此模式下新增图片必须拖到已有图片上或使用"打开图片"动作。
- 同一文件被第二个实例打开时，由本地 socket 通知已运行实例激活窗口（单实例行为）；MuseNex 参考板简化为"同一路径已打开则聚焦已有窗口"。

---

## 3. 画布与相机

| 项目 | 规格 |
| --- | --- |
| 坐标系 | 世界坐标，原点 (0,0)；窗口中心为相机中心；Y 轴向下 |
| 缩放范围 | 约 1%–1000%（以鼠标指针为锚点） |
| 缩放粒度 | 滚轮每格 10%（默认"缩放画布"）；`⌘+`/`⌘-` 每次 ±10% |
| 平移 | 中键拖拽 / 空格+左键拖拽 / 触控板双指 / 菜单（左键+⌥ 也可绑定） |
| 右键 | **右键拖拽 = 移动窗口**；右键单击 = 打开菜单（可在 Controls 中改绑） |
| 相机重置 | `Reset camera` 回到 (0,0)；`Reset camera zoom` 缩放回到 100% |
| 适应窗口 | `Fit`（PureRef 中为双击空白？—本克隆以 `⌘0`/按钮实现"缩放到全部"） |
| 网格 | 无 / 线 / 点；颜色可配；可吸附（Snap to grid）；`G` 切换显示 |
| 画布外观 | 背景色、画布色（导出底色）、网格色、选中色、边框色、文字色可配；暗/亮/玻璃三套主题 |
| 画布灰度 | `Canvas → Grayscale` 把全部内容以灰度渲染（不改原图） |
| 画布锁定 | 锁定后所有项不可交互，仅可平移（左键拖拽）；再按 `⌘R` 或菜单解锁，并有 Toast 提示 |
| 窗口缩放时缩放场景 | 可选：窗口尺寸变化时等比缩放场景，保持画面构图 |

**渲染规则**

- 图片按当前相机变换绘制；每张图有独立的显示采样（双线性 / 最近邻，默认双线性，可逐图切换）。
- 图片边框：可选择只给选中项 / 全部 / 无（Image borders: All / Selected / None）。
- 选中态：Accent 色描边（约 2px），四角缩放手柄 + 顶部旋转手柄；多选时显示整体包围盒。
- 变换手柄（Transform gizmo）：默认启用，可选择显示"全部 / 仅旋转 / 仅缩放 / 无"，手柄尺寸可配（默认 10px），应用失焦时淡出。
- 低缩放级别下可降采样以保证流畅（性能模式）。

---

## 4. 项（Item）模型

所有画布内容都是 item，统一具备以下属性：

| 属性 | 说明 |
| --- | --- |
| 位置 / 尺寸 / 旋转 | 世界坐标；旋转为角度制 |
| 不透明度 | 0–100%，可多选批量设置（工具栏滑块 + 数值） |
| 锁定 | 锁定项不可被框选/拖动，但可在层级面板中选中；组锁定时点击组内项会选中组 |
| 层叠顺序 | 场景内有序；置顶/置底；组内独立排序 |
| 父级 | 可挂到组或另一项下（Parent items，快捷键 `P`）；父子位移联动；禁止把项挂到自己的后代 |
| 注释 | 每个 item 可附加纯文本 comment（Comment 对话框，⌥C） |
| 名称 | 层级面板与导出命名使用；可重命名 |

### 4.1 图片项

- 支持格式：PNG / JPEG / GIF（含动画）/ WebP / BMP / TIFF / HEIC（libheif）/ SVG / 以及 Qt 可解码的常见格式；也支持拖入图片 URL（带 referer/UA 覆盖）。
- **链接模式**：默认嵌入保存文件；可选择"仅链接"（linked），文件移动后显示缺失占位符，可用 `Relink missing images` 重新定位；也可 `Replace image` 换源。
- **非破坏编辑**：
  - 裁剪（crop）：拖动裁剪 gizmo，裁剪框内平移/缩放图片；`⌘` 锁定宽高比，`⌘+⇧` 锁定为正方形；`Reset cropping` 恢复。
  - 变换：旋转、等比缩放；`Reset transform` 恢复原始尺寸与角度。
  - 翻转：水平/垂直（`Flip image horizontally` / `vertically`，或拖拽翻转手势）。
- **渲染选项**：灰度（每图独立）、双线性/最近邻、不透明度。
- **动画（GIF/视频）**：播放/暂停、上一帧/下一帧、显示全部帧、播放速度（0.1×–4×）；播放工具栏仅在选中动图时出现。
- **元信息**：原始尺寸、文件路径、来源 URL、文件格式；`Open source` 用系统默认程序打开原图或浏览器打开来源。
- **缺失图片**：显示带文件名/路径的占位卡片，提供 Relink / Open anyway / 删除。
- **优化（显式、破坏性）**：把图片转为 PNG/JPEG（依据是否有 alpha）、丢弃裁剪掉的像素、按规则降采样，以减小保存体积/加快加载。

### 4.2 便签项（Note）

- 新建：`⌘N` 或 Edit → Note，在画布点击处创建；自动进入编辑。
- 富文本编辑：加粗 `⌘B`、斜体 `⌘I`、下划线 `⌘U`、删除线 `⌥⇧S`、字号增大/减小 `⇧⌘.` / `⇧⌘,`、字体切换 `⌥⌘.` / `⌥⌘,`、文字颜色 `⌘T`、高亮色 `⌘H`、背景色 `⇧⌘T`、清除格式 `⌘\`、复制/粘贴格式 `⌥⌘C` / `⌥⌘V`、无格式粘贴 `⇧⌘V`。
- 列表：项目符号 `⇧⌘B`、编号 `⇧⌘N`、待办清单 `⇧⌘C`；输入 `* `、`1. `、`[ ] ` 自动开始对应列表。
- 缩进/反缩进：`⌘→` / `⇧⌘→`；对齐：左/中/右/两端 `⇧⌘L/E/R/J`。
- 链接：`⌘K` 插入链接，可"浏览本地文件"或"移除链接"。
- 自动尺寸：开关（默认开）；关闭后可手动调整便签框大小。
- 样式预设：Comfortable / Compact（影响行高、内边距）。
- 多选便签可批量设置格式（Multi Note 工具栏）。
- 双击进入编辑；`Esc` 完成编辑；编辑时默认全选文本（可关闭）。
- 便签可移动/旋转/缩放，作为普通 item 参与布局与分组。

### 4.3 绘制项（Drawing）

- 工具栏/快捷键选工具：画笔 `D`、直线 `L`、椭圆 `C`、矩形 `R`、橡皮 `E`。
- 画笔样式：实线 / 点线 / 箭头（数字键 `1` `2` `3`）；宽度小/中/大；颜色用取色器（支持屏幕取色 `⌘T`）。
- 直线/形状：按住 `⇧` 约束水平/垂直/45°；矩形/椭圆默认填充透明、描边颜色与画笔一致。
- 橡皮：点击/划过多边形/线条即删除该绘制项（可撤销）。
- 绘制中 `Esc` 取消本次绘制。
- 绘制项是独立 item：可选中、移动、缩放、改色、删除、参与导出。

### 4.4 分组项（Group）

- `⌘G` 把选中项成组（组包围盒 = 内容并集 + 内边距 10px 可配）；`⇧⌘G` 解组。
- 组可再分组（层级树）；拖动组移动全部子项；缩放组等同缩放子项。
- 组可设置：背景色（Change Group Background Color）、锁定模式（Lock group）。
- **组锁定的特殊规则**：锁定后点击组内任意项会选中组本身；双击可穿透选中组内单项。
- 拖拽入组：把 item 拖到组上可插入（可在设置中关闭，改为仅层级面板操作）。
- 父子：`P` 把选中项挂到第一个选中项（Parent），层级面板可拖拽改父级；`Ungroup` 只解除当前层级。

---

## 5. 选择与变换交互

| 操作 | 行为 |
| --- | --- |
| 左键单击 item | 选中该项（清空其他选择） |
| 左键拖拽空白 | 橡皮筋框选（相交即选；`⇧` 加到选择） |
| `⇧`+单击 | 加选/减选 |
| 双击图片 | 聚焦该图（缩放到适合窗口） |
| `Space` | 聚焦图片（纯平移+缩放，不旋转） |
| `⌘Space` | 聚焦整个画布 |
| `→` / `←` | 按层级顺序聚焦下一张/上一张 |
| 拖动选中项 | 移动；`⇧` 约束水平/垂直；靠近其他项边缘时自动吸附（阈值可配）；网格开启时可吸附网格 |
| 拖角手柄 | 等比缩放；`⇧` 自由比例？—默认为等比，按住 `⌥` 以中心缩放（本克隆实现）；双指/滚轮配合 |
| `⌘`+拖拽（Rotate） | 围绕选择中心旋转；`⇧` 吸附 45° |
| `⌥⌘`+拖拽（Scale） | 非等比缩放（拉宽/压扁） |
| `⌥⇧`+拖拽（Flip） | 按拖动方向翻转 |
| `⌥⇧⌘`+拖拽（Opacity） | 左右拖动调整不透明度 |
| `C`+拖拽（Crop selection） | 在选中图片上拉出矩形裁剪（非破坏） |
| `Z`+拖拽（Zoom） | 缩放选中图；`⇧V` 在裁剪区内缩放图片 |
| `S`+点击 | 显示该点颜色码（HEX/RGB） |
| `D`+点击 | 显示图片坐标（世界坐标） |
| 单击空白 | 清空选择 |
| `⌘A` | 全选 |
| `⌫` / `Delete` | 删除选中 |
| `↵` | 编辑选中项（便签进入文本编辑 / 图片打开属性） |
| `Esc` | 取消当前操作 / 清空选择 / 关闭浮层 |

**吸附与对齐辅助**：移动时显示与其他项边缘的对齐参考线；轴向吸附（⇧）；邻近吸附（与最近边缘对齐）；网格吸附。选中多个时，对齐/分布以选择包围盒为基准。

---

## 6. 布局与排列（Images 菜单）

- **Arrange（排列）**：
  - `Optimal`（⌘P）：自动排布以适配当前窗口，尽量紧凑（先打包再优化）。
  - `By name`（⌥⌘N）、`By path`（⌥⌘D）、`By order`（⌥⌘O，添加到场景的先后）、`By addition`（⌥⌘A，按添加顺序）、`Randomly`（⌥⌘R）。
- **Align（对齐）**：Left `⌘←` / Right `⌘→` / Top `⌘↑` / Bottom `⌘↓`；Stack（堆叠成一叠，按层叠顺序错位）；Distribute horizontal `⌥⇧⌘↑` / vertical `⌥⇧⌘↓`。
- **Normalize（统一尺寸）**：Height `⌥⌘←` / Width `⌥⌘→` / Size `⌥⌘↑`（最长边一致）/ Area `⌥⌘↓` / Scale（按场景比例统一）；尺寸基准可切换"平均值 / 首个选中项"（Normalize Source Toggle）。
- **Pack all and optimize**（⌥⌘P）：全部排列 + 优化画布。
- **Resize to selection**（⇧⌘R）：窗口缩放到选中包围盒（无选中则适应全部）。
- **Slideshow selection**（⌥S）：按选中顺序全屏轮播，间隔默认 10s（可配）；UI 自动淡出（可选保留计时器）。
- 对齐间距：Alignment padding 默认 10px。

---

## 7. 导入、粘贴与拖放

| 来源 | 行为 |
| --- | --- |
| 拖入文件 | 插入到落点；多文件按网格排布；文件夹递归扫描图片；不是图片的文件忽略并提示 |
| 拖入 URL / 浏览器拖图 | 下载后插入；支持 Referer / User-Agent 覆盖列表（部分站点防盗链） |
| 粘贴 `⌘V` | 剪贴板有图片 → 插入图片；有文本 → 生成便签（可自动父级到选中项：Auto parent pasted notes）；有文件路径 → 导入 |
| `⌘I` 打开图片 | 文件选择器，多选 |
| `⌘L` 打开场景 | 打开 `.pur` / `.prcyq` |
| 最近文件 | 空场景显示最近文件缩略图（可 pin / 移除 / 在访达中显示）；启动可选自动打开上次场景 |
| 新图插入行为 | 默认"选中并打包新图片"（Select and pack new images，按 Optimal/Name/Path/Order/Addition/Random 排序）；默认把选中图片带到最前 |
| 大图 | 导入时可按规则自动降采样/转码（见 8.4），可设置超过阈值时警告 |

---

## 8. 保存、导出与文件

### 8.1 场景文件

- 单一文件（PureRef 为 `.pur`，本克隆为 `.prcyq`），包含：场景元数据（名称、相机、网格、主题覆盖）、全部 item（类型/几何/样式/父子/层叠/注释）、图片数据（可嵌入原始字节或仅保存链接）。
- 保存策略：`⌘S` 保存，`⇧⌘S` 另存为；未保存时标题显示 `*`；关闭/新建/退出时按"未保存场景行为"处理（每次询问 / 丢弃 / 自动保存）。
- **临时保存与恢复**：编辑始终先落到临时文件；崩溃/退出后下次启动可恢复。可选"周期性保存"（默认 10 分钟，仅对已保存过的场景直接写回）。
- 自动保存：`AutoSave.pur`、`AutoSave.N.pur`、`.pur.tmppur`、`.pur-journal` 用于事务与恢复。
- 保存时生成场景缩略图（可在性能设置关闭）。
- 保存为旧格式时提示功能受限；用新版本保存会丢弃旧版本特性（本克隆不实现旧格式，仅保留"版本不兼容"错误处理思路）。

### 8.2 导出

| 命令 | 规格 |
| --- | --- |
| `⌘E` Export scene | 导出整个画布为单张图：可改宽高（默认当前画布可视内容的像素尺寸）、选择是否包含背景色与图片边框；输出 PNG（按扩展名决定） |
| `⇧⌘E` Export selected as scene | 同上，范围为选中项 |
| `⌥⌘I` Export all images | 批量导出全部图片：格式 Original / PNG / JPEG / WebP、是否用裁剪后的区域（Export cropping）、是否含子项（Children）、命名模板（`%0` 原名、`%1` 序号、`%2` 补零序号、`%3` 场景名；留空=原名） |
| `⇧⌘I` Export selected images | 同上，范围选中 |
| 复制 | `⌘C` 复制图片到剪贴板（最大边长限制默认 10000px）；`Copy as file` 复制为文件引用；拖出到其他应用（Drag out） |
| 保存/导出路径 | 记住上次目录；导出时不修改场景内容 |

### 8.3 窗口与系统

- 置顶（`⇧⌘A`）、置底（`⇧⌘B`）、置于指定应用之上（`⌥⇧⌘A`）、鼠标穿透（`⌘T`，会先确认）、叠加选择模式、窗口置底。
- 应用整体不透明度：`⇧⌘+` / `⇧⌘-`，10%–100%，也可在设置中滑杆调整。
- 窗口锁定（`⌘W`）、无边框、圆角、主窗口 1px 边框、标题栏可见性（始终 / 悬停 / 从不）、鼠标穿透在激活时自动关闭。
- 全屏/最大化 `⌘F`、最小化 `⌘M`、新窗口 `⌥⇧⌘N`、关闭 `⌘Q`。
- 托盘图标模式（可选）：关闭窗口后仍在菜单栏/托盘驻留。
- 双击标题栏最大化；拖拽标题栏移动；拖拽窗口边缘调整大小（边框宽度默认 10px，移动阈值 5px）。
- 系统原生菜单栏提供同等菜单（File/Edit/Images/Mode/Canvas/Window）。

### 8.4 性能与优化

- **性能模式**：No cache（最低内存，CPU 高）/ Cache on disk（磁盘缓存，内存低）/ In memory（最快、质量优先）/ In memory, low zoom quality（最快、低缩放降质）。
- **CPU 核心分配**：用于图片解码/缩放的线程比例（默认 30%，可调）。
- **自动优化规则**（Auto optimize imported images，预设"大图警告"）：规则 = 宽/高/面积/文件大小/格式；动作 = Downscale（运行时降采样，原图仍存入文件）/ Convert（转 JPG 或 PNG，视 alpha）/ Ask（询问）；可自定义规则表。
- **手动优化**：Manage images（⌥⇧⌘J）对选中/全部图片做降采样（仅运行时）、Optimize images（破坏性：转码、丢弃裁剪像素）、重新链接。
- **撤销历史**：默认 200 步，可调。
- **临时目录**：可指定；更改需重启生效；磁盘缓存目录缺失时自动回退到内存模式。
- 场景缩略图生成开关；大图警告阈值；内存不足时提示 "Running out of memory!"。

---

## 9. 界面外观

| 元素 | 规格 |
| --- | --- |
| 主题 | Dark（默认）/ Light / Glass（半透明毛玻璃） |
| 画布底色 | Dark: `#181818`；可自定义 |
| 面板底色 | `#222222`；侧栏 `#333333`；选中项 `#4b4b4b` |
| 强调色 | 青蓝 `#2e84aa`（悬停/选中/主按钮） |
| 主按钮 | 实心强调色 + 白字；次按钮为深灰（`#333`） |
| 输入框 | 底色 `#181818`，1px 深色描边，聚焦时强调色描边 |
| 字体 | 内嵌 Open Sans（Light/Regular/Bold）；中文回退 PingFang SC |
| 圆角 | 对话框 12px；按钮 4–6px；输入框 4px；主题按钮 8px |
| 图标 | 单色线性 SVG，24×24 视框，1.5px 描边 |
| 对话框 | 标题居中；底部按钮右对齐；Esc 取消；带 X 关闭 |
| Toast | 悬停工具栏下方短暂显示状态（"Canvas locked"、"Transparent to mouse enabled" 等） |
| 空场景 | 居中虚线投放框 + 图片图标 + "Drag and drop images here" / "or" / "Browse" 按钮 |
| 标题栏 | 悬停顶部约 40px 热区出现；左侧红黄绿窗口按钮（macOS 风格）、中间标题、右侧图钉 |

**设置分页**（7 页，左侧列表 + 顶部搜索框 + 底部"恢复默认/导入/导出"）：

1. **Performance**：Auto optimize imported images、Manage current scene、Undo history size、Performance mode、CPU core allocation、Generate scene thumbnails、Temporary directory location。
2. **Appearance**：Language、Title bar visibility、Grid style、Snap to grid、Main window border、Rounded window corners、Application opacity、Theme presets（Dark/Light/Glass + 4 自定义预设，`⌥1`–`⌥7`）、Colors（Canvas、Canvas background、Grid、Border、Selection、Text、Text hover …）。
3. **Saving and loading**：Embed local images in save file、Enable periodic saving、Interval、Unsaved scene behavior（Ask every time / Discard / Save）、Auto open last scene on start up、Number of recent opened files、Show recent on start。
4. **Window**：Default window mode、Scroll wheel functionality（Zoom canvas / Pan canvas）、Invert scroll wheel、Trackpad gestures、Scale scene on window resize、Show window state change popup、Take window focus after image drop、Lock window while maximized、Show maximized in its own space、Double click title bar to maximize、Disable mouse transparency on activate、Resize border width、Move window threshold、Open files in（Current window / New window）、Scene status icon（四角位置）。
5. **Images**：Enable transform gizmo、Visibility、Handle size、Fade out when application inactive、Clipboard copy image max size、Image borders、Alignment padding、Bring selected images to front、Select and pack new images、Pack new by、Select all text on note edit、Auto parent pasted notes、Drag and drop items into groups、Double click image to focus、Slideshow time interval、Slideshow step order、Slideshow UI fade mode、Default image sampling（Bilinear / Nearest neighbor）、Use screen color profile。
6. **Keyboard shortcuts**：搜索 + 分组（Actions / Controls / Draw / Group / Multi Note / Note / Playback / System）；每行"动作名 + 按键 + 添加绑定 +"；`⌘`+点击重置单个；支持多绑定、清除、冲突检测。
7. **System**：Updates（本克隆移除）、Allow sending anonymous analytics（移除）、Logging / View log（保留本地日志）。

---

## 10. 工具栏（浮动、上下文相关）

底部居中浮动；无交互 2 秒后淡出，鼠标接近或选中变化时出现。按上下文切换：

| 工具栏 | 出现条件 | 内容 |
| --- | --- | --- |
| MainToolbar | 通用 | `+` 添加菜单（图片/便签/从剪贴板）、组织菜单（Send to / Arrange / Align / Distribute / Normalize）、不透明度弹出滑块、锁定菜单、misc 菜单、层级、设置 |
| DrawToolbar | 绘制模式 | 工具（画笔/直线/椭圆/矩形/橡皮）、颜色、线宽、线型、撤销 |
| GroupToolbar | 选中组 | 组背景色、组锁定模式、解组 |
| NoteToolbar | 选中便签 | 编辑、颜色、自动尺寸、删除 |
| NoteEditingToolbar | 便签编辑中 | 全部富文本按钮（同 4.2） |
| MultiNoteToolbar | 多选便签 | 批量格式 |
| PlaybackToolbar | 选中动图 | 播放/暂停、上一帧/下一帧、帧条、速度 |
| UnlockToolbar | 画布锁定 | 解锁按钮 |

工具栏溢出（窗口过窄）进入 `…` 溢出菜单。

---

## 11. 菜单结构（macOS 菜单栏）

```
PureRef: About / Preferences… / Services / Hide / Hide Others / Show All / Quit
File:     Open / Open images / Open scene location / — / Save / Save as / Export ▸ (Scene, Selected as scene, All images, Selected images) / — / New scene
Edit:     Undo / Redo / — / Copy / Paste / — / Note / Draw / —
Images:   Select all / Selection ▸ (Reset cropping, Reset transform, Open source, Toggle bilinear sampling, Toggle grayscale, Toggle locked, Group, Ungroup, Crop image, Comment, Send to back, Send to front, Slideshow, Delete) / Arrange ▸ (Optimal, By name, By path, By order, By addition, Randomly) / Align ▸ (Left, Right, Top, Bottom, Stack, Distribute horizontal, Distribute vertical) / Normalize ▸ (Height, Width, Size, Area, Scale) / — / Manage images / Replace image / Relink missing images
Mode:     Transparent to mouse / Overlay selection / Always on top / Always on top of… / Always on bottom
Canvas:   Grid ▸ (None, Lines, Dots, Snap to grid) / Reset camera / Reset camera zoom / Lock canvas / Grayscale / Optimize
Window:   Maximize / Minimize / Resize to selection / Lock window / New window
```

**画布右键菜单** = 精简版：Help / Hierarchy / Settings / Undo / Redo / Copy ▸ / Paste / Note / Draw / Mode ▸ / Window ▸ / Canvas ▸ / Images ▸ / Save ▸ / Open ▸ / New scene / Close。

---

## 12. 快捷键总表（默认值，可在设置中重绑）

> ⌘ = Command，⇧ = Shift，⌥ = Option/Alt，⌃ = Control。鼠标绑定写作 Left MB / Middle MB / Right MB。

### 12.1 文件与场景

| 动作 | 按键 |
| --- | --- |
| 打开场景 | ⌘L |
| 打开图片 | ⌘I |
| 打开最近文件 | ⇧⌘L |
| 打开场景所在位置 | ⌥⌘L |
| 保存 | ⌘S |
| 另存为 | ⇧⌘S |
| 导出场景 | ⌘E |
| 导出选中为场景 | ⇧⌘E |
| 导出全部图片 | ⌥⌘I |
| 导出选中图片 | ⇧⌘I |
| 新建场景 | ⌘K |
| 新建窗口 | ⌥⇧⌘N |
| 关闭 | ⌘Q |
| 设置 | ⌘U |
| 撤销 / 重做 | ⌘Z / ⇧⌘Z |
| 复制 / 剪切 / 粘贴 | ⌘C / ⌘X / ⌘V |
| 全选 | ⌘A |
| 删除 | ⌫ |
| 编辑项 | ↵ |
| 帮助 | ⌃H |
| 命令面板 | ⇧⌘P、F3（双绑定） |
| 层级面板 | ⌘J |

### 12.2 视图与相机

| 动作 | 按键 |
| --- | --- |
| 放大 / 缩小 | ⌘+ / ⌘- |
| 重置缩放 | ⌘0 |
| 显示/隐藏网格 | G |
| 重置相机 | （无默认） |
| 画布灰度 | ⌥⌘G |
| 画布锁定 | ⌘R |
| 聚焦图片 | Space |
| 聚焦画布 | ⌘Space |
| 下一张 / 上一张 | → / ← |
| 鼠标穿透 | ⌘T |
| 叠加选择 | ⌘Y |
| 置顶 / 置底 / 置于指定应用 | ⇧⌘A / ⇧⌘B / ⌥⇧⌘A |
| 最大化 / 最小化 | ⌘F / ⌘M |
| 窗口锁定 | ⌘W |
| 缩放至选择 | ⇧⌘R |
| 应用不透明度 +/- | ⇧⌘+ / ⇧⌘- |
| 主题预设 1–7 | ⌥1 … ⌥7 |

### 12.3 图片与项

| 动作 | 按键 |
| --- | --- |
| 优化画布 | ⌘O |
| 全部打包并优化 | ⌥⌘P |
| 手动排列（最优） | ⌘P |
| 按名称/路径/顺序/添加顺序/随机排列 | ⌥⌘N / ⌥⌘D / ⌥⌘O / ⌥⌘A / ⌥⌘R |
| 左/右/上/下对齐 | ⌘← / ⌘→ / ⌘↑ / ⌘↓ |
| 水平/垂直分布 | ⌥⇧⌘↑ / ⌥⇧⌘↓ |
| 堆叠 | ⌥⌘S |
| 统一高/宽/尺寸/面积/比例 | ⌥⌘← / ⌥⌘→ / ⌥⌘↑ / ⌥⌘↓ / ⌥⌘S？→（见设置：Normalize Scale 默认未绑定） |
| 置底 / 置顶 | ↓ / ↑ |
| 翻转水平/垂直 | ⌥⇧H / ⌥⇧V |
| 重置裁剪 / 重置变换 | ⇧⌘C / ⇧⌘T |
| 切换双线性采样 / 灰度 / 锁定 | ⌥T / ⌥G / ⌥L |
| 打开源文件 | ⇧⌘O |
| 注释 | ⌥C |
| 分组 / 解组 | ⌘G / ⇧⌘G |
| 父级 | P |
| 轮播 | ⌥S |
| 管理图片 | ⇧⌘J |
| 替换图片 | （无默认） |
| 重新链接 | ⌥⇧⌘R |

### 12.4 鼠标绑定

| 动作 | 绑定 |
| --- | --- |
| 移动项 | Left MB |
| 轴向约束移动 | Left MB + ⇧ |
| 邻居吸附移动 | Left MB + ⇧Space |
| 框选/加选 | Left MB（+⇧ 加选） |
| 旋转 | Left MB + ⌘ |
| 吸附旋转 | Left MB + ⇧⌘ |
| 缩放 | Left MB + ⌥⌘ |
| 翻转 | Left MB + ⌥⇧ |
| 不透明度 | Left MB + ⌥⇧⌘ |
| 裁剪 | Left MB + C |
| 裁剪内平移 | Left MB + V |
| 裁剪内缩放 | Left MB + ⇧V |
| 缩放视图 | Left MB + Z |
| 取色 | Left MB + S |
| 显示坐标 | Left MB + D |
| 平移 | Left MB + ⌥；Middle MB |
| 锁定画布时平移 | Left MB |
| 最大化时平移 | Right MB |
| 移动窗口 | Right MB |
| 打开菜单 | Right MB |
| 调整窗口大小 | Left MB |

### 12.5 绘制与便签

| 动作 | 按键 |
| --- | --- |
| 画笔 / 直线 / 椭圆 / 矩形 / 橡皮 | D / L / C / R / E |
| 线型 实线/点线/箭头 | 1 / 2 / 3 |
| 取消绘制 / 完成编辑 | Esc |
| 新建便签 | ⌘N |
| 加粗 / 斜体 / 下划线 / 删除线 | ⌘B / ⌘I / ⌘U / ⌥⇧S |
| 文字色 / 高亮色 / 背景色 | ⌘T / ⌘H / ⇧⌘T |
| 字号 +/- | ⇧⌘. / ⇧⌘, |
| 上一/下一字体 | ⌥⌘, / ⌥⌘. |
| 项目符号 / 编号 / 待办 | ⇧⌘B / ⇧⌘N / ⇧⌘C |
| 缩进 / 反缩进 | ⌘→ / ⇧⌘→ |
| 左/中/右/两端对齐 | ⇧⌘L / ⇧⌘E / ⇧⌘R / ⇧⌘J |
| 清除格式 | ⌘\ |
| 复制/粘贴格式 | ⌥⌘C / ⌥⌘V |
| 无格式粘贴 | ⇧⌘V |
| 插入链接 | ⌘K |
| 自动尺寸 | ⇧⌘A |
| 播放下一步/上一步帧 | （无默认，可在设置绑定） |
| 播放/暂停 | （无默认） |

---

## 13. 数据与状态规则

1. **修改标记**：任何会影响保存结果的操作（含相机？—不会）→ 场景 dirty；标题加 `*`；保存后清除。
2. **撤销栈**：所有场景修改入栈（增删项、变换、样式、分组、排列、绘制、便签文本）；相机移动不入栈；连续拖动合并为一条。
3. **外部修改**：文件被外部改动时，保存前提示覆盖；打开时提示较新版本/损坏并提供恢复。
4. **损坏恢复**：读取失败时提供"Open anyway（不稳定）"与"仅恢复图片（丢失便签与坐标）"。
5. **内存/磁盘**：性能模式切换到磁盘缓存失败时回退到内存；临时目录不可用时提示。
6. **网络图片**：下载失败保留占位与错误信息；可重试。
7. **多窗口一致性**：同一场景不在两个窗口同时编辑（本克隆：同一路径第二次打开聚焦已有窗口）。

---

## 14. 非目标（MuseNex 参考板明确不做）

- 登录、账号、许可证校验、购买流程、更新检查、匿名统计上报。
- 与 `.pur` 二进制格式的双向兼容（不读取、不写出；导出/导入仅图片与自有 `.prcyq`）。
- 在线图库/云同步/协作。
- 全局系统级快捷键（需辅助功能权限，纯本地版不做）。
- PureRef 的 "Always on top of 指定应用" 的精确 App 级绑定（以"始终置顶"近似，标注差异）。
- Overlay selection 的"每图独立窗口"完整实现（以单窗口无背景叠加态近似，标注差异）。
- 视频（非 GIF）解码（依赖系统编解码器，若不稳则仅支持 GIF/WebP 动图）。

---

## 15. 验收清单（MuseNex 参考板自测）

- [ ] 拖入 10 张不同格式图片，全部正确显示；大图自动降采样且不卡顿。
- [ ] 滚轮以指针为锚缩放；中键/空格拖拽平移；⌘0/⌘+/⌘- 正确。
- [ ] 框选、加选、多选拖动、对齐参考线、网格吸附、⇧ 轴向约束。
- [ ] 角handle 缩放、⌘ 旋转、⌥⇧ 翻转、⌥⇧⌘ 调不透明度。
- [ ] 裁剪非破坏、重置裁剪/变换；翻转；灰度；双线性切换。
- [ ] 分组/解组/父级；组锁定后点击选组、双击穿透。
- [ ] 对齐 4 向、分布 2 向、堆叠、5 种 normalize、6 种 arrange。
- [ ] 便签：全部富文本按钮、列表、缩进、对齐、链接、自动尺寸、多选批量格式。
- [ ] 绘制：5 工具、3 线型、3 宽度、取色、⇧ 约束、橡皮、撤销。
- [ ] 层级面板：显示树、选中联动、拖拽改父级、重命名、显示/隐藏?（如实现）。
- [ ] 命令面板可搜索并执行全部命令。
- [ ] 保存/打开 `.prcyq`（含嵌入图片）后画布完全还原；退出重开恢复上次场景。
- [ ] 导出场景 PNG（宽高/背景/边框）与批量导出图片（格式/裁剪/命名模板）。
- [ ] 窗口：置顶/置底/锁定/不透明度/穿透/标题栏悬停/圆角/无边框。
- [ ] 7 个设置页全部项可读写并持久化；恢复默认可用。
- [ ] 全部快捷键按第 12 节生效且可重绑。
- [ ] 无任何联网请求（除主动拖入网络图片）。

---

## 16. 附录：证据映射（摘要）

| 规格来源 | 证据 |
| --- | --- |
| 菜单结构 | 运行中通过 macOS 辅助功能读取菜单栏全部条目与子菜单 |
| 设置项 | 运行中逐页截图 + 二进制字符串表中的设置键与说明文本（如 `PeriodicSave`、`DownscaleMode`、`Slideshow time interval`） |
| 快捷键默认值 | 设置 → Keyboard shortcuts 全表截图（17 页） |
| 项类型 | 二进制类型名 `GraphicsImageItem` / `GraphicsTextItem` / `GraphicsDrawItem` / `GraphicsGroupItem` |
| 文件格式 | 实际保存 `.pur` 并解析头部：版本串 `2.1` / `2.1.3`、32 位十六进制场景 ID、长度前缀的图片段（JPEG/PNG 原始字节）、校验和与缩略图 |
| 保存可靠性 | 字符串表 `AutoSave.pur`、`.tmppur`、`-journal`、`Checksum mismatch`、`loadcorrupt` 等 |
| 优化规则 | 字符串表 `Downscale / Convert / Ask` 规则说明全文 |
| 性能模式 | 字符串表四种模式说明全文 |
| 绘制/便签 | 工具栏类名 `DrawToolbar`、`NoteEditingToolbar`、`MultiNoteToolbar`；动作表与图标资源 `:/icons/*` |
| 颜色值 | 截图取色（画布 `#181818`、面板 `#222222`、强调色 `#2e84aa`） |
