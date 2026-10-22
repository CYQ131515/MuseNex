/* MuseNex — 数据模型、场景、撤销、文件格式 */
window.PRCYQ = window.PRCYQ || {};
(function () {
  const P = window.PRCYQ;
  const capi = window.musenex;

  P.DEFAULT_SETTINGS = {
    theme: 'dark',
    language: 'zh',
    titleBarVisibility: 'hover',
    grid: 'none',
    snapGrid: false,
    gridSize: 40,
    windowBorder: true,
    roundedCorners: true,
    appOpacity: 100,
    colors: {
      canvas: '#181818',
      canvasBg: '#000000',
      grid: '#2c2c2c',
      border: '#000000',
      selection: '#2e84aa',
      text: '#d8d8d8',
      textHover: '#ffffff',
    },
    performanceMode: 'memory',
    undoLimit: 200,
    cpuCores: 30,
    thumbnails: true,
    tempDir: '',
    autoOptimize: 'large',
    autoOptimizeRules: [],
    embedImages: true,
    periodicSave: false,
    periodicInterval: 10,
    unsavedBehavior: 'ask',
    autoOpenLast: false,
    recentCount: 5,
    showRecent: true,
    wheel: 'zoom',
    invertWheel: false,
    trackpad: true,
    scaleOnResize: false,
    showStatePopup: true,
    focusAfterDrop: true,
    lockMaximized: false,
    ownSpace: true,
    dblclickTitlebar: true,
    disableTransparentOnActivate: true,
    resizeBorder: 10,
    moveThreshold: 5,
    openFilesIn: 'current',
    statusIcon: 'bottom-right',
    gizmo: true,
    gizmoVisibility: 'all',
    handleSize: 10,
    fadeGizmo: true,
    clipboardMax: 10000,
    imageBorders: 'all',
    alignPadding: 10,
    bringToFront: true,
    selectPack: true,
    packNewBy: 'optimal',
    selectAllTextOnEdit: true,
    autoParentNotes: false,
    dragIntoGroups: true,
    dblclickFocus: true,
    slideshowInterval: 10,
    slideshowOrder: 'selection',
    slideshowFade: 'all',
    sampling: 'bilinear',
    screenProfile: false,
    recent: [],
    lastScene: null,
    windowBounds: null,
    keymap: {},
    customPresets: [],
    cropAspectLock: true,
    naturalSort: true,
  };

  const S = {
    ready: false,
    items: [],
    images: new Map(),
    sel: new Set(),
    tool: 'select',
    pen: { color: '#e8552d', width: 4, style: 'solid' },
    cam: { x: 0, y: 0, z: 1 },
    scene: {
      name: '未命名',
      path: null,
      dirty: false,
      savedAt: 0,
      grid: 'none',
      snapGrid: false,
      grayscale: false,
      bg: null,
      locked: false,
      camera: null,
    },
    undo: [],
    redo: [],
    clipboard: null,
    crop: null,
    editingNote: null,
    playback: new Map(),
    status: 'empty',
    workspace: 'board',
    lastPointer: { x: 0, y: 0 },
    hoverId: null,
    drag: null,
    marquee: null,
    guidesX: [],
    guidesY: [],
    picker: null,
    windowSpace: { W: 0, H: 0, dpr: 1 },
    opacityOverride: null,
    pendingFocus: null,
  };
  P.S = S;

  let settings = JSON.parse(JSON.stringify(P.DEFAULT_SETTINGS));
  P.settings = settings;

  P.uid = (() => { let n = 0; return () => 'i' + (++n) + '_' + Math.random().toString(36).slice(2, 7); })();

  P.init = function (loaded) {
    if (loaded && typeof loaded === 'object') {
      settings = P.settings = deepMerge(JSON.parse(JSON.stringify(P.DEFAULT_SETTINGS)), loaded);
    }
    applySettings();
    const W = window.innerWidth, H = window.innerHeight;
    S.cam = { x: W / 2, y: H / 2, z: 1 };
    S.ready = true;
  };

  function deepMerge(base, patch) {
    if (!patch || typeof patch !== 'object') return base;
    for (const k of Object.keys(patch)) {
      const v = patch[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
        base[k] = deepMerge(base[k], v);
      } else base[k] = v;
    }
    return base;
  }

  P.patchSettings = function (patch) {
    settings = P.settings = deepMerge(settings, patch);
    applySettings();
    capi.settings.set(patch).catch(() => {});
    if (patch && patch.theme && window.musenex && musenex.view) {
      musenex.view.syncTheme(patch.theme).catch(() => {});
    }
    P.emit && P.emit('settings');
  };

  function applySettings() {
    document.body.dataset.theme = settings.theme;
    document.body.classList.toggle('glass', settings.theme === 'glass');
    const r = document.documentElement.style;
    if (settings.theme === 'dark') {
      r.setProperty('--canvas', settings.colors.canvas);
      r.setProperty('--grid', settings.colors.grid);
    } else if (settings.theme === 'light') {
      r.setProperty('--canvas', settings.colors.canvas);
      r.setProperty('--grid', settings.colors.grid);
    }
    P.applyOpacity && P.applyOpacity();
  }
  P.applySettings = applySettings;

  P.getBinding = function (actionId) {
    const a = P.ACTION_MAP[actionId];
    if (!a) return '';
    const custom = settings.keymap && settings.keymap[actionId];
    if (Array.isArray(custom)) return custom[0] || '';
    return a.bindings[0] || '';
  };
  P.getAllBindings = function (actionId) {
    const a = P.ACTION_MAP[actionId];
    const custom = settings.keymap && settings.keymap[actionId];
    return Array.isArray(custom) ? custom.slice() : (a ? a.bindings.slice() : []);
  };
  P.setBindings = function (actionId, list) {
    settings.keymap = settings.keymap || {};
    settings.keymap[actionId] = list;
    capi.settings.set({ keymap: settings.keymap }).catch(() => {});
  };
  P.resolveKey = function (combo) {
    for (const id of Object.keys(P.ACTION_MAP)) {
      const list = P.getAllBindings(id);
      if (list.includes(combo)) return id;
    }
    return null;
  };

  // ---------- 场景脏标记 ----------
  P.markDirty = function (flag = true) {
    S.scene.dirty = flag;
    P.refreshChrome && P.refreshChrome();
    if (flag) P.scheduleAutosave && P.scheduleAutosave();
  };

  // ---------- 撤销 ----------
  P.snapshot = function () {
    return JSON.stringify({
      items: S.items,
      sel: [...S.sel],
      scene: { name: S.scene.name, grid: S.scene.grid, snapGrid: S.scene.snapGrid, grayscale: S.scene.grayscale, bg: S.scene.bg },
    });
  };
  P.pushUndo = function () {
    S.undo.push(P.snapshot());
    const limit = Math.max(10, settings.undoLimit || 200);
    while (S.undo.length > limit) S.undo.shift();
    S.redo.length = 0;
  };
  P.restoreSnapshot = function (str) {
    const snap = JSON.parse(str);
    S.items = snap.items;
    S.sel = new Set(snap.sel);
    Object.assign(S.scene, snap.scene);
    P.normalizeGroups();
    P.markDirty(true);
    P.renderAll && P.renderAll();
    P.refreshChrome && P.refreshChrome();
  };
  P.undo = function () {
    if (!S.undo.length) return false;
    S.redo.push(P.snapshot());
    P.restoreSnapshot(S.undo.pop());
    return true;
  };
  P.redo = function () {
    if (!S.redo.length) return false;
    S.undo.push(P.snapshot());
    P.restoreSnapshot(S.redo.pop());
    return true;
  };

  // ---------- 几何 ----------
  P.bbox = function (items) {
    if (!items || !items.length) return null;
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const it of items) {
      const r = P.itemCorners(it);
      for (const p of r) {
        x1 = Math.min(x1, p[0]); y1 = Math.min(y1, p[1]);
        x2 = Math.max(x2, p[0]); y2 = Math.max(y2, p[1]);
      }
    }
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  };
  P.itemCorners = function (it) {
    const cx = it.x + it.w / 2, cy = it.y + it.h / 2;
    const a = (it.rot || 0) * Math.PI / 180;
    const ca = Math.cos(a), sa = Math.sin(a);
    const hw = it.w / 2, hh = it.h / 2;
    const pts = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
    return pts.map(([x, y]) => [cx + x * ca - y * sa, cy + x * sa + y * ca]);
  };
  P.canvasBBox = function () {
    const items = S.items.filter((i) => i.type !== 'group');
    return P.bbox(items) || { x: -200, y: -150, w: 400, h: 300 };
  };

  P.descendants = function (id) {
    const out = [];
    const walk = (pid) => {
      for (const it of S.items) {
        if (it.parentId === pid) { out.push(it); walk(it.id); }
      }
    };
    walk(id);
    return out;
  };
  P.groupMembers = function (gid) {
    const g = S.items.find((i) => i.id === gid);
    if (!g || g.type !== 'group') return [];
    return S.items.filter((i) => i.parentId === gid);
  };
  P.normalizeGroups = function () {
    for (const g of S.items.filter((i) => i.type === 'group')) {
      const kids = S.items.filter((i) => i.parentId === g.id);
      if (!kids.length) { g.w = Math.max(g.w, 20); g.h = Math.max(g.h, 20); continue; }
      const b = P.bbox(kids);
      const pad = 10;
      g.x = b.x - pad; g.y = b.y - pad; g.w = b.w + pad * 2; g.h = b.h + pad * 2;
    }
  };
  P.childrenOf = function (id) { return S.items.filter((i) => i.parentId === id); };
  P.itemById = function (id) { return S.items.find((i) => i.id === id); };
  P.selectedItems = function () { return S.items.filter((i) => S.sel.has(i.id)); };

  P.hitTest = function (wx, wy) {
    const list = S.items;
    for (let i = list.length - 1; i >= 0; i--) {
      const it = list[i];
      if (it.type === 'group') continue;
      if (P.pointInItem(it, wx, wy)) return it;
    }
    // 组背景
    for (let i = list.length - 1; i >= 0; i--) {
      const it = list[i];
      if (it.type === 'group' && P.pointInItem(it, wx, wy)) return it;
    }
    return null;
  };
  P.pointInItem = function (it, wx, wy) {
    const cx = it.x + it.w / 2, cy = it.y + it.h / 2;
    const a = -(it.rot || 0) * Math.PI / 180;
    const dx = wx - cx, dy = wy - cy;
    const lx = dx * Math.cos(a) - dy * Math.sin(a);
    const ly = dx * Math.sin(a) + dy * Math.cos(a);
    return Math.abs(lx) <= it.w / 2 && Math.abs(ly) <= it.h / 2;
  };
  P.localPoint = function (it, wx, wy) {
    const cx = it.x + it.w / 2, cy = it.y + it.h / 2;
    const a = -(it.rot || 0) * Math.PI / 180;
    const dx = wx - cx, dy = wy - cy;
    return [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a)];
  };

  // ---------- 项创建 ----------
  P.addItem = function (item) {
    S.items.push(item);
    P.normalizeGroups();
    return item;
  };
  P.nextZ = function () { return S.items.length; };

  P.createImageItem = function (meta, worldPos, opts) {
    const img = S.images.get(meta.id);
    if (!img) return null;
    const fit = opts && opts.fit;
    let sc = 1;
    if (fit) {
      const maxW = Math.min(window.innerWidth * 0.55, 900);
      const maxH = Math.min(window.innerHeight * 0.55, 700);
      sc = Math.min(1, maxW / img.w, maxH / img.h);
    }
    const w = Math.max(20, img.w * sc), h = Math.max(20, img.h * sc);
    const it = {
      id: P.uid(), type: 'image', imgId: meta.id,
      x: (worldPos ? worldPos[0] : 0) - w / 2,
      y: (worldPos ? worldPos[1] : 0) - h / 2,
      w, h, rot: 0, opacity: 1, locked: false, parentId: null,
      crop: null, gray: false, bilinear: settings.sampling === 'bilinear',
      flipH: false, flipV: false,
      name: img.name, path: img.path || null, comment: '',
      naturalW: img.w, naturalH: img.h,
    };
    S.items.push(it);
    if (settings.bringToFront) { S.items.splice(S.items.indexOf(it), 1); S.items.push(it); }
    return it;
  };

  P.createNoteItem = function (worldPos, html) {
    const it = {
      id: P.uid(), type: 'note', x: (worldPos ? worldPos[0] : 0), y: (worldPos ? worldPos[1] : 0),
      w: 260, h: 120, rot: 0, opacity: 1, locked: false, parentId: null,
      html: html || '', autoSize: true, style: 'comfortable',
      color: '#e8e8e8', bg: 'rgba(52,52,52,0.92)', name: '便签', comment: '',
    };
    S.items.push(it);
    return it;
  };

  P.createDrawItem = function (shape, points, style) {
    const b = pointsBBox(points);
    const st = style || S.pen;
    const pad = Math.max(4, st.width * 2);
    const it = {
      id: P.uid(), type: 'draw', shape,
      x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2,
      rot: 0, opacity: 1, locked: false, parentId: null,
      points: points.map((p) => [p[0] - (b.x - pad), p[1] - (b.y - pad)]),
      color: st.color, width: st.width, dash: st.style, name: '绘制', comment: '',
    };
    S.items.push(it);
    return it;
  };
  function pointsBBox(points) {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const p of points) { x1 = Math.min(x1, p[0]); y1 = Math.min(y1, p[1]); x2 = Math.max(x2, p[0]); y2 = Math.max(y2, p[1]); }
    return { x: x1, y: y1, w: Math.max(1, x2 - x1), h: Math.max(1, y2 - y1) };
  }

  P.createGroupItem = function (members) {
    const b = P.bbox(members);
    const g = {
      id: P.uid(), type: 'group',
      x: b.x - 10, y: b.y - 10, w: b.w + 20, h: b.h + 20,
      rot: 0, opacity: 1, locked: false, parentId: null,
      bg: 'rgba(255,255,255,0.04)', lockMode: 'open', name: '组', comment: '',
    };
    S.items.push(g);
    // 组放到成员之前
    const idx = S.items.indexOf(g);
    S.items.splice(idx, 1);
    const firstIdx = Math.min(...members.map((m) => S.items.indexOf(m)).filter((i) => i >= 0));
    S.items.splice(firstIdx, 0, g);
    for (const m of members) { m.parentId = g.id; }
    return g;
  };

  // ---------- 选择 ----------
  P.selectOnly = function (ids) { S.sel = new Set(ids); P.refreshChrome && P.refreshChrome(); P.renderOverlay && P.renderOverlay(); };
  P.selectAdd = function (id) { S.sel.add(id); P.refreshChrome && P.refreshChrome(); P.renderOverlay && P.renderOverlay(); };
  P.selectToggle = function (id) { if (S.sel.has(id)) S.sel.delete(id); else S.sel.add(id); P.renderOverlay && P.renderOverlay(); };
  P.clearSelection = function () { S.sel.clear(); P.renderOverlay && P.renderOverlay(); P.refreshChrome && P.refreshChrome(); };
  P.selectAll = function () { S.sel = new Set(S.items.filter((i) => i.type !== 'group' || i.parentId === null).map((i) => i.id)); P.renderOverlay && P.renderOverlay(); };

  // ---------- 操作 ----------
  P.deleteSelected = function () {
    if (!S.sel.size) return;
    P.pushUndo();
    const ids = new Set(S.sel);
    // 删除组时连同子项
    for (const it of S.items) {
      if (it.type === 'group' && S.sel.has(it.id)) for (const d of P.descendants(it.id)) ids.add(d.id);
    }
    S.items = S.items.filter((i) => !ids.has(i.id));
    S.sel.clear();
    P.normalizeGroups(); P.markDirty(); P.renderAll(); P.refreshChrome();
  };

  P.duplicateSelected = function () {
    const items = P.selectedItems();
    if (!items.length) return;
    P.pushUndo();
    const idMap = new Map();
    const copies = items.map((it) => {
      const c = JSON.parse(JSON.stringify(it));
      c.id = P.uid(); idMap.set(it.id, c.id);
      c.x += 30; c.y += 30;
      return c;
    });
    for (const c of copies) if (c.parentId && idMap.has(c.parentId)) c.parentId = idMap.get(c.parentId);
    S.items.push(...copies);
    S.sel = new Set(copies.map((c) => c.id));
    P.markDirty(); P.renderAll(); P.refreshChrome();
  };

  P.copySelected = async function () {
    const items = P.selectedItems();
    if (!items.length) return false;
    S.clipboard = { items: JSON.parse(JSON.stringify(items)), sceneName: S.scene.name };
    // 同时写入剪贴板图片（第一张图片项）
    const first = items.find((i) => i.type === 'image');
    if (first) {
      const img = S.images.get(first.imgId);
      if (img) {
        try { await capi.clipboard.writeImage(new Uint8Array(await blobToPng(img, P.clipboardMaxPx()))); } catch {}
      }
    }
    return true;
  };
  P.clipboardMaxPx = function () { return Math.max(256, settings.clipboardMax || 10000); };

  P.paste = async function (worldPos) {
    // 1) 剪贴板图片优先
    try {
      const buf = await capi.clipboard.readImage();
      if (buf) {
        const meta = await P.loadImageFromBuffer(buf, '剪贴板图片', null, 'image/png');
        if (meta) {
          P.pushUndo();
          const it = P.createImageItem(meta, worldPos || P.screenToWorld(P.S.windowSpace.W / 2, P.S.windowSpace.H / 2), { fit: true });
          if (settings.autoParentNotes) { /* notes only */ }
          P.selectOnly([it.id]);
          P.markDirty(); P.renderAll();
          return true;
        }
      }
    } catch {}
    // 2) 剪贴板文本 → 便签
    try {
      const text = await capi.clipboard.readText();
      if (text && text.trim()) {
        P.pushUndo();
        const pos = worldPos || P.screenToWorld(P.S.windowSpace.W / 2, P.S.windowSpace.H / 2);
        const it = P.createNoteItem([pos[0] - 130, pos[1] - 60], escapeHtml(text).replace(/\n/g, '<br>'));
        P.selectOnly([it.id]);
        P.markDirty(); P.renderAll(); P.startEditNote(it);
        return true;
      }
    } catch {}
    // 3) 内部剪贴板项
    if (S.clipboard && S.clipboard.items.length) {
      P.pushUndo();
      const idMap = new Map();
      const copies = S.clipboard.items.map((it) => {
        const c = JSON.parse(JSON.stringify(it));
        c.id = P.uid(); idMap.set(it.id, c.id);
        c.x += 30; c.y += 30;
        return c;
      });
      for (const c of copies) if (c.parentId && idMap.has(c.parentId)) c.parentId = idMap.get(c.parentId);
      S.items.push(...copies);
      S.sel = new Set(copies.map((c) => c.id));
      P.markDirty(); P.renderAll();
      return true;
    }
    return false;
  };

  P.groupSelected = function () {
    const items = P.selectedItems().filter((i) => i.type !== 'group' || true);
    if (items.length < 2) return;
    P.pushUndo();
    const g = P.createGroupItem(items);
    S.sel = new Set([g.id]);
    P.normalizeGroups(); P.markDirty(); P.renderAll(); P.refreshChrome();
  };
  P.ungroupSelected = function () {
    const groups = P.selectedItems().filter((i) => i.type === 'group');
    if (!groups.length) return;
    P.pushUndo();
    for (const g of groups) {
      const kids = P.childrenOf(g.id);
      for (const k of kids) k.parentId = g.parentId || null;
      S.items = S.items.filter((i) => i !== g);
    }
    P.normalizeGroups(); P.markDirty(); P.renderAll(); P.refreshChrome();
  };
  P.parentSelected = function () {
    const items = P.selectedItems();
    if (items.length < 2) return;
    const target = items[0];
    if (target.type === 'group') return;
    P.pushUndo();
    for (let i = 1; i < items.length; i++) items[i].parentId = target.id;
    P.markDirty(); P.renderAll(); P.refreshChrome();
  };

  P.alignSelected = function (mode) {
    const items = P.selectedItems().filter((i) => i.type !== 'group' || true);
    if (items.length < 2) return;
    P.pushUndo();
    const b = P.bbox(items);
    for (const it of items) {
      const ib = P.bbox([it]);
      if (mode === 'left') it.x += b.x - ib.x;
      if (mode === 'right') it.x += (b.x + b.w) - (ib.x + ib.w);
      if (mode === 'top') it.y += b.y - ib.y;
      if (mode === 'bottom') it.y += (b.y + b.h) - (ib.y + ib.h);
    }
    P.normalizeGroups(); P.markDirty(); P.renderAll();
  };
  P.distributeSelected = function (axis) {
    const items = P.selectedItems().slice().sort((a, b) => axis === 'h' ? a.x - b.x : a.y - b.y);
    if (items.length < 3) return;
    P.pushUndo();
    const first = P.bbox([items[0]]), last = P.bbox([items[items.length - 1]]);
    const total = items.reduce((s, i) => s + (axis === 'h' ? i.w : i.h), 0);
    const span = axis === 'h' ? (last.x + last.w) - first.x : (last.y + last.h) - first.y;
    const gap = (span - total) / (items.length - 1);
    let cursor = axis === 'h' ? first.x : first.y;
    for (const it of items) {
      if (axis === 'h') { it.x = cursor; cursor += it.w + gap; }
      else { it.y = cursor; cursor += it.h + gap; }
    }
    P.normalizeGroups(); P.markDirty(); P.renderAll();
  };
  P.stackSelected = function () {
    const items = P.selectedItems();
    if (!items.length) return;
    P.pushUndo();
    const b = P.bbox(items);
    items.forEach((it, i) => {
      it.x = b.x + b.w / 2 - it.w / 2 + i * 14;
      it.y = b.y + b.h / 2 - it.h / 2 - i * 14;
    });
    P.normalizeGroups(); P.markDirty(); P.renderAll();
  };
  P.normalizeSelected = function (mode) {
    const items = P.selectedItems().filter((i) => i.type === 'image');
    if (!items.length) return;
    P.pushUndo();
    const src = items[0];
    if (mode === 'height') { for (const it of items) { const s = src.h / it.h; it.h = src.h; it.w *= s; } }
    if (mode === 'width') { for (const it of items) { const s = src.w / it.w; it.w = src.w; it.h *= s; } }
    if (mode === 'size') { for (const it of items) { const s = Math.max(src.w, src.h) / Math.max(it.w, it.h); it.w *= s; it.h *= s; } }
    if (mode === 'area') { const area = src.w * src.h; for (const it of items) { const s = Math.sqrt(area / (it.w * it.h)); it.w *= s; it.h *= s; } }
    if (mode === 'scale') {
      const ref = Math.max(src.w / (src.naturalW || src.w), src.h / (src.naturalH || src.h));
      for (const it of items) { const s = ref / Math.max(it.w / (it.naturalW || it.w), it.h / (it.naturalH || it.h)); it.w *= s; it.h *= s; }
    }
    P.normalizeGroups(); P.markDirty(); P.renderAll();
  };

  P.arrangeSelected = function (mode) {
    let items = S.sel.size > 1 ? P.selectedItems().filter((i) => i.type !== 'group') : S.items.filter((i) => i.type !== 'group');
    if (items.length < 1) return;
    P.pushUndo();
    if (mode === 'name') items.sort((a, b) => naturalCompare(a.name || '', b.name || ''));
    else if (mode === 'path') items.sort((a, b) => (a.path || a.name || '').localeCompare(b.path || b.name || ''));
    else if (mode === 'order') items.sort((a, b) => S.items.indexOf(a) - S.items.indexOf(b));
    else if (mode === 'add') items.sort((a, b) => S.items.indexOf(a) - S.items.indexOf(b));
    else if (mode === 'random') items.sort(() => Math.random() - 0.5);
    packItems(items, mode === 'optimal');
    P.normalizeGroups(); P.markDirty(); P.renderAll();
  };

  function packItems(items, optimal) {
    // 以内容面积为基准选择目标行宽，避免受当前缩放影响
    const area = items.reduce((sum, it) => sum + it.w * it.h, 0);
    const targetW = Math.max(1000, Math.min(6000, Math.sqrt(area * 2.2)));
    const originX = -targetW / 2;
    const originY = -items.reduce((m, it) => Math.max(m, it.h), 0) / 2;
    const order = optimal ? items.slice().sort((a, b) => b.w * b.h - a.w * a.h) : items;
    let x = originX, y = originY, rowH = 0;
    for (const it of order) {
      if (x + it.w > originX + targetW && x > originX) { x = originX; y += rowH + 24; rowH = 0; }
      it.x = x; it.y = y;
      x += it.w + 24;
      rowH = Math.max(rowH, it.h);
    }
    // 居中整体
    const b = P.bbox(order);
    const dx = -(b.x + b.w / 2), dy = -(b.y + b.h / 2);
    for (const it of order) { it.x += dx; it.y += dy; }
  }
  P.arrangeAll = function (mode) { S.sel.clear(); P.arrangeSelected(mode); };

  function naturalCompare(a, b) {
    return String(a).localeCompare(String(b), 'zh', { numeric: true, sensitivity: 'base' });
  }

  P.toggleLock = function () {
    const items = P.selectedItems();
    if (!items.length) return;
    P.pushUndo();
    const anyUnlocked = items.some((i) => !i.locked);
    for (const it of items) it.locked = anyUnlocked;
    P.markDirty(); P.renderAll();
  };
  P.toggleGray = function () {
    const items = P.selectedItems().filter((i) => i.type === 'image');
    if (!items.length) { P.patchSettings({}); S.scene.grayscale = !S.scene.grayscale; P.markDirty(); P.renderAll(); return; }
    P.pushUndo();
    const anyOff = items.some((i) => !i.gray);
    for (const it of items) it.gray = anyOff;
    P.markDirty(); P.renderAll();
  };
  P.toggleBilinear = function () {
    const items = P.selectedItems().filter((i) => i.type === 'image');
    if (!items.length) return;
    P.pushUndo();
    for (const it of items) it.bilinear = !it.bilinear;
    P.markDirty(); P.renderAll();
  };
  P.flip = function (dir) {
    const items = P.selectedItems().filter((i) => i.type === 'image');
    if (!items.length) return;
    P.pushUndo();
    for (const it of items) { if (dir === 'h') it.flipH = !it.flipH; else it.flipV = !it.flipV; }
    P.markDirty(); P.renderAll();
  };
  P.resetTransform = function () {
    const items = P.selectedItems().filter((i) => i.type === 'image');
    if (!items.length) return;
    P.pushUndo();
    for (const it of items) {
      const img = S.images.get(it.imgId);
      if (!img) continue;
      const cx = it.x + it.w / 2, cy = it.y + it.h / 2;
      it.w = img.w; it.h = img.h; it.rot = 0; it.flipH = false; it.flipV = false;
      it.x = cx - it.w / 2; it.y = cy - it.h / 2;
    }
    P.normalizeGroups(); P.markDirty(); P.renderAll();
  };
  P.resetCrop = function () {
    const items = P.selectedItems().filter((i) => i.type === 'image' && i.crop);
    if (!items.length) return;
    P.pushUndo();
    for (const it of items) {
      const c = it.crop;
      const img = S.images.get(it.imgId);
      if (!img) continue;
      // 还原显示尺寸
      it.w = it.w * (img.w / c.w); it.h = it.h * (img.h / c.h);
      it.crop = null;
    }
    P.normalizeGroups(); P.markDirty(); P.renderAll();
  };
  P.sendLayer = function (dir) {
    const items = P.selectedItems();
    if (!items.length) return;
    P.pushUndo();
    if (dir === 'front') {
      const keep = S.items.filter((i) => !S.sel.has(i.id));
      S.items = keep.concat(items);
    } else {
      const keep = S.items.filter((i) => !S.sel.has(i.id));
      S.items = items.concat(keep);
    }
    P.markDirty(); P.renderAll();
  };

  // ---------- 图片加载 ----------
  P.imageId = () => 'img_' + Math.random().toString(36).slice(2, 10);

  P.loadImageFromBuffer = async function (buf, name, path, mime, opts) {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let blob;
    try { blob = new Blob([bytes], { type: mime || guessMime(name) }); } catch { return null; }
    let w = 0, h = 0, bitmap = null, el = null, animated = false;
    const type = blob.type || '';
    if (/gif|webp|apng/.test(type) || /\.(gif|webp|apng)$/i.test(name || '')) {
      const url = URL.createObjectURL(blob);
      el = new Image();
      await new Promise((res, rej) => { el.onload = res; el.onerror = rej; el.src = url; });
      w = el.naturalWidth; h = el.naturalHeight;
      animated = /gif|webp/i.test(type);
      bitmap = null;
    } else {
      try { bitmap = await createImageBitmap(blob); w = bitmap.width; h = bitmap.height; }
      catch (e) {
        // 回退到 <img>
        const url = URL.createObjectURL(blob);
        el = new Image();
        await new Promise((res, rej) => { el.onload = res; el.onerror = rej; el.src = url; });
        w = el.naturalWidth; h = el.naturalHeight;
      }
    }
    if (!w || !h) return null;
    const id = P.imageId();
    const linked = opts && opts.linked;
    S.images.set(id, {
      id, w, h, bitmap, el, animated, name: name || '图片', path: path || null,
      mime: type || 'image/png', data: linked ? null : bytes, linked: !!linked,
      frames: null, url: el && el.src ? el.src : null,
    });
    return { id, w, h, name: name || '图片', path: path || null };
  };

  P.loadImageFromPath = async function (p, opts) {
    const r = await capi.fs.readFile(p);
    if (!r || r.error) throw new Error(r && r.error ? r.error : '读取失败');
    const name = p.split('/').pop();
    return P.loadImageFromBuffer(r, name, p, guessMime(name), opts);
  };

  function guessMime(name) {
    const ext = String(name || '').toLowerCase().split('.').pop();
    const map = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff', svg: 'image/svg+xml', avif: 'image/avif', heic: 'image/heic', heif: 'image/heif' };
    return map[ext] || 'application/octet-stream';
  }
  P.guessMime = guessMime;

  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  P.escapeHtml = escapeHtml;

  P.addImagesFromPaths = async function (paths, worldPos) {
    if (!paths || !paths.length) return 0;
    let added = 0;
    const start = worldPos || P.screenToWorld(window.innerWidth / 2, window.innerHeight / 2);
    let col = 0;
    for (const p of paths) {
      try {
        const meta = await P.loadImageFromPath(p);
        if (!meta) continue;
        const pos = [start[0] + col * 30, start[1] + col * 30];
        const it = P.createImageItem(meta, pos, { fit: true });
        if (it) { added++; col++; }
      } catch (e) { console.warn('load fail', p, e); }
    }
    if (added) {
      P.normalizeGroups();
      P.markDirty();
      P.renderAll();
      if (settings.selectPack) {
        const newOnes = S.items.slice(-added);
        S.sel = new Set(newOnes.map((i) => i.id));
        P.arrangeSelected(settings.packNewBy || 'optimal');
      }
      P.refreshChrome();
    }
    return added;
  };

  P.addImageFromBufferAuto = async function (buf, name, mime, worldPos) {
    const meta = await P.loadImageFromBuffer(buf, name, null, mime);
    if (!meta) return null;
    const it = P.createImageItem(meta, worldPos || P.screenToWorld(window.innerWidth / 2, window.innerHeight / 2), { fit: true });
    P.markDirty(); P.renderAll(); P.selectOnly([it.id]);
    return it;
  };

  // ---------- 场景序列化 ----------
  P.serialize = async function () {
    const imgMetas = [];
    const blobs = [];
    const used = new Set(S.items.filter((i) => i.type === 'image').map((i) => i.imgId));
    for (const id of used) {
      const img = S.images.get(id);
      if (!img) continue;
      let bytes = img.data;
      let mime = img.mime;
      if (!settings.embedImages || img.linked) {
        imgMetas.push({ id, w: img.w, h: img.h, name: img.name, mime, path: img.path, linked: true });
        continue;
      }
      if (!bytes) {
        // 从 bitmap 重新编码
        try { bytes = new Uint8Array(await blobToPng(img, Math.min(4096, Math.max(img.w, img.h)))); mime = 'image/png'; } catch { continue; }
      }
      imgMetas.push({ id, w: img.w, h: img.h, name: img.name, mime, path: img.path, linked: false });
      blobs.push({ id, data: bytes });
    }
    return {
      header: {
        version: 1, app: 'MuseNex', created: Date.now(),
        scene: {
          name: S.scene.name, grid: S.scene.grid, snapGrid: S.scene.snapGrid,
          grayscale: S.scene.grayscale, bg: S.scene.bg,
          camera: { x: S.cam.x, y: S.cam.y, z: S.cam.z },
        },
        items: S.items,
        images: imgMetas,
      },
      images: blobs,
    };
  };

  P.serializeForAutosave = P.serialize;

  P.saveToPath = async function (p, opts, thumbDataUrl) {
    const payload = await P.serialize();
    if (thumbDataUrl) payload.header.thumb = thumbDataUrl;
    const r = await capi.fs.writeScene(p, payload);
    if (r && r.error) throw new Error(r.error);
    S.scene.path = p;
    S.scene.name = p.split('/').pop().replace(/\.prcyq$/i, '');
    S.scene.dirty = false;
    S.scene.savedAt = Date.now();
    await capi.fs.autosaveClear();
    P.addRecent(p, S.scene.name, thumbDataUrl);
    await capi.settings.set({ lastScene: p });
    P.refreshChrome();
    return true;
  };

  P.loadSceneFromPath = async function (p, opts) {
    const r = await capi.fs.readScene(p);
    if (!r || r.error) throw new Error((r && r.error) || '打开失败');
    await P.applyScene(r.header, r.images);
    S.scene.path = p;
    S.scene.name = r.header.scene.name || p.split('/').pop().replace(/\.prcyq$/i, '');
    S.scene.dirty = false;
    S.scene.savedAt = Date.now();
    S.undo.length = 0; S.redo.length = 0;
    if (r.header.scene.camera) {
      const c = r.header.scene.camera;
      S.cam = { x: c.x, y: c.y, z: c.z };
    }
    P.addRecent(p, S.scene.name, r.header.thumb);
    await capi.settings.set({ lastScene: p });
    P.refreshChrome(); P.renderAll(); P.fitAll();
    return true;
  };

  P.applyScene = async function (header, imageBytes) {
    S.items = [];
    S.images = new Map();
    S.sel.clear();
    const sc = header.scene || {};
    S.scene.grid = sc.grid || 'none';
    S.scene.snapGrid = !!sc.snapGrid;
    S.scene.grayscale = !!sc.grayscale;
    S.scene.bg = sc.bg || null;
    for (const meta of header.images || []) {
      if (meta.linked) {
        // 尝试从原路径读取
        let ok = false;
        if (meta.path) {
          try { const res = await capi.fs.readFile(meta.path); if (res && !res.error) { const m = await P.loadImageFromBuffer(res, meta.name, meta.path, meta.mime, { linked: true }); if (m) { S.images.set(meta.id, Object.assign(S.images.get(m.id), { id: meta.id })); S.images.delete(m.id); ok = true; } } } catch {}
        }
        if (!ok) S.images.set(meta.id, { id: meta.id, w: meta.w, h: meta.h, name: meta.name, path: meta.path, mime: meta.mime, missing: true, bitmap: null, data: null });
      } else {
        const bytes = imageBytes && imageBytes[meta.id];
        if (!bytes) { S.images.set(meta.id, { id: meta.id, w: meta.w, h: meta.h, name: meta.name, missing: true, bitmap: null }); continue; }
        try {
          const m = await P.loadImageFromBuffer(bytes, meta.name, meta.path, meta.mime, { linked: false });
          if (m) {
            const rec = S.images.get(m.id);
            rec.id = meta.id;
            S.images.delete(m.id);
            S.images.set(meta.id, rec);
          }
        } catch (e) { console.warn(e); }
      }
    }
    S.items = (header.items || []).map((it) => Object.assign({}, it));
    P.normalizeGroups();
    if (header.scene && header.scene.camera) {
      const c = header.scene.camera;
      S.cam = { x: c.x, y: c.y, z: c.z };
    }
    P.refreshChrome(); P.renderAll();
  };

  // ---------- 最近文件 ----------
  P.addRecent = function (p, name, thumb) {
    let recent = Array.isArray(settings.recent) ? settings.recent.slice() : [];
    recent = recent.filter((r) => r.path !== p);
    recent.unshift({ path: p, name: name || p.split('/').pop(), at: Date.now(), thumb: thumb || null });
    const max = Math.max(1, settings.recentCount || 5);
    recent = recent.slice(0, max * 2);
    P.patchSettings({ recent });
  };
  P.removeRecent = function (p) {
    const recent = (settings.recent || []).filter((r) => r.path !== p);
    P.patchSettings({ recent });
  };

  // ---------- 便签编辑 ----------
  P.startEditNote = function (it) {
    S.editingNote = it.id;
    P.emit && P.emit('edit-note', it);
  };
  P.finishEditNote = function () {
    const id = S.editingNote;
    S.editingNote = null;
    if (id) P.markDirty();
    P.emit && P.emit('finish-note', id);
  };

  // 工具
  async function blobToPng(imgRec, maxPx) {
    const srcW = imgRec.w, srcH = imgRec.h;
    const sc = Math.min(1, maxPx / Math.max(srcW, srcH));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(srcW * sc));
    c.height = Math.max(1, Math.round(srcH * sc));
    const ctx = c.getContext('2d');
    if (imgRec.bitmap) ctx.drawImage(imgRec.bitmap, 0, 0, c.width, c.height);
    else if (imgRec.el) ctx.drawImage(imgRec.el, 0, 0, c.width, c.height);
    const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
    return new Uint8Array(await blob.arrayBuffer());
  }
  P.blobToPng = blobToPng;

  P.thumbDataUrl = function (maxW = 220) {
    const c = document.createElement('canvas');
    const ratio = window.innerHeight / window.innerWidth;
    c.width = maxW; c.height = Math.round(maxW * ratio * 0.6);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, c.width, c.height);
    const b = P.canvasBBox();
    if (b.w > 0) {
      const z = Math.min(c.width / b.w, c.height / b.h) * 0.9;
      ctx.translate(c.width / 2, c.height / 2);
      ctx.scale(z, z);
      ctx.translate(-(b.x + b.w / 2), -(b.y + b.h / 2));
      for (const it of S.items) {
        if (it.type === 'note' || it.type === 'group') continue;
        if (it.type === 'image') {
          const img = S.images.get(it.imgId);
          if (!img || img.missing) continue;
          ctx.save();
          ctx.translate(it.x + it.w / 2, it.y + it.h / 2);
          ctx.rotate((it.rot || 0) * Math.PI / 180);
          try {
            const src = img.bitmap || img.el;
            if (it.crop) ctx.drawImage(src, it.crop.x, it.crop.y, it.crop.w, it.crop.h, -it.w / 2, -it.h / 2, it.w, it.h);
            else ctx.drawImage(src, -it.w / 2, -it.h / 2, it.w, it.h);
          } catch {}
          ctx.restore();
        }
      }
    }
    return c.toDataURL('image/jpeg', 0.6);
  };
})();
