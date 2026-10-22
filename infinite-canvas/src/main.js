/* ============================================================================
 * main.js — bootstrap + global keyboard model.
 *
 * Shortcuts recovered from the RunningHub canvas keydown handler:
 *   ⌘/Ctrl+Z undo · ⇧⌘Z or ⌘Y redo · ⌘F node search · Tab reserved
 *   Esc closes/focus-clears · ⌘C copy · ⌘V paste · ⌘A select all · ⌘G group
 *   ⌘= / ⌘- zoom ±10% · ⌘0 zoom 100% · Space hand-pan · Delete delete
 *   (also: N add node, ⇧1 fit view, ⌘D duplicate, arrow-key nudge)
 * ========================================================================= */

import { Canvas } from './canvas.js';
import { UI } from './ui.js';
import { store } from './store.js';
import { api } from './api.js';

const host = document.querySelector('#canvasHost');

store.restoreSettings();

const canvas = new Canvas(host);
const ui = new UI({ canvas });

/* ── APIMart 连接（经本地代理） ────────────────────────────────────── */
const params = new URLSearchParams(location.search);
if (params.get('api') === '0') store.setSetting('useApi', false);
if (params.get('api') === '1') store.setSetting('useApi', true);

api.init().then(() => {
  ui.refreshApiStatus();
  if (api.state.online) {
    store.emit('toast', `APIMart 已连接 · ${api.state.models.length} 个模型`, 'success');
  }
});

/* ── initial viewport ─────────────────────────────────────────────── */

const savedViewport = store.state.viewport;
const hasSavedDoc = store.restoredFromStorage;

requestAnimationFrame(() => {
  canvas.sync();
  const identity = !savedViewport || (!savedViewport.x && !savedViewport.y && savedViewport.zoom === 1);
  if (hasSavedDoc && !identity) {
    canvas.vp.set(savedViewport);
  } else {
    canvas.vp.fitView({ padding: 90, maxZoom: 1 });
  }
  canvas.onViewportChange();
  // persist the fitted viewport so the next visit reopens exactly here
  setTimeout(() => store.save(), 320);
});

/* ── theme + settings ─────────────────────────────────────────────── */

document.documentElement.dataset.theme = store.state.settings.theme;
document.querySelector('#minimap').hidden = !store.state.settings.minimap;
document.querySelector('#gridBtn').classList.toggle('is-on', store.state.settings.snapGrid);
document.querySelector('#snapBtn').classList.toggle('is-on', store.state.settings.guides);
document.querySelector('#gridToggleBtn').classList.toggle('is-off', !store.state.settings.gridVisible);
document.querySelector('#edgesBtn').classList.toggle('is-off', !!store.state.settings.edgesHidden);
document.querySelector('#canvasHost').dataset.tool = store.state.tool;
const initialTool = document.querySelector(`[data-tool="${store.state.tool}"]`);
if (initialTool) initialTool.classList.add('is-active');

/* ── keyboard model ───────────────────────────────────────────────── */

const isEditable = (target) => {
  if (!target) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable ||
    !!target.closest?.('input, textarea, [contenteditable="true"], [contenteditable=""]')
  );
};

let spaceDown = false;

function setSpace(down) {
  if (spaceDown === down) return;
  spaceDown = down;
  canvas.spaceDown = down;
  host.classList.toggle('is-panning', down && !canvas.interaction);
  host.style.cursor = down ? 'grab' : '';
}

window.addEventListener('keydown', (e) => {
  const editable = isEditable(e.target);
  const mod = e.metaKey || e.ctrlKey;

  // Space = temporary hand tool
  if (e.code === 'Space' && !editable) {
    e.preventDefault();
    setSpace(true);
    return;
  }

  // '?' opens the shortcut sheet (Shift + /)
  if (!editable && e.key === '?') {
    e.preventDefault();
    ui.openShortcuts();
    return;
  }

  // Escape always works
  if (e.key === 'Escape') {
    if (ui.shortcutsEl && !ui.shortcutsEl.hidden) {
      ui.closeShortcuts();
      return;
    }
    if (store.state.settings.annotateMode) {
      store.setSetting('annotateMode', false);
      return;
    }
    if (ui.apiPanel && !ui.apiPanel.hidden) {
      ui.openApiPanel(false);
      return;
    }
    if (ui.previewEl) {
      ui.closePreview();
      return;
    }
    if (ui.paramBar && !ui.paramBar.hidden) {
      ui.closeParamBar();
      return;
    }
    if (ui.assetLibrary && !ui.assetLibrary.hidden) {
      ui.toggleAssetLibrary(false);
      return;
    }
    if (ui.historyOverlay) {
      ui.closeHistoryOverlay();
      return;
    }
    if (ui.nodeManager && !ui.nodeManager.hidden) {
      ui.toggleNodeManager(false);
      return;
    }
    const searchOpen = !document.querySelector('#nodeSearch').hidden;
    if (searchOpen) {
      ui.closeNodeSearch();
      return;
    }
    if (!document.querySelector('#addPanel').hidden) {
      e.preventDefault();
      ui.closeAddPanel();
      return;
    }
    if (!document.querySelector('#contextMenu').hidden || !document.querySelector('#alignMenu').hidden) {
      document.querySelector('#contextMenu').hidden = true;
      document.querySelector('#alignMenu').hidden = true;
      return;
    }
    store.clearSelection();
    return;
  }

  if (editable) return;

  const readonly = !!store.state.settings.readMode;

  // undo / redo
  if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
    e.preventDefault();
    store.undo();
    return;
  }
  if ((mod && e.shiftKey && e.key.toLowerCase() === 'z') || (mod && e.key.toLowerCase() === 'y')) {
    e.preventDefault();
    store.redo();
    return;
  }
  if (mod && e.key.toLowerCase() === 'f') {
    e.preventDefault();
    ui.openNodeSearch();
    return;
  }
  if (mod && e.key.toLowerCase() === 'c') {
    e.preventDefault();
    ui.copy();
    return;
  }
  if (mod && e.key.toLowerCase() === 'v') {
    e.preventDefault();
    ui.paste();
    return;
  }
  if (mod && e.key.toLowerCase() === 'a') {
    e.preventDefault();
    store.selectAll();
    return;
  }
  if (mod && e.key.toLowerCase() === 'g') {
    e.preventDefault();
    if (!readonly) canvas.groupSelection();
    return;
  }
  if (mod && e.key.toLowerCase() === 'd') {
    e.preventDefault();
    if (!readonly) canvas.duplicateSelection();
    return;
  }
  if (mod && e.key.toLowerCase() === 's') {
    e.preventDefault();
    ui.exportJSON();
    return;
  }
  if (mod && (e.key === '=' || e.key === '+')) {
    e.preventDefault();
    canvas.vp.zoomByPercent(0.1);
    return;
  }
  if (mod && e.key === '-') {
    e.preventDefault();
    canvas.vp.zoomByPercent(-0.1);
    return;
  }
  if (mod && e.key === '0') {
    e.preventDefault();
    canvas.vp.resetZoom();
    return;
  }
  if (e.key === 'Tab') {
    // keep keyboard focus inside the canvas, like React Flow does
    e.preventDefault();
    return;
  }
  if (e.key === ' ' && !editable) {
    e.preventDefault();
    return;
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (store.state.settings.annotateMode && canvas.selectedAnnotationId) {
      e.preventDefault();
      canvas.deleteSelectedAnnotation();
      return;
    }
    e.preventDefault();
    if (!readonly) store.removeSelection();
    return;
  }
  if (!mod && e.key.toLowerCase() === 'v') {
    store.setTool('select');
    return;
  }
  if (!mod && e.key.toLowerCase() === 'h') {
    store.setTool('hand');
    return;
  }
  if (!mod && e.key.toLowerCase() === 'n') {
    e.preventDefault();
    if (!readonly) ui.openAddPanel();
    return;
  }
  if (!mod && e.shiftKey && e.key === '1') {
    e.preventDefault();
    canvas.vp.fitView();
    return;
  }
  if (!mod && (e.key === 'p' || e.key === 'P')) {
    const sel = store.selectedNodes()[0];
    if (sel) {
      e.preventDefault();
      ui.openParamBar(sel.id);
    }
    return;
  }
  if (mod && e.key === 'Enter') {
    const sel = store.selectedNodes()[0];
    if (sel && !readonly) {
      e.preventDefault();
      canvas.runNode(sel.id);
    }
    return;
  }
  if (!mod && (e.key === 'f' || e.key === 'F')) {
    const sel = store.selectedNodes()[0];
    if (sel) canvas.vp.focusNode(sel);
    return;
  }
  if (e.key.startsWith('Arrow')) {
    const nodes = store.selectedNodes();
    if (!nodes.length) return;
    e.preventDefault();
    const step = e.shiftKey ? 10 : 1;
    const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
    const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
    store.transaction((s) => {
      for (const n of s.nodes) {
        if (!store.selection.has(n.id)) continue;
        n.x += dx;
        n.y += dy;
      }
    }, { history: true, reason: 'nudge', coalesce: true });
  }
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') setSpace(false);
});

window.addEventListener('blur', () => setSpace(false));

/* ── paste from OS clipboard ──────────────────────────────────────── */

document.addEventListener('paste', async (e) => {
  if (isEditable(e.target)) return;
  const files = [...(e.clipboardData?.files || [])];
  if (files.length) {
    e.preventDefault();
    if (!store.state.settings.readMode) store.emit('drop-files', { files, flow: canvas.vp.centerFlow() });
    return;
  }
  const text = e.clipboardData?.getData('text/plain');
  if (!text) return;
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed.nodes)) {
      e.preventDefault();
      ui.clipboard = parsed;
      ui.paste(canvas.vp.centerFlow());
    }
  } catch {
    /* plain text paste — ignore or create a text node */
    if (text.length > 1 && text.length < 4000) {
      e.preventDefault();
      const flow = canvas.vp.centerFlow();
      import('./store.js').then(({ createNode }) => {
        const node = createNode('text', { x: Math.round(flow.x), y: Math.round(flow.y) }, { text });
        store.transaction((s) => {
          s.nodes.push(node);
          s.selection = new Set([node.id]);
        }, { history: true, reason: 'paste-text' });
      });
    }
  }
});

/* ── viewport cursor feedback ─────────────────────────────────────── */

// chain the canvas' own viewport reaction, then update the zoom pill
const canvasViewportReaction = canvas.vp.onChange;
canvas.vp.onChange = (v) => {
  canvasViewportReaction(v);
  ui.syncZoomUi(v.zoom);
};

/* ── persistence on exit ──────────────────────────────────────────── */

window.addEventListener('beforeunload', () => {
  try {
    store.save();
  } catch {}
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') store.save();
});

// debug handle (mirrors the original canvas_debug surface)
window.__canvas = { store, canvas, ui, api };
