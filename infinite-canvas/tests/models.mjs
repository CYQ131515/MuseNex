/**
 * 模型排查 / 智能选择验证（免费，不触发生成）
 *
 * 依据：GET /v1/models?expand=category 的平台权威 category + capability_tags。
 * 验证图片 / 视频 / 文本 / 音频四类节点的候选模型不会串类别，且推荐模型正确。
 */
import { newPage } from './cdp.mjs';

const s = await newPage('about:blank');
await s.send('Page.enable');
await s.send('Runtime.enable');
await s.send('Network.enable');
await s.send('Network.setCacheDisabled', { cacheDisabled: true });
const errs = [];
s.on('Runtime.exceptionThrown', (p) => errs.push(p.exceptionDetails?.exception?.description || p.exceptionDetails?.text));
await s.goto('http://127.0.0.1:8099/?fresh=1&api=0', 4200);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const state = await s.eval(`(() => {
  const a = window.__canvas.api;
  const kinds = Object.fromEntries(Object.entries(a.state.byKind).map(([k, v]) => [k, v.length]));
  const cats = {};
  for (const k of ['image', 'video', 'text', 'audio']) {
    const list = a.state.byKind[k] || [];
    cats[k] = list.every((id) => (a.state.meta[id]?.kind || '') === k);
  }
  return { kinds, cats, static: a.state.staticCatalog };
})()`);
console.log('catalog counts:', JSON.stringify(state.kinds));
console.log('category pure :', JSON.stringify(state.cats));

const rec = await s.eval(`(() => { const a=window.__canvas.api; return { image:a.recommend('image'), video:a.recommend('video'), text:a.recommend('text'), audio:a.recommend('audio') }; })()`);
console.log('recommend     :', JSON.stringify(rec));

const refs = await s.eval(`(() => {
  const a = window.__canvas.api;
  const out = {};
  for (const k of ['image', 'video']) {
    const all = a.modelsFor(k, { hasRefs: false }).length;
    const withRef = a.modelsFor(k, { hasRefs: true });
    out[k] = { all, refCapable: withRef.length, allRef: withRef.every((id) => a.supportsRef(id)) };
  }
  return out;
})()`);
console.log('ref filtering :', JSON.stringify(refs));

/* image node: wrong video model gets auto-corrected */
await s.eval(`(() => { const st=window.__canvas.store; const n=st.nodes.find(x=>x.type==='image');
  st.transaction(s2=>{ const t=s2.nodes.find(x=>x.id===n.id); t.data={...t.data, params:{...(t.data.params||{}), model:'kling-v3'}}; },{history:true,reason:'test'});
  st.state.selection=new Set([n.id]); st.emit('selection'); window.__canvas.ui.openParamBar(n.id); })()`);
await pause(500);
const imgBar = await s.eval(`(() => {
  const n = window.__canvas.store.nodes.find(x=>x.type==='image');
  const sel = document.querySelector('.param-bar [data-param="model"]');
  return { model: n.data.params?.model, options: sel?.options.length, hasVideoModel: [...(sel?.options||[])].some(o=>/kling|veo|seedance/.test(o.value)), hint: (document.querySelector('.param-hint')?.textContent||'').replace(/\\s+/g,' ').trim().slice(0,60) };
})()`);
console.log('image node    :', JSON.stringify(imgBar));

/* video node: has upstream image → only i2v-capable candidates */
await s.eval(`(() => { const st=window.__canvas.store; const n=st.nodes.find(x=>x.type==='video-gen'); st.state.selection=new Set([n.id]); st.emit('selection'); window.__canvas.ui.openParamBar(n.id); })()`);
await pause(500);
const vidBar = await s.eval(`(() => {
  const n = window.__canvas.store.nodes.find(x=>x.type==='video-gen');
  const sel = document.querySelector('.param-bar [data-param="model"]');
  const a = window.__canvas.api;
  const ids = [...(sel?.options||[])].map(o=>o.value);
  return { model: n.data.params?.model, options: ids.length, allRef: ids.every(id=>a.supportsRef(id)), hint: (document.querySelector('.param-hint')?.textContent||'').replace(/\\s+/g,' ').trim().slice(0,60) };
})()`);
console.log('video node    :', JSON.stringify(vidBar));

/* text node: only chat models */
await s.eval(`(() => { const st=window.__canvas.store; const n=st.nodes.find(x=>x.type==='llm'); st.state.selection=new Set([n.id]); st.emit('selection'); window.__canvas.ui.openParamBar(n.id); })()`);
await pause(400);
const textBar = await s.eval(`(() => {
  const sel = document.querySelector('.param-bar [data-param="model"]');
  const ids = [...(sel?.options||[])].map(o=>o.value);
  return { options: ids.length, hasMediaModel: ids.some(id=>/seedance|kling|veo|seedream|dall-e|tts|suno/.test(id)) };
})()`);
console.log('text node     :', JSON.stringify(textBar));

/* audio node: only audio models */
await s.eval(`(() => { const st=window.__canvas.store; const n=st.nodes.find(x=>x.type==='audio'); st.state.selection=new Set([n.id]); st.emit('selection'); window.__canvas.ui.openParamBar(n.id); })()`);
await pause(400);
const audioBar = await s.eval(`(() => {
  const sel = document.querySelector('.param-bar [data-param="model"]');
  const ids = [...(sel?.options||[])].map(o=>o.value);
  return { options: ids.length, first: ids.slice(0,3), hasVideoModel: ids.some(id=>/seedance|kling|veo/.test(id)) };
})()`);
console.log('audio node    :', JSON.stringify(audioBar));

await s.eval(`window.__canvas.ui.closeParamBar()`);
await s.eval(`window.__canvas.ui.openApiPanel(true)`);
await pause(400);
const panel = await s.eval(`(() => {
  const rows = [...document.querySelectorAll('#apiPanel .info-row')].map(r=>r.textContent.replace(/\\s+/g,' ').trim());
  return { rows: rows.filter(r=>/模型|分类来源|智能推荐/.test(r)), rescan: !!document.querySelector('#apiPanel [data-api="rescan"]') };
})()`);
console.log('api panel     :', JSON.stringify(panel));
await s.shot('/tmp/rh/s7-model-audit.png');
console.log('errors:', JSON.stringify(errs.slice(0, 6), null, 2));
s.close();
process.exit(0);
