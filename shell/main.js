// MuseNex — 统一 Electron 外壳
// 职责：应用窗口、工作区（workspace）注册与切换、本地协议、菜单、IPC、场景容器
const { app, BrowserWindow, Menu, ipcMain, dialog, clipboard, nativeImage, shell, protocol, WebContentsView } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fsp = fs.promises;
const os = require('node:os');

// ---------- 工程根与工作区清单 ----------
const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'muse.config.json');
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
const APP_NAME = config.app.name || 'MuseNex';
const SCENE_EXT = 'prcyq';
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.map': 'application/json',
};

const workspaces = (config.workspaces || []).map((w) => Object.assign({}, w, {
  dirAbs: path.join(ROOT, w.dir),
  preloadAbs: w.preload ? path.join(ROOT, w.preload) : null,
}));
const mainWorkspace = workspaces.find((w) => w.id === config.mainWorkspace) || workspaces[0];
if (!mainWorkspace) throw new Error('muse.config.json 缺少 mainWorkspace 或 workspaces');

function wsById(id) { return workspaces.find((w) => w.id === id) || null; }

protocol.registerSchemesAsPrivileged([{
  scheme: 'musenex',
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
}]);

app.setName(APP_NAME);

// ---------- 运行时状态 ----------
let mainWindow = null;
let settingsCache = null;
let winMoveState = null;
let pendingOpenPath = null;
let currentWorkspaceId = mainWorkspace.id;
const viewCache = new Map(); // wsId -> { view, ready, attached }
let viewResizeState = null;
let apiConfigCache = null;

const MAGIC = 'PRCYQ1\n';

// ---------- 旧版本数据迁移 ----------
function migrateLegacyData() {
  try {
    const legacy = path.join(app.getPath('appData'), 'PureRef-CYQ');
    const target = app.getPath('userData');
    fs.mkdirSync(target, { recursive: true });
    for (const f of ['settings.json', 'canvas-config.json', 'autosave.prcyq']) {
      const from = path.join(legacy, f);
      const to = path.join(target, f);
      if (fs.existsSync(from) && !fs.existsSync(to)) fs.copyFileSync(from, to);
    }
  } catch {}
}

// ---------- 设置 ----------
function settingsPath() { return path.join(app.getPath('userData'), 'settings.json'); }
function loadSettings() {
  if (settingsCache) return settingsCache;
  try { settingsCache = JSON.parse(fs.readFileSync(settingsPath(), 'utf8')); }
  catch { settingsCache = {}; }
  return settingsCache;
}
function saveSettings(patch) {
  settingsCache = Object.assign({}, loadSettings(), patch || {});
  try {
    fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
    fs.writeFileSync(settingsPath(), JSON.stringify(settingsCache, null, 2));
  } catch {}
  return settingsCache;
}

// ---------- 场景容器（.prcyq） ----------
function packScene(header, blobs) {
  const metas = (header.images || []).map((m) => Object.assign({}, m));
  let offsets = metas.map(() => 0);
  let jsonBuf = Buffer.alloc(0);
  for (let iter = 0; iter < 6; iter++) {
    const json = JSON.parse(JSON.stringify(header));
    json.images = metas.map((m, i) => Object.assign({}, m, { offset: offsets[i], length: (blobs[m.id] || Buffer.alloc(0)).length }));
    jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
    const base = MAGIC.length + 4 + jsonBuf.length;
    let off = base;
    const next = json.images.map((m) => { const o = off; off += m.length; return o; });
    if (next.every((v, i) => v === offsets[i])) break;
    offsets = next;
  }
  const head = Buffer.alloc(MAGIC.length + 4);
  head.write(MAGIC, 0, 'utf8');
  head.writeUInt32BE(jsonBuf.length, MAGIC.length);
  const parts = [head, jsonBuf];
  for (const m of metas) parts.push(blobs[m.id] || Buffer.alloc(0));
  return Buffer.concat(parts);
}

function unpackScene(buf) {
  if (buf.length < MAGIC.length + 4) throw new Error('文件过小');
  if (buf.subarray(0, MAGIC.length).toString('utf8') !== MAGIC) {
    if (buf.subarray(0, 4).toString('hex') === '00000006') {
      throw new Error('这是 PureRef 原生 .pur 文件，MuseNex 参考板不能直接读取，请改用图片导入。');
    }
    throw new Error('不是有效的 MuseNex 场景文件');
  }
  const headerLen = buf.readUInt32BE(MAGIC.length);
  const start = MAGIC.length + 4;
  const header = JSON.parse(buf.subarray(start, start + headerLen).toString('utf8'));
  const images = {};
  for (const img of header.images || []) {
    if (typeof img.offset !== 'number') continue;
    images[img.id] = buf.subarray(img.offset, img.offset + img.length);
  }
  return { header, images };
}

// ---------- 工作区：本地协议 musenex://<id>/... ----------
function workspaceApiConfig(ws) {
  const p = ws.apiProxy;
  if (!p) return null;
  if (apiConfigCache && apiConfigCache.wsId === ws.id) return apiConfigCache;
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), p.configFile || 'canvas-config.json'), 'utf8')); } catch {}
  apiConfigCache = {
    wsId: ws.id,
    apiKey: process.env[p.envKey || ''] || cfg.apiKey || '',
    baseUrl: (process.env[p.envBase || ''] || cfg.baseUrl || p.baseUrlDefault || '').replace(/\/$/, ''),
  };
  return apiConfigCache;
}

async function proxyWorkspaceApi(request, url, ws) {
  const cfg = workspaceApiConfig(ws);
  const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
    status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
  if (!cfg || !cfg.baseUrl) return json({ error: { message: '该工作区未配置 API 代理' } }, 500);
  if (url.pathname === '/api/health') {
    let models = 0, ok = false;
    try {
      const r = await fetch(cfg.baseUrl + '/models', {
        headers: cfg.apiKey ? { authorization: 'Bearer ' + cfg.apiKey } : {},
        signal: AbortSignal.timeout(10000),
      });
      ok = r.ok;
      if (r.ok) { const d = await r.json(); models = Array.isArray(d.data) ? d.data.length : 0; }
    } catch {}
    return json({
      ok, hasKey: !!cfg.apiKey, base: cfg.baseUrl, models,
      keySource: process.env[ws.apiProxy.envKey || 'APIMART_API_KEY'] ? 'env' : cfg.apiKey ? (ws.apiProxy.configFile || 'canvas-config.json') : 'none',
    });
  }
  try {
    const method = request.method || 'GET';
    const headers = { accept: 'application/json' };
    if (cfg.apiKey) headers.authorization = 'Bearer ' + cfg.apiKey;
    let body;
    if (method !== 'GET' && method !== 'HEAD') {
      body = Buffer.from(await request.arrayBuffer());
      const ct = request.headers.get('content-type');
      if (ct) headers['content-type'] = ct;
    }
    const upstream = cfg.baseUrl + url.pathname.replace(/^\/api/, '') + url.search;
    const r = await fetch(upstream, { method, headers, body, signal: AbortSignal.timeout(180000) });
    const buf = Buffer.from(await r.arrayBuffer());
    const outHeaders = { 'cache-control': 'no-store' };
    const ct = r.headers.get('content-type');
    if (ct) outHeaders['content-type'] = ct;
    return new Response(buf, { status: r.status, headers: outHeaders });
  } catch (err) {
    return json({ error: { message: '上游请求失败：' + (err && err.message ? err.message : err) } }, 502);
  }
}

function setupWorkspaceProtocol() {
  protocol.handle('musenex', async (request) => {
    const url = new URL(request.url);
    const ws = wsById(url.hostname);
    if (!ws) return new Response('unknown workspace', { status: 404 });
    if (url.pathname.startsWith('/api/')) return proxyWorkspaceApi(request, url, ws);
    const base = path.join(ws.dirAbs, ws.webRoot || '');
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/' || rel === '') rel = '/' + (ws.entry || 'index.html');
    const file = path.normalize(path.join(base, rel));
    if (!file.startsWith(base)) return new Response('forbidden', { status: 403 });
    try {
      const data = await fsp.readFile(file);
      return new Response(data, {
        headers: { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' },
      });
    } catch {
      return new Response('404', { status: 404, headers: { 'content-type': 'text/plain' } });
    }
  });
}

// ---------- 工作区：视图管理 ----------
function ensureView(ws) {
  const cached = viewCache.get(ws.id);
  if (cached && !cached.view.webContents.isDestroyed()) return cached;
  const view = new WebContentsView({
    webPreferences: {
      preload: ws.preloadAbs,
      contextIsolation: false,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      additionalArguments: [`--muse-workspace=${ws.id}`],
    },
  });
  view.setBackgroundColor('#0d0d0d');
  const state = { view, ready: false, attached: false };
  view.webContents.on('did-finish-load', () => {
    state.ready = true;
    applyThemeToViews(loadSettings().theme || 'dark');
  });
  view.webContents.loadURL(`musenex://${ws.id}/${ws.entry || 'index.html'}`);
  view.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  view.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(`musenex://${ws.id}/`)) e.preventDefault();
  });
  viewCache.set(ws.id, state);
  return state;
}

function contentBounds() {
  if (!mainWindow) return { x: 0, y: 0, width: 800, height: 600 };
  const b = mainWindow.getContentBounds();
  return { x: 0, y: 0, width: b.width, height: b.height };
}

function layoutCurrentView() {
  if (!mainWindow) return;
  const ws = wsById(currentWorkspaceId);
  if (!ws || ws.id === mainWorkspace.id) return;
  const state = viewCache.get(ws.id);
  if (!state || !state.attached) return;
  try { state.view.setBounds(contentBounds()); } catch {}
}

function applyThemeToViews(theme) {
  const t = theme === 'light' ? 'light' : 'dark';
  for (const state of viewCache.values()) {
    if (!state.ready || state.view.webContents.isDestroyed()) continue;
    state.view.webContents.executeJavaScript(`window.__museSetTheme && window.__museSetTheme(${JSON.stringify(t)})`).catch(() => {});
  }
}

function setWorkspace(id) {
  const ws = wsById(id);
  if (!ws) return currentWorkspaceId;
  if (id !== currentWorkspaceId) {
    const prev = wsById(currentWorkspaceId);
    const prevState = prev && viewCache.get(prev.id);
    if (prevState && prevState.attached && mainWindow) {
      try { mainWindow.contentView.removeChildView(prevState.view); } catch {}
      prevState.attached = false;
    }
  }
  currentWorkspaceId = id;
  saveSettings({ workspace: id });
  if (mainWindow) {
    if (ws.id !== mainWorkspace.id) {
      const state = ensureView(ws);
      if (!state.attached) {
        try { mainWindow.contentView.addChildView(state.view); state.attached = true; } catch {}
      }
      layoutCurrentView();
      setTimeout(() => { try { state.view.webContents.focus(); } catch {} }, 60);
    }
    mainWindow.setTitle(`${APP_NAME} — ${ws.name}`);
    mainWindow.webContents.send('workspace-changed', id);
    rebuildMenu();
  }
  return currentWorkspaceId;
}

function currentViewState() {
  const ws = wsById(currentWorkspaceId);
  if (!ws || ws.id === mainWorkspace.id) return null;
  return viewCache.get(ws.id) || null;
}

function viewStateFor(wsId) {
  const ws = wsById(wsId || currentWorkspaceId);
  if (!ws || ws.id === mainWorkspace.id) return null;
  return ensureView(ws);
}

async function viewAddImages(items, targetId) {
  const state = viewStateFor(targetId);
  if (!state) return { error: '目标工作区不支持图片导入' };
  if (!state.ready) await new Promise((resolve) => { state.view.webContents.once('did-finish-load', resolve); setTimeout(resolve, 8000); });
  return state.view.webContents.executeJavaScript(`window.__museAddImages ? window.__museAddImages(${JSON.stringify(items)}) : Promise.reject(new Error('工作区未实现图片导入'))`);
}

async function viewPullImages(targetId) {
  const state = viewStateFor(targetId);
  if (!state || !state.ready) return [];
  return state.view.webContents.executeJavaScript('window.__musePullSelected ? window.__musePullSelected() : []');
}

function viewResizeStart(payload) {
  if (!mainWindow) return;
  viewResizeState = { edge: payload.edge, x: payload.x, y: payload.y, bounds: mainWindow.getBounds() };
}
function viewResizeMove(payload) {
  if (!viewResizeState || !mainWindow) return;
  const dx = payload.x - viewResizeState.x;
  const dy = payload.y - viewResizeState.y;
  const b = Object.assign({}, viewResizeState.bounds);
  const edge = viewResizeState.edge;
  if (edge.includes('e')) b.width = Math.max(420, viewResizeState.bounds.width + dx);
  if (edge.includes('s')) b.height = Math.max(300, viewResizeState.bounds.height + dy);
  if (edge.includes('w')) {
    const w = Math.max(420, viewResizeState.bounds.width - dx);
    b.x = viewResizeState.bounds.x + (viewResizeState.bounds.width - w);
    b.width = w;
  }
  if (edge.includes('n')) {
    const h = Math.max(300, viewResizeState.bounds.height - dy);
    b.y = viewResizeState.bounds.y + (viewResizeState.bounds.height - h);
    b.height = h;
  }
  mainWindow.setBounds(b);
}

// ---------- 窗口 ----------
function createWindow(scenePathToOpen) {
  const st = loadSettings();
  const bounds = st.windowBounds && typeof st.windowBounds.width === 'number' ? st.windowBounds : null;
  const win = new BrowserWindow({
    width: bounds ? bounds.width : 1280,
    height: bounds ? bounds.height : 840,
    x: bounds ? bounds.x : undefined,
    y: bounds ? bounds.y : undefined,
    minWidth: 420,
    minHeight: 300,
    frame: false,
    transparent: false,
    backgroundColor: '#181818',
    title: APP_NAME,
    show: false,
    roundedCorners: true,
    hasShadow: true,
    webPreferences: {
      preload: mainWorkspace.preloadAbs,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  win.loadFile(path.join(mainWorkspace.dirAbs, mainWorkspace.entry));
  win.once('ready-to-show', () => { win.show(); });
  if (scenePathToOpen) {
    win.webContents.once('did-finish-load', () => win.webContents.send('open-path', scenePathToOpen));
  }
  win.on('resize', () => {
    try { saveSettings({ windowBounds: win.getBounds() }); } catch {}
    layoutCurrentView();
  });
  win.on('move', () => { try { saveSettings({ windowBounds: win.getBounds() }); } catch {} });
  win.on('enter-full-screen', layoutCurrentView);
  win.on('leave-full-screen', layoutCurrentView);
  win.on('closed', () => { if (win === mainWindow) mainWindow = null; });
  win.webContents.on('context-menu', (e) => e.preventDefault());
  win.setTitle(`${APP_NAME} — ${mainWorkspace.name}`);
  return win;
}

// ---------- 菜单 ----------
function sendMenu(action) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('menu-action', action);
}

function workspaceMenuItems() {
  return workspaces.map((w) => ({
    label: w.name,
    accelerator: w.shortcut,
    type: 'radio',
    checked: w.id === currentWorkspaceId,
    click: () => setWorkspace(w.id),
  }));
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const appMenu = {
    label: APP_NAME,
    submenu: [
      { label: `关于 ${APP_NAME}`, click: () => sendMenu('about') },
      { type: 'separator' },
      ...(currentWorkspaceId === mainWorkspace.id ? [
        { label: '设置…', accelerator: 'CommandOrControl+,', click: () => sendMenu('settings') },
        { type: 'separator' },
      ] : []),
      { role: 'hide', label: `隐藏 ${APP_NAME}` },
      { role: 'hideOthers', label: '隐藏其他' },
      { role: 'unhide', label: '全部显示' },
      { type: 'separator' },
      { role: 'quit', label: `退出 ${APP_NAME}` },
    ],
  };
  const workspaceMenu = { label: '工作区', submenu: workspaceMenuItems() };
  const windowMenu = {
    label: '窗口',
    submenu: [
      ...(currentWorkspaceId === mainWorkspace.id ? [
        { label: '最大化', accelerator: 'CommandOrControl+F', click: () => sendMenu('maximize') },
        { label: '最小化', accelerator: 'CommandOrControl+M', click: () => sendMenu('minimize') },
        { label: '缩放到选择', accelerator: 'Shift+CommandOrControl+R', click: () => sendMenu('resize-to-selection') },
        { label: '锁定窗口', accelerator: 'CommandOrControl+W', click: () => sendMenu('lock-window') },
        { type: 'separator' },
      ] : [
        { label: '返回主工作区', accelerator: 'CommandOrControl+0', click: () => setWorkspace(mainWorkspace.id) },
        { label: '最大化', accelerator: 'CommandOrControl+F', click: () => { if (mainWindow) mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize(); } },
        { label: '最小化', accelerator: 'CommandOrControl+M', click: () => { if (mainWindow) mainWindow.minimize(); } },
        { label: '关闭窗口', accelerator: 'CommandOrControl+Shift+W', click: () => { if (mainWindow) mainWindow.close(); } },
        { type: 'separator' },
      ]),
      { label: '新窗口', accelerator: 'Alt+Shift+CommandOrControl+N', click: () => createWindow() },
    ],
  };

  if (currentWorkspaceId !== mainWorkspace.id) {
    return Menu.buildFromTemplate([
      ...(isMac ? [appMenu] : []),
      workspaceMenu,
      windowMenu,
      { role: 'help', label: '帮助', submenu: [{ label: `${APP_NAME} 使用说明`, click: () => sendMenu('help') }] },
    ]);
  }

  return Menu.buildFromTemplate([
    ...(isMac ? [appMenu] : []),
    {
      label: '文件',
      submenu: [
        { label: '打开场景', accelerator: 'CommandOrControl+L', click: () => sendMenu('open-scene') },
        { label: '打开图片', accelerator: 'CommandOrControl+I', click: () => sendMenu('open-images') },
        { label: '打开场景位置', accelerator: 'Alt+CommandOrControl+L', click: () => sendMenu('open-scene-location') },
        { type: 'separator' },
        { label: '保存', accelerator: 'CommandOrControl+S', click: () => sendMenu('save') },
        { label: '另存为', accelerator: 'Shift+CommandOrControl+S', click: () => sendMenu('save-as') },
        { label: '导出', submenu: [
          { label: '场景', accelerator: 'CommandOrControl+E', click: () => sendMenu('export-scene') },
          { label: '选中为场景', accelerator: 'Shift+CommandOrControl+E', click: () => sendMenu('export-selected-scene') },
          { label: '全部图片', accelerator: 'Alt+CommandOrControl+I', click: () => sendMenu('export-all-images') },
          { label: '选中图片', accelerator: 'Shift+CommandOrControl+I', click: () => sendMenu('export-selected-images') },
        ] },
        { type: 'separator' },
        { label: '新建场景', accelerator: 'CommandOrControl+K', click: () => sendMenu('new-scene') },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', accelerator: 'CommandOrControl+Z', click: () => sendMenu('undo') },
        { label: '重做', accelerator: 'Shift+CommandOrControl+Z', click: () => sendMenu('redo') },
        { type: 'separator' },
        { label: '复制', accelerator: 'CommandOrControl+C', click: () => sendMenu('copy') },
        { label: '剪切', accelerator: 'CommandOrControl+X', click: () => sendMenu('cut') },
        { label: '粘贴', accelerator: 'CommandOrControl+V', click: () => sendMenu('paste') },
        { type: 'separator' },
        { label: '便签', accelerator: 'CommandOrControl+N', click: () => sendMenu('note') },
        { label: '绘制', accelerator: 'Shift+CommandOrControl+D', click: () => sendMenu('draw') },
      ],
    },
    {
      label: '图片',
      submenu: [
        { label: '全选', accelerator: 'CommandOrControl+A', click: () => sendMenu('select-all') },
        { label: '选择', submenu: [
          { label: '重置裁剪', accelerator: 'Shift+CommandOrControl+C', click: () => sendMenu('reset-crop') },
          { label: '重置变换', accelerator: 'Shift+CommandOrControl+T', click: () => sendMenu('reset-transform') },
          { label: '打开源文件', accelerator: 'Shift+CommandOrControl+O', click: () => sendMenu('open-source') },
          { label: '切换双线性采样', accelerator: 'Alt+T', click: () => sendMenu('toggle-bilinear') },
          { label: '切换灰度', accelerator: 'Alt+G', click: () => sendMenu('toggle-grayscale') },
          { label: '切换锁定', accelerator: 'Alt+L', click: () => sendMenu('toggle-locked') },
          { type: 'separator' },
          { label: '分组', accelerator: 'CommandOrControl+G', click: () => sendMenu('group') },
          { label: '解组', accelerator: 'Shift+CommandOrControl+G', click: () => sendMenu('ungroup') },
          { label: '裁剪图片', click: () => sendMenu('crop') },
          { label: '注释', accelerator: 'Alt+C', click: () => sendMenu('comment') },
          { label: '置底', accelerator: 'Down', click: () => sendMenu('send-back') },
          { label: '置顶', accelerator: 'Up', click: () => sendMenu('send-front') },
          { label: '轮播', accelerator: 'Alt+S', click: () => sendMenu('slideshow') },
          { label: '删除', accelerator: 'Backspace', click: () => sendMenu('delete') },
        ] },
        { label: '排列', submenu: [
          { label: '最优', accelerator: 'CommandOrControl+P', click: () => sendMenu('arrange-optimal') },
          { label: '按名称', accelerator: 'Alt+CommandOrControl+N', click: () => sendMenu('arrange-name') },
          { label: '按路径', accelerator: 'Alt+CommandOrControl+D', click: () => sendMenu('arrange-path') },
          { label: '按顺序', accelerator: 'Alt+CommandOrControl+O', click: () => sendMenu('arrange-order') },
          { label: '按添加顺序', accelerator: 'Alt+CommandOrControl+A', click: () => sendMenu('arrange-add') },
          { label: '随机', accelerator: 'Alt+CommandOrControl+R', click: () => sendMenu('arrange-random') },
        ] },
        { label: '对齐', submenu: [
          { label: '左', accelerator: 'CommandOrControl+Left', click: () => sendMenu('align-left') },
          { label: '右', accelerator: 'CommandOrControl+Right', click: () => sendMenu('align-right') },
          { label: '上', accelerator: 'CommandOrControl+Up', click: () => sendMenu('align-top') },
          { label: '下', accelerator: 'CommandOrControl+Down', click: () => sendMenu('align-bottom') },
          { label: '堆叠', accelerator: 'Alt+CommandOrControl+S', click: () => sendMenu('stack') },
          { label: '水平分布', accelerator: 'Alt+Shift+CommandOrControl+Up', click: () => sendMenu('dist-h') },
          { label: '垂直分布', accelerator: 'Alt+Shift+CommandOrControl+Down', click: () => sendMenu('dist-v') },
        ] },
        { label: '统一尺寸', submenu: [
          { label: '高度', accelerator: 'Alt+CommandOrControl+Left', click: () => sendMenu('norm-height') },
          { label: '宽度', accelerator: 'Alt+CommandOrControl+Right', click: () => sendMenu('norm-width') },
          { label: '尺寸', accelerator: 'Alt+CommandOrControl+Up', click: () => sendMenu('norm-size') },
          { label: '面积', accelerator: 'Alt+CommandOrControl+Down', click: () => sendMenu('norm-area') },
          { label: '比例', click: () => sendMenu('norm-scale') },
        ] },
        { type: 'separator' },
        { label: '管理图片', accelerator: 'Shift+CommandOrControl+J', click: () => sendMenu('manage-images') },
        { label: '替换图片', click: () => sendMenu('replace-image') },
        { label: '重新链接缺失图片', accelerator: 'Alt+Shift+CommandOrControl+R', click: () => sendMenu('relink') },
        { type: 'separator' },
        { label: '查看工作区', submenu: workspaceMenuItems() },
      ],
    },
    {
      label: '模式',
      submenu: [
        { label: '鼠标穿透', accelerator: 'CommandOrControl+T', click: () => sendMenu('transparent-mouse') },
        { label: '叠加选择', accelerator: 'CommandOrControl+Y', click: () => sendMenu('overlay-selection') },
        { type: 'separator' },
        { label: '始终置顶', accelerator: 'Shift+CommandOrControl+A', click: () => sendMenu('always-on-top') },
        { label: '置于指定应用之上…', click: () => sendMenu('always-on-top-of') },
        { label: '始终置底', accelerator: 'Shift+CommandOrControl+B', click: () => sendMenu('always-on-bottom') },
      ],
    },
    {
      label: '画布',
      submenu: [
        { label: '网格', submenu: [
          { label: '无', click: () => sendMenu('grid-none') },
          { label: '线', click: () => sendMenu('grid-lines') },
          { label: '点', click: () => sendMenu('grid-dots') },
          { label: '吸附网格', click: () => sendMenu('grid-snap') },
        ] },
        { label: '重置相机', click: () => sendMenu('reset-camera') },
        { label: '重置缩放', accelerator: 'CommandOrControl+0', click: () => sendMenu('reset-zoom') },
        { label: '锁定画布', accelerator: 'CommandOrControl+R', click: () => sendMenu('lock-canvas') },
        { label: '灰度', accelerator: 'Alt+CommandOrControl+G', click: () => sendMenu('grayscale') },
        { type: 'separator' },
        { label: '优化', accelerator: 'CommandOrControl+O', click: () => sendMenu('optimize') },
      ],
    },
    workspaceMenu,
    windowMenu,
  ]);
}

function rebuildMenu() {
  Menu.setApplicationMenu(buildMenu());
}

// ---------- IPC ----------
ipcMain.handle('app:info', () => ({
  name: APP_NAME,
  version: config.app.version || app.getVersion(),
  platform: process.platform,
  userData: app.getPath('userData'),
  temp: os.tmpdir(),
  configPath: CONFIG_PATH,
}));

ipcMain.handle('settings:get', () => loadSettings());
ipcMain.handle('settings:set', (e, patch) => {
  const r = saveSettings(patch);
  if (patch && patch.theme) applyThemeToViews(patch.theme);
  return r;
});

ipcMain.handle('workspace:list', () => workspaces.map((w) => ({
  id: w.id, name: w.name, kind: w.kind, icon: w.icon, description: w.description,
  capabilities: w.capabilities || [], main: w.id === mainWorkspace.id,
})));
ipcMain.handle('workspace:get', () => currentWorkspaceId);
ipcMain.handle('workspace:set', (e, id) => setWorkspace(id));

ipcMain.handle('view:add-images', async (e, items, targetId) => {
  try { return await viewAddImages(items || [], targetId); }
  catch (err) { return { error: String(err && err.message ? err.message : err) }; }
});
ipcMain.handle('view:pull-images', async (e, targetId) => {
  try { return await viewPullImages(targetId); } catch { return []; }
});
ipcMain.handle('view:theme', (e, theme) => { applyThemeToViews(theme); return true; });
ipcMain.handle('view:show-main', () => setWorkspace(mainWorkspace.id));
ipcMain.handle('view:resize-start', (e, payload) => viewResizeStart(payload));
ipcMain.handle('view:resize-move', (e, payload) => viewResizeMove(payload));
ipcMain.handle('view:resize-end', () => { viewResizeState = null; });
ipcMain.handle('view:win', (e, action) => {
  if (!mainWindow) return;
  if (action === 'close') mainWindow.close();
  else if (action === 'minimize') mainWindow.minimize();
  else if (action === 'maximize') { if (mainWindow.isMaximized()) mainWindow.unmaximize(); else mainWindow.maximize(); }
});
ipcMain.on('view:pulled-images', (e, items) => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('view-images', items || []);
});

// 兼容旧版桥接通道（兜底）
ipcMain.handle('canvas:add-images', (e, items) => viewAddImages(items || []));
ipcMain.handle('canvas:pull-images', () => viewPullImages());

ipcMain.handle('win:minimize', () => mainWindow && mainWindow.minimize());
ipcMain.handle('win:maximize', () => {
  if (!mainWindow) return false;
  if (mainWindow.isMaximized()) { mainWindow.unmaximize(); return false; }
  mainWindow.maximize(); return true;
});
ipcMain.handle('win:close', () => { if (mainWindow) mainWindow.close(); return true; });
ipcMain.handle('win:set-always-on-top', (e, flag) => {
  if (!mainWindow) return false;
  mainWindow.setAlwaysOnTop(!!flag, 'floating');
  return mainWindow.isAlwaysOnTop();
});
ipcMain.handle('win:set-opacity', (e, v) => { if (mainWindow) mainWindow.setOpacity(Math.max(0.1, Math.min(1, v))); });
ipcMain.handle('win:set-ignore-mouse', (e, flag, forward) => {
  if (mainWindow) mainWindow.setIgnoreMouseEvents(!!flag, { forward: forward !== false });
});
ipcMain.handle('win:set-resizable', (e, flag) => { if (mainWindow) mainWindow.setResizable(!!flag); });
ipcMain.handle('win:set-locked', (e, flag) => { if (mainWindow) { mainWindow.setMovable(!flag); mainWindow.setResizable(!flag); } });
ipcMain.handle('win:begin-move', (e, pos) => {
  if (!mainWindow) return;
  const [x, y] = mainWindow.getPosition();
  winMoveState = { mx: pos.x, my: pos.y, wx: x, wy: y };
});
ipcMain.handle('win:move-to', (e, pos) => {
  if (!mainWindow || !winMoveState) return;
  const dx = pos.x - winMoveState.mx;
  const dy = pos.y - winMoveState.my;
  mainWindow.setPosition(Math.round(winMoveState.wx + dx), Math.round(winMoveState.wy + dy));
});
ipcMain.handle('win:end-move', () => { winMoveState = null; });
ipcMain.handle('win:new', () => { createWindow(); return true; });
ipcMain.handle('win:get-bounds', () => (mainWindow ? mainWindow.getBounds() : null));
ipcMain.handle('win:set-bounds-live', (e, rect) => { if (mainWindow) mainWindow.setBounds(rect); });
ipcMain.handle('win:set-bounds', (e, rect) => {
  if (!mainWindow) return;
  if (rect.maximized) mainWindow.maximize();
  else mainWindow.setBounds(rect);
});

ipcMain.handle('dialog:open-images', async () => {
  const r = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: '图片', extensions: ['png','jpg','jpeg','gif','webp','bmp','tif','tiff','heic','heif','svg','avif'] }],
  });
  return r.canceled ? [] : r.filePaths;
});
ipcMain.handle('dialog:open-scene', async () => {
  const r = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'MuseNex 场景', extensions: [SCENE_EXT] }, { name: '所有文件', extensions: ['*'] }],
  });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('dialog:save-scene', async (e, suggestedName) => {
  const r = await dialog.showSaveDialog(mainWindow, {
    defaultPath: suggestedName || `未命名.${SCENE_EXT}`,
    filters: [{ name: 'MuseNex 场景', extensions: [SCENE_EXT] }],
  });
  return r.canceled ? null : r.filePath;
});
ipcMain.handle('dialog:choose-folder', async (e, defaultPath) => {
  const r = await dialog.showOpenDialog(mainWindow, {
    defaultPath: defaultPath || app.getPath('pictures'),
    properties: ['openDirectory', 'createDirectory'],
  });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('dialog:save-file', async (e, opts) => {
  const r = await dialog.showSaveDialog(mainWindow, {
    defaultPath: opts && opts.defaultPath,
    filters: opts && opts.filters,
  });
  return r.canceled ? null : r.filePath;
});

ipcMain.handle('fs:read-file', async (e, p) => {
  try { return await fsp.readFile(p); } catch (err) { return { error: String(err) }; }
});
ipcMain.handle('fs:write-file', async (e, p, data) => {
  try {
    await fsp.mkdir(path.dirname(p), { recursive: true });
    await fsp.writeFile(p, Buffer.from(data));
    return { ok: true };
  } catch (err) { return { error: String(err) }; }
});
ipcMain.handle('fs:write-scene', async (e, p, payload) => {
  try {
    const blobs = {};
    for (const img of payload.images || []) blobs[img.id] = Buffer.from(img.data);
    const buf = packScene(payload.header, blobs);
    const tmp = p + '.tmp';
    await fsp.mkdir(path.dirname(p), { recursive: true });
    await fsp.writeFile(tmp, buf);
    await fsp.rename(tmp, p);
    return { ok: true };
  } catch (err) { return { error: String(err) }; }
});
ipcMain.handle('fs:read-scene', async (e, p) => {
  try {
    const buf = await fsp.readFile(p);
    return Object.assign({ ok: true }, unpackScene(buf));
  } catch (err) { return { error: String(err.message || err) }; }
});
ipcMain.handle('fs:autosave', async (e, payload) => {
  try {
    const p = path.join(app.getPath('userData'), 'autosave.prcyq');
    const blobs = {};
    for (const img of payload.images || []) blobs[img.id] = Buffer.from(img.data);
    await fsp.writeFile(p, packScene(payload.header, blobs));
    return { ok: true, path: p };
  } catch (err) { return { error: String(err) }; }
});
ipcMain.handle('fs:autosave-check', async () => {
  const p = path.join(app.getPath('userData'), 'autosave.prcyq');
  try { const st = await fsp.stat(p); return { exists: true, path: p, mtime: st.mtimeMs }; } catch { return { exists: false }; }
});
ipcMain.handle('fs:autosave-clear', async () => {
  const p = path.join(app.getPath('userData'), 'autosave.prcyq');
  try { await fsp.unlink(p); } catch {}
  return true;
});
ipcMain.handle('fs:stat', async (e, p) => {
  try { const st = await fsp.stat(p); return { ok: true, size: st.size, mtime: st.mtimeMs, isDir: st.isDirectory() }; }
  catch (err) { return { ok: false, error: String(err) }; }
});
ipcMain.handle('fs:list', async (e, dir) => {
  try {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    return entries.map((d) => ({ name: d.name, dir: d.isDirectory() }));
  } catch { return []; }
});
ipcMain.handle('fs:home', () => app.getPath('home'));
ipcMain.handle('fs:pictures', () => app.getPath('pictures'));
ipcMain.handle('fs:show-in-folder', (e, p) => { shell.showItemInFolder(p); });
ipcMain.handle('shell:open-path', async (e, p) => shell.openPath(p));
ipcMain.handle('shell:open-external', (e, url) => { shell.openExternal(url); });

ipcMain.handle('clipboard:read-image', () => {
  const img = clipboard.readImage();
  if (img.isEmpty()) return null;
  return img.toPNG();
});
ipcMain.handle('clipboard:read-text', () => clipboard.readText());
ipcMain.handle('clipboard:write-image', (e, pngBuf) => {
  clipboard.writeImage(nativeImage.createFromBuffer(Buffer.from(pngBuf)));
  return true;
});
ipcMain.handle('clipboard:write-text', (e, txt) => { clipboard.writeText(txt); return true; });
ipcMain.handle('clipboard:read-files', () => []);

ipcMain.handle('app:relaunch', () => { app.relaunch(); app.exit(0); });
ipcMain.handle('app:quit', () => { app.quit(); });

// ---------- 生命周期 ----------
const gotLock = app.requestSingleInstanceLock ? app.requestSingleInstanceLock() : true;
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
  });
  app.whenReady().then(() => {
    migrateLegacyData();
    setupWorkspaceProtocol();
    mainWindow = createWindow(pendingOpenPath || undefined);
    pendingOpenPath = null;
    const st = loadSettings();
    const startWs = wsById(st.workspace) ? st.workspace : mainWorkspace.id;
    currentWorkspaceId = mainWorkspace.id;
    rebuildMenu();
    if (startWs !== mainWorkspace.id) {
      mainWindow.webContents.once('did-finish-load', () => setWorkspace(startWs));
    }
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
    });
  });
}
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('open-file', (event, p) => {
  event.preventDefault();
  if (!app.isReady()) { pendingOpenPath = p; return; }
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (currentWorkspaceId !== mainWorkspace.id) setWorkspace(mainWorkspace.id);
    mainWindow.webContents.send('open-path', p);
  } else {
    mainWindow = createWindow(p);
  }
});
