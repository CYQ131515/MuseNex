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
const click = async (sel) => { const r = await rect(sel); if(!r) throw new Error('missing '+sel); const x=r.x+r.w/2,y=r.y+r.h/2; await s.mouse('mousePressed',x,y,{button:'left',buttons:1,clickCount:1}); await s.mouse('mouseReleased',x,y,{button:'left',buttons:0}); await pause(250); };

/* ── 1. media toolbar + adjust + filters ─────────────────────────── */
const img = await rect('.node[data-type="image"]');
await s.mouse('mouseMoved', img.x + img.w/2, img.y + 40, { buttons: 0 });
await pause(350);
const mt = await s.eval(`(() => { const el=document.querySelector('.media-toolbar'); return {visible: el && !el.hidden, buttons: el?.querySelectorAll('[data-mt]').length}; })()`);
console.log('media toolbar:', JSON.stringify(mt));
await click('.media-toolbar [data-mt="rotate"]');
await click('.media-toolbar [data-mt="flipx"]');
const filters = await s.eval(`(() => { const n=window.__canvas.store.nodes.find(x=>x.type==='image'); return n.data.filters; })()`);
console.log('filters      :', JSON.stringify(filters));
await click('.media-toolbar [data-mt="adjust"]');
await pause(200);
const adj = await s.eval(`(() => ({ visible: !document.querySelector('.adjust-popover').hidden, sliders: document.querySelectorAll('.adjust-row input').length }))()`);
await s.eval(`(() => { const i=document.querySelector('[data-adj-key="brightness"]'); i.value=130; i.dispatchEvent(new Event('input',{bubbles:true})); })()`);
await pause(250);
console.log('adjust       :', JSON.stringify({ ...adj, brightness: await s.eval(`window.__canvas.store.nodes.find(x=>x.type==='image').data.filters.brightness`) }));
await s.shot('/tmp/rh/feat-adjust.png');

/* ── 2. media info dialog ───────────────────────────────────────── */
await s.eval(`document.querySelector('.adjust-popover').hidden = true`);
await s.eval(`(() => { const st=window.__canvas.store; const n=st.nodes.find(x=>x.type==='image'); st.state.selection=new Set([n.id]); st.emit('selection'); window.__canvas.ui.showMediaInfo(n); })()`);
await pause(500);
const info = await s.eval(`(() => ({ open: !!document.querySelector('.generic-dialog'), rows: [...document.querySelectorAll('.info-row span')].map(e=>e.textContent) }))()`);
console.log('media info   :', JSON.stringify(info));
await s.eval(`document.querySelector('.dialog-backdrop')?.remove()`);

/* ── 3. generation history: run a node → open history ───────────── */
await s.eval(`(() => { const st=window.__canvas.store; const n=st.nodes.find(x=>x.type==='video-gen'); st.state.selection=new Set([n.id]); st.emit('selection'); window.__canvas.canvas.runNode(n.id); })()`);
await pause(3200);
const hist = await s.eval(`(() => { const n=window.__canvas.store.nodes.find(x=>x.type==='video-gen'); return {versions: n.data.history?.length || 0, mainIndex: n.data.mainIndex}; })()`);
await s.eval(`(() => { const n=window.__canvas.store.nodes.find(x=>x.type==='video-gen'); window.__canvas.ui.openHistoryOverlay(n); })()`);
await pause(350);
const overlay = await s.eval(`(() => ({ open: !!document.querySelector('.history-overlay'), cards: document.querySelectorAll('.history-card').length, title: document.querySelector('.history-overlay__head h3')?.textContent }))()`);
console.log('history      :', JSON.stringify({ ...hist, ...overlay }));
await s.shot('/tmp/rh/feat-history.png');
await s.eval(`window.__canvas.ui.closeHistoryOverlay()`);

/* ── 4. annotate layer ──────────────────────────────────────────── */
await s.eval(`(() => { document.querySelectorAll('.dialog-backdrop,.history-overlay,.organize-prompt').forEach(e=>e.remove()); window.__canvas.ui.genericDialog=null; window.__canvas.ui.historyOverlay=null; })()`);
console.log('pre-annotate hit:', JSON.stringify(await s.eval(`(() => { const b=document.querySelector('#annotateBtn').getBoundingClientRect(); const hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2); return {hit: hit?.id || hit?.className, overlays: [...document.querySelectorAll('.dialog-backdrop,.history-overlay,.generic-dialog')].map(e=>({c: e.className, hidden: e.hidden, text: (e.innerText||'').slice(0,20)}))}; })()`)));
await click('#annotateBtn');
console.log('post toggle mode:', await s.eval('window.__canvas.store.state.settings.annotateMode'));
const bar = await s.eval(`(() => ({ visible: !document.querySelector('.annotate-bar').hidden, tools: document.querySelectorAll('.annotate-bar [data-at]').length, colors: document.querySelectorAll('.annotate-bar [data-acolor]').length }))()`);
const host = await rect('#canvasHost');
console.log('annotate dbg:', JSON.stringify(await s.eval(`({mode: window.__canvas.store.state.settings.annotateMode, tool: window.__canvas.store.state.settings.annotateTool, barHidden: document.querySelector('.annotate-bar').hidden})`)));
await s.mouse('mousePressed', host.x + 300, host.y + 220, {button:'left',buttons:1,clickCount:1});
await s.mouse('mouseMoved', host.x + 460, host.y + 300, {button:'left',buttons:1});
await pause(60);
await s.mouse('mouseReleased', host.x + 460, host.y + 300, {button:'left',buttons:0});
await pause(300);
const arrows = await s.eval(`window.__canvas.store.state.annotations.length`);
await click('.annotate-bar [data-at="text"]');
console.log('after text tool:', JSON.stringify(await s.eval(`({tool: window.__canvas.store.state.settings.annotateTool, mode: window.__canvas.store.state.settings.annotateMode})`)));
await s.mouse('mousePressed', host.x + 320, host.y + 380, {button:'left',buttons:1,clickCount:1});
await pause(120);
console.log('after mdown:', JSON.stringify(await s.eval(`({inputs: document.querySelectorAll('.annotation-input').length, target: document.elementFromPoint(${host.x+320}, ${host.y+380})?.className?.baseVal ?? document.elementFromPoint(${host.x+320}, ${host.y+380})?.className})`)));
await s.mouse('mouseReleased', host.x + 320, host.y + 380, {button:'left',buttons:0});
await pause(250);
const hasInput = await s.eval(`!!document.querySelector('.annotation-input')`);
await s.eval(`(() => { const i=document.querySelector('.annotation-input'); i.value='重点镜头'; i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); })()`);
await pause(300);
const anns = await s.eval(`window.__canvas.store.state.annotations.map(a=>a.type)`);
console.log('annotate     :', JSON.stringify({ ...bar, arrows, hasInput, annotations: anns }));
await s.shot('/tmp/rh/feat-annotate.png');
await click('.annotate-bar [data-at="exit"]');

/* ── 5. organize canvas (中心对齐 + 还原) ────────────────────────── */
const before = await s.eval(`window.__canvas.store.nodes.map(n=>[n.id,n.x,n.y])`);
await s.eval(`window.__canvas.ui.runOrganize('center')`);
await pause(500);
const after = await s.eval(`window.__canvas.store.nodes.map(n=>[n.id,n.x,n.y])`);
const prompt = await s.eval(`(() => { const el=document.querySelector('.organize-prompt'); return {visible: !!el, buttons: el?.querySelectorAll('button').length}; })()`);
await click('.organize-prompt [data-or="restore"]');
await pause(400);
const restored = await s.eval(`window.__canvas.store.nodes.map(n=>[n.id,n.x,n.y])`);
console.log('organize     :', JSON.stringify({ changed: JSON.stringify(before) !== JSON.stringify(after), prompt, restored: JSON.stringify(restored) === JSON.stringify(before) }));

/* ── 6. rename via context menu ─────────────────────────────────── */
const target = await rect('.node[data-type="audio"]');
await s.mouse('mousePressed', target.x + 40, target.y + 20, {button:'right',buttons:2,clickCount:1});
await s.mouse('mouseReleased', target.x + 40, target.y + 20, {button:'right',buttons:0});
await pause(250);
const hasRename = await s.eval(`!!document.querySelector('#contextMenu [data-menu="rename"]')`);
await click('#contextMenu [data-menu="rename"]');
await pause(250);
const inputShown = await s.eval(`!!document.querySelector('.node-label-input')`);
await s.eval(`(() => { const i=document.querySelector('.node-label-input'); i.value='雨声 · 主声道'; i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); })()`);
await pause(300);
const renamed = await s.eval(`(() => { const n=window.__canvas.store.nodes.find(x=>x.type==='audio'); return n.data.label; })()`);
console.log('rename       :', JSON.stringify({ hasRename, inputShown, renamed }));

/* ── 7. group execute ───────────────────────────────────────────── */
await s.eval(`(() => { const st=window.__canvas.store; const ids=st.nodes.filter(n=>['video-gen','image'].includes(n.type)).map(n=>n.id); st.state.selection=new Set(ids); st.emit('selection'); window.__canvas.canvas.groupSelection(); })()`);
await pause(400);
const execBtn = await s.eval(`!!document.querySelector('.group-toolbar [data-group-act="execute"]')`);
if (execBtn) {
  await click('.group-toolbar [data-group-act="execute"]');
  await pause(900);
  const running = await s.eval(`window.__canvas.store.nodes.filter(n=>n.data?.status==='running').length`);
  console.log('group execute:', JSON.stringify({ execBtn, running }));
} else {
  console.log('group execute:', JSON.stringify({ execBtn }));
}
console.log('errors:', JSON.stringify(errs.slice(0, 8), null, 2));
s.close(); process.exit(0);
