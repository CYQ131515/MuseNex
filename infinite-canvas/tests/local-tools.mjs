import { newPage } from './cdp.mjs';
const s = await newPage('about:blank');
await s.send('Page.enable'); await s.send('Runtime.enable');
await s.send('Network.enable'); await s.send('Network.setCacheDisabled', { cacheDisabled: true });
const errs = [];
s.on('Runtime.exceptionThrown', p => errs.push(p.exceptionDetails?.exception?.description || p.exceptionDetails?.text));
s.on('Runtime.consoleAPICalled', p => { if (p.type === 'error') errs.push((p.args||[]).map(a=>a.value??a.description).join(' ')); });
await s.goto('http://127.0.0.1:8099/?fresh=1&api=0', 2600);
const pause = ms => new Promise(r=>setTimeout(r,ms));
const rect = async (sel) => s.eval(`(() => { const el=document.querySelector(${JSON.stringify(sel)}); if(!el) return null; const r=el.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}; })()`);
const click = async (sel) => { const r = await rect(sel); if(!r) throw new Error('missing '+sel); const x=r.x+r.w/2,y=r.y+r.h/2; await s.mouse('mousePressed',x,y,{button:'left',buttons:1,clickCount:1}); await s.mouse('mouseReleased',x,y,{button:'left',buttons:0}); await pause(240); };

/* ── 1. param bar: open via double click ─────────────────────────── */
const imgLabel = await rect('.node[data-type="image"] .node__label-row');
await s.mouse('mousePressed', imgLabel.x + 30, imgLabel.y + imgLabel.h/2, {button:'left',buttons:1,clickCount:2});
await s.mouse('mouseReleased', imgLabel.x + 30, imgLabel.y + imgLabel.h/2, {button:'left',buttons:0,clickCount:2});
await pause(400);
let bar = await s.eval(`(() => { const el=document.querySelector('.param-bar'); return {open: el && !el.hidden, title: el?.querySelector('#pbTitle')?.textContent, fields: el?.querySelectorAll('[data-param]').length, hasPrompt: !!el?.querySelector('#pbPrompt')}; })()`);
console.log('param bar    :', JSON.stringify(bar));
// change ratio + count + seed
await s.eval(`(() => {
  const sel = document.querySelector('[data-param="ratio"]'); sel.value='9:16'; sel.dispatchEvent(new Event('change',{bubbles:true}));
  const c = document.querySelector('[data-param="count"]'); c.value='2'; c.dispatchEvent(new Event('change',{bubbles:true}));
  const seed = document.querySelector('[data-param="seed"]'); seed.value='12345'; seed.dispatchEvent(new Event('change',{bubbles:true}));
})()`);
await pause(300);
console.log('params saved :', JSON.stringify(await s.eval(`window.__canvas.store.nodes.find(x=>x.type==='image').data.params`)));
// enhance prompt
await click('.param-bar [data-pb="enhance"]');
const enhanced = await s.eval(`document.querySelector('#pbPrompt').value`);
console.log('enhance      :', JSON.stringify(enhanced.slice(0, 40)));
// run from param bar
await s.eval(`(() => { const st=window.__canvas.store; const n=st.nodes.find(x=>x.type==='image'); st.state.selection=new Set([n.id]); st.emit('selection'); })()`);
await pause(200);
await click('.param-bar [data-pb="run"]');
const running = await s.eval(`window.__canvas.store.nodes.find(x=>x.type==='image').data.status`);
await pause(3200);
const afterRun = await s.eval(`(() => { const n=window.__canvas.store.nodes.find(x=>x.type==='image'); return {status:n.data.status, versions:n.data.history?.length||0, seed:n.data.params?.seed, media: (n.data.history?.[0]?.media||'').slice(0,22)}; })()`);
console.log('run          :', JSON.stringify({ running, ...afterRun }));
await s.shot('local-tools-s4-param-bar.png');

/* ── 2. video param bar ──────────────────────────────────────────── */
await s.eval(`(() => { const st=window.__canvas.store; const n=st.nodes.find(x=>x.type==='video-gen'); st.state.selection=new Set([n.id]); st.emit('selection'); window.__canvas.ui.openParamBar(n.id); })()`);
await pause(300);
const videoFields = await s.eval(`[...document.querySelectorAll('.param-bar [data-param]')].map(e=>e.dataset.param)`);
console.log('video fields :', JSON.stringify(videoFields));

/* ── 3. asset library ───────────────────────────────────────────── */
await s.eval(`window.__canvas.ui.closePreview && window.__canvas.ui.closePreview()`);
await s.eval(`document.querySelectorAll('.preview-overlay').forEach(e=>e.remove())`);
await pause(200);
await click('#assetsBtn');
const al = await s.eval(`(() => ({ open: !document.querySelector('#assetLibrary').hidden, cells: document.querySelectorAll('.asset-cell').length, count: document.querySelector('#alCount')?.textContent }))()`);
await s.eval(`document.querySelector('[data-al-tab="image"]').click()`);
await pause(250);
const imgCells = await s.eval(`document.querySelectorAll('.asset-cell').length`);
await s.eval(`(() => { const i=document.querySelector('#alSearch'); i.value='首帧'; i.dispatchEvent(new Event('input')); })()`);
await pause(250);
const filtered = await s.eval(`document.querySelectorAll('.asset-cell').length`);
console.log('asset library:', JSON.stringify({ ...al, imgCells, filtered }));
await s.shot('local-tools-s4-asset-library.png');
// drag asset to canvas (simulate HTML5 dnd through DataTransfer)
const dropped = await s.eval(`(() => {
  const cell = document.querySelector('.asset-cell');
  const host = document.querySelector('#canvasHost');
  const dt = new DataTransfer();
  cell.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:dt}));
  const r = host.getBoundingClientRect();
  const ev = new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt,clientX:r.left+900,clientY:r.top+300});
  host.dispatchEvent(ev);
  return dt.getData('application/x-canvas-asset').slice(0,60);
})()`);
await pause(400);
const nodesAfterDrop = await s.eval(`window.__canvas.store.nodes.length`);
console.log('asset drop   :', JSON.stringify({ dropped, nodesAfterDrop }));
await s.eval(`window.__canvas.ui.toggleAssetLibrary(false)`);

/* ── 4. media preview ───────────────────────────────────────────── */
await s.eval(`window.__canvas.canvas.vp.fitView({padding:120,maxZoom:0.85})`);
await pause(500);
const mediaRect = await rect('.node[data-type="image"] .node__media');
const mx = mediaRect.x + mediaRect.w/2, my = mediaRect.y + mediaRect.h/2;
await s.mouse('mousePressed', mx, my, {button:'left',buttons:1,clickCount:1});
await s.mouse('mouseReleased', mx, my, {button:'left',buttons:0,clickCount:1});
await pause(80);
await s.mouse('mousePressed', mx, my, {button:'left',buttons:1,clickCount:2});
await s.mouse('mouseReleased', mx, my, {button:'left',buttons:0,clickCount:2});
await pause(500);
const pv = await s.eval(`(() => { const el=document.querySelector('.preview-overlay'); return {open: !!el, rows: el?.querySelectorAll('.info-row').length, img: !!el?.querySelector('.preview-overlay__media img')}; })()`);
console.log('preview      :', JSON.stringify(pv));
await s.shot('local-tools-s4-preview.png');
await s.eval(`window.__canvas.ui.closePreview()`);

/* ── 5. persistence: annotations + history survive export/import ── */
await s.eval(`window.__canvas.store.setSetting('annotateMode', true)`);
await pause(200);
await s.mouse('mousePressed', 300, 620, {button:'left',buttons:1,clickCount:1});
await s.mouse('mouseMoved', 420, 660, {button:'left',buttons:1});
await s.mouse('mouseReleased', 420, 660, {button:'left',buttons:0});
await pause(250);
await s.eval(`window.__canvas.store.setSetting('annotateMode', false)`);
const exp = await s.eval(`(() => {
  const json = window.__canvas.store.exportJSON();
  const doc = JSON.parse(json);
  window.__canvas.store.clear();
  window.__canvas.store.importJSON(json);
  return { version: doc.version, annotations: (doc.annotations||[]).length, importAnns: window.__canvas.store.state.annotations.length,
           hasHistory: window.__canvas.store.nodes.some(n=>Array.isArray(n.data.history) && n.data.history.length) };
})()`);
await pause(300);
console.log('persistence  :', JSON.stringify(exp));
console.log('errors:', JSON.stringify(errs.slice(0, 6), null, 2));
s.close(); process.exit(0);
