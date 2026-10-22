/* MuseNex — 鼠标/键盘交互 */
window.PRCYQ = window.PRCYQ || {};
(function () {
  const P = window.PRCYQ;
  const S = P.S;
  const capi = window.musenex;

  const keys = { space: false, shift: false, alt: false, meta: false, ctrl: false };
  let pointer = { x: 0, y: 0, sx: 0, sy: 0, down: false };
  let rightDown = null;
  let ignoreNextClick = false;
  const HANDLE_HIT = 12;

  P.initInteract = function () {
    const overlay = document.getElementById('overlay');
    overlay.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    overlay.addEventListener('dblclick', onDoubleClick);
    overlay.addEventListener('contextmenu', (e) => e.preventDefault());
    overlay.addEventListener('pointerleave', () => { P.showHint(null); });
    window.addEventListener('blur', () => { keys.space = false; keys.shift = false; keys.alt = false; keys.meta = false; keys.ctrl = false; });
    // 拖放
    window.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    window.addEventListener('drop', onDrop);
    // 便签输入
    document.getElementById('notes-layer').addEventListener('input', onNoteInput, true);
    document.getElementById('notes-layer').addEventListener('keydown', onNoteKeyDown, true);
    document.getElementById('notes-layer').addEventListener('pointerdown', onNotePointerDown, true);
    // 标题栏悬停
    document.getElementById('titlebar').addEventListener('pointerenter', () => clearTimeout(titleTimer));
    bindTitleHover();
    initWindowChrome();
  };

  // ---------- 无边框窗口：边缘缩放 / 标题栏拖动 ----------
  function initWindowChrome() {
    const overlay = document.getElementById('overlay');
    overlay.addEventListener('pointermove', (e) => {
      if (S.drag || rightDown || isDialogOpen()) return;
      const edge = edgeAt(e.clientX, e.clientY);
      document.body.style.cursor = edge ? edgeCursor(edge) : '';
    });
    // 标题栏拖动
    const tb = document.getElementById('titlebar');
    tb.addEventListener('pointerdown', async (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('button')) return;
      e.preventDefault();
      await capi.win.beginMove({ x: e.screenX, y: e.screenY });
      const move = (ev) => capi.win.moveTo({ x: ev.screenX, y: ev.screenY });
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); capi.win.endMove(); };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
    tb.addEventListener('dblclick', (e) => {
      if (e.target.closest('button')) return;
      if (P.settings.dblclickTitlebar) capi.win.maximize();
    });
  }

  function isDialogOpen() {
    return !document.getElementById('overlay-root').classList.contains('hidden');
  }

  function edgeAt(x, y) {
    if (isDialogOpen()) return null;
    const m = Math.max(3, Math.min(14, P.settings.resizeBorder || 10));
    const W = window.innerWidth, H = window.innerHeight;
    let e = '';
    if (y <= m) e += 'n';
    if (y >= H - m) e += 's';
    if (x <= m) e += 'w';
    if (x >= W - m) e += 'e';
    return e || null;
  }
  function edgeCursor(e) {
    return { n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize' }[e] || 'default';
  }

  async function startWindowResize(e) {
    const edges = e.edges;
    const bounds = await capi.win.getBounds();
    if (!bounds) return;
    const start = { x: e.clientX, y: e.clientY, bounds };
    S.drag = { mode: 'window-resize', edges, start };
    document.body.style.cursor = edgeCursor(edges);
  }

  function doWindowResize(d, e) {
    const dx = e.clientX - d.start.x;
    const dy = e.clientY - d.start.y;
    const b = Object.assign({}, d.start.bounds);
    const minW = 420, minH = 300;
    if (d.edges.includes('e')) b.width = Math.max(minW, d.start.bounds.width + dx);
    if (d.edges.includes('s')) b.height = Math.max(minH, d.start.bounds.height + dy);
    if (d.edges.includes('w')) {
      const w = Math.max(minW, d.start.bounds.width - dx);
      b.x = d.start.bounds.x + (d.start.bounds.width - w);
      b.width = w;
    }
    if (d.edges.includes('n')) {
      const h = Math.max(minH, d.start.bounds.height - dy);
      b.y = d.start.bounds.y + (d.start.bounds.height - h);
      b.height = h;
    }
    capi.win.setBoundsLive(b);
  }

  // ---------- 工具函数 ----------
  function isEditingText() {
    const a = document.activeElement;
    if (!a) return false;
    if (a.isContentEditable) return true;
    const tag = a.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  }
  P.isEditingText = isEditingText;

  function localPointer(e) {
    const r = document.getElementById('overlay').getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  // ---------- 指针 ----------
  function onPointerDown(e) {
    if (document.getElementById('overlay-root').classList.contains('hidden') === false) return; // 对话框打开
    // 同步修饰键（支持合成事件/触控笔等不带 keyboard 状态的场景）
    keys.shift = !!e.shiftKey; keys.alt = !!e.altKey; keys.meta = !!e.metaKey; keys.ctrl = !!e.ctrlKey;
    const p = localPointer(e);
    pointer = { x: p.x, y: p.y, down: true };
    S.lastPointer = { x: p.x, y: p.y };
    // 窗口边缘缩放
    const edge = e.button === 0 ? edgeAt(p.x, p.y) : null;
    if (edge) { e.edges = edge; startWindowResize(e); return; }

    if (S.editingNote) {
      // 点击便签外部结束编辑
      const hit = P.hitTest(...P.screenToWorld(p.x, p.y));
      if (!hit || hit.id !== S.editingNote) P.finishEditNote();
      if (!hit || hit.id !== S.editingNote) P.requestRender();
      return;
    }

    if (e.button === 2) {
      rightDown = { x: e.screenX, y: e.screenY, moved: false };
      return;
    }
    if (e.button === 1) {
      S.drag = { mode: 'pan', x: p.x, y: p.y };
      document.body.style.cursor = 'grabbing';
      return;
    }
    if (e.button !== 0) return;

    if (keys.space || (keys.alt && !S.sel.size)) {
      S.drag = { mode: 'pan', x: p.x, y: p.y };
      document.body.style.cursor = 'grabbing';
      return;
    }

    // 绘制工具
    if (S.tool !== 'select') { startDraw(p); return; }

    // 裁剪模式
    if (S.crop) { handleCropDown(p, e); return; }

    const [wx, wy] = P.screenToWorld(p.x, p.y);

    // 手柄
    const sel = P.selectedItems();
    if (sel.length === 1 && !sel[0].locked) {
      const hp = P.handlePoints(sel[0]);
      const rotD = Math.hypot(p.x - hp.rotate[0], p.y - hp.rotate[1]);
      if (rotD < HANDLE_HIT) {
        P.pushUndo();
        const it = sel[0];
        const cx = P.worldToScreen(it.x + it.w / 2, it.y + it.h / 2);
        S.drag = { mode: 'rotate', item: it, cx: cx[0], cy: cx[1], start: Math.atan2(p.y - cx[1], p.x - cx[0]), rot0: it.rot || 0 };
        return;
      }
      for (let i = 0; i < 4; i++) {
        const c = hp.corners[i];
        if (Math.hypot(p.x - c[0], p.y - c[1]) < HANDLE_HIT) {
          P.pushUndo();
          const it = sel[0];
          const opposite = hp.corners[(i + 2) % 4];
          const [awx, awy] = P.screenToWorld(opposite[0], opposite[1]);
          const [swx, swy] = P.screenToWorld(c[0], c[1]);
          const dirX = i === 0 || i === 3 ? -1 : 1;
          const dirY = i === 0 || i === 1 ? -1 : 1;
          const ccx = it.x + it.w / 2, ccy = it.y + it.h / 2;
          const aRad = (it.rot || 0) * Math.PI / 180;
          const lx = (swx - awx) * Math.cos(-aRad) - (swy - awy) * Math.sin(-aRad);
          const ly = (swx - awx) * Math.sin(-aRad) + (swy - awy) * Math.cos(-aRad);
          S.drag = { mode: 'scale', item: it, corner: i, anchorWorld: [awx, awy], startLocal: [lx, ly], startW: it.w, startH: it.h, dirX, dirY, start: p, rot: it.rot || 0 };
          return;
        }
      }
    }

    const hit = P.hitTest(wx, wy);
    if (hit) {
      const isGroupChild = hit.parentId ? P.itemById(hit.parentId) : null;
      let target = hit;
      // 锁定组：点击选中组
      if (isGroupChild && isGroupChild.type === 'group' && isGroupChild.lockMode === 'locked') target = isGroupChild;

      const gestureMods = keys.meta || keys.alt;
      if (!S.sel.has(target.id)) {
        if (keys.shift && !gestureMods) S.sel.add(target.id);
        else S.sel = new Set([target.id]);
      } else if (keys.shift && !gestureMods) {
        S.sel.delete(target.id);
        P.requestRender(); P.refreshChrome();
        return;
      }
      P.requestRender(); P.refreshChrome();

      const items = P.selectedItems();
      if (items.some((i) => i.locked)) {
        if (!items.every((i) => i.locked)) return;
      }
      P.pushUndo();
      // 组合修饰键
      let mode = 'move';
      if (keys.meta && keys.alt && keys.shift) mode = 'opacity';
      else if (keys.meta && keys.alt) mode = 'scale-free';
      else if (keys.meta && keys.shift) mode = 'rotate-snap';
      else if (keys.meta) mode = 'rotate';
      else if (keys.alt && keys.shift) mode = 'flip';
      // 单键修饰（C/Z/S/D）——按下对应键再拖动
      if (keys.c) mode = 'crop-drag';
      else if (keys.z) mode = 'zoom-item';
      else if (keys.s) { mode = 'pick'; }
      else if (keys.d) { mode = 'coords'; }

      const cx = P.worldToScreen(target.x + target.w / 2, target.y + target.h / 2);
      S.drag = {
        mode, items, target, start: { x: p.x, y: p.y }, startWorld: [wx, wy],
        startItems: items.map((i) => ({ id: i.id, x: i.x, y: i.y, w: i.w, h: i.h, rot: i.rot || 0, opacity: i.opacity == null ? 1 : i.opacity, flipH: i.flipH, flipV: i.flipV })),
        cx: cx[0], cy: cx[1],
        startAngle: Math.atan2(p.y - cx[1], p.x - cx[0]),
        startOpacity: target.opacity == null ? 1 : target.opacity,
        flipped: false,
      };
      if (mode === 'move') document.body.style.cursor = 'move';
      return;
    }

    // 空白：框选
    if (!keys.shift) P.clearSelection();
    S.drag = { mode: 'marquee', x1: wx, y1: wy, x2: wx, y2: wy, additive: keys.shift, base: keys.shift ? new Set(S.sel) : new Set() };
    S.marquee = { x1: wx, y1: wy, x2: wx, y2: wy };
    P.requestRender();
  }

  function onPointerMove(e) {
    keys.shift = !!e.shiftKey; keys.alt = !!e.altKey; keys.meta = !!e.metaKey; keys.ctrl = !!e.ctrlKey;
    const p = localPointer(e);
    pointer.sx = e.screenX; pointer.sy = e.screenY;
    S.lastPointer = { x: p.x, y: p.y };

    // 右键：窗口移动 / 菜单
    if (rightDown) {
      if (e.buttons & 2) {
        const dx = e.screenX - rightDown.x, dy = e.screenY - rightDown.y;
        if (!rightDown.moved && Math.hypot(dx, dy) > 3) {
          rightDown.moved = true;
          capi.win.beginMove({ x: rightDown.x, y: rightDown.y });
        }
        if (rightDown.moved) capi.win.moveTo({ x: e.screenX, y: e.screenY });
      }
      return;
    }

    if (!S.drag) {
      // 悬停提示与光标
      updateHover(p);
      if (S.editingNote) return;
      return;
    }

    const d = S.drag;
    const [wx, wy] = P.screenToWorld(p.x, p.y);
    if (d.mode === 'window-resize') { doWindowResize(d, e); return; }
    if (d.mode === 'pan') {
      P.panBy(p.x - d.x, p.y - d.y);
      d.x = p.x; d.y = p.y;
      return;
    }
    if (d.mode === 'marquee') {
      d.x2 = wx; d.y2 = wy;
      S.marquee = { x1: d.x1, y1: d.y1, x2: wx, y2: wy };
      const box = { x: Math.min(d.x1, wx), y: Math.min(d.y1, wy), w: Math.abs(wx - d.x1), h: Math.abs(wy - d.y1) };
      const picked = S.items.filter((it) => it.type !== 'group' && !it.locked && rectIntersect(P.bbox([it]), box));
      const set = new Set(d.base);
      for (const it of picked) set.add(it.id);
      if (set.size !== S.sel.size) { S.sel = set; P.refreshChrome(); }
      P.requestRender();
      return;
    }
    if (d.mode === 'move') {
      let dx = (p.x - d.start.x) / S.cam.z;
      let dy = (p.y - d.start.y) / S.cam.z;
      if (keys.shift && Math.abs(dx) > Math.abs(dy)) dy = 0;
      else if (keys.shift) dx = 0;
      // 网格吸附
      if (P.settings.snapGrid || S.scene.snapGrid) {
        const g = Math.max(8, P.settings.gridSize || 40);
        for (const it of d.items) {
          it.x = Math.round((it.x + dx) / g) * g;
          it.y = Math.round((it.y + dy) / g) * g;
        }
      } else {
        for (const s of d.startItems) {
          const it = P.itemById(s.id);
          if (it) { it.x = s.x + dx; it.y = s.y + dy; }
        }
        // 邻居吸附 + 参考线
        neighborSnap(d.items);
      }
      P.normalizeGroups();
      P.requestRender();
      return;
    }
    if (d.mode === 'rotate' || d.mode === 'rotate-snap') {
      const ang = Math.atan2(p.y - d.cy, p.x - d.cx);
      let deg = d.startItems[0].rot + (ang - d.startAngle) * 180 / Math.PI;
      if (keys.shift || d.mode === 'rotate-snap') deg = Math.round(deg / 45) * 45;
      for (const it of d.items) if (it.type !== 'group') it.rot = deg;
      P.normalizeGroups(); P.requestRender();
      return;
    }
    if (d.mode === 'scale' || d.mode === 'scale-free') {
      const it = d.item;
      const rot = (x, y) => {
        const a = (it.rot || 0) * Math.PI / 180;
        return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
      };
      const anchor = d.anchorWorld;
      const cur = [wx, wy];
      const [lx, ly] = rot(cur[0] - anchor[0], cur[1] - anchor[1]);
      const [sx, sy] = d.startLocal;
      let fx = Math.abs(sx) > 1 ? Math.abs(lx) / Math.abs(sx) : 1;
      let fy = Math.abs(sy) > 1 ? Math.abs(ly) / Math.abs(sy) : 1;
      if (d.mode === 'scale') { const f = Math.max(fx, fy); fx = f; fy = f; }
      fx = Math.max(0.02, Math.min(40, fx)); fy = Math.max(0.02, Math.min(40, fy));
      const nw = Math.max(12, d.startW * fx), nh = Math.max(12, d.startH * fy);
      const [ox, oy] = rot(d.dirX * nw / 2, d.dirY * nh / 2);
      const cx = anchor[0] + ox, cy = anchor[1] + oy;
      it.w = nw; it.h = nh;
      it.x = cx - nw / 2; it.y = cy - nh / 2;
      P.normalizeGroups(); P.requestRender();
      return;
    }
    if (d.mode === 'flip') {
      if (d.flipped) return;
      const dx = p.x - d.start.x, dy = p.y - d.start.y;
      if (Math.hypot(dx, dy) > 18) {
        d.flipped = true;
        if (Math.abs(dx) > Math.abs(dy)) P.flip('h'); else P.flip('v');
      }
      return;
    }
    if (d.mode === 'opacity') {
      const dx = p.x - d.start.x;
      let v = d.startOpacity + dx / 220;
      v = Math.max(0.05, Math.min(1, v));
      for (const it of d.items) it.opacity = v;
      P.emit && P.emit('opacity', v);
      P.requestRender();
      return;
    }
    if (d.mode === 'zoom-item') {
      const dy = p.y - d.start.y;
      const f = Math.exp(-dy * 0.004);
      for (const s of d.startItems) {
        const it = P.itemById(s.id);
        if (!it) continue;
        const nw = s.w * f, nh = s.h * f;
        it.w = nw; it.h = nh;
        it.x = s.x + (s.w - nw) / 2; it.y = s.y + (s.h - nh) / 2;
      }
      P.normalizeGroups(); P.requestRender();
      return;
    }
    if (d.mode === 'crop-drag') {
      if (!d.cropRect) {
        d.cropRect = { x: Math.min(d.startWorld[0], wx), y: Math.min(d.startWorld[1], wy), w: 0, h: 0 };
      }
      d.cropRect.x = Math.min(d.startWorld[0], wx);
      d.cropRect.y = Math.min(d.startWorld[1], wy);
      d.cropRect.w = Math.abs(wx - d.startWorld[0]);
      d.cropRect.h = Math.abs(wy - d.startWorld[1]);
      S.crop = { itemId: d.target.id, rect: d.cropRect, mode: 'drag' };
      P.requestRender();
      return;
    }
    if (d.mode === 'pick') {
      if (p.x !== d.start.x || p.y !== d.start.y) {
        const col = sampleColor(p.x, p.y);
        if (col) {
          P.showHint(col, p.x, p.y);
          d.lastColor = col;
        }
      }
      return;
    }
    if (d.mode === 'coords') {
      P.showHint(`x: ${Math.round(wx)}, y: ${Math.round(wy)}`, p.x, p.y);
      return;
    }
    if (d.mode === 'draw') {
      const pt = keys.shift && d.points.length ? constrain(d.points[0], [wx, wy]) : [wx, wy];
      if (d.tool === 'pen') d.points.push([wx, wy]);
      else d.points = [d.points[0], pt];
      P.requestRender();
      return;
    }
  }

  function rectIntersect(a, b) {
    if (!a || !b) return false;
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }
  function constrain(a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    if (Math.abs(dx) > Math.abs(dy) * 2) return [b[0], a[1]];
    if (Math.abs(dy) > Math.abs(dx) * 2) return [a[0], b[1]];
    const l = Math.max(Math.abs(dx), Math.abs(dy));
    return [a[0] + Math.sign(dx || 1) * l, a[1] + Math.sign(dy || 1) * l];
  }

  function neighborSnap(items) {
    S.guidesX = []; S.guidesY = [];
    const selIds = new Set(items.map((i) => i.id));
    const others = S.items.filter((i) => !selIds.has(i.id) && i.type !== 'group');
    const b = P.bbox(items);
    if (!b) return;
    const tol = 6 / S.cam.z;
    const edgesSel = [b.x, b.x + b.w / 2, b.x + b.w];
    const edgesSelY = [b.y, b.y + b.h / 2, b.y + b.h];
    let bestX = null, bestY = null;
    for (const o of others) {
      const ob = P.bbox([o]);
      for (const oe of [ob.x, ob.x + ob.w / 2, ob.x + ob.w]) {
        for (const se of edgesSel) {
          const d = oe - se;
          if (Math.abs(d) < tol && (!bestX || Math.abs(d) < Math.abs(bestX.d))) bestX = { d, at: oe };
        }
      }
      for (const oe of [ob.y, ob.y + ob.h / 2, ob.y + ob.h]) {
        for (const se of edgesSelY) {
          const d = oe - se;
          if (Math.abs(d) < tol && (!bestY || Math.abs(d) < Math.abs(bestY.d))) bestY = { d, at: oe };
        }
      }
    }
    if (bestX) {
      for (const it of items) it.x += bestX.d;
      S.guidesX.push(bestX.at);
    }
    if (bestY) {
      for (const it of items) it.y += bestY.d;
      S.guidesY.push(bestY.at);
    }
  }

  function updateHover(p) {
    const [wx, wy] = P.screenToWorld(p.x, p.y);
    const hit = P.hitTest(wx, wy);
    let cursor = 'default';
    if (keys.space || keys.alt) cursor = 'grab';
    else if (S.tool !== 'select') cursor = 'crosshair';
    else if (S.crop) cursor = 'crosshair';
    else if (hit) cursor = 'move';
    document.body.style.cursor = cursor;
  }

  function onPointerUp(e) {
    if (rightDown) {
      if (!rightDown.moved) P.openContextMenu(e.clientX, e.clientY);
      else capi.win.endMove();
      rightDown = null;
      return;
    }
    const d = S.drag;
    if (!d) return;
    const p = localPointer(e);

    if (d.mode === 'window-resize') { S.drag = null; document.body.style.cursor = ''; return; }
    if (d.mode === 'marquee') {
      S.marquee = null;
    } else if (d.mode === 'move') {
      S.guidesX = []; S.guidesY = [];
      // 拖入组
      if (P.settings.dragIntoGroups && d.target && d.target.parentId) {
        // 保持
      }
      P.markDirty();
      P.normalizeGroups();
    } else if (d.mode === 'opacity') {
      P.markDirty();
    } else if (d.mode === 'crop-drag' && d.cropRect && d.cropRect.w > 4) {
      S.crop = { itemId: d.target.id, rect: d.cropRect, mode: 'drag' };
      P.toast('裁剪：拖动角点调整，Enter 应用，Esc 取消');
    } else if (d.mode === 'pick') {
      if (d.lastColor) { capi.clipboard.writeText(d.lastColor); P.toast('已复制颜色 ' + d.lastColor); }
      P.showHint(null);
    } else if (d.mode === 'draw') {
      finishDraw(d);
    } else if (d.mode === 'scale' || d.mode === 'rotate' || d.mode === 'flip' || d.mode === 'zoom-item') {
      P.markDirty(); P.normalizeGroups();
    }
    S.drag = null;
    document.body.style.cursor = 'default';
    ignoreNextClick = false;
    P.requestRender(); P.refreshChrome(); P.emit && P.emit('selection');
  }

  // ---------- 双指/滚轮 ----------
  function onWheel(e) {
    if (document.getElementById('overlay-root').classList.contains('hidden') === false) return;
    if (isEditingText()) return;
    e.preventDefault();
    const p = localPointer(e);
    const zoomIntent = e.ctrlKey || e.metaKey || P.settings.wheel === 'zoom';
    if (zoomIntent) {
      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 16;
      const factor = Math.exp(-dy * (P.settings.trackpad && Math.abs(dy) < 40 ? 0.004 : 0.0018));
      P.zoomAt(p.x, p.y, P.settings.invertWheel ? 1 / factor : factor);
    } else {
      let dx = e.deltaX, dy = e.deltaY;
      if (e.shiftKey) { dx = dy; dy = 0; }
      if (P.settings.invertWheel) { dx = -dx; dy = -dy; }
      P.panBy(-dx, -dy);
    }
  }

  // ---------- 双击 ----------
  function onDoubleClick(e) {
    if (isEditingText()) return;
    const p = localPointer(e);
    const [wx, wy] = P.screenToWorld(p.x, p.y);
    const hit = P.hitTest(wx, wy);
    if (hit) {
      if (hit.type === 'note') {
        P.selectOnly([hit.id]);
        P.startEditNote(hit);
        P.requestRender();
      } else if (hit.type === 'group') {
        // 穿透选中组内项
        const target = S.items.filter((i) => i.parentId === hit.id).sort((a, b) => S.items.indexOf(b) - S.items.indexOf(a))[0];
        if (target) P.selectOnly([target.id]);
      } else if (P.settings.dblclickFocus) {
        P.selectOnly([hit.id]);
        P.focusItem(hit);
      }
    } else {
      P.fitAll();
    }
  }

  // ---------- 键盘 ----------
  function onKeyDown(e) {
    const editing = isEditingText();
    // 文本编辑中：只处理 Esc 与格式快捷键（交给工具栏/浏览器）
    if (editing) {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (S.editingNote) P.finishEditNote();
        else document.activeElement.blur();
        return;
      }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); P.finishEditNote(); return; }
      return;
    }
    if (['Shift', 'Alt', 'Meta', 'Control'].includes(e.key)) {
      if (e.key === 'Shift') keys.shift = true;
      if (e.key === 'Alt') keys.alt = true;
      if (e.key === 'Meta') keys.meta = true;
      if (e.key === 'Control') keys.ctrl = true;
      return;
    }
    if (e.key === ' ') { keys.space = true; }
    if (/^[a-zA-Z]$/.test(e.key)) keys[e.key.toLowerCase()] = true;

    const combo = P.eventToCombo(e);
    if (!combo) return;

    // 数字键用于绘制样式；在非绘制模式下允许作为快捷键
    const actionId = P.resolveKey(combo);
    if (actionId) {
      e.preventDefault();
      P.runAction(actionId, { event: e });
      return;
    }

    // 额外：Esc 取消裁剪/选择
    if (e.key === 'Escape') {
      if (S.crop) { S.crop = null; P.requestRender(); return; }
      if (S.tool !== 'select') { P.setTool('select'); return; }
      P.clearSelection();
      P.requestRender();
    }
    // 裁剪确认
    if (e.key === 'Enter' && S.crop) { P.applyCropFromUI && P.applyCropFromUI(); e.preventDefault(); }
    if ((e.key === 'Delete' || e.key === 'Backspace') && S.sel.size) { P.deleteSelected(); e.preventDefault(); }
  }
  function onKeyUp(e) {
    if (e.key === 'Shift') keys.shift = false;
    if (e.key === 'Alt') keys.alt = false;
    if (e.key === 'Meta') keys.meta = false;
    if (e.key === 'Control') keys.ctrl = false;
    if (e.key === ' ') keys.space = false;
    if (/^[a-zA-Z]$/.test(e.key)) keys[e.key.toLowerCase()] = false;
  }

  // ---------- 绘制 ----------
  async function entriesToFiles(dataTransfer) {
    // 支持拖入文件夹（递归扫描其中的图片）
    const entries = [];
    for (const item of [...(dataTransfer.items || [])]) {
      if (item.kind !== 'file') continue;
      const entry = item.webkitGetAsEntry && item.webkitGetAsEntry();
      if (entry) entries.push(entry);
    }
    if (!entries.length) return [...(dataTransfer.files || [])];
    const out = [];
    const walk = (entry) => new Promise((resolve) => {
      if (entry.isFile) entry.file((f) => { out.push(f); resolve(); }, () => resolve());
      else if (entry.isDirectory) {
        const reader = entry.createReader();
        const readBatch = () => reader.readEntries(async (batch) => {
          if (!batch.length) { resolve(); return; }
          for (const en of batch) await walk(en);
          readBatch();
        }, () => resolve());
        readBatch();
      } else resolve();
    });
    for (const en of entries) await walk(en);
    return out;
  }

  function onDrop(e) {
    e.preventDefault();
    if (document.getElementById('overlay-root').classList.contains('hidden') === false) return;
    const p = localPointer(e);
    const pos = P.screenToWorld(p.x, p.y);
    const dt = e.dataTransfer;
    const text = dt.getData('text/uri-list') || dt.getData('text/plain');
    const urls = [];
    if (text) {
      for (const line of text.split(/\r?\n/)) {
        const t = line.trim();
        if (/^https?:\/\//i.test(t) && /\.(png|jpe?g|gif|webp|bmp|svg|avif)(\?|$)/i.test(t)) urls.push(t);
      }
    }
    (async () => {
      const files = await entriesToFiles(dt);
      if (files.length) {
        const imgs = files.filter((f) => f.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|tiff?|svg|avif|heic)$/i.test(f.name));
        if (!imgs.length) { P.toast('没有找到可导入的图片'); return; }
        let i = 0;
        for (const f of imgs) {
          const buf = new Uint8Array(await f.arrayBuffer());
          const meta = await P.loadImageFromBuffer(buf, f.name, null, f.type);
          if (meta) {
            const it = P.createImageItem(meta, [pos[0] + i * 26, pos[1] + i * 26], { fit: true });
            if (it) { S.sel = new Set([it.id]); i++; }
          }
        }
        if (i) { P.markDirty(); P.renderAll(); P.refreshChrome(); if (P.settings.selectPack) P.arrangeSelected(P.settings.packNewBy); }
        return;
      }
      if (urls.length) {
        for (const u of urls.slice(0, 20)) {
          try {
            P.toast('正在加载 ' + u.split('/').pop());
            const r = await fetch(u);
            const buf = new Uint8Array(await r.arrayBuffer());
            const meta = await P.loadImageFromBuffer(buf, decodeURIComponent(u.split('/').pop().split('?')[0]) || '网络图片', u, r.headers.get('content-type'));
            if (meta) P.createImageItem(meta, pos, { fit: true });
          } catch (err) { P.toast('加载失败：' + u); }
        }
        P.markDirty(); P.renderAll(); P.refreshChrome();
        return;
      }
      P.paste(pos);
    })();
  }

  // ---------- 便签编辑事件 ----------
  function onNoteInput(e) {
    const el = e.target.closest && e.target.closest('.note-item');
    if (!el) return;
    const it = P.itemById(el.dataset.id);
    if (!it) return;
    const box = el.firstChild;
    it.html = box.innerHTML;
    if (it.autoSize) P.autoSizeNote(it);
    P.markDirty();
    P.requestRender();
  }
  function onNoteKeyDown(e) {
    if (e.key === 'Escape') { e.preventDefault(); P.finishEditNote(); }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); P.finishEditNote(); }
    // 列表快捷输入
    if (e.key === ' ') {
      const box = e.target;
      if (!box || !box.isContentEditable) return;
      setTimeout(() => {
        const el = box.closest('.note-item'); if (!el) return;
        const it = P.itemById(el.dataset.id); if (!it) return;
        const text = box.innerText || '';
        if (!text.includes('<li')) {
          if (/^\*\s$/.test(text)) { document.execCommand('insertUnorderedList'); }
          if (/^1\.\s$/.test(text)) { document.execCommand('insertOrderedList'); }
        }
        it.html = box.innerHTML;
        P.markDirty();
      }, 0);
    }
    e.stopPropagation();
  }
  function onNotePointerDown(e) {
    const el = e.target.closest && e.target.closest('.note-item');
    if (!el) return;
    if (S.editingNote === el.dataset.id) { e.stopPropagation(); return; }
    e.stopPropagation();
  }

  // ---------- 绘制流程 ----------
  function startDraw(p) {
    const [wx, wy] = P.screenToWorld(p.x, p.y);
    const tool = S.tool;
    if (tool === 'eraser') {
      const hit = P.hitTest(wx, wy);
      if (hit && hit.type === 'draw') { P.pushUndo(); S.items = S.items.filter((i) => i !== hit); P.markDirty(); P.renderAll(); }
      S.drag = { mode: 'erase' };
      return;
    }
    S.drag = { mode: 'draw', tool, points: [[wx, wy]], start: { x: p.x, y: p.y } };
    document.body.style.cursor = 'crosshair';
  }
  function finishDraw(d) {
    const pts = d.points;
    if (!pts || pts.length < 2) { S.drag = null; return; }
    P.pushUndo();
    let shape = 'pen';
    if (d.tool === 'line') shape = 'line';
    if (d.tool === 'rect') shape = 'rect';
    if (d.tool === 'ellipse') shape = 'ellipse';
    const it = P.createDrawItem(shape, pts, S.pen);
    P.selectOnly([it.id]);
    P.markDirty();
    P.renderAll();
    P.setTool('select');
  }

  // ---------- 颜色采样 ----------
  function sampleColor(sx, sy) {
    const c = document.getElementById('scene');
    const ctx = c.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    try {
      const d = ctx.getImageData(Math.round(sx * dpr), Math.round(sy * dpr), 1, 1).data;
      const hex = '#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join('');
      return hex.toUpperCase();
    } catch { return null; }
  }
  P.sampleColor = sampleColor;

  // ---------- 标题栏 ----------
  let titleTimer = null;
  function bindTitleHover() {
    const tb = document.getElementById('titlebar');
    const vis = P.settings.titleBarVisibility;
    if (vis === 'always') { tb.classList.add('visible'); return; }
    if (vis === 'never') { tb.classList.add('hidden'); return; }
    let hideTimer = null;
    document.addEventListener('mousemove', (e) => {
      if (P.settings.titleBarVisibility !== 'hover') return;
      if (e.clientY < 10) { tb.classList.add('visible'); clearTimeout(hideTimer); }
      else if (e.clientY > 46) {
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => tb.classList.remove('visible'), 500);
      }
    });
  }

  P.createNoteAtCenter = function () {
    const w = P.screenToWorld(window.innerWidth / 2, window.innerHeight / 2);
    P.pushUndo();
    const it = P.createNoteItem([w[0] - 130, w[1] - 60]);
    P.selectOnly([it.id]);
    P.markDirty(); P.renderAll();
    P.startEditNote(it);
    return it;
  };
})();
