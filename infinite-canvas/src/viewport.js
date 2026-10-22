/* ============================================================================
 * viewport.js — infinite pan/zoom surface.
 *
 * Interaction model recovered from the RunningHub canvas bundle:
 *   • React Flow zoom-on-scroll / pinch / double-click are disabled; the app
 *     replaces them with a custom wheel controller:
 *       – trackpad two-finger scroll  → pan
 *       – ctrl/meta/alt + wheel       → zoom at pointer (pinch becomes this)
 *       – wheel with no modifier      → pan  (`panOnScroll: false` + custom)
 *       – shift + vertical wheel      → horizontal pan
 *   • zoom clamps 0.07 … 3 (minZoom = 0.07, maxZoom = 3)
 *   • the viewport transform is written straight to the DOM node
 *     (`translate(x,y) scale(k)`) instead of going through React state.
 * ========================================================================= */

const MIN_ZOOM = 0.07;
const MAX_ZOOM = 3;
const TRACKPAD_PAN_WINDOW = 80; // ms — recovered constant `xet = 80`
const ZOOM_TRACKPAD = 0.0065; // recovered constant `wEr`
const ZOOM_WHEEL = 0.0008; // recovered constant `CEr`
const BASE_GRID = 20; // recovered snapGrid [20, 20]

const clampZoom = (z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

function distribute(deltaX, deltaY, shiftKey) {
  // shift + vertical wheel becomes horizontal pan
  if (shiftKey && deltaX === 0 && deltaY !== 0) return { x: deltaY, y: 0 };
  return { x: deltaX, y: deltaY };
}

function normalizeWheel(e, size) {
  let x = e.deltaX ?? 0;
  let y = e.deltaY ?? 0;
  if (e.deltaMode === 1) {
    x *= 16;
    y *= 16;
  } else if (e.deltaMode === 2) {
    x *= size.width;
    y *= size.height;
  }
  const d = distribute(x, y, e.shiftKey);
  return { x: d.x, y: d.y };
}

/** Trackpad heuristics ported from the bundle (VIr + wet + HIr). */
function wheelIsInverted(wd, delta) {
  if (typeof wd !== 'number' || !Number.isFinite(wd) || delta === 0) return false;
  return Math.abs(wd + delta * 3) <= 1;
}

function wheelIsDetented(wd) {
  if (typeof wd !== 'number' || !Number.isFinite(wd) || wd === 0) return false;
  return Math.abs(wd) % 120 === 0;
}

function looksLikeTrackpad(e) {
  if (e.deltaMode !== 0) return false;
  const dx = e.deltaX || 0;
  const dy = e.deltaY || 0;
  if (dx === 0 && dy === 0) return false;
  // diagonal or fractional deltas are trackpad gestures
  if ((dx !== 0 && dy !== 0) || !Number.isInteger(dx) || !Number.isInteger(dy)) return true;
  const dominant = dx !== 0 ? dx : dy;
  const wd = dx !== 0 ? e.wheelDeltaX : e.wheelDeltaY;
  // synchronized wheelDelta ⇒ trackpad (or high-res scrolling)
  if (wheelIsInverted(wd, dominant)) return true;
  if (typeof wd === 'number' && Number.isFinite(wd) && wd !== 0 && !wheelIsDetented(wd)) return true;
  if (wheelIsDetented(wd)) return false;
  if (e.webkitDirectionInvertedFromDevice) return true;
  const magnitude = Math.max(Math.abs(dx), Math.abs(dy));
  return magnitude > 0 && magnitude < 50;
}

function hasZoomModifier(e) {
  return e.ctrlKey || e.metaKey || !!e.altKey;
}

/** Ctrl+wheel coming from an *actual* wheel (not pinch) is horizontal on some drivers. */
function isHorizontalPinchArtifact(e) {
  return (
    e.ctrlKey &&
    !e.metaKey &&
    !e.altKey &&
    Math.abs(e.deltaX) > Math.abs(e.deltaY) &&
    Math.abs(e.deltaY) <= 1
  );
}

export class Viewport {
  constructor({ host, viewportEl, dotsEl, store, onChange }) {
    this.host = host;
    this.el = viewportEl;
    this.dotsEl = dotsEl;
    this.store = store;
    this.onChange = onChange || (() => {});
    this.v = { x: 0, y: 0, zoom: 1 };
    this.size = { width: host.clientWidth || 1200, height: host.clientHeight || 800 };
    this.trackpadPanUntil = 0;
    this._anim = null;
    this._raf = 0;
    this._ro = new ResizeObserver((entries) => {
      const box = entries[0].contentRect;
      this.size = { width: box.width, height: box.height };
      this.apply();
    });
    this._ro.observe(host);
    this.apply();
  }

  /* ── coordinate helpers ───────────────────────────────────────────── */

  rect() {
    return this.host.getBoundingClientRect();
  }

  /** client (page) coordinates → flow coordinates */
  screenToFlow(clientX, clientY) {
    const r = this.rect();
    return {
      x: (clientX - r.left - this.v.x) / this.v.zoom,
      y: (clientY - r.top - this.v.y) / this.v.zoom,
    };
  }

  /** host-local coordinates → flow coordinates */
  localToFlow(x, y) {
    return { x: (x - this.v.x) / this.v.zoom, y: (y - this.v.y) / this.v.zoom };
  }

  /** flow coordinates → host-local coordinates */
  flowToLocal(x, y) {
    return { x: x * this.v.zoom + this.v.x, y: y * this.v.zoom + this.v.y };
  }

  centerFlow() {
    return this.localToFlow(this.size.width / 2, this.size.height / 2);
  }

  /* ── state ───────────────────────────────────────────────────────── */

  get zoom() {
    return this.v.zoom;
  }

  set(v, { silent = false } = {}) {
    this.v = { x: v.x, y: v.y, zoom: clampZoom(v.zoom) };
    this.apply({ silent });
  }

  apply({ silent = false } = {}) {
    const { x, y, zoom } = this.v;
    this.el.style.transform = `translate3d(${x.toFixed(3)}px, ${y.toFixed(3)}px, 0) scale(${zoom.toFixed(5)})`;
    this.el.style.setProperty('--inv-zoom', (1 / zoom).toFixed(5));
    this.el.style.setProperty('--zoom', zoom.toFixed(5));

    // dot grid follows the viewport, exactly like the React Flow <Background />
    const gap = BASE_GRID * zoom;
    if (this.dotsEl) {
      this.dotsEl.style.setProperty('--dot-gap', `${gap}px`);
      const ox = ((x % gap) + gap) % gap;
      const oy = ((y % gap) + gap) % gap;
      this.dotsEl.style.setProperty('--dot-x', `${ox}px`);
      this.dotsEl.style.setProperty('--dot-y', `${oy}px`);
    }
    this.store.setViewport(this.v, { silent: true });
    if (!this._raf) {
      this._raf = requestAnimationFrame(() => {
        this._raf = 0;
        this.onChange(this.v);
      });
    }
    if (!silent) this.store.emit('viewport-live', this.v);
  }

  /* ── gestures ────────────────────────────────────────────────────── */

  panBy(dx, dy) {
    this.set({ x: this.v.x + dx, y: this.v.y + dy, zoom: this.v.zoom });
  }

  /** zoom keeping the given host-local anchor stationary */
  zoomAt(localX, localY, nextZoom) {
    const z = clampZoom(nextZoom);
    if (z === this.v.zoom) return;
    const k = z / this.v.zoom;
    this.set({
      x: localX - (localX - this.v.x) * k,
      y: localY - (localY - this.v.y) * k,
      zoom: z,
    });
  }

  /** percentage-driven zoom around the viewport centre */
  zoomTo(nextZoom, anchor) {
    const target = anchor || { x: this.size.width / 2, y: this.size.height / 2 };
    this.zoomAt(target.x, target.y, nextZoom);
  }

  zoomStep(direction) {
    this.zoomTo(this.v.zoom * (direction > 0 ? 1.25 : 0.8));
  }

  zoomByPercent(delta) {
    this.zoomTo(this.v.zoom + delta);
  }

  handleWheel(e) {
    const now = performance.now();
    const { x: dx, y: dy } = normalizeWheel(e, this.size);
    const trackpad = looksLikeTrackpad(e);
    const zoomMod = hasZoomModifier(e);
    const horizontalDominant = Math.abs(dx) > Math.abs(dy);
    const pinchArtifact = isHorizontalPinchArtifact(e);

    let mode;
    const comfy = this.store?.state?.settings?.interactionMode === 'comfyui';
    if (horizontalDominant && (!zoomMod || pinchArtifact)) {
      mode = trackpad || this.trackpadPanUntil > now || pinchArtifact ? 'pan' : 'pan';
      if (mode === 'pan' && (trackpad || pinchArtifact)) this.trackpadPanUntil = now + TRACKPAD_PAN_WINDOW;
    } else if (zoomMod) {
      mode = 'zoom';
    } else if (trackpad || this.trackpadPanUntil > now) {
      mode = 'pan';
      this.trackpadPanUntil = now + TRACKPAD_PAN_WINDOW;
    } else {
      // ComfyUI interaction mode zooms on plain wheel (recovered `isComfyuiMode ? zoom : pan`)
      mode = comfy ? 'zoom' : 'pan';
    }

    if (mode === 'zoom') {
      const r = this.rect();
      const lx = e.clientX - r.left;
      const ly = e.clientY - r.top;
      const factor = trackpad ? ZOOM_TRACKPAD : ZOOM_WHEEL;
      // exponential keeps zoom feel linear in log space
      const next = this.v.zoom * Math.exp(-dy * factor * (trackpad ? 1 : 1));
      this.zoomAt(lx, ly, next);
      this.emitZoomIntent();
      return;
    }

    // pan (do not fight the page or nested scroll areas)
    const scale = e.deltaMode === 0 ? 1 : 16;
    this.panBy(-dx * scale, -dy * scale);
    this.emitZoomIntent();
  }

  emitZoomIntent() {
    // placeholder for future discrete wheel zoom in comfy-style mode
  }

  /* ── fit / reset / animation ─────────────────────────────────────── */

  fitView({ padding = 72, maxZoom = 1.15, nodes } = {}) {
    const list = nodes || this.store.nodes.filter((n) => n.type !== 'group');
    if (!list.length) {
      this.animateTo({ x: this.size.width / 2, y: this.size.height / 2, zoom: 1 });
      return;
    }
    let x1 = Infinity,
      y1 = Infinity,
      x2 = -Infinity,
      y2 = -Infinity;
    for (const n of list) {
      const w = n.w || 260;
      const h = n.h || 200;
      x1 = Math.min(x1, n.x);
      y1 = Math.min(y1, n.y);
      x2 = Math.max(x2, n.x + w);
      y2 = Math.max(y2, n.y + h);
    }
    const bw = Math.max(1, x2 - x1);
    const bh = Math.max(1, y2 - y1);
    const zoom = clampZoom(Math.min(maxZoom, (this.size.width - padding * 2) / bw, (this.size.height - padding * 2) / bh));
    const x = this.size.width / 2 - ((x1 + x2) / 2) * zoom;
    const y = this.size.height / 2 - ((y1 + y2) / 2) * zoom;
    this.animateTo({ x, y, zoom });
  }

  resetZoom() {
    const c = this.centerFlow();
    const zoom = 1;
    this.animateTo({
      x: this.size.width / 2 - c.x * zoom,
      y: this.size.height / 2 - c.y * zoom,
      zoom,
    });
  }

  animateTo(target, duration = 260) {
    if (this._anim) cancelAnimationFrame(this._anim.raf);
    const from = { ...this.v };
    const to = { x: target.x, y: target.y, zoom: clampZoom(target.zoom) };
    const start = performance.now();
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const k = ease(t);
      this.set({
        x: from.x + (to.x - from.x) * k,
        y: from.y + (to.y - from.y) * k,
        zoom: from.zoom + (to.zoom - from.zoom) * k,
      });
      if (t < 1) this._anim = { raf: requestAnimationFrame(step) };
      else this._anim = null;
    };
    if (this._anim) cancelAnimationFrame(this._anim.raf);
    this._anim = { raf: requestAnimationFrame(step) };
  }

  /** centre the view on a node without changing zoom */
  focusNode(node, { zoom } = {}) {
    const z = clampZoom(zoom || Math.max(this.v.zoom, 0.9));
    this.animateTo({
      x: this.size.width / 2 - (node.x + (node.w || 260) / 2) * z,
      y: this.size.height / 2 - (node.y + (node.h || 200) / 2) * z,
      zoom: z,
    });
  }

  /** nearest zoom level from a discrete ladder (zoom pill menu) */
  static get MIN_ZOOM() {
    return MIN_ZOOM;
  }

  static get MAX_ZOOM() {
    return MAX_ZOOM;
  }
}

export { MIN_ZOOM, MAX_ZOOM, BASE_GRID };
