/* ============================================================================
 * api.js — APIMart 客户端（经本机代理，key 不出现在浏览器）
 *
 * 代理端点（server.mjs）：
 *   GET  /api/health  /api/models  /api/balance
 *   POST /api/chat    /api/images  /api/videos  /api/audio/speech  /api/uploads/images
 *   GET  /api/tasks/:id
 * ========================================================================= */

import { MODEL_CATALOG } from './model-catalog.js';

const VIDEO_PREFIXES = [
  'veo', 'sora', 'kling', 'seedance', 'minimax-hailuo', 'minimax-h3', 'runway', 'pika',
  'luma', 'vidu', 'wan2.', 'wan3.', 'pixverse', 'skyreels', 'happyhorse', 'grok-imagine-video',
  'gemini-omni', 'flux-3-video', 'ltx', 'doubao', 'hailuo', 'omni-flash', 'grok-imagine-1',
  'grok-imagine-video', 'movie', 'video',
];
const IMAGE_PREFIXES = [
  'dall-e', 'gpt-image', 'seedream', 'flux-', 'imagen', 'gemini-', 'nano-banana', 'midjourney',
  'mj', 'grok-imagine-image', 'hy-image', 'mai-image', 'qwen-image', 'z-image', 'wan2.7-image',
  'recraft', 'ideogram', 'seededit', 'stable', 'sdxl', 'image',
];
const AUDIO_PREFIXES = ['tts-', 'gpt-4o-mini-tts', 'gpt-4o-audio', 'gpt-audio', 'flowmusic', 'suno', 'whisper'];
const NON_CHAT = [
  'babbage', 'davinci', 'embedding', 'whisper', 'ocr', 'moderation', 'rerank', 'tts-',
  'dall-e', 'gpt-image', 'seedream', 'flux', 'imagen', 'midjourney', 'mj', 'sora', 'veo',
  'kling', 'seedance', 'hailuo', 'minimax-h3', 'vidu', 'wan2', 'wan3', 'pixverse', 'skyreels',
  'grok-imagine', 'qwen-image', 'z-image', 'mai-image', 'hy-image', 'nano-banana', 'gemini-omni',
];

function startsWithAny(id, list) {
  const s = String(id).toLowerCase();
  return list.some((p) => s.startsWith(p));
}

export function classifyModel(m) {
  const id = String(m.id || '').toLowerCase();
  if (startsWithAny(id, AUDIO_PREFIXES)) return 'audio';
  if (startsWithAny(id, VIDEO_PREFIXES)) return 'video';
  if (startsWithAny(id, IMAGE_PREFIXES)) return 'image';
  if (startsWithAny(id, NON_CHAT)) return 'other';
  return 'text';
}

export const api = {
  state: {
    online: false,
    hasKey: false,
    base: '',
    models: [],
    byKind: { text: [], image: [], video: [], audio: [], other: [] },
    balance: null,
    error: '',
    checkedAt: 0,
  },

  async init() {
    try {
      const r = await fetch('/api/health', { cache: 'no-store' });
      const h = await r.json();
      this.state.online = !!h.ok;
      this.state.hasKey = !!h.hasKey;
      this.state.base = h.base || '';
      this.state.error = h.ok ? '' : 'API 未连接';
      if (h.ok) await this.loadModels();
      else this._applyStaticCatalog();
      this.state.checkedAt = Date.now();
      return this.state;
    } catch (err) {
      this.state.online = false;
      this.state.error = err.message || '本地代理未启动';
      this._applyStaticCatalog();
      return this.state;
    }
  },

  async loadModels() {
    // 1) 优先：平台权威元数据（category + capability_tags）
    try {
      const r = await fetch('/api/models?expand=category', { cache: 'no-store' });
      const d = await r.json();
      const models = Array.isArray(d.data) ? d.data : [];
      if (models.length && models.some((m) => m.category)) {
        this.state.models = models;
        this._index(models);
        return models;
      }
    } catch {}
    // 2) 回退：静态排查结果（由 scripts/audit-models.mjs 生成）
    this._applyStaticCatalog();
    return this.state.models;
  },

  _applyStaticCatalog() {
    const byKind = { text: [], image: [], video: [], audio: [], other: [] };
    const meta = {};
    for (const kind of ['image', 'video', 'chat', 'audio']) {
      for (const m of MODEL_CATALOG.models[kind] || []) {
        const target = kind === 'chat' ? 'text' : kind;
        byKind[target].push(m.id);
        meta[m.id] = { kind, tags: m.tags || [], canRef: !!m.canRef };
      }
    }
    this.state.byKind = byKind;
    this.state.meta = meta;
    this.state.models = Object.keys(meta).map((id) => ({ id }));
    this.state.staticCatalog = true;
  },

  /** normalize live metadata into byKind + meta; mirrors scripts/audit-models.mjs filters */
  _index(models) {
    const NON_CHAT = /babbage|davinci|embedding|embed|ocr|moderation|rerank|whisper|tts|transcri|image|video|audio|music|suno|flowmusic/i;
    const NON_TTS = /whisper|transcri|audio-preview/i;
    const NON_IMAGE = /video|music|suno|tts|chat|embedding|whisper/i;
    const NON_VIDEO = /image(?!.*video)|chat|tts|embedding|whisper/i;
    const byKind = { text: [], image: [], video: [], audio: [], other: [] };
    const meta = {};
    for (const m of models) {
      const cat = m.category;
      if (!cat || cat === 'unknown') {
        const CHAT_FAMILY = /^(deepseek|qwen|glm|moonshot|kimi|grok|mistral|llama|yi-|baichuan|doubao|minimax-m)/i;
        const LEGACY = /^text-(ada|babbage|curie|davinci)/i;
        if (CHAT_FAMILY.test(m.id) && !LEGACY.test(m.id)) {
          byKind.text.push(m.id);
          meta[m.id] = { kind: 'text', tags: ['text'], canRef: false, rawTags: ['family-fallback'] };
        } else {
          byKind.other.push(m.id);
        }
        continue;
      }
      const tags = normalizeTags(m.capability_tags || []);
      let id = m.id;
      let keep = true;
      if (cat === 'image' && NON_IMAGE.test(id)) keep = false;
      if (cat === 'video' && NON_VIDEO.test(id)) keep = false;
      if (cat === 'chat' && NON_CHAT.test(id)) keep = false;
      if (cat === 'audio' && NON_TTS.test(id)) keep = false;
      if (!keep) continue;
      const target = cat === 'chat' ? 'text' : cat;
      byKind[target].push(id);
      meta[id] = {
        kind: cat === 'chat' ? 'text' : cat,
        tags,
        canRef: cat === 'video' ? tags.includes('i2v') || tags.includes('v2v') : tags.includes('i2i'),
        rawTags: m.capability_tags || [],
        endpoint: m.parameters?.endpoint || null,
      };
    }
    const uniq = (a) => [...new Set(a)];
    for (const k of Object.keys(byKind)) byKind[k] = uniq(byKind[k]);
    this.state.byKind = byKind;
    this.state.meta = meta;
    this.state.staticCatalog = false;
  },

  async balance() {
    try {
      const r = await fetch('/api/balance', { cache: 'no-store' });
      this.state.balance = await r.json();
      return this.state.balance;
    } catch {
      return null;
    }
  },

  models(kind, fallback = []) {
    const list = this.state.byKind?.[kind] || [];
    return list.length ? list : fallback;
  },

  /** 某类节点可用的模型（按推荐度排序）；hasRefs=true 时只保留支持参考图/首帧的模型 */
  modelsFor(kind, { hasRefs = false } = {}) {
    const list = this.state.byKind?.[kind] || [];
    const meta = this.state.meta || {};
    const filtered = hasRefs ? list.filter((id) => meta[id]?.canRef) : list;
    const base = filtered.length ? filtered : list;
    const pref = this.state.pref?.[kind] || PREFERENCE[kind] || [];
    return [...base].sort((a, b) => {
      const ra = pref.indexOf(a);
      const rb = pref.indexOf(b);
      return (ra === -1 ? 999 : ra) - (rb === -1 ? 999 : rb) || a.localeCompare(b);
    });
  },

  recommend(kind, { hasRefs = false } = {}) {
    return this.modelsFor(kind, { hasRefs })[0] || '';
  },

  modelMeta(id) {
    return this.state.meta?.[id] || null;
  },

  /** 能力标签（中文），用于参数面板提示 */
  modelChips(id) {
    const meta = this.modelMeta(id);
    const map = {
      t2i: '文生图',
      i2i: '图生图 / 参考图',
      t2v: '文生视频',
      i2v: '图生视频',
      v2v: '视频生视频',
      t2a: '文生音频',
      a2a: '音频生音频',
      text: '文本',
      vision: '视觉理解',
    };
    const kind = meta?.kind;
    const tags = (meta?.tags || [])
      .filter((t) => !(kind !== 'text' && t === 'text'))
      .map((t) => map[t])
      .filter(Boolean);
    return [...new Set(tags)];
  },

  supportsRef(id) {
    return !!this.modelMeta(id)?.canRef;
  },

  async _json(path, body, { signal, method = 'POST' } = {}) {
    // 单次请求 120s 超时，避免任务永远停在“生成中”
    const timeout = AbortSignal.timeout(120_000);
    const merged = signal ? AbortSignal.any([signal, timeout]) : timeout;
    const r = await fetch(path, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: merged,
    });
    const text = await r.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new ApiError(`返回不是 JSON（HTTP ${r.status}）：${text.slice(0, 160)}`, r.status);
    }
    if (!r.ok || data?.error || data?.code >= 400) {
      const msg = data?.error?.message || data?.message || `HTTP ${r.status}`;
      throw new ApiError(msg, r.status, data?.error?.code);
    }
    return data;
  },

  async chat({ model, messages, temperature = 0.7, max_tokens = 1024, signal }) {
    return this._json('/api/chat', { model, messages, temperature, max_tokens, stream: false }, { signal });
  },

  async submitImage({ model, prompt, size = '1:1', resolution = '1K', seed, image_urls, negative_prompt }) {
    const body = { model, prompt, size, resolution };
    if (seed != null && seed !== -1) body.seed = Number(seed);
    if (Array.isArray(image_urls) && image_urls.length) body.image_urls = image_urls.map((url) => ({ url }));
    if (negative_prompt) body.negative_prompt = negative_prompt;
    const d = await this._json('/api/images', body);
    return extractTaskId(d);
  },

  async submitVideo({ model, prompt, size = '16:9', resolution = '720p', duration = 5, generate_audio = false, seed, image_urls }) {
    const body = { model, prompt, size, resolution, duration: Number(duration) };
    if (generate_audio) body.generate_audio = true;
    if (seed != null && seed !== -1) body.seed = Number(seed);
    if (Array.isArray(image_urls) && image_urls.length) body.image_urls = image_urls.map((url) => ({ url }));
    const d = await this._json('/api/videos', body);
    return extractTaskId(d);
  },

  async getTask(id) {
    return this._json(`/api/tasks/${encodeURIComponent(id)}`, null, { method: 'GET' });
  },

  /**
   * Poll an async task until it finishes. `onProgress(pct, status)` reports.
   * APIMart statuses seen: submitted / pending / processing / completed / failed.
   */
  async waitTask(taskId, { onProgress, signal, intervalMs = 2500, timeoutMs = 15 * 60 * 1000 } = {}) {
    const started = Date.now();
    while (true) {
      if (signal?.aborted) throw new ApiError('已取消', 0);
      if (Date.now() - started > timeoutMs) throw new ApiError('生成超时', 0);
      const d = await this.getTask(taskId);
      const task = d.data || d;
      const status = String(task.status || '').toLowerCase();
      const progress = Number(task.progress || (status === 'completed' ? 100 : 0));
      onProgress?.(progress, status);
      if (status === 'completed' || status === 'succeeded' || status === 'success') return task;
      if (status === 'failed' || status === 'error' || status === 'cancelled') {
        throw new ApiError(task.error?.message || task.message || `任务失败（${status}）`, 0);
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  },

  /** pull media urls out of a completed task result (tolerant to variants) */
  extractMedia(task) {
    const result = task?.result || task?.output || task || {};
    const urls = [];
    const push = (v) => {
      if (!v) return;
      if (typeof v === 'string') urls.push(v);
      else if (Array.isArray(v)) v.forEach(push);
      else if (v.url) push(v.url);
    };
    for (const key of ['images', 'videos', 'video', 'audios', 'audios', 'output']) push(result[key]);
    push(result.url);
    return [...new Set(urls.filter((u) => typeof u === 'string' && /^https?:|^data:/.test(u)))];
  },

  async uploadImage(dataURL) {
    const blob = await (await fetch(dataURL)).blob();
    const form = new FormData();
    form.append('file', blob, 'canvas-image.png');
    const r = await fetch('/api/uploads/images', { method: 'POST', body: form });
    const d = await r.json();
    if (!r.ok || d?.error) throw new ApiError(d?.error?.message || `上传失败 HTTP ${r.status}`, r.status);
    const url = d.url || d.data?.url;
    if (!url) throw new ApiError('上传接口未返回 url', 0);
    return url;
  },

  async speech({ model = 'tts-1', input, voice = 'alloy', speed = 1, response_format = 'mp3' }) {
    const r = await fetch('/api/audio/speech', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, input, voice, speed, response_format }),
    });
    if (!r.ok) {
      const text = await r.text();
      let msg = `TTS HTTP ${r.status}`;
      try {
        msg = JSON.parse(text)?.error?.message || msg;
      } catch {}
      throw new ApiError(msg, r.status);
    }
    const blob = await r.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  },
};

function extractTaskId(d) {
  const first = Array.isArray(d?.data) ? d.data[0] : d?.data;
  const id =
    first?.task_id ||
    first?.id ||
    d?.task_id ||
    d?.id ||
    d?.data?.task_id ||
    d?.task?.id;
  if (!id) throw new ApiError(`接口未返回任务 ID：${JSON.stringify(d).slice(0, 200)}`, 0);
  return id;
}

export const PREFERENCE = {
  image: ['seedream-5-0-flash', 'seedream-5-0-lite', 'seedream-4-5', 'flux-2-flex', 'gpt-image-1.5', 'seedream-4-0'],
  video: ['seedance-2.0-mini', 'seedance-2.0', 'veo3.1-fast', 'seedance-1-0-pro-fast', 'kling-3.0-turbo'],
  text: ['gemini-2.5-flash-lite', 'gpt-4o-mini', 'deepseek-v4-flash', 'qwen-turbo', 'gemini-2.5-flash'],
  audio: ['tts-1', 'gpt-4o-mini-tts'],
};

/** 节点类型 → 模型类别 */
export const KIND_BY_NODE = {
  image: 'image',
  'image-gen': 'image',
  video: 'video',
  'video-gen': 'video',
  'preview-output': 'video',
  llm: 'text',
  audio: 'audio',
};

const TAG_RULES = [
  [/text to image|文生图|text2image|t2i/i, 't2i'],
  [/image to image|图生图|image2image|i2i|image edit|图片编辑|参考图/i, 'i2i'],
  [/text to video|文生视频|text2video|t2v/i, 't2v'],
  [/image to video|图生视频|image2video|i2v|首帧/i, 'i2v'],
  [/video to video|视频生视频|video2video|v2v|视频编辑/i, 'v2v'],
  [/text to audio|文生音频|tts|text2speech/i, 't2a'],
  [/audio to audio|音频生音频/i, 'a2a'],
  [/vision|视觉|图像理解/i, 'vision'],
  [/text|文本/i, 'text'],
];
export function normalizeTags(tags = []) {
  const out = new Set();
  for (const t of tags) for (const [re, key] of TAG_RULES) if (re.test(String(t))) out.add(key);
  return [...out];
}

export class ApiError extends Error {
  constructor(message, status = 0, code) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}
