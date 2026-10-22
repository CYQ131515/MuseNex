/* MuseNex 参考板 — 动作表与文案
 * 动作 id、中文/英文名、分组、默认快捷键（与 PureRef 默认值一致，见规格第 12 节）
 */
window.PRCYQ = window.PRCYQ || {};

(function () {
  const A = (id, zh, en, group, bindings) => ({ id, zh, en, group, bindings: bindings || [] });

  window.PRCYQ.ACTIONS = [
    // 文件
    A('open-scene', '打开场景', 'Open', 'file', ['Mod+L']),
    A('open-images', '打开图片', 'Open images', 'file', ['Mod+I']),
    A('open-recent', '打开最近文件', 'Open most recent', 'file', ['Mod+Shift+L']),
    A('open-scene-location', '打开场景位置', 'Open scene location', 'file', ['Alt+Mod+L']),
    A('open-source', '打开源文件', 'Open source', 'file', ['Mod+Shift+O']),
    A('save', '保存', 'Save', 'file', ['Mod+S']),
    A('save-as', '另存为', 'Save as', 'file', ['Mod+Shift+S']),
    A('export-scene', '导出场景', 'Export scene', 'file', ['Mod+E']),
    A('export-selected-scene', '导出选中为场景', 'Export selected as scene', 'file', ['Mod+Shift+E']),
    A('export-all-images', '导出全部图片', 'Export all images', 'file', ['Alt+Mod+I']),
    A('export-selected-images', '导出选中图片', 'Export selected images', 'file', ['Mod+Shift+I']),
    A('new-scene', '新建场景', 'New scene', 'file', ['Mod+K']),
    A('settings', '设置', 'Settings', 'file', ['Mod+U']),
    A('about', '关于', 'About', 'file', []),
    A('help', '帮助', 'Help', 'file', ['Ctrl+H']),
    A('close', '关闭', 'Close', 'file', ['Mod+Q']),
    // 编辑
    A('undo', '撤销', 'Undo', 'edit', ['Mod+Z']),
    A('redo', '重做', 'Redo', 'edit', ['Mod+Shift+Z']),
    A('copy', '复制', 'Copy', 'edit', ['Mod+C']),
    A('cut', '剪切', 'Cut', 'edit', ['Mod+X']),
    A('paste', '粘贴', 'Paste', 'edit', ['Mod+V']),
    A('duplicate', '创建副本', 'Duplicate', 'edit', ['Mod+D']),
    A('select-all', '全选', 'Select all', 'edit', ['Mod+A']),
    A('delete', '删除', 'Delete', 'edit', ['Backspace']),
    A('note', '便签', 'Note', 'edit', ['Mod+N']),
    A('draw', '绘制', 'Draw', 'edit', ['Mod+Shift+D']),
    A('command-palette', '命令面板', 'Command palette', 'edit', ['Mod+Shift+P', 'F3']),
    A('hierarchy', '层级面板', 'Hierarchy', 'edit', ['Mod+J']),
    // 视图
    A('zoom-in', '放大', 'Zoom in', 'view', ['Mod+=']),
    A('zoom-out', '缩小', 'Zoom out', 'view', ['Mod+-']),
    A('reset-camera', '重置相机', 'Reset camera', 'view', []),
    A('reset-zoom', '重置缩放', 'Reset camera zoom', 'view', ['Mod+0']),
    A('toggle-grid', '切换网格', 'Toggle grid', 'view', ['G']),
    A('grayscale', '画布灰度', 'Grayscale canvas', 'view', ['Alt+Mod+G']),
    A('lock-canvas', '锁定画布', 'Lock canvas', 'view', ['Mod+R']),
    A('focus-image', '聚焦图片', 'Focus image', 'view', ['Space']),
    A('focus-canvas', '聚焦画布', 'Focus canvas', 'view', ['Mod+Space']),
    A('focus-next', '下一张图片', 'Focus next image', 'view', ['ArrowRight']),
    A('focus-prev', '上一张图片', 'Focus previous image', 'view', ['ArrowLeft']),
    A('resize-selection', '缩放到选择', 'Resize to selection', 'view', ['Mod+Shift+R']),
    A('maximize', '最大化', 'Maximize', 'view', ['Mod+F']),
    A('minimize', '最小化', 'Minimize', 'view', ['Mod+M']),
    A('lock-window', '锁定窗口', 'Lock window', 'view', ['Mod+W']),
    A('new-window', '新窗口', 'New window', 'view', ['Alt+Mod+Shift+N']),
    A('increase-opacity', '提高不透明度', 'Increase application opacity', 'view', ['Mod+Shift+=']),
    A('decrease-opacity', '降低不透明度', 'Decrease application opacity', 'view', ['Mod+Shift+-']),
    A('transparent-mouse', '鼠标穿透', 'Transparent to mouse', 'mode', ['Mod+T']),
    A('overlay-selection', '叠加选择', 'Overlay selection', 'mode', ['Mod+Y']),
    A('always-on-top', '始终置顶', 'Always on top', 'mode', ['Mod+Shift+A']),
    A('always-on-top-of', '置于指定应用之上…', 'Always on top of…', 'mode', []),
    A('always-on-bottom', '始终置底', 'Always on bottom', 'mode', ['Mod+Shift+B']),
    A('preset-1', '配色预设 1（暗色）', 'Preset Dark', 'appearance', ['Alt+1']),
    A('preset-2', '配色预设 2（亮色）', 'Preset Light', 'appearance', ['Alt+2']),
    A('preset-3', '配色预设 3（玻璃）', 'Preset Glass', 'appearance', ['Alt+3']),
    A('preset-4', '配色预设 4（自定义1）', 'Preset Custom1', 'appearance', ['Alt+4']),
    A('preset-5', '配色预设 5（自定义2）', 'Preset Custom2', 'appearance', ['Alt+5']),
    A('preset-6', '配色预设 6（自定义3）', 'Preset Custom3', 'appearance', ['Alt+6']),
    A('preset-7', '配色预设 7（自定义4）', 'Preset Custom4', 'appearance', ['Alt+7']),
    // 图片操作
    A('group', '分组', 'Group', 'images', ['Mod+G']),
    A('ungroup', '解组', 'Ungroup', 'images', ['Mod+Shift+G']),
    A('parent', '设为父级', 'Parent items', 'images', ['P']),
    A('crop', '裁剪图片', 'Crop image', 'images', []),
    A('reset-crop', '重置裁剪', 'Reset cropping', 'images', ['Mod+Shift+C']),
    A('reset-transform', '重置变换', 'Reset transform', 'images', ['Mod+Shift+T']),
    A('toggle-bilinear', '切换双线性采样', 'Toggle bilinear sampling', 'images', ['Alt+T']),
    A('toggle-grayscale', '切换灰度', 'Toggle grayscale', 'images', ['Alt+G']),
    A('toggle-locked', '切换锁定', 'Toggle locked', 'images', ['Alt+L']),
    A('send-back', '置底', 'Send to back', 'images', ['ArrowDown']),
    A('send-front', '置顶', 'Send to front', 'images', ['ArrowUp']),
    A('comment', '注释', 'Comment', 'images', ['Alt+C']),
    A('slideshow', '轮播', 'Slideshow selection', 'images', ['Alt+S']),
    A('replace-image', '替换图片', 'Replace image', 'images', []),
    A('relink', '重新链接缺失图片', 'Relink missing images', 'images', ['Alt+Mod+Shift+R']),
    A('manage-images', '管理图片', 'Manage images', 'images', ['Mod+Shift+J']),
    A('optimize', '优化画布', 'Optimize canvas', 'images', ['Mod+O']),
    A('pack-optimize', '全部打包并优化', 'Pack all and optimize', 'images', ['Alt+Mod+P']),
    // 排列/对齐/统一
    A('arrange-optimal', '最优排列', 'Arrange optimal', 'arrange', ['Mod+P']),
    A('arrange-name', '按名称排列', 'Arrange by name', 'arrange', ['Alt+Mod+N']),
    A('arrange-path', '按路径排列', 'Arrange by path', 'arrange', ['Alt+Mod+D']),
    A('arrange-order', '按层级顺序排列', 'Arrange by order', 'arrange', ['Alt+Mod+O']),
    A('arrange-add', '按添加顺序排列', 'Arrange by addition', 'arrange', ['Alt+Mod+A']),
    A('arrange-random', '随机排列', 'Arrange randomly', 'arrange', ['Alt+Mod+R']),
    A('align-left', '左对齐', 'Align left', 'align', ['Mod+ArrowLeft']),
    A('align-right', '右对齐', 'Align right', 'align', ['Mod+ArrowRight']),
    A('align-top', '顶对齐', 'Align top', 'align', ['Mod+ArrowUp']),
    A('align-bottom', '底对齐', 'Align bottom', 'align', ['Mod+ArrowDown']),
    A('stack', '堆叠', 'Stack', 'align', ['Alt+Mod+S']),
    A('dist-h', '水平分布', 'Distribute horizontal', 'align', ['Alt+Mod+Shift+ArrowUp']),
    A('dist-v', '垂直分布', 'Distribute vertical', 'align', ['Alt+Mod+Shift+ArrowDown']),
    A('norm-height', '统一高度', 'Normalize height', 'normalize', ['Alt+Mod+ArrowLeft']),
    A('norm-width', '统一宽度', 'Normalize width', 'normalize', ['Alt+Mod+ArrowRight']),
    A('norm-size', '统一尺寸', 'Normalize size', 'normalize', ['Alt+Mod+ArrowUp']),
    A('norm-area', '统一面积', 'Normalize area', 'normalize', ['Alt+Mod+ArrowDown']),
    A('norm-scale', '统一比例', 'Normalize scale', 'normalize', []),
    A('flip-h', '水平翻转', 'Flip image horizontally', 'images', ['Alt+Shift+H']),
    A('flip-v', '垂直翻转', 'Flip image vertically', 'images', ['Alt+Shift+V']),
    // 绘制
    A('cancel-progress', '取消当前操作', 'Cancel progress', 'draw', ['Escape']),
    A('pen-tool', '画笔工具', 'Select pen tool', 'draw', ['D']),
    A('line-tool', '直线工具', 'Select line tool', 'draw', ['L']),
    A('ellipse-tool', '椭圆工具', 'Select ellipse tool', 'draw', ['C']),
    A('rect-tool', '矩形工具', 'Select rectangle tool', 'draw', ['R']),
    A('eraser-tool', '橡皮工具', 'Select eraser tool', 'draw', ['E']),
    A('pen-solid', '实线', 'Pen style solid', 'draw', ['1']),
    A('pen-dotted', '点线', 'Pen style dotted', 'draw', ['2']),
    A('pen-arrow', '箭头', 'Pen style arrow', 'draw', ['3']),
    A('pen-color', '画笔颜色', 'Pen color', 'draw', []),
    // 便签
    A('note-bold', '加粗', 'Toggle bold text', 'note', ['Mod+B']),
    A('note-italic', '斜体', 'Toggle italic text', 'note', ['Mod+I']),
    A('note-underline', '下划线', 'Toggle text underline', 'note', ['Mod+U']),
    A('note-strike', '删除线', 'Toggle text strikethrough', 'note', ['Alt+Shift+S']),
    A('note-text-color', '文字颜色', 'Text color', 'note', ['Mod+T']),
    A('note-highlight', '高亮颜色', 'Text highlight color', 'note', ['Mod+H']),
    A('note-bg', '文字背景色', 'Text background color', 'note', ['Mod+Shift+T']),
    A('note-clear-format', '清除格式', 'Clear text formatting', 'note', ['Mod+\\']),
    A('note-copy-format', '复制格式', 'Copy text formatting', 'note', ['Alt+Mod+C']),
    A('note-paste-format', '粘贴格式', 'Paste text formatting', 'note', ['Alt+Mod+V']),
    A('note-paste-plain', '无格式粘贴', 'Paste without formatting', 'note', ['Mod+Shift+V']),
    A('note-link', '插入链接', 'Insert link', 'note', ['Mod+K']),
    A('note-font-inc', '增大字号', 'Increase font size', 'note', ['Mod+Shift+.']),
    A('note-font-dec', '减小字号', 'Decrease font size', 'note', ['Mod+Shift+,']),
    A('note-font-next', '下一字体', 'Select next font', 'note', ['Alt+Mod+.']),
    A('note-font-prev', '上一字体', 'Select previous font', 'note', ['Alt+Mod+,']),
    A('note-indent', '增加缩进', 'Increase indentation', 'note', ['Mod+ArrowRight']),
    A('note-outdent', '减小缩进', 'Decrease indentation', 'note', ['Mod+Shift+ArrowRight']),
    A('note-align-left', '左对齐文本', 'Align text left', 'note', ['Mod+Shift+L']),
    A('note-align-center', '居中文本', 'Align text center', 'note', ['Mod+Shift+E']),
    A('note-align-right', '右对齐文本', 'Align text right', 'note', ['Mod+Shift+R']),
    A('note-align-justify', '两端对齐文本', 'Align text justify', 'note', ['Mod+Shift+J']),
    A('note-bullet', '项目符号列表', 'Toggle bulleted list', 'note', ['Mod+Shift+B']),
    A('note-number', '编号列表', 'Toggle numbered list', 'note', ['Mod+Shift+N']),
    A('note-check', '待办列表', 'Toggle checklist', 'note', ['Mod+Shift+C']),
    A('note-autosize', '自动尺寸', 'Toggle note auto size', 'note', ['Mod+Shift+A']),
    A('note-style', '便签样式', 'Toggle note style', 'note', []),
    A('note-finish', '完成编辑', 'Finish editing note', 'note', []),
    // 播放
    A('play-pause', '播放/暂停', 'Play / Pause', 'playback', []),
    A('play-prev', '上一帧', 'Previous frame', 'playback', []),
    A('play-next', '下一帧', 'Next frame', 'playback', []),
    A('play-frames', '显示全部帧', 'Show all frames', 'playback', []),
    // 系统（鼠标类，只读展示）
    A('move-item', '移动项', 'Move item', 'controls', ['Left MB']),
    A('axis-move', '轴向移动', 'Axis snapped move item', 'controls', ['Left MB+Shift']),
    A('neighbor-move', '邻居吸附移动', 'Neighbor snapped move item', 'controls', ['Left MB+Shift+Space']),
    A('rotate-item', '旋转', 'Rotate', 'controls', ['Left MB+Mod']),
    A('snapped-rotate', '吸附旋转', 'Snapped rotate', 'controls', ['Left MB+Mod+Shift']),
    A('scale-item', '缩放', 'Scale', 'controls', ['Left MB+Alt+Mod']),
    A('flip-item', '翻转', 'Flip', 'controls', ['Left MB+Alt+Shift']),
    A('opacity-item', '不透明度', 'Change opacity', 'controls', ['Left MB+Alt+Mod+Shift']),
    A('crop-selection', '裁剪选择', 'Crop selection', 'controls', ['Left MB+C']),
    A('pan-cropping', '裁剪内平移', 'Pan cropping', 'controls', ['Left MB+V']),
    A('zoom-cropping', '裁剪内缩放', 'Zoom cropping', 'controls', ['Left MB+Shift+V']),
    A('zoom-view', '缩放视图', 'Zoom', 'controls', ['Left MB+Z']),
    A('color-code', '取色', 'Show color code', 'controls', ['Left MB+S']),
    A('coords', '显示坐标', 'Show image coordinates', 'controls', ['Left MB+D']),
    A('pan', '平移', 'Pan', 'controls', ['Left MB+Alt', 'Middle MB']),
    A('pan-locked', '锁定画布时平移', 'Pan (while locked)', 'controls', ['Left MB']),
    A('pan-maximized', '最大化时平移', 'Pan (while maximized)', 'controls', ['Right MB']),
    A('move-window', '移动窗口', 'Move window', 'system', ['Right MB']),
    A('context-menu', '打开菜单', 'Open context menu', 'system', ['Right MB']),
    A('resize-window', '调整窗口大小', 'Resize window', 'system', ['Left MB']),
    A('select-items', '选择项', 'Select items', 'controls', ['Left MB']),
  ];

  window.PRCYQ.ACTION_MAP = {};
  for (const a of window.PRCYQ.ACTIONS) window.PRCYQ.ACTION_MAP[a.id] = a;

  window.PRCYQ.GROUPS = {
    file: '文件与场景', edit: '编辑', view: '视图与相机', mode: '窗口模式',
    appearance: '外观', images: '图片与项目', arrange: '排列', align: '对齐与分布',
    normalize: '统一尺寸', draw: '绘制', note: '便签文本', playback: '播放',
    controls: '鼠标控制', system: '系统',
  };

  // 按键归一化：把 KeyboardEvent 转成绑定字符串
  const MOD = navigator.platform.includes('Mac') ? 'Mod' : 'Ctrl';
  window.PRCYQ.MOD = MOD;

  window.PRCYQ.eventToCombo = function (e) {
    const k = e.key;
    if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(k)) return null;
    // 规范化修饰键顺序：Alt → Mod → Ctrl → Shift（与动作表默认值一致）
    const mods = [];
    if (e.altKey) mods.push('Alt');
    if (e.metaKey) mods.push('Mod');
    if (e.ctrlKey) {
      if (MOD === 'Ctrl') { if (!mods.includes('Mod')) mods.push('Mod'); }
      else mods.push('Ctrl');
    }
    if (e.shiftKey) mods.push('Shift');
    let key = k;
    if (key === ' ') key = 'Space';
    else if (key === 'Escape') key = 'Escape';
    else if (key === 'Backspace') key = 'Backspace';
    else if (key === 'Delete') key = 'Delete';
    else if (key === 'Enter') key = 'Enter';
    else if (key === 'ArrowLeft') key = 'ArrowLeft';
    else if (key === 'ArrowRight') key = 'ArrowRight';
    else if (key === 'ArrowUp') key = 'ArrowUp';
    else if (key === 'ArrowDown') key = 'ArrowDown';
    else if (key.length === 1) key = key.toUpperCase();
    else if (key.startsWith('F') && key.length <= 3) key = key;
    else if (key === 'Tab') key = 'Tab';
    return (mods.length ? mods.join('+') + '+' : '') + key;
  };

  window.PRCYQ.formatCombo = function (combo) {
    if (!combo) return '—';
    let s = combo
      .replace(/Mod/g, MOD === 'Mod' ? '⌘' : 'Ctrl')
      .replace(/Alt/g, MOD === 'Mod' ? '⌥' : 'Alt')
      .replace(/Shift/g, '⇧')
      .replace(/Ctrl/g, '⌃')
      .replace(/\bArrowLeft\b/g, '←')
      .replace(/\bArrowRight\b/g, '→')
      .replace(/\bArrowUp\b/g, '↑')
      .replace(/\bArrowDown\b/g, '↓')
      .replace(/\bBackspace\b/g, '⌫')
      .replace(/\bSpace\b/g, 'Space')
      .replace(/\bEscape\b/g, 'Esc')
      .replace(/\bEnter\b/g, '↵')
      .replace(/\bLeft MB\b/g, '左键')
      .replace(/\bMiddle MB\b/g, '中键')
      .replace(/\bRight MB\b/g, '右键');
    return s.replace(/\+ /g, '').replace(/\+/g, '');
  };
})();
