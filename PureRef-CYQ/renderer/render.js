/* MuseNex 参考板 — 画布渲染、相机、便签 DOM、选中框 */
window.PRCYQ = window.PRCYQ || {};
(function () {
  const P = window.PRCYQ;
  const S = P.S;

  let sceneCanvas, sceneCtx, overlay, octx, notesLayer;
  let dpr = 1, W = 0, H = 0;
  const noteEls = new Map();

  P.initRender = function () {
    sceneCanvas = document.getElementById('scene');
    sceneCtx = sceneCanvas.getContext('2d');
    overlay = document.getElementById('overlay');
    octx = overlay.getContext('2d');
    notesLayer = document.getElementById('notes-layer');
    P.resize();
    window.addEventListener('resize', P.resize);
    requestAnimationFrame(loop);
  };

  P.resize = function () {
    dpr = window.devicePixelRatio || 1;
    W = window.innerWidth; H = window.innerHeight;
    S.windowSpace = { W, H, dpr };
    for (const c of [sceneCanvas, overlay]) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
      c.style.width = W + 'px';
      c.style.height = H + 'px';
    }
    P.requestRender();
  };

  P.screenToWorld = function (sx, sy) { return [(sx - S.cam.x) / S.cam.z, (sy - S.cam.y) / S.cam.z]; };
  P.worldToScreen = function (wx, wy) { return [wx * S.cam.z + S.cam.x, wy * S.cam.z + S.cam.y]; };
  P.getViewSize = () => ({ W, H });

  P.zoomAt = function (sx, sy, factor) {
    const [wx, wy] = P.screenToWorld(sx, sy);
    const z = Math.max(0.02, Math.min(12, S.cam.z * factor));
    S.cam.z = z;
    S.cam.x = sx - wx * z;
    S.cam.y = sy - wy * z;
    P.requestRender(); P.emit && P.emit('camera');
  };
  P.setZoom = function (z, anchor) {
    const a = anchor || [W / 2, H / 2];
    P.zoomAt(a[0], a[1], z / S.cam.z);
  };
  P.panBy = function (dx, dy) { S.cam.x += dx; S.cam.y += dy; P.requestRender(); };

  P.fitRect = function (b, pad) {
    pad = pad == null ? 80 : pad;
    if (!b || b.w <= 0 || b.h <= 0) return;
    const z = Math.max(0.02, Math.min(8, Math.min((W - pad * 2) / b.w, (H - pad * 2) / b.h)));
    S.cam.z = z;
    S.cam.x = W / 2 - (b.x + b.w / 2) * z;
    S.cam.y = H / 2 - (b.y + b.h / 2) * z;
    P.requestRender(); P.emit && P.emit('camera');
  };
  P.fitAll = function (pad) {
    const b = P.canvasBBox();
    P.fitRect(b, pad == null ? 90 : pad);
  };
  P.focusItem = function (it) {
    if (!it) return;
    P.fitRect({ x: it.x, y: it.y, w: it.w, h: it.h }, 120);
  };
  P.resetCamera = function () {
    S.cam.x = W / 2; S.cam.y = H / 2;
    P.requestRender(); P.emit && P.emit('camera');
  };
  P.resetZoom = function () { P.setZoom(1); };

  // ---------- 渲染循环 ----------
  let dirty = true;
  let rafActive = true;
  P.requestRender = function () { dirty = true; };
  function loop() {
    if (S.workspace === (P.mainWorkspaceId || 'board') && (dirty || hasAnimation())) {
      dirty = false;
      renderScene();
      renderOverlay();
      syncNotes();
    }
    requestAnimationFrame(loop);
  }
  function hasAnimation() {
    for (const it of S.items) {
      if (it.type !== 'image') continue;
      const img = S.images.get(it.imgId);
      if (img && img.animated && !S.scene.locked) return true;
    }
    return false;
  }
  P.renderAll = function () { dirty = true; };
  P.renderOverlay = function () { dirty = true; };

  function applyCam(ctx) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(S.cam.x, S.cam.y);
    ctx.scale(S.cam.z, S.cam.z);
  }

  function renderScene() {
    const ctx = sceneCtx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bg = settingsCanvasColor();
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    drawGrid(ctx);
    applyCam(ctx);
    const grayCanvas = S.scene.grayscale;
    for (const it of S.items) {
      if (it.type === 'group') drawGroup(ctx, it);
      else if (it.type === 'image') drawImageItem(ctx, it, grayCanvas);
      else if (it.type === 'draw') drawDrawItem(ctx, it);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // 背景边框（窗口模式）
  }

  function settingsCanvasColor() {
    if (S.scene.bg) return S.scene.bg;
    const t = document.body.dataset.theme;
    if (t === 'light') return '#e9e9e9';
    return P.settings.colors.canvas || '#181818';
  }
  P.settingsCanvasColor = settingsCanvasColor;

  function drawGrid(ctx) {
    const style = S.scene.grid !== 'none' ? S.scene.grid : 'none';
    if (style === 'none') return;
    const size = Math.max(8, P.settings.gridSize || 40);
    const z = S.cam.z;
    // 自适应网格间距
    let step = size;
    while (step * z < 14) step *= 2;
    const left = (0 - S.cam.x) / z, top = (0 - S.cam.y) / z;
    const right = (W - S.cam.x) / z, bottom = (H - S.cam.y) / z;
    const x0 = Math.floor(left / step) * step, y0 = Math.floor(top / step) * step;
    ctx.save();
    ctx.lineWidth = 1 / z;
    if (style === 'lines') {
      ctx.strokeStyle = P.settings.colors.grid;
      ctx.beginPath();
      for (let x = x0; x <= right; x += step) { ctx.moveTo(x, top); ctx.lineTo(x, bottom); }
      for (let y = y0; y <= bottom; y += step) { ctx.moveTo(left, y); ctx.lineTo(right, y); }
      ctx.stroke();
    } else {
      ctx.fillStyle = P.settings.colors.grid;
      const r = 1.2 / z;
      for (let x = x0; x <= right; x += step) {
        for (let y = y0; y <= bottom; y += step) {
          ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  function drawGroup(ctx, g) {
    ctx.save();
    ctx.globalAlpha = g.opacity;
    const r = Math.min(12, Math.max(4, 10));
    roundRect(ctx, g.x, g.y, g.w, g.h, r);
    ctx.fillStyle = g.bg || 'rgba(255,255,255,0.035)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1 / S.cam.z;
    ctx.stroke();
    if (g.lockMode === 'locked') {
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.font = `${12}px "Open Sans", sans-serif`;
      ctx.fillText('已锁定', g.x + 8, g.y + 16);
    }
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawImageItem(ctx, it, grayCanvas) {
    const img = S.images.get(it.imgId);
    const cx = it.x + it.w / 2, cy = it.y + it.h / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((it.rot || 0) * Math.PI / 180);
    ctx.scale(it.flipH ? -1 : 1, it.flipV ? -1 : 1);
    ctx.globalAlpha = (it.opacity == null ? 1 : it.opacity);
    ctx.imageSmoothingEnabled = it.bilinear !== false;
    if (it.gray || grayCanvas) ctx.filter = 'grayscale(1)';
    if (!img || img.missing) {
      ctx.filter = 'none';
      ctx.fillStyle = 'rgba(255,255,255,0.045)';
      ctx.fillRect(-it.w / 2, -it.h / 2, it.w, it.h);
      ctx.setLineDash([6 / S.cam.z, 5 / S.cam.z]);
      ctx.strokeStyle = 'rgba(255,120,120,0.55)';
      ctx.lineWidth = 1.4 / S.cam.z;
      ctx.strokeRect(-it.w / 2, -it.h / 2, it.w, it.h);
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,160,160,0.8)';
      ctx.font = `${Math.max(9, 12)}px "Open Sans", sans-serif`;
      ctx.textAlign = 'center';
      const label = (img && img.name) ? img.name : '图片缺失';
      ctx.fillText(label, 0, 0, it.w * 0.9);
      ctx.textAlign = 'left';
    } else {
      const src = img.bitmap || img.el;
      try {
        if (it.crop) {
          ctx.drawImage(src, it.crop.x, it.crop.y, it.crop.w, it.crop.h, -it.w / 2, -it.h / 2, it.w, it.h);
        } else {
          ctx.drawImage(src, -it.w / 2, -it.h / 2, it.w, it.h);
        }
      } catch (e) { /* 解码中 */ }
      // 图片边框
      const borders = P.settings.imageBorders || 'all';
      const showBorder = borders === 'all' || (borders === 'selected' && S.sel.has(it.id));
      if (showBorder) {
        ctx.strokeStyle = 'rgba(255,255,255,0.16)';
        ctx.lineWidth = 1 / S.cam.z;
        ctx.strokeRect(-it.w / 2, -it.h / 2, it.w, it.h);
      }
    }
    ctx.restore();
  }

  function drawDrawItem(ctx, it) {
    ctx.save();
    ctx.translate(it.x, it.y);
    ctx.globalAlpha = it.opacity;
    ctx.strokeStyle = it.color || '#e8552d';
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.lineWidth = it.width || 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash(it.dash === 'dotted' ? [it.width * 1.6, it.width * 2.2] : []);
    const pts = it.points || [];
    if (it.shape === 'pen') {
      ctx.beginPath();
      pts.forEach((p, i) => { if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); });
      ctx.stroke();
    } else if (it.shape === 'line') {
      const a = pts[0], b = pts[pts.length - 1];
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      if (it.dash === 'arrow') {
        const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
        const l = Math.max(12, it.width * 4);
        ctx.beginPath();
        ctx.moveTo(b[0], b[1]);
        ctx.lineTo(b[0] - l * Math.cos(ang - 0.42), b[1] - l * Math.sin(ang - 0.42));
        ctx.moveTo(b[0], b[1]);
        ctx.lineTo(b[0] - l * Math.cos(ang + 0.42), b[1] - l * Math.sin(ang + 0.42));
        ctx.stroke();
      }
    } else if (it.shape === 'ellipse') {
      const a = pts[0], b = pts[pts.length - 1];
      ctx.beginPath();
      ctx.ellipse((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.abs(b[0] - a[0]) / 2, Math.abs(b[1] - a[1]) / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (it.shape === 'rect') {
      const a = pts[0], b = pts[pts.length - 1];
      ctx.beginPath();
      ctx.rect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---------- 便签 DOM ----------
  function syncNotes() {
    const seen = new Set();
    for (const it of S.items) {
      if (it.type !== 'note') continue;
      seen.add(it.id);
      let el = noteEls.get(it.id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'note-item';
        el.dataset.id = it.id;
        el.innerHTML = '<div class="note-box" contenteditable="false"></div>';
        notesLayer.appendChild(el);
        noteEls.set(it.id, el);
      }
      const box = el.firstChild;
      const editing = S.editingNote === it.id;
      el.classList.toggle('editing', editing);
      el.classList.toggle('style-compact', it.style === 'compact');
      el.style.zIndex = String(S.items.indexOf(it) + 1);
      el.style.setProperty('--note-color', it.color || '#e8e8e8');
      el.style.setProperty('--note-bg', it.bg || 'rgba(52,52,52,0.92)');
      el.style.opacity = String(it.opacity == null ? 1 : it.opacity);
      el.style.width = it.w + 'px';
      el.style.height = it.h + 'px';
      const cx = P.worldToScreen(it.x + it.w / 2, it.y + it.h / 2);
      el.style.transform = `translate(${cx[0]}px, ${cx[1]}px) rotate(${it.rot || 0}deg) scale(${S.cam.z}) translate(${-it.w / 2}px, ${-it.h / 2}px)`;
      el.style.display = it.hidden ? 'none' : '';
      if (!editing && box.innerHTML !== (it.html || '')) box.innerHTML = it.html || '';
      if (!it.html) box.setAttribute('data-placeholder', '双击编辑便签');
      else box.removeAttribute('data-placeholder');
      if (editing) {
        box.contentEditable = 'true';
        if (!el.dataset.focused) {
          el.dataset.focused = '1';
          requestAnimationFrame(() => {
            box.focus();
            if (P.settings.selectAllTextOnEdit) {
              const r = document.createRange(); r.selectNodeContents(box);
              const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
            }
          });
        }
      } else {
        box.contentEditable = 'false';
        delete el.dataset.focused;
      }
    }
    for (const [id, el] of noteEls) {
      if (!seen.has(id)) { el.remove(); noteEls.delete(id); }
    }
  }
  P.getNoteEl = (id) => noteEls.get(id);

  // 自动便签高度
  P.autoSizeNote = function (it) {
    const el = noteEls.get(it.id);
    if (!el) return;
    const box = el.firstChild;
    const minH = 40;
    const h = Math.max(minH, box.scrollHeight);
    if (Math.abs(h - it.h) > 1) { it.h = h; P.requestRender(); }
  };

  // ---------- 覆盖层 ----------
  function renderOverlay() {
    const ctx = octx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const sel = P.selectedItems();
    const acc = P.settings.colors.selection || '#2e84aa';

    // 对齐参考线
    if (S.guidesX.length || S.guidesY.length) {
      ctx.save();
      ctx.strokeStyle = acc;
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      for (const gx of S.guidesX) {
        const sx = P.worldToScreen(gx, 0)[0];
        ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, H); ctx.stroke();
      }
      for (const gy of S.guidesY) {
        const sy = P.worldToScreen(0, gy)[1];
        ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(W, sy); ctx.stroke();
      }
      ctx.restore();
    }

    // 选中框
    for (const it of sel) {
      const corners = P.itemCorners(it).map((p) => P.worldToScreen(p[0], p[1]));
      ctx.save();
      ctx.strokeStyle = acc;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      corners.forEach((p, i) => { if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); });
      ctx.closePath(); ctx.stroke();
      // 边框
      ctx.restore();
    }
    if (sel.length > 1) {
      const b = P.bbox(sel);
      const p1 = P.worldToScreen(b.x, b.y), p2 = P.worldToScreen(b.x + b.w, b.y + b.h);
      ctx.save(); ctx.strokeStyle = acc; ctx.globalAlpha = 0.6; ctx.setLineDash([5, 4]); ctx.lineWidth = 1;
      ctx.strokeRect(p1[0], p1[1], p2[0] - p1[0], p2[1] - p1[1]);
      ctx.restore();
    }

    // 手柄（单选）
    if (sel.length === 1 && !S.scene.locked && sel[0].type !== 'group') {
      drawHandles(ctx, sel[0], acc);
    }

    // 框选
    if (S.marquee) {
      const m = S.marquee;
      const p1 = P.worldToScreen(m.x1, m.y1), p2 = P.worldToScreen(m.x2, m.y2);
      ctx.save();
      ctx.fillStyle = 'rgba(46,132,170,0.12)';
      ctx.strokeStyle = acc;
      ctx.lineWidth = 1;
      ctx.fillRect(p1[0], p1[1], p2[0] - p1[0], p2[1] - p1[1]);
      ctx.strokeRect(p1[0], p1[1], p2[0] - p1[0], p2[1] - p1[1]);
      ctx.restore();
    }

    // 绘制预览
    if (S.drag && S.drag.mode === 'draw' && S.drag.points && S.drag.points.length > 1) {
      const d = S.drag;
      ctx.save();
      ctx.strokeStyle = S.pen.color;
      ctx.lineWidth = S.pen.width * S.cam.z;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (S.pen.style === 'dotted') ctx.setLineDash([S.pen.width * 1.6 * S.cam.z, S.pen.width * 2.2 * S.cam.z]);
      ctx.beginPath();
      const pts = d.points;
      if (d.tool === 'pen') {
        pts.forEach((p, i) => { const s = P.worldToScreen(p[0], p[1]); if (i === 0) ctx.moveTo(s[0], s[1]); else ctx.lineTo(s[0], s[1]); });
      } else {
        const a = P.worldToScreen(pts[0][0], pts[0][1]), b = P.worldToScreen(pts[pts.length - 1][0], pts[pts.length - 1][1]);
        if (d.tool === 'line') { ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
        if (d.tool === 'rect') ctx.rect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
        if (d.tool === 'ellipse') {
          ctx.ellipse((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.abs(b[0] - a[0]) / 2, Math.abs(b[1] - a[1]) / 2, 0, 0, Math.PI * 2);
        }
      }
      ctx.stroke();
      ctx.restore();
    }

    // 裁剪 UI
    if (S.crop) drawCrop(ctx);
  }

  function drawHandles(ctx, it, acc) {
    const corners = P.itemCorners(it).map((p) => P.worldToScreen(p[0], p[1]));
    const hs = Math.max(6, P.settings.handleSize || 10);
    ctx.save();
    ctx.fillStyle = '#101010';
    ctx.strokeStyle = acc;
    ctx.lineWidth = 1.5;
    for (const p of corners) {
      ctx.beginPath();
      ctx.rect(p[0] - hs / 2, p[1] - hs / 2, hs, hs);
      ctx.fill(); ctx.stroke();
    }
    // 旋转手柄
    if (P.settings.gizmoVisibility !== 'scale') {
      const cx = corners.reduce((s, p) => s + p[0], 0) / 4;
      const topMid = [(corners[0][0] + corners[1][0]) / 2, (corners[0][1] + corners[1][1]) / 2];
      const dx = topMid[0] - cx, dy = topMid[1] - cy();
      function cy() { return corners.reduce((s, p) => s + p[1], 0) / 4; }
      const len = Math.hypot(topMid[0] - cx, topMid[1] - cy());
      const ux = (topMid[0] - cx) / (len || 1), uy = (topMid[1] - cy()) / (len || 1);
      const rp = [topMid[0] + ux * 26, topMid[1] + uy * 26];
      ctx.beginPath(); ctx.moveTo(topMid[0], topMid[1]); ctx.lineTo(rp[0], rp[1]); ctx.stroke();
      ctx.beginPath(); ctx.arc(rp[0], rp[1], hs * 0.55, 0, Math.PI * 2);
      ctx.fillStyle = acc; ctx.fill();
      it._rotateHandle = rp;
    }
    ctx.restore();
  }
  P.handlePoints = function (it) {
    const corners = P.itemCorners(it).map((p) => P.worldToScreen(p[0], p[1]));
    const extra = [];
    const cx = corners.reduce((s, p) => s + p[0], 0) / 4;
    const cyy = corners.reduce((s, p) => s + p[1], 0) / 4;
    const topMid = [(corners[0][0] + corners[1][0]) / 2, (corners[0][1] + corners[1][1]) / 2];
    const len = Math.hypot(topMid[0] - cx, topMid[1] - cyy) || 1;
    extra.push([topMid[0] + (topMid[0] - cx) / len * 26, topMid[1] + (topMid[1] - cyy) / len * 26]);
    return { corners, rotate: extra[0] };
  };

  // 裁剪
  function drawCrop(ctx) {
    const c = S.crop;
    const it = P.itemById(c.itemId);
    if (!it) return;
    // 世界坐标中的裁剪框（相对 item 未旋转矩形的显示）
    const r = P.cropRectWorld(it);
    const p1 = P.worldToScreen(r.x, r.y), p2 = P.worldToScreen(r.x + r.w, r.y + r.h);
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    // 遮罩
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.rect(p1[0], p1[1], p2[0] - p1[0], p2[1] - p1[1]);
    ctx.fill('evenodd');
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(p1[0], p1[1], p2[0] - p1[0], p2[1] - p1[1]);
    const hs = Math.max(7, P.settings.handleSize || 10);
    ctx.fillStyle = '#101010'; ctx.strokeStyle = '#fff';
    for (const p of [[p1[0], p1[1]], [p2[0], p1[1]], [p2[0], p2[1]], [p1[0], p2[1]]]) {
      ctx.beginPath(); ctx.rect(p[0] - hs / 2, p[1] - hs / 2, hs, hs); ctx.fill(); ctx.stroke();
    }
    // 三分线
    ctx.globalAlpha = 0.4;
    for (let i = 1; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(p1[0] + (p2[0] - p1[0]) * i / 3, p1[1]);
      ctx.lineTo(p1[0] + (p2[0] - p1[0]) * i / 3, p2[1]);
      ctx.moveTo(p1[0], p1[1] + (p2[1] - p1[1]) * i / 3);
      ctx.lineTo(p2[0], p1[1] + (p2[1] - p1[1]) * i / 3);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 计算 item 的裁剪显示矩形（世界坐标，未考虑旋转）
  P.cropRectWorld = function (it) {
    const r = S.crop && S.crop.itemId === it.id ? S.crop.rect : null;
    if (r) return r;
    return { x: it.x, y: it.y, w: it.w, h: it.h };
  };

  // ---------- 画布提示 ----------
  P.showHint = function (text, sx, sy) {
    const el = document.getElementById('hint');
    if (!text) { el.classList.add('hidden'); return; }
    el.textContent = text;
    el.style.left = (sx + 14) + 'px';
    el.style.top = (sy + 16) + 'px';
    el.classList.remove('hidden');
  };
})();
