/* ============================================================================
 * canvas.js — node/edge rendering + direct-manipulation interactions.
 *
 * Behaviour recovered from the RunningHub canvas bundle:
 *   • custom edge = cubic bezier with curvature 0.25 (all edge types map to it)
 *   • hovering an edge for 500 ms shows a scissors button that deletes the edge
 *   • edges enter "flowing" (dashed + animated) mode while the target node runs
 *   • connection line snaps to the nearest compatible node under the pointer
 *     (8px padding, smallest node wins, groups/comments excluded)
 *   • connectionMode "Loose", snap grid 20px, delete key handled by the app
 *   • dropping a connection on empty canvas opens the node selector instead of
 *     creating a dangling edge
 * ========================================================================= */

import {
  ANNOTATION_COLORS,
  ICONS,
  NODE_TYPES,
  GRID,
  GROUP_COLORS,
  addAnnotation,
  removeAnnotation,
  updateAnnotation,
  createEdge,
  createNode,
  filterCSS,
  nodeBounds,
  nodeMainMedia,
  nodeSize,
  nodeTitle,
  pushNodeHistory,
  enqueueJob,
  nodeParams,
  selectionBounds,
  setCollapsed,
  store,
  uid,
  updateJob,
} from './store.js';
import { Viewport } from './viewport.js';
import { api } from './api.js';
import { generatedImage } from './placeholder.js';

const EDGE_HOVER_DELAY = 500; // recovered `ojo = 500`
const EDGE_HIDE_DELAY = 400; // recovered `ajo = 400`
const SNAP_PADDING = 8; // recovered hit-test padding
const LABEL_OFFSET = 30; // card label row above the card (22px + 8px gap)

/** maps a node type to the recovered LOD chip colour family */
function chipCategory(type) {
  if (type === 'image' || type === 'image-gen') return 'image';
  if (type === 'video' || type === 'video-gen') return 'video';
  if (type === 'audio') return 'audio';
  if (type === 'text' || type === 'script' || type === 'llm' || type === 'stack') return 'text';
  if (type === 'rh-ai' || type === '3d' || type === 'director') return 'ai';
  return 'generic';
}
const NODE_SELECTOR_EXCLUDE = new Set(['group', 'comment']);

const icon = (name) => `<svg viewBox="0 0 24 24" data-icon="${name}">${ICONS[name] || ICONS.text}</svg>`;
const hash = (str) => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
};

const STATUS_TEXT = {
  idle: '待生成',
  queued: '排队中',
  running: '生成中',
  success: '已完成',
  error: '失败',
};

function mediaFallbackSVG(accent, kind) {
  const glyph = kind === 'video' ? ICONS.video : kind === 'audio' ? ICONS.audio : ICONS.image;
  return `<div class="media-fallback"><svg viewBox="0 0 24 24" style="stroke:${accent}">${glyph}</svg></div>`;
}

function waveform(id) {
  const bars = [];
  const seed = hash(id);
  for (let i = 0; i < 34; i++) {
    const v = 12 + Math.abs(Math.sin(i * 0.7 + seed * 10)) * 30 + (i % 5 === 0 ? 8 : 0);
    bars.push(`<i style="height:${Math.min(42, v).toFixed(0)}px"></i>`);
  }
  return bars.join('');
}

/* ───────────────────────────── node card body ───────────────────────────── */

function statusPill(node) {
  const t = NODE_TYPES[node.type] || NODE_TYPES.text;
  const status = node.data?.status || 'idle';
  if (!['image', 'video', 'audio', 'app', 'preview', 'stack'].includes(t.kind)) return '';
  return `<span class="node__status" data-status="${status}">${STATUS_TEXT[status] || status}</span>`;
}

function runButton(node) {
  const t = NODE_TYPES[node.type] || NODE_TYPES.text;
  if (!['image-gen', 'video-gen', 'llm', 'rh-ai', 'preview-output'].includes(node.type)) return '';
  const running = node.data?.status === 'running';
  return `<button class="node__run" data-act="run" ${running ? 'disabled' : ''}>${icon('play')}生成</button>`;
}

function editsSVG(node) {
  const edits = node.data?.edits;
  if (!Array.isArray(edits) || !edits.length) return '';
  const shapes = edits
    .map((sh) => {
      if (sh.type === 'rect') {
        return `<rect x="${sh.x}" y="${sh.y}" width="${sh.w}" height="${sh.h}" fill="none" stroke="${sh.color}" stroke-width="3"/>`;
      }
      if (sh.type === 'arrow') {
        const angle = Math.atan2(sh.y2 - sh.y1, sh.x2 - sh.x1);
        const head = 34;
        const spread = 0.42;
        const p1 = [sh.x2 - Math.cos(angle - spread) * head, sh.y2 - Math.sin(angle - spread) * head];
        const p2 = [sh.x2 - Math.cos(angle + spread) * head, sh.y2 - Math.sin(angle + spread) * head];
        return `<line x1="${sh.x1}" y1="${sh.y1}" x2="${sh.x2}" y2="${sh.y2}" stroke="${sh.color}" stroke-width="4"/>
          <path d="M ${sh.x2} ${sh.y2} L ${p1[0].toFixed(1)} ${p1[1].toFixed(1)} L ${p2[0].toFixed(1)} ${p2[1].toFixed(1)} Z" fill="${sh.color}"/>`;
      }
      if (sh.type === 'brush') {
        return `<polyline points="${sh.points.map((p) => p.join(',')).join(' ')}" fill="none" stroke="${sh.color}" stroke-width="5" stroke-linecap="round"/>`;
      }
      if (sh.type === 'text') {
        return `<text x="${sh.x}" y="${sh.y}" fill="${sh.color}" font-size="34">${escapeHTML(sh.text || '')}</text>`;
      }
      if (sh.type === 'marker') {
        return `<circle cx="${sh.x}" cy="${sh.y}" r="22" fill="${sh.color}" opacity="0.6"/>`;
      }
      return '';
    })
    .join('');
  return `<svg class="node__edits" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">${shapes}</svg>`;
}

function mediaHTML(node, t) {
  const media = nodeMainMedia(node);
  const poster = node.data?.poster || '';
  const videoKind = node.type.includes('video') || t.kind === 'video';
  const filter = filterCSS(node);
  const style = filter ? ` style="filter:${filter}"` : '';
  if (videoKind) {
    if (poster) {
      return `<img src="${poster}" alt="" draggable="false"${style} /><span class="node__play"><svg viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z"/></svg></span>`;
    }
    if (!media) return mediaFallbackSVG(t.accent, t.kind);
    return `<video src="${media}" muted loop playsinline${style}></video><span class="node__play"><svg viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z"/></svg></span>`;
  }
  if (!media) return mediaFallbackSVG(t.accent, t.kind);
  return `<img src="${media}" alt="" draggable="false"${style} />`;
}

function chipHTML(node, t) {
  const d = node.data || {};
  const videoKind = t.kind === 'video';
  const mainMedia = nodeMainMedia(node);
  const media = mainMedia
    ? videoKind
      ? ''
      : `<img class="node__chip-media" src="${mainMedia}" alt="" draggable="false" />`
    : '';
  const typeLabel = t.name || t.badge || node.type;
  return `
    <div class="node__chip"${media ? ' data-has-media="1"' : ''}>
      ${media}
      <span class="node__chip-label">${escapeHTML(nodeTitle(node))}</span>
      <span class="node__chip-badge">${escapeHTML(typeLabel)}</span>
      ${d.status === 'running' ? '<span class="node__chip-spinner">…</span>' : ''}
    </div>`;
}

function bodyHTML(node) {
  const t = NODE_TYPES[node.type] || NODE_TYPES.text;
  const d = node.data || {};
  if (d.collapsed && node.type !== 'group') return chipHTML(node, t);
  const media = mediaHTML(node, t);
  const meta = `<div class="node__meta">${statusPill(node)}${runButton(node)}</div>`;

  switch (t.kind) {
    case 'image':
      return `
        <div class="node__media">${media}${editsSVG(node)}${d.duration ? `<span class="node__media-tag">${d.duration}</span>` : ''}</div>
        <div class="node__body">
          <div class="node__prompt">${escapeHTML(d.prompt || '')}</div>
          ${meta}
        </div>`;
    case 'video':
      return `
        <div class="node__media">${media}${editsSVG(node)}<span class="node__media-tag">${d.duration || '5s'} · 24fps</span></div>
        <div class="node__body">
          <div class="node__prompt">${escapeHTML(d.prompt || '')}</div>
          ${meta}
        </div>`;
    case 'audio':
      return `
        <div class="node__body" style="flex:1 1 auto;justify-content:center">
          <div class="node__audio">${waveform(node.id)}</div>
          ${meta}
        </div>`;
    case 'text':
    case 'script':
      return `<div class="node__text" contenteditable="true" data-field="text" spellcheck="false">${escapeHTML(d.text || '')}</div>`;
    case 'app':
      return `
        <div class="node__body" style="flex:1 1 auto;justify-content:flex-start;padding-top:14px">
          <div class="node__chip-row">
            <span class="node__chip">${escapeHTML(d.model || 'model')}</span>
            <span class="node__chip">${escapeHTML(t.badge)}</span>
          </div>
          <div class="node__prompt">${escapeHTML(d.prompt || '')}</div>
          ${meta}
        </div>`;
    case 'stack':
      return `
        <div class="node__body" style="flex:1 1 auto">
          <div class="node__chip-row">
            <span class="node__chip">${d.items || 3} 个素材</span>
            <span class="node__chip">叠放顺序</span>
          </div>
          <div class="node__prompt">${escapeHTML(d.prompt || '按顺序合成素材栈，输出单条流。')}</div>
          ${meta}
        </div>`;
    case 'preview':
      return `
        <div class="node__media">${media}${editsSVG(node)}</div>
        <div class="node__body">
          <div class="node__meta"><span>最终成片</span><span>1080p</span>${runButton(node)}</div>
        </div>`;
    case 'comment':
      return `<div class="node__text" contenteditable="true" data-field="text" spellcheck="false">${escapeHTML(d.text || '')}</div>`;
    case 'group':
      return '';
    default:
      return `<div class="node__body"><div class="node__prompt">${escapeHTML(d.prompt || '')}</div>${meta}</div>`;
  }
}

function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/* ───────────────────────────── edge geometry ───────────────────────────── */

/** React Flow `getBezierPath` with the recovered curvature 0.25.
 *  Handles are Left/Right, so the control offset is a horizontal-only
 *  half-distance (or a sqrt fallback when the target is behind the source). */
export function bezierPath(sx, sy, tx, ty, curvature = 0.25) {
  const dx = tx - sx;
  const off = dx >= 0 ? 0.5 * dx : curvature * 25 * Math.sqrt(-dx);
  return `M ${sx} ${sy} C ${sx + off} ${sy}, ${tx - off} ${ty}, ${tx} ${ty}`;
}

/* ───────────────────────────── canvas controller ───────────────────────────── */

export class Canvas {
  constructor(host) {
    this.host = host;
    this.nodeLayer = host.querySelector('#nodeLayer');
    this.edgeLayer = host.querySelector('#edgeLayer');
    this.edgeGroup = host.querySelector('#edgeGroup');
    this.pendingPath = host.querySelector('#edgePending');
    this.guidesGroup = host.querySelector('#guidesGroup');
    this.selectionBox = host.querySelector('#selectionBox');
    this.minimapCanvas = host.querySelector('#minimapCanvas');
    this.gridCanvas = host.querySelector('#gridCanvas');
    this.viewportEl = host.querySelector('#viewport');
    this.dotsEl = host.querySelector('#canvasDots');

    this.vp = new Viewport({
      host,
      viewportEl: this.viewportEl,
      dotsEl: this.dotsEl,
      store,
      onChange: () => this.onViewportChange(),
    });

    this.nodeEls = new Map();
    this.edgeEls = new Map();
    this.dims = new Map();
    this.spaceDown = false;
    this.interaction = null;
    this.hoverEdge = null;
    this.scissorsEl = null;
    this.edgeTimer = null;
    this.edgeHideTimer = null;
    this.toolbar = null;
    this._panRAF = 0;

    this.bind();
    store.on('change', () => this.sync());
    store.on('annotations', () => this.renderAnnotations());
    store.on('selection', () => {
      this.syncSelection();
      this.syncNodeToolbar();
    });
    store.on('viewport-live', () => this.syncNodeToolbar());
    store.on('loaded', () => {
      this.sync();
      this.vp.set(store.state.viewport);
    });
    store.on('settings', () => {
      this.drawGrid();
      this.syncEdges();
    });

    this.sync();
    this.syncNodeToolbar();
    if (store.state.viewport) this.vp.set(store.state.viewport);
  }

  /* ── ports & bounds ─────────────────────────────────────────────── */

  dimsOf(node) {
    const cached = this.dims.get(node.id);
    if (cached) return cached;
    const { w, h } = nodeSize(node);
    return { w, h };
  }

  portPos(node, side) {
    const t = NODE_TYPES[node.type] || NODE_TYPES.text;
    const w = node.w || t.size.w;
    const h = node.h || t.size.h;
    const y = node.y + LABEL_OFFSET + h / 2;
    return { x: side === 'in' ? node.x : node.x + w, y };
  }

  allNodes() {
    return store.nodes;
  }

  /* ── rendering ─────────────────────────────────────────────────── */

  sync() {
    this.syncNodes();
    this.syncEdges();
    this.syncSelection();
    this.syncNodeToolbar();
    this.measure();
    this.renderAnnotations();
    this.drawMinimap();
    store.emit('canvas-sync');
  }

  /* ── annotation layer：创建 + 选中/二次编辑（箭头端点、文字字号） ── */

  annotationEls() {
    return this.host.querySelectorAll('#annotationsGroup [data-ann-id]');
  }

  renderAnnotations() {
    const g = this.host.querySelector('#annotationsGroup');
    if (!g) return;
    const svgNS = 'http://www.w3.org/2000/svg';
    const selectedId = this.selectedAnnotationId;
    g.innerHTML = '';
    for (const a of store.state.annotations || []) {
      const isSel = a.id === selectedId;
      if (a.type === 'arrow') {
        const color = a.color || ANNOTATION_COLORS[0];
        const width = a.width || 2;
        const line = document.createElementNS(svgNS, 'line');
        line.setAttribute('x1', a.x1);
        line.setAttribute('y1', a.y1);
        line.setAttribute('x2', a.x2);
        line.setAttribute('y2', a.y2);
        line.setAttribute('stroke', color);
        line.setAttribute('stroke-width', isSel ? width + 1 : width);
        line.setAttribute('stroke-linecap', 'round');
        line.setAttribute('class', 'annotation-arrow');
        line.setAttribute('data-ann-id', a.id);
        line.setAttribute('data-ann-type', 'arrow');
        g.appendChild(line);
        const angle = Math.atan2(a.y2 - a.y1, a.x2 - a.x1);
        const head = 10 + width * 2;
        const spread = 0.42;
        const p1 = [a.x2 - Math.cos(angle - spread) * head, a.y2 - Math.sin(angle - spread) * head];
        const p2 = [a.x2 - Math.cos(angle + spread) * head, a.y2 - Math.sin(angle + spread) * head];
        const tri = document.createElementNS(svgNS, 'path');
        tri.setAttribute('d', `M ${a.x2} ${a.y2} L ${p1[0].toFixed(1)} ${p1[1].toFixed(1)} L ${p2[0].toFixed(1)} ${p2[1].toFixed(1)} Z`);
        tri.setAttribute('fill', color);
        tri.setAttribute('class', 'annotation-arrow');
        tri.setAttribute('data-ann-id', a.id);
        tri.setAttribute('data-ann-type', 'arrow');
        g.appendChild(tri);
        if (isSel) {
          const r = 5 / this.vp.zoom;
          for (const [cx, cy, name] of [
            [a.x1, a.y1, 'tail'],
            [a.x2, a.y2, 'head'],
          ]) {
            const handle = document.createElementNS(svgNS, 'circle');
            handle.setAttribute('cx', cx);
            handle.setAttribute('cy', cy);
            handle.setAttribute('r', r);
            handle.setAttribute('class', 'annotation-handle');
            handle.setAttribute('data-ann-handle', name);
            g.appendChild(handle);
          }
        }
      } else if (a.type === 'text') {
        const text = document.createElementNS(svgNS, 'text');
        text.setAttribute('x', a.x);
        text.setAttribute('y', a.y);
        text.setAttribute('fill', a.color || '#ffffff');
        text.setAttribute('font-size', String(a.size || 16));
        text.setAttribute('font-weight', '500');
        text.setAttribute('class', 'annotation-text');
        text.setAttribute('data-ann-id', a.id);
        text.setAttribute('data-ann-type', 'text');
        text.textContent = a.text || '';
        g.appendChild(text);
        if (isSel) {
          try {
            const box = text.getBBox();
            const rect = document.createElementNS(svgNS, 'rect');
            const pad = 5 / this.vp.zoom;
            rect.setAttribute('x', box.x - pad);
            rect.setAttribute('y', box.y - pad);
            rect.setAttribute('width', box.width + pad * 2);
            rect.setAttribute('height', box.height + pad * 2);
            rect.setAttribute('class', 'annotation-select-box');
            rect.setAttribute('rx', 4);
            g.appendChild(rect);
          } catch {}
        }
      }
    }
    if (!g.querySelector('defs')) {
      const defs = document.createElementNS(svgNS, 'defs');
      defs.innerHTML = `<marker id="annotation-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="context-stroke"/></marker>`;
      g.appendChild(defs);
    }
  }

  pointSegmentDistance(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    if (!len2) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * dx + (py - y1) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  /** 命中检测：箭头按线段距离，文字按实际渲染包围盒 */
  hitAnnotation(e) {
    const p = this.vp.screenToFlow(e.clientX, e.clientY);
    const list = store.state.annotations || [];
    const tol = 12 / this.vp.zoom;
    const handleTol = 16 / this.vp.zoom;
    for (let i = list.length - 1; i >= 0; i--) {
      const a = list[i];
      if (a.type === 'arrow') {
        if (this.pointSegmentDistance(p.x, p.y, a.x1, a.y1, a.x2, a.y2) <= tol) {
          const headD = Math.hypot(p.x - a.x2, p.y - a.y2);
          const tailD = Math.hypot(p.x - a.x1, p.y - a.y1);
          return { ann: a, mode: headD <= handleTol ? 'head' : tailD <= handleTol ? 'tail' : 'move' };
        }
      } else if (a.type === 'text') {
        const el = this.host.querySelector(`#annotationsGroup [data-ann-id="${a.id}"][data-ann-type="text"]`);
        if (el) {
          const r = el.getBoundingClientRect();
          const pad = 10;
          if (
            e.clientX >= r.left - pad &&
            e.clientX <= r.right + pad &&
            e.clientY >= r.top - pad &&
            e.clientY <= r.bottom + pad
          ) {
            return { ann: a, mode: 'move' };
          }
        }
      }
    }
    return null;
  }

  selectAnnotation(id) {
    this.selectedAnnotationId = id || null;
    this.renderAnnotations();
    store.emit('annotation-selected', this.selectedAnnotationId);
  }

  deleteSelectedAnnotation() {
    if (!this.selectedAnnotationId) return;
    removeAnnotation(this.selectedAnnotationId);
    this.selectAnnotation(null);
    store.emit('toast', '已删除标注', 'success');
  }

  updateSelectedAnnotation(patch) {
    if (!this.selectedAnnotationId) return false;
    updateAnnotation(this.selectedAnnotationId, patch);
    return true;
  }

  beginAnnotationDrag(e, hit, { double: isDouble = false } = {}) {
    const p = this.vp.screenToFlow(e.clientX, e.clientY);
    this.selectAnnotation(hit.ann.id);
    this.interaction = {
      type: 'annotation-drag',
      id: hit.ann.id,
      mode: hit.mode,
      double: isDouble,
      startFlow: p,
      startScreen: { x: e.clientX, y: e.clientY },
      orig: { ...hit.ann },
      pointerId: e.pointerId,
    };
    window.addEventListener('pointermove', this.onWindowPointerMove);
    window.addEventListener('pointerup', this.onWindowPointerUp);
  }

  updateAnnotationDrag(e) {
    const it = this.interaction;
    const p = this.vp.screenToFlow(e.clientX, e.clientY);
    const ann = (store.state.annotations || []).find((a) => a.id === it.id);
    if (!ann) return;
    const dx = p.x - it.startFlow.x;
    const dy = p.y - it.startFlow.y;
    if (it.mode === 'move') {
      if (ann.type === 'arrow') {
        ann.x1 = Math.round(it.orig.x1 + dx);
        ann.y1 = Math.round(it.orig.y1 + dy);
        ann.x2 = Math.round(it.orig.x2 + dx);
        ann.y2 = Math.round(it.orig.y2 + dy);
      } else {
        ann.x = Math.round(it.orig.x + dx);
        ann.y = Math.round(it.orig.y + dy);
      }
    } else if (it.mode === 'head') {
      ann.x2 = Math.round(p.x);
      ann.y2 = Math.round(p.y);
    } else if (it.mode === 'tail') {
      ann.x1 = Math.round(p.x);
      ann.y1 = Math.round(p.y);
    }
    this.renderAnnotations();
  }

  startAnnotate(e) {
    const flow = this.vp.screenToFlow(e.clientX, e.clientY);
    const tool = store.state.settings.annotateTool || 'arrow';
    if (tool === 'text') {
      this.promptAnnotationText(e, flow, null);
      return;
    }
    const it = {
      type: 'annotate',
      start: { x: e.clientX, y: e.clientY },
      from: flow,
      color: store.state.settings.annotateColor || ANNOTATION_COLORS[0],
      pointerId: e.pointerId,
      tempEl: null,
    };
    this.interaction = it;
    window.addEventListener('pointermove', this.onWindowPointerMove);
    window.addEventListener('pointerup', this.onWindowPointerUp);
  }

  /** 新建文字标注；existing 传入时为二次编辑 */
  promptAnnotationText(e, flow, existing = null) {
    const host = this.host;
    const local = this.vp.flowToLocal(flow.x, flow.y);
    const input = document.createElement('input');
    input.className = 'annotation-input';
    input.placeholder = '输入标注文字，回车确认';
    input.value = existing?.text || '';
    input.style.left = `${local.x}px`;
    input.style.top = `${local.y}px`;
    host.appendChild(input);
    input.focus();
    input.select();
    let done = false;
    const commit = (keep) => {
      if (done) return;
      done = true;
      const text = input.value.trim();
      input.remove();
      document.removeEventListener('pointerdown', outside, true);
      if (keep === false) return;
      if (existing) {
        if (text) updateAnnotation(existing.id, { text });
        this.selectAnnotation(existing.id);
      } else if (text) {
        const created = addAnnotation({
          type: 'text',
          x: Math.round(flow.x),
          y: Math.round(flow.y),
          text,
          color: store.state.settings.annotateColor || ANNOTATION_COLORS[0],
          size: Number(store.state.settings.annotateSize) || 20,
        });
        this.selectAnnotation(created.id);
      }
    };
    const outside = (ev) => {
      if (ev.target === input) return;
      commit(true);
    };
    setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
    input.addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Enter') commit(true);
      if (ev.key === 'Escape') commit(false);
    });
  }

  editAnnotationText(ann) {
    this.promptAnnotationText(null, { x: ann.x, y: ann.y }, ann);
  }

  annotateMove(e) {
    const it = this.interaction;
    if (!it) return;
    if (it.type === 'annotation-drag') {
      this.updateAnnotationDrag(e);
      return;
    }
    const flow = this.vp.screenToFlow(e.clientX, e.clientY);
    if (!it.tempEl) {
      it.tempEl = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      it.tempEl.setAttribute('stroke', it.color);
      it.tempEl.setAttribute('stroke-width', '2');
      it.tempEl.setAttribute('stroke-linecap', 'round');
      it.tempEl.setAttribute('stroke-dasharray', '6 4');
      it.tempEl.setAttribute('marker-end', 'url(#annotation-arrow)');
      this.host.querySelector('#annotationsGroup')?.appendChild(it.tempEl);
    }
    it.tempEl.setAttribute('x1', it.from.x);
    it.tempEl.setAttribute('y1', it.from.y);
    it.tempEl.setAttribute('x2', flow.x);
    it.tempEl.setAttribute('y2', flow.y);
  }

  /* ── pan（空白拖拽）与 box select（Shift + 拖拽，且必须完整框住） ── */
  panMove(e) {
    const it = this.interaction;
    const dist = Math.hypot(e.clientX - it.start.x, e.clientY - it.start.y);
    if (dist > 3) it.moved = true;
    this.vp.set({
      x: it.origin.x + (e.clientX - it.start.x),
      y: it.origin.y + (e.clientY - it.start.y),
      zoom: it.origin.zoom,
    });
  }

  boxMove(e) {
    const it = this.interaction;
    const r = this.host.getBoundingClientRect();
    const x1 = Math.min(it.startLocal.x, e.clientX - r.left);
    const y1 = Math.min(it.startLocal.y, e.clientY - r.top);
    const x2 = Math.max(it.startLocal.x, e.clientX - r.left);
    const y2 = Math.max(it.startLocal.y, e.clientY - r.top);
    it.box = { x1, y1, x2, y2 };
    const box = this.selectionBox;
    box.hidden = false;
    box.style.left = `${x1}px`;
    box.style.top = `${y1}px`;
    box.style.width = `${x2 - x1}px`;
    box.style.height = `${y2 - y1}px`;
    const a = this.vp.localToFlow(x1, y1);
    const b = this.vp.localToFlow(x2, y2);
    const hits = this.nodesInRect({ x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y }, { full: true });
    const ids = new Set(hits.map((n) => n.id));
    for (const [id, el] of this.nodeEls) el.classList.toggle('is-selected', ids.has(id) || store.selection.has(id));
    this.autoPan(e);
  }

  onWindowPointerUp = (e) => {
    const it = this.interaction;
    window.removeEventListener('pointermove', this.onWindowPointerMove);
    window.removeEventListener('pointerup', this.onWindowPointerUp);
    if (!it) return;
    this.interaction = null;

    if (it.type === 'drag') {
      if (it.moved) {
        store.afterMutate({ history: true, reason: 'move' });
      } else {
        if (it.expandOnClick) setCollapsed(it.expandOnClick, false);
        store.afterMutate({ history: false, reason: 'selection' });
      }
      this.drawGuides(null);
    } else if (it.type === 'annotate') {
      if (it.tempEl) it.tempEl.remove();
      const flow = this.vp.screenToFlow(e.clientX, e.clientY);
      const len = Math.hypot(flow.x - it.from.x, flow.y - it.from.y);
      if (len > 6) {
        addAnnotation({
          type: 'arrow',
          x1: Math.round(it.from.x),
          y1: Math.round(it.from.y),
          x2: Math.round(flow.x),
          y2: Math.round(flow.y),
          color: it.color,
          width: 2,
        });
      }
    } else if (it.type === 'resize') {
      store.afterMutate({ history: true, reason: 'resize' });
    } else if (it.type === 'connect') {
      this.pendingPath.classList.remove('is-visible', 'is-snapped');
      this.pendingPath.setAttribute('d', '');
      this.clearConnectionHighlight();
      if (it.snapped) {
        const targetId = it.snapped.node.id;
        store.transaction((s) => {
          for (const sourceId of it.sources) {
            const exists = s.edges.some((ed) => ed.source === sourceId && ed.target === targetId);
            if (!exists) s.edges.push(createEdge(sourceId, targetId));
          }
        }, { history: true, reason: 'connect' });
      } else if (!it.moved) {
        // click on port → open add-node quick menu anchored at the port
        const local = this.vp.flowToLocal(it.to.x, it.to.y);
        store.emit('request-add-node', { localX: local.x, localY: local.y, connectFrom: it.source });
      } else {
        const local = this.vp.flowToLocal(it.to.x, it.to.y);
        store.emit('request-add-node', {
          localX: local.x,
          localY: local.y,
          connectFrom: it.sources.length > 1 ? it.sources : it.source,
        });
      }
    } else if (it.type === 'annotation-drag') {
      store.afterMutate({ history: true, reason: 'annotate-edit' });
      const moved = Math.hypot(e.clientX - it.startScreen.x, e.clientY - it.startScreen.y) > 4;
      const ann = (store.state.annotations || []).find((a) => a.id === it.id);
      if (it.double && !moved && ann && ann.type === 'text') {
        this._lastAnnClick = null;
        this.editAnnotationText(ann);
      } else {
        this._lastAnnClick = moved ? null : { id: it.id, at: Date.now() };
        this.selectAnnotation(it.id);
      }
    } else if (it.type === 'box') {
      this.selectionBox.hidden = true;
      const box = it.box;
      if (box) {
        const a = this.vp.localToFlow(box.x1, box.y1);
        const b = this.vp.localToFlow(box.x2, box.y2);
        // Shift 框选：只有完整框住的节点才算选中
        const hits = this.nodesInRect({ x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y }, { full: true });
        store.setSelection(hits.map((n) => n.id), { additive: it.additive });
      }
      this.syncSelection();
    } else if (it.type === 'pan') {
      if (!it.moved) store.emit('pane-click');
    }
  };

  measure() {
    // node dimensions are explicit (node.w / node.h) — nothing to measure
    this.syncEdges();
  }

  syncNodes() {
    const seen = /* @__PURE__ */ new Set();
    for (const node of store.nodes) {
      seen.add(node.id);
      let el = this.nodeEls.get(node.id);
      if (!el) {
        el = this.createNodeEl(node);
        this.nodeEls.set(node.id, el);
        this.nodeLayer.appendChild(el);
      }
      this.updateNodeEl(el, node);
    }
    for (const [id, el] of this.nodeEls) {
      if (!seen.has(id)) {
        el.remove();
        this.nodeEls.delete(id);
        this.dims.delete(id);
      }
    }
  }
  createNodeEl(node) {
    const el = document.createElement("div");
    el.className = "node";
    el.dataset.id = node.id;
    el.dataset.type = node.type;
    el.addEventListener("pointerdown", (e) => this.onNodePointerDown(e, node.id));
    el.addEventListener("dblclick", (e) => this.onNodeDoubleClick(e, node.id));
    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      store.emit("context-menu", { kind: "node", id: node.id, x: e.clientX, y: e.clientY });
    });
    return el;
  }
  updateNodeEl(el, node) {
    const t = NODE_TYPES[node.type] || NODE_TYPES.text;
    const w = node.w || t.size.w;
    const h = node.h || t.size.h;
    this.dims.set(node.id, { w, h });
    el.dataset.type = node.type;
    el.style.width = `${w}px`;
    el.style.setProperty("--node-h", `${h}px`);
    el.dataset.chip = chipCategory(node.type);
    el.style.transform = `translate3d(${node.x}px, ${node.y}px, 0)`;
    el.style.zIndex = String(node.type === "group" ? 0 : node.z ?? 1);
    el.classList.toggle("is-selected", store.selection.has(node.id));
    el.classList.toggle("is-running", node.data?.status === "running");
    el.classList.toggle("is-queued", node.data?.status === "queued");
    el.classList.toggle("is-collapsed", !!node.data?.collapsed);
    const readonly = !!store.state.settings.readMode;
    el.classList.toggle("is-readonly", readonly);
    if (node.type === "group") {
      const color = GROUP_COLORS.find((c) => c.key === node.data?.groupColor) || GROUP_COLORS[0];
      el.style.setProperty("--group-bg", color.value);
      el.style.setProperty("--group-border", color.border);
    }
    const ports = readonly ? { in: false, out: false } : t.ports || { in: false, out: false };
    const collapsed = !!node.data?.collapsed;
    const sig = [
      node.id,
      node.type,
      w,
      h,
      node.data?.status || "",
      node.data?.media ? 1 : 0,
      node.data?.duration || "",
      node.data?.items || 0,
      nodeTitle(node),
      ports.in,
      ports.out,
      collapsed ? "c" : "e",
      readonly ? "r" : "w",
      node.data?.groupColor || "",
      node.data?.edits?.length || 0,
      node.data?.poster ? 1 : 0,
      node.data?.params ? 1 : 0
    ].join("|");
    if (el.dataset.sig !== sig) {
      el.innerHTML = `
      <div class="node__label-row">
        <span class="node__label-icon">${icon(t.icon)}</span>
        <span class="node__label" data-field="label">${escapeHTML(nodeTitle(node))}</span>
        <span class="node__label-badge">${t.badge || ""}</span>
        ${collapsed && node.type !== "group" ? `<button class="node__label-expand" data-act="expand" title="\u5C55\u5F00\u8282\u70B9">${icon("chevron")}</button>` : ""}
      </div>
      <div class="node__card">${bodyHTML(node)}</div>
      ${node.type !== "group" ? '<div class="node__glow" aria-hidden="true"></div>' : ""}
      ${ports.in ? `<button class="node__handle node__handle--in" data-port="in" aria-label="\u8F93\u5165\u7AEF\u53E3"></button>` : ""}
      ${ports.out ? `<button class="node__handle node__handle--out" data-port="out" aria-label="\u8F93\u51FA\u7AEF\u53E3"></button>` : ""}
      ${ports.out && node.type !== "group" && !collapsed ? `<button class="node__plus" data-act="plus" title="\u5728\u6B64\u8282\u70B9\u540E\u6DFB\u52A0"><span class="node__plus-icon">${icon("plus")}</span></button>` : ""}
      ${node.type !== "group" && !collapsed ? '<div class="node__resize" data-act="resize"></div>' : ""}
    `;
      el.dataset.sig = sig;
      this.bindNodeInner(el, node);
    } else {
      const labelEl = el.querySelector('[data-field="label"]');
      if (labelEl && labelEl.textContent !== nodeTitle(node)) labelEl.textContent = nodeTitle(node);
      const textEl = el.querySelector(".node__text");
      if (textEl && textEl !== document.activeElement && textEl.textContent !== (node.data?.text || "")) {
        textEl.textContent = node.data?.text || "";
      }
      const promptEl = el.querySelector(".node__prompt");
      if (promptEl && promptEl.textContent !== (node.data?.prompt || "")) promptEl.textContent = node.data?.prompt || "";
      const statusEl = el.querySelector(".node__status");
      if (statusEl) {
        const status = node.data?.status || "idle";
        statusEl.dataset.status = status;
        statusEl.textContent = STATUS_TEXT[status] || status;
      }
      const runBtn = el.querySelector('[data-act="run"]');
      if (runBtn) runBtn.disabled = node.data?.status === "running";
    }
  }
  bindNodeInner(el, node) {
    el.querySelectorAll("[data-act]").forEach((btn) => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = "1";
      btn.addEventListener("pointerdown", (e) => {
        if (btn.dataset.act !== "resize") e.stopPropagation();
      });
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const act = btn.dataset.act;
        if (act === "expand") setCollapsed(node.id, false);
        if (act === "delete") this.removeNode(node.id);
        if (act === "duplicate") this.duplicateSelection([node.id]);
        if (act === "run") this.runNode(node.id);
        if (act === "plus") {
          const p = this.vp.flowToLocal(node.x + (node.w || 380) + 40, node.y + LABEL_OFFSET + 20);
          store.emit("request-add-node", { localX: p.x, localY: p.y, connectFrom: node.id });
        }
      });
    });
    const resize = el.querySelector(".node__resize");
    if (resize) resize.addEventListener("pointerdown", (e) => this.onResizeStart(e, node.id));
    const port = el.querySelector(".node__handle--out");
    if (port) port.addEventListener("pointerdown", (e) => this.onConnectStart(e, node.id));
    const textEl = el.querySelector(".node__text");
    if (textEl) {
      textEl.addEventListener("pointerdown", (e) => e.stopPropagation());
      textEl.addEventListener("blur", () => {
        const value = textEl.textContent || "";
        if (value !== (node.data?.text || "")) {
          store.transaction((s) => {
            const n = s.nodes.find((x) => x.id === node.id);
            if (n) n.data = { ...n.data, text: value };
          }, { history: true, reason: "text" });
        }
      });
    }
  }
  syncEdges() {
    const seen = /* @__PURE__ */ new Set();
    for (const edge of store.edges) {
      const source = store.getNode(edge.source);
      const target = store.getNode(edge.target);
      if (!source || !target) continue;
      seen.add(edge.id);
      let g = this.edgeEls.get(edge.id);
      if (!g) {
        g = this.createEdgeEl(edge);
        this.edgeEls.set(edge.id, g);
        this.edgeGroup.appendChild(g);
      }
      this.updateEdgeEl(g, edge, source, target);
    }
    for (const [id, el] of this.edgeEls) {
      if (!seen.has(id)) {
        el.remove();
        this.edgeEls.delete(id);
      }
    }
  }
  createEdgeEl(edge) {
    const ns = "http://www.w3.org/2000/svg";
    const g = document.createElementNS(ns, "g");
    g.setAttribute("class", "edge-group");
    g.dataset.id = edge.id;
    const hit = document.createElementNS(ns, "path");
    hit.setAttribute("class", "edge-hit");
    const path = document.createElementNS(ns, "path");
    path.setAttribute("class", "edge-path");
    g.append(hit, path);
    g.addEventListener("pointerenter", () => this.scheduleScissors(edge.id));
    g.addEventListener("pointermove", (e) => this.onEdgePointerMove(e, edge.id));
    g.addEventListener("pointerleave", () => this.scheduleHideScissors());
    g.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      store.emit("context-menu", { kind: "edge", id: edge.id, x: e.clientX, y: e.clientY });
    });
    return g;
  }
  updateEdgeEl(g, edge, source, target) {
    const a = this.portPos(source, "out");
    const b = this.portPos(target, "in");
    const d = bezierPath(a.x, a.y, b.x, b.y);
    const path = g.querySelector(".edge-path");
    const hit = g.querySelector(".edge-hit");
    path.setAttribute("d", d);
    hit.setAttribute("d", d);
    const flowing = target.data?.status === "running" || target.data?.status === "queued";
    g.classList.toggle("is-flowing", flowing);
    g.classList.toggle("is-dashed", !!edge.data?.dashed);
    g.classList.toggle("is-selected", store.state.edgeSelection.has(edge.id));
    g.classList.toggle(
      "is-adjacent",
      store.selection.has(edge.source) || store.selection.has(edge.target)
    );
    g.classList.toggle("is-hidden", !!store.state.settings.edgesHidden);
    g.dataset.flowing = flowing ? "1" : "0";
  }
  syncSelection() {
    for (const [id, el] of this.nodeEls) {
      el.classList.toggle("is-selected", store.selection.has(id));
    }
    for (const [id, g] of this.edgeEls) {
      g.classList.toggle("is-selected", store.state.edgeSelection.has(id));
    }
    const empty = store.nodes.length === 0;
    const emptyState = this.host.querySelector("#emptyState");
    if (emptyState) emptyState.hidden = !empty;
    this.updateHud();
    this.drawMinimap();
  }
  updateHud() {
    const hud = this.host.querySelector("#hud");
    if (hud) hud.textContent = `\u8282\u70B9 ${store.nodes.filter((n) => n.type !== "group").length} \xB7 \u8FDE\u7EBF ${store.edges.length}`;
  }
  /* ── viewport reaction ─────────────────────────────────────────── */
  onViewportChange() {
    this.syncNodeToolbar();
    this.drawGrid();
    this.drawMinimap();
    const zoomVal = this.host.querySelector("#zoomValue");
    if (zoomVal) zoomVal.textContent = `${Math.round(this.vp.zoom * 100)}%`;
    store.emit("zoom", this.vp.zoom);
  }
  /* ── node toolbar (selection actions) ──────────────────────────── */
  /** 画布内浮动工具条的缩放：随画布 zoom 缩小，但保底可点按 */
  uiScale() {
    return Math.max(0.4, Math.min(1, this.vp.zoom));
  }

  syncNodeToolbar() {
    const selected = store.selectedNodes();
    if (store.state.settings.readMode || selected.length !== 1 || selected[0].type === "group") {
      if (this.toolbar) this.toolbar.hidden = true;
      return;
    }
    const node = selected[0];
    if (!this.toolbar) {
      const el3 = document.createElement("div");
      el3.className = "node-toolbar";
      el3.innerHTML = `
      <button data-tb="focus" title="\u805A\u7126">${icon("fit")}</button>
      <button data-tb="duplicate" title="\u590D\u5236">${icon("duplicate")}</button>
      <button data-tb="group" title="\u7F16\u7EC4">${icon("group")}</button>
      <span class="node-toolbar__sep"></span>
      <button data-tb="delete" title="\u5220\u9664">${icon("trash")}</button>`;
      el3.addEventListener("pointerdown", (e) => e.stopPropagation());
      el3.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-tb]");
        if (!btn) return;
        const act = btn.dataset.tb;
        if (act === "focus") this.vp.focusNode(node);
        if (act === "duplicate") this.duplicateSelection([node.id]);
        if (act === "group") this.groupSelection();
        if (act === "expand") setCollapsed(node.id, false);
        if (act === "delete") this.removeNode(node.id);
      });
      this.host.appendChild(el3);
      this.toolbar = el3;
    }
    const { w } = this.dimsOf(node);
    const local = this.vp.flowToLocal(node.x + w / 2, node.y);
    const el = this.toolbar;
    el.hidden = false;
    el.style.position = "absolute";
    const toolbarScale = this.uiScale();
    const minTop = 64 + 30 * toolbarScale + 8;
    const half = ((el.offsetWidth || 120) * toolbarScale) / 2;
    const minLeft = 72 + half;
    const maxLeft = this.host.clientWidth - 16 - half;
    el.style.left = `${Math.max(minLeft, Math.min(maxLeft, local.x))}px`;
    el.style.top = `${Math.max(minTop, local.y - 10)}px`;
    el.style.transform = `translate(-50%, -100%) scale(${toolbarScale})`;
    el.style.transformOrigin = "50% 100%";
  }
  /* ── node pointer interactions ─────────────────────────────────── */
  onNodePointerDown(e, nodeId) {
    if (e.button !== 0) return;
    if (e.target.closest("[data-port]") || e.target.closest('[data-act="resize"]')) return;
    if (e.target.closest(".node__text")) return;
    e.stopPropagation();
    const node = store.getNode(nodeId);
    if (!node) return;
    const readonly = !!store.state.settings.readMode;
    const additive = e.shiftKey;
    if (additive) {
      store.setSelection([nodeId], { additive: true });
    } else if (!store.selection.has(nodeId)) {
      store.setSelection([nodeId]);
    }
    if (readonly) return;
    const selected = store.selectedNodes();
    const dragIds = new Set(selected.map((n) => n.id));
    for (const n of selected) {
      if (n.type === "group") this.containedNodes(n).forEach((c) => dragIds.add(c.id));
    }
    if (!dragIds.has(nodeId)) dragIds.add(nodeId);
    const start = { x: e.clientX, y: e.clientY };
    const origin = new Map([...dragIds].map((id) => {
      const n = store.getNode(id);
      return [id, { x: n.x, y: n.y }];
    }));
    this.interaction = {
      type: "drag",
      start,
      origin,
      moved: false,
      ids: [...dragIds],
      pointerId: e.pointerId,
      expandOnClick: !!node.data?.collapsed && node.type !== "group" ? node.id : null
    };
    store.setTool(store.state.tool === "hand" ? "select" : store.state.tool);
    window.addEventListener("pointermove", this.onWindowPointerMove);
    window.addEventListener("pointerup", this.onWindowPointerUp);
  }
  onResizeStart(e, nodeId) {
    if (store.state.settings.readMode) return;
    e.preventDefault();
    e.stopPropagation();
    const node = store.getNode(nodeId);
    if (!node) return;
    const { w, h } = this.dimsOf(node);
    this.interaction = {
      type: "resize",
      id: nodeId,
      start: { x: e.clientX, y: e.clientY },
      origin: { w: node.w || w, h: node.h || h },
      pointerId: e.pointerId
    };
    window.addEventListener("pointermove", this.onWindowPointerMove);
    window.addEventListener("pointerup", this.onWindowPointerUp);
  }
  onConnectStart(e, nodeId) {
    if (e.button !== 0) return;
    if (store.state.settings.readMode) return;
    e.preventDefault();
    e.stopPropagation();
    const node = store.getNode(nodeId);
    if (!node) return;
    const p = this.portPos(node, "out");
    const batch = store.selection.has(nodeId) && store.selection.size > 1 ? [...store.selection].filter((id) => {
      const n = store.getNode(id);
      return n && n.type !== "group" && n.type !== "comment";
    }) : [];
    this.interaction = {
      type: "connect",
      source: nodeId,
      sources: batch.length ? batch : [nodeId],
      start: { x: e.clientX, y: e.clientY },
      from: p,
      to: { ...p },
      snapped: null,
      pointerId: e.pointerId
    };
    this.pendingPath.classList.add("is-visible");
    window.addEventListener("pointermove", this.onWindowPointerMove);
    window.addEventListener("pointerup", this.onWindowPointerUp);
  }
  /* ── global pointer handlers ───────────────────────────────────── */
  onWindowPointerMove = (e) => {
    const it = this.interaction;
    if (!it) return;
    if (it.type === "drag") this.dragMove(e);
    else if (it.type === "resize") this.resizeMove(e);
    else if (it.type === "connect") this.connectMove(e);
    else if (it.type === "pan") this.panMove(e);
    else if (it.type === "box") this.boxMove(e);
    else if (it.type === "annotate" || it.type === "annotation-drag") this.annotateMove(e);
  };
  dragMove(e) {
    const it = this.interaction;
    const dx = (e.clientX - it.start.x) / this.vp.zoom;
    const dy = (e.clientY - it.start.y) / this.vp.zoom;
    if (!it.moved && Math.hypot(dx * this.vp.zoom, dy * this.vp.zoom) < 3) return;
    it.moved = true;
    const snapOn = store.state.settings.snapGrid;
    let guides = null;
    const primary = it.ids.length === 1 ? store.getNode(it.ids[0]) : null;
    for (const id of it.ids) {
      const node = store.getNode(id);
      const o = it.origin.get(id);
      if (!node || !o) continue;
      let nx = o.x + dx;
      let ny = o.y + dy;
      if (snapOn) {
        nx = Math.round(nx / GRID) * GRID;
        ny = Math.round(ny / GRID) * GRID;
      }
      node.x = nx;
      node.y = ny;
      const el = this.nodeEls.get(id);
      if (el) el.style.transform = `translate3d(${nx}px, ${ny}px, 0)`;
      if (primary && id === primary.id && store.state.settings.guides) {
        const g = this.applyGuides(node);
        if (g) guides = g;
      }
    }
    this.drawGuides(guides);
    this.syncEdgesFor(it.ids);
    this.autoPan(e);
    this.drawMinimap();
  }
  resizeMove(e) {
    const it = this.interaction;
    const node = store.getNode(it.id);
    if (!node) return;
    const dx = (e.clientX - it.start.x) / this.vp.zoom;
    const dy = (e.clientY - it.start.y) / this.vp.zoom;
    const t = NODE_TYPES[node.type] || NODE_TYPES.text;
    const minW = Math.max(160, t.size.w * 0.6);
    const minH = t.kind === "group" ? 140 : 120;
    node.w = Math.max(minW, Math.round(it.origin.w + dx));
    node.h = Math.max(minH, Math.round(it.origin.h + dy));
    const el = this.nodeEls.get(node.id);
    if (el) {
      el.style.width = `${node.w}px`;
      el.style.setProperty("--node-h", `${node.h}px`);
      this.dims.set(node.id, { w: node.w, h: node.h });
    }
    this.syncEdgesFor([node.id]);
    this.drawMinimap();
  }
  connectMove(e) {
    const it = this.interaction;
    const flow = this.vp.screenToFlow(e.clientX, e.clientY);
    it.to = flow;
    const snapped = this.findSnapTarget(it.sources, flow);
    it.snapped = snapped;
    let end = flow;
    if (snapped) end = this.portPos(snapped.node, "in");
    this.pendingPath.setAttribute("d", bezierPath(it.from.x, it.from.y, end.x, end.y));
    this.pendingPath.classList.toggle("is-snapped", !!snapped);
    this.connectionHighlight(snapped, it.sources);
    this.autoPan(e);
  }
  findSnapTarget(sources, flow) {
    const sourceIds = Array.isArray(sources) ? sources : [sources];
    let best = null;
    let bestArea = Infinity;
    for (const node of store.nodes) {
      if (sourceIds.includes(node.id)) continue;
      const t = NODE_TYPES[node.type];
      if (!t || NODE_SELECTOR_EXCLUDE.has(node.type) || !t.ports?.in) continue;
      const { w, h } = this.dimsOf(node);
      const pad = SNAP_PADDING / this.vp.zoom;
      if (flow.x < node.x - pad || flow.x > node.x + w + pad) continue;
      if (flow.y < node.y - pad || flow.y > node.y + h + pad) continue;
      const area = w * h;
      if (area < bestArea) {
        bestArea = area;
        best = node;
      }
    }
    return best ? { node: best } : null;
  }
  /* ── connection targeting: dim invalid nodes, glow the snapped target ── */
  connectionHighlight(snapped, sources) {
    const sourceIds = new Set(Array.isArray(sources) ? sources : [sources]);
    for (const [id, el] of this.nodeEls) {
      const node = store.getNode(id);
      const t = node && NODE_TYPES[node.type];
      const candidate = node && !sourceIds.has(id) && t && !NODE_SELECTOR_EXCLUDE.has(node.type) && t.ports?.in;
      el.classList.toggle("is-connection-blurred", !candidate && !sourceIds.has(id));
      el.classList.toggle("is-connection-target", !!snapped && snapped.node.id === id);
      el.classList.toggle("is-glow", !!snapped && snapped.node.id === id);
    }
  }
  clearConnectionHighlight() {
    for (const [, el] of this.nodeEls) {
      el.classList.remove("is-connection-blurred", "is-connection-target", "is-glow");
    }
  }
  nodesInRect(rect, { full = false } = {}) {
    const hits = [];
    for (const node of store.nodes) {
      const b = nodeBounds(node);
      if (full) {
        if (b.x >= rect.x && b.y >= rect.y && b.right <= rect.x + rect.w && b.bottom <= rect.y + rect.h) hits.push(node);
        continue;
      }
      const ix = Math.max(0, Math.min(b.right, rect.x + rect.w) - Math.max(b.x, rect.x));
      const iy = Math.max(0, Math.min(b.bottom, rect.y + rect.h) - Math.max(b.y, rect.y));
      if (ix > 0 && iy > 0) hits.push(node);
    }
    return hits;
  }

  /* ── alignment guides ──────────────────────────────────────────── */

  applyGuides(node) {
    const { w, h } = this.dimsOf(node);
    const threshold = 6 / this.vp.zoom;
    const cand = {
      left: [node.x, []],
      centerX: [node.x + w / 2, []],
      right: [node.x + w, []],
      top: [node.y, []],
      centerY: [node.y + h / 2, []],
      bottom: [node.y + h, []],
    };
    const guides = { vertical: null, horizontal: null };
    let bestDx = threshold + 1;
    let bestDy = threshold + 1;
    for (const other of store.nodes) {
      if (other.id === node.id) continue;
      const b = nodeBounds(other);
      const points = {
        left: b.x,
        centerX: b.x + b.w / 2,
        right: b.right,
        top: b.y,
        centerY: b.y + b.h / 2,
        bottom: b.bottom,
      };
      for (const [key, [value]] of Object.entries(cand)) {
        const target = points[key];
        if (target == null) continue;
        const d = target - value;
        if (Math.abs(d) <= threshold) {
          if (!key.startsWith('top') && !key.startsWith('center') && !key.startsWith('bottom')) {
            if (Math.abs(d) < Math.abs(bestDx)) {
              bestDx = d;
              guides.vertical = { x: target };
            }
          }
        }
      }
      // horizontal
      for (const [key, target] of [
        ['top', b.y],
        ['centerY', b.y + b.h / 2],
        ['bottom', b.bottom],
      ]) {
        const value = key === 'top' ? node.y : key === 'centerY' ? node.y + h / 2 : node.y + h;
        const d = target - value;
        if (Math.abs(d) <= threshold && Math.abs(d) < Math.abs(bestDy)) {
          bestDy = d;
          guides.horizontal = { y: target };
        }
      }
    }
    if (Number.isFinite(bestDx) && Math.abs(bestDx) <= threshold) {
      node.x += bestDx;
      const el = this.nodeEls.get(node.id);
      if (el) el.style.transform = `translate3d(${node.x}px, ${node.y}px, 0)`;
    }
    if (Number.isFinite(bestDy) && Math.abs(bestDy) <= threshold) {
      node.y += bestDy;
      const el = this.nodeEls.get(node.id);
      if (el) el.style.transform = `translate3d(${node.x}px, ${node.y}px, 0)`;
    }
    return guides.vertical || guides.horizontal ? guides : null;
  }

  drawGuides(guides) {
    const g = this.guidesGroup;
    g.innerHTML = '';
    if (!guides) return;
    const b = selectionBounds(store.selectedNodes().length ? store.selectedNodes() : store.nodes) || { y: -2000, bottom: 2000, x: -2000, right: 2000 };
    if (guides.vertical) {
      const x = guides.vertical.x;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('class', 'guide-line');
      line.setAttribute('x1', x);
      line.setAttribute('x2', x);
      line.setAttribute('y1', b.y - 400);
      line.setAttribute('y2', b.bottom + 400);
      g.appendChild(line);
    }
    if (guides.horizontal) {
      const y = guides.horizontal.y;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('class', 'guide-line');
      line.setAttribute('x1', b.x - 400);
      line.setAttribute('x2', b.right + 400);
      line.setAttribute('y1', y);
      line.setAttribute('y2', y);
      g.appendChild(line);
    }
  }

  syncEdgesFor(ids) {
    const set = new Set(ids);
    for (const edge of store.edges) {
      if (!set.has(edge.source) && !set.has(edge.target)) continue;
      const g = this.edgeEls.get(edge.id);
      if (!g) continue;
      const source = store.getNode(edge.source);
      const target = store.getNode(edge.target);
      if (source && target) this.updateEdgeEl(g, edge, source, target);
    }
  }

  /* ── edge scissors (recovered interaction) ─────────────────────── */

  scheduleScissors(edgeId) {
    clearTimeout(this.edgeTimer);
    clearTimeout(this.edgeHideTimer);
    const edge = store.getEdge(edgeId);
    if (!edge) return;
    this.edgeTimer = setTimeout(() => {
      this.showScissors(edgeId, this.lastPointer || { x: 0, y: 0 });
    }, EDGE_HOVER_DELAY);
  }

  onEdgePointerMove(e, edgeId) {
    this.lastPointer = { x: e.clientX, y: e.clientY };
    if (this.hoverEdge === edgeId && this.scissorsEl) {
      const flow = this.vp.screenToFlow(e.clientX, e.clientY);
      this.positionScissors(flow);
    }
  }

  showScissors(edgeId, client) {
    this.hoverEdge = edgeId;
    if (!this.scissorsEl) {
      const el = document.createElement('div');
      el.className = 'edge-scissors';
      el.innerHTML = `<svg viewBox="0 0 24 24"><circle cx="6" cy="6" r="2.3"/><circle cx="6" cy="18" r="2.3"/><path d="M8 7.6L20 18M8 16.4L20 6"/></svg>`;
      el.title = '删除连线';
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteEdge(edgeId);
      });
      this.host.appendChild(el);
      this.scissorsEl = el;
    }
    const flow = this.vp.screenToFlow(client.x, client.y);
    this.positionScissors(flow);
  }

  positionScissors(flow) {
    if (!this.scissorsEl) return;
    const local = this.vp.flowToLocal(flow.x, flow.y);
    this.scissorsEl.style.left = `${local.x - 14}px`;
    this.scissorsEl.style.top = `${local.y - 14}px`;
  }

  scheduleHideScissors() {
    clearTimeout(this.edgeTimer);
    clearTimeout(this.edgeHideTimer);
    this.edgeHideTimer = setTimeout(() => {
      this.hoverEdge = null;
      if (this.scissorsEl) {
        this.scissorsEl.remove();
        this.scissorsEl = null;
      }
    }, EDGE_HIDE_DELAY);
  }

  deleteEdge(id) {
    store.transaction((s) => {
      s.edges = s.edges.filter((e) => e.id !== id);
      s.edgeSelection.delete(id);
    }, { history: true, reason: 'edge-delete' });
  }

  /* ── auto pan ──────────────────────────────────────────────────── */

  autoPan(e) {
    const r = this.host.getBoundingClientRect();
    const edge = 48;
    let dx = 0;
    let dy = 0;
    if (e.clientX < r.left + edge) dx = 10;
    else if (e.clientX > r.right - edge) dx = -10;
    if (e.clientY < r.top + edge) dy = 10;
    else if (e.clientY > r.bottom - edge) dy = -10;
    if (!dx && !dy) return;
    if (this._panRAF) return;
    this._panRAF = requestAnimationFrame(() => {
      this._panRAF = 0;
      this.vp.panBy(dx, dy);
    });
  }

  /* ── canvas (pane) pointer interactions ────────────────────────── */

  bind() {
    const host = this.host;
    // annotate mode must win over nodes (capture phase), like their overlay layer
    host.addEventListener(
      'pointerdown',
      (e) => {
        if (!store.state.settings.annotateMode || e.button !== 0) return;
        if (
          e.target.closest(
            '.annotate-bar, .media-toolbar, .menu, .canvas-toolbar, .zoom-pill, .minimap, .canvas-header, .node-manager, .history-overlay, .dialog-backdrop, .adjust-popover, .organize-prompt, .readonly-bar',
          )
        )
          return;
        store.emit('pane-click');
        const hit = this.hitAnnotation(e);
        e.preventDefault();
        e.stopPropagation();
        if (hit) {
          const now = Date.now();
          const isDouble =
            hit.ann.type === 'text' &&
            this._lastAnnClick &&
            this._lastAnnClick.id === hit.ann.id &&
            now - this._lastAnnClick.at < 420;
          this.beginAnnotationDrag(e, hit, { double: isDouble });
          return;
        }
        this.selectAnnotation(null);
        if (store.selection.size) store.clearSelection();
        this.startAnnotate(e);
      },
      true,
    );
    host.addEventListener('pointerdown', (e) => this.onPanePointerDown(e));
    host.addEventListener('contextmenu', (e) => {
      if (e.target.closest('.node') || e.target.closest('.edge-group')) return;
      e.preventDefault();
      const flow = this.vp.screenToFlow(e.clientX, e.clientY);
      store.emit('context-menu', { kind: 'pane', x: e.clientX, y: e.clientY, flow });
    });
    host.addEventListener('dblclick', (e) => {
      if (store.state.settings.readMode) return;
      if (store.state.settings.annotateMode) {
        const annHit = this.hitAnnotation(e);
        if (annHit && annHit.ann.type === 'text') {
          e.preventDefault();
          e.stopPropagation();
          if (!document.querySelector('.annotation-input')) this.editAnnotationText(annHit.ann);
          return;
        }
      }
      if (e.target.closest('.node') || e.target.closest('.edge-group')) return;
      if (store.state.settings.annotateMode) {
        const hit = this.hitAnnotation(e);
        if (hit && hit.ann.type === 'text') {
          e.preventDefault();
          this.editAnnotationText(hit.ann);
          return;
        }
        if (hit) return;
      }
      if (e.target.closest('.annotation-text')) {
        const id = e.target.closest('.annotation-text').dataset.annId;
        const ann = (store.state.annotations || []).find((a) => a.id === id);
        if (ann) {
          this.editAnnotationText(ann);
          return;
        }
      }
      const local = this.localOf(e);
      store.emit('request-add-node', { localX: local.x, localY: local.y });
    });
    host.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.vp.handleWheel(e);
    }, { passive: false });

    // drag & drop files
    let dragDepth = 0;
    const dropHint = host.querySelector('#dropHint');
    host.addEventListener('dragenter', (e) => {
      e.preventDefault();
      dragDepth++;
      dropHint?.classList.add('is-active');
    });
    host.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });
    host.addEventListener('dragleave', (e) => {
      dragDepth = Math.max(0, dragDepth - 1);
      if (!dragDepth) dropHint?.classList.remove('is-active');
    });
    host.addEventListener('drop', (e) => {
      e.preventDefault();
      dragDepth = 0;
      dropHint?.classList.remove('is-active');
      const assetRaw = e.dataTransfer?.getData('application/x-canvas-asset');
      if (assetRaw) {
        try {
          const asset = JSON.parse(assetRaw);
          const flow = this.vp.screenToFlow(e.clientX, e.clientY);
          store.emit('drop-asset', { asset, flow });
        } catch {}
        return;
      }
      const files = [...(e.dataTransfer?.files || [])];
      if (files.length) store.emit('drop-files', { files, flow: this.vp.screenToFlow(e.clientX, e.clientY) });
    });
  }

  localOf(e) {
    const r = this.host.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  onPanePointerDown(e) {
    // clicks on canvas chrome must never clear the selection / start a marquee
    const chrome = e.target.closest(
      '.node, .edge-group, .zoom-pill, .minimap, .canvas-header, .canvas-toolbar, .add-panel, .node-toolbar, .menu, .hud, .canvas-doc, .node-manager, .group-toolbar, .readonly-bar',
    );
    if (chrome) return;
    // 点击画布空白：关闭所有弹窗（参数面板/菜单/对话框等）
    store.emit('pane-click');
    if (store.state.settings.annotateMode && e.button === 0) {
      e.preventDefault();
      const hit = this.hitAnnotation(e);
      if (hit) {
        this.beginAnnotationDrag(e, hit);
        return;
      }
      this.selectAnnotation(null);
      this.startAnnotate(e);
      return;
    }
    const comfy = store.state.settings.interactionMode === 'comfyui';
    const panButton = e.button === 1 || e.button === 2 || (comfy && e.button === 0);
    const handTool = store.state.tool === 'hand' || this.spaceDown;
    const startPan = () => {
      e.preventDefault();
      this.interaction = {
        type: 'pan',
        start: { x: e.clientX, y: e.clientY },
        origin: { ...this.vp.v },
        moved: false,
        pointerId: e.pointerId,
      };
      this.host.classList.add('is-panning');
      window.addEventListener('pointermove', this.onWindowPointerMove);
      window.addEventListener('pointerup', (ev) => {
        this.host.classList.remove('is-panning');
        this.onWindowPointerUp(ev);
      }, { once: true });
    };
    if (panButton || handTool) return startPan();
    if (e.button !== 0) return;
    // Shift + 拖拽 = 框选（必须完整框住节点）；普通拖拽 = 平移画布
    if (e.shiftKey) {
      if (store.selection.size || store.state.edgeSelection.size) {
        // 保留现有选择，框选为追加模式
      }
      const local = this.localOf(e);
      this.interaction = {
        type: 'box',
        start: { x: e.clientX, y: e.clientY },
        startLocal: local,
        additive: true,
        box: null,
        pointerId: e.pointerId,
      };
      window.addEventListener('pointermove', this.onWindowPointerMove);
      window.addEventListener('pointerup', this.onWindowPointerUp);
      return;
    }
    if (store.selection.size || store.state.edgeSelection.size) store.clearSelection();
    if (this.selectedAnnotationId) this.selectAnnotation(null);
    startPan();
  }

  onNodeDoubleClick(e, nodeId) {
    const node = store.getNode(nodeId);
    if (!node) return;
    e.stopPropagation();
    if (node.type === 'group') {
      const contained = this.containedNodes(node);
      store.setSelection(contained.map((n) => n.id));
      return;
    }
    // 双击「标题栏」= 参数面板；双击节点其他区域（生成内容）= 打开生成结果
    const onLabel = !!e.target.closest('.node__label-row, .node__label, .node__title, .node__chip-row');
    const hasMedia = !!(nodeMainMedia(node) || node.data?.poster);
    store.setSelection([node.id]);
    if (!onLabel && hasMedia) {
      store.emit('request-preview', { id: node.id });
      return;
    }
    store.emit('request-params', { id: node.id });
  }

  /* ── document operations ───────────────────────────────────────── */

  containedNodes(group) {
    const g = nodeBounds(group);
    return store.nodes.filter((n) => {
      if (n.id === group.id || n.type === 'group') return false;
      const b = nodeBounds(n);
      const ix = Math.max(0, Math.min(b.right, g.right) - Math.max(b.x, g.x));
      const iy = Math.max(0, Math.min(b.bottom, g.bottom) - Math.max(b.y, g.y));
      return ix * iy >= (b.w * b.h) / 2;
    });
  }

  removeNode(id) {
    store.setSelection([id]);
    store.removeSelection();
  }

  duplicateSelection(explicitIds) {
    const ids = explicitIds || [...store.selection];
    const nodes = store.nodes.filter((n) => ids.includes(n.id));
    if (!nodes.length) return;
    const map = new Map();
    const clones = nodes.map((n) => {
      const copy = createNode(n.type, { x: n.x + 40, y: n.y + 40 }, structuredClone(n.data), {
        w: n.w,
        h: n.h,
      });
      map.set(n.id, copy.id);
      return copy;
    });
    const edges = store.edges
      .filter((e) => map.has(e.source) && map.has(e.target))
      .map((e) => createEdge(map.get(e.source), map.get(e.target), { data: { ...e.data } }));
    store.transaction((s) => {
      s.nodes.push(...clones);
      s.edges.push(...edges);
      s.selection = new Set(clones.map((c) => c.id));
      s.edgeSelection = new Set();
    }, { history: true, reason: 'duplicate' });
    store.emit('selection');
  }

  groupSelection() {
    const nodes = store.selectedNodes().filter((n) => n.type !== 'group');
    if (nodes.length < 1) return;
    const b = selectionBounds(nodes);
    const group = createNode(
      'group',
      { x: b.x - 24, y: b.y - 54 },
      { label: `编组 · ${nodes.length} 个节点` },
      { w: b.w + 48, h: b.h + 78, z: 0 },
    );
    store.transaction((s) => {
      s.nodes.unshift(group);
      s.selection = new Set([group.id]);
    }, { history: true, reason: 'group' });
    store.emit('selection');
  }

  ungroup() {
    const group = store.selectedNodes().find((n) => n.type === 'group');
    if (!group) return;
    store.transaction((s) => {
      s.nodes = s.nodes.filter((n) => n.id !== group.id);
      s.selection = new Set(this.containedNodes(group).map((n) => n.id));
    }, { history: true, reason: 'ungroup' });
  }

  align(mode) {
    const nodes = store.selectedNodes();
    if (nodes.length < 2) {
      store.emit('toast', '至少选中两个节点才能对齐');
      return;
    }
    const b = selectionBounds(nodes);
    const dims = new Map(nodes.map((n) => [n.id, this.dimsOf(n)]));
    store.transaction((s) => {
      for (const node of s.nodes) {
        if (!store.selection.has(node.id)) continue;
        const d = dims.get(node.id);
        if (!d) continue;
        if (mode === 'left') node.x = b.x;
        if (mode === 'right') node.x = b.right - d.w;
        if (mode === 'hcenter') node.x = b.x + (b.w - d.w) / 2;
        if (mode === 'top') node.y = b.y;
        if (mode === 'bottom') node.y = b.bottom - d.h;
        if (mode === 'vcenter') node.y = b.y + (b.h - d.h) / 2;
      }
      if (mode === 'distribute-h') {
        const sorted = s.nodes.filter((n) => store.selection.has(n.id)).sort((a, c) => a.x - c.x);
        if (sorted.length > 2) {
          const total = b.w - sorted.reduce((acc, n) => acc + (dims.get(n.id)?.w || 0), 0);
          const gap = total / (sorted.length - 1);
          let cursor = b.x;
          for (const n of sorted) {
            n.x = Math.round(cursor);
            cursor += (dims.get(n.id)?.w || 0) + gap;
          }
        }
      }
      if (mode === 'distribute-v') {
        const sorted = s.nodes.filter((n) => store.selection.has(n.id)).sort((a, c) => a.y - c.y);
        if (sorted.length > 2) {
          const total = b.h - sorted.reduce((acc, n) => acc + (dims.get(n.id)?.h || 0), 0);
          const gap = total / (sorted.length - 1);
          let cursor = b.y;
          for (const n of sorted) {
            n.y = Math.round(cursor);
            cursor += (dims.get(n.id)?.h || 0) + gap;
          }
        }
      }
    }, { history: true, reason: 'align' });
    store.emit('toast', '已对齐');
  }

  /** group toolbar layouts: horizontal / vertical / grid (recovered groupToolbar.*) */
  layoutGroup(group, mode) {
    const children = this.containedNodes(group);
    if (!children.length) return;
    const pad = 40;
    const gap = 32;
    const dims = new Map(children.map((n) => [n.id, this.dimsOf(n)]));
    const gx = group.x + pad;
    const gy = group.y + 62 + pad / 2;
    let width = 0;
    let height = 0;
    const positions = new Map();
    if (mode === 'horizontal') {
      let x = gx;
      for (const n of children) {
        const d = dims.get(n.id);
        positions.set(n.id, { x, y: gy });
        x += d.w + gap;
        width = x - gx - gap;
        height = Math.max(height, d.h);
      }
    } else if (mode === 'vertical') {
      let y = gy;
      for (const n of children) {
        const d = dims.get(n.id);
        positions.set(n.id, { x: gx, y });
        y += d.h + gap;
        height = y - gy - gap;
        width = Math.max(width, d.w);
      }
    } else {
      const cols = Math.max(1, Math.ceil(Math.sqrt(children.length)));
      const colWidths = new Array(cols).fill(0);
      children.forEach((n, i) => {
        const c = i % cols;
        colWidths[c] = Math.max(colWidths[c], dims.get(n.id).w);
      });
      let y = gy;
      const rows = Math.ceil(children.length / cols);
      for (let r = 0; r < rows; r++) {
        let x = gx;
        let rowH = 0;
        for (let c = 0; c < cols; c++) {
          const n = children[r * cols + c];
          if (!n) continue;
          const d = dims.get(n.id);
          positions.set(n.id, { x, y });
          rowH = Math.max(rowH, d.h);
          x += colWidths[c] + gap;
        }
        y += rowH + gap;
        height = y - gy - gap;
      }
      width = colWidths.reduce((a, b) => a + b, 0) + gap * (cols - 1);
    }
    store.transaction((s) => {
      for (const n of s.nodes) {
        const pos = positions.get(n.id);
        if (pos) {
          n.x = Math.round(pos.x);
          n.y = Math.round(pos.y);
        }
      }
      const g = s.nodes.find((x) => x.id === group.id);
      if (g) {
        g.w = Math.round(width + pad * 2);
        g.h = Math.round(height + 62 + pad);
      }
    }, { history: true, reason: 'group-layout' });
  }

  /** "整理画布" — pack nodes into a readable left-to-right flow. */
  tidy() {
    const nodes = store.nodes.filter((n) => n.type !== 'group');
    if (!nodes.length) return;
    const order = [...nodes].sort((a, b) => a.x - b.x || a.y - b.y);
    const cols = Math.min(order.length, Math.max(2, Math.ceil(Math.sqrt(order.length * 1.2))));
    const gapX = 96;
    const gapY = 72;
    const colWidths = new Array(cols).fill(0);
    const colItems = Array.from({ length: cols }, () => []);
    order.forEach((node, i) => {
      const col = Math.floor(i / Math.ceil(order.length / cols));
      const c = Math.min(cols - 1, col);
      colItems[c].push(node);
      colWidths[c] = Math.max(colWidths[c], this.dimsOf(node).w);
    });
    const startX = 0;
    const startY = 0;
    const positions = new Map();
    let x = startX;
    colItems.forEach((items, c) => {
      let y = startY;
      for (const node of items) {
        positions.set(node.id, { x: Math.round(x), y: Math.round(y) });
        y += this.dimsOf(node).h + gapY;
      }
      x += colWidths[c] + gapX;
    });
    store.transaction((s) => {
      for (const node of s.nodes) {
        const pos = positions.get(node.id);
        if (pos) {
          node.x = pos.x;
          node.y = pos.y;
        }
      }
      for (const g of s.nodes.filter((n) => n.type === 'group')) {
        const contained = this.containedNodes(g);
        if (contained.length) {
          const b = selectionBounds(contained);
          g.x = b.x - 24;
          g.y = b.y - 54;
          g.w = b.w + 48;
          g.h = b.h + 78;
        }
      }
    }, { history: true, reason: 'tidy' });
    requestAnimationFrame(() => this.vp.fitView({ padding: 90, maxZoom: 0.9 }));
    store.emit('toast', '画布已整理');
  }

  /** enqueue a generation job (local queue, sequential) */
  runNode(id, { confirmed = false } = {}) {
    const node = store.getNode(id);
    if (!node) return;
    if (node.data?.status === 'running') return;
    const videoLike = ['video', 'video-gen'].includes(node.type);
    if (videoLike && store.state.settings.useApi && api.state.online && store.state.settings.confirmVideo && !confirmed) {
      store.emit('confirm-video', { id, title: nodeTitle(node) });
      return null;
    }
    const job = enqueueJob(id, nodeTitle(node));
    store.transaction((s) => {
      const n = s.nodes.find((x) => x.id === id);
      if (n) n.data = { ...n.data, status: 'queued' };
    }, { history: false, reason: 'queue-status' });
    this.pumpQueue();
    return job;
  }

  async pumpQueue() {
    if (this._pumping) return;
    this._pumping = true;
    while (true) {
      const job = store.state.queue.find((j) => j.status === 'queued');
      if (!job) break;
      const node = store.getNode(job.nodeId);
      if (!node) {
        updateJob(job.id, { status: 'error', finishedAt: Date.now() });
        continue;
      }
      const controller = new AbortController();
      this._abortControllers = this._abortControllers || new Map();
      this._abortControllers.set(job.id, controller);
      updateJob(job.id, { status: 'running', startedAt: Date.now(), progress: 0 });
      try {
        await this.runNodeNow(job.nodeId, job.id, controller.signal);
        updateJob(job.id, { status: 'done', finishedAt: Date.now(), progress: 100 });
      } catch (err) {
        const cancelled = controller.signal.aborted || err?.message === '已取消';
        updateJob(job.id, { status: cancelled ? 'cancelled' : 'error', finishedAt: Date.now(), error: err?.message || String(err) });
        if (!cancelled) store.emit('toast', `生成失败：${err?.message || err}`, 'error');
      } finally {
        this._abortControllers?.delete(job.id);
      }
    }
    this._pumping = false;
  }

  cancelJob(jobId) {
    const job = store.state.queue.find((j) => j.id === jobId);
    if (!job) return;
    if (job.status === 'running') {
      this._cancelledJobs = this._cancelledJobs || new Set();
      this._cancelledJobs.add(job.id);
      this._abortControllers?.get(job.id)?.abort();
      updateJob(job.id, { status: 'cancelled', finishedAt: Date.now() });
      store.transaction((s) => {
        const n = s.nodes.find((x) => x.id === job.nodeId);
        if (n) n.data = { ...n.data, status: 'idle' };
      }, { history: false, reason: 'cancel' });
    } else {
      updateJob(jobId, { status: 'cancelled', finishedAt: Date.now() });
    }
  }

  async runNodeNow(id, jobId, signal) {
    const node = store.getNode(id);
    if (!node) return;
    const params = nodeParams(node);
    const apiMode = store.state.settings.useApi && api.state.online;
    if (apiMode && this.isApiNode(node)) {
      if (!params.model) throw new Error('请先在参数面板选择模型');
      const expected = api.state.meta?.[params.model]?.kind;
      const kindMap = { image: 'image', 'image-gen': 'image', video: 'video', 'video-gen': 'video', llm: 'text', audio: 'audio' };
      const want = kindMap[node.type];
      if (expected && want && expected !== want) {
        throw new Error(`模型 ${params.model} 是「${expected}」类模型，不能用于当前节点（需要 ${want} 类）`);
      }
      return this.runViaApi(node, params, jobId, signal);
    }
    return this.runLocal(id, jobId);
  }

  isApiNode(node) {
    return ['image', 'image-gen', 'video', 'video-gen', 'llm', 'audio'].includes(node.type);
  }

  setJobProgress(jobId, progress) {
    if (jobId) updateJob(jobId, { progress: Math.round(progress) });
  }

  /** pick upstream media for reference / first-frame */
  async upstreamImages(node) {
    const sources = store.edges.filter((e) => e.target === node.id).map((e) => store.getNode(e.source)).filter(Boolean);
    const urls = [];
    for (const src of sources.slice(0, 2)) {
      const media = nodeMainMedia(src) || src.data?.poster || '';
      if (!media) continue;
      if (media.startsWith('data:')) {
        try {
          urls.push(await api.uploadImage(media));
        } catch {}
      } else if (/^https?:/.test(media)) {
        urls.push(media);
      }
    }
    return urls;
  }

  async runViaApi(node, params, jobId, signal) {
    const status = (s) => store.transaction((st) => {
      const n = st.nodes.find((x) => x.id === node.id);
      if (n) n.data = { ...n.data, status: s };
    }, { history: false, reason: 'api-status' });

    status('running');
    try {
      if (node.type === 'llm') {
        const messages = [{ role: 'system', content: '你是 AI 视频创作助手，请用简体中文回答，输出可直接用于分镜/提示词的内容。' }];
        const upstreamText = store.edges
          .filter((e) => e.target === node.id)
          .map((e) => store.getNode(e.source))
          .filter(Boolean)
          .map((n) => n.data?.text || n.data?.prompt || '')
          .join('\n');
        const context = upstreamText ? `\n\n上下文：\n${upstreamText}` : '';
        messages.push({ role: 'user', content: `${node.data?.prompt || ''}${context}`.trim() });
        const data = await api.chat({
          model: params.model,
          messages,
          temperature: Number(params.temperature) || 0.7,
          max_tokens: Number(params.maxTokens) || 512,
          signal,
        });
        const content = data?.choices?.[0]?.message?.content || '';
        store.transaction((st) => {
          const n = st.nodes.find((x) => x.id === node.id);
          if (n) n.data = { ...n.data, status: 'success', text: content };
        }, { history: true, reason: 'api-llm' });
        pushNodeHistory(node.id, { media: '', prompt: node.data?.prompt || '', model: params.model, kind: 'text' });
        store.emit('toast', '文本生成完成', 'success');
        return;
      }

      if (node.type === 'audio') {
        const media = await api.speech({
          model: params.model || 'tts-1',
          input: node.data?.prompt || node.data?.text || '这是一段测试语音。',
          voice: params.voice || 'alloy',
          speed: Number(params.speed) || 1,
        });
        store.transaction((st) => {
          const n = st.nodes.find((x) => x.id === node.id);
          if (n) n.data = { ...n.data, status: 'success', media, duration: '' };
        }, { history: true, reason: 'api-tts' });
        pushNodeHistory(node.id, { media, prompt: node.data?.prompt || '', model: params.model || 'tts-1', kind: 'audio' });
        store.emit('toast', '语音生成完成', 'success');
        return;
      }

      if (node.type === 'video' || node.type === 'video-gen') {
        const imageUrls = await this.upstreamImages(node);
        const taskId = await api.submitVideo({
          model: params.model,
          prompt: node.data?.prompt || '',
          size: params.ratio || '16:9',
          resolution: params.resolution || '720p',
          duration: Number(params.duration) || 5,
          seed: params.seed,
          image_urls: imageUrls.length ? imageUrls : undefined,
        });
        store.emit('toast', `视频任务已提交：${taskId.slice(0, 12)}…`);
        const task = await api.waitTask(taskId, {
          signal,
          onProgress: (pct, st) => this.setJobProgress(jobId, pct || (st === 'processing' ? 15 : 5)),
        });
        const urls = api.extractMedia(task);
        const videoUrl = urls[0] || '';
        const poster = node.data?.poster || generatedImage(`${node.data?.label || 'video'}-poster`, 'video', { ratio: params.ratio, resolution: params.resolution });
        store.transaction((st) => {
          const n = st.nodes.find((x) => x.id === node.id);
          if (n) n.data = { ...n.data, status: 'success', media: videoUrl, poster, duration: `${params.duration}s` };
        }, { history: true, reason: 'api-video' });
        pushNodeHistory(node.id, {
          media: videoUrl,
          poster,
          prompt: node.data?.prompt || '',
          model: params.model,
          seed: String(task?.result?.seed || params.seed || ''),
          kind: 'video',
        });
        store.emit('toast', '视频生成完成', 'success');
        return;
      }

      // image / image-gen
      const imageUrls = await this.upstreamImages(node);
      const count = Math.min(4, Math.max(1, Number(params.count) || 1));
      const baseSeed = Number(params.seed) >= 0 ? Number(params.seed) : undefined;
      const results = [];
      for (let i = 0; i < count; i++) {
        this.setJobProgress(jobId, (i / count) * 100);
        const taskId = await api.submitImage({
          model: params.model,
          prompt: node.data?.prompt || '',
          size: params.ratio && params.ratio !== 'smart' ? params.ratio : '1:1',
          resolution: params.resolution || '1K',
          seed: baseSeed != null ? baseSeed + i : undefined,
          negative_prompt: params.negative || undefined,
          image_urls: imageUrls.length ? imageUrls : undefined,
        });
        const task = await api.waitTask(taskId, {
          signal,
          onProgress: (pct, st) => this.setJobProgress(jobId, ((i + (pct || 10) / 100) / count) * 100),
        });
        const url = api.extractMedia(task)[0] || '';
        if (url) results.push({ url, seed: baseSeed != null ? baseSeed + i : task?.result?.seed, model: params.model });
      }
      if (!results.length) throw new Error('接口未返回图片 URL');
      store.transaction((st) => {
        const n = st.nodes.find((x) => x.id === node.id);
        if (n) n.data = { ...n.data, status: 'success', media: results[0].url };
      }, { history: true, reason: 'api-image' });
      for (const r of results) {
        pushNodeHistory(node.id, {
          media: r.url,
          prompt: node.data?.prompt || '',
          model: r.model,
          seed: String(r.seed ?? ''),
          kind: 'image',
        });
      }
      store.emit('toast', `图片生成完成${results.length > 1 ? ` · ${results.length} 张` : ''}`, 'success');
    } catch (err) {
      if (signal?.aborted || err?.message === '已取消') {
        status('idle');
        throw err;
      }
      status('error');
      throw err;
    }
  }

  runLocal(id, jobId) {
    return new Promise((resolve, reject) => {
      const node = store.getNode(id);
      if (!node) return resolve();
      const params = nodeParams(node);
      const setStatus = (status) => {
        store.transaction((s) => {
          const n = s.nodes.find((x) => x.id === id);
          if (n) n.data = { ...n.data, status };
        }, { history: false, reason: 'status' });
      };
      setStatus('running');
      const cancelled = () => {
        if (this._cancelledJobs?.has(jobId)) {
          this._cancelledJobs.delete(jobId);
          return true;
        }
        return false;
      };
      const delay = 1400 + Math.random() * 1200;
      setTimeout(() => {
        if (cancelled()) return resolve();
        const imageLike = ['image', 'image-gen'].includes(node.type);
        const videoLike = ['video', 'video-gen', 'preview-output'].includes(node.type);
        const count = imageLike ? Math.min(4, Math.max(1, Number(params.count) || 1)) : 1;
        const baseSeed = Number(params.seed) >= 0 ? Number(params.seed) : Math.floor(Math.random() * 1e9);
        const generated = [];
        for (let i = 0; i < count; i++) {
          const seed = baseSeed + i;
          const label = `${node.data?.label || node.type}-${seed}`;
          if (imageLike) {
            generated.push({
              media: generatedImage(label, 'image', { ratio: params.ratio, resolution: params.resolution }),
              seed,
              kind: 'image',
            });
          } else if (videoLike) {
            generated.push({
              media: '',
              poster: generatedImage(label, 'video', { ratio: params.ratio || '16:9', resolution: params.resolution }),
              seed,
              kind: 'video',
              duration: params.duration,
            });
          } else {
            generated.push({ media: '', poster: '', seed, kind: node.type });
          }
        }
        store.transaction((s) => {
          const n = s.nodes.find((x) => x.id === id);
          if (!n) return;
          const first = generated[0];
          n.data = {
            ...n.data,
            status: 'success',
            ...(first?.media ? { media: first.media } : {}),
            ...(first?.poster ? { poster: first.poster } : {}),
            params: { ...nodeParams(n), seed: baseSeed },
            ...(videoLike && params.duration ? { duration: `${params.duration}s` } : {}),
          };
        }, { history: true, reason: 'run' });
        for (const item of generated) {
          pushNodeHistory(id, {
            media: item.media,
            poster: item.poster,
            prompt: node.data?.prompt || '',
            model: params.model || 'local-demo',
            seed: String(item.seed),
            kind: item.kind,
            duration: item.duration,
          });
        }
        store.emit('toast', `${nodeTitle(node)} 生成完成${count > 1 ? ` · ${count} 张` : ''}`, 'success');
        resolve();
      }, delay);
    });
  }

  /* ── dot grid (recovered: 20px pattern, 2px dot, follows zoom) ──── */

  drawGrid() {
    const canvas = this.gridCanvas;
    if (!canvas) return;
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (!w || !h) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (store.state.settings.gridVisible === false) return;

    const zoom = this.vp.zoom;
    const spacing = 20 * zoom;
    if (spacing < 6) return;
    // dot radius scales with zoom, exactly like the SVG <pattern> scaled by
    // `translate(1+20z/2) scale(z)` in the original bundle
    const radius = Math.max(0.55, zoom * 1);
    const ox = ((this.vp.v.x % spacing) + spacing) % spacing - spacing;
    const oy = ((this.vp.v.y % spacing) + spacing) % spacing - spacing;
    const color =
      getComputedStyle(document.documentElement).getPropertyValue('--canvas-grid-dot').trim() || '#383838';
    ctx.fillStyle = color;
    const path = new Path2D();
    for (let x = ox; x < w + spacing; x += spacing) {
      for (let y = oy; y < h + spacing; y += spacing) {
        path.moveTo(x + radius, y);
        path.arc(x, y, radius, 0, Math.PI * 2);
      }
    }
    ctx.fill(path);
  }

  /* ── minimap (recovered spec: #121214 shell, rgba(56,56,63,.75) blocks) ── */

  drawMinimap() {
    const canvas = this.minimapCanvas;
    if (!canvas || !canvas.offsetParent) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 220;
    const cssH = canvas.clientHeight || 150;
    if (canvas.width !== Math.round(cssW * dpr)) {
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const nodes = store.nodes;
    const cssVars = getComputedStyle(document.documentElement);
    const viewportColor = cssVars.getPropertyValue('--canvas-minimap-viewport').trim() || 'rgba(255,255,255,.2)';
    if (!nodes.length) {
      // empty board: just show a small viewport outline so the shell isn't blank
      ctx.strokeStyle = viewportColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(cssW * 0.3, cssH * 0.3, cssW * 0.4, cssH * 0.4);
      return;
    }
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const n of nodes) {
      const b = nodeBounds(n);
      x1 = Math.min(x1, b.x);
      y1 = Math.min(y1, b.y);
      x2 = Math.max(x2, b.right);
      y2 = Math.max(y2, b.bottom);
    }
    const pad = 60;
    x1 -= pad;
    y1 -= pad;
    x2 += pad;
    y2 += pad;
    const scale = Math.min(cssW / (x2 - x1), cssH / (y2 - y1));
    const ox = (cssW - (x2 - x1) * scale) / 2;
    const oy = (cssH - (y2 - y1) * scale) / 2;
    const tx = (x) => ox + (x - x1) * scale;
    const ty = (y) => oy + (y - y1) * scale;
    this.minimapTransform = { x1, y1, scale, ox, oy };

    const nodeFill = cssVars.getPropertyValue('--canvas-minimap-node').trim() || 'rgba(56,56,63,.75)';
    const nodeStroke = cssVars.getPropertyValue('--canvas-minimap-stroke').trim() || '#4e4e54';

    ctx.fillStyle = nodeFill;
    ctx.strokeStyle = nodeStroke;
    ctx.lineWidth = 1;
    for (const n of nodes) {
      const b = nodeBounds(n);
      const rw = Math.max(2, b.w * scale);
      const rh = Math.max(2, b.h * scale);
      const rr = Math.min(10 * scale + 1.5, rw / 2, rh / 2);
      roundRect(ctx, tx(b.x), ty(b.y), rw, rh, rr);
      ctx.fill();
      ctx.stroke();
    }

    // viewport outline only (maskColor: transparent — no dimming)
    const vp = this.vp;
    const topLeft = vp.localToFlow(0, 0);
    const bottomRight = vp.localToFlow(vp.size.width, vp.size.height);
    ctx.strokeStyle = viewportColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(tx(topLeft.x), ty(topLeft.y), (bottomRight.x - topLeft.x) * scale, (bottomRight.y - topLeft.y) * scale);
  }

  centerFromMinimap(e) {
    const canvas = this.minimapCanvas;
    const t = this.minimapTransform;
    if (!canvas || !t) return;
    const rect = canvas.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * (canvas.clientWidth || 240);
    const py = ((e.clientY - rect.top) / rect.height) * (canvas.clientHeight || 160);
    const flowX = t.x1 + (px - t.ox) / t.scale;
    const flowY = t.y1 + (py - t.oy) / t.scale;
    this.vp.animateTo({
      x: this.vp.size.width / 2 - flowX * this.vp.zoom,
      y: this.vp.size.height / 2 - flowY * this.vp.zoom,
      zoom: this.vp.zoom,
    }, 200);
  }
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/* helpers used by ui.js */
export function createNodeAt(type, flow, connectFrom) {
  const node = createNode(type, flow);
  store.transaction((s) => {
    s.nodes.push(node);
    const sources = Array.isArray(connectFrom) ? connectFrom : connectFrom ? [connectFrom] : [];
    for (const source of sources) {
      if (s.nodes.some((n) => n.id === source)) s.edges.push(createEdge(source, node.id));
    }
    s.selection = new Set([node.id]);
    s.edgeSelection = new Set();
  }, { history: true, reason: 'add-node' });
  store.emit('selection');
  return node;
}
