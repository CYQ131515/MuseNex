/* ============================================================================
 * ui.js — toolbars, panels, menus, minimap interaction, import/export.
 * ========================================================================= */

import {
  GROUP_COLORS,
  ICONS,
  NODE_TYPES,
  TYPE_GROUPS,
  collapseAll,
  createEdge,
  createNode,
  expandAll,
  nodeBounds,
  nodeCurrentVersion,
  nodeFilters,
  nodeMainMedia,
  nodeParams,
  nodeTitle,
  organizeCanvas,
  setNodeParams,
  updateJob,
  removeAnnotation,
  renameNode,
  selectionBounds,
  setCollapsed,
  setGroupColor,
  setMainVersion,
  setNodeFilter,
  store,
  clearAnnotations,
} from './store.js';
import { createNodeAt } from './canvas.js';
import { api, KIND_BY_NODE } from './api.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const icon = (name) => `<svg viewBox="0 0 24 24">${ICONS[name] || ICONS.text}</svg>`;

function el(tag, cls, html) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (html != null) node.innerHTML = html;
  return node;
}

export class UI {
  constructor({ canvas }) {
    this.canvas = canvas;
    this.vp = canvas.vp;
    this.clipboard = null;
    this.pendingAdd = null; // {localX, localY, connectFrom}
    this.toastTimers = new Set();
    this.menuEl = $('#contextMenu');
    this.alignMenu = $('#alignMenu');
    this.addPanel = $('#addPanel');
    this.searchDialog = $('#nodeSearch');

    this.buildAddPanel();
    this.buildNodeManager();
    this.buildGroupToolbar();
    this.buildReadonlyBar();
    this.buildMediaToolbar();
    store.on('zoom', () => {
      const node = this.mediaToolbarNode && store.getNode(this.mediaToolbarNode);
      if (node && this.mediaToolbar && !this.mediaToolbar.hidden) this.positionMediaToolbar(node);
      const sel = store.selectedNodes();
      if (sel.length === 1) this.canvas.syncNodeToolbar();
    });
    this.buildAnnotateBar();
    this.buildAdjustPopover();
    this.buildParamBar();
    this.buildAssetLibrary();
    this.buildQueuePanel();
    this.buildApiPanel();
    this.bindCanvasEvents();
    this.refreshApiStatus();
    this.bindTopbar();
    this.bindMenus();
    this.bindZoomPill();
    this.bindMinimap();
    this.bindStore();
    this.bindDropFiles();
    this.bindDocumentMeta();
    this.applyTheme(store.state.settings.theme);
    this.applyReadonly(store.state.settings.readMode);
    this.renderNodeManager();
    this.refreshHistoryButtons();
    this.renderEmptyState();
  }

  /* ── add-node catalog panel ──────────────────────────────────────── */

  buildAddPanel(filter = '') {
    const body = $('#addPanelBody');
    if (!body) return;
    const q = filter.trim().toLowerCase();
    body.innerHTML = '';
    let count = 0;
    for (const group of TYPE_GROUPS) {
      const items = Object.entries(NODE_TYPES).filter(([, t]) => t.group === group);
      const matched = items.filter(
        ([key, t]) =>
          !q ||
          t.name.toLowerCase().includes(q) ||
          t.desc.toLowerCase().includes(q) ||
          key.includes(q) ||
          t.badge.toLowerCase().includes(q),
      );
      if (!matched.length) continue;
      body.appendChild(el('div', 'add-group__title', group));
      for (const [key, t] of matched) {
        count++;
        const item = el(
          'button',
          'add-item',
          `<span class="add-item__icon">${icon(t.icon)}</span>
           <span class="add-item__text">
             <span class="add-item__name">${t.name}</span>
             <span class="add-item__desc">${t.desc}</span>
           </span>`,
        );
        item.dataset.type = key;
        item.addEventListener('click', () => this.addNodeOfType(key));
        body.appendChild(item);
      }
    }
    if (!count) body.appendChild(el('div', 'dialog__empty', '没有匹配的节点类型'));
  }

  openAddPanel(pending = null) {
    if (store.state.settings.readMode) {
      store.emit('toast', '阅读视图下不可编辑');
      return;
    }
    this.pendingAdd = pending;
    this.addPanel.hidden = false;
    $('#addPanelSearch').value = '';
    this.buildAddPanel('');
    setTimeout(() => $('#addPanelSearch').focus(), 30);
  }

  closeAddPanel() {
    this.addPanel.hidden = true;
    this.pendingAdd = null;
  }

  addNodeOfType(type) {
    if (store.state.settings.readMode) {
      store.emit('toast', '阅读视图下不可编辑');
      return null;
    }
    const pending = this.pendingAdd;
    let flow;
    if (pending && Number.isFinite(pending.localX)) {
      flow = this.vp.localToFlow(pending.localX, pending.localY);
    } else {
      flow = this.vp.centerFlow();
      flow = { x: Math.round(flow.x - (NODE_TYPES[type]?.size.w || 260) / 2), y: Math.round(flow.y - 100) };
    }
    const node = createNodeAt(type, { x: Math.round(flow.x), y: Math.round(flow.y) }, pending?.connectFrom);
    this.closeAddPanel();
    store.emit('toast', `已添加「${NODE_TYPES[type]?.name || type}」`);
    return node;
  }

  /* ── node manager（节点管理：列表/网格 + 批量 + 展开收起） ─────────── */

  buildNodeManager() {
    const el = document.createElement('aside');
    el.className = 'node-manager';
    el.id = 'nodeManager';
    el.hidden = !store.state.settings.nodeManagerOpen;
    el.innerHTML = `
      <div class="node-manager__head">
        <div><span class="node-manager__title">节点管理</span><span class="node-manager__count" id="nmCount"></span></div>
        <button class="icon-btn icon-btn--ghost" id="nmClose" title="关闭">${icon('close')}</button>
      </div>
      <div class="node-manager__toolbar">
        <button class="node-manager__tool" data-nm-view="list">列表视图</button>
        <button class="node-manager__tool" data-nm-view="grid">网格视图</button>
        <span style="flex:1"></span>
        <button class="node-manager__tool" data-nm="collapse">全部收起</button>
        <button class="node-manager__tool" data-nm="expand">全部展开</button>
      </div>
      <label class="node-manager__search">
        ${icon('search')}
        <input id="nmSearch" placeholder="搜索节点…" spellcheck="false" />
      </label>
      <div class="node-manager__list" id="nmList"></div>
      <div class="node-manager__batch">
        <span id="nmSelCount">已选 0 个节点</span>
        <div style="display:flex;gap:8px">
          <button class="node-manager__tool" data-nm="selectAll">全选</button>
          <button class="node-manager__tool" data-nm="download">下载</button>
          <button class="node-manager__tool danger" data-nm="delete" style="color:var(--canvas-accent-danger)">删除</button>
        </div>
      </div>`;
    this.canvas.host.appendChild(el);
    this.nodeManager = el;
    this.nmView = 'list';
    this.nmQuery = '';
    el.querySelector('#nmClose').addEventListener('click', () => this.toggleNodeManager(false));
    el.querySelectorAll('[data-nm-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.nmView = btn.dataset.nmView;
        this.renderNodeManager();
      });
    });
    el.querySelector('[data-nm="collapse"]').addEventListener('click', () => collapseAll());
    el.querySelector('[data-nm="expand"]').addEventListener('click', () => expandAll());
    el.querySelector('[data-nm="selectAll"]').addEventListener('click', () => {
      const ids = this.filteredNodes().map((n) => n.id);
      store.setSelection(ids, { additive: true });
    });
    el.querySelector('[data-nm="download"]').addEventListener('click', () => {
      const nodes = store.selectedNodes().filter((n) => n.type !== 'group');
      if (!nodes.length) {
        store.emit('toast', '请先选择要下载的节点');
        return;
      }
      nodes.forEach((n, i) => setTimeout(() => this.downloadNodeMedia(n), i * 150));
      store.emit('toast', `已开始下载 ${nodes.length} 个媒体`, 'success');
    });
    el.querySelector('[data-nm="delete"]').addEventListener('click', () => {
      if (!store.selection.size) {
        store.emit('toast', '请先选择要删除的节点');
        return;
      }
      const count = store.selection.size;
      store.removeSelection();
      store.emit('toast', `已删除 ${count} 个节点`);
    });
    el.querySelector('#nmSearch').addEventListener('input', (e) => {
      this.nmQuery = e.target.value;
      this.renderNodeManager();
    });
  }

  filteredNodes() {
    const q = (this.nmQuery || '').trim().toLowerCase();
    return store.nodes.filter((n) => {
      if (!q) return true;
      const t = NODE_TYPES[n.type] || {};
      return (
        nodeTitle(n).toLowerCase().includes(q) ||
        n.type.includes(q) ||
        (t.name || '').toLowerCase().includes(q)
      );
    });
  }

  renderNodeManager() {
    if (!this.nodeManager) return;
    const list = this.nodeManager.querySelector('#nmList');
    const nodes = this.filteredNodes();
    this.nodeManager.querySelector('#nmCount').textContent = String(store.nodes.length);
    this.nodeManager.querySelector('#nmSelCount').textContent = `已选 ${store.selection.size} 个节点`;
    this.nodeManager.querySelectorAll('[data-nm-view]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.nmView === this.nmView);
    });
    list.classList.toggle('is-grid', this.nmView === 'grid');
    list.innerHTML = '';
    if (!nodes.length) {
      list.appendChild(el('div', 'node-manager__empty', '没有匹配的节点'));
      return;
    }
    for (const node of nodes) {
      const t = NODE_TYPES[node.type] || NODE_TYPES.text;
      const selected = store.selection.has(node.id);
      const item = el(
        'button',
        `node-manager__item${selected ? ' is-selected' : ''}`,
        `<span class="node-manager__check" data-check="${node.id}"></span>
         <span class="node-manager__thumb" style="--type-chip:var(--type-${chipKey(node.type)})">
           ${
             node.data?.media
               ? `<img src="${node.data.media}" alt="" />`
               : icon(t.icon)
           }
         </span>
         <span class="node-manager__meta">
           <span class="node-manager__name">${escapeHTML(nodeTitle(node))}</span>
           <span class="node-manager__sub"><span>${t.name}</span><span>${node.data?.status && node.data.status !== 'idle' ? STATUS_LABEL[node.data.status] || node.data.status : '待生成'}</span>${node.data?.collapsed ? '<span>已收起</span>' : ''}</span>
         </span>`,
      );
      item.addEventListener('click', (e) => {
        if (e.target.closest('[data-check]')) {
          store.setSelection([node.id], { additive: true });
          return;
        }
        store.setSelection([node.id]);
        this.vp.focusNode(node);
      });
      item.addEventListener('dblclick', () => this.startRename(node.id));
      list.appendChild(item);
    }
  }

  toggleNodeManager(open) {
    const next = open == null ? !store.state.settings.nodeManagerOpen : open;
    store.setSetting('nodeManagerOpen', next);
    this.nodeManager.hidden = !next;
    if (next) this.renderNodeManager();
  }

  /* ── group toolbar（编组工具条：颜色 / 布局 / 解散） ───────────────── */

  buildGroupToolbar() {
    const el = document.createElement('div');
    el.className = 'group-toolbar';
    el.hidden = true;
    el.innerHTML = `
      ${GROUP_COLORS.map((c) => `<button class="group-toolbar__swatch" data-color="${c.key}" title="${c.key}" style="background:${c.border}"></button>`).join('')}
      <span class="group-toolbar__sep"></span>
      <button data-layout="horizontal" title="水平排列">${icon('text')}</button>
      <button data-layout="vertical" title="垂直排列">${icon('layers')}</button>
      <button data-layout="grid" title="网格排列">${icon('grid')}</button>
      <span class="group-toolbar__sep"></span>
      <button data-group-act="execute" title="执行编组">${icon('play')}</button>
      <button data-group-act="disband" title="解散编组">${icon('group')}</button>
      <button data-group-act="delete" class="danger" title="删除编组">${icon('trash')}</button>`;
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('click', (e) => {
      const swatch = e.target.closest('[data-color]');
      const layout = e.target.closest('[data-layout]');
      const act = e.target.closest('[data-group-act]');
      const group = store.selectedNodes().find((n) => n.type === 'group');
      if (!group) return;
      if (swatch) setGroupColor(group.id, swatch.dataset.color);
      if (layout) this.canvas.layoutGroup(group, layout.dataset.layout);
      if (act?.dataset.groupAct === 'execute') this.executeGroup(group);
      if (act?.dataset.groupAct === 'disband') this.canvas.ungroup();
      if (act?.dataset.groupAct === 'delete') this.canvas.removeNode(group.id);
    });
    this.canvas.host.appendChild(el);
    this.groupToolbar = el;
  }

  syncGroupToolbar() {
    const el = this.groupToolbar;
    if (!el) return;
    const groups = store.selectedNodes().filter((n) => n.type === 'group');
    if (groups.length !== 1) {
      el.hidden = true;
      return;
    }
    const group = groups[0];
    const { w } = this.canvas.dimsOf(group);
    const local = this.vp.flowToLocal(group.x + w / 2, group.y);
    const scale = this.canvas.uiScale();
    el.hidden = false;
    el.style.left = `${this.safeToolbarLeft(local.x, el.offsetWidth || 430, scale)}px`;
    el.style.top = `${this.safeToolbarTop(local.y - 12, 34, scale)}px`;
    el.style.transform = `translate(-50%, -100%) scale(${scale})`;
    el.style.transformOrigin = '50% 100%';
    el.querySelectorAll('[data-color]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.color === (group.data?.groupColor || 'slate'));
    });
  }

  /* ── reading view（阅读视图 / readonlyToolbar） ───────────────────── */

  buildReadonlyBar() {
    const bar = document.createElement('div');
    bar.className = 'readonly-bar';
    bar.hidden = true;
    bar.innerHTML = `
      <span class="readonly-bar__dot"></span>
      <span class="readonly-bar__label">阅读视图 · 只读</span>
      <button class="readonly-bar__btn" data-read="reset">重置视图</button>
      <button class="readonly-bar__btn" data-read="exit">退出阅读</button>`;
    bar.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-read]');
      if (!btn) return;
      if (btn.dataset.read === 'reset') this.vp.fitView({ padding: 90, maxZoom: 0.9 });
      if (btn.dataset.read === 'exit') store.setSetting('readMode', false);
    });
    this.canvas.host.appendChild(bar);
    this.readonlyBar = bar;
  }

  applyReadonly(on) {
    on = !!on;
    if (this._readonlyApplied === on) return;
    this._readonlyApplied = on;
    document.body.classList.toggle('is-readonly', on);
    if (this.readonlyBar) this.readonlyBar.hidden = !on;
    if (on) {
      // entering reading view closes edit-side panels without re-entering settings emit
      if (this.nodeManager) this.nodeManager.hidden = true;
      store.state.settings.nodeManagerOpen = false;
      this.closeAddPanel();
      store.clearSelection();
    }
  }

  /* ── shortcuts dialog ────────────────────────────────────────────── */

  openShortcuts() {
    if (!this.shortcutsEl) {
      const backdrop = document.createElement('div');
      backdrop.className = 'dialog-backdrop';
      const rows = [
        ['⌘/Ctrl + Z', '撤销'],
        ['⇧⌘ + Z / ⌘Y', '重做'],
        ['⌘/Ctrl + F', '搜索节点'],
        ['⌘/Ctrl + C / V', '复制 / 粘贴节点'],
        ['⌘/Ctrl + A', '全选节点'],
        ['⌘/Ctrl + G', '编组选中节点'],
        ['⌘/Ctrl + = / −', '放大 / 缩小'],
        ['⌘/Ctrl + 0', '重置为 100%'],
        ['Shift + 1', '适配画布'],
        ['空格（按住）+ 拖拽', '平移画布'],
        ['滚轮 / 触控板', '平移（⌘/Ctrl + 滚轮缩放）'],
        ['Delete / Backspace', '删除选中'],
        ['Shift + 点击', '加选 / 减选'],
        ['双击画布', '在指针处添加节点'],
        ['拖到节点右缘「+」', '添加并自动连接'],
        ['从多选节点拖出', '批量连接'],
        ['?', '打开本帮助'],
      ];
      backdrop.innerHTML = `<div class="dialog shortcuts-dialog" role="dialog" aria-label="键盘快捷键">
        <h3>键盘快捷键</h3>
        <p>与 RunningHub 无限画布一致的画布快捷键（逆向自画布 keydown handler）</p>
        <div class="shortcuts-grid">${rows
          .map(([k, v]) => `<div class="shortcut-row"><span>${v}</span><kbd>${k}</kbd></div>`)
          .join('')}</div>
      </div>`;
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) this.closeShortcuts();
      });
      document.body.appendChild(backdrop);
      this.shortcutsEl = backdrop;
    }
    this.shortcutsEl.hidden = false;
  }

  closeShortcuts() {
    if (this.shortcutsEl) this.shortcutsEl.hidden = true;
  }

  /* ── 整理画布（organizeCanvas.*：左/中/右 + 保留/还原） ───────────── */

  runOrganize(mode) {
    const before = organizeCanvas(mode);
    if (before == null) return;
    requestAnimationFrame(() => this.vp.fitView({ padding: 90, maxZoom: 0.9 }));
    const overlay = document.createElement('div');
    overlay.className = 'organize-prompt';
    overlay.innerHTML = `
      <span>是否保留此次整理结果？</span>
      <button data-or="keep">保留</button>
      <button data-or="restore">还原</button>`;
    overlay.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-or]');
      if (!btn) return;
      overlay.remove();
      if (btn.dataset.or === 'restore') {
        store.undo();
        requestAnimationFrame(() => this.vp.fitView({ padding: 90, maxZoom: 0.9 }));
      } else {
        store.emit('toast', '已保留整理结果', 'success');
      }
    });
    this.canvas.host.appendChild(overlay);
    setTimeout(() => overlay.remove(), 6000);
  }

  /* ── 重命名（contextMenu.renameNode） ───────────────────────────── */

  startRename(id) {
    const node = store.getNode(id);
    if (!node) return;
    const el = this.canvas.nodeEls.get(id);
    const label = el?.querySelector('[data-field="label"]');
    if (!label) return;
    const input = document.createElement('input');
    input.className = 'node-label-input';
    input.value = nodeTitle(node);
    label.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const commit = () => {
      if (done) return;
      done = true;
      const value = input.value.trim();
      input.remove();
      if (value && value !== nodeTitle(node)) renameNode(id, value);
      else this.canvas.sync();
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') commit();
      if (e.key === 'Escape') {
        input.remove();
        this.canvas.sync();
      }
    });
    input.addEventListener('blur', commit);
  }

  /* ── 编组执行（groupToolbar.executeGroup） ──────────────────────── */

  executeGroup(group) {
    const children = this.canvas.containedNodes(group).filter((n) =>
      ['image-gen', 'video-gen', 'llm', 'rh-ai'].includes(n.type),
    );
    if (!children.length) {
      store.emit('toast', '编组内没有可执行的生成节点');
      return;
    }
    children.forEach((n, i) => setTimeout(() => this.canvas.runNode(n.id), i * 250));
    store.emit('toast', `已开始执行 ${children.length} 个节点`, 'success');
  }

  /* ══════════ APIMart 连接状态 / 设置面板 ══════════ */

  refreshApiStatus() {
    const chip = document.getElementById('apiBtn');
    if (!chip) return;
    const st = api.state;
    chip.classList.toggle('is-online', !!st.online);
    chip.classList.toggle('is-offline', !st.online);
    const text = chip.querySelector('.api-chip__text');
    if (text) text.textContent = st.online ? `API · ${st.models.length}` : 'API 未连接';
    chip.title = st.online
      ? `APIMart 已连接 · ${st.models.length} 个模型（${st.base}）`
      : `APIMart 未连接：${st.error || '本地代理未启动'}`;
    this.renderApiPanel();
  }

  buildApiPanel() {
    const el = document.createElement('div');
    el.className = 'dialog-backdrop';
    el.id = 'apiPanel';
    el.hidden = true;
    el.innerHTML = `<div class="dialog api-panel">
      <div class="generic-dialog__head"><h3>APIMart 连接</h3><button class="icon-btn icon-btn--ghost" data-api="close">${icon('close')}</button></div>
      <div class="generic-dialog__body" id="apiPanelBody"></div>
      <div class="generic-dialog__actions">
        <button class="btn" data-api="test">测试连接</button>
        <button class="btn" data-api="balance">查询余额</button>
        <button class="btn btn--primary" data-api="close">关闭</button>
      </div>
    </div>`;
    el.addEventListener('click', async (e) => {
      if (e.target === el) return this.openApiPanel(false);
      const btn = e.target.closest('[data-api]');
      if (!btn) return;
      const act = btn.dataset.api;
      if (act === 'close') this.openApiPanel(false);
      if (act === 'test') {
        store.emit('toast', '正在连接 APIMart…');
        await api.init();
        this.refreshApiStatus();
        store.emit('toast', api.state.online ? `连接成功 · ${api.state.models.length} 个模型` : `连接失败：${api.state.error}`, api.state.online ? 'success' : 'error');
      }
      if (act === 'rescan') {
        this._apiRescanning = true;
        const models = await api.loadModels();
        this._apiRescanning = false;
        this.refreshApiStatus();
        store.emit('toast', `模型排查完成：图片 ${api.state.byKind.image.length} · 视频 ${api.state.byKind.video.length} · 文本 ${api.state.byKind.text.length} · 音频 ${api.state.byKind.audio.length}`, 'success');
      }
      if (act === 'balance') {
        const b = await api.balance();
        store.emit('toast', b ? `余额：${JSON.stringify(b).slice(0, 80)}` : '余额查询失败', b ? 'success' : 'error');
      }
    });
    document.body.appendChild(el);
    this.apiPanel = el;
  }

  openApiPanel(open) {
    const next = open == null ? this.apiPanel.hidden : open;
    this.apiPanel.hidden = !next;
    if (next) this.renderApiPanel();
  }

  renderApiPanel() {
    if (!this.apiPanel || this.apiPanel.hidden) return;
    const st = api.state;
    const s = store.state.settings;
    this.apiPanel.querySelector('#apiPanelBody').innerHTML = `
      <div class="info-table">
        <div class="info-row"><span>状态</span><b>${st.online ? '● 已连接' : '○ 未连接'}</b></div>
        <div class="info-row"><span>地址</span><b>${escapeHTML(st.base || '—')}</b></div>
        <div class="info-row"><span>密钥</span><b>${st.hasKey ? '本地代理已配置（不下发前端）' : '未配置'}</b></div>
        <div class="info-row"><span>模型</span><b>共 ${st.models.length} · 图片 ${st.byKind.image.length} · 视频 ${st.byKind.video.length} · 文本 ${st.byKind.text.length} · 音频 ${st.byKind.audio.length}</b></div>
        <div class="info-row"><span>分类来源</span><b>${st.staticCatalog ? '静态排查快照（离线）' : 'APIMart category 元数据（权威）'}</b></div>
        <div class="info-row"><span>智能推荐</span><b>${['image', 'video', 'text', 'audio'].map((k) => `${({ image: '图', video: '视', text: '文', audio: '音' })[k]}：${escapeHTML(api.recommend(k) || '—')}`).join('　')}</b></div>
      </div>
      <div class="api-toggles">
        <label><input type="checkbox" data-api-toggle="useApi" ${s.useApi ? 'checked' : ''}/> 模型节点使用真实 API</label>
        <label><input type="checkbox" data-api-toggle="confirmVideo" ${s.confirmVideo ? 'checked' : ''}/> 视频生成前确认额度</label>
      </div>
      <div class="api-actions-row">
        <button class="btn" data-api="rescan">重新排查模型</button>
      </div>
      <p class="api-hint">API Key 只保存在本机 <code>config.local.json</code>，由 <code>server.mjs</code> 转发；浏览器里不会出现密钥。单文件版（file://）无代理，会自动回退到本地占位生成。</p>`;
    this.apiPanel.querySelectorAll('[data-api-toggle]').forEach((input) => {
      input.addEventListener('change', () => {
        store.setSetting(input.dataset.apiToggle, input.checked);
        this.renderApiPanel();
      });
    });
  }

  /* ══════════ 生成队列（本地排队 / 取消 / 进度） ══════════ */

  buildQueuePanel() {
    const el = document.createElement('div');
    el.className = 'queue-panel';
    el.hidden = true;
    el.innerHTML = `
      <div class="queue-panel__head">
        <span class="queue-panel__title">生成队列</span>
        <span class="queue-panel__count" id="qpCount"></span>
        <span style="flex:1"></span>
        <button data-qp="clear" class="queue-panel__btn" title="清除已完成">清除</button>
        <button data-qp="close" class="queue-panel__btn" title="关闭">${icon('close')}</button>
      </div>
      <div class="queue-panel__list" id="qpList"></div>`;
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-qp]');
      if (!btn) return;
      if (btn.dataset.qp === 'close') this.toggleQueuePanel(false);
      if (btn.dataset.qp === 'clear') {
        ['done', 'cancelled', 'error'].forEach(() => {});
        store.state.queue = store.state.queue.filter((j) => j.status === 'queued' || j.status === 'running');
        store.emit('queue', store.state.queue);
      }
    });
    this.canvas.host.appendChild(el);
    this.queuePanel = el;
    this.renderQueue();
  }

  toggleQueuePanel(open) {
    const next = open == null ? this.queuePanel.hidden : open;
    this.queuePanel.hidden = !next;
    if (next) this.renderQueue();
  }

  syncQueueBadge() {
    const badge = document.getElementById('queueBadge');
    if (!badge) return;
    const n = store.state.queue.filter((j) => j.status === 'queued' || j.status === 'running').length;
    badge.hidden = n === 0;
    badge.textContent = String(n);
  }

  renderQueue() {
    if (!this.queuePanel) return;
    const jobs = store.state.queue;
    this.queuePanel.querySelector('#qpCount').textContent = `${jobs.filter((j) => j.status === 'queued').length} 排队 / ${
      jobs.filter((j) => j.status === 'running').length
    } 执行中`;
    const list = this.queuePanel.querySelector('#qpList');
    list.innerHTML = '';
    if (!jobs.length) {
      list.innerHTML = '<div class="queue-panel__empty">队列为空。点节点上的「生成」或 ⌘/Ctrl+Enter 加入队列。</div>';
      return;
    }
    for (const job of [...jobs].reverse()) {
      const row = document.createElement('div');
      row.className = `queue-job is-${job.status}`;
      const label =
        job.status === 'running' && Number.isFinite(job.progress)
          ? `生成中 ${Math.round(job.progress)}%`
          : { queued: '排队中', running: '生成中', done: '已完成', error: '失败', cancelled: '已取消' }[job.status] || job.status;
      row.innerHTML = `<span class="queue-job__dot"></span>
        <span class="queue-job__title">${escapeHTML(job.title || '未命名节点')}</span>
        <span class="queue-job__status">${label}</span>
        ${job.status === 'queued' || job.status === 'running' ? `<button class="queue-job__cancel" data-job="${job.id}" title="取消">×</button>` : ''}`;
      row.querySelector('.queue-job__cancel')?.addEventListener('click', () => {
        this.canvas.cancelJob(job.id);
      });
      list.appendChild(row);
    }
  }

  /* ══════════ 图片裁剪（本地 canvas 裁剪） ══════════ */

  startCrop(node) {
    const media = nodeMainMedia(node);
    if (!media) {
      store.emit('toast', '该节点还没有可裁剪的图片', 'error');
      return;
    }
    if (this.cropEl) this.cropEl.remove();
    const el = document.createElement('div');
    el.className = 'crop-overlay';
    el.innerHTML = `
      <div class="crop-overlay__panel">
        <header class="crop-overlay__head">
          <span>裁剪 · ${escapeHTML(nodeTitle(node))}</span>
          <div><button class="btn" data-crop="cancel">取消</button><button class="btn btn--primary" data-crop="apply">应用裁剪</button></div>
        </header>
        <div class="crop-stage" id="cropStage">
          <img id="cropImg" src="${media}" alt="" draggable="false" />
          <div class="crop-rect" id="cropRect" hidden></div>
        </div>
      </div>`;
    document.body.appendChild(el);
    this.cropEl = el;
    const stage = el.querySelector('#cropStage');
    const img = el.querySelector('#cropImg');
    const rectEl = el.querySelector('#cropRect');
    let start = null;
    let selection = null;
    const updateRect = () => {
      if (!selection) return;
      const r = stage.getBoundingClientRect();
      rectEl.hidden = false;
      rectEl.style.left = `${Math.min(selection.x1, selection.x2) - r.left}px`;
      rectEl.style.top = `${Math.min(selection.y1, selection.y2) - r.top}px`;
      rectEl.style.width = `${Math.abs(selection.x2 - selection.x1)}px`;
      rectEl.style.height = `${Math.abs(selection.y2 - selection.y1)}px`;
    };
    stage.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const r = stage.getBoundingClientRect();
      start = { x: e.clientX - r.left, y: e.clientY - r.top };
      selection = { x1: e.clientX, y1: e.clientY, x2: e.clientX, y2: e.clientY };
      updateRect();
    });
    stage.addEventListener('pointermove', (e) => {
      if (!start) return;
      selection.x2 = e.clientX;
      selection.y2 = e.clientY;
      updateRect();
    });
    window.addEventListener('pointerup', () => {
      start = null;
    }, { once: true });
    el.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-crop]');
      if (!btn) return;
      if (btn.dataset.crop === 'cancel') {
        el.remove();
        this.cropEl = null;
        return;
      }
      if (btn.dataset.crop === 'apply') {
        if (!selection || Math.abs(selection.x2 - selection.x1) < 12 || Math.abs(selection.y2 - selection.y1) < 12) {
          store.emit('toast', '请先在图片上框选裁剪区域');
          return;
        }
        this.applyCrop(node, img, stage, selection);
        el.remove();
        this.cropEl = null;
      }
    });
  }

  applyCrop(node, img, stage, selection) {
    const ir = img.getBoundingClientRect();
    const sr = stage.getBoundingClientRect();
    const x = Math.min(selection.x1, selection.x2) - ir.left;
    const y = Math.min(selection.y1, selection.y2) - ir.top;
    const w = Math.abs(selection.x2 - selection.x1);
    const h = Math.abs(selection.y2 - selection.y1);
    const sx = (x / ir.width) * img.naturalWidth;
    const sy = (y / ir.height) * img.naturalHeight;
    const sw = (w / ir.width) * img.naturalWidth;
    const sh = (h / ir.height) * img.naturalHeight;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(16, Math.round(sw));
    canvas.height = Math.max(16, Math.round(sh));
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, Math.max(0, sx), Math.max(0, sy), sw, sh, 0, 0, canvas.width, canvas.height);
    const dataURL = canvas.toDataURL('image/png');
    store.transaction((s) => {
      const n = s.nodes.find((x2) => x2.id === node.id);
      if (!n) return;
      const list = Array.isArray(n.data.history) ? [...n.data.history] : [];
      list.push({
        id: `crop_${Date.now()}`,
        media: dataURL,
        prompt: n.data.prompt || '',
        model: 'local-crop',
        seed: '',
        at: Date.now(),
        kind: 'image',
      });
      n.data = { ...n.data, media: dataURL, history: list, mainIndex: list.length - 1, status: 'success' };
    }, { history: true, reason: 'crop' });
    store.emit('toast', '裁剪完成，已生成新版本', 'success');
  }

  /* ══════════ 视频精确编辑（videoParams.advancedEdit*） ══════════ */

  openPrecisionEdit(node) {
    const media = nodeMainMedia(node) || node.data?.poster || '';
    if (!media) {
      store.emit('toast', '这个节点还没有可用画面', 'error');
      return;
    }
    if (this.peEl) this.peEl.remove();
    const shapes = [];
    let undoStack = [];
    let redoStack = [];
    let tool = 'arrow';
    let color = '#f87171';
    let draft = null;
    const el = document.createElement('div');
    el.className = 'pe-overlay';
    el.innerHTML = `
      <div class="pe-panel">
        <header class="pe-head">
          <span>精确编辑 · ${escapeHTML(nodeTitle(node))}</span>
          <div class="pe-actions">
            <button class="btn" data-pe="undo">↶ 撤销</button>
            <button class="btn" data-pe="redo">↷ 重做</button>
            <button class="btn" data-pe="close">关闭</button>
            <button class="btn btn--primary" data-pe="submit">保存标注</button>
          </div>
        </header>
        <div class="pe-tools">
          ${[
            ['select', '矩形'],
            ['brush', '画笔'],
            ['arrow', '箭头'],
            ['text', '文字'],
            ['erase', '橡皮'],
            ['marker', '标记'],
          ]
            .map(([k, label]) => `<button data-pe-tool="${k}">${label}</button>`)
            .join('')}
          <span class="pe-sep"></span>
          ${['#f87171', '#fbbf24', '#4ade80', '#60a5fa', '#a78bfa']
            .map((c) => `<button class="pe-color" data-pe-color="${c}" style="background:${c}"></button>`)
            .join('')}
        </div>
        <div class="pe-stage" id="peStage">
          <img id="peImg" src="${media}" alt="" draggable="false" />
          <svg id="peSvg" viewBox="0 0 1000 1000" preserveAspectRatio="none"></svg>
        </div>
        <div class="pe-foot">
          <textarea id="pePrompt" placeholder="描述需要在画面中修改的内容（可加入提示词）"></textarea>
          <button class="btn" data-pe="addPrompt">加入提示词</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    this.peEl = el;
    const stage = el.querySelector('#peStage');
    const svg = el.querySelector('#peSvg');
    const input = el.querySelector('#pePrompt');
    const norm = (e) => {
      const r = stage.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * 1000, y: ((e.clientY - r.top) / r.height) * 1000 };
    };
    const renderShapes = () => {
      svg.innerHTML = '';
      for (const sh of shapes) {
        let node = null;
        if (sh.type === 'rect') {
          node = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          node.setAttribute('x', sh.x);
          node.setAttribute('y', sh.y);
          node.setAttribute('width', sh.w);
          node.setAttribute('height', sh.h);
          node.setAttribute('fill', 'none');
          node.setAttribute('stroke', sh.color);
          node.setAttribute('stroke-width', '3');
        } else if (sh.type === 'arrow') {
          node = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          node.setAttribute('x1', sh.x1);
          node.setAttribute('y1', sh.y1);
          node.setAttribute('x2', sh.x2);
          node.setAttribute('y2', sh.y2);
          node.setAttribute('stroke', sh.color);
          node.setAttribute('stroke-width', '4');
          node.setAttribute('marker-end', 'url(#peArrow)');
        } else if (sh.type === 'brush') {
          node = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
          node.setAttribute('points', sh.points.map((p) => p.join(',')).join(' '));
          node.setAttribute('fill', 'none');
          node.setAttribute('stroke', sh.color);
          node.setAttribute('stroke-width', '5');
          node.setAttribute('stroke-linecap', 'round');
        } else if (sh.type === 'text') {
          node = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          node.setAttribute('x', sh.x);
          node.setAttribute('y', sh.y);
          node.setAttribute('fill', sh.color);
          node.setAttribute('font-size', '34');
          node.textContent = sh.text;
        } else if (sh.type === 'marker') {
          node = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          node.setAttribute('cx', sh.x);
          node.setAttribute('cy', sh.y);
          node.setAttribute('r', '22');
          node.setAttribute('fill', sh.color);
          node.setAttribute('opacity', '0.6');
        }
        if (node) svg.appendChild(node);
      }
      if (draft) {
        const n = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        n.setAttribute('cx', draft.x);
        n.setAttribute('cy', draft.y);
        n.setAttribute('r', '6');
        n.setAttribute('fill', color);
        svg.appendChild(n);
      }
    };
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = `<marker id="peArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="${color}"/></marker>`;
    svg.appendChild(defs);
    let start = null;
    let current = null;
    stage.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const p = norm(e);
      if (tool === 'erase') {
        const before = shapes.slice();
        const idx = shapes.findIndex((sh) => {
          if (sh.type === 'rect') return p.x >= sh.x && p.x <= sh.x + sh.w && p.y >= sh.y && p.y <= sh.y + sh.h;
          if (sh.type === 'marker') return Math.hypot(p.x - sh.x, p.y - sh.y) < 40;
          if (sh.type === 'text') return Math.hypot(p.x - sh.x, p.y - sh.y) < 60;
          return false;
        });
        if (idx >= 0) {
          undoStack.push(before);
          redoStack = [];
          shapes.splice(idx, 1);
          renderShapes();
        }
        return;
      }
      start = p;
      if (tool === 'rect') {
        current = { type: 'rect', x: p.x, y: p.y, w: 0, h: 0, color };
      } else if (tool === 'arrow') {
        current = { type: 'arrow', x1: p.x, y1: p.y, x2: p.x, y2: p.y, color };
      } else if (tool === 'brush') {
        current = { type: 'brush', points: [[p.x, p.y]], color };
      } else if (tool === 'marker') {
        shapes.push({ type: 'marker', x: p.x, y: p.y, color });
        renderShapes();
      } else if (tool === 'text') {
        const text = window.prompt('输入标注文字', '这里要改');
        if (text) {
          shapes.push({ type: 'text', x: p.x, y: p.y, text: text.slice(0, 30), color });
          renderShapes();
        }
        start = null;
      }
      if (current && !shapes.includes(current)) renderShapes();
    });
    stage.addEventListener('pointermove', (e) => {
      if (!start || !current) return;
      const p = norm(e);
      if (current.type === 'rect') {
        current.w = p.x - current.x;
        current.h = p.y - current.y;
      } else if (current.type === 'arrow') {
        current.x2 = p.x;
        current.y2 = p.y;
      } else if (current.type === 'brush') {
        current.points.push([p.x, p.y]);
      }
      draft = p;
      renderShapes();
    });
    const finish = () => {
      if (!current) return;
      undoStack.push(shapes.slice());
      shapes.push(current);
      current = null;
      start = null;
      redoStack = [];
      renderShapes();
    };
    stage.addEventListener('pointerup', finish);
    stage.addEventListener('pointerleave', finish);
    el.addEventListener('click', (e) => {
      const toolBtn = e.target.closest('[data-pe-tool]');
      const colorBtn = e.target.closest('[data-pe-color]');
      const act = e.target.closest('[data-pe]');
      if (toolBtn) {
        tool = toolBtn.dataset.peTool;
        el.querySelectorAll('[data-pe-tool]').forEach((b) => b.classList.toggle('is-active', b === toolBtn));
        return;
      }
      if (colorBtn) {
        color = colorBtn.dataset.peColor;
        el.querySelectorAll('[data-pe-color]').forEach((b) => b.classList.toggle('is-active', b === colorBtn));
        return;
      }
      if (!act) return;
      const a = act.dataset.pe;
      if (a === 'close') {
        el.remove();
        this.peEl = null;
      }
      if (a === 'undo') {
        if (!undoStack.length) return;
        const prev = undoStack.pop();
        redoStack.push(shapes.slice());
        shapes.length = 0;
        shapes.push(...prev);
        renderShapes();
      }
      if (a === 'redo') {
        if (!redoStack.length) return;
        const next = redoStack.pop();
        undoStack.push(shapes.slice());
        shapes.length = 0;
        shapes.push(...next);
        renderShapes();
      }
      if (a === 'addPrompt') {
        const hint = `在画面中标注了 ${shapes.length} 处（${[...new Set(shapes.map((s) => s.type))].join('/')}），请按标注区域修改。`;
        store.transaction((s) => {
          const n = s.nodes.find((x) => x.id === node.id);
          if (n) n.data = { ...n.data, prompt: `${(n.data.prompt || '').replace(/[，,。]$/, '')}${n.data.prompt ? '，' : ''}${hint}` };
        }, { history: true, reason: 'precision-prompt' });
        store.emit('toast', '已加入提示词', 'success');
      }
      if (a === 'submit') {
        store.transaction((s) => {
          const n = s.nodes.find((x) => x.id === node.id);
          if (n) n.data = { ...n.data, edits: shapes.slice() };
        }, { history: true, reason: 'precision-edit' });
        el.remove();
        this.peEl = null;
        store.emit('toast', `已保存 ${shapes.length} 处标注（本地）`, 'success');
      }
    });
    el.querySelector('[data-pe-tool="arrow"]').classList.add('is-active');
    el.querySelector('[data-pe-color="#f87171"]').classList.add('is-active');
    renderShapes();
  }

  /* ══════════ 全部生成历史（historyPanel.*） ══════════ */

  openGlobalHistory() {
    const items = [];
    for (const node of store.nodes) {
      const t = NODE_TYPES[node.type] || {};
      for (const [i, v] of (node.data?.history || []).entries()) {
        const media = v.media || v.poster;
        if (!media && !v.prompt) continue;
        items.push({
          nodeId: node.id,
          nodeTitle: nodeTitle(node),
          type: (v.kind === 'video' || node.type.includes('video') ? 'video' : 'image'),
          idx: i,
          media,
          prompt: v.prompt || '',
          model: v.model || '',
          at: v.at || 0,
        });
      }
    }
    if (this.globalHistoryEl) this.globalHistoryEl.remove();
    const tabs = ['all', 'image', 'video'];
    let tab = 'all';
    const el = document.createElement('div');
    el.className = 'history-overlay';
    el.innerHTML = `
      <div class="history-overlay__panel">
        <header class="history-overlay__head">
          <div><h3>全部生成历史</h3><span class="history-overlay__sub" id="ghSub">${items.length} 个结果</span></div>
          <div class="history-overlay__actions">
            ${tabs.map((t) => `<button class="btn" data-gh-tab="${t}">${{ all: '全部', image: '图片', video: '视频' }[t]}</button>`).join('')}
            <button class="btn" data-gh="download">全部下载</button>
            <button class="btn" data-gh="close">退出历史</button>
          </div>
        </header>
        <div class="history-overlay__grid" id="ghGrid"></div>
      </div>`;
    document.body.appendChild(el);
    this.globalHistoryEl = el;
    const render = () => {
      const list = items.filter((i) => tab === 'all' || i.type === tab);
      el.querySelector('#ghSub').textContent = `${list.length} 个结果`;
      el.querySelectorAll('[data-gh-tab]').forEach((b) => b.classList.toggle('is-active', b.dataset.ghTab === tab));
      el.querySelector('#ghGrid').innerHTML = list.length
        ? list
            .map(
              (i, k) => `<button class="history-card" data-gh-item="${k}">
                <span class="history-card__media">${i.media ? `<img src="${i.media}" alt="" />` : '<span class="history-card__empty">无媒体</span>'}</span>
                <span class="history-card__meta"><span class="history-card__model">${escapeHTML(i.nodeTitle)}</span><span class="history-card__time">${i.at ? new Date(i.at).toLocaleString('zh-CN') : ''}</span></span>
                <span class="history-card__prompt">${escapeHTML(i.prompt || '无提示词')}</span>
              </button>`,
            )
            .join('')
        : '<div class="asset-library__empty">还没有生成历史</div>';
      el.querySelectorAll('[data-gh-item]').forEach((card, k) => {
        card.addEventListener('click', () => {
          const item = list[k];
          const node = store.getNode(item.nodeId);
          setMainVersion(item.nodeId, item.idx);
          if (node) {
            store.setSelection([node.id]);
            this.vp.focusNode(node);
          }
          el.remove();
          this.globalHistoryEl = null;
          store.emit('toast', '已定位并设为主图', 'success');
        });
      });
    };
    el.addEventListener('click', (e) => {
      if (e.target === el || e.target.closest('[data-gh="close"]')) {
        el.remove();
        this.globalHistoryEl = null;
        return;
      }
      const tabBtn = e.target.closest('[data-gh-tab]');
      if (tabBtn) {
        tab = tabBtn.dataset.ghTab;
        render();
        return;
      }
      if (e.target.closest('[data-gh="download"]')) {
        items
          .filter((i) => i.media)
          .forEach((i, k) => {
            setTimeout(() => {
              const a = document.createElement('a');
              a.href = i.media;
              a.download = `${sanitize(i.nodeTitle)}-${i.idx + 1}.${i.media.startsWith('data:image/svg') ? 'svg' : 'png'}`;
              a.click();
            }, k * 120);
          });
        store.emit('toast', `已开始下载 ${items.filter((i) => i.media).length} 个结果`, 'success');
      }
    });
    render();
  }

  /* ══════════ 底部参数面板（原站 rh-canvas-compact-input-panel） ══════════ */

  bindCanvasEvents() {
    store.on('request-params', ({ id }) => this.openParamBar(id));
    store.on('confirm-video', ({ id, title }) => {
      this.showDialog({
        title: '确认生成视频',
        body: `<p style="margin:0 0 8px;font-size:12.5px;color:var(--canvas-text-secondary);line-height:1.7">
          节点「${escapeHTML(title)}」将调用 APIMart 生成视频，会消耗 API 额度（按秒计费）。
        </p>`,
        actions: [
          { id: 'cancel', label: '取消' },
          { id: 'ok', label: '继续生成', primary: true, onClick: () => this.canvas.runNode(id, { confirmed: true }) },
        ],
      });
    });
    store.on('request-preview', ({ id }) => this.openMediaPreview(store.getNode(id)));
  }

  nodeHasRefs(node) {
    return store.edges
      .filter((e) => e.target === node.id)
      .some((e) => {
        const src = store.getNode(e.source);
        return !!(src && (nodeMainMedia(src) || src.data?.poster));
      });
  }

  modelKind(node) {
    return KIND_BY_NODE[node?.type] || null;
  }

  /** 按节点类别 + 是否有上游参考图，智能列候选模型（推荐置顶） */
  smartModels(node) {
    const kind = this.modelKind(node);
    if (!kind) return [];
    return api.modelsFor(kind, { hasRefs: this.nodeHasRefs(node) });
  }

  applyRecommendedModel(node, notify = false) {
    const kind = this.modelKind(node);
    if (!kind) return '';
    const recommended = api.recommend(kind, { hasRefs: this.nodeHasRefs(node) });
    if (!recommended) return '';
    const current = nodeParams(node).model;
    if (current !== recommended) {
      setNodeParams(node.id, { model: recommended });
      if (notify) store.emit('toast', `已智能切换模型：${recommended}`, 'success');
    } else if (notify) {
      store.emit('toast', `当前已是最优模型：${recommended}`);
    }
    return recommended;
  }

  paramSchema(node) {
    const t = node?.type;
    const kind = this.modelKind(node);
    const model = (kindName, fallback) => ({
      key: 'model',
      label: '模型',
      type: 'select',
      options: api.modelsFor(kindName, { hasRefs: this.nodeHasRefs(node) }).length
        ? api.modelsFor(kindName, { hasRefs: this.nodeHasRefs(node) })
        : fallback,
    });
    if (t === 'image' || t === 'image-gen') {
      return [
        model('image', ['seedream-5-0-flash', 'seedream-4-5', 'flux-2-pro', 'gpt-image-1']),
        { key: 'ratio', label: '比例', type: 'select', options: ['smart', '1:1', '16:9', '9:16', '4:3', '3:4'] },
        { key: 'resolution', label: '分辨率', type: 'select', options: ['1K', '2K', '4K'] },
        { key: 'count', label: '数量', type: 'select', options: [1, 2, 4] },
        { key: 'style', label: '风格', type: 'select', options: ['电影感', '写实', '插画', '赛博朋克', '水彩'] },
        { key: 'seed', label: '种子', type: 'number', placeholder: '-1 随机' },
        { key: 'negative', label: '负向', type: 'text', placeholder: '不希望出现的内容' },
      ];
    }
    if (t === 'video' || t === 'video-gen' || t === 'preview-output') {
      return [
        model('video', ['seedance-2.0-mini', 'seedance-2.0', 'veo3.1-fast', 'kling-v3']),
        { key: 'ratio', label: '比例', type: 'select', options: ['16:9', '9:16', '1:1', '2.35:1'] },
        { key: 'resolution', label: '分辨率', type: 'select', options: ['720p', '1080p', '2K'] },
        { key: 'duration', label: '时长', type: 'select', options: [5, 10] },
        { key: 'seed', label: '种子', type: 'number', placeholder: '-1 随机' },
      ];
    }
    if (t === 'audio') {
      return [
        model('audio', ['tts-1', 'gpt-4o-mini-tts']),
        { key: 'audioType', label: '类型', type: 'select', options: ['语音', '环境声', '音乐', '音效'] },
        { key: 'voice', label: '音色', type: 'select', options: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] },
        { key: 'speed', label: '语速', type: 'select', options: [0.8, 1, 1.2] },
        { key: 'duration', label: '时长(s)', type: 'number' },
      ];
    }
    if (t === 'llm') {
      return [
        model('text', ['gemini-2.5-flash-lite', 'gpt-4o-mini', 'deepseek-v4-flash']),
        { key: 'temperature', label: '温度', type: 'select', options: [0.2, 0.7, 1] },
        { key: 'maxTokens', label: '上限', type: 'number' },
      ];
    }
    if (t === 'rh-ai') {
      return [
        model('image', ['seedream-5-0-flash']),
        { key: 'resolution', label: '目标', type: 'select', options: ['1080p', '2K', '4K'] },
        { key: 'strength', label: '强度', type: 'select', options: [0.3, 0.6, 0.9] },
      ];
    }
    if (t === 'stack') {
      return [
        { key: 'layout', label: '叠放', type: 'select', options: ['叠放', '横向', '纵向'] },
        { key: 'mode', label: '模式', type: 'select', options: ['顺序', '同时'] },
      ];
    }
    return [model('text', ['gemini-2.5-flash-lite'])];
  }

  buildParamBar() {
    const bar = document.createElement('div');
    bar.className = 'param-bar';
    bar.hidden = true;
    bar.innerHTML = `
      <div class="param-bar__head">
        <span class="param-bar__title" id="pbTitle">参数</span>
        <span class="param-bar__type" id="pbType"></span>
        <span style="flex:1"></span>
        <button class="param-bar__help param-bar__help--text" data-pb="recommend" title="按当前节点类型与上游参考图智能选择模型">推荐</button>
        <button class="param-bar__help" data-pb="history" title="生成历史">${icon('layers')}</button>
        <button class="param-bar__close" data-pb="close" title="关闭 (Esc)">${icon('close')}</button>
      </div>
      <div class="param-bar__prompt-row">
        <textarea class="param-bar__prompt" id="pbPrompt" rows="2" placeholder="描述你想生成的画面、镜头或声音…"></textarea>
        <div class="param-bar__prompt-actions">
          <button class="param-bar__enhance" data-pb="enhance" title="本地提示词增强">增强</button>
          <button class="param-bar__run" data-pb="run">${icon('play')}生成</button>
        </div>
      </div>
      <div class="param-bar__controls" id="pbControls"></div>
      <div class="param-hint"></div>`;
    bar.addEventListener('pointerdown', (e) => e.stopPropagation());
    bar.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-pb]');
      if (!btn) return;
      const node = store.getNode(this.paramNodeId);
      if (!node) return;
      const act = btn.dataset.pb;
      if (act === 'close') this.closeParamBar();
      if (act === 'run') this.canvas.runNode(node.id);
      if (act === 'enhance') this.enhancePrompt(node);
      if (act === 'history') this.openHistoryOverlay(node);
      if (act === 'recommend') this.applyRecommendedModel(node, true);
    });
    const prompt = bar.querySelector('#pbPrompt');
    prompt.addEventListener('input', () => {
      if (!this.paramNodeId) return;
      store.transaction((s) => {
        const n = s.nodes.find((x) => x.id === this.paramNodeId);
        if (n) n.data = { ...n.data, prompt: prompt.value };
      }, { history: false, reason: 'prompt' });
    });
    bar.querySelector('#pbControls').addEventListener('change', (e) => {
      const key = e.target.dataset.param;
      if (!key || !this.paramNodeId) return;
      let value = e.target.value;
      if (e.target.type === 'number' || typeof nodeParams(store.getNode(this.paramNodeId))[key] === 'number') {
        const n = Number(value);
        if (!Number.isNaN(n)) value = n;
      }
      setNodeParams(this.paramNodeId, { [key]: value });
    });
    this.canvas.host.appendChild(bar);
    this.paramBar = bar;
    this.paramNodeId = null;
  }

  openParamBar(id) {
    if (store.state.settings.readMode) return;
    const node = store.getNode(id);
    if (!node || node.type === 'group' || node.type === 'comment') return;
    this.paramNodeId = id;
    this.paramBar.hidden = false;
    this.syncParamBar();
  }

  closeParamBar() {
    this.paramBar.hidden = true;
    this.paramNodeId = null;
  }

  syncParamBar() {
    if (!this.paramBar || this.paramBar.hidden) return;
    const selected = store.selectedNodes();
    if (store.state.settings.readMode || (selected.length === 1 && selected[0].id !== this.paramNodeId)) {
      this.paramNodeId = selected.length === 1 ? selected[0].id : null;
      if (!this.paramNodeId) return this.closeParamBar();
    }
    const node = store.getNode(this.paramNodeId);
    if (!node) {
      this.closeParamBar();
      return;
    }
    const t = NODE_TYPES[node.type] || {};
    const params = nodeParams(node);
    this.paramBar.querySelector('#pbTitle').textContent = nodeTitle(node);
    this.paramBar.querySelector('#pbType').textContent = t.name || node.type;
    const prompt = this.paramBar.querySelector('#pbPrompt');
    if (document.activeElement !== prompt) prompt.value = node.data?.prompt || '';
    prompt.placeholder =
      node.type === 'audio' ? '描述声音、语气或歌词…' : '描述你想生成的画面、镜头或声音…';
    const controls = this.paramBar.querySelector('#pbControls');
    controls.innerHTML = (this.paramSchema(node) || [])
      .filter((f) => f && (f.type !== 'select' || (Array.isArray(f.options) && f.options.length)))
      .map((f) => {
        const value = params[f.key] ?? '';
        if (f.type === 'select') {
          return `<label class="param-field"><span>${f.label}</span><select data-param="${f.key}">${f.options
            .map((o) => `<option value="${o}"${String(o) === String(value) ? ' selected' : ''}>${o}</option>`)
            .join('')}</select></label>`;
        }
        return `<label class="param-field"><span>${f.label}</span><input data-param="${f.key}" type="${f.type}" value="${escapeHTML(
          String(value),
        )}" placeholder="${f.placeholder || ''}" /></label>`;
      })
      .join('');
    // 智能模型校正：当前模型不属于该类别 / 不支持参考图时，自动切换
    const kind = this.modelKind(node);
    if (kind) {
      const hasRefs = this.nodeHasRefs(node);
      const available = api.modelsFor(kind, { hasRefs });
      const current = params.model;
      if (available.length && (!available.includes(current) || (hasRefs && !api.supportsRef(current)))) {
        const rec = api.recommend(kind, { hasRefs });
        if (rec && rec !== current) {
          setNodeParams(node.id, { model: rec });
          this.paramBar.querySelectorAll('[data-param="model"]').forEach((sel) => {
            if ([...sel.options].some((o) => o.value === rec)) sel.value = rec;
          });
        }
      }
    }
    // 能力提示：模型 chips + 参考图兼容性
    const modelSel = this.paramBar.querySelector('[data-param="model"]');
    const hintEl = this.paramBar.querySelector('.param-hint');
    if (hintEl && node && kind) {
      const model = nodeParams(node).model;
      const chips = api.modelChips(model);
      const hasRefs = this.nodeHasRefs(node);
      const refOk = api.supportsRef(model);
      hintEl.innerHTML = `
        <span class="param-hint__rec">已按「${({ image: '出图', video: '视频', text: '文本', audio: '音频' })[kind]}」类别筛选 ${api.modelsFor(kind, { hasRefs }).length} 个可用模型</span>
        ${chips.length ? `<span class="param-hint__chips">${chips.map((c) => `<i>${c}</i>`).join('')}</span>` : ''}
        ${
          hasRefs && !refOk
            ? '<span class="param-hint__warn">该模型不支持参考图，生成时会忽略上游图片</span>'
            : hasRefs
              ? '<span class="param-hint__ok">✓ 支持使用上游图片作为参考</span>'
              : ''
        }`;
    }
    const runBtn = this.paramBar.querySelector('[data-pb="run"]');
    runBtn.disabled = node.data?.status === 'running';
  }

  enhancePrompt(node) {
    const current = String(node.data?.prompt || '').trim();
    const params = nodeParams(node);
    const style = params.style ? `${params.style}，` : '';
    const extras =
      node.type.includes('video')
        ? '缓慢推进，浅景深，稳定运镜，电影级调色'
        : node.type === 'audio'
          ? '清晰层次，空间感，无爆音'
          : '高细节，体积光，35mm 胶片质感，8K';
    const next = current ? `${current.replace(/[，,。]$/, '')}，${style}${extras}` : `${style}${extras}`;
    store.transaction((s) => {
      const n = s.nodes.find((x) => x.id === node.id);
      if (n) n.data = { ...n.data, prompt: next };
    }, { history: true, reason: 'prompt-enhance' });
    this.paramBar.querySelector('#pbPrompt').value = next;
    store.emit('toast', '提示词已增强（本地模板）', 'success');
  }

  /* ══════════ 本地素材库（assetLibrary 的本地版本） ══════════ */

  buildAssetLibrary() {
    const el = document.createElement('aside');
    el.className = 'asset-library';
    el.id = 'assetLibrary';
    el.hidden = true;
    el.innerHTML = `
      <div class="asset-library__head">
        <div><span class="asset-library__title">素材库</span><span class="asset-library__count" id="alCount"></span></div>
        <button class="icon-btn icon-btn--ghost" id="alClose" title="关闭">${icon('close')}</button>
      </div>
      <div class="asset-library__tabs">
        <button class="is-active" data-al-tab="all">全部</button>
        <button data-al-tab="image">图片</button>
        <button data-al-tab="video">视频</button>
        <button data-al-tab="audio">音频</button>
      </div>
      <label class="asset-library__search">${icon('search')}<input id="alSearch" placeholder="搜索素材…" spellcheck="false" /></label>
      <div class="asset-library__grid" id="alGrid"></div>
      <div class="asset-library__foot">点击预览 · 双击定位节点 · 拖到画布添加</div>`;
    this.canvas.host.appendChild(el);
    this.assetLibrary = el;
    this.alTab = 'all';
    this.alQuery = '';
    el.querySelector('#alClose').addEventListener('click', () => this.toggleAssetLibrary(false));
    el.querySelectorAll('[data-al-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.alTab = btn.dataset.alTab;
        this.renderAssetLibrary();
      });
    });
    el.querySelector('#alSearch').addEventListener('input', (e) => {
      this.alQuery = e.target.value;
      this.renderAssetLibrary();
    });
  }

  toggleAssetLibrary(open) {
    const next = open == null ? this.assetLibrary.hidden : open;
    this.assetLibrary.hidden = !next;
    if (next) {
      this.closeParamBar();
      this.hideMediaToolbar();
      this.renderAssetLibrary();
    }
  }

  assetItems() {
    const items = [];
    for (const node of store.nodes) {
      if (node.type === 'group' || node.type === 'comment') continue;
      const t = NODE_TYPES[node.type] || {};
      if (node.data?.media) {
        items.push({
          id: `${node.id}:main`,
          nodeId: node.id,
          type: node.type.includes('video') ? 'video' : 'image',
          media: node.data.media,
          label: nodeTitle(node),
          model: node.data?.model || '',
          at: node.data?.history?.[Number(node.data.mainIndex) || 0]?.at || null,
        });
      } else if (node.data?.poster) {
        items.push({
          id: `${node.id}:poster`,
          nodeId: node.id,
          type: node.type.includes('video') ? 'video' : 'image',
          media: node.data.poster,
          label: nodeTitle(node),
          model: node.data?.model || '',
          at: null,
        });
      }
      for (const [i, v] of (node.data?.history || []).entries()) {
        const media = v.media || v.poster;
        if (!media) continue;
        items.push({
          id: `${node.id}:h${i}`,
          nodeId: node.id,
          type: v.kind === 'video' ? 'video' : 'image',
          media,
          label: `${nodeTitle(node)} · 历史 ${i + 1}`,
          model: v.model || '',
          at: v.at || null,
        });
      }
      if (node.type === 'audio') items.push({ id: `${node.id}:audio`, nodeId: node.id, type: 'audio', media: '', label: nodeTitle(node), model: node.data?.model || '', at: null });
    }
    return items;
  }

  renderAssetLibrary() {
    if (!this.assetLibrary) return;
    const q = (this.alQuery || '').trim().toLowerCase();
    const all = this.assetItems();
    const counts = {
      all: all.length,
      image: all.filter((i) => i.type === 'image').length,
      video: all.filter((i) => i.type === 'video').length,
      audio: all.filter((i) => i.type === 'audio').length,
    };
    this.assetLibrary.querySelector('#alCount').textContent = String(all.length);
    this.assetLibrary.querySelectorAll('[data-al-tab]').forEach((b) => {
      b.classList.toggle('is-active', b.dataset.alTab === this.alTab);
      b.textContent = `${{ all: '全部', image: '图片', video: '视频', audio: '音频' }[b.dataset.alTab]} ${
        counts[b.dataset.alTab] || ''
      }`.trim();
    });
    const items = all.filter(
      (i) =>
        (this.alTab === 'all' || i.type === this.alTab) &&
        (!q || i.label.toLowerCase().includes(q) || i.model.toLowerCase().includes(q)),
    );
    const grid = this.assetLibrary.querySelector('#alGrid');
    grid.innerHTML = '';
    if (!items.length) {
      grid.innerHTML = '<div class="asset-library__empty">还没有素材，拖图片/视频进画布或先点「生成」</div>';
      return;
    }
    for (const item of items) {
      const cell = document.createElement('button');
      cell.className = 'asset-cell';
      cell.draggable = true;
      cell.innerHTML = `
        <span class="asset-cell__thumb">${
          item.media
            ? `<img src="${item.media}" alt="" />`
            : `<span class="asset-cell__audio">${icon('audio')}</span>`
        }${item.type === 'video' ? `<span class="asset-cell__badge">视频</span>` : ''}</span>
        <span class="asset-cell__label">${escapeHTML(item.label)}</span>`;
      cell.addEventListener('click', () => {
        const node = store.getNode(item.nodeId);
        if (node) {
          store.setSelection([node.id]);
          this.vp.focusNode(node);
        }
      });
      cell.addEventListener('dblclick', () => this.openMediaPreview(store.getNode(item.nodeId)));
      cell.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData(
          'application/x-canvas-asset',
          JSON.stringify({ media: item.media, type: item.type, label: item.label, model: item.model }),
        );
        e.dataTransfer.effectAllowed = 'copy';
      });
      grid.appendChild(cell);
    }
  }

  /* ══════════ 媒体预览（mediaPreview.*） ══════════ */

  openMediaPreview(node) {
    if (!node) return;
    const media = nodeMainMedia(node) || node.data?.poster || '';
    if (!media) {
      store.emit('toast', '这个节点还没有可预览的媒体', 'error');
      return;
    }
    const t = NODE_TYPES[node.type] || {};
    const ver = nodeCurrentVersion(node);
    if (this.previewEl) this.previewEl.remove();
    const el = document.createElement('div');
    el.className = 'preview-overlay';
    el.innerHTML = `
      <div class="preview-overlay__panel">
        <header class="preview-overlay__head">
          <div>
            <h3>${escapeHTML(nodeTitle(node))}</h3>
            <span>${t.name || node.type}${node.type.includes('video') ? ' · 以关键帧预览' : ''}</span>
          </div>
          <div class="preview-overlay__actions">
            <button class="btn" data-pv="download">下载</button>
            <button class="btn" data-pv="history">生成历史</button>
            <button class="btn" data-pv="close">关闭</button>
          </div>
        </header>
        <div class="preview-overlay__media">${
          node.type.includes('video') && /^https?:.*\.(mp4|webm|mov)/i.test(media)
            ? `<video src="${media}" controls autoplay playsinline></video>`
            : `<img src="${media}" alt="" />`
        }</div>
        <div class="preview-overlay__info">
          <div class="info-row"><span>名称</span><b>${escapeHTML(nodeTitle(node))}</b></div>
          <div class="info-row"><span>类型</span><b>${escapeHTML(t.name || node.type)}</b></div>
          <div class="info-row"><span>来源</span><b>${node.data?.history?.length ? '本地生成' : '导入 / 上传'}</b></div>
          <div class="info-row"><span>模型</span><b>${escapeHTML(ver?.model || node.data?.model || '—')}</b></div>
          <div class="info-row"><span>完成时间</span><b>${
            ver?.at ? new Date(ver.at).toLocaleString('zh-CN') : '—'
          }</b></div>
        </div>
      </div>`;
    el.addEventListener('click', (e) => {
      if (e.target === el) this.closePreview();
      const btn = e.target.closest('[data-pv]');
      if (!btn) return;
      if (btn.dataset.pv === 'close') this.closePreview();
      if (btn.dataset.pv === 'download') this.downloadNodeMedia(node);
      if (btn.dataset.pv === 'history') {
        this.closePreview();
        this.openHistoryOverlay(node);
      }
    });
    document.body.appendChild(el);
    this.previewEl = el;
  }

  closePreview() {
    if (this.previewEl) {
      this.previewEl.remove();
      this.previewEl = null;
    }
  }

  /* ══════════ 图片/视频节点工具条（逆向 imageToolbar.* 的本地子集） ══════════ */

  buildMediaToolbar() {
    const bar = document.createElement('div');
    bar.className = 'media-toolbar';
    bar.hidden = true;
    bar.innerHTML = `
      <button data-mt="download" title="下载">${icon('download')}</button>
      <button data-mt="copy" title="复制图片">${icon('copy')}</button>
      <span class="media-toolbar__sep"></span>
      <button data-mt="flipx" title="水平翻转">${icon('chevron')}</button>
      <button data-mt="flipy" title="垂直翻转">${icon('chevron')}</button>
      <button data-mt="rotate" title="旋转 90°">${icon('refresh')}</button>
      <span class="media-toolbar__sep"></span>
      <button data-mt="adjust" title="调整颜色">${icon('magnet')}</button>
      <button data-mt="crop" title="裁剪">${icon('fit')}</button>
      <button data-mt="precision" title="精确编辑（视频）">${icon('comment')}</button>
      <button data-mt="history" title="生成历史">${icon('layers')}</button>
      <button data-mt="info" title="媒体信息">${icon('search')}</button>
      <span class="media-toolbar__sep"></span>
      <button data-mt="annotate" title="标注">${icon('comment')}</button>`;
    bar.addEventListener('pointerdown', (e) => e.stopPropagation());
    bar.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-mt]');
      if (!btn || !this.mediaToolbarNode) return;
      const node = store.getNode(this.mediaToolbarNode);
      if (!node) return;
      const act = btn.dataset.mt;
      if (act === 'download') this.downloadNodeMedia(node);
      if (act === 'copy') this.copyNodeImage(node);
      if (act === 'flipx') setNodeFilter(node.id, { flipX: !nodeFilters(node).flipX });
      if (act === 'flipy') setNodeFilter(node.id, { flipY: !nodeFilters(node).flipY });
      if (act === 'rotate') setNodeFilter(node.id, { rotate: (nodeFilters(node).rotate || 0) + 90 });
      if (act === 'adjust') this.toggleAdjustPopover(node);
      if (act === 'crop') this.startCrop(node);
      if (act === 'precision') this.openPrecisionEdit(node);
      if (act === 'history') this.openHistoryOverlay(node);
      if (act === 'recommend') this.applyRecommendedModel(node, true);
      if (act === 'info') this.showMediaInfo(node);
      if (act === 'annotate') {
        store.setSetting('annotateMode', true);
        store.emit('toast', '标注模式：拖拽画箭头，或切到文字工具点击画布');
      }
    });
    this.canvas.host.appendChild(bar);
    this.mediaToolbar = bar;
    this.mediaToolbarNode = null;
    this.mediaHoverTimer = null;
    this.canvas.host.addEventListener('pointermove', (e) => this.updateMediaToolbar(e));
    this.canvas.host.addEventListener('pointerleave', () => {
      if (this.mediaToolbar && !this.mediaToolbar.matches(':hover')) this.hideMediaToolbar();
    });
  }

  updateMediaToolbar(e) {
    if (store.state.settings.readMode || store.state.settings.annotateMode) return this.hideMediaToolbar();
    if (this.canvas.interaction?.type === 'drag' || this.canvas.interaction?.type === 'connect') return this.hideMediaToolbar();
    if (e.target.closest('.media-toolbar, .adjust-popover, .annotate-bar, .menu')) return;
    const nodeEl = e.target.closest('.node');
    if (!nodeEl) {
      clearTimeout(this.mediaHoverTimer);
      this.mediaHoverTimer = setTimeout(() => {
        if (!this.mediaToolbar.matches(':hover')) this.hideMediaToolbar();
      }, 220);
      return;
    }
    const id = nodeEl.dataset.id;
    const node = store.getNode(id);
    if (!node || node.type === 'group' || node.type === 'comment') return this.hideMediaToolbar();
    this.mediaToolbarNode = id;
    this.positionMediaToolbar(node);
    this.mediaToolbar.hidden = false;
  }

  /** 浮动工具条不要压住顶部标题栏（header 高度约 60） */
  safeToolbarTop(top, height, scale) {
    const minTop = 64 + height * scale + 8;
    const maxTop = this.canvas.host.clientHeight - 8;
    return Math.max(minTop, Math.min(maxTop, top));
  }

  /** 浮动工具条不要跑出左右边界（节点/编组在视口外时贴边显示） */
  safeToolbarLeft(left, width, scale) {
    const half = (width * scale) / 2;
    const minLeft = 72 + half;
    const maxLeft = this.canvas.host.clientWidth - 16 - half;
    return Math.max(minLeft, Math.min(maxLeft, left));
  }

  positionMediaToolbar(node) {
    const w = node.w || 380;
    const local = this.vp.flowToLocal(node.x + w / 2, node.y);
    const scale = this.canvas.uiScale ? this.canvas.uiScale() : Math.max(0.4, Math.min(1, this.vp.zoom));
    const selected = store.selectedNodes();
    const nodeToolbarVisible =
      this.canvas.toolbar && !this.canvas.toolbar.hidden && selected.length === 1 && selected[0].id === node.id;
    // 选中节点的操作条也在节点上方，这里把媒体工具条再抬高一层，避免重叠
    const lift = nodeToolbarVisible ? 30 * scale + 8 : 0;
    this.mediaToolbar.style.left = `${this.safeToolbarLeft(local.x, this.mediaToolbar.offsetWidth || 290, scale)}px`;
    this.mediaToolbar.style.top = `${this.safeToolbarTop(local.y - 8 - lift, 30, scale)}px`;
    this.mediaToolbar.style.transform = `translate(-50%, -100%) scale(${scale})`;
    this.mediaToolbar.style.transformOrigin = '50% 100%';
  }

  hideMediaToolbar() {
    if (this.mediaToolbar) this.mediaToolbar.hidden = true;
    this.mediaToolbarNode = null;
  }

  async downloadNodeMedia(node) {
    const media = nodeMainMedia(node) || node.data?.poster || '';
    if (!media) {
      store.emit('toast', '该节点还没有可下载的媒体', 'error');
      return;
    }
    const isVideo = node.type.includes('video') || node.data?.kind === 'video';
    const ext = isVideo ? 'mp4' : media.startsWith('data:image/svg') ? 'svg' : 'png';
    const name = `${sanitize(nodeTitle(node))}.${ext}`;
    if (/^https?:/.test(media)) {
      try {
        const blob = await (await fetch(media)).blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        store.emit('toast', '已开始下载', 'success');
        return;
      } catch {
        window.open(media, '_blank', 'noopener');
        store.emit('toast', '已在新标签页打开（跨域资源）');
        return;
      }
    }
    const a = document.createElement('a');
    a.href = media;
    a.download = name;
    a.click();
    store.emit('toast', '已开始下载', 'success');
  }

  async copyNodeImage(node) {
    const media = nodeMainMedia(node);
    if (!media) {
      store.emit('toast', '该节点还没有图片', 'error');
      return;
    }
    if (node.type.includes('video')) {
      store.emit('toast', '视频节点不支持复制图片', 'error');
      return;
    }
    try {
      const blob = await dataURLToPngBlob(media);
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      store.emit('toast', '图片已复制到剪贴板', 'success');
    } catch (err) {
      store.emit('toast', '复制失败（需要剪贴板权限）', 'error');
    }
  }

  /* ── 生成历史浮层（nodeOutputHistory.*） ────────────────────────── */

  openHistoryOverlay(node) {
    const history = node.data?.history || [];
    if (!history.length) {
      store.emit('toast', '还没有生成历史，先点「生成」试试');
      return;
    }
    if (this.historyOverlay) this.historyOverlay.remove();
    const overlay = document.createElement('div');
    overlay.className = 'history-overlay';
    const mainIndex = Number(node.data?.mainIndex) || 0;
    overlay.innerHTML = `
      <div class="history-overlay__panel">
        <header class="history-overlay__head">
          <div>
            <h3>生成历史</h3>
            <span class="history-overlay__sub">${escapeHTML(nodeTitle(node))} · ${history.length} 个结果</span>
          </div>
          <div class="history-overlay__actions">
            <button class="btn" data-ho="download-all">全部下载</button>
            <button class="btn" data-ho="close">退出历史</button>
          </div>
        </header>
        <div class="history-overlay__grid">
          ${history
            .map((v, i) => {
              const ver = history[history.length - 1 - i];
              const idx = history.length - 1 - i;
              const isMain = idx === mainIndex;
              return `<button class="history-card${isMain ? ' is-main' : ''}" data-idx="${idx}">
                <span class="history-card__media">${
                  ver.media
                    ? `<img src="${ver.media}" alt="" />`
                    : '<span class="history-card__empty">无媒体</span>'
                }</span>
                <span class="history-card__meta">
                  <span class="history-card__model">${escapeHTML(ver.model || 'local-demo')}</span>
                  <span class="history-card__time">${new Date(ver.at || Date.now()).toLocaleString('zh-CN')}</span>
                </span>
                <span class="history-card__prompt">${escapeHTML(ver.prompt || '无提示词')}</span>
                ${isMain ? '<span class="history-card__badge">当前主图</span>' : ''}
              </button>`;
            })
            .join('')}
        </div>
      </div>`;
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.closeHistoryOverlay();
      const close = e.target.closest('[data-ho="close"]');
      if (close) this.closeHistoryOverlay();
      const all = e.target.closest('[data-ho="download-all"]');
      if (all) {
        history.forEach((v, i) => {
          if (!v.media) return;
          setTimeout(() => {
            const a = document.createElement('a');
            a.href = v.media;
            a.download = `${sanitize(nodeTitle(node))}-${i + 1}.${
              v.media.startsWith('data:image/svg') ? 'svg' : 'png'
            }`;
            a.click();
          }, i * 120);
        });
        store.emit('toast', `已开始下载 ${history.filter((v) => v.media).length} 个结果`, 'success');
      }
      const card = e.target.closest('[data-idx]');
      if (card) {
        setMainVersion(node.id, Number(card.dataset.idx));
        this.closeHistoryOverlay();
        store.emit('toast', '已设为主图', 'success');
      }
    });
    document.body.appendChild(overlay);
    this.historyOverlay = overlay;
  }

  closeHistoryOverlay() {
    if (this.historyOverlay) {
      this.historyOverlay.remove();
      this.historyOverlay = null;
    }
  }

  /* ── 媒体信息 ───────────────────────────────────────────────────── */

  showMediaInfo(node) {
    const ver = nodeCurrentVersion(node);
    const media = nodeMainMedia(node);
    const img = node.type.includes('video') ? null : new Image();
    const dims = new Promise((resolve) => {
      if (!img) return resolve('');
      img.onload = () => resolve(`${img.naturalWidth} × ${img.naturalHeight}`);
      img.onerror = () => resolve('未知');
      img.src = media;
    });
    dims.then((size) => {
      const sizeText = media.startsWith('data:')
        ? `${(Math.round((media.length * 3) / 4 / 1024 * 10) / 10)} KB`
        : '—';
      const rows = [
        ['节点类型', (NODE_TYPES[node.type] || {}).name || node.type],
        ['媒体尺寸', size || '—'],
        ['数据大小', sizeText],
        ['模型', ver?.model || node.data?.model || 'local-demo'],
        ['种子', ver?.seed || node.data?.seed || '—'],
        ['生成时间', ver?.at ? new Date(ver.at).toLocaleString('zh-CN') : '—'],
        ['提示词', ver?.prompt || node.data?.prompt || '—'],
      ];
      this.showDialog({
        title: '媒体信息',
        body: `<div class="info-table">${rows
          .map(([k, v]) => `<div class="info-row"><span>${k}</span><b>${escapeHTML(String(v))}</b></div>`)
          .join('')}</div>`,
      });
    });
  }

  /* ── 颜色调整 ───────────────────────────────────────────────────── */

  buildAdjustPopover() {
    const el = document.createElement('div');
    el.className = 'adjust-popover';
    el.hidden = true;
    el.innerHTML = `
      <div class="adjust-popover__head"><span>调整</span><button data-adj="reset">重置</button></div>
      ${['brightness', 'contrast', 'saturate']
        .map(
          (k) => `<label class="adjust-row"><span>${{ brightness: '亮度', contrast: '对比度', saturate: '饱和度' }[k]}</span>
            <input type="range" min="40" max="180" step="1" data-adj-key="${k}" />
            <b data-adj-val="${k}">100</b></label>`,
        )
        .join('')}`;
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('input', (e) => {
      const key = e.target.dataset.adjKey;
      if (!key || !this.adjustNode) return;
      const value = Number(e.target.value);
      setNodeFilter(this.adjustNode, { [key]: value });
      el.querySelector(`[data-adj-val="${key}"]`).textContent = String(value);
    });
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-adj="reset"]') && this.adjustNode) {
        setNodeFilter(this.adjustNode, { brightness: 100, contrast: 100, saturate: 100 });
        this.toggleAdjustPopover(store.getNode(this.adjustNode));
      }
    });
    this.canvas.host.appendChild(el);
    this.adjustPopover = el;
  }

  toggleAdjustPopover(node) {
    if (!node) return;
    if (!this.adjustPopover.hidden && this.adjustNode === node.id) {
      this.adjustPopover.hidden = true;
      return;
    }
    this.adjustNode = node.id;
    const f = nodeFilters(node);
    ['brightness', 'contrast', 'saturate'].forEach((k) => {
      const input = this.adjustPopover.querySelector(`[data-adj-key="${k}"]`);
      input.value = String(f[k]);
      this.adjustPopover.querySelector(`[data-adj-val="${k}"]`).textContent = String(f[k]);
    });
    const local = this.vp.flowToLocal(node.x + (node.w || 380) / 2, node.y + (node.h || 220) + 30);
    this.adjustPopover.hidden = false;
    this.adjustPopover.style.left = `${local.x}px`;
    this.adjustPopover.style.top = `${local.y}px`;
    this.adjustPopover.style.transform = `translate(-50%, 0) scale(${this.canvas.uiScale()})`;
    this.adjustPopover.style.transformOrigin = '50% 0';
  }

  /* ── 标注工具条（annotate.*） ───────────────────────────────────── */

  buildAnnotateBar() {
    const bar = document.createElement('div');
    bar.className = 'annotate-bar';
    bar.hidden = true;
    bar.innerHTML = `
      <span class="annotate-bar__label">标注</span>
      <button data-at="arrow" title="箭头">${icon('chevron')}</button>
      <button data-at="text" title="文字">${icon('text')}</button>
      <span class="annotate-bar__sep"></span>
      ${['#f87171', '#fbbf24', '#4ade80', '#60a5fa', '#f472b6', '#ffffff']
        .map((c) => `<button class="annotate-bar__color" data-acolor="${c}" style="background:${c}"></button>`)
        .join('')}
      <span class="annotate-bar__sep"></span>
      <label class="annotate-bar__size" title="文字字号">
        字号
        <select data-asize>
          ${[14, 18, 20, 24, 32, 48].map((n) => `<option value="${n}">${n}</option>`).join('')}
        </select>
      </label>
      <span class="annotate-bar__sep"></span>
      <button data-at="delete" class="annotate-bar__delete" title="删除选中标注">${icon('trash')}</button>
      <button data-at="clear" title="清空全部标注">${icon('close')}</button>
      <button data-at="exit" class="annotate-bar__exit">退出标注</button>`;
    bar.addEventListener('pointerdown', (e) => e.stopPropagation());
    bar.addEventListener('click', (e) => {
      const tool = e.target.closest('[data-at]');
      const color = e.target.closest('[data-acolor]');
      if (color) {
        const applied = this.canvas.updateSelectedAnnotation({ color: color.dataset.acolor });
        if (!applied) store.setSetting('annotateColor', color.dataset.acolor);
        this.syncAnnotateBar();
        return;
      }
      if (tool) {
        const act = tool.dataset.at;
        if (act === 'arrow' || act === 'text') store.setSetting('annotateTool', act);
        if (act === 'delete') this.canvas.deleteSelectedAnnotation();
        if (act === 'clear') {
          clearAnnotations();
          this.canvas.selectAnnotation(null);
        }
        if (act === 'exit') store.setSetting('annotateMode', false);
      }
      this.syncAnnotateBar();
    });
    bar.querySelector('[data-asize]').addEventListener('change', (e) => {
      const size = Number(e.target.value) || 20;
      if (!this.canvas.updateSelectedAnnotation({ size })) store.setSetting('annotateSize', size);
      this.syncAnnotateBar();
    });
    this.canvas.host.appendChild(bar);
    this.annotateBar = bar;
  }

  applyAnnotate(on) {
    document.body.classList.toggle('is-annotating', !!on);
    if (this.annotateBar) this.annotateBar.hidden = !on;
    if (on) {
      this.hideMediaToolbar();
      this.closeParamBar();
    } else if (this.canvas) {
      this.canvas.selectAnnotation(null);
    }
    this.syncAnnotateBar();
  }

  syncAnnotateBar() {
    if (!this.annotateBar) return;
    const tool = store.state.settings.annotateTool || 'arrow';
    const selectedId = this.canvas.selectedAnnotationId;
    const selected = (store.state.annotations || []).find((a) => a.id === selectedId) || null;
    const color = selected?.color || store.state.settings.annotateColor || '#f87171';
    const size = selected?.size || Number(store.state.settings.annotateSize) || 20;
    this.annotateBar.querySelectorAll('[data-at="arrow"], [data-at="text"]').forEach((b) => {
      b.classList.toggle('is-active', !selected && b.dataset.at === tool);
    });
    this.annotateBar.querySelectorAll('[data-acolor]').forEach((b) => {
      b.classList.toggle('is-active', b.dataset.acolor === color);
    });
    const sizeSel = this.annotateBar.querySelector('[data-asize]');
    if (sizeSel) {
      if ([...sizeSel.options].some((o) => Number(o.value) === Number(size))) sizeSel.value = String(size);
      sizeSel.disabled = !!selected && selected.type !== 'text';
    }
    const del = this.annotateBar.querySelector('[data-at="delete"]');
    if (del) del.classList.toggle('is-disabled', !selected);
    this.annotateBar.classList.toggle('has-selection', !!selected);
  }

  /** 点击画布空白：关闭所有弹窗/浮层（参数面板、菜单、历史、对话框等） */
  closeAllPopups() {
    this.closeParamBar();
    this.hideMediaToolbar();
    if (this.adjustPopover) this.adjustPopover.hidden = true;
    if (this.historyOverlay) this.closeHistoryOverlay();
    if (this.genericDialog) {
      this.genericDialog.remove();
      this.genericDialog = null;
    }
    if (this.apiPanel && !this.apiPanel.hidden) this.openApiPanel(false);
    if (this.assetLibrary && !this.assetLibrary.hidden) this.toggleAssetLibrary(false);
    if (this.queuePanel && !this.queuePanel.hidden) this.toggleQueuePanel(false);
    if (this.nodeManager && !this.nodeManager.hidden && !store.state.settings.nodeManagerOpen) this.nodeManager.hidden = true;
    if (this.previewEl) this.closePreview();
    if (this.cropEl) {
      this.cropEl.remove();
      this.cropEl = null;
    }
    if (this.peEl) {
      this.peEl.remove();
      this.peEl = null;
    }
    document.querySelectorAll('.organize-prompt').forEach((el) => el.remove());
    if (this.searchDialog) this.searchDialog.hidden = true;
    if (this.shortcutsEl) this.shortcutsEl.hidden = true;
    if (this.addPanel) this.addPanel.hidden = true;
    ['#moreMenu', '#themeMenu', '#alignMenu', '#contextMenu'].forEach((sel) => {
      const el = document.querySelector(sel);
      if (el) el.hidden = true;
    });
    if (this.menuEl) this.menuEl.hidden = true;
  }

  /* ── 通用弹层 ───────────────────────────────────────────────────── */

  showDialog({ title, body, actions = [] }) {
    if (this.genericDialog) this.genericDialog.remove();
    const backdrop = document.createElement('div');
    backdrop.className = 'dialog-backdrop';
    backdrop.innerHTML = `<div class="dialog generic-dialog">
      <div class="generic-dialog__head"><h3>${escapeHTML(title)}</h3><button class="icon-btn icon-btn--ghost" data-dlg="close">${icon('close')}</button></div>
      <div class="generic-dialog__body">${body}</div>
      ${actions.length ? `<div class="generic-dialog__actions">${actions.map((a) => `<button class="btn ${a.primary ? 'btn--primary' : ''}" data-dlg-act="${a.id}">${a.label}</button>`).join('')}</div>` : ''}
    </div>`;
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop || e.target.closest('[data-dlg="close"]')) {
        backdrop.remove();
        this.genericDialog = null;
      }
      const act = e.target.closest('[data-dlg-act]');
      if (act) {
        const found = actions.find((a) => a.id === act.dataset.dlgAct);
        backdrop.remove();
        this.genericDialog = null;
        found?.onClick?.();
      }
    });
    document.body.appendChild(backdrop);
    this.genericDialog = backdrop;
  }

  /* ── top bar ─────────────────────────────────────────────────────── */

  bindTopbar() {
    $$('[data-tool]').forEach((btn) => {
      btn.addEventListener('click', () => store.setTool(btn.dataset.tool));
    });
    $('#addNodeBtn').addEventListener('click', () => this.openAddPanel());
    $('#closeAddPanel').addEventListener('click', () => this.closeAddPanel());
    $('#addPanelSearch').addEventListener('input', (e) => this.buildAddPanel(e.target.value));
    $('#undoBtn').addEventListener('click', () => store.undo());
    $('#redoBtn').addEventListener('click', () => store.redo());
    $('#groupBtn').addEventListener('click', () => this.canvas.groupSelection());
    $('#tidyBtn').addEventListener('click', () => this.canvas.tidy());
    $('#annotateBtn').addEventListener('click', () => {
      store.setSetting('annotateMode', !store.state.settings.annotateMode);
    });
    $('#assetsBtn').addEventListener('click', () => this.toggleAssetLibrary());
    $('#queueBtn').addEventListener('click', () => this.toggleQueuePanel());
    $('#paramsBtn').addEventListener('click', () => {
      const sel = store.selectedNodes()[0];
      if (sel) this.openParamBar(sel.id);
      else store.emit('toast', '先选中一个节点');
    });
    $('#alignBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      const r = e.currentTarget.getBoundingClientRect();
      this.toggleMenu(this.alignMenu, r.right + 8, r.top - 8);
    });
    $('#gridBtn').addEventListener('click', () => {
      store.setSetting('snapGrid', !store.state.settings.snapGrid);
    });
    $('#snapBtn').addEventListener('click', () => {
      store.setSetting('guides', !store.state.settings.guides);
    });
    $('#searchBtn').addEventListener('click', () => this.openNodeSearch());
    $('#apiBtn').addEventListener('click', () => this.openApiPanel());
    $('#searchBtn2').addEventListener('click', () => this.toggleNodeManager());
    $('#minimapBtn').addEventListener('click', () => {
      store.setSetting('minimap', !store.state.settings.minimap);
    });
    $('#edgesBtn').addEventListener('click', () => {
      store.setSetting('edgesHidden', !store.state.settings.edgesHidden);
    });
    $('#gridToggleBtn').addEventListener('click', () => {
      store.setSetting('gridVisible', !store.state.settings.gridVisible);
    });

    // theme switcher (recovered: dark / light / eyeCare)
    const themeMenu = $('#themeMenu');
    $('#themeBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      const r = e.currentTarget.getBoundingClientRect();
      this.toggleMenu(themeMenu, r.right - 208, r.bottom + 8);
    });
    themeMenu.addEventListener('click', (e) => {
      const item = e.target.closest('[data-theme]');
      if (!item) return;
      themeMenu.hidden = true;
      store.setSetting('theme', item.dataset.theme);
    });

    // more menu
    $('#moreBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      const menu = $('#moreMenu');
      const r = e.currentTarget.getBoundingClientRect();
      menu.hidden = false;
      menu.style.position = 'fixed';
      menu.style.top = `${r.bottom + 8}px`;
      menu.style.left = `${Math.min(window.innerWidth - 234, r.right - 208)}px`;
    });
    document.addEventListener('pointerdown', (e) => {
      if (!e.target.closest('.menu') && !e.target.closest('#moreBtn') && !e.target.closest('#themeBtn')) {
        $('#moreMenu').hidden = true;
        themeMenu.hidden = true;
      }
    });
    $('#moreMenu').addEventListener('click', (e) => {
      const item = e.target.closest('[data-action]');
      if (!item) return;
      $('#moreMenu').hidden = true;
      const action = item.dataset.action;
      if (action === 'export') this.exportJSON();
      if (action === 'import') $('#importInput').click();
      if (action === 'png') this.exportPNG();
      if (action === 'theme') {
        store.setSetting('theme', store.state.settings.theme === 'dark' ? 'light' : 'dark');
      }
      if (action === 'organize-left') this.runOrganize('left');
      if (action === 'organize-center') this.runOrganize('center');
      if (action === 'organize-right') this.runOrganize('right');
      if (action === 'nodeManager') this.toggleNodeManager();
      if (action === 'assets') this.toggleAssetLibrary();
      if (action === 'queue') this.toggleQueuePanel();
      if (action === 'globalHistory') this.openGlobalHistory();
      if (action === 'read') store.setSetting('readMode', !store.state.settings.readMode);
      if (action === 'shortcuts') this.openShortcuts();
      if (action === 'interaction') {
        store.setSetting(
          'interactionMode',
          store.state.settings.interactionMode === 'comfyui' ? 'rhtv' : 'comfyui',
        );
      }
      if (action === 'demo') {
        store.loadDemo();
        requestAnimationFrame(() => this.vp.fitView({ padding: 90, maxZoom: 0.9 }));
        store.emit('toast', '已载入示例画布', 'success');
      }
      if (action === 'clear') {
        store.clear();
        store.emit('toast', '画布已清空');
      }
    });
    $('#emptyAdd').addEventListener('click', () => this.openAddPanel());
    $('#emptyDemo').addEventListener('click', () => {
      store.loadDemo();
      requestAnimationFrame(() => this.vp.fitView({ padding: 90, maxZoom: 0.9 }));
    });
  }

  bindDocumentMeta() {
    const title = $('#docTitle');
    title.value = store.state.title;
    title.addEventListener('change', () => {
      store.transaction((s) => {
        s.title = title.value.trim() || '未命名画布';
      }, { history: false, reason: 'title' });
      store.emit('toast', '画布名称已更新');
    });
    title.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') title.blur();
    });
    store.on('change', ({ reason }) => {
      if (reason && reason !== 'title' && document.activeElement !== title) title.value = store.state.title;
    });
    store.on('dirty', () => this.setSaveStatus('保存中…', 'is-saving'));
    store.on('saved', () => this.setSaveStatus('已保存', 'is-saved'));
  }

  setSaveStatus(text, cls) {
    const elx = $('#saveStatus');
    if (!elx) return;
    elx.textContent = text;
    elx.className = `doc__status ${cls || ''}`;
  }

  /* ── menus ───────────────────────────────────────────────────────── */

  bindMenus() {
    this.alignMenu.addEventListener('click', (e) => {
      const item = e.target.closest('[data-align]');
      if (!item) return;
      this.alignMenu.hidden = true;
      this.canvas.align(item.dataset.align);
    });
    this.menuEl.addEventListener('click', (e) => {
      const item = e.target.closest('[data-menu]');
      if (!item) return;
      const action = item.dataset.menu;
      const payload = JSON.parse(item.dataset.payload || '{}');
      this.menuEl.hidden = true;
      this.runMenuAction(action, payload);
    });
    document.addEventListener('pointerdown', (e) => {
      if (!e.target.closest('#contextMenu') && !e.target.closest('#alignMenu')) {
        this.menuEl.hidden = true;
        this.alignMenu.hidden = true;
      }
    });
    store.on('context-menu', (detail) => this.openContextMenu(detail));
    store.on('request-add-node', (pending) => this.openAddPanel(pending));
  }

  toggleMenu(menu, x, y) {
    if (!menu.hidden) {
      menu.hidden = true;
      return;
    }
    menu.hidden = false;
    menu.style.position = 'fixed';
    menu.style.left = `${Math.max(8, Math.min(window.innerWidth - 230, x))}px`;
    menu.style.top = `${Math.max(8, Math.min(window.innerHeight - 260, y))}px`;
  }

  openContextMenu(detail) {
    const { kind, id, x, y } = detail;
    const items = [];
    if (kind === 'pane') {
      items.push({
        label: '添加节点',
        kbd: 'N',
        menu: 'add',
        payload: { flow: detail.flow },
      });
      items.push({ label: '粘贴', kbd: '⌘V', menu: 'paste', payload: { flow: detail.flow } });
      items.push({ sep: true });
      items.push({ label: '全选', kbd: '⌘A', menu: 'select-all' });
      items.push({ label: '适配画布', kbd: '⇧1', menu: 'fit' });
      items.push({ label: '重置为 100%', kbd: '⌘0', menu: 'reset-zoom' });
      items.push({ label: '整理画布', menu: 'tidy' });
      items.push({ label: '全部收起节点', menu: 'collapse-all' });
      items.push({ label: '全部展开节点', menu: 'expand-all' });
      items.push({ label: '全部展开图片', menu: 'expand-images' });
      items.push({ label: '全部展开视频', menu: 'expand-videos' });
      items.push({ sep: true });
      items.push({ label: store.state.settings.minimap ? '隐藏小地图' : '显示小地图', menu: 'toggle-minimap' });
      items.push({ label: '清空画布', menu: 'clear', danger: true });
    } else if (kind === 'node') {
      const node = store.getNode(id);
      if (!node) return;
      items.push({ label: '聚焦节点', kbd: 'F', menu: 'focus', payload: { id } });
      items.push({ label: '重命名', menu: 'rename', payload: { id } });
      if (node.type !== 'group' && node.type !== 'comment') {
        items.push({ label: '生成历史', menu: 'node-history', payload: { id } });
        items.push({ label: '媒体信息', menu: 'media-info', payload: { id } });
        if (!node.type.includes('video')) {
          items.push({ label: '复制图片', menu: 'copy-image', payload: { id } });
        }
        items.push({ label: '下载媒体', menu: 'download-media', payload: { id } });
      }
      if (node.type === 'group') {
        items.push({ label: '执行编组', menu: 'execute-group', payload: { id } });
      }
      items.push({ label: '复制节点', kbd: '⌘D', menu: 'duplicate', payload: { id } });
      if (node.type !== 'group') {
        items.push({
          label: node.data?.collapsed ? '展开节点' : '收起节点',
          menu: node.data?.collapsed ? 'expand-node' : 'collapse-node',
          payload: { id },
        });
      }
      items.push({ label: '复制', kbd: '⌘C', menu: 'copy', payload: { id } });
      items.push({ sep: true });
      items.push({ label: node.type === 'group' ? '取消编组' : '编组', kbd: '⌘G', menu: node.type === 'group' ? 'ungroup' : 'group', payload: { id } });
      items.push({ label: '置顶', menu: 'bring-front', payload: { id } });
      items.push({ label: '断开所有连线', menu: 'disconnect', payload: { id } });
      items.push({ sep: true });
      items.push({ label: '删除节点', kbd: '⌫', menu: 'delete', payload: { id }, danger: true });
    } else if (kind === 'edge') {
      items.push({ label: '删除连线', kbd: '⌫', menu: 'delete-edge', payload: { id }, danger: true });
      items.push({ label: '切换虚线样式', menu: 'toggle-dashed', payload: { id } });
      items.push({ label: '高亮连线', menu: 'highlight-edge', payload: { id } });
    }
    this.menuEl.innerHTML = items
      .map((it) =>
        it.sep
          ? '<div class="menu__sep"></div>'
          : `<button class="menu__item ${it.danger ? 'menu__item--danger' : ''}" data-menu="${it.menu}" data-payload='${JSON.stringify(it.payload || {})}'>
               <span>${it.label}</span>${it.kbd ? `<kbd>${it.kbd}</kbd>` : ''}
             </button>`,
      )
      .join('');
    this.menuEl.hidden = false;
    this.menuEl.style.position = 'fixed';
    this.menuEl.style.left = `${Math.max(8, Math.min(window.innerWidth - 230, x))}px`;
    this.menuEl.style.top = `${Math.max(8, Math.min(window.innerHeight - 320, y))}px`;
  }

  runMenuAction(action, payload) {
    const flow = payload.flow || this.vp.centerFlow();
    switch (action) {
      case 'add': {
        const local = this.vp.flowToLocal(flow.x, flow.y);
        this.openAddPanel({ localX: local.x, localY: local.y });
        break;
      }
      case 'paste':
        this.paste(flow);
        break;
      case 'select-all':
        store.selectAll();
        break;
      case 'fit':
        this.vp.fitView();
        break;
      case 'reset-zoom':
        this.vp.resetZoom();
        break;
      case 'tidy':
        this.canvas.tidy();
        break;
      case 'collapse-node':
        setCollapsed(payload.id, true);
        break;
      case 'expand-node':
        setCollapsed(payload.id, false);
        break;
      case 'collapse-all':
        collapseAll();
        break;
      case 'expand-all':
        expandAll();
        break;
      case 'expand-images':
        store.transaction((s) => {
          for (const n of s.nodes) if (n.type === 'image' || n.type === 'image-gen') n.data = { ...n.data, collapsed: false };
        }, { history: true, reason: 'expand-images' });
        break;
      case 'expand-videos':
        store.transaction((s) => {
          for (const n of s.nodes) if (n.type === 'video' || n.type === 'video-gen') n.data = { ...n.data, collapsed: false };
        }, { history: true, reason: 'expand-videos' });
        break;
      case 'rename':
        this.startRename(payload.id);
        break;
      case 'node-history': {
        const node = store.getNode(payload.id);
        if (node) this.openHistoryOverlay(node);
        break;
      }
      case 'media-info': {
        const node = store.getNode(payload.id);
        if (node) this.showMediaInfo(node);
        break;
      }
      case 'copy-image': {
        const node = store.getNode(payload.id);
        if (node) this.copyNodeImage(node);
        break;
      }
      case 'download-media': {
        const node = store.getNode(payload.id);
        if (node) this.downloadNodeMedia(node);
        break;
      }
      case 'execute-group': {
        const group = store.getNode(payload.id);
        if (group) this.executeGroup(group);
        break;
      }
      case 'toggle-minimap':
        store.setSetting('minimap', !store.state.settings.minimap);
        break;
      case 'clear':
        store.clear();
        break;
      case 'focus':
        this.vp.focusNode(store.getNode(payload.id));
        break;
      case 'duplicate':
        this.canvas.duplicateSelection([payload.id]);
        break;
      case 'copy':
        this.copy([payload.id]);
        break;
      case 'group':
        store.setSelection([payload.id]);
        this.canvas.groupSelection();
        break;
      case 'ungroup':
        store.setSelection([payload.id]);
        this.canvas.ungroup();
        break;
      case 'bring-front': {
        const node = store.getNode(payload.id);
        if (node) {
          const maxZ = Math.max(...store.nodes.map((n) => n.z ?? 1));
          store.transaction((s) => {
            const n = s.nodes.find((x) => x.id === payload.id);
            if (n) n.z = maxZ + 1;
          }, { reason: 'z' });
        }
        break;
      }
      case 'disconnect':
        store.transaction((s) => {
          s.edges = s.edges.filter((e) => e.source !== payload.id && e.target !== payload.id);
        }, { history: true, reason: 'disconnect' });
        break;
      case 'delete':
        this.canvas.removeNode(payload.id);
        break;
      case 'delete-edge':
        this.canvas.deleteEdge(payload.id);
        break;
      case 'toggle-dashed':
        store.transaction((s) => {
          const e = s.edges.find((x) => x.id === payload.id);
          if (e) e.data = { ...e.data, dashed: !e.data?.dashed };
        }, { history: true, reason: 'edge-style' });
        break;
      case 'highlight-edge':
        store.transaction((s) => {
          const e = s.edges.find((x) => x.id === payload.id);
          if (e) e.data = { ...e.data, highlighted: !e.data?.highlighted };
        }, { history: true, reason: 'edge-style' });
        break;
      default:
        break;
    }
  }

  /* ── clipboard ───────────────────────────────────────────────────── */

  copy(explicitIds) {
    const ids = explicitIds || [...store.selection];
    if (!ids.length) return;
    const nodes = store.nodes.filter((n) => ids.includes(n.id));
    const map = new Set(nodes.map((n) => n.id));
    const edges = store.edges.filter((e) => map.has(e.source) && map.has(e.target));
    this.clipboard = { nodes: structuredClone(nodes), edges: structuredClone(edges) };
    const text = JSON.stringify({ format: 'infinite-canvas/clipboard', nodes, edges }, null, 2);
    navigator.clipboard?.writeText(text).catch(() => {});
    store.emit('toast', `已复制 ${nodes.length} 个节点`);
  }

  paste(flow) {
    let payload = this.clipboard;
    if (!payload) {
      navigator.clipboard
        ?.readText()
        .then((text) => {
          try {
            const parsed = JSON.parse(text);
            if (Array.isArray(parsed.nodes)) {
              this.clipboard = parsed;
              this.paste(flow);
            }
          } catch {
            store.emit('toast', '剪贴板里没有可粘贴的画布内容');
          }
        })
        .catch(() => store.emit('toast', '剪贴板不可用'));
      return;
    }
    const b = selectionBounds(payload.nodes);
    const target = flow || this.vp.centerFlow();
    const dx = Math.round(target.x - (b ? b.x : 0));
    const dy = Math.round(target.y - (b ? b.y : 0));
    const map = new Map();
    const clones = payload.nodes.map((n) => {
      const copy = createNode(n.type, { x: n.x + dx, y: n.y + dy }, structuredClone(n.data), { w: n.w, h: n.h, z: n.z });
      map.set(n.id, copy.id);
      return copy;
    });
    const edges = payload.edges
      .filter((e) => map.has(e.source) && map.has(e.target))
      .map((e) => createEdge(map.get(e.source), map.get(e.target), { data: { ...e.data } }));
    store.transaction((s) => {
      s.nodes.push(...clones);
      s.edges.push(...edges);
      s.selection = new Set(clones.map((c) => c.id));
      s.edgeSelection = new Set();
    }, { history: true, reason: 'paste' });
    store.emit('selection');
    store.emit('toast', `已粘贴 ${clones.length} 个节点`);
  }

  /* ── zoom pill / minimap ─────────────────────────────────────────── */

  bindZoomPill() {
    const slider = $('#zoomSlider');
    const pct = $('#zoomValue');
    slider.min = String(Math.round(this.vp.constructor.MIN_ZOOM * 100));
    slider.max = String(Math.round(this.vp.constructor.MAX_ZOOM * 100));
    slider.addEventListener('input', () => {
      const zoom = Number(slider.value) / 100;
      this.vp.zoomTo(zoom);
    });
    pct.addEventListener('click', () => this.vp.resetZoom());
    $('#fitBtn').addEventListener('click', () => this.vp.fitView());
    this.syncZoomUi(this.vp.zoom);
  }

  syncZoomUi(zoom) {
    const slider = $('#zoomSlider');
    const pct = $('#zoomValue');
    if (!slider || !pct) return;
    const percent = Math.round(zoom * 100);
    pct.textContent = `${percent}%`;
    if (document.activeElement !== slider) slider.value = String(percent);
    const min = Number(slider.min) || 7;
    const max = Number(slider.max) || 300;
    const p = Math.max(0, Math.min(1, (percent - min) / (max - min)));
    slider.style.setProperty('--pct', `${(p * 100).toFixed(1)}%`);
  }

  bindMinimap() {
    const canvas = $('#minimapCanvas');
    let dragging = false;
    canvas.addEventListener('pointerdown', (e) => {
      dragging = true;
      canvas.setPointerCapture(e.pointerId);
      this.canvas.centerFromMinimap(e);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (dragging) this.canvas.centerFromMinimap(e);
    });
    canvas.addEventListener('pointerup', () => {
      dragging = false;
    });
  }

  /* ── keyboard-search dialog ──────────────────────────────────────── */

  openNodeSearch() {
    this.searchDialog.hidden = false;
    const input = $('#nodeSearchInput');
    input.value = '';
    this.renderNodeSearch('');
    setTimeout(() => input.focus(), 30);
    input.oninput = () => this.renderNodeSearch(input.value);
    input.onkeydown = (e) => {
      if (e.key === 'Escape') this.closeNodeSearch();
      if (e.key === 'Enter') {
        const first = $('#nodeSearchResults .add-item');
        if (first) first.click();
      }
    };
  }

  closeNodeSearch() {
    this.searchDialog.hidden = true;
  }

  renderNodeSearch(query) {
    const box = $('#nodeSearchResults');
    const q = query.trim().toLowerCase();
    const entries = Object.entries(NODE_TYPES).filter(
      ([key, t]) => !q || t.name.toLowerCase().includes(q) || t.desc.toLowerCase().includes(q) || key.includes(q),
    );
    box.innerHTML = '';
    if (!entries.length) {
      box.appendChild(el('div', 'dialog__empty', '没有匹配的节点类型'));
      return;
    }
    for (const [key, t] of entries) {
      const item = el(
        'button',
        'add-item',
        `<span class="add-item__icon">${icon(t.icon)}</span>
         <span class="add-item__text">
           <span class="add-item__name">${t.name} <span class="node__badge" style="margin-left:6px">${t.badge}</span></span>
           <span class="add-item__desc">${t.group} · ${t.desc}</span>
         </span>`,
      );
      item.addEventListener('click', () => {
        this.closeNodeSearch();
        const center = this.vp.centerFlow();
        createNodeAt(key, {
          x: Math.round(center.x - (t.size.w || 260) / 2),
          y: Math.round(center.y - 100),
        });
      });
      box.appendChild(item);
    }
  }

  /* ── store reactions ─────────────────────────────────────────────── */

  bindStore() {
    store.on('history', () => this.refreshHistoryButtons());
    store.on('tool', (tool) => {
      $$('[data-tool]').forEach((b) => b.classList.toggle('is-active', b.dataset.tool === tool));
      $('#canvasHost').dataset.tool = tool;
    });
    store.on('zoom', (zoom) => {
      this.syncZoomUi(zoom);
      this.syncGroupToolbar();
    });
    store.on('settings', (settings) => {
      this.applyReadonly(settings.readMode);
      this.applyAnnotate(settings.annotateMode);
      if (this.nodeManager) this.nodeManager.hidden = !settings.nodeManagerOpen;
      $('#canvasHost').dataset.interaction = settings.interactionMode || 'rhtv';
      $('#gridBtn').classList.toggle('is-on', settings.snapGrid);
      $('#snapBtn').classList.toggle('is-on', settings.guides);
      $('#minimapBtn').classList.toggle('is-on', settings.minimap);
      $('#gridToggleBtn').classList.toggle('is-off', !settings.gridVisible);
      $('#edgesBtn').classList.toggle('is-off', !!settings.edgesHidden);
      $('#minimap').hidden = !settings.minimap;
      this.applyTheme(settings.theme);
      this.canvas.drawGrid();
      this.canvas.drawMinimap();
    });
    store.on('toast', (msg, kind) => this.toast(msg, kind));
    store.on('pane-click', () => this.closeAllPopups());
    store.on('annotation-selected', () => this.syncAnnotateBar());
    store.on('queue', () => {
      this.renderQueue();
      this.syncQueueBadge();
    });
    store.on('drop-asset', ({ asset, flow }) => {
      const type = asset.type === 'video' ? 'video' : asset.type === 'audio' ? 'audio' : 'image';
      const node = createNode(
        type,
        { x: Math.round(flow.x), y: Math.round(flow.y) },
        {
          label: asset.label || '素材',
          media: type === 'video' ? '' : asset.media,
          poster: type === 'video' ? asset.media : '',
          status: 'success',
        },
      );
      store.transaction((s) => {
        s.nodes.push(node);
        s.selection = new Set([node.id]);
        s.edgeSelection = new Set();
      }, { history: true, reason: 'drop-asset' });
      store.emit('selection');
      store.emit('toast', '已从素材库添加', 'success');
    });
    store.on('change', () => {
      this.refreshHistoryButtons();
      this.renderEmptyState();
      this.syncParamBar();
      this.renderNodeManager();
      this.syncGroupToolbar();
      const title = $('#docTitle');
      if (document.activeElement !== title) {
        title.value = store.state.title;
      }
    });
    store.on('selection', () => {
      this.renderEmptyState();
      this.syncGroupToolbar();
      this.renderNodeManager();
      this.syncParamBar();
    });
    store.on('history', () => this.renderEmptyState());
  }

  renderEmptyState() {
    const empty = store.nodes.length === 0;
    $('#emptyState').hidden = !empty;
  }

  refreshHistoryButtons() {
    const h = store.history;
    $('#undoBtn').disabled = h.index <= 0;
    $('#redoBtn').disabled = h.index >= h.stack.length - 1;
  }

  applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('infinite-canvas:theme', theme);
    } catch {}
    this.canvas.drawGrid();
    this.canvas.drawMinimap();
  }

  /* ── drop files ──────────────────────────────────────────────────── */

  bindDropFiles() {
    store.on('drop-files', async ({ files, flow }) => {
      let offset = 0;
      for (const file of files) {
        if (file.name.endsWith('.json') || file.type === 'application/json') {
          try {
            const text = await file.text();
            store.importJSON(text);
            this.vp.fitView();
            store.emit('toast', '已导入画布', 'success');
          } catch (err) {
            store.emit('toast', err.message || '导入失败', 'error');
          }
          continue;
        }
        const isImage = file.type.startsWith('image/');
        const isVideo = file.type.startsWith('video/');
        const isAudio = file.type.startsWith('audio/');
        if (!isImage && !isVideo && !isAudio) {
          store.emit('toast', `不支持的文件类型：${file.name}`, 'error');
          continue;
        }
        if (file.size > 24 * 1024 * 1024) {
          store.emit('toast', `${file.name} 超过 24MB，已跳过`, 'error');
          continue;
        }
        const url = await readFileURL(file);
        const type = isImage ? 'image' : isVideo ? 'video' : 'audio';
        const t = NODE_TYPES[type];
        const node = createNode(
          type,
          { x: Math.round(flow.x) + offset, y: Math.round(flow.y) + offset },
          { label: file.name.replace(/\.[^.]+$/, '').slice(0, 32), media: isAudio ? '' : url, status: 'success' },
        );
        store.transaction((s) => {
          s.nodes.push(node);
          s.selection = new Set([node.id]);
          s.edgeSelection = new Set();
        }, { history: true, reason: 'drop' });
        store.emit('selection');
        offset += 36;
        if (isAudio) {
          const a = new Audio(url);
          a.addEventListener('loadedmetadata', () => {
            const duration = `${Math.floor(a.duration / 60)}:${String(Math.round(a.duration % 60)).padStart(2, '0')}`;
            store.transaction((s) => {
              const n = s.nodes.find((x) => x.id === node.id);
              if (n) n.data = { ...n.data, duration };
            }, { history: false, reason: 'meta' });
          });
        }
      }
      if (files.length) store.emit('toast', `已添加 ${files.length} 个素材`, 'success');
    });

    $('#importInput').addEventListener('change', async (e) => {
      const files = [...e.target.files];
      if (!files.length) return;
      const flow = this.vp.centerFlow();
      store.emit('drop-files', { files, flow });
      e.target.value = '';
    });
  }

  /* ── import / export ─────────────────────────────────────────────── */

  exportJSON() {
    store.save();
    const blob = new Blob([store.exportJSON()], { type: 'application/json' });
    download(blob, `${sanitize(store.state.title)}.canvas.json`);
    store.emit('toast', '已导出画布 JSON', 'success');
  }

  exportPNG() {
    const nodes = store.nodes;
    if (!nodes.length) {
      store.emit('toast', '画布为空，无法导出', 'error');
      return;
    }
    const b = selectionBounds(nodes);
    const pad = 80;
    const width = Math.min(4096, Math.max(640, Math.round(b.w + pad * 2)));
    const height = Math.min(4096, Math.max(360, Math.round(b.h + pad * 2)));
    const scale = Math.min(1, 2000 / width, 2000 / height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    const isLight = document.documentElement.dataset.theme === 'light';
    ctx.scale(scale, scale);
    ctx.fillStyle = isLight ? '#f4f5f7' : '#0d0d0f';
    ctx.fillRect(0, 0, width, height);
    const tx = (x) => x - b.x + pad;
    const ty = (y) => y - b.y + pad;

    // edges
    ctx.strokeStyle = isLight ? 'rgba(15,23,42,0.35)' : 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.6;
    for (const edge of store.edges) {
      const s = store.getNode(edge.source);
      const t = store.getNode(edge.target);
      if (!s || !t) continue;
      const sDims = { w: s.w || 260, h: s.h || 200 };
      const tDims = { w: t.w || 260, h: t.h || 200 };
      const sx = tx(s.x + sDims.w);
      const sy = ty(s.y + sDims.h / 2);
      const ex = tx(t.x);
      const ey = ty(t.y + tDims.h / 2);
      const c = Math.max(40, Math.abs(ex - sx) / 2);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.bezierCurveTo(sx + c, sy, ex - c, ey, ex, ey);
      ctx.stroke();
    }

    // nodes
    for (const n of nodes) {
      const t = NODE_TYPES[n.type] || NODE_TYPES.text;
      const d = { w: n.w || t.size.w, h: n.h || t.size.h };
      const x = tx(n.x);
      const y = ty(n.y);
      ctx.fillStyle = isLight ? '#ffffff' : '#1d1d21';
      ctx.strokeStyle = isLight ? 'rgba(15,23,42,0.14)' : 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 1;
      roundRect(ctx, x, y, d.w, d.h, 12);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = t.accent;
      roundRect(ctx, x + 10, y + 10, 22, 22, 6);
      ctx.fill();
      ctx.fillStyle = isLight ? '#14161a' : '#f4f4f5';
      ctx.font = '600 12px Inter, "PingFang SC", sans-serif';
      ctx.fillText(truncate(nodeTitle(n), 26), x + 40, y + 26);
      ctx.fillStyle = isLight ? 'rgba(15,23,42,0.55)' : 'rgba(255,255,255,0.55)';
      ctx.font = '11px Inter, "PingFang SC", sans-serif';
      const body = n.data?.prompt || n.data?.text || t.desc || '';
      wrapText(ctx, body, x + 10, y + 52, d.w - 20, 16, 4);
    }
    canvas.toBlob((blob) => {
      if (!blob) return;
      download(blob, `${sanitize(store.state.title)}.png`);
      store.emit('toast', '已导出 PNG', 'success');
    }, 'image/png');
  }

  /* ── toast ───────────────────────────────────────────────────────── */

  toast(message, kind) {
    const host = $('#toastHost');
    if (!host) return;
    const node = el('div', `toast ${kind === 'success' ? 'toast--success' : kind === 'error' ? 'toast--error' : ''}`, escapeHTML(message));
    host.appendChild(node);
    const timer = setTimeout(() => {
      node.classList.add('is-leaving');
      setTimeout(() => {
        node.remove();
        this.toastTimers.delete(timer);
      }, 180);
    }, 1900);
    this.toastTimers.add(timer);
  }
}

/* ── misc helpers ────────────────────────────────────────────────── */

const STATUS_LABEL = {
  idle: '待生成',
  queued: '排队中',
  running: '生成中',
  success: '已完成',
  error: '失败',
};

function chipKey(type) {
  if (type === 'image' || type === 'image-gen') return 'image';
  if (type === 'video' || type === 'video-gen') return 'video';
  if (type === 'audio') return 'audio';
  if (type === 'text' || type === 'script' || type === 'llm' || type === 'stack') return 'text';
  if (type === 'rh-ai' || type === '3d' || type === 'director') return 'ai';
  return 'generic';
}

async function dataURLToPngBlob(dataURL) {
  const img = new Image();
  img.decoding = 'sync';
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = dataURL;
  });
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || 512;
  canvas.height = img.naturalHeight || 512;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}

function readFileURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function sanitize(name) {
  return String(name).replace(/[\\/:*?"<>|]/g, '_').slice(0, 60) || 'canvas';
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

function truncate(str, n) {
  const s = String(str || '');
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const chars = String(text || '').split('');
  let line = '';
  let lines = 0;
  for (const ch of chars) {
    const test = line + ch;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y + lines * lineHeight);
      lines++;
      line = ch;
      if (lines >= maxLines) return;
    } else {
      line = test;
    }
  }
  if (line && lines < maxLines) ctx.fillText(line, x, y + lines * lineHeight);
}

function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
