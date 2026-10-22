/**
 * APIMart 接入验证（默认只跑不花钱的部分）
 *
 *   1. 本地代理健康检查 / 模型列表 / 模型分类
 *   2. 画布里的 API 状态 chip、设置面板、参数面板模型下拉
 *   3. 文本节点真实调用（gemini-2.5-flash-lite，成本可忽略）
 *   4. 视频节点只验证「额度确认弹窗」，不会真的提交付费任务
 *
 * 想额外验证真实图片生成（约 $0.01/张）：
 *   RUN_PAID=1 node tests/api.mjs
 */
import { newPage } from './cdp.mjs';

const PAID = process.env.RUN_PAID === '1';
const s = await newPage('about:blank');
await s.send('Page.enable');
await s.send('Runtime.enable');
await s.send('Network.enable');
await s.send('Network.setCacheDisabled', { cacheDisabled: true });
const errs = [];
s.on('Runtime.exceptionThrown', (p) => errs.push(p.exceptionDetails?.exception?.description || p.exceptionDetails?.text));
s.on('Runtime.consoleAPICalled', (p) => {
  if (p.type === 'error') errs.push((p.args || []).map((a) => a.value ?? a.description).join(' '));
});
await s.goto('http://127.0.0.1:8099/?fresh=1', 4200);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/* 1. proxy health */
const health = await (await fetch('http://127.0.0.1:8099/api/health')).json();
console.log('health       :', JSON.stringify({ ok: health.ok, models: health.models, keySource: health.keySource }));
if (!health.ok) {
  console.log('errors:', JSON.stringify(['APIMart 未连接，跳过后续用例']));
  process.exit(1);
}

/* 2. api chip + panel + model dropdown */
const chip = await s.eval(`({ cls: document.querySelector('#apiBtn')?.className, text: document.querySelector('#apiBtn .api-chip__text')?.textContent })`);
console.log('api chip     :', JSON.stringify(chip));
const state = await s.eval(`(() => { const a = window.__canvas.api; return { online:a.state.online, models:a.state.models.length, text:a.state.byKind.text.length, image:a.state.byKind.image.length, video:a.state.byKind.video.length, audio:a.state.byKind.audio.length }; })()`);
console.log('api classify :', JSON.stringify(state));
await s.eval(`window.__canvas.ui.openApiPanel(true)`);
await pause(300);
const panel = await s.eval(`({ rows: document.querySelectorAll('#apiPanel .info-row').length, toggles: document.querySelectorAll('#apiPanel [data-api-toggle]').length })`);
console.log('api panel    :', JSON.stringify(panel));
await s.eval(`window.__canvas.ui.openApiPanel(false)`);
await s.eval(`(() => { const st=window.__canvas.store; const n=st.nodes.find(x=>x.type==='image'); st.state.selection=new Set([n.id]); st.emit('selection'); window.__canvas.ui.openParamBar(n.id); })()`);
await pause(300);
const options = await s.eval(`(() => { const sel=document.querySelector('.param-bar [data-param="model"]'); return { count: sel?.options.length, first: [...(sel?.options||[])].slice(0,3).map(o=>o.value) }; })()`);
console.log('model select :', JSON.stringify(options));
await s.eval(`window.__canvas.ui.closeParamBar()`);

/* 3. real text generation through the canvas */
await s.eval(`(() => {
  const st=window.__canvas.store; const n=st.nodes.find(x=>x.type==='llm');
  st.transaction(s2=>{ const t=s2.nodes.find(x=>x.id===n.id); t.data={...t.data, prompt:'用一句话描述雨夜天台的镜头'}; },{history:false,reason:'prompt'});
  window.__canvas.canvas.runNode(n.id);
})()`);
await pause(15000);
const llm = await s.eval(`(() => { const n=window.__canvas.store.nodes.find(x=>x.type==='llm'); return { status:n.data.status, text:(n.data.text||'').slice(0,50) }; })()`);
console.log('llm api run  :', JSON.stringify(llm));

/* 4. video confirm guard (no spend) */
await s.eval(`(() => { const st=window.__canvas.store; const n=st.nodes.find(x=>x.type==='video-gen'); window.__canvas.canvas.runNode(n.id); })()`);
await pause(400);
const confirm = await s.eval(`(() => { const d=document.querySelector('.generic-dialog'); return { open: !!d, title: d?.querySelector('h3')?.textContent }; })()`);
console.log('video guard  :', JSON.stringify(confirm));
await s.eval(`document.querySelector('.generic-dialog [data-dlg-act="cancel"]')?.click()`);

/* 5. optional paid image generation */
if (PAID) {
  await s.eval(`(() => {
    const st=window.__canvas.store; const n=st.nodes.find(x=>x.type==='image');
    st.transaction(s2=>{ const t=s2.nodes.find(x=>x.id===n.id); t.data={...t.data, prompt:'a red apple on a wooden table, simple'}; },{history:false,reason:'prompt'});
    window.__canvas.canvas.runNode(n.id);
  })()`);
  await pause(25000);
  const img = await s.eval(`(() => { const n=window.__canvas.store.nodes.find(x=>x.type==='image'); return { status:n.data.status, remote:(n.data.media||'').startsWith('http'), model:n.data.history?.at(-1)?.model }; })()`);
  console.log('image api run:', JSON.stringify(img));
}

console.log('errors:', JSON.stringify(errs.slice(0, 6), null, 2));
s.close();
process.exit(0);
