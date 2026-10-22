// MuseNex — 主工作区 preload（参考板）
const { contextBridge, ipcRenderer } = require('electron');

const invoke = (ch, ...args) => ipcRenderer.invoke(ch, ...args);

let openPathHandler = null;
const queuedOpenPaths = [];
ipcRenderer.on('open-path', (e, p) => {
  if (openPathHandler) { try { openPathHandler(p); } catch {} }
  else queuedOpenPaths.push(p);
});

contextBridge.exposeInMainWorld('musenex', {
  app: {
    info: () => invoke('app:info'),
    relaunch: () => invoke('app:relaunch'),
    quit: () => invoke('app:quit'),
  },
  settings: {
    get: () => invoke('settings:get'),
    set: (patch) => invoke('settings:set', patch),
  },
  workspace: {
    list: () => invoke('workspace:list'),
    get: () => invoke('workspace:get'),
    set: (id) => invoke('workspace:set', id),
    onChanged: (cb) => {
      const handler = (e, id) => cb(id);
      ipcRenderer.on('workspace-changed', handler);
      return () => ipcRenderer.removeListener('workspace-changed', handler);
    },
    onViewImages: (cb) => {
      const handler = (e, items) => cb(items);
      ipcRenderer.on('view-images', handler);
      return () => ipcRenderer.removeListener('view-images', handler);
    },
  },
  view: {
    addImages: (items, targetId) => invoke('view:add-images', items, targetId),
    pullImages: (targetId) => invoke('view:pull-images', targetId),
    syncTheme: (theme) => invoke('view:theme', theme),
  },
  win: {
    minimize: () => invoke('win:minimize'),
    maximize: () => invoke('win:maximize'),
    close: () => invoke('win:close'),
    setAlwaysOnTop: (f) => invoke('win:set-always-on-top', f),
    setOpacity: (v) => invoke('win:set-opacity', v),
    setIgnoreMouse: (f, forward) => invoke('win:set-ignore-mouse', f, forward),
    setResizable: (f) => invoke('win:set-resizable', f),
    setLocked: (f) => invoke('win:set-locked', f),
    beginMove: (pos) => invoke('win:begin-move', pos),
    moveTo: (pos) => invoke('win:move-to', pos),
    endMove: () => invoke('win:end-move'),
    newWindow: () => invoke('win:new'),
    getBounds: () => invoke('win:get-bounds'),
    setBoundsLive: (r) => invoke('win:set-bounds-live', r),
    setBounds: (r) => invoke('win:set-bounds', r),
  },
  dialog: {
    openImages: () => invoke('dialog:open-images'),
    openScene: () => invoke('dialog:open-scene'),
    saveScene: (name) => invoke('dialog:save-scene', name),
    chooseFolder: (p) => invoke('dialog:choose-folder', p),
    saveFile: (opts) => invoke('dialog:save-file', opts),
  },
  fs: {
    readFile: (p) => invoke('fs:read-file', p),
    writeFile: (p, data) => invoke('fs:write-file', p, data),
    writeScene: (p, payload) => invoke('fs:write-scene', p, payload),
    readScene: (p) => invoke('fs:read-scene', p),
    autosave: (payload) => invoke('fs:autosave', payload),
    autosaveCheck: () => invoke('fs:autosave-check'),
    autosaveClear: () => invoke('fs:autosave-clear'),
    stat: (p) => invoke('fs:stat', p),
    list: (d) => invoke('fs:list', d),
    home: () => invoke('fs:home'),
    pictures: () => invoke('fs:pictures'),
    showInFolder: (p) => invoke('fs:show-in-folder', p),
  },
  shell: {
    openPath: (p) => invoke('shell:open-path', p),
    openExternal: (u) => invoke('shell:open-external', u),
  },
  clipboard: {
    readImage: () => invoke('clipboard:read-image'),
    readText: () => invoke('clipboard:read-text'),
    writeImage: (buf) => invoke('clipboard:write-image', buf),
    writeText: (t) => invoke('clipboard:write-text', t),
  },
  onMenu: (cb) => {
    const handler = (e, action) => cb(action);
    ipcRenderer.on('menu-action', handler);
    return () => ipcRenderer.removeListener('menu-action', handler);
  },
  onOpenPath: (cb) => {
    openPathHandler = cb;
    while (queuedOpenPaths.length) { try { cb(queuedOpenPaths.shift()); } catch {} }
    return () => { openPathHandler = null; };
  },
});
