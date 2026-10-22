/* ============================================================================
 * store.js — canvas document model, node catalog, history, persistence.
 *
 * The node catalog mirrors the type registry recovered from the RunningHub
 * canvas bundle (`nodeTypes` = rh-image / rh-video / rh-audio / rh-text /
 * rh-script / rh-stack / rh-comment / rh-ai / rh-3d / director / group ...).
 * ========================================================================= */

import { generatedImage } from './placeholder.js';

const STORAGE_KEY = 'infinite-canvas:doc:v1';
const THEME_KEY = 'infinite-canvas:theme';
const SETTINGS_KEY = 'infinite-canvas:settings';
const HISTORY_LIMIT = 80;
const FRESH = typeof location !== 'undefined' && new URLSearchParams(location.search).has('fresh');
const SNAP_GRID = 20; // recovered: snapGrid: [20, 20]

/* ───────────────────────────── icons ───────────────────────────── */

const p = (d) => `<path d="${d}"/>`;

export const ICONS = {
  select: p('M5 3l14 8-6 1.6L9.6 20z'),
  hand: p('M8 13V5.5a1.5 1.5 0 013 0V12m0-6.5a1.5 1.5 0 013 0V12m0-5a1.5 1.5 0 013 0v7m0-4a1.5 1.5 0 013 0v5a6 6 0 01-6 6h-2.2a6 6 0 01-4.9-2.6L5 14.6a1.6 1.6 0 012.6-1.8L9 14'),
  plus: p('M12 5v14M5 12h14'),
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a5 5 0 010 10h-3"/>',
  redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H10a5 5 0 000 10h3"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 012-2h8"/>',
  duplicate: '<rect x="3" y="3" width="12" height="12" rx="2"/><path d="M9 21h10a2 2 0 002-2V9"/>',
  trash: '<path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M6 7l1 13h10l1-13"/>',
  scissors: '<circle cx="6" cy="6" r="2.4"/><circle cx="6" cy="18" r="2.4"/><path d="M8 7.6L20 18M8 16.4L20 6"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="M21 15l-5-5-9 9"/>',
  video: '<rect x="2.5" y="5" width="14" height="14" rx="2.5"/><path d="M16.5 10l5-3v10l-5-3z"/>',
  audio: '<path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 10v4"/>',
  text: '<path d="M5 6h14M5 12h10M5 18h7"/>',
  script: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/><path d="M10 12h6M10 16h4"/>',
  ai: '<path d="M12 3l1.8 4.9L19 9.7l-4.4 3 .6 5.3-3.2-2.6L8.8 18l.6-5.3L5 9.7l5.2-1.8z"/>',
  stack: '<rect x="3" y="4" width="18" height="5" rx="1.6"/><rect x="3" y="11" width="18" height="5" rx="1.6"/><rect x="3" y="18" width="10" height="3" rx="1.4"/>',
  comment: '<path d="M21 12a8 8 0 01-8 8H7l-4 3V12a8 8 0 018-8h2a8 8 0 018 8z"/>',
  '3d': '<path d="M12 2l9 5v10l-9 5-9-5V7z"/><path d="M12 12l9-5M12 12v10M12 12L3 7"/>',
  director: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 5v14M16 5v14M3 12h18"/>',
  group: '<rect x="3" y="7" width="8" height="8" rx="1.6"/><rect x="13" y="7" width="8" height="8" rx="1.6"/>',
  preview: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 9l6 3-6 3z"/>',
  fit: '<path d="M4 9V5a1 1 0 011-1h4M15 4h4a1 1 0 011 1v4M20 15v4a1 1 0 01-1 1h-4M9 20H5a1 1 0 01-1-1v-4"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/>',
  align: '<path d="M4 4v16"/><rect x="8" y="7" width="11" height="4" rx="1"/><rect x="8" y="14" width="7" height="4" rx="1"/>',
  magnet: '<path d="M6 4v8a6 6 0 0012 0V4h-4v8a2 2 0 01-4 0V4z"/>',
  grid: '<path d="M4 4h16v16H4z"/><path d="M4 10h16M4 15h16M10 4v16M15 4v16"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  sparkle: '<path d="M12 4l1.5 4.5L18 10l-4.5 1.5L12 16l-1.5-4.5L6 10l4.5-1.5z"/><path d="M18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8z"/>',
  play: '<path d="M8 5l11 7-11 7z"/>',
  refresh: '<path d="M20 11a8 8 0 10-2.3 5.7"/><path d="M20 5v6h-6"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5"/><path d="M4 19h16"/>',
  upload: '<path d="M12 16V5M7 10l5-5 5 5"/><path d="M4 19h16"/>',
  moon: '<path d="M20 14.5A8 8 0 019.5 4 8.5 8.5 0 1020 14.5z"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  bolt: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
};

const svg = (name, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" data-icon="${name}">${ICONS[name] || ICONS.text}</svg>`;

/* ───────────────────────────── node catalog ───────────────────────────── */

/**
 * Every entry becomes one canvas node type. `kind` selects the body renderer;
 * `ports` declares connection handles (in = left, out = right).
 */
export const NODE_TYPES = {
  image: {
    name: '图片',
    group: '媒体',
    desc: '导入或生成单张图片',
    icon: 'image',
    accent: '#1a3d32',
    kind: 'image',
    size: { w: 380, h: 280 },
    badge: 'IMAGE',
    ports: { in: true, out: true },
    data: { prompt: '', status: 'idle', media: '', label: '图片' },
  },
  video: {
    name: '视频',
    group: '媒体',
    desc: '视频片段与生成结果',
    icon: 'video',
    accent: '#3d1a2e',
    kind: 'video',
    size: { w: 380, h: 280 },
    badge: 'VIDEO',
    ports: { in: true, out: true },
    data: { prompt: '', status: 'idle', media: '', duration: '5s', label: '视频' },
  },
  audio: {
    name: '音频',
    group: '媒体',
    desc: '配音、BGM 与音效',
    icon: 'audio',
    accent: '#2e2a1a',
    kind: 'audio',
    size: { w: 380, h: 220 },
    badge: 'AUDIO',
    ports: { in: true, out: true },
    data: { prompt: '', status: 'idle', duration: '0:12', label: '音频' },
  },
  'image-gen': {
    name: '文生图',
    group: '生成',
    desc: '提示词生成图片',
    icon: 'sparkle',
    accent: '#2a2848',
    kind: 'image',
    size: { w: 380, h: 300 },
    badge: 'AI',
    ports: { in: true, out: true },
    data: { prompt: '雨夜霓虹的东京街头，35mm 胶片颗粒感，电影色调', status: 'idle', media: '', label: '文生图' },
  },
  'video-gen': {
    name: '图生视频',
    group: '生成',
    desc: '首帧驱动镜头运动',
    icon: 'sparkle',
    accent: '#2a2848',
    kind: 'video',
    size: { w: 380, h: 300 },
    badge: 'AI',
    ports: { in: true, out: true },
    data: { prompt: '镜头缓慢推进，人物回头看向镜头', status: 'idle', media: '', duration: '5s', label: '图生视频' },
  },
  llm: {
    name: '大模型',
    group: '生成',
    desc: '文本创作与提示词扩写',
    icon: 'ai',
    accent: '#2a2848',
    kind: 'text',
    size: { w: 380, h: 210 },
    badge: 'LLM',
    ports: { in: true, out: true },
    data: {
      prompt: '',
      status: 'idle',
      text: '镜头 01 / 雨夜天台，主角背身站立，雨水顺着霓虹灯牌滴落。',
      label: '大模型',
    },
  },
  text: {
    name: '文本',
    group: '编排',
    desc: '提示词与备注',
    icon: 'text',
    accent: '#2a3140',
    kind: 'text',
    size: { w: 380, h: 220 },
    badge: 'TEXT',
    ports: { in: false, out: true },
    data: { prompt: '', text: '在这里写下提示词、分镜说明或旁白。', label: '文本' },
  },
  script: {
    name: '脚本',
    group: '编排',
    desc: '分镜与剧本卡片',
    icon: 'script',
    accent: '#2a3140',
    kind: 'script',
    size: { w: 420, h: 280 },
    badge: 'SCRIPT',
    ports: { in: true, out: true },
    data: {
      prompt: '',
      text: '分镜 01｜雨夜天台\n全景，慢推；主角立在天台边缘，头顶霓虹牌闪烁。',
      label: '分镜脚本',
    },
  },
  'rh-ai': {
    name: 'AI 应用',
    group: '生成',
    desc: '自定义 API / 工作流节点',
    icon: 'bolt',
    accent: '#2a2848',
    kind: 'app',
    size: { w: 320, h: 200 },
    badge: 'APP',
    ports: { in: true, out: true },
    data: { prompt: 'RunningHub · 视频超分', status: 'idle', model: 'video-upscale-v2', label: '视频超分' },
  },
  stack: {
    name: '素材栈',
    group: '编排',
    desc: '把一组素材叠成一个流',
    icon: 'stack',
    accent: '#2a3140',
    kind: 'stack',
    size: { w: 380, h: 220 },
    badge: 'STACK',
    ports: { in: true, out: true },
    data: { prompt: '', status: 'idle', items: 3, label: '素材栈' },
  },
  '3d': {
    name: '3D 场景',
    group: '编排',
    desc: '三维预览与镜头',
    icon: '3d',
    accent: '#2a2848',
    kind: 'app',
    size: { w: 380, h: 214 },
    badge: '3D',
    ports: { in: true, out: true },
    data: { prompt: 'OrbitControls · 35mm', status: 'idle', model: 'scene-01', label: '3D 场景' },
  },
  director: {
    name: '导演台',
    group: '编排',
    desc: '多机位调度与合成',
    icon: 'director',
    accent: '#2a2848',
    kind: 'app',
    size: { w: 400, h: 240 },
    badge: 'DIRECT',
    ports: { in: true, out: true },
    data: { prompt: '多机位 · 分镜合成', status: 'idle', model: 'director', label: '导演台' },
  },
  'preview-output': {
    name: '预览输出',
    group: '输出',
    desc: '最终成片预览',
    icon: 'preview',
    accent: '#252528',
    kind: 'preview',
    size: { w: 380, h: 280 },
    badge: 'OUT',
    ports: { in: true, out: false },
    data: { prompt: '', status: 'idle', media: '', label: '成片预览' },
  },
  group: {
    name: '编组',
    group: '结构',
    desc: '框选一组节点',
    icon: 'group',
    accent: '#252528',
    kind: 'group',
    size: { w: 400, h: 300 },
    badge: 'GROUP',
    ports: { in: false, out: false },
    data: { prompt: '', label: '编组' },
  },
  comment: {
    name: '便签',
    group: '结构',
    desc: '画布上的批注',
    icon: 'comment',
    accent: '#252528',
    kind: 'comment',
    size: { w: 320, h: 180 },
    badge: 'NOTE',
    ports: { in: false, out: false },
    data: { prompt: '', text: '把这条镜头的光比压暗一档，霓虹保留高光。', label: '便签' },
  },
};

export const TYPE_GROUPS = ['媒体', '生成', '编排', '输出', '结构'];

/* ───────────────────────────── helpers ───────────────────────────── */

export const uid = (prefix = 'n') => `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
export const snap = (v, size = SNAP_GRID) => Math.round(v / size) * size;

export function nodeSize(node) {
  const t = NODE_TYPES[node.type] || NODE_TYPES.text;
  return { w: node.w || t.size.w, h: node.h || t.size.h };
}

export function nodeBounds(node) {
  const { w, h } = nodeSize(node);
  return { x: node.x, y: node.y, w, h, right: node.x + w, bottom: node.y + h };
}

export function selectionBounds(nodes) {
  if (!nodes.length) return null;
  let x1 = Infinity,
    y1 = Infinity,
    x2 = -Infinity,
    y2 = -Infinity;
  for (const n of nodes) {
    const b = nodeBounds(n);
    x1 = Math.min(x1, b.x);
    y1 = Math.min(y1, b.y);
    x2 = Math.max(x2, b.right);
    y2 = Math.max(y2, b.bottom);
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1, right: x2, bottom: y2 };
}

export function createNode(type, pos = { x: 0, y: 0 }, data = {}, extra = {}) {
  const t = NODE_TYPES[type] || NODE_TYPES.text;
  const id = uid(type === 'group' ? 'g' : 'n');
  return {
    id,
    type,
    x: Math.round(pos.x),
    y: Math.round(pos.y),
    w: t.size.w,
    h: t.size.h,
    z: extra.z ?? 1,
    data: { ...structuredClone(t.data), ...data },
    ...extra,
  };
}

export function createEdge(source, target, extra = {}) {
  return {
    id: uid('e'),
    source,
    target,
    type: 'bezier',
    data: { dashed: false, highlighted: false },
    ...extra,
  };
}

/* ───────────────────────────── demo document ───────────────────────────── */

export function demoDocument() {
  const n = (type, x, y, data = {}, extra = {}) => createNode(type, { x, y }, data, extra);
  const prompt = n('llm', 0, 0, {
    label: '提示词扩写',
    text: '雨夜、霓虹、湿地面反光、35mm 胶片颗粒、低饱和冷调、电影宽银幕。',
  });
  const script = n('script', 0, 300, {
    label: '分镜 01 · 雨夜天台',
    text: '分镜 01｜雨夜天台\n全景，慢推；主角立在天台边缘，头顶霓虹牌闪烁。\n旁白：城市在雨里发光。',
  });
  const img = n('image', 520, 0, {
    label: '关键帧 / 首帧',
    status: 'success',
    media: generatedImage('雨夜天台 · 首帧'),
    prompt: '雨夜霓虹街头，35mm 胶片颗粒，电影色调',
  });
  const gen = n('video-gen', 520, 380, {
    label: '图生视频',
    status: 'success',
    poster: generatedImage('图生视频 · 关键帧', 'video'),
    duration: '5s',
    prompt: '镜头缓慢推进，主角回头，雨水划过画面',
  });
  const audio = n('audio', 1040, 0, { label: '环境声 / 雨', status: 'success', duration: '0:24' });
  const note = n('comment', 1040, 260, {
    label: '批注',
    text: '这条镜头的光比压暗一档，霓虹保留高光；结尾留 0.5s 黑场。',
  });
  const app = n('rh-ai', 1000, 460, { label: '视频超分', status: 'idle' });
  const out = n('preview-output', 1520, 460, {
    label: '成片预览',
    status: 'idle',
    media: generatedImage('成片 · 1080p', 'video'),
  });

  const nodes = [prompt, script, img, gen, audio, note, app, out];
  const edges = [
    createEdge(prompt.id, img.id),
    createEdge(img.id, gen.id),
    createEdge(script.id, gen.id, { data: { dashed: true } }),
    createEdge(gen.id, app.id),
    createEdge(app.id, out.id),
    createEdge(audio.id, out.id, { data: { dashed: true } }),
  ];
  return { title: '雨夜天台 · 镜头 01', nodes, edges };
}

/* ───────────── 本地生成队列（多节点排队 / 取消 / 进度） ───────────── */

export function enqueueJob(nodeId, title) {
  const job = {
    id: uid('job'),
    nodeId,
    title: title || '',
    status: 'queued',
    createdAt: Date.now(),
    startedAt: null,
    finishedAt: null,
  };
  store.state.queue = [...store.state.queue, job];
  store.emit('queue', store.state.queue);
  return job;
}

export function updateJob(id, patch) {
  store.state.queue = store.state.queue.map((j) => (j.id === id ? { ...j, ...patch } : j));
  store.emit('queue', store.state.queue);
}

export function removeJob(id) {
  store.state.queue = store.state.queue.filter((j) => j.id !== id);
  store.emit('queue', store.state.queue);
}

export function clearFinishedJobs() {
  store.state.queue = store.state.queue.filter((j) => j.status === 'queued' || j.status === 'running');
  store.emit('queue', store.state.queue);
}

/* ───────────────────────────── store ───────────────────────────── */

class Store {
  constructor() {
    this.state = {
      title: '未命名画布',
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      selection: new Set(),
      edgeSelection: new Set(),
      annotations: [],
      queue: [],
      tool: 'select',
      settings: {
        snapGrid: true,
        guides: true,
        minimap: true,
        gridVisible: true,
        edgesHidden: false,
        theme: 'dark',
        useApi: true, // 模型节点走 APIMart（false = 本地占位演示）
        confirmVideo: true, // 视频生成前确认额度消耗
        interactionMode: 'rhtv', // 'rhtv' | 'comfyui' (recovered toggleInteractionMode)
        readMode: false, // 阅读视图 / readonly
        nodeManagerOpen: false,
        annotateMode: false, // annotate.addText / annotate.drawArrow
        annotateTool: 'arrow',
      },
      dirty: false,
    };
    this.history = { stack: [], index: -1 };
    this.restoredFromStorage = false;
    this.listeners = new Map();
    this._saveTimer = null;
    this._historyTimer = null;
    this.load();
  }

  /* events */
  on(evt, fn) {
    if (!this.listeners.has(evt)) this.listeners.set(evt, new Set());
    this.listeners.get(evt).add(fn);
    return () => this.listeners.get(evt).delete(fn);
  }

  emit(evt, payload) {
    const set = this.listeners.get(evt);
    if (set) for (const fn of set) fn(payload, this.state);
  }

  /* accessors */
  get nodes() {
    return this.state.nodes;
  }

  get edges() {
    return this.state.edges;
  }

  get selection() {
    return this.state.selection;
  }

  getNode(id) {
    return this.state.nodes.find((n) => n.id === id);
  }

  getEdge(id) {
    return this.state.edges.find((e) => e.id === id);
  }

  selectedNodes() {
    return this.state.nodes.filter((n) => this.state.selection.has(n.id));
  }

  /* mutations (transactions) */
  transaction(fn, { history = true, reason = 'edit' } = {}) {
    fn(this.state);
    this.afterMutate({ history, reason });
  }

  afterMutate({ history = true, reason = 'edit', coalesce = false } = {}) {
    this.state.dirty = true;
    this.emit('change', { reason });
    if (history) this.pushHistory({ coalesce });
    this.scheduleSave();
  }

  /* history */
  snapshot() {
    return JSON.stringify({
      title: this.state.title,
      nodes: this.state.nodes,
      edges: this.state.edges,
      annotations: this.state.annotations,
    });
  }

  pushHistory({ coalesce = false } = {}) {
    const h = this.history;
    const snap = this.snapshot();
    if (h.stack[h.index] === snap) return;
    const commit = () => {
      h.stack = h.stack.slice(0, h.index + 1);
      h.stack.push(snap);
      if (h.stack.length > HISTORY_LIMIT) h.stack.shift();
      h.index = h.stack.length - 1;
      this.emit('history', h);
    };
    if (coalesce) {
      clearTimeout(this._historyTimer);
      this._historyTimer = setTimeout(commit, 320);
    } else {
      clearTimeout(this._historyTimer);
      commit();
    }
  }

  restore(snapJson) {
    const doc = JSON.parse(snapJson);
    this.state.title = doc.title;
    this.state.nodes = doc.nodes;
    this.state.edges = doc.edges;
    this.state.annotations = Array.isArray(doc.annotations) ? doc.annotations : [];
    this.state.selection = new Set();
    this.state.edgeSelection = new Set();
    this.emit('change', { reason: 'history' });
    this.emit('selection');
    this.scheduleSave();
  }

  undo() {
    const h = this.history;
    if (h.index <= 0) return false;
    h.index -= 1;
    this.restore(h.stack[h.index]);
    this.emit('history', h);
    return true;
  }

  redo() {
    const h = this.history;
    if (h.index >= h.stack.length - 1) return false;
    h.index += 1;
    this.restore(h.stack[h.index]);
    this.emit('history', h);
    return true;
  }

  /* document ops */
  addNode(node) {
    this.transaction((s) => {
      s.nodes.push(node);
      s.selection = new Set([node.id]);
      s.edgeSelection = new Set();
    }, { reason: 'add-node' });
    this.emit('selection');
    return node;
  }

  removeSelection() {
    const { selection, edgeSelection } = this.state;
    if (!selection.size && !edgeSelection.size) return false;
    this.transaction((s) => {
      const ids = new Set(selection);
      // also remove children of removed groups
      s.nodes = s.nodes.filter((n) => !ids.has(n.id));
      s.edges = s.edges.filter((e) => !ids.has(e.source) && !ids.has(e.target) && !edgeSelection.has(e.id));
      s.selection = new Set();
      s.edgeSelection = new Set();
    }, { reason: 'delete' });
    this.emit('selection');
    return true;
  }

  setSelection(ids, { additive = false } = {}) {
    const next = additive ? new Set(this.state.selection) : new Set();
    for (const id of ids) {
      if (additive && next.has(id)) next.delete(id);
      else next.add(id);
    }
    this.state.selection = next;
    if (ids.length) this.state.edgeSelection = new Set();
    this.emit('selection');
    this.emit('change', { reason: 'selection' });
  }

  selectAll() {
    this.state.selection = new Set(this.state.nodes.filter((n) => n.type !== 'group').map((n) => n.id));
    this.state.edgeSelection = new Set(this.state.edges.map((e) => e.id));
    this.emit('selection');
    this.emit('change', { reason: 'selection' });
  }

  clearSelection() {
    this.state.selection = new Set();
    this.state.edgeSelection = new Set();
    this.emit('selection');
    this.emit('change', { reason: 'selection' });
  }

  setTool(tool) {
    this.state.tool = tool;
    this.emit('tool', tool);
  }

  setSetting(key, value) {
    this.state.settings[key] = value;
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.state.settings));
    } catch {}
    this.emit('settings', this.state.settings);
  }

  setViewport(v, { silent = false } = {}) {
    this.state.viewport = { ...v };
    if (!silent) this.emit('viewport', this.state.viewport);
  }

  /* persistence */
  scheduleSave() {
    this.emit('dirty');
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this.save(), 700);
  }

  save() {
    try {
      const payload = JSON.stringify({
        version: 2,
        title: this.state.title,
        nodes: this.state.nodes,
        edges: this.state.edges,
        annotations: this.state.annotations,
        viewport: this.state.viewport,
        savedAt: Date.now(),
      });
      localStorage.setItem(STORAGE_KEY, payload);
      this.state.dirty = false;
      this.emit('saved');
    } catch (err) {
      console.warn('[canvas] save failed', err);
    }
  }

  /** 刷新后不存在仍在执行的任务，把 running/queued 归一为 idle，避免出现“永远在生成”的白框 */
  normalizeNodeStatuses(nodes) {
    if (!Array.isArray(nodes)) return nodes;
    for (const n of nodes) {
      const st = n?.data?.status;
      if (st === 'running' || st === 'queued') n.data = { ...n.data, status: 'idle' };
    }
    return nodes;
  }

  load() {
    if (FRESH) {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {}
      this.state.nodes = [];
      return this.loadDemo({ history: false });
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return this.loadDemo({ history: false });
      const doc = JSON.parse(raw);
      if (!Array.isArray(doc.nodes)) return this.loadDemo({ history: false });
      this.restoredFromStorage = true;
      this.state.title = doc.title || '未命名画布';
      this.state.nodes = this.normalizeNodeStatuses(doc.nodes);
      this.state.edges = doc.edges || [];
      this.state.viewport = doc.viewport || { x: 0, y: 0, zoom: 1 };
      this.state.annotations = Array.isArray(doc.annotations) ? doc.annotations : [];
      this.history = { stack: [this.snapshot()], index: 0 };
      this.emit('loaded', doc);
    } catch (err) {
      console.warn('[canvas] load failed', err);
      this.loadDemo({ history: false });
    }
  }

  loadDemo({ history = true } = {}) {
    const doc = demoDocument();
    this.state.title = doc.title;
    this.state.nodes = doc.nodes;
    this.state.edges = doc.edges;
    this.state.annotations = Array.isArray(doc.annotations) ? doc.annotations : [];
    this.state.selection = new Set();
    this.state.edgeSelection = new Set();
    this.emit('change', { reason: 'demo' });
    this.emit('selection');
    this.history = { stack: [this.snapshot()], index: 0 };
    if (history) this.emit('history', this.history);
    this.save();
  }

  clear() {
    this.transaction((s) => {
      s.nodes = [];
      s.edges = [];
      s.annotations = [];
      s.selection = new Set();
      s.edgeSelection = new Set();
    }, { reason: 'clear' });
    this.emit('selection');
  }

  exportJSON() {
    return JSON.stringify(
      {
        format: 'infinite-canvas',
        version: 2,
        title: this.state.title,
        viewport: this.state.viewport,
        nodes: this.state.nodes,
        edges: this.state.edges,
        annotations: this.state.annotations,
        exportedAt: new Date().toISOString(),
      },
      null,
      2,
    );
  }

  importJSON(text) {
    const doc = JSON.parse(text);
    if (!doc || !Array.isArray(doc.nodes)) throw new Error('不是有效的画布文件');
    this.transaction((s) => {
      s.title = doc.title || '导入的画布';
      s.nodes = this.normalizeNodeStatuses(
        doc.nodes.map((n) => ({
          ...n,
          x: Number(n.x) || 0,
          y: Number(n.y) || 0,
          data: n.data || {},
        })),
      );
      s.edges = (doc.edges || []).filter((e) => s.nodes.some((n) => n.id === e.source) && s.nodes.some((n) => n.id === e.target));
      s.annotations = Array.isArray(doc.annotations) ? doc.annotations : [];
      s.selection = new Set();
      s.edgeSelection = new Set();
      if (doc.viewport) s.viewport = doc.viewport;
    }, { reason: 'import' });
    this.emit('selection');
  }

  get theme() {
    return this.state.settings.theme;
  }

  toggleTheme() {
    this.setSetting('theme', this.state.settings.theme === 'dark' ? 'light' : 'dark');
  }

  restoreSettings() {
    if (FRESH) {
      this.state.settings = { ...this.state.settings, theme: 'dark' };
      return;
    }
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) Object.assign(this.state.settings, JSON.parse(raw));
      const theme = localStorage.getItem(THEME_KEY);
      if (theme) this.state.settings.theme = theme;
    } catch {}
    // reading view / open drawers are session state, never restored
    this.state.settings.readMode = false;
    this.state.settings.nodeManagerOpen = false;
    this.state.settings.annotateMode = false;
  }
}

export const store = new Store();
export { SNAP_GRID, SNAP_GRID as GRID };
export { svg as iconSvg };

/* re-export a few template helpers used by canvas.js */
/* ───────────────── 应用层能力（逆向自 canvas store 的 action） ───────────────── */

export const GROUP_COLORS = [
  { key: 'slate', value: 'rgba(100, 116, 139, 0.08)', border: 'rgba(100, 116, 139, 0.25)' },
  { key: 'blue', value: 'rgba(59, 130, 246, 0.10)', border: 'rgba(59, 130, 246, 0.30)' },
  { key: 'green', value: 'rgba(34, 197, 94, 0.10)', border: 'rgba(34, 197, 94, 0.30)' },
  { key: 'cyan', value: 'rgba(34, 211, 238, 0.10)', border: 'rgba(34, 211, 238, 0.30)' },
  { key: 'purple', value: 'rgba(168, 85, 247, 0.10)', border: 'rgba(168, 85, 247, 0.30)' },
  { key: 'orange', value: 'rgba(251, 146, 60, 0.10)', border: 'rgba(251, 146, 60, 0.30)' },
  { key: 'yellow', value: 'rgba(234, 179, 8, 0.10)', border: 'rgba(234, 179, 8, 0.30)' },
  { key: 'red', value: 'rgba(239, 68, 68, 0.10)', border: 'rgba(239, 68, 68, 0.30)' },
];

/* ───────────── 节点生成历史（逆向 nodeOutputHistory.*） ───────────── */

export function nodeMainMedia(node) {
  const h = node?.data?.history;
  if (!Array.isArray(h) || !h.length) return node?.data?.media || '';
  const idx = Math.min(h.length - 1, Math.max(0, Number(node.data.mainIndex) || 0));
  return h[idx]?.media || node?.data?.media || '';
}

export function nodeCurrentVersion(node) {
  const h = node?.data?.history;
  if (!Array.isArray(h) || !h.length) return null;
  const idx = Math.min(h.length - 1, Math.max(0, Number(node.data.mainIndex) || 0));
  return h[idx] || null;
}

export function pushNodeHistory(id, entry, { history = true } = {}) {
  store.transaction((s) => {
    const n = s.nodes.find((x) => x.id === id);
    if (!n) return;
    const list = Array.isArray(n.data.history) ? [...n.data.history] : [];
    list.push({
      id: entry.id || uid('v'),
      media: entry.media || '',
      prompt: entry.prompt ?? n.data.prompt ?? '',
      model: entry.model || n.data.model || '',
      seed: entry.seed ?? n.data.seed ?? '',
      at: entry.at || Date.now(),
      kind: entry.kind || n.type,
    });
    n.data = { ...n.data, history: list, mainIndex: list.length - 1, media: entry.media || n.data.media };
  }, { history, reason: 'history-push' });
}

export function setMainVersion(id, index) {
  store.transaction((s) => {
    const n = s.nodes.find((x) => x.id === id);
    if (!n || !Array.isArray(n.data.history) || !n.data.history[index]) return;
    n.data = { ...n.data, mainIndex: index, media: n.data.history[index].media };
  }, { history: true, reason: 'set-main-version' });
}

/* ───────────── 节点参数（本地版参数面板） ───────────── */

export const PARAM_DEFAULTS = {
  image: {
    model: 'seedream-5-0-flash',
    ratio: 'smart',
    resolution: '2K',
    count: 1,
    seed: -1,
    negative: '',
    style: '电影感',
  },
  'image-gen': {
    model: 'seedream-5-0-flash',
    ratio: 'smart',
    resolution: '2K',
    count: 1,
    seed: -1,
    negative: '',
    style: '电影感',
  },
  video: { model: 'seedance-2.0-mini', ratio: '16:9', resolution: '720p', duration: 5, seed: -1 },
  'video-gen': { model: 'seedance-2.0-mini', ratio: '16:9', resolution: '720p', duration: 5, seed: -1 },
  audio: { model: 'tts-1', audioType: '语音', voice: 'alloy', speed: 1, duration: 24 },
  'preview-output': { model: 'local-compose-v1', resolution: '1080p', duration: 5 },
  'rh-ai': { model: 'video-upscale-v2', resolution: '1080p', strength: 0.6 },
  llm: { model: 'gemini-2.5-flash-lite', temperature: 0.7, maxTokens: 512 },
  text: {},
  script: {},
  stack: { layout: '叠放', mode: '顺序' },
  '3d': { model: 'scene-01', fov: 35 },
  director: { model: 'director', shotCount: 3 },
  group: {},
  comment: {},
};

export function nodeParams(node) {
  const base = PARAM_DEFAULTS[node.type] || {};
  return { ...base, ...(node?.data?.params || {}) };
}

export function setNodeParams(id, patch) {
  store.transaction((s) => {
    const n = s.nodes.find((x) => x.id === id);
    if (!n) return;
    n.data = { ...n.data, params: { ...nodeParams(n), ...patch } };
  }, { history: true, reason: 'params', coalesce: true });
}

export function nodeFilters(node) {
  const f = node?.data?.filters;
  return {
    brightness: Number(f?.brightness ?? 100),
    contrast: Number(f?.contrast ?? 100),
    saturate: Number(f?.saturate ?? 100),
    rotate: Number(f?.rotate ?? 0),
    flipX: !!f?.flipX,
    flipY: !!f?.flipY,
  };
}

export function filterCSS(node) {
  const f = nodeFilters(node);
  const parts = [];
  if (f.brightness !== 100) parts.push(`brightness(${f.brightness}%)`);
  if (f.contrast !== 100) parts.push(`contrast(${f.contrast}%)`);
  if (f.saturate !== 100) parts.push(`saturate(${f.saturate}%)`);
  if (f.rotate) parts.push(`rotate(${f.rotate}deg)`);
  if (f.flipX) parts.push('scaleX(-1)');
  if (f.flipY) parts.push('scaleY(-1)');
  return parts.join(' ');
}

export function setNodeFilter(id, patch) {
  store.transaction((s) => {
    const n = s.nodes.find((x) => x.id === id);
    if (!n) return;
    n.data = { ...n.data, filters: { ...nodeFilters(n), ...patch } };
  }, { history: true, reason: 'filter', coalesce: true });
}

/* ───────────── 标注层（逆向 annotate.*） ───────────── */

export const ANNOTATION_COLORS = ['#f87171', '#fbbf24', '#4ade80', '#60a5fa', '#f472b6', '#ffffff'];

export function addAnnotation(annotation) {
  const item = {
    id: uid('a'),
    type: 'arrow',
    color: ANNOTATION_COLORS[0],
    width: 2,
    ...annotation,
  };
  store.transaction((s) => {
    s.annotations = [...s.annotations, item];
  }, { history: true, reason: 'annotate' });
  return item;
}

export function updateAnnotation(id, patch) {
  store.transaction((s) => {
    s.annotations = s.annotations.map((a) => (a.id === id ? { ...a, ...patch } : a));
  }, { history: true, reason: 'annotate-edit' });
}

export function removeAnnotation(id) {
  store.transaction((s) => {
    s.annotations = s.annotations.filter((a) => a.id !== id);
  }, { history: true, reason: 'annotate-delete' });
}

export function clearAnnotations() {
  store.transaction((s) => {
    s.annotations = [];
  }, { history: true, reason: 'annotate-clear' });
}

/* ───────────── 整理画布（逆向 organizeCanvas.*） ───────────── */

export function organizeCanvas(mode = 'left') {
  const nodes = store.nodes.filter((n) => n.type !== 'group');
  if (!nodes.length) return null;
  const before = JSON.stringify(store.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y })));
  const gapX = 72;
  const gapY = 64;
  const colCount = Math.max(1, Math.min(4, Math.ceil(Math.sqrt(nodes.length))));
  const colItems = Array.from({ length: colCount }, () => []);
  const sorted = [...nodes].sort((a, b) => a.y - b.y || a.x - b.x);
  sorted.forEach((n, i) => colItems[i % colCount].push(n));
  const colWidths = colItems.map((items) =>
    items.reduce((max, n) => Math.max(max, n.w || 380), 0),
  );
  const totalWidth = colWidths.reduce((a, b) => a + b, 0) + gapX * (colCount - 1);
  let cursorX = mode === 'center' ? -totalWidth / 2 : mode === 'right' ? -totalWidth : 0;
  const positions = new Map();
  const rowHeights = colItems.map((items) =>
    items.reduce((sum, n) => sum + (n.h || 220) + gapY, 0),
  );
  const maxHeight = Math.max(...rowHeights, 1);
  const baseY = mode === 'center' ? -maxHeight / 2 : 0;
  colItems.forEach((items, c) => {
    let y = baseY;
    for (const n of items) {
      positions.set(n.id, { x: Math.round(cursorX), y: Math.round(y) });
      y += (n.h || 220) + gapY;
    }
    cursorX += colWidths[c] + gapX;
  });
  store.transaction((s) => {
    for (const n of s.nodes) {
      const p = positions.get(n.id);
      if (p) {
        n.x = p.x;
        n.y = p.y;
      }
    }
  }, { history: true, reason: 'organize' });
  return before;
}

/* ───────────── 重命名 / 下载 ───────────── */

export function renameNode(id, label) {
  const clean = String(label || '').trim().slice(0, 60);
  if (!clean) return;
  store.transaction((s) => {
    const n = s.nodes.find((x) => x.id === id);
    if (n) n.data = { ...n.data, label: clean };
  }, { history: true, reason: 'rename' });
}

export function renameGroup(id, label) {
  renameNode(id, label);
}

export function setCollapsed(ids, collapsed, { history = true } = {}) {
  const list = Array.isArray(ids) ? ids : [ids];
  store.transaction((s) => {
    for (const n of s.nodes) {
      if (!list.includes(n.id)) continue;
      if (n.type === 'group') continue;
      n.data = { ...n.data, collapsed: !!collapsed };
    }
  }, { history, reason: 'collapse' });
}

export function expandAll() {
  store.transaction((s) => {
    for (const n of s.nodes) if (n.type !== 'group') n.data = { ...n.data, collapsed: false };
  }, { history: true, reason: 'expand-all' });
}

export function collapseAll() {
  store.transaction((s) => {
    for (const n of s.nodes) if (n.type !== 'group') n.data = { ...n.data, collapsed: true };
  }, { history: true, reason: 'collapse-all' });
}

export function setGroupColor(id, key) {
  const color = GROUP_COLORS.find((c) => c.key === key) || GROUP_COLORS[0];
  store.transaction((s) => {
    const n = s.nodes.find((x) => x.id === id);
    if (n) n.data = { ...n.data, groupColor: color.key };
  }, { history: true, reason: 'group-color' });
}

export function nodeTitle(node) {
  return node.data?.label || NODE_TYPES[node.type]?.name || node.type;
}

export function setNodeData(id, patch, { history = true } = {}) {
  const node = store.getNode(id);
  if (!node) return;
  store.transaction((s) => {
    const n = s.nodes.find((x) => x.id === id);
    if (n) n.data = { ...n.data, ...patch };
  }, { history, reason: 'data' });
}
