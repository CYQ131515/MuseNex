#!/usr/bin/env node
/**
 * APIMart 模型排查：拉取官方模型元数据（category / capability_tags / parameters），
 * 生成前端用的静态目录 src/model-catalog.js 和排查报告 docs/model-audit.md。
 *
 *   node scripts/audit-models.mjs
 *
 * 数据来源：GET /v1/models?expand=parameters&category=<image|video|chat|audio>
 * 说明：category 是平台权威分类；capability_tags 用于判断「文生图 / 图生图 / 文生视频 / 图生视频」。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'config.local.json'), 'utf8'));
const BASE = (cfg.baseUrl || 'https://api.apimart.ai/v1').replace(/\/$/, '');
const KEY = process.env.APIMART_API_KEY || cfg.apiKey;

const CATEGORIES = ['image', 'video', 'chat', 'audio'];

const PROXY = process.env.APIMART_PROXY || 'http://127.0.0.1:8099';
const CACHE = path.join(root, 'scripts/.cache');
fs.mkdirSync(CACHE, { recursive: true });
const cacheName = (p) => p.replace(/^\/models\??/, 'models-').replace(/[&=]/g, '-') || 'models';
const get = async (p) => {
  const urls = [`${BASE}${p}`, `${PROXY}/api/models${p.replace('/models', '')}`];
  let lastErr;
  for (const url of urls) {
    try {
      const r = await fetch(url, { headers: { authorization: `Bearer ${KEY}` } });
      if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
      const data = await r.json();
      fs.writeFileSync(path.join(CACHE, `${cacheName(p)}.json`), JSON.stringify(data));
      return data;
    } catch (err) {
      lastErr = err;
    }
  }
  // 离线/限流兜底：用上次成功抓取的缓存
  const file = path.join(CACHE, `${cacheName(p)}.json`);
  if (fs.existsSync(file)) {
    console.warn(`[warn] ${p} 拉取失败，使用缓存 ${path.relative(root, file)}`);
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  throw lastErr;
};

/* capability tag normalization: platform returns mixed EN/zh */
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
function normalizeTags(tags = []) {
  const out = new Set();
  for (const t of tags) for (const [re, key] of TAG_RULES) if (re.test(String(t))) out.add(key);
  return [...out];
}

/* models that are in a category but are not usable for that node kind */
const NON_CHAT = /babbage|davinci|embedding|embed|ocr|moderation|rerank|whisper|tts|transcri|image|video|audio|music|suno|flowmusic/i;
const NON_TTS = /whisper|transcri|audio-preview/i;
const NON_IMAGE = /video|music|suno|tts|chat|embedding|whisper/i;
const NON_VIDEO = /image(?!.*video)|chat|tts|embedding|whisper/i;

/* curated preference order: fast / cheap / stable first */
const PREF = {
  image: ['seedream-5-0-flash', 'seedream-5-0-lite', 'seedream-4-5', 'flux-2-flex', 'gpt-image-1.5', 'seedream-4-0'],
  video: ['seedance-2.0-mini', 'seedance-2.0', 'veo3.1-fast', 'seedance-1-0-pro-fast', 'kling-3.0-turbo'],
  chat: ['gemini-2.5-flash-lite', 'gpt-4o-mini', 'deepseek-v4-flash', 'qwen-turbo', 'gemini-2.5-flash'],
  audio: ['tts-1', 'gpt-4o-mini-tts'],
};

const rank = (kind, id) => {
  const list = PREF[kind] || [];
  const i = list.indexOf(id);
  return i === -1 ? 1000 : i;
};

async function main() {
  const models = [];
  const rawByCat = {};
  for (const cat of CATEGORIES) {
    const d = await get(`/models?expand=parameters&category=${cat}`);
    rawByCat[cat] = d.data || [];
    models.push(...rawByCat[cat].map((m) => ({ ...m, category: m.category || cat })));
  }
  const basic = await get('/models');
  const basicIds = new Set((basic.data || []).map((m) => m.id));
  const knownIds = new Set(models.map((m) => m.id));
  const unknown = [...basicIds].filter((id) => !knownIds.has(id));
  /* 未归类兜底：已知 chat 家族、且不是 legacy completions/嵌入类 → 当作文本模型 */
  const CHAT_FAMILY = /^(deepseek|qwen|glm|moonshot|kimi|grok|mistral|llama|yi-|baichuan|doubao|minimax-m)/i;
  const LEGACY_COMPLETION = /^text-(ada|babbage|curie|davinci)/i;
  const familyFallback = unknown.filter((id) => CHAT_FAMILY.test(id) && !LEGACY_COMPLETION.test(id));

  const usable = { image: [], video: [], chat: [], audio: [] };
  const excluded = [];
  for (const cat of CATEGORIES) {
    for (const m of rawByCat[cat]) {
      const tags = normalizeTags(m.capability_tags || []);
      let keep = true;
      let reason = '';
      if (cat === 'image' && NON_IMAGE.test(m.id)) { keep = false; reason = '非出图模型'; }
      if (cat === 'video' && NON_VIDEO.test(m.id)) { keep = false; reason = '非视频生成模型'; }
      if (cat === 'chat' && NON_CHAT.test(m.id)) { keep = false; reason = '非对话模型（补全/嵌入/转写/多模态音频等）'; }
      if (cat === 'audio' && NON_TTS.test(m.id)) { keep = false; reason = '非语音合成模型（转写类）'; }
      if (!keep) {
        excluded.push({ id: m.id, category: cat, reason });
        continue;
      }
      usable[cat].push({
        id: m.id,
        tags,
        rawTags: m.capability_tags || [],
        endpoint: m.parameters?.endpoint || null,
        canRef: cat === 'video' ? tags.includes('i2v') || tags.includes('v2v') : tags.includes('i2i'),
        canGen: cat === 'video' ? tags.includes('t2v') || tags.includes('i2v') || tags.length === 0 : true,
      });
    }
  }

  for (const id of familyFallback) {
    usable.chat.push({ id, tags: ['text'], rawTags: ['family-fallback'], endpoint: null, canRef: false, canGen: true });
    unknown.splice(unknown.indexOf(id), 1);
  }
  for (const cat of CATEGORIES) {
    usable[cat].sort((a, b) => rank(cat, a.id) - rank(cat, b.id) || a.id.localeCompare(b.id));
  }

  const catalog = {
    generatedAt: new Date().toISOString(),
    source: `${BASE}/models?expand=parameters`,
    counts: { total: basicIds.size, ...Object.fromEntries(CATEGORIES.map((c) => [c, usable[c].length])) },
    unknown,
    excluded,
    pref: PREF,
    models: usable,
  };
  fs.writeFileSync(path.join(root, 'src/model-catalog.js'), `/* generated by scripts/audit-models.mjs — ${catalog.generatedAt} */
export const MODEL_CATALOG = ${JSON.stringify(catalog, null, 2)};
`);
  fs.writeFileSync(path.join(root, 'scripts/model-catalog.json'), JSON.stringify(catalog, null, 2));

  /* report */
  const lines = [];
  lines.push('# APIMart 模型能力排查\n');
  lines.push(`> 生成时间：${catalog.generatedAt}  `);
  lines.push(`> 数据源：\`GET /v1/models?expand=parameters&category=...\`（平台权威分类 + 能力标签 + 参数 Schema）\n`);
  lines.push(`**模型总数 ${catalog.counts.total}**；按节点类型筛出：图片 **${catalog.counts.image}**、视频 **${catalog.counts.video}**、文本 **${catalog.counts.chat}**、音频 **${catalog.counts.audio}**。\n`);
  lines.push('对比：旧的前缀猜法得到 图片 66 / 视频 64 / 文本 173 / 音频 12，其中图片与视频各混入了不能生成对应媒体的模型；下面全部以平台 category 为准。\n');
  for (const cat of CATEGORIES) {
    lines.push(`## ${({ image: '图片（image_generation）', video: '视频（video_generation）', chat: '文本（chat）', audio: '音频（audio）' })[cat]}\n`);
    lines.push('| 模型 | 能力标签 | 参考图/首帧 |');
    lines.push('| --- | --- | :-: |');
    for (const m of usable[cat]) lines.push(`| \`${m.id}\` | ${m.tags.join(' / ') || '—'} | ${m.canRef ? '✅' : '—'} |`);
    lines.push('');
  }
  lines.push('## 排除的模型\n');
  lines.push('| 模型 | 平台分类 | 原因 |');
  lines.push('| --- | --- | --- |');
  for (const e of catalog.excluded) lines.push(`| \`${e.id}\` | ${e.category} | ${e.reason} |`);
  lines.push('');
  lines.push(`## 未归类但按 chat 家族兜底\n`);
  lines.push(familyFallback.length ? familyFallback.map((id) => `- \`${id}\``).join('\n') : '- 无');
  lines.push('');
  lines.push(`## 仍未归类（category=unknown）\n`);
  lines.push(unknown.length ? unknown.map((id) => `- \`${id}\``).join('\n') : '- 无');
  fs.writeFileSync(path.join(root, 'docs/model-audit.md'), lines.join('\n'));

  console.log(JSON.stringify(catalog.counts));
  console.log('unknown:', unknown.length, 'excluded:', excluded.length);
  console.log('written: src/model-catalog.js, docs/model-audit.md');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
