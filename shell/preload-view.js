/* MuseNex — 视图工作区桥接 preload
 * 运行在 WebContentsView 内（contextIsolation:false），负责：
 *  - 注入窗口控制、返回主工作区、能力按钮（如“取图”）
 *  - 工作区自定义桥：__museAddImages / __musePullSelected / __museSetTheme
 *  - 主题同步、无边框窗口边缘缩放
 */
const { ipcRenderer, contextBridge } = require('electron');

const WORKSPACE_ID = (() => {
  const arg = (process.argv || []).find((a) => a.startsWith('--muse-workspace='));
  if (arg) return arg.split('=')[1];
  try { return location.hostname; } catch { return ''; }
})();

let workspaceInfo = null; // { current, main, list }

function ready(fn) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
  else fn();
}

function toast(msg, type) {
  try { window.__museViewApi && window.__museViewApi.toast(msg, type); }
  catch {}
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(blob);
  });
}

async function mediaToDataUrl(media) {
  try {
    const r = await fetch(media, { cache: 'no-store' });
    return await blobToDataUrl(await r.blob());
  } catch {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          c.getContext('2d').drawImage(img, 0, 0);
          resolve(c.toDataURL('image/png'));
        } catch (err) { reject(err); }
      };
      img.onerror = reject;
      img.src = media;
    });
  }
}

/* ── 工作区桥（供外壳调用） ─────────────────────────────────────────── */

window.__museAddImages = async function (items) {
  const api = window.__canvas;
  if (!api) throw new Error('工作区尚未就绪');
  const files = [];
  for (const it of items) {
    const blob = await (await fetch(it.dataUrl)).blob();
    files.push(new File([blob], it.name || `reference-${Date.now()}.png`, { type: blob.type || 'image/png' }));
  }
  api.store.emit('drop-files', { files, flow: api.canvas.vp.centerFlow() });
  return files.length;
};

window.__musePullSelected = async function () {
  const api = window.__canvas;
  if (!api) return [];
  const nodes = [...api.store.state.selection]
    .map((id) => api.store.state.nodes.find((n) => n.id === id))
    .filter(Boolean);
  const out = [];
  for (const n of nodes) {
    const media = n.data && n.data.media;
    if (!media) continue;
    try {
      out.push({
        name: `${(n.data.label || n.type || 'workspace').replace(/[\\/:*?"<>|]/g, '_')}.png`,
        dataUrl: await mediaToDataUrl(media),
      });
    } catch {
      toast('该节点媒体无法导出（可能是远程资源）', 'error');
    }
  }
  return out;
};

window.__museSetTheme = function (theme) {
  try {
    const t = theme === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = t;
    localStorage.setItem('infinite-canvas:theme', t);
    const api = window.__canvas;
    if (api && api.store && api.store.state && api.store.state.settings) {
      api.store.state.settings.theme = t;
      if (api.ui && api.ui.applyTheme) api.ui.applyTheme(t);
    }
  } catch {}
};

// 兼容旧命名
window.__prcyqAddImages = window.__museAddImages;
window.__prcyqPullSelected = window.__musePullSelected;
window.__prcyqSetBoardTheme = window.__museSetTheme;

/* ── 注入 UI ──────────────────────────────────────────────────────── */

function injectStyles() {
  if (document.getElementById('muse-style')) return;
  const style = document.createElement('style');
  style.id = 'muse-style';
  style.textContent = `
    .canvas-header, .canvas-header-gradient { -webkit-app-region: drag; }
    .canvas-header button, .canvas-header input, .canvas-header .menu-wrap,
    .canvas-header .api-chip, .muse-traffic { -webkit-app-region: no-drag; }
    .muse-traffic { display:flex; align-items:center; gap:8px; margin-right:8px; }
    .muse-traffic button { width:12px; height:12px; border-radius:50%; padding:0; border:none; cursor:pointer; }
    .muse-traffic button:hover { filter: brightness(1.2); }
    .muse-traffic .c-close { background:#ff5f57; }
    .muse-traffic .c-min { background:#febc2e; }
    .muse-traffic .c-max { background:#28c840; }
    .muse-ws-btn { display:inline-flex; align-items:center; justify-content:center; gap:6px; width:30px; padding:0; }
    .muse-ws-btn svg { width:15px; height:15px; fill:none; stroke:currentColor; stroke-width:1.7; stroke-linecap:round; stroke-linejoin:round; }
    .muse-ws-btn .ws-arrow { font-size:14px; line-height:1; }
    .muse-flash { animation: museFlash .6s ease; }
    @keyframes museFlash { 0%{ box-shadow:0 0 0 0 rgba(46,132,170,.6);} 100%{ box-shadow:0 0 0 12px rgba(46,132,170,0);} }
  `;
  document.head.appendChild(style);
}

function makeBtn(html, title, onClick) {
  const b = document.createElement('button');
  b.className = 'canvas-ctrl muse-ws-btn';
  b.title = title;
  b.innerHTML = html;
  b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
  return b;
}

async function loadWorkspaceInfo() {
  try {
    const list = await ipcRenderer.invoke('workspace:list');
    workspaceInfo = {
      list,
      current: list.find((w) => w.id === WORKSPACE_ID) || null,
      main: list.find((w) => w.main) || list[0],
    };
  } catch {}
  return workspaceInfo;
}

function injectUi() {
  const header = document.querySelector('.canvas-header');
  if (!header) return false;
  if (!workspaceInfo) return false;
  if (document.getElementById('muse-traffic')) return true;

  const left = header.querySelector('.canvas-header__left');
  if (left) {
    const traffic = document.createElement('div');
    traffic.className = 'muse-traffic';
    traffic.id = 'muse-traffic';
    const mk = (cls, title, action) => {
      const b = document.createElement('button');
      b.className = cls;
      b.title = title;
      b.addEventListener('click', (e) => { e.stopPropagation(); ipcRenderer.invoke('view:win', action); });
      return b;
    };
    traffic.appendChild(mk('c-close', '关闭', 'close'));
    traffic.appendChild(mk('c-min', '最小化', 'minimize'));
    traffic.appendChild(mk('c-max', '最大化', 'maximize'));
    left.insertBefore(traffic, left.firstChild);
  }

  const right = header.querySelector('.canvas-header__right');
  if (right) {
    const main = workspaceInfo.main;
    const backBtn = makeBtn('<span class="ws-arrow">←</span>', `返回${main.name}（${main.shortcut || '⌘1'}）`, () => ipcRenderer.invoke('view:show-main'));
    let html = '';
    const caps = (workspaceInfo.current && workspaceInfo.current.capabilities) || [];
    if (caps.includes('pullImages')) {
      const pullBtn = makeBtn(
        '<svg viewBox="0 0 24 24"><path d="M12 4v12M7 11l5 5 5-5M5 20h14"/></svg>',
        `把选中的图片发送到${main.name}`,
        async () => {
          const items = await window.__musePullSelected();
          if (!items.length) return toast('请先选中含图片的节点', 'error');
          ipcRenderer.send('view:pulled-images', items);
          pullBtn.classList.add('muse-flash');
          setTimeout(() => pullBtn.classList.remove('muse-flash'), 700);
          toast(`已发送 ${items.length} 张图片到${main.name}`);
        }
      );
      right.insertBefore(pullBtn, right.firstChild);
    }
    right.insertBefore(backBtn, right.firstChild);
  }

  if (!sessionStorage.getItem('muse:view-hint')) {
    sessionStorage.setItem('muse:view-hint', '1');
    setTimeout(() => toast(`工作区：${workspaceInfo.current ? workspaceInfo.current.name : ''} · 左上角 ← 返回${workspaceInfo.main.name}`, 'success'), 600);
  }

  header.addEventListener('dblclick', (e) => {
    if (e.target.closest('button, input, .menu-wrap')) return;
    ipcRenderer.invoke('view:win', 'maximize');
  });
  return true;
}

/* ── 无边框窗口边缘缩放 ──────────────────────────────────────────── */

function initEdgeResize() {
  const edgeAt = (x, y) => {
    const m = 7;
    let e = '';
    if (y <= m) e += 'n';
    if (y >= window.innerHeight - m) e += 's';
    if (x <= m) e += 'w';
    if (x >= window.innerWidth - m) e += 'e';
    return e || null;
  };
  const cursorFor = (e) => ({
    n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize',
    ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize',
  }[e] || '');

  let active = null;
  document.addEventListener('pointermove', (e) => {
    if (active) return;
    document.body.style.cursor = cursorFor(edgeAt(e.clientX, e.clientY));
  }, true);

  document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const edge = edgeAt(e.clientX, e.clientY);
    if (!edge) return;
    e.preventDefault();
    e.stopPropagation();
    active = edge;
    ipcRenderer.invoke('view:resize-start', { edge, x: e.screenX, y: e.screenY });
    const move = (ev) => { if (active) ipcRenderer.invoke('view:resize-move', { x: ev.screenX, y: ev.screenY }); };
    const up = () => {
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      document.body.style.cursor = '';
      active = null;
      ipcRenderer.invoke('view:resize-end');
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
  }, true);
}

ready(async () => {
  injectStyles();
  initEdgeResize();
  await loadWorkspaceInfo();
  let tries = 0;
  const timer = setInterval(() => {
    if (injectUi() || ++tries > 40) clearInterval(timer);
  }, 150);
});
