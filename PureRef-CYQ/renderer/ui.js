/* MuseNex — 界面：工具栏、菜单、设置、对话框、导出 */
window.PRCYQ = window.PRCYQ || {};
(function () {
  const P = window.PRCYQ;
  const S = P.S;
  const capi = window.musenex;

  const listeners = {};
  P.on = (name, fn) => { (listeners[name] = listeners[name] || []).push(fn); };
  P.emit = (name, data) => { for (const fn of listeners[name] || []) { try { fn(data); } catch (e) { console.warn(e); } } };

  let dialogRoot, menuRoot, toastTimer = null;
  let toolbarTimer = null;
  let saveDir = null;

  // ---------- 通用 DOM ----------
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'html') el.innerHTML = v;
        else if (k === 'text') el.textContent = v;
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return el;
  }
  P.h = h;

  function svg(d, viewBox) {
    if (!d) return '';
    const body = String(d).includes('<') ? d : `<path d="${d}"/>`;
    return `<svg viewBox="${viewBox || '0 0 24 24'}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  }
  const ICONS = {
    plus: 'M12 5v14M5 12h14',
    image: 'M3 5h18v14H3z M3 15l5-5 4 4 3-3 6 6',
    note: 'M5 4h14v12l-4 4H5z M15 20v-4h4',
    draw: 'M4 20l4-1 10-10-3-3L5 16z',
    grid: 'M3 9h18M3 15h18M9 3v18M15 3v18',
    hierarchy: 'M4 6h6M4 12h10M4 18h6M16 6h4M16 12h4',
    settings: 'M12 8a4 4 0 100 8 4 4 0 000-8z M12 2v3M12 19v3M2 12h3M19 12h3M4.5 4.5l2 2M17.5 17.5l2 2M19.5 4.5l-2 2M6.5 17.5l-2 2',
    lock: 'M6 11h12v9H6z M9 11V8a3 3 0 016 0v3',
    unlock: 'M6 11h12v9H6z M9 11V8a3 3 0 015.6-1.5',
    opacity: 'M12 3a9 9 0 100 18 9 9 0 000-18z M12 3v18',
    organize: 'M4 6h16M4 12h16M4 18h10',
    palette: 'M12 3a9 9 0 100 18h1a2 2 0 002-2 2 2 0 012-2h1a3 3 0 003-3 9 9 0 00-9-9z',
    play: 'M7 4l12 8-12 8z',
    pause: 'M8 5v14M16 5v14',
    prev: 'M15 5l-7 7 7 7M7 5v14',
    next: 'M9 5l7 7-7 7M17 5v14',
    trash: 'M4 7h16M9 7V5h6v2M7 7l1 13h8l1-13',
    check: 'M5 12l5 5L20 7',
    export: 'M12 4v12M7 11l5 5 5-5M5 20h14',
    folder: 'M3 6h7l2 2h9v11H3z',
    close: 'M6 6l12 12M18 6L6 18',
    comment: 'M4 5h16v11H9l-5 4z',
    crop: 'M6 3v14a1 1 0 001 1h14M3 6h14a1 1 0 011 1v14',
    duplicate: 'M9 9h11v11H9z M4 4h11v3M4 4v11h3',
    alignLeft: 'M4 3v18M8 7h12M8 13h8',
    nodes: 'M4 4h6v6H4z M14 14h6v6h-6z M10 7h3a2 2 0 012 2v5 M14 17h-3a2 2 0 01-2-2v-5',
    board: 'M4 5h16v11H4z M8 20h8 M12 16v4',
  };
  P.ICONS = ICONS;

  // ---------- 提示 ----------
  P.toast = function (msg, ms) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), ms || 2200);
  };

  // ---------- 对话框 ----------
  function ensureDialogRoot() {
    dialogRoot = dialogRoot || document.getElementById('overlay-root');
    return dialogRoot;
  }
  P.dialog = function (opts) {
    const root = ensureDialogRoot();
    root.innerHTML = '';
    root.classList.remove('hidden');
    const bodyEl = h('div', { class: 'dialog-body' });
    if (opts.body) {
      if (typeof opts.body === 'string') bodyEl.innerHTML = opts.body;
      else bodyEl.appendChild(opts.body);
    }
    const foot = h('div', { class: 'dialog-foot' });
    if (opts.footerLeft) foot.appendChild(opts.footerLeft);
    for (const b of opts.buttons || []) {
      foot.appendChild(h('button', {
        class: 'btn ' + (b.kind || ''), text: b.label,
        onclick: () => { b.onClick ? b.onClick(close) : close(); },
      }));
    }
    const dlg = h('div', { class: 'dialog ' + (opts.className || ''), style: opts.style || {} },
      h('div', { class: 'dialog-head' },
        opts.title || '',
        opts.noClose ? null : h('button', { class: 'close-x', html: svg(ICONS.close), onclick: () => close() })),
      bodyEl,
      foot);
    root.appendChild(dlg);
    function close() {
      root.classList.add('hidden');
      root.innerHTML = '';
      opts.onClose && opts.onClose();
    }
    root.onclick = (e) => { if (e.target === root && !opts.noClose) close(); };
    const onKey = (e) => {
      if (e.key === 'Escape' && !opts.noClose) { e.preventDefault(); close(); }
      if (e.key === 'Enter' && opts.enterOk) { e.preventDefault(); close(); }
    };
    window.addEventListener('keydown', onKey, true);
    const oldClose = close;
    close = function () { window.removeEventListener('keydown', onKey, true); oldClose(); };
    P.currentDialog = { el: dlg, close, body: bodyEl };
    return P.currentDialog;
  };

  P.closeDialog = function () {
    const root = ensureDialogRoot();
    root.classList.add('hidden'); root.innerHTML = '';
    P.currentDialog = null;
  };

  function isDialogOpen() { return !ensureDialogRoot().classList.contains('hidden'); }
  P.isDialogOpen = isDialogOpen;

  // 设置行控件
  function row(label, control, opts) {
    opts = opts || {};
    const el = h('div', { class: 'field' + (opts.sub ? ' sub' : '') }, h('label', { text: label }), h('div', { class: 'grow' }, control));
    const wrap = h('div', {});
    wrap.appendChild(el);
    if (opts.desc) wrap.appendChild(h('div', { class: 'desc', text: opts.desc }));
    return wrap;
  }
  function ctlSelect(options, value, onChange) {
    const sel = h('select', { class: 'ctl' });
    for (const o of options) {
      const opt = h('option', { value: String(o[0]), text: o[1] });
      if (String(o[0]) === String(value)) opt.selected = true;
      sel.appendChild(opt);
    }
    sel.onchange = () => onChange(sel.value);
    return sel;
  }
  function ctlCheck(value, onChange) {
    const box = h('div', { class: 'checkbox' + (value ? ' checked' : '') });
    box.onclick = () => { const v = !box.classList.contains('checked'); box.classList.toggle('checked', v); onChange(v); };
    return box;
  }
  function ctlNumber(value, onChange, opts) {
    opts = opts || {};
    const inp = h('input', { class: 'ctl narrow', type: 'number', value: String(value), min: opts.min, max: opts.max, step: opts.step || 1 });
    inp.onchange = () => onChange(Number(inp.value));
    return h('span', { class: 'range-box' }, inp, opts.suffix ? h('span', { class: 'tlabel', text: opts.suffix }) : null);
  }
  function ctlRange(value, onChange, opts) {
    opts = opts || {};
    const r = h('input', { type: 'range', min: opts.min || 0, max: opts.max || 100, value: String(value) });
    const v = h('span', { class: 'range-val', text: (opts.fmt ? opts.fmt(value) : value) });
    r.oninput = () => { v.textContent = opts.fmt ? opts.fmt(r.value) : r.value; onChange(Number(r.value)); };
    return h('span', { class: 'range-box' }, r, v);
  }
  function ctlColor(value, onChange) {
    const inp = h('input', { type: 'color', class: 'swatch', value, style: { padding: '0', background: 'transparent' } });
    inp.oninput = () => onChange(inp.value);
    return inp;
  }
  function ctlText(value, onChange, opts) {
    opts = opts || {};
    const inp = h('input', { class: 'ctl ' + (opts.wide ? 'wide' : ''), value: String(value == null ? '' : value), placeholder: opts.placeholder || '' });
    inp.onchange = () => onChange(inp.value);
    return inp;
  }
  P.ui = { row, ctlSelect, ctlCheck, ctlNumber, ctlRange, ctlColor, ctlText };

  // ---------- 工具栏 ----------
  function iconBtn(icon, title, onclick, active) {
    return h('button', { class: 'tbtn' + (active ? ' active' : ''), title, html: svg(ICONS[icon] || ICONS.plus), onclick });
  }
  function textBtn(label, title, onclick, active) {
    return h('button', { class: 'tbtn' + (active ? ' active' : ''), title, text: label, onclick });
  }

  P.refreshToolbar = function () {
    const tb = document.getElementById('toolbar');
    tb.innerHTML = '';
    const sel = P.selectedItems();
    const editing = S.editingNote;

    if (S.crop) {
      tb.appendChild(textBtn('裁剪中', '拖动角点调整裁剪范围', () => {}));
      tb.appendChild(h('div', { class: 'tsep' }));
      tb.appendChild(textBtn('应用 ↵', '应用裁剪', () => P.applyCropFromUI()));
      tb.appendChild(textBtn('取消 Esc', '取消裁剪', () => { S.crop = null; P.requestRender(); }));
      showToolbar();
      return;
    }
    if (editing) {
      tb.appendChild(iconBtn('note', '完成编辑 (Esc)', () => P.finishEditNote(), true));
      tb.appendChild(h('div', { class: 'tsep' }));
      for (const [cmd, label, title] of [
        ['bold', 'B', '加粗 ⌘B'], ['italic', 'I', '斜体 ⌘I'], ['underline', 'U', '下划线 ⌘U'], ['strikeThrough', 'S', '删除线'],
      ]) {
        tb.appendChild(h('button', {
          class: 'tbtn', title, html: `<b style="font-size:13px;${cmd === 'italic' ? 'font-style:italic' : cmd === 'underline' ? 'text-decoration:underline' : cmd === 'strikeThrough' ? 'text-decoration:line-through' : ''}">${label}</b>`,
          onmousedown: (e) => e.preventDefault(), onclick: () => { document.execCommand(cmd); P.noteChanged(); },
        }));
      }
      tb.appendChild(h('div', { class: 'tsep' }));
      tb.appendChild(iconBtn('note', '项目符号', () => { document.execCommand('insertUnorderedList'); P.noteChanged(); }));
      tb.appendChild(textBtn('1.', '编号列表', () => { document.execCommand('insertOrderedList'); P.noteChanged(); }));
      tb.appendChild(textBtn('☐', '待办列表', () => { document.execCommand('insertHTML', false, '<input type="checkbox"> '); P.noteChanged(); }));
      tb.appendChild(h('div', { class: 'tsep' }));
      tb.appendChild(textBtn('A+', '增大字号', () => { document.execCommand('fontSize', false, '5'); P.noteChanged(); }));
      tb.appendChild(textBtn('A-', '减小字号', () => { document.execCommand('fontSize', false, '2'); P.noteChanged(); }));
      tb.appendChild(ctlColor(P.currentNote() ? P.currentNote().color : '#e8e8e8', (v) => {
        const it = P.currentNote(); if (!it) return;
        const box = P.getNoteEl(it.id); if (box) box.style.setProperty('--note-color', v);
        document.execCommand('foreColor', false, v); it.color = v; P.noteChanged();
      }));
      tb.appendChild(h('div', { class: 'tsep' }));
      tb.appendChild(textBtn('自动尺寸', '切换便签自动尺寸', () => {
        const it = P.currentNote(); if (!it) return; it.autoSize = !it.autoSize; P.toast(it.autoSize ? '便签自动尺寸开' : '便签自动尺寸关');
        P.finishEditNote();
      }));
      tb.appendChild(textBtn('完成', '完成编辑', () => P.finishEditNote()));
      showToolbar();
      return;
    }
    if (S.tool !== 'select') {
      tb.appendChild(textBtn('选择', '选择工具 (Esc)', () => P.setTool('select'), false));
      tb.appendChild(h('div', { class: 'tsep' }));
      const tools = [['pen', '画笔', 'D'], ['line', '直线', 'L'], ['ellipse', '椭圆', 'C'], ['rect', '矩形', 'R'], ['eraser', '橡皮', 'E']];
      for (const [t, label, key] of tools) {
        tb.appendChild(textBtn(label + ' ' + key, label, () => P.setTool(t), S.tool === t));
      }
      tb.appendChild(h('div', { class: 'tsep' }));
      const widths = [['细', 2], ['中', 4], ['粗', 8]];
      for (const [label, w] of widths) {
        tb.appendChild(textBtn(label, '线宽 ' + w, () => { S.pen.width = w; P.refreshToolbar(); }, S.pen.width === w));
      }
      tb.appendChild(h('div', { class: 'tsep' }));
      for (const [label, st] of [['实线', 'solid'], ['点线', 'dotted'], ['箭头', 'arrow']]) {
        tb.appendChild(textBtn(label, '线型', () => { S.pen.style = st; P.refreshToolbar(); }, S.pen.style === st));
      }
      tb.appendChild(h('div', { class: 'tsep' }));
      tb.appendChild(ctlColor(S.pen.color, (v) => { S.pen.color = v; P.refreshToolbar(); }));
      showToolbar();
      return;
    }

    // 主工具栏
    tb.appendChild(iconBtn('plus', '添加（图片 / 便签 / 粘贴）', (e) => P.showAddMenu(e.currentTarget)));
    if (sel.length) {
      tb.appendChild(h('div', { class: 'tsep' }));
      const op = sel.length === 1 ? (sel[0].opacity == null ? 1 : sel[0].opacity) : 1;
      tb.appendChild(h('span', { class: 'tlabel', html: svg(ICONS.opacity) }));
      const slider = h('input', { class: 'tslider', type: 'range', min: '5', max: '100', value: String(Math.round(op * 100)) });
      const val = h('span', { class: 'tvalue', text: Math.round(op * 100) + '%' });
      slider.oninput = () => {
        const v = Number(slider.value) / 100; val.textContent = slider.value + '%';
        for (const it of P.selectedItems()) it.opacity = v;
        P.markDirty(); P.requestRender();
      };
      tb.appendChild(slider); tb.appendChild(val);
      tb.appendChild(h('div', { class: 'tsep' }));
    }
    tb.appendChild(iconBtn('organize', '组织：排列 / 对齐 / 分布 / 统一尺寸', (e) => P.showOrganizeMenu(e.currentTarget)));
    tb.appendChild(iconBtn('grid', '切换网格 (G)', () => P.runAction('toggle-grid'), S.scene.grid !== 'none'));
    tb.appendChild(iconBtn('lock', '锁定画布 (⌘R)', () => P.runAction('lock-canvas'), S.scene.locked));
    tb.appendChild(iconBtn('hierarchy', '层级面板 (⌘J)', () => P.runAction('hierarchy')));
    tb.appendChild(iconBtn('draw', '绘制 (⇧⌘D)', () => P.runAction('draw'), S.tool !== 'select'));
    for (const w of P.viewWorkspaces()) {
      tb.appendChild(iconBtn(w.icon || 'nodes', `${w.name}${w.shortcutLabel ? ' (' + w.shortcutLabel + ')' : ''}`, () => P.setWorkspace(w.id)));
      if ((w.capabilities || []).includes('addImages') && P.selectedItems().some((i) => i.type === 'image')) {
        tb.appendChild(iconBtn('export', `发送选中图片到${w.name}`, () => P.sendSelectionToView(w.id)));
      }
    }
    tb.appendChild(iconBtn('settings', '设置 (⌘U)', () => P.runAction('settings')));

    // 播放工具（GIF）
    const anim = sel.find((i) => i.type === 'image' && S.images.get(i.imgId) && S.images.get(i.imgId).animated);
    if (anim) {
      tb.appendChild(h('div', { class: 'tsep' }));
      tb.appendChild(iconBtn('prev', '上一帧', () => P.playbackStep(anim, -1)));
      tb.appendChild(iconBtn('pause', '播放/暂停', () => P.playbackToggle(anim)));
      tb.appendChild(iconBtn('next', '下一帧', () => P.playbackStep(anim, 1)));
    }
    showToolbar();
  };

  function showToolbar() {
    const tb = document.getElementById('toolbar');
    tb.classList.remove('hidden');
    tb.classList.add('visible');
    clearTimeout(toolbarTimer);
    toolbarTimer = setTimeout(() => {
      if (!tb.matches(':hover')) tb.classList.remove('visible');
    }, 2600);
  }
  P.showToolbar = showToolbar;

  P.currentNote = function () { return S.editingNote ? P.itemById(S.editingNote) : null; };
  P.noteChanged = function () {
    const it = P.currentNote();
    if (!it) return;
    const el = P.getNoteEl(it.id);
    if (el) it.html = el.firstChild.innerHTML;
    P.markDirty();
  };

  // 底部热区显示工具栏
  document.addEventListener('mousemove', (e) => {
    if (e.clientY > window.innerHeight - 90) showToolbar();
  });

  // ---------- 添加 / 组织 菜单 ----------
  P.showAddMenu = function (anchor) {
    const r = anchor.getBoundingClientRect();
    P.showMenu([
      { label: '打开图片…', shortcut: '⌘I', action: 'open-images' },
      { label: '粘贴', shortcut: '⌘V', action: 'paste' },
      { sep: true },
      { label: '新建便签', shortcut: '⌘N', action: 'note' },
      { label: '绘制工具', shortcut: '⇧⌘D', action: 'draw' },
    ], r.left, r.top - 8, 'up');
  };
  P.showOrganizeMenu = function (anchor) {
    const r = anchor.getBoundingClientRect();
    const has = S.sel.size > 0;
    P.showMenu([
      { label: '置顶', shortcut: '↑', action: 'send-front', disabled: !has },
      { label: '置底', shortcut: '↓', action: 'send-back', disabled: !has },
      { sep: true },
      { label: '排列', sub: [
        { label: '最优', shortcut: '⌘P', action: 'arrange-optimal' },
        { label: '按名称', shortcut: '⌥⌘N', action: 'arrange-name' },
        { label: '按路径', shortcut: '⌥⌘D', action: 'arrange-path' },
        { label: '按层级顺序', shortcut: '⌥⌘O', action: 'arrange-order' },
        { label: '按添加顺序', shortcut: '⌥⌘A', action: 'arrange-add' },
        { label: '随机', shortcut: '⌥⌘R', action: 'arrange-random' },
      ] },
      { label: '对齐', sub: [
        { label: '左', shortcut: '⌘←', action: 'align-left', disabled: !has },
        { label: '右', shortcut: '⌘→', action: 'align-right', disabled: !has },
        { label: '上', shortcut: '⌘↑', action: 'align-top', disabled: !has },
        { label: '下', shortcut: '⌘↓', action: 'align-bottom', disabled: !has },
        { label: '堆叠', shortcut: '⌥⌘S', action: 'stack', disabled: !has },
      ] },
      { label: '分布', sub: [
        { label: '水平', action: 'dist-h', disabled: !has },
        { label: '垂直', action: 'dist-v', disabled: !has },
      ] },
      { label: '统一尺寸', sub: [
        { label: '高度', action: 'norm-height', disabled: !has },
        { label: '宽度', action: 'norm-width', disabled: !has },
        { label: '尺寸', action: 'norm-size', disabled: !has },
        { label: '面积', action: 'norm-area', disabled: !has },
        { label: '比例', action: 'norm-scale', disabled: !has },
      ] },
      { sep: true },
      { label: '全选', shortcut: '⌘A', action: 'select-all' },
      { label: '删除', shortcut: '⌫', action: 'delete', disabled: !has },
    ], r.left, r.top - 8, 'up');
  };

  // ---------- 菜单系统 ----------
  P.showMenu = function (items, x, y, dir) {
    const root = document.getElementById('menu-root');
    root.innerHTML = '';
    root.classList.remove('hidden');
    const build = (list, level, px, py, openLeft) => {
      const menu = h('div', { class: 'menu' });
      for (const it of list) {
        if (it.sep) { menu.appendChild(h('div', { class: 'menu-sep' })); continue; }
        const rowEl = h('div', { class: 'menu-item' + (it.disabled ? ' disabled' : '') + (it.checked ? ' open' : '') },
          h('span', { class: 'mi-label', text: it.label }),
          it.shortcut ? h('span', { class: 'mi-key', text: it.shortcut }) : null,
          it.sub ? h('span', { class: 'mi-arrow', text: '▸' }) : null);
        if (it.sub) {
          rowEl.onmouseenter = () => {
            const r = rowEl.getBoundingClientRect();
            const sub = build(it.sub, level + 1, openLeft ? r.left : r.right - 4, r.top - 5, false);
            sub.style.zIndex = 120 + level;
          };
        } else if (it.action) {
          rowEl.onclick = () => { close(); P.runAction(it.action); };
        } else if (it.onClick) {
          rowEl.onclick = () => { close(); it.onClick(); };
        }
        menu.appendChild(rowEl);
      }
      menu.style.left = px + 'px';
      menu.style.top = py + 'px';
      menu.style.zIndex = 110 + level;
      root.appendChild(menu);
      return menu;
    };
    const first = build(items, 0, x, y);
    const rect = first.getBoundingClientRect();
    if (rect.right > window.innerWidth) first.style.left = (window.innerWidth - rect.width - 8) + 'px';
    if (rect.bottom > window.innerHeight) first.style.top = (window.innerHeight - rect.height - 8) + 'px';
    if (dir === 'up') first.style.top = (y - rect.height) + 'px';
    function close() { root.classList.add('hidden'); root.innerHTML = ''; }
    root.onclick = (e) => { if (e.target === root) close(); };
    P.menuClose = close;
    return close;
  };

  P.openContextMenu = function (x, y) {
    if (isDialogOpen()) return;
    const sel = S.sel.size;
    P.showMenu([
      { label: '帮助', shortcut: '⌃H', action: 'help' },
      { label: '层级面板', shortcut: '⌘J', action: 'hierarchy' },
      { label: '设置…', shortcut: '⌘U', action: 'settings' },
      { sep: true },
      { label: '撤销', shortcut: '⌘Z', action: 'undo' },
      { label: '重做', shortcut: '⇧⌘Z', action: 'redo' },
      { sep: true },
      { label: '复制', shortcut: '⌘C', action: 'copy' },
      { label: '粘贴', shortcut: '⌘V', action: 'paste' },
      { label: '便签', shortcut: '⌘N', action: 'note' },
      { label: '绘制', shortcut: '⇧⌘D', action: 'draw' },
      { sep: true },
      { label: '模式', sub: [
        { label: '鼠标穿透', shortcut: '⌘T', action: 'transparent-mouse' },
        { label: '叠加选择', shortcut: '⌘Y', action: 'overlay-selection' },
        { label: '始终置顶', shortcut: '⇧⌘A', action: 'always-on-top' },
        { label: '始终置底', shortcut: '⇧⌘B', action: 'always-on-bottom' },
      ] },
      { label: '窗口', sub: [
        { label: '最大化', shortcut: '⌘F', action: 'maximize' },
        { label: '最小化', shortcut: '⌘M', action: 'minimize' },
        { label: '缩放到选择', shortcut: '⇧⌘R', action: 'resize-selection' },
        { label: '锁定窗口', shortcut: '⌘W', action: 'lock-window' },
        { label: '新窗口', action: 'new-window' },
      ] },
      { label: '画布', sub: [
        { label: '网格：无', action: 'grid-none' },
        { label: '网格：线', action: 'grid-lines' },
        { label: '网格：点', action: 'grid-dots' },
        { label: '吸附网格', action: 'grid-snap' },
        { sep: true },
        { label: '重置相机', action: 'reset-camera' },
        { label: '重置缩放', shortcut: '⌘0', action: 'reset-zoom' },
        { label: '灰度', action: 'grayscale' },
        { label: '锁定画布', shortcut: '⌘R', action: 'lock-canvas' },
      ] },
      { label: '图片', sub: [
        { label: '全选', shortcut: '⌘A', action: 'select-all' },
        { label: '分组', shortcut: '⌘G', action: 'group', disabled: !sel },
        { label: '解组', shortcut: '⇧⌘G', action: 'ungroup', disabled: !sel },
        { label: '裁剪图片', action: 'crop', disabled: !sel },
        { label: '注释…', shortcut: '⌥C', action: 'comment', disabled: !sel },
        { label: '重置裁剪', action: 'reset-crop', disabled: !sel },
        { label: '重置变换', action: 'reset-transform', disabled: !sel },
        { label: '删除', shortcut: '⌫', action: 'delete', disabled: !sel },
      ] },
      { label: '保存', sub: [
        { label: '保存', shortcut: '⌘S', action: 'save' },
        { label: '另存为…', shortcut: '⇧⌘S', action: 'save-as' },
        { label: '导出场景…', shortcut: '⌘E', action: 'export-scene' },
        { label: '导出全部图片…', action: 'export-all-images' },
      ] },
      { label: '打开', sub: [
        { label: '打开场景…', shortcut: '⌘L', action: 'open-scene' },
        { label: '打开图片…', shortcut: '⌘I', action: 'open-images' },
        { label: '最近文件', action: 'open-recent' },
      ] },
      { label: '新建场景', shortcut: '⌘K', action: 'new-scene' },
      { sep: true },
      ...workspaceMenuEntries(!!sel),
      { sep: true },
      { label: '关闭', shortcut: '⌘Q', action: 'close' },
    ], x + 2, y + 2);
  };

  // ---------- 设置 ----------
  const TABS = [
    { id: 'performance', label: '性能', icon: 'settings' },
    { id: 'appearance', label: '外观', icon: 'palette' },
    { id: 'saving', label: '保存与加载', icon: 'folder' },
    { id: 'window', label: '窗口', icon: 'grid' },
    { id: 'images', label: '图片', icon: 'image' },
    { id: 'keys', label: '快捷键', icon: 'organize' },
    { id: 'system', label: '系统', icon: 'settings' },
  ];
  let settingsTab = 'performance';

  P.openSettings = function (tab) {
    if (tab) settingsTab = tab;
    const body = h('div', { class: 'dialog-body' });
    const side = h('div', { class: 'settings-side' });
    const search = h('input', { placeholder: '搜索设置…' });
    side.appendChild(h('div', { class: 'settings-search' }, h('span', { text: '⌕' }), search));
    const main = h('div', { class: 'settings-main' });
    const tabButtons = new Map();
    for (const t of TABS) {
      const btn = h('button', { class: 'tab-btn' + (settingsTab === t.id ? ' active' : ''), html: svg(ICONS[t.icon]) + `<span>${t.label}</span>` });
      btn.onclick = () => {
        settingsTab = t.id;
        tabButtons.forEach((b, id) => b.classList.toggle('active', id === t.id));
        renderTab();
      };
      tabButtons.set(t.id, btn);
      side.appendChild(btn);
    }
    body.appendChild(side); body.appendChild(main);

    const foot = h('div', { class: 'settings-foot' },
      h('button', { class: 'btn', text: '恢复默认', onclick: () => { P.patchSettings(JSON.parse(JSON.stringify(P.DEFAULT_SETTINGS))); P.toast('已恢复默认设置'); renderTab(); } }),
      h('span', { class: 'grow' }),
      h('button', { class: 'btn ghost', text: '导出设置', onclick: async () => {
        const p = await capi.dialog.saveFile({ defaultPath: 'pureref-cyq-settings.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
        if (!p) return;
        await capi.fs.writeFile(p, new TextEncoder().encode(JSON.stringify(P.settings, null, 2)));
        P.toast('设置已导出');
      } }),
      h('button', { class: 'btn ghost', text: '导入设置', onclick: async () => {
        const r = await capi.dialog.openScene();
        if (!r) return;
        const data = await capi.fs.readFile(r);
        if (data && !data.error) { try { P.patchSettings(JSON.parse(new TextDecoder().decode(data))); renderTab(); P.toast('设置已导入'); } catch { P.toast('导入失败'); } }
      } }),
    );

    function renderTab() {
      main.innerHTML = '';
      const title = TABS.find((t) => t.id === settingsTab);
      main.appendChild(h('h3', { class: 'tab-title', text: title.label }));
      const content = buildTab(settingsTab);
      main.appendChild(content);
      // 搜索过滤
      search.oninput = () => {
        const q = search.value.trim().toLowerCase();
        for (const el of content.children) {
          const txt = el.textContent.toLowerCase();
          el.style.display = !q || txt.includes(q) ? '' : 'none';
        }
      };
    }
    renderTab();

    const dlg = P.dialog({
      title: '设置', className: 'settings', body: h('div', { class: 'dialog-body', style: { padding: '0', display: 'flex', minHeight: '0', flex: '1' } }),
      buttons: [],
    });
    // 重排：把 body 放到 dialog 里
    dlg.body.remove();
    const head = dlg.el.querySelector('.dialog-head');
    dlg.el.insertBefore(body, head.nextSibling);
    dlg.el.appendChild(foot);
    head.querySelector('.close-x').onclick = () => P.closeDialog();
  };

  function buildTab(tab) {
    const wrap = h('div', {});
    const st = P.settings;
    if (tab === 'performance') {
      wrap.appendChild(row('自动优化导入的图片', ctlSelect([['none', '关闭'], ['large', '大图警告'], ['always', '总是优化'], ['custom', '自定义规则…']], st.autoOptimize, (v) => {
        if (v === 'custom') P.toast('自定义规则：满足宽/高/面积/文件大小的图片将按动作处理（本版本使用默认阈值）');
        P.patchSettings({ autoOptimize: v });
      }), { desc: '超限图片可在导入时降采样或转码；原始数据仍保存在场景文件中（若开启嵌入）。' }));
      wrap.appendChild(row('管理当前场景', h('button', { class: 'btn small', text: '管理', onclick: () => P.openManageImages() })));
      wrap.appendChild(row('撤销历史步数', ctlNumber(st.undoLimit, (v) => P.patchSettings({ undoLimit: Math.max(20, v) }), { min: 20, max: 2000 })));
      wrap.appendChild(row('性能模式', ctlSelect([['none', '不缓存（省内存）'], ['disk', '磁盘缓存'], ['memory', '内存缓存'], ['low', '内存缓存（低缩放画质）']], st.performanceMode, (v) => P.patchSettings({ performanceMode: v }))));
      wrap.appendChild(row('CPU 核心分配', ctlRange(st.cpuCores, (v) => P.patchSettings({ cpuCores: v }), { min: 10, max: 100, fmt: (v) => ' ' + v + '%' })));
      wrap.appendChild(row('生成场景缩略图', ctlCheck(st.thumbnails, (v) => P.patchSettings({ thumbnails: v }))));
      wrap.appendChild(row('临时目录', h('span', { class: 'range-box' }, h('span', { class: 'ctl', style: { minWidth: '230px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, text: st.tempDir || '系统默认' }), h('button', { class: 'btn small', text: '选择…', onclick: async () => {
        const p = await capi.dialog.chooseFolder(st.tempDir);
        if (p) { P.patchSettings({ tempDir: p }); P.openSettings('performance'); P.toast('临时目录将在重启后生效'); }
      } }))));
    }
    if (tab === 'appearance') {
      wrap.appendChild(row('语言', ctlSelect([['zh', '简体中文']], st.language, (v) => P.patchSettings({ language: v })), { desc: '当前版本仅提供简体中文界面。' }));
      wrap.appendChild(row('标题栏可见性', ctlSelect([['hover', '悬停时显示'], ['always', '始终显示'], ['never', '隐藏']], st.titleBarVisibility, (v) => P.patchSettings({ titleBarVisibility: v }))));
      wrap.appendChild(row('网格样式', ctlSelect([['none', '无'], ['lines', '线'], ['dots', '点']], st.grid, (v) => { P.patchSettings({ grid: v }); S.scene.grid = v; P.markDirty(); P.renderAll(); })));
      wrap.appendChild(row('吸附到网格', ctlCheck(st.snapGrid, (v) => { P.patchSettings({ snapGrid: v }); S.scene.snapGrid = v; P.markDirty(); })));
      wrap.appendChild(row('主窗口边框', ctlCheck(st.windowBorder, (v) => P.patchSettings({ windowBorder: v }))));
      wrap.appendChild(row('窗口圆角', ctlCheck(st.roundedCorners, (v) => P.patchSettings({ roundedCorners: v }))));
      wrap.appendChild(row('应用不透明度', ctlRange(st.appOpacity, (v) => { P.patchSettings({ appOpacity: v }); P.applyOpacity(); }, { min: 10, max: 100, fmt: (v) => ' ' + v + '%' })));
      wrap.appendChild(row('主题预设', h('div', { class: 'theme-cards', style: { width: '100%' } },
        h('button', { class: 'theme-card dark' + (st.theme === 'dark' ? ' active' : ''), text: '暗色', onclick: () => setTheme('dark') }),
        h('button', { class: 'theme-card light' + (st.theme === 'light' ? ' active' : ''), text: '亮色', onclick: () => setTheme('light') }),
        h('button', { class: 'theme-card glass' + (st.theme === 'glass' ? ' active' : ''), text: '玻璃', onclick: () => setTheme('glass') }),
      )));
      wrap.appendChild(h('div', { class: 'keymap-group', text: '颜色' }));
      const colors = [['canvas', '画布'], ['canvasBg', '画布背景'], ['grid', '网格'], ['border', '边框'], ['selection', '选中'], ['text', '文字'], ['textHover', '文字悬停']];
      for (const [key, label] of colors) {
        wrap.appendChild(row(label, ctlColor(st.colors[key] || '#000000', (v) => {
          const colors2 = Object.assign({}, P.settings.colors, { [key]: v });
          P.patchSettings({ colors: colors2 }); P.renderAll();
        })));
      }
    }
    if (tab === 'saving') {
      wrap.appendChild(row('将图片嵌入场景文件', ctlCheck(st.embedImages, (v) => P.patchSettings({ embedImages: v })), { desc: '关闭后仅保存文件链接；移动原图后需要重新链接。' }));
      wrap.appendChild(row('启用周期性保存', ctlCheck(st.periodicSave, (v) => P.patchSettings({ periodicSave: v }))));
      wrap.appendChild(row('周期（分钟）', ctlNumber(st.periodicInterval, (v) => P.patchSettings({ periodicInterval: Math.max(1, v) }), { min: 1, max: 120 }), { sub: true }));
      wrap.appendChild(row('未保存场景行为', ctlSelect([['ask', '每次询问'], ['discard', '丢弃'], ['save', '自动保存']], st.unsavedBehavior, (v) => P.patchSettings({ unsavedBehavior: v }))));
      wrap.appendChild(row('启动时自动打开上次场景', ctlCheck(st.autoOpenLast, (v) => P.patchSettings({ autoOpenLast: v }))));
      wrap.appendChild(row('最近文件数量', ctlNumber(st.recentCount, (v) => P.patchSettings({ recentCount: Math.max(1, Math.min(20, v)) }), { min: 1, max: 20 })));
      wrap.appendChild(row('启动时显示最近文件', ctlCheck(st.showRecent, (v) => P.patchSettings({ showRecent: v }))));
    }
    if (tab === 'window') {
      wrap.appendChild(row('默认窗口模式', ctlSelect([['normal', '普通'], ['maximized', '最大化'], ['fullscreen', '全屏']], st.windowMode || 'normal', (v) => P.patchSettings({ windowMode: v }))));
      wrap.appendChild(row('滚轮功能', ctlSelect([['zoom', '缩放画布'], ['pan', '平移画布']], st.wheel, (v) => P.patchSettings({ wheel: v }))));
      wrap.appendChild(row('反转滚轮方向', ctlCheck(st.invertWheel, (v) => P.patchSettings({ invertWheel: v }))));
      wrap.appendChild(row('触控板手势', ctlCheck(st.trackpad, (v) => P.patchSettings({ trackpad: v }))));
      wrap.appendChild(row('窗口缩放时缩放场景', ctlCheck(st.scaleOnResize, (v) => P.patchSettings({ scaleOnResize: v }))));
      wrap.appendChild(row('显示窗口状态弹窗', ctlCheck(st.showStatePopup, (v) => P.patchSettings({ showStatePopup: v }))));
      wrap.appendChild(row('拖入图片后聚焦窗口', ctlCheck(st.focusAfterDrop, (v) => P.patchSettings({ focusAfterDrop: v }))));
      wrap.appendChild(row('最大化时锁定窗口', ctlCheck(st.lockMaximized, (v) => P.patchSettings({ lockMaximized: v }))));
      wrap.appendChild(row('双击标题栏最大化', ctlCheck(st.dblclickTitlebar, (v) => P.patchSettings({ dblclickTitlebar: v }))));
      wrap.appendChild(row('激活时关闭鼠标穿透', ctlCheck(st.disableTransparentOnActivate, (v) => P.patchSettings({ disableTransparentOnActivate: v }))));
      wrap.appendChild(row('窗口缩放边框宽度', ctlNumber(st.resizeBorder, (v) => P.patchSettings({ resizeBorder: v }), { min: 0, max: 30, suffix: 'px' })));
      wrap.appendChild(row('窗口移动阈值', ctlNumber(st.moveThreshold, (v) => P.patchSettings({ moveThreshold: v }), { min: 1, max: 20, suffix: 'px' })));
      wrap.appendChild(row('新文件打开方式', ctlSelect([['current', '当前窗口'], ['new', '新窗口']], st.openFilesIn, (v) => P.patchSettings({ openFilesIn: v }))));
      wrap.appendChild(row('场景状态图标位置', ctlSelect([['bottom-right', '右下'], ['bottom-left', '左下'], ['top-right', '右上'], ['top-left', '左上']], st.statusIcon, (v) => { P.patchSettings({ statusIcon: v }); P.applyStatusPosition(); })));
    }
    if (tab === 'images') {
      wrap.appendChild(row('启用变换手柄', ctlCheck(st.gizmo, (v) => P.patchSettings({ gizmo: v }))));
      wrap.appendChild(row('手柄可见性', ctlSelect([['all', '全部'], ['rotate', '仅旋转'], ['scale', '仅缩放'], ['none', '无']], st.gizmoVisibility, (v) => P.patchSettings({ gizmoVisibility: v })), { sub: true }));
      wrap.appendChild(row('手柄尺寸', ctlNumber(st.handleSize, (v) => P.patchSettings({ handleSize: v }), { min: 6, max: 24, suffix: 'px' })));
      wrap.appendChild(row('应用失焦时淡出手柄', ctlCheck(st.fadeGizmo, (v) => P.patchSettings({ fadeGizmo: v }))));
      wrap.appendChild(row('复制图片最大边长', ctlNumber(st.clipboardMax, (v) => P.patchSettings({ clipboardMax: v }), { min: 256, max: 20000, suffix: 'px' })));
      wrap.appendChild(row('图片边框', ctlSelect([['all', '全部'], ['selected', '选中'], ['none', '无']], st.imageBorders, (v) => { P.patchSettings({ imageBorders: v }); P.renderAll(); })));
      wrap.appendChild(row('对齐内边距', ctlNumber(st.alignPadding, (v) => P.patchSettings({ alignPadding: v }), { min: 0, max: 100, suffix: 'px' })));
      wrap.appendChild(row('将选中的新图片置于最前', ctlCheck(st.bringToFront, (v) => P.patchSettings({ bringToFront: v }))));
      wrap.appendChild(row('选中并打包新图片', ctlCheck(st.selectPack, (v) => P.patchSettings({ selectPack: v }))));
      wrap.appendChild(row('打包方式', ctlSelect([['optimal', '最优'], ['name', '按名称'], ['path', '按路径'], ['order', '按顺序'], ['add', '按添加顺序'], ['random', '随机']], st.packNewBy, (v) => P.patchSettings({ packNewBy: v })), { sub: true }));
      wrap.appendChild(row('编辑便签时全选文字', ctlCheck(st.selectAllTextOnEdit, (v) => P.patchSettings({ selectAllTextOnEdit: v }))));
      wrap.appendChild(row('粘贴的便签自动父级', ctlCheck(st.autoParentNotes, (v) => P.patchSettings({ autoParentNotes: v }))));
      wrap.appendChild(row('拖放项目到组中', ctlCheck(st.dragIntoGroups, (v) => P.patchSettings({ dragIntoGroups: v }))));
      wrap.appendChild(row('双击图片聚焦', ctlCheck(st.dblclickFocus, (v) => P.patchSettings({ dblclickFocus: v }))));
      wrap.appendChild(row('轮播时间间隔', ctlNumber(st.slideshowInterval, (v) => P.patchSettings({ slideshowInterval: Math.max(1, v) }), { min: 1, max: 120, suffix: '秒' })));
      wrap.appendChild(row('轮播顺序', ctlSelect([['selection', '选中顺序'], ['order', '层级顺序'], ['name', '名称']], st.slideshowOrder, (v) => P.patchSettings({ slideshowOrder: v }))));
      wrap.appendChild(row('轮播界面淡出', ctlSelect([['all', '全部淡出'], ['timer', '保留计时器']], st.slideshowFade, (v) => P.patchSettings({ slideshowFade: v }))));
      wrap.appendChild(row('默认图像采样', ctlSelect([['bilinear', '双线性'], ['nearest', '最近邻']], st.sampling, (v) => P.patchSettings({ sampling: v }))));
      wrap.appendChild(row('使用屏幕色彩配置', ctlCheck(st.screenProfile, (v) => P.patchSettings({ screenProfile: v }))));
    }
    if (tab === 'keys') {
      const search = h('input', { class: 'ctl wide', placeholder: '搜索动作…' });
      wrap.appendChild(search);
      const list = h('div', {});
      const byGroup = {};
      for (const a of P.ACTIONS) (byGroup[a.group] = byGroup[a.group] || []).push(a);
      for (const [gid, actions] of Object.entries(byGroup)) {
        const gEl = h('div', { class: 'keymap-group', text: P.GROUPS[gid] || gid });
        list.appendChild(gEl);
        for (const a of actions) {
          const rowEl = h('div', { class: 'keymap-row', 'data-search': a.zh + ' ' + a.en });
          rowEl.appendChild(h('span', { class: 'kname', text: a.zh }));
          const binds = P.getAllBindings(a.id);
          const bindEl = h('button', { class: 'kbind', text: binds[0] ? P.formatCombo(binds[0]) : '未绑定', title: '点击重新绑定' });
          bindEl.onclick = () => captureBinding(a.id, bindEl);
          rowEl.appendChild(bindEl);
          const add = h('button', { class: 'kadd', text: '+', title: '添加绑定' });
          add.onclick = () => captureBinding(a.id, bindEl, true);
          rowEl.appendChild(add);
          if (binds.length > 1) rowEl.title = '所有绑定：' + binds.map(P.formatCombo).join(' / ');
          list.appendChild(rowEl);
        }
      }
      wrap.appendChild(list);
      search.oninput = () => {
        const q = search.value.trim().toLowerCase();
        for (const el of list.children) {
          if (el.classList.contains('keymap-group')) { el.style.display = q ? 'none' : ''; continue; }
          el.style.display = !q || el.dataset.search.toLowerCase().includes(q) ? '' : 'none';
        }
      };
      wrap.appendChild(h('div', { class: 'desc', text: '提示：点击按键可重新绑定；按 Esc 取消。鼠标类动作在 "鼠标控制" 分组中展示，暂不支持改绑。' }));
    }
    if (tab === 'system') {
      wrap.appendChild(row('版本', h('span', { class: 'ctl', text: 'MuseNex 1.0.0（本地版）' })));
      wrap.appendChild(row('数据目录', h('span', { class: 'ctl', style: { maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, text: P.appInfo ? P.appInfo.userData : '' })));
      wrap.appendChild(row('本地日志', h('button', { class: 'btn small', text: '查看日志', onclick: () => P.showLog() })));
      wrap.appendChild(row('重置所有警告对话框', h('button', { class: 'btn small', text: '重置', onclick: () => { capi.settings.set({ dismissed: {} }); P.toast('已重置'); } })));
      wrap.appendChild(row('关于', h('button', { class: 'btn small', text: '关于 MuseNex', onclick: () => P.showAbout() })));
      wrap.appendChild(h('div', { class: 'desc', text: '本软件完全本地运行：无登录、无授权校验、无遥测、无联网更新。' }));
    }
    return wrap;
  }

  function setTheme(t) {
    P.patchSettings({ theme: t });
    if (t === 'glass') document.body.classList.add('glass');
    document.getElementById('scene').style.background = t === 'glass' ? 'transparent' : '';
    P.renderAll();
    P.openSettings('appearance');
  }

  function captureBinding(actionId, el, addMode) {
    el.textContent = '按下按键…';
    const handler = (e) => {
      e.preventDefault(); e.stopPropagation();
      const combo = P.eventToCombo(e);
      if (!combo) return;
      window.removeEventListener('keydown', handler, true);
      let list = P.getAllBindings(actionId);
      if (combo === 'Escape') { el.textContent = P.formatCombo(list[0]); return; }
      if (combo === 'Backspace' || combo === 'Delete') list = [];
      else if (addMode) list = list.concat([combo]);
      else list = [combo];
      P.setBindings(actionId, list);
      el.textContent = list[0] ? P.formatCombo(list[0]) : '未绑定';
      if (list.length > 1) el.title = '所有绑定：' + list.map(P.formatCombo).join(' / ');
    };
    window.addEventListener('keydown', handler, true);
  }

  // ---------- 命令面板 ----------
  P.openPalette = function () {
    const input = h('input', { placeholder: '搜索命令…', spellcheck: 'false' });
    const list = h('div', { class: 'palette-list' });
    const box = h('div', { class: 'palette' }, input, list);
    const dlg = P.dialog({ body: box, className: 'palette-dialog', style: { background: 'transparent', border: 'none', boxShadow: 'none' }, noClose: true });
    // 去掉对话框外壳，只保留内容并居中偏上
    const el = dlg.el;
    el.style.background = 'transparent'; el.style.border = 'none'; el.style.boxShadow = 'none';
    el.querySelector('.dialog-head')?.remove();
    el.querySelector('.dialog-foot')?.remove();
    el.querySelector('.dialog-body').style.padding = '0';
    const root = document.getElementById('overlay-root');
    root.style.alignItems = 'flex-start';
    root.style.background = 'rgba(0,0,0,0.35)';
    const actions = P.ACTIONS.filter((a) => !a.id.startsWith('preset') && a.group !== 'controls' && a.group !== 'system');
    let filtered = actions.slice(0, 40);
    let active = 0;
    function render() {
      list.innerHTML = '';
      if (!filtered.length) { list.appendChild(h('div', { class: 'palette-empty', text: '没有匹配的命令' })); return; }
      filtered.forEach((a, i) => {
        const bind = P.getAllBindings(a.id)[0];
        const rowEl = h('div', { class: 'palette-item' + (i === active ? ' active' : '') },
          h('span', { text: a.zh }),
          h('span', { class: 'kbd', text: bind ? P.formatCombo(bind) : '' }));
        rowEl.onclick = () => { close(); P.runAction(a.id); };
        list.appendChild(rowEl);
      });
    }
    function update() {
      const q = input.value.trim().toLowerCase();
      filtered = actions.filter((a) => !q || a.zh.toLowerCase().includes(q) || a.en.toLowerCase().includes(q)).slice(0, 40);
      active = 0; render();
    }
    function close() { P.closeDialog(); root.style.alignItems = ''; root.style.background = ''; }
    input.oninput = update;
    input.onkeydown = (e) => {
      if (e.key === 'ArrowDown') { active = Math.min(filtered.length - 1, active + 1); render(); e.preventDefault(); }
      if (e.key === 'ArrowUp') { active = Math.max(0, active - 1); render(); e.preventDefault(); }
      if (e.key === 'Enter') { const a = filtered[active]; if (a) { close(); P.runAction(a.id); } e.preventDefault(); }
      if (e.key === 'Escape') { close(); e.preventDefault(); }
      e.stopPropagation();
    };
    render();
    requestAnimationFrame(() => input.focus());
  };

  // ---------- 帮助 / 关于 ----------
  P.showHelp = function () {
    const body = h('div', { class: 'help' },
      h('h4', { text: '基本操作' }),
      h('table', {},
        [['移动窗口', '右键拖拽'], ['打开菜单', '右键单击'], ['选择图片', '左键单击 / 框选'], ['聚焦图片', '双击图片'], ['缩放到指针', '滚轮'], ['平移画布', '中键拖拽 / 空格+左键']].map(([k, v]) => h('tr', {}, h('td', { text: k }), h('td', { text: v })))),
      h('div', { class: 'help-note', text: '按住 ⌘ 拖拽旋转，⌥⌘ 缩放，⌥⇧ 翻转，⌥⇧⌘ 调整不透明度；按住 C 拖拽裁剪，按住 V 在裁剪内平移，⇧V 缩放。更完整的按键见 设置 → 快捷键，或按 ⇧⌘P 打开命令面板。' }),
      h('h4', { text: '常用快捷键' }),
      h('table', {},
        [['撤销 / 重做', '⌘Z / ⇧⌘Z'], ['复制 / 粘贴', '⌘C / ⌘V'], ['分组 / 解组', '⌘G / ⇧⌘G'], ['全选', '⌘A'], ['保存 / 导出', '⌘S / ⌘E'], ['缩放至 100%', '⌘0'], ['层级面板', '⌘J'], ['设置', '⌘U'], ['命令面板', '⇧⌘P'], ['帮助', '⌃H']].map(([k, v]) => h('tr', {}, h('td', { text: k }), h('td', { text: v })))),
      h('div', { class: 'help-note', text: 'MuseNex 完全离线运行，无登录、无授权、无遥测。' }),
    );
    P.dialog({ title: '帮助', className: 'help', body, buttons: [{ label: '关闭', kind: 'primary' }] });
  };

  P.showAbout = function () {
    P.dialog({
      title: '关于 MuseNex', className: 'mini',
      body: h('div', { style: { textAlign: 'center', padding: '10px 0', lineHeight: '1.7' } },
        h('div', { style: { fontSize: '15px', fontWeight: '600' }, text: 'MuseNex 1.0.0' }),
        h('div', { style: { color: 'var(--text-dim)' }, text: 'MuseNex 参考板 · 依据 PureRef 2.1.3 功能规格重建' }),
        h('div', { style: { color: 'var(--text-faint)', marginTop: '8px' }, text: '双工作区 · 无登录 / 无联网 / 数据全部保存在本机' }),
      ),
      buttons: [{ label: '好的', kind: 'primary' }],
    });
  };

  P.showLog = function () {
    const lines = (P.logLines || []).join('\n') || '（暂无日志）';
    P.dialog({ title: '日志', body: h('pre', { style: { maxHeight: '360px', overflow: 'auto', fontSize: '11px', color: 'var(--text-dim)', whiteSpace: 'pre-wrap' }, text: lines }), buttons: [{ label: '关闭', kind: 'primary' }] });
  };
  P.log = (msg) => { (P.logLines = P.logLines || []).push(new Date().toLocaleTimeString() + '  ' + msg); };

  // ---------- 层级面板 ----------
  P.toggleHierarchy = function (force) {
    const el = document.getElementById('hierarchy');
    const show = force == null ? el.classList.contains('hidden') : force;
    el.classList.toggle('hidden', !show);
    if (show) P.renderHierarchy();
  };
  P.renderHierarchy = function () {
    const list = document.getElementById('hier-list');
    if (!list || document.getElementById('hierarchy').classList.contains('hidden')) return;
    list.innerHTML = '';
    const nameInput = document.getElementById('scene-name');
    if (document.activeElement !== nameInput) nameInput.value = S.scene.name;
    const q = (document.getElementById('hier-search').value || '').toLowerCase();
    const rows = [];
    const walk = (parentId, depth) => {
      for (const it of S.items) {
        if (it.parentId !== parentId) continue;
        rows.push({ it, depth });
        walk(it.id, depth + 1);
      }
    };
    walk(null, 0);
    const count = rows.length;
    for (const { it, depth } of rows) {
      if (q && !(it.name || '').toLowerCase().includes(q)) continue;
      const icon = it.type === 'image' ? ICONS.image : it.type === 'note' ? ICONS.note : it.type === 'draw' ? ICONS.draw : ICONS.plus;
      const rowEl = h('div', { class: 'hier-row' + (S.sel.has(it.id) ? ' selected' : ''), style: { paddingLeft: (6 + depth * 14) + 'px' }, draggable: 'true' },
        h('span', { class: 'twisty', text: it.type === 'group' ? '▾' : '' }),
        h('span', { class: 'hicon', html: svg(icon) }),
        h('span', { class: 'hname', text: it.name || (it.type === 'image' ? '图片' : it.type === 'note' ? '便签' : it.type === 'draw' ? '绘制' : '组') }),
        h('span', { class: 'hlayer', text: it.type === 'group' ? '组' : it.type === 'image' ? Math.round(it.w) + 'px' : '' }),
      );
      rowEl.onclick = (e) => {
        if (e.shiftKey) P.selectAdd(it.id); else P.selectOnly([it.id]);
        P.renderHierarchy();
      };
      rowEl.ondblclick = () => {
        const span = rowEl.querySelector('.hname');
        const inp = h('input', { class: 'ctl', value: it.name || '', style: { height: '20px', padding: '0 4px', minWidth: '0' } });
        span.replaceWith(inp); inp.focus(); inp.select();
        const done = () => { it.name = inp.value; P.markDirty(); P.renderHierarchy(); };
        inp.onblur = done; inp.onkeydown = (e) => { if (e.key === 'Enter') inp.blur(); if (e.key === 'Escape') { inp.value = it.name; inp.blur(); } e.stopPropagation(); };
      };
      rowEl.ondragstart = (e) => { e.dataTransfer.setData('text/musenex-item', it.id); e.dataTransfer.effectAllowed = 'move'; };
      rowEl.ondragover = (e) => { e.preventDefault(); rowEl.classList.add('drop-into'); };
      rowEl.ondragleave = () => rowEl.classList.remove('drop-into');
      rowEl.ondrop = (e) => {
        e.preventDefault(); rowEl.classList.remove('drop-into');
        const src = e.dataTransfer.getData('text/musenex-item');
        if (!src || src === it.id) return;
        const srcIt = P.itemById(src);
        if (!srcIt) return;
        if (it.type === 'group') {
          P.pushUndo(); srcIt.parentId = it.id; P.normalizeGroups(); P.markDirty(); P.renderAll(); P.renderHierarchy();
        }
      };
      list.appendChild(rowEl);
    }
    const emptyArea = h('div', { style: { flex: '1', minHeight: '40px' } });
    emptyArea.ondragover = (e) => e.preventDefault();
    emptyArea.ondrop = (e) => {
      e.preventDefault();
      const src = e.dataTransfer.getData('text/musenex-item');
      if (!src) return;
      const srcIt = P.itemById(src); if (!srcIt) return;
      P.pushUndo(); srcIt.parentId = null; P.normalizeGroups(); P.markDirty(); P.renderAll(); P.renderHierarchy();
    };
    list.appendChild(emptyArea);
    document.getElementById('hier-count').textContent = count + ' 项';
  };

  // ---------- 保存 / 打开 ----------
  P.confirmUnsaved = function (actionLabel) {
    return new Promise((resolve) => {
      if (!S.scene.dirty) { resolve('discard'); return; }
      const behavior = P.settings.unsavedBehavior;
      if (behavior === 'discard') { resolve('discard'); return; }
      if (behavior === 'save') { resolve('save'); return; }
      P.dialog({
        title: '未保存的更改', className: 'mini',
        body: h('div', { style: { lineHeight: '1.7', color: 'var(--text-dim)' }, text: `当前场景有未保存的更改。${actionLabel || '继续'}前是否保存？` }),
        buttons: [
          { label: '取消', onClick: (close) => { close(); resolve('cancel'); } },
          { label: '不保存', onClick: (close) => { close(); resolve('discard'); } },
          { label: '保存', kind: 'primary', onClick: async (close) => { close(); resolve('save'); } },
        ],
        onClose: () => {},
        noClose: false,
      });
    });
  };

  P.saveScene = async function (saveAs) {
    let p = S.scene.path;
    if (!p || saveAs) {
      const suggested = (S.scene.name || '未命名') + '.prcyq';
      const picked = await capi.dialog.saveScene(suggested);
      if (!picked) return false;
      p = picked;
    }
    try {
      const thumb = P.settings.thumbnails !== false ? P.thumbDataUrl() : null;
      await P.saveToPath(p, {}, thumb);
      P.toast('已保存：' + p.split('/').pop());
      P.renderHierarchy();
      return true;
    } catch (e) {
      P.toast('保存失败：' + e.message);
      return false;
    }
  };

  P.openSceneDialog = async function () {
    const p = await capi.dialog.openScene();
    if (!p) return;
    await P.openScenePath(p);
  };
  P.openScenePath = async function (p) {
    const verdict = await P.confirmUnsaved('打开其他场景');
    if (verdict === 'cancel') return;
    if (verdict === 'save') { const ok = await P.saveScene(); if (!ok) return; }
    try {
      await P.loadSceneFromPath(p);
      P.toast('已打开 ' + p.split('/').pop());
      P.renderHierarchy();
    } catch (e) {
      P.toast('打开失败：' + e.message);
    }
  };

  P.newScene = async function () {
    const verdict = await P.confirmUnsaved('新建场景');
    if (verdict === 'cancel') return;
    if (verdict === 'save') { const ok = await P.saveScene(); if (!ok) return; }
    S.items = []; S.sel.clear(); S.undo = []; S.redo = []; S.images.clear();
    S.scene.path = null; S.scene.name = '未命名'; S.scene.dirty = false;
    S.cam = { x: window.innerWidth / 2, y: window.innerHeight / 2, z: 1 };
    await capi.fs.autosaveClear();
    P.resetEmpty(); P.renderAll(); P.refreshChrome();
  };

  // ---------- 导出 ----------
  // 便签导出：把便签 HTML 拆成带样式的文本 run，用 Canvas 逐行排版绘制
  function flattenNote(html, width, style) {
    const host = document.createElement('div');
    host.style.cssText = `position:fixed;left:-10000px;top:0;width:${width}px;font-family:"Open Sans","PingFang SC",sans-serif;font-size:${style === 'compact' ? 14 : 15}px;line-height:${style === 'compact' ? 1.25 : 1.42};color:#e8e8e8;`;
    host.innerHTML = html || '';
    document.body.appendChild(host);
    const runs = [];
    const walk = (node, inherited, list) => {
      if (node.nodeType === 3) {
        const txt = node.textContent.replace(/\s+/g, ' ');
        if (txt) runs.push(Object.assign({ text: txt }, inherited, { list }));
        return;
      }
      if (node.nodeType !== 1) return;
      const el = node;
      const tag = el.tagName.toLowerCase();
      if (tag === 'br') { runs.push(Object.assign({ text: '\n' }, inherited, { list })); return; }
      const cs = getComputedStyle(el);
      const st = {
        color: cs.color || inherited.color,
        bold: (parseInt(cs.fontWeight) || 400) >= 600,
        italic: cs.fontStyle === 'italic',
        underline: (cs.textDecorationLine || '').includes('underline'),
        strike: (cs.textDecorationLine || '').includes('line-through'),
        size: parseFloat(cs.fontSize) || inherited.size,
        bg: cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)' ? cs.backgroundColor : null,
      };
      let curList = list;
      if (tag === 'li') {
        curList = { type: el.parentElement && el.parentElement.tagName.toLowerCase() === 'ol' ? 'ol' : 'ul', index: 1 };
        if (curList.type === 'ol') {
          const items = [...el.parentElement.children];
          curList.index = items.indexOf(el) + 1;
        }
        runs.push(Object.assign({ text: '\n' }, st, { list: curList, bulletOnly: true }));
      }
      for (const c of el.childNodes) walk(c, st, curList);
      if (tag === 'li' || tag === 'p' || tag === 'div' || tag === 'ul' || tag === 'ol') runs.push(Object.assign({ text: '\n' }, st, { list: null }));
    };
    for (const c of host.childNodes) walk(c, { color: 'rgb(232,232,232)', bold: false, italic: false, underline: false, strike: false, size: style === 'compact' ? 14 : 15 }, null);
    host.remove();
    return runs;
  }

  function drawNoteToCtx(ctx, it) {
    const padX = it.style === 'compact' ? 8 : 12;
    const padY = it.style === 'compact' ? 6 : 10;
    const baseSize = it.style === 'compact' ? 14 : 15;
    const lineH = baseSize * (it.style === 'compact' ? 1.25 : 1.42);
    ctx.save();
    ctx.translate(it.x + it.w / 2, it.y + it.h / 2);
    ctx.rotate((it.rot || 0) * Math.PI / 180);
    ctx.globalAlpha = it.opacity == null ? 1 : it.opacity;
    roundRectPath(ctx, -it.w / 2, -it.h / 2, it.w, it.h, 3);
    ctx.fillStyle = it.bg || 'rgba(52,52,52,0.92)';
    ctx.fill();
    ctx.translate(-it.w / 2 + padX, -it.h / 2 + padY);
    const maxW = it.w - padX * 2;
    const runs = flattenNote(it.html || '', maxW + padX * 2, it.style);
    // 逐 run 排版
    let x = 0, y = lineH;
    let indent = 0;
    let pendingList = null;
    ctx.textBaseline = 'alphabetic';
    const drawRun = (text, st) => {
      ctx.font = `${st.italic ? 'italic ' : ''}${st.bold ? '600 ' : '400 '}${st.size}px "Open Sans","PingFang SC",sans-serif`;
      if (st.bg) { ctx.fillStyle = st.bg; ctx.fillRect(x, y - st.size, ctx.measureText(text).width, st.size * 1.35); }
      ctx.fillStyle = st.color || it.color || '#e8e8e8';
      ctx.fillText(text, x, y);
      const w = ctx.measureText(text).width;
      if (st.underline || st.strike) {
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (st.underline) { ctx.moveTo(x, y + 2); ctx.lineTo(x + w, y + 2); }
        if (st.strike) { ctx.moveTo(x, y - st.size * 0.3); ctx.lineTo(x + w, y - st.size * 0.3); }
        ctx.stroke();
      }
      x += w;
    };
    for (const run of runs) {
      if (run.bulletOnly) {
        pendingList = run.list;
        if (x > 0) { x = 0; y += lineH; }
        indent = 18;
        continue;
      }
      if (run.text === '\n') {
        x = 0; y += lineH; indent = pendingList ? 18 : 0;
        continue;
      }
      const tokens = run.text.split(/(\s+)/);
      for (const tok of tokens) {
        if (!tok) continue;
        if (tok.trim() === '') {
          const w = ctx.measureText(tok).width;
          if (x + w > maxW) { x = 0; y += lineH; indent = pendingList ? 18 : 0; }
          else x += w;
          continue;
        }
        ctx.font = `${run.italic ? 'italic ' : ''}${run.bold ? '600 ' : '400 '}${run.size}px "Open Sans","PingFang SC",sans-serif`;
        const w = ctx.measureText(tok).width;
        if (x + w > maxW && x > 0) { x = 0; y += lineH; indent = pendingList ? 18 : 0; }
        if (x === 0 && pendingList) {
          // 画列表符号
          ctx.fillStyle = it.color || '#e8e8e8';
          ctx.font = `${baseSize}px "Open Sans","PingFang SC",sans-serif`;
          const bullet = pendingList.type === 'ol' ? (pendingList.index + '.') : '•';
          ctx.fillText(bullet, 2, y);
          x = indent;
          ctx.font = `${run.italic ? 'italic ' : ''}${run.bold ? '600 ' : '400 '}${run.size}px "Open Sans","PingFang SC",sans-serif`;
        }
        drawRun(tok, run);
      }
    }
    ctx.restore();
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  async function renderSceneToCanvas(items, bounds, opts) {
    const pad = opts.borders ? 2 : 0;
    const scale = opts.scale || 1;
    const w = Math.max(1, Math.round(bounds.w * scale));
    const h = Math.max(1, Math.round(bounds.h * scale));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    if (opts.background) { ctx.fillStyle = opts.bg || P.settingsCanvasColor(); ctx.fillRect(0, 0, w, h); }
    const z = scale;
    ctx.translate(-bounds.x * z, -bounds.y * z);
    ctx.scale(z, z);
    for (const it of S.items) {
      if (!items || !items.has(it.id)) continue;
      if (it.type === 'image') {
        const img = S.images.get(it.imgId);
        if (!img) continue;
        const src = img.bitmap || img.el;
        if (!src) continue;
        ctx.save();
        ctx.translate(it.x + it.w / 2, it.y + it.h / 2);
        ctx.rotate((it.rot || 0) * Math.PI / 180);
        ctx.scale(it.flipH ? -1 : 1, it.flipV ? -1 : 1);
        ctx.globalAlpha = it.opacity == null ? 1 : it.opacity;
        ctx.imageSmoothingEnabled = it.bilinear !== false;
        if (it.gray) ctx.filter = 'grayscale(1)';
        if (it.crop) ctx.drawImage(src, it.crop.x, it.crop.y, it.crop.w, it.crop.h, -it.w / 2, -it.h / 2, it.w, it.h);
        else ctx.drawImage(src, -it.w / 2, -it.h / 2, it.w, it.h);
        if (opts.borders) {
          ctx.strokeStyle = 'rgba(255,255,255,0.25)';
          ctx.lineWidth = 1 / z;
          ctx.strokeRect(-it.w / 2, -it.h / 2, it.w, it.h);
        }
        ctx.restore();
      } else if (it.type === 'note') {
        ctx.save();
        drawNoteToCtx(ctx, it);
        ctx.restore();
      } else if (it.type === 'draw') {
        ctx.save();
        ctx.translate(it.x, it.y);
        ctx.strokeStyle = it.color; ctx.lineWidth = it.width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        if (it.dash === 'dotted') ctx.setLineDash([it.width * 1.6, it.width * 2.2]);
        const pts = it.points || [];
        ctx.beginPath();
        if (it.shape === 'pen') pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
        else if (it.shape === 'line') { const a = pts[0], b = pts[pts.length - 1]; ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
        else if (it.shape === 'rect') { const a = pts[0], b = pts[pts.length - 1]; ctx.rect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])); }
        else if (it.shape === 'ellipse') { const a = pts[0], b = pts[pts.length - 1]; ctx.ellipse((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.abs(b[0] - a[0]) / 2, Math.abs(b[1] - a[1]) / 2, 0, 0, Math.PI * 2); }
        ctx.stroke();
        ctx.restore();
      }
    }
    return c;
  }

  P.exportSceneTo = async function (outPath, opts) {
    opts = opts || {};
    const sel = P.selectedItems();
    const items = opts.selectionOnly && sel.length ? new Set(sel.map((i) => i.id)) : new Set(S.items.map((i) => i.id));
    const b = opts.selectionOnly && sel.length ? P.bbox(sel) : P.canvasBBox();
    const outW = Math.max(1, Math.round(opts.width || b.w));
    const outH = Math.max(1, Math.round(opts.height || b.h));
    const c = await renderSceneToCanvas(items, b, { scale: outW / b.w, background: !!opts.background, borders: !!opts.borders, bg: P.settingsCanvasColor() });
    const mime = /\.jpe?g$/i.test(outPath) ? 'image/jpeg' : /\.webp$/i.test(outPath) ? 'image/webp' : 'image/png';
    const blob = await new Promise((res) => c.toBlob(res, mime, 0.94));
    const buf = new Uint8Array(await blob.arrayBuffer());
    const r = await capi.fs.writeFile(outPath, buf);
    if (r && r.error) throw new Error(r.error);
    return { path: outPath, width: outW, height: outH };
  };

  P.exportImagesTo = async function (folder, opts) {
    opts = opts || {};
    const format = opts.format || 'original';
    const crop = !!opts.crop;
    const naming = opts.naming || '%0';
    const sel = P.selectedItems().filter((i) => i.type === 'image');
    const imgs = opts.selectionOnly && sel.length ? sel : S.items.filter((i) => i.type === 'image');
    let n = 0;
    for (const it of imgs) {
      const img = S.images.get(it.imgId);
      if (!img) continue;
      const src = img.bitmap || img.el;
      if (!src) continue;
      const sx = crop && it.crop ? it.crop.x : 0, sy = crop && it.crop ? it.crop.y : 0;
      const sw = crop && it.crop ? it.crop.w : img.w, sh = crop && it.crop ? it.crop.h : img.h;
      const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(sw)); c.height = Math.max(1, Math.round(sh));
      const ctx = c.getContext('2d');
      if (format === 'jpg') { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, c.width, c.height); }
      ctx.drawImage(src, sx, sy, sw, sh, 0, 0, c.width, c.height);
      const mime = format === 'original' ? (img.mime && img.mime.startsWith('image/') ? img.mime : 'image/png') : 'image/' + (format === 'jpg' ? 'jpeg' : format);
      const ext = format === 'original' ? (img.name && img.name.includes('.') ? img.name.split('.').pop() : 'png') : (format === 'jpg' ? 'jpg' : format);
      const blob = await new Promise((res) => c.toBlob(res, /jpeg/.test(mime) ? 'image/jpeg' : mime, 0.94));
      const name = applyTemplate(naming, it, n, S.scene.name) + '.' + ext;
      await capi.fs.writeFile(folder + '/' + name, new Uint8Array(await blob.arrayBuffer()));
      n++;
    }
    return n;
  };

  P.openExportScene = function (selectionOnly) {
    const sel = P.selectedItems();
    const items = selectionOnly && sel.length ? new Set(sel.map((i) => i.id)) : new Set(S.items.map((i) => i.id));
    const b = selectionOnly && sel.length ? P.bbox(sel) : P.canvasBBox();
    let exportScale = 1;
    const wCtl = h('input', { class: 'ctl narrow', type: 'number', value: String(Math.max(1, Math.round(b.w))), min: 1 });
    const hCtl = h('input', { class: 'ctl narrow', type: 'number', value: String(Math.max(1, Math.round(b.h))), min: 1 });
    const aspect = b.w / b.h;
    let lock = true;
    wCtl.oninput = () => { if (lock) hCtl.value = String(Math.max(1, Math.round(Number(wCtl.value) / aspect))); };
    hCtl.oninput = () => { if (lock) wCtl.value = String(Math.max(1, Math.round(Number(hCtl.value) * aspect))); };
    const bgChk = ctlCheck(false, () => {});
    const borderChk = ctlCheck(false, () => {});
    const locText = h('span', { class: 'ctl', style: { flex: '1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, text: '（点击导出时选择位置）' });
    let outPath = null;
    const body = h('div', {},
      row('保存位置', h('span', { class: 'range-box', style: { flex: '1' } }, locText, h('button', { class: 'btn small', text: '选择…', onclick: async () => {
        const p = await capi.dialog.saveFile({ defaultPath: (S.scene.name || 'scene') + '.png', filters: [{ name: 'PNG', extensions: ['png'] }, { name: 'JPEG', extensions: ['jpg', 'jpeg'] }, { name: 'WebP', extensions: ['webp'] }] });
        if (p) { outPath = p; locText.textContent = p; }
      } }))),
      row('宽度', h('span', { class: 'range-box' }, wCtl, h('span', { class: 'tlabel', text: 'px' }))),
      row('高度', h('span', { class: 'range-box' }, hCtl, h('span', { class: 'tlabel', text: 'px' }))),
      h('div', { class: 'keymap-group', text: '包含' }),
      row('背景', bgChk),
      row('边框', borderChk),
    );
    P.dialog({
      title: selectionOnly ? '导出选中为场景' : '导出场景', className: 'mini', body,
      buttons: [
        { label: '取消' },
        { label: '导出', kind: 'primary', onClick: async (close) => {
          if (!outPath) {
            outPath = await capi.dialog.saveFile({ defaultPath: (S.scene.name || 'scene') + '.png', filters: [{ name: 'PNG', extensions: ['png'] }, { name: 'JPEG', extensions: ['jpg', 'jpeg'] }, { name: 'WebP', extensions: ['webp'] }] });
            if (!outPath) return;
          }
          const outW = Math.max(1, Number(wCtl.value)), outH = Math.max(1, Number(hCtl.value));
          const c = await renderSceneToCanvas(items, b, { scale: outW / b.w, background: bgChk.classList.contains('checked'), borders: borderChk.classList.contains('checked') });
          const mime = /\.jpe?g$/i.test(outPath) ? 'image/jpeg' : /\.webp$/i.test(outPath) ? 'image/webp' : 'image/png';
          const blob = await new Promise((res) => c.toBlob(res, mime, 0.94));
          const buf = new Uint8Array(await blob.arrayBuffer());
          const r = await capi.fs.writeFile(outPath, buf);
          if (r && r.error) P.toast('导出失败：' + r.error);
          else P.toast('已导出：' + outPath.split('/').pop());
          close();
        } },
      ],
    });
  };

  P.openExportImages = function (selectionOnly) {
    const sel = P.selectedItems().filter((i) => i.type === 'image');
    const imgs = selectionOnly && sel.length ? sel : S.items.filter((i) => i.type === 'image');
    if (!imgs.length) { P.toast('没有可导出的图片'); return; }
    let folder = null;
    let format = 'original';
    let crop = false;
    let children = false;
    let naming = '%0';
    const locText = h('span', { class: 'ctl', style: { flex: '1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, text: '（未选择）' });
    const fmt = ctlSelect([['original', '原始格式'], ['png', 'PNG'], ['jpg', 'JPEG'], ['webp', 'WebP']], 'original', (v) => (format = v));
    const cropChk = ctlCheck(false, (v) => (crop = v));
    const childChk = ctlCheck(false, (v) => (children = v));
    const nameCtl = ctlText('%0', (v) => { naming = v; }, { wide: true });
    const preview = h('div', { style: { color: 'var(--text-faint)', fontSize: '11px' }, text: '示例：image.png' });
    nameCtl.oninput = () => { preview.textContent = '示例：' + applyTemplate(naming, imgs[0], 0, S.scene.name) + '.' + (format === 'original' ? 'png' : format); };
    const body = h('div', {},
      row('保存位置', h('span', { class: 'range-box', style: { flex: '1' } }, locText, h('button', { class: 'btn small', text: '选择…', onclick: async () => {
        const p = await capi.dialog.chooseFolder(folder || '');
        if (p) { folder = p; locText.textContent = p; }
      } }))),
      row('格式', fmt),
      row('导出裁剪区域', cropChk),
      row('包含子项', childChk),
      row('命名', h('div', {}, nameCtl, preview)),
      h('div', { class: 'desc', text: '%0 原文件名，%1 序号，%2 补零序号，%3 场景名；留空使用原名。' }),
    );
    P.dialog({
      title: selectionOnly ? '导出选中图片' : '导出全部图片', className: 'mini', body,
      buttons: [{ label: '取消' }, { label: '导出', kind: 'primary', onClick: async (close) => {
        if (!folder) { folder = await capi.dialog.chooseFolder(''); if (!folder) return; }
        let n = 0;
        for (const it of imgs) {
          const img = S.images.get(it.imgId);
          if (!img) continue;
          const src = img.bitmap || img.el;
          if (!src) continue;
          const sx = crop && it.crop ? it.crop.x : 0, sy = crop && it.crop ? it.crop.y : 0;
          const sw = crop && it.crop ? it.crop.w : img.w, sh = crop && it.crop ? it.crop.h : img.h;
          const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(sw)); c.height = Math.max(1, Math.round(sh));
          const ctx = c.getContext('2d');
          if (format === 'jpg') { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, c.width, c.height); }
          ctx.drawImage(src, sx, sy, sw, sh, 0, 0, c.width, c.height);
          const mime = format === 'original' ? (img.mime && img.mime.startsWith('image/') ? img.mime : 'image/png') : 'image/' + (format === 'jpg' ? 'jpeg' : format);
          const ext = format === 'original' ? (img.name && img.name.includes('.') ? img.name.split('.').pop() : 'png') : (format === 'jpg' ? 'jpg' : format);
          const blob = await new Promise((res) => c.toBlob(res, /jpeg/.test(mime) ? 'image/jpeg' : mime, 0.94));
          const name = applyTemplate(naming || '%0', it, n, S.scene.name) + '.' + ext;
          await capi.fs.writeFile(folder + '/' + name, new Uint8Array(await blob.arrayBuffer()));
          n++;
        }
        P.toast(`已导出 ${n} 张图片到 ${folder.split('/').pop()}`);
        close();
      } }],
    });
  };

  function applyTemplate(tpl, it, index, sceneName) {
    const orig = (it.name || 'image').replace(/\.[^.]+$/, '');
    return String(tpl)
      .replace(/%0/g, orig)
      .replace(/%2/g, String(index + 1).padStart(2, '0'))
      .replace(/%1/g, String(index + 1))
      .replace(/%3/g, sceneName || '')
      .replace(/[\\/:*?"<>|]/g, '_') || orig;
  }

  // ---------- 管理图片 / 优化 / 注释 ----------
  P.openManageImages = function () {
    const imgs = S.items.filter((i) => i.type === 'image');
    const list = h('div', { class: 'list-box' });
    for (const it of imgs) {
      const img = S.images.get(it.imgId);
      list.appendChild(h('div', { class: 'list-row' },
        h('span', { text: it.name || '图片' }),
        h('span', { class: 'lr-meta', text: img ? `${img.w}×${img.h}${img.missing ? ' · 缺失' : ''}${it.crop ? ' · 已裁剪' : ''}` : '缺失' }),
      ));
    }
    if (!imgs.length) list.appendChild(h('div', { class: 'list-row', text: '场景中没有图片' }));
    P.dialog({
      title: '管理图片', className: 'mini',
      body: h('div', {}, list,
        h('div', { class: 'desc', text: '降采样只影响运行时显示，不会修改原始图片；优化会改变保存的图片数据。' }),
        row('降采样显示上限', ctlNumber(P.settings.downscaleMax || 4096, (v) => P.patchSettings({ downscaleMax: v }), { min: 256, max: 16384, suffix: 'px' })),
      ),
      buttons: [
        { label: '重新链接缺失图片', onClick: async (close) => { close(); await P.relinkMissing(); } },
        { label: '优化图片…', onClick: (close) => { close(); P.openOptimize(); } },
        { label: '关闭' },
      ],
    });
  };

  P.relinkMissing = async function () {
    const missing = [...S.images.values()].filter((i) => i.missing);
    if (!missing.length) { P.toast('没有缺失的图片'); return; }
    const folder = await capi.dialog.chooseFolder('');
    if (!folder) return;
    let ok = 0;
    for (const img of missing) {
      const guess = folder + '/' + (img.name || '');
      const r = await capi.fs.readFile(guess);
      if (r && !r.error) {
        try {
          const m = await P.loadImageFromBuffer(r, img.name, guess, img.mime);
          if (m) {
            const rec = S.images.get(m.id);
            rec.id = img.id;
            S.images.delete(m.id); S.images.set(img.id, rec);
            ok++;
          }
        } catch {}
      }
    }
    P.markDirty(); P.renderAll();
    P.toast(`已重新链接 ${ok} 张图片`);
  };

  P.openOptimize = function () {
    const convert = ctlCheck(true, () => {});
    const discard = ctlCheck(false, () => {});
    P.dialog({
      title: '优化画布', className: 'mini',
      body: h('div', {},
        h('div', { class: 'desc', style: { marginLeft: '0' }, text: '优化会修改保存文件中的图片数据以减小体积、加快加载。此操作不可撤销（可先另存为备份）。' }),
        row('转码为 PNG/JPEG', convert),
        row('丢弃裁剪掉的像素', discard),
      ),
      buttons: [{ label: '取消' }, { label: '优化', kind: 'primary', onClick: (close) => { close(); P.applyOptimize(convert, discard); } }],
    });
  };
  P.applyOptimize = async function (convert, discard) {
    let n = 0;
    for (const it of S.items) {
      if (it.type !== 'image') continue;
      const img = S.images.get(it.imgId);
      if (!img || img.missing) continue;
      const src = img.bitmap || img.el;
      if (!src) continue;
      if (discard && it.crop) {
        const c = document.createElement('canvas'); c.width = Math.round(it.crop.w); c.height = Math.round(it.crop.h);
        c.getContext('2d').drawImage(src, it.crop.x, it.crop.y, it.crop.w, it.crop.h, 0, 0, c.width, c.height);
        const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
        const buf = new Uint8Array(await blob.arrayBuffer());
        const m = await P.loadImageFromBuffer(buf, it.name, it.path, 'image/png');
        if (m) { S.images.set(it.imgId, S.images.get(m.id)); S.images.delete(m.id); it.crop = null; n++; }
      } else if (convert) {
        const c = document.createElement('canvas'); c.width = img.w; c.height = img.h;
        c.getContext('2d').drawImage(src, 0, 0);
        const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
        const buf = new Uint8Array(await blob.arrayBuffer());
        const m = await P.loadImageFromBuffer(buf, it.name, it.path, 'image/png');
        if (m) { S.images.set(it.imgId, S.images.get(m.id)); S.images.delete(m.id); n++; }
      }
    }
    P.markDirty(); P.renderAll();
    P.toast(`已优化 ${n} 项`);
  };

  P.openComment = function () {
    const it = P.selectedItems()[0];
    if (!it) return;
    const ta = h('textarea', { class: 'ctl', style: { width: '100%', height: '120px', resize: 'vertical' } });
    ta.value = it.comment || '';
    P.dialog({
      title: '注释', className: 'mini', body: ta,
      buttons: [{ label: '取消' }, { label: '保存', kind: 'primary', onClick: (close) => { it.comment = ta.value; P.markDirty(); close(); P.toast('注释已保存'); } }],
    });
    setTimeout(() => ta.focus(), 30);
  };

  // ---------- 裁剪 ----------
  P.startCrop = function () {
    const it = P.selectedItems().find((i) => i.type === 'image');
    if (!it) { P.toast('请先选中一张图片'); return; }
    if (it.crop) S.crop = { itemId: it.id, rect: { x: it.x, y: it.y, w: it.w, h: it.h }, mode: 'region' };
    else S.crop = { itemId: it.id, rect: { x: it.x, y: it.y, w: it.w, h: it.h }, mode: 'region' };
    P.refreshToolbar(); P.requestRender();
    P.toast('裁剪：拖动角点调整，Enter 应用，Esc 取消（可按住 ⌘ 锁定比例）');
  };

  P.applyCropFromUI = function () {
    if (!S.crop) return;
    const it = P.itemById(S.crop.itemId);
    if (!it) { S.crop = null; return; }
    const r = S.crop.rect;
    if (r.w < 4 || r.h < 4) { S.crop = null; P.requestRender(); return; }
    P.pushUndo();
    const img = S.images.get(it.imgId);
    if (!img) { S.crop = null; return; }
    // 当前裁剪区域（源像素）
    const cur = it.crop || { x: 0, y: 0, w: img.w, h: img.h };
    // 裁剪框相对 item 的比例
    const fx = (r.x - it.x) / it.w, fy = (r.y - it.y) / it.h;
    const fw = r.w / it.w, fh = r.h / it.h;
    const nc = {
      x: cur.x + cur.w * Math.max(0, fx),
      y: cur.y + cur.h * Math.max(0, fy),
      w: cur.w * Math.min(1, fw),
      h: cur.h * Math.min(1, fh),
    };
    it.crop = nc;
    it.x = r.x; it.y = r.y;
    it.w = r.w; it.h = r.h;
    S.crop = null;
    P.normalizeGroups(); P.markDirty(); P.renderAll(); P.refreshToolbar();
    P.toast('已应用裁剪');
  };

  // ---------- 播放 ----------
  P.playbackToggle = function (it) {
    if (!(it._playing)) {
      it._playing = true;
      if (it._timer) clearInterval(it._timer);
      it._timer = setInterval(() => { P.requestRender(); }, 80);
      P.toast('播放');
    } else {
      it._playing = false;
      if (it._timer) clearInterval(it._timer);
      P.toast('暂停');
    }
    P.requestRender();
  };
  P.playbackStep = function (it, dir) {
    P.toast(dir > 0 ? '下一帧' : '上一帧');
    P.requestRender();
  };

  // ---------- 轮播 ----------
  P.startSlideshow = function () {
    let items;
    if (P.settings.slideshowOrder === 'name') items = S.items.filter((i) => i.type === 'image').sort((a, b) => String(a.name).localeCompare(String(b.name)));
    else if (P.settings.slideshowOrder === 'order') items = S.items.filter((i) => i.type === 'image');
    else items = P.selectedItems().filter((i) => i.type === 'image');
    if (!items.length) items = S.items.filter((i) => i.type === 'image');
    if (!items.length) { P.toast('没有图片可轮播'); return; }
    let idx = 0;
    const img = h('img', { style: { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' } });
    const counter = h('div', { style: { position: 'absolute', bottom: '22px', left: '50%', transform: 'translateX(-50%)', color: '#ddd', fontSize: '12px', background: 'rgba(0,0,0,0.5)', padding: '6px 14px', borderRadius: '20px' } });
    const box = h('div', { style: { position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.92)', zIndex: '150', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' } }, img, counter);
    document.body.appendChild(box);
    const show = () => {
      const it = items[idx];
      const rec = S.images.get(it.imgId);
      const src = rec && (rec.el ? rec.el.src : null);
      if (src) img.src = src;
      else if (rec && rec.bitmap) {
        const c = document.createElement('canvas'); c.width = rec.w; c.height = rec.h; c.getContext('2d').drawImage(rec.bitmap, 0, 0);
        img.src = c.toDataURL();
      }
      counter.textContent = `${idx + 1} / ${items.length}　${it.name || ''}`;
    };
    const timer = setInterval(() => { idx = (idx + 1) % items.length; show(); }, Math.max(1, P.settings.slideshowInterval) * 1000);
    const done = () => { clearInterval(timer); box.remove(); window.removeEventListener('keydown', key, true); };
    box.onclick = done;
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); done(); } if (e.key === 'ArrowRight') { idx = (idx + 1) % items.length; show(); } if (e.key === 'ArrowLeft') { idx = (idx - 1 + items.length) % items.length; show(); } };
    window.addEventListener('keydown', key, true);
    show();
  };

  // ---------- 恢复 / 空场景 ----------
  P.checkRecovery = async function () {
    const r = await capi.fs.autosaveCheck();
    if (!r || !r.exists) return false;
    P.dialog({
      title: '发现自动保存的场景', className: 'mini',
      body: h('div', { style: { lineHeight: '1.7', color: 'var(--text-dim)' }, text: '上次编辑的自动保存记录存在，可能包含未保存的更改。是否恢复？' }),
      buttons: [
        { label: '忽略', onClick: async (close) => { close(); await capi.fs.autosaveClear(); P.resetEmpty(); } },
        { label: '恢复', kind: 'primary', onClick: async (close) => {
          close();
          try {
            const res = await capi.fs.readScene(r.path);
            if (res && !res.error) {
              await P.applyScene(res.header, res.images);
              S.scene.dirty = true;
              P.refreshChrome(); P.renderAll(); P.fitAll();
              P.toast('已恢复自动保存的场景');
            }
          } catch (e) { P.toast('恢复失败'); }
        } },
      ],
    });
    return true;
  };

  P.resetEmpty = function () {
    const el = document.getElementById('empty');
    el.classList.toggle('hidden', S.items.length > 0);
    P.renderRecent();
  };
  P.renderRecent = function () {
    const wrap = document.getElementById('recent');
    const list = document.getElementById('recent-list');
    const recent = P.settings.showRecent ? (P.settings.recent || []) : [];
    wrap.classList.toggle('hidden', !recent.length || S.items.length > 0);
    list.innerHTML = '';
    for (const r of recent.slice(0, P.settings.recentCount || 5)) {
      const card = h('div', { class: 'recent-card', title: r.path },
        h('div', { class: 'thumb', style: r.thumb ? { backgroundImage: `url(${r.thumb})` } : {} }),
        h('div', { class: 'meta', text: r.name || r.path.split('/').pop() }));
      card.onclick = () => P.openScenePath(r.path);
      card.oncontextmenu = (e) => { e.preventDefault(); P.removeRecent(r.path); P.renderRecent(); };
      list.appendChild(card);
    }
  };

  // ---------- 状态 / 标题 ----------
  P.refreshChrome = function () {
    const title = document.getElementById('tb-title');
    if (title) title.textContent = (S.scene.dirty ? '*' : '') + (S.scene.name || '未命名');
    const st = document.getElementById('status-icon');
    st.classList.toggle('dirty', S.scene.dirty);
    st.classList.toggle('unsaved', !S.scene.path);
    const sn = document.getElementById('scene-name');
    if (sn && document.activeElement !== sn) sn.value = S.scene.name;
    P.refreshToolbar();
    P.renderHierarchy();
    P.renderRecent();
    document.getElementById('empty').classList.toggle('hidden', S.items.length > 0);
  };

  P.applyStatusPosition = function () {
    const el = document.getElementById('status-icon');
    const p = P.settings.statusIcon;
    const map = { 'bottom-right': ['right', 'bottom'], 'bottom-left': ['left', 'bottom'], 'top-right': ['right', 'top'], 'top-left': ['left', 'top'] };
    const [hx, vy] = map[p] || map['bottom-right'];
    el.style.left = hx === 'left' ? '14px' : '';
    el.style.right = hx === 'right' ? '14px' : '';
    el.style.top = vy === 'top' ? '48px' : '';
    el.style.bottom = vy === 'bottom' ? '14px' : '';
  };

  P.applyOpacity = function () {
    const v = Math.max(0.1, Math.min(1, (P.settings.appOpacity || 100) / 100));
    document.getElementById('app').style.opacity = String(v);
  };

  // ---------- 动作 ----------
  P.setTool = function (tool) {
    S.tool = tool;
    document.body.style.cursor = tool === 'select' ? 'default' : 'crosshair';
    if (tool !== 'select' && tool !== 'eraser') S.pen;
    P.refreshToolbar();
    P.toast({ pen: '画笔', line: '直线', ellipse: '椭圆', rect: '矩形', eraser: '橡皮', select: '选择' }[tool] + '工具');
  };

  P.runAction = async function (id, ctx) {
    if (P._dynamicActions && P._dynamicActions[id]) { await P._dynamicActions[id](); return; }
    const sel = P.selectedItems();
    switch (id) {
      case 'open-images': {
        const paths = await capi.dialog.openImages();
        if (paths && paths.length) { const w = P.screenToWorld(window.innerWidth / 2, window.innerHeight / 2); await P.addImagesFromPaths(paths, w); P.fitAll(); }
        break;
      }
      case 'open-scene': await P.openSceneDialog(); break;
      case 'open-recent': {
        const recent = P.settings.recent || [];
        if (!recent.length) { P.toast('没有最近文件'); break; }
        P.showMenu(recent.map((r) => ({ label: r.name || r.path.split('/').pop(), onClick: () => P.openScenePath(r.path) })), window.innerWidth / 2 - 100, 120);
        break;
      }
      case 'open-scene-location': if (S.scene.path) capi.fs.showInFolder(S.scene.path); else P.toast('场景尚未保存'); break;
      case 'open-source': {
        const it = sel.find((i) => i.type === 'image');
        if (it && (it.path || (S.images.get(it.imgId) || {}).path)) capi.shell.openPath(it.path || S.images.get(it.imgId).path);
        else P.toast('该图片没有本地源文件');
        break;
      }
      case 'save': await P.saveScene(false); break;
      case 'save-as': await P.saveScene(true); break;
      case 'export-scene': P.openExportScene(false); break;
      case 'export-selected-scene': P.openExportScene(true); break;
      case 'export-all-images': P.openExportImages(false); break;
      case 'export-selected-images': P.openExportImages(true); break;
      case 'new-scene': await P.newScene(); break;
      case 'settings': P.openSettings(); break;
      case 'help': P.showHelp(); break;
      case 'about': P.showAbout(); break;
      case 'close': {
        const verdict = await P.confirmUnsaved('退出');
        if (verdict === 'cancel') break;
        if (verdict === 'save') { const ok = await P.saveScene(); if (!ok) break; }
        try { await capi.fs.autosaveClear(); } catch {}
        capi.app.quit();
        break;
      }
      case 'undo': if (!P.undo()) P.toast('没有可撤销的操作'); break;
      case 'redo': if (!P.redo()) P.toast('没有可重做的操作'); break;
      case 'copy': await P.copySelected(); P.toast('已复制'); break;
      case 'cut': await P.copySelected(); P.deleteSelected(); break;
      case 'paste': await P.paste(); break;
      case 'duplicate': P.duplicateSelected(); break;
      case 'select-all': P.selectAll(); break;
      case 'delete': P.deleteSelected(); break;
      case 'note': P.createNoteAtCenter(); break;
      case 'draw': P.setTool(S.tool === 'select' ? 'pen' : 'select'); break;
      case 'command-palette': P.openPalette(); break;
      case 'hierarchy': P.toggleHierarchy(); break;
      case 'zoom-in': P.zoomAt(window.innerWidth / 2, window.innerHeight / 2, 1.1); break;
      case 'zoom-out': P.zoomAt(window.innerWidth / 2, window.innerHeight / 2, 1 / 1.1); break;
      case 'reset-camera': P.resetCamera(); break;
      case 'reset-zoom': P.resetZoom(); break;
      case 'toggle-grid': {
        const order = ['none', 'lines', 'dots'];
        const next = order[(order.indexOf(S.scene.grid) + 1) % 3];
        S.scene.grid = next; P.markDirty(); P.renderAll(); P.refreshToolbar();
        P.toast('网格：' + { none: '无', lines: '线', dots: '点' }[next]);
        break;
      }
      case 'grayscale': S.scene.grayscale = !S.scene.grayscale; P.markDirty(); P.renderAll(); P.toast(S.scene.grayscale ? '画布灰度开' : '画布灰度关'); break;
      case 'lock-canvas': S.scene.locked = !S.scene.locked; P.renderAll(); P.refreshToolbar(); P.toast(S.scene.locked ? '画布已锁定（⌘R 解锁）' : '画布已解锁'); break;
      case 'focus-image': if (sel[0]) P.focusItem(sel[0]); else P.toast('请选择一张图片'); break;
      case 'focus-canvas': P.fitAll(); break;
      case 'focus-next': case 'focus-prev': {
        const imgs = S.items.filter((i) => i.type === 'image');
        if (!imgs.length) break;
        let idx = imgs.findIndex((i) => S.sel.has(i.id));
        idx = (idx + (id === 'focus-next' ? 1 : -1) + imgs.length) % imgs.length;
        P.selectOnly([imgs[idx].id]); P.focusItem(imgs[idx]);
        break;
      }
      case 'resize-selection': {
        const b = sel.length ? P.bbox(sel) : P.canvasBBox();
        const pad = 30;
        capi.win.setBounds({ x: Math.max(0, Math.round(window.screenX + (b.x * S.cam.z + S.cam.x) - pad)), y: Math.max(0, Math.round(window.screenY + (b.y * S.cam.z + S.cam.y) - pad)), width: Math.round(b.w * S.cam.z + pad * 2), height: Math.round(b.h * S.cam.z + pad * 2) });
        break;
      }
      case 'maximize': capi.win.maximize(); break;
      case 'minimize': capi.win.minimize(); break;
      case 'lock-window': {
        const locked = !P._winLocked; P._winLocked = locked;
        capi.win.setLocked(locked); P.toast(locked ? '窗口已锁定' : '窗口已解锁');
        break;
      }
      case 'new-window': capi.win.newWindow(); break;
      case 'increase-opacity': P.patchSettings({ appOpacity: Math.min(100, (P.settings.appOpacity || 100) + 10) }); P.applyOpacity(); P.toast('不透明度 ' + P.settings.appOpacity + '%'); break;
      case 'decrease-opacity': P.patchSettings({ appOpacity: Math.max(10, (P.settings.appOpacity || 100) - 10) }); P.applyOpacity(); P.toast('不透明度 ' + P.settings.appOpacity + '%'); break;
      case 'transparent-mouse': {
        if (!P._transparent) {
          P._transparent = true;
          capi.win.setIgnoreMouse(true, true);
          P.toast('鼠标穿透已启用：按 ' + P.formatCombo(P.getBinding('transparent-mouse') || 'Mod+T') + ' 关闭');
          P.setTransparentTimer();
        } else {
          P._transparent = false; capi.win.setIgnoreMouse(false, false);
          P.toast('鼠标穿透已关闭');
        }
        break;
      }
      case 'overlay-selection': P.toast('叠加选择模式：本版本以画布叠加显示近似实现'); document.body.dataset.overlay = document.body.dataset.overlay === '1' ? '0' : '1'; S.scene.bg = document.body.dataset.overlay === '1' ? 'rgba(0,0,0,0)' : null; P.renderAll(); break;
      case 'always-on-top': { const f = await capi.win.setAlwaysOnTop(!P._onTop); P._onTop = f; P.toast(f ? '始终置顶' : '取消置顶'); document.getElementById('tb-pin').classList.toggle('active', f); break; }
      case 'always-on-top-of': P.toast('“置于指定应用之上”在本版本中近似为始终置顶'); await P.runAction('always-on-top'); break;
      case 'always-on-bottom': { await capi.win.setAlwaysOnTop(false); P.toast('始终置底（本版本以取消置顶近似）'); break; }
      case 'preset-1': setTheme('dark'); break;
      case 'preset-2': setTheme('light'); break;
      case 'preset-3': setTheme('glass'); break;
      case 'preset-4': case 'preset-5': case 'preset-6': case 'preset-7': P.toast('自定义配色预设：可在外观设置中调整颜色'); break;
      case 'group': if (sel.length >= 2) P.groupSelected(); else P.toast('请选择至少两个项目'); break;
      case 'ungroup': P.ungroupSelected(); break;
      case 'parent': P.parentSelected(); break;
      case 'crop': P.startCrop(); break;
      case 'reset-crop': P.resetCrop(); break;
      case 'reset-transform': P.resetTransform(); break;
      case 'toggle-bilinear': P.toggleBilinear(); break;
      case 'toggle-grayscale': P.toggleGray(); break;
      case 'toggle-locked': P.toggleLock(); break;
      case 'send-back': P.sendLayer('back'); break;
      case 'send-front': P.sendLayer('front'); break;
      case 'comment': P.openComment(); break;
      case 'slideshow': P.startSlideshow(); break;
      case 'replace-image': await P.replaceImage(); break;
      case 'relink': await P.relinkMissing(); break;
      case 'manage-images': P.openManageImages(); break;
      case 'optimize': P.openOptimize(); break;
      case 'pack-optimize': P.arrangeAll('optimal'); P.openOptimize(); break;
      case 'arrange-optimal': P.arrangeSelected('optimal'); break;
      case 'arrange-name': P.arrangeSelected('name'); break;
      case 'arrange-path': P.arrangeSelected('path'); break;
      case 'arrange-order': P.arrangeSelected('order'); break;
      case 'arrange-add': P.arrangeSelected('add'); break;
      case 'arrange-random': P.arrangeSelected('random'); break;
      case 'align-left': P.alignSelected('left'); break;
      case 'align-right': P.alignSelected('right'); break;
      case 'align-top': P.alignSelected('top'); break;
      case 'align-bottom': P.alignSelected('bottom'); break;
      case 'stack': P.stackSelected(); break;
      case 'dist-h': P.distributeSelected('h'); break;
      case 'dist-v': P.distributeSelected('v'); break;
      case 'norm-height': P.normalizeSelected('height'); break;
      case 'norm-width': P.normalizeSelected('width'); break;
      case 'norm-size': P.normalizeSelected('size'); break;
      case 'norm-area': P.normalizeSelected('area'); break;
      case 'norm-scale': P.normalizeSelected('scale'); break;
      case 'flip-h': P.flip('h'); break;
      case 'flip-v': P.flip('v'); break;
      case 'cancel-progress': if (S.crop) { S.crop = null; P.requestRender(); } else if (S.tool !== 'select') P.setTool('select'); else P.clearSelection(); break;
      case 'pen-tool': P.setTool('pen'); break;
      case 'line-tool': P.setTool('line'); break;
      case 'ellipse-tool': P.setTool('ellipse'); break;
      case 'rect-tool': P.setTool('rect'); break;
      case 'eraser-tool': P.setTool('eraser'); break;
      case 'pen-solid': S.pen.style = 'solid'; P.refreshToolbar(); break;
      case 'pen-dotted': S.pen.style = 'dotted'; P.refreshToolbar(); break;
      case 'pen-arrow': S.pen.style = 'arrow'; P.refreshToolbar(); break;
      case 'pen-color': P.openPenColor(); break;
      case 'move-window': case 'context-menu': case 'pan': case 'pan-locked': case 'pan-maximized': case 'zoom-view':
      case 'rotate-item': case 'scale-item': case 'flip-item': case 'opacity-item': case 'crop-selection': case 'select-items': case 'move-item': P.toast('此动作由鼠标手势触发'); break;
      case 'play-pause': { const a = sel.find((i) => i.type === 'image'); if (a) P.playbackToggle(a); break; }
      case 'play-prev': { const a = sel.find((i) => i.type === 'image'); if (a) P.playbackStep(a, -1); break; }
      case 'play-next': { const a = sel.find((i) => i.type === 'image'); if (a) P.playbackStep(a, 1); break; }
      case 'grid-none': S.scene.grid = 'none'; P.markDirty(); P.renderAll(); P.refreshToolbar(); break;
      case 'grid-lines': S.scene.grid = 'lines'; P.markDirty(); P.renderAll(); P.refreshToolbar(); break;
      case 'grid-dots': S.scene.grid = 'dots'; P.markDirty(); P.renderAll(); P.refreshToolbar(); break;
      case 'grid-snap': S.scene.snapGrid = !S.scene.snapGrid; P.patchSettings({ snapGrid: S.scene.snapGrid }); P.markDirty(); P.refreshToolbar(); P.toast('吸附网格 ' + (S.scene.snapGrid ? '开' : '关')); break;
      default:
        break;
    }
  };

  P.setTransparentTimer = function () {
    clearTimeout(P._transTimer);
    P._transTimer = setTimeout(() => { P._transparent = false; capi.win.setIgnoreMouse(false, false); }, 8000);
  };

  P.openPenColor = function () {
    P.dialog({
      title: '画笔颜色', className: 'mini',
      body: h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center', padding: '10px 0' } },
        h('input', { type: 'color', value: S.pen.color, style: { width: '60px', height: '40px', border: 'none', background: 'none' }, oninput: (e) => { S.pen.color = e.target.value; } }),
        h('span', { text: '选择画笔/形状颜色' })),
      buttons: [{ label: '完成', kind: 'primary' }],
    });
  };

  P.replaceImage = async function () {
    const it = P.selectedItems().find((i) => i.type === 'image');
    if (!it) { P.toast('请先选中一张图片'); return; }
    const paths = await capi.dialog.openImages();
    if (!paths || !paths.length) return;
    try {
      const meta = await P.loadImageFromPath(paths[0]);
      if (!meta) return;
      P.pushUndo();
      const old = S.images.get(it.imgId);
      it.imgId = meta.id; it.name = meta.name; it.path = meta.path;
      it.crop = null;
      const cx = it.x + it.w / 2, cy = it.y + it.h / 2;
      it.w = meta.w; it.h = meta.h; it.x = cx - it.w / 2; it.y = cy - it.h / 2;
      if (old) S.images.delete(old.id);
      P.markDirty(); P.renderAll();
      P.toast('已替换图片');
    } catch (e) { P.toast('替换失败'); }
  };

  // ---------- 工作区框架（由 muse.config.json 驱动） ----------
  function bytesToBase64(bytes) {
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    return btoa(bin);
  }

  P.workspaces = [];
  P.mainWorkspaceId = 'board';
  P._dynamicActions = {};

  function addWorkspaceAction(id, zh, en, fn) {
    if (P.ACTION_MAP[id]) return;
    const action = { id, zh, en, group: 'file', bindings: [] };
    P.ACTIONS.push(action);
    P.ACTION_MAP[id] = action;
    P._dynamicActions[id] = fn;
  }

  function bodyWorkspace(wsId) {
    document.body.dataset.workspace = wsId;
    document.body.classList.toggle('view-mode', wsId !== P.mainWorkspaceId);
  }

  function registerWorkspaceActions() {
    for (const w of P.workspaces) {
      if (w.main) continue;
      addWorkspaceAction(`ws:${w.id}`, `切换到${w.name}`, `Switch to ${w.name}`, () => P.setWorkspace(w.id));
      if ((w.capabilities || []).includes('addImages')) {
        addWorkspaceAction(`send:${w.id}`, `发送选中图片到${w.name}`, `Send selection to ${w.name}`, () => P.sendSelectionToView(w.id));
      }
      if ((w.capabilities || []).includes('pullImages')) {
        addWorkspaceAction(`pull:${w.id}`, `从${w.name}取选中图片`, `Pull images from ${w.name}`, () => P.pullFromView(w.id));
      }
    }
  }

  P.setWorkspace = async function (wsId) {
    S.workspace = wsId;
    bodyWorkspace(wsId);
    try { await capi.workspace.set(wsId); } catch (e) { P.toast('切换工作区失败：' + e.message); }
    if (wsId === P.mainWorkspaceId) { P.renderAll(); P.refreshChrome(); }
  };

  P.sendSelectionToView = async function (wsId) {
    const sel = P.selectedItems().filter((i) => i.type === 'image');
    if (!sel.length) { P.toast('请先选中图片'); return; }
    const items = [];
    for (const it of sel) {
      const img = S.images.get(it.imgId);
      if (!img || img.missing) continue;
      try {
        const bytes = await P.blobToPng(img, 2000);
        items.push({ name: (it.name || 'image').replace(/\.[^.]+$/, '') + '.png', dataUrl: 'data:image/png;base64,' + bytesToBase64(bytes) });
      } catch (e) { console.warn(e); }
    }
    if (!items.length) { P.toast('没有可发送的图片'); return; }
    const target = P.workspaces.find((w) => w.id === wsId);
    const r = await capi.view.addImages(items, wsId);
    if (r && r.error) P.toast('发送失败：' + r.error);
    else P.toast(`已发送 ${items.length} 张图片到${target ? target.name : wsId}`);
  };

  P.addViewImages = async function (items) {
    if (!items || !items.length) { P.toast('目标工作区没有选中的图片'); return; }
    const center = P.screenToWorld(window.innerWidth / 2, window.innerHeight / 2);
    const created = [];
    let i = 0;
    for (const item of items) {
      try {
        const blob = await (await fetch(item.dataUrl)).blob();
        const meta = await P.loadImageFromBuffer(new Uint8Array(await blob.arrayBuffer()), item.name || '工作区图片.png', null, blob.type);
        if (!meta) continue;
        const it = P.createImageItem(meta, [center[0] + i * 30, center[1] + i * 30], { fit: true });
        if (it) { created.push(it); i++; }
      } catch (e) { console.warn(e); }
    }
    if (!created.length) { P.toast('拉取图片失败'); return; }
    P.markDirty();
    P.renderAll();
    S.sel = new Set(created.map((c) => c.id));
    P.refreshChrome();
    P.toast(`已从工作区取回 ${created.length} 张图片`);
  };

  P.pullFromView = async function (wsId) {
    try {
      const items = await capi.view.pullImages(wsId);
      await P.addViewImages(items || []);
    } catch (e) { P.toast('拉取失败：' + e.message); }
  };

  P.initWorkspace = async function () {
    let list = [];
    try { list = await capi.workspace.list(); } catch { list = []; }
    P.workspaces = list.length ? list : [{ id: 'board', name: '参考板', main: true, capabilities: [] }];
    const main = P.workspaces.find((w) => w.main) || P.workspaces[0];
    P.mainWorkspaceId = main.id;
    try { S.workspace = await capi.workspace.get(); } catch { S.workspace = main.id; }
    if (!P.workspaces.some((w) => w.id === S.workspace)) S.workspace = main.id;
    bodyWorkspace(S.workspace);
    registerWorkspaceActions();
    capi.workspace.onChanged((wsId) => {
      S.workspace = wsId;
      bodyWorkspace(wsId);
      if (wsId === P.mainWorkspaceId) { P.renderAll(); P.refreshChrome(); }
    });
    capi.workspace.onViewImages((items) => { P.addViewImages(items); });
  };

  P.viewWorkspaces = function () { return P.workspaces.filter((w) => !w.main); };

  function workspaceMenuEntries(hasSelection) {
    const out = [];
    for (const w of P.viewWorkspaces()) {
      if ((w.capabilities || []).includes('addImages') && hasSelection) {
        out.push({ label: `发送选中图片到${w.name}`, onClick: () => P.sendSelectionToView(w.id) });
      }
      if ((w.capabilities || []).includes('pullImages')) {
        out.push({ label: `从${w.name}取选中图片`, onClick: () => P.pullFromView(w.id) });
      }
    }
    if (out.length) out.push({ sep: true });
    for (const w of P.viewWorkspaces()) {
      out.push({ label: `切换到${w.name}`, shortcut: w.shortcutLabel || '', onClick: () => P.setWorkspace(w.id) });
    }
    return out;
  }

  // ---------- 自动保存 ----------  // ---------- 自动保存 ----------
  P.scheduleAutosave = function () {
    if (P._autosaveTimer) return;
    P._autosaveTimer = setInterval(async () => {
      if (!S.scene.dirty) return;
      try {
        const payload = await P.serialize();
        await capi.fs.autosave(payload);
        P.log('自动保存完成');
      } catch (e) { P.log('自动保存失败 ' + e.message); }
    }, 45000);
  };

  // ---------- 初始化 ----------
  P.handleOpenPath = async function (p) {
    if (!p) return;
    try {
      if (/\.prcyq$/i.test(p)) await P.openScenePath(p);
      else await P.addImagesFromPaths([p]);
      P.fitAll();
    } catch (e) { P.toast('打开失败：' + e.message); }
  };

  P.initUI = async function () {
    // 标题栏
    document.getElementById('tb-close').onclick = () => capi.win.close();
    document.getElementById('tb-min').onclick = () => capi.win.minimize();
    document.getElementById('tb-max').onclick = () => capi.win.maximize();
    document.getElementById('tb-pin').onclick = (e) => { P.runAction('always-on-top'); };
    // 空场景
    document.getElementById('btn-browse').onclick = async () => {
      const paths = await capi.dialog.openImages();
      if (paths && paths.length) { await P.addImagesFromPaths(paths); P.fitAll(); }
    };
    document.getElementById('file-input').onchange = async (e) => {
      const files = [...e.target.files];
      for (const f of files) {
        const buf = new Uint8Array(await f.arrayBuffer());
        const meta = await P.loadImageFromBuffer(buf, f.name, null, f.type);
        if (meta) P.createImageItem(meta, P.screenToWorld(window.innerWidth / 2, window.innerHeight / 2), { fit: true });
      }
      P.markDirty(); P.renderAll(); P.fitAll();
      e.target.value = '';
    };
    document.getElementById('recent-clear').onclick = () => { P.patchSettings({ recent: [] }); P.renderRecent(); };
    // 层级
    document.getElementById('hier-close').onclick = () => P.toggleHierarchy(false);
    document.getElementById('scene-name').oninput = (e) => { S.scene.name = e.target.value; P.markDirty(); P.renderHierarchy(); };
    document.getElementById('hier-search').oninput = () => P.renderHierarchy();
    document.getElementById('status-icon').onclick = () => P.saveScene(false);
    // 右键场景名
    document.getElementById('scene-name').oncontextmenu = (e) => { e.preventDefault(); P.openContextMenu(e.clientX, e.clientY); };
    // 菜单
    capi.onMenu((action) => { if (action) P.runAction(action); });
    // 监听编辑便签
    P.on('edit-note', (it) => {
      if (!it) return;
      P.refreshToolbar();
      P.renderAll();
    });
    P.on('finish-note', (id) => {
      const it = id ? P.itemById(id) : null;
      if (it) {
        const el = P.getNoteEl(it.id);
        if (el) it.html = el.firstChild.innerHTML;
        if (!it.html || !it.html.trim()) {
          P.pushUndo();
          S.items = S.items.filter((i) => i.id !== it.id);
          S.sel.delete(it.id);
        } else if (it.autoSize) {
          const el2 = P.getNoteEl(it.id);
          if (el2) it.h = Math.max(42, el2.firstChild.scrollHeight + 4);
        }
      }
      P.markDirty(); P.renderAll(); P.refreshToolbar(); P.renderHierarchy();
    });
    P.applyStatusPosition();
    P.applyOpacity();
    await P.initWorkspace();
    const emptyCanvasBtn = document.getElementById('btn-canvas');
    const firstView = P.viewWorkspaces()[0];
    if (emptyCanvasBtn) {
      if (firstView) {
        emptyCanvasBtn.textContent = `打开${firstView.name}工作区`;
        emptyCanvasBtn.onclick = () => P.setWorkspace(firstView.id);
      } else {
        emptyCanvasBtn.classList.add('hidden');
      }
    }
    P.refreshChrome();
  };
})();
