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

/* ── 1. node manager ─────────────────────────────────────────────── */
await click('#searchBtn2');
let nm = await s.eval(`(() => { const el = document.querySelector('#nodeManager'); return {open: el && !el.hidden, items: el?.querySelectorAll('.node-manager__item').length, count: el?.querySelector('#nmCount')?.textContent}; })()`);
console.log('node manager:', JSON.stringify(nm));
await s.eval(`(() => { const i = document.querySelector('#nmSearch'); i.value='分镜'; i.dispatchEvent(new Event('input')); })()`);
await pause(200);
console.log('nm search   :', JSON.stringify(await s.eval(`document.querySelectorAll('.node-manager__item').length`)));
await click('#nmList .node-manager__item');   // focus + select
console.log('nm focus sel:', JSON.stringify(await s.eval(`[...window.__canvas.store.selection]`)));
await click('[data-nm-view="grid"]');
console.log('nm grid     :', JSON.stringify(await s.eval(`document.querySelector('#nmList').classList.contains('is-grid')`)));
await s.shot('app-level-new-nodemanager.png');
await s.eval(`window.__canvas.ui.toggleNodeManager(false)`);

/* ── 2. collapse / chip ──────────────────────────────────────────── */
await s.eval(`(() => { const st=window.__canvas.store; const n=st.nodes.find(x=>x.type==='image'); window.__canvas.store.setSelection([n.id]); window.__canvas.store.transaction(s=>{ const t=s.nodes.find(x=>x.id===n.id); t.data={...t.data, collapsed:true}; },{history:true,reason:'collapse'}); })()`);
await pause(350);
const chip = await s.eval(`(() => { const el=document.querySelector('.node[data-type="image"]'); return {collapsed: el.classList.contains('is-collapsed'), chip: !!el.querySelector('.node__chip'), label: el.querySelector('.node__chip-label')?.textContent, badge: el.querySelector('.node__chip-badge')?.textContent}; })()`);
console.log('chip        :', JSON.stringify(chip));
await s.shot('app-level-new-chip.png');
// click chip to expand
const chipRect = await rect('.node[data-type="image"] .node__chip');
await s.mouse('mousePressed', chipRect.x + chipRect.w/2, chipRect.y + chipRect.h/2, {button:'left',buttons:1,clickCount:1});
await s.mouse('mouseReleased', chipRect.x + chipRect.w/2, chipRect.y + chipRect.h/2, {button:'left',buttons:0});
await pause(350);
console.log('chip expand :', JSON.stringify(await s.eval(`(() => { const n=window.__canvas.store.nodes.find(x=>x.type==='image'); return {collapsed: !!n.data.collapsed}; })()`)));

/* ── 3. connection blur + glow ──────────────────────────────────── */
await s.eval(`window.__canvas.canvas.vp.fitView({padding:120,maxZoom:0.85})`);
await pause(500);
const out = await rect('.node[data-type="video-gen"] .node__handle--out');
const target = await rect('.node[data-type="rh-ai"]');
await s.mouse('mousePressed', out.x + out.w/2, out.y + out.h/2, {button:'left',buttons:1,clickCount:1});
for (const t of [0.3,0.6,0.9]) {
  await s.mouse('mouseMoved', out.x + (target.x + target.w/2 - out.x)*t, out.y + (target.y + target.h/2 - out.y)*t, {button:'left',buttons:1});
  await pause(40);
}
const conn = await s.eval(`({ blurred: document.querySelectorAll('.node.is-connection-blurred').length, glow: document.querySelectorAll('.node.is-glow').length, snapped: document.querySelector('#edgePending').classList.contains('is-snapped') })`);
console.log('connect fx  :', JSON.stringify(conn));
await s.shot('app-level-new-connect-glow.png');
await s.mouse('mouseReleased', target.x + target.w/2, target.y + target.h/2, {button:'left',buttons:0});
await pause(250);

/* ── 4. batch connect from a multi selection ────────────────────── */
await s.eval(`(() => { const st=window.__canvas.store; const ids=st.nodes.filter(n=>['llm','script'].includes(n.type)).map(n=>n.id); st.state.selection=new Set(ids); st.emit('selection'); })()`);
await pause(250);
const out2 = await rect('.node[data-type="script"] .node__handle--out');
const target2 = await rect('.node[data-type="preview-output"]');
const edgesBefore = await s.eval('window.__canvas.store.edges.length');
await s.mouse('mousePressed', out2.x + out2.w/2, out2.y + out2.h/2, {button:'left',buttons:1,clickCount:1});
for (const t of [0.3,0.6,0.9]) {
  await s.mouse('mouseMoved', out2.x + (target2.x + target2.w/2 - out2.x)*t, out2.y + (target2.y + target2.h/2 - out2.y)*t, {button:'left',buttons:1});
  await pause(40);
}
const batchInfo = await s.eval(`({ blurred: document.querySelectorAll('.node.is-connection-blurred').length, glow: document.querySelectorAll('.node.is-glow').length })`);
await s.mouse('mouseReleased', target2.x + target2.w/2, target2.y + target2.h/2, {button:'left',buttons:0});
await pause(300);
console.log('batch connec:', JSON.stringify({ ...batchInfo, edgesBefore, edgesAfter: await s.eval('window.__canvas.store.edges.length') }));

/* ── 5. group toolbar ───────────────────────────────────────────── */
await s.eval(`(() => { const st=window.__canvas.store; const ids=st.nodes.filter(n=>['image','video-gen'].includes(n.type)).map(n=>n.id); st.state.selection=new Set(ids); st.emit('selection'); window.__canvas.canvas.groupSelection(); })()`);
await pause(400);
const gt = await s.eval(`(() => { const el=document.querySelector('.group-toolbar'); return {visible: el && !el.hidden, swatches: el?.querySelectorAll('[data-color]').length, layouts: el?.querySelectorAll('[data-layout]').length}; })()`);
console.log('group bar   :', JSON.stringify(gt));
if (gt.visible) {
  await click('.group-toolbar [data-color="blue"]');
  await click('.group-toolbar [data-layout="horizontal"]');
  const g = await s.eval(`(() => { const st=window.__canvas.store; const g=st.nodes.find(n=>n.type==='group'); const kids=st.nodes.filter(n=>['image','video-gen'].includes(n.type)).map(n=>[n.type,n.x,n.y]); return {color:g.data.groupColor, w:g.w, h:g.h, kids}; })()`);
  console.log('group layout:', JSON.stringify(g));
  await s.shot('app-level-new-group.png');
}

/* ── 6. reading view ────────────────────────────────────────────── */
await s.eval(`window.__canvas.store.setSetting('readMode', true)`);
await pause(350);
const ro = await s.eval(`(() => ({ body: document.body.classList.contains('is-readonly'), bar: !document.querySelector('.readonly-bar').hidden, addBtn: getComputedStyle(document.querySelector('#addNodeBtn')).display, manager: document.querySelector('#nodeManager').hidden }))()`);
console.log('read mode   :', JSON.stringify(ro));
await s.shot('app-level-new-readonly.png');
await s.eval(`window.__canvas.store.setSetting('readMode', false)`);

/* ── 7. shortcuts dialog + comfy mode ───────────────────────────── */
await s.eval(`window.__canvas.ui.openShortcuts()`);
await pause(250);
console.log('shortcuts   :', JSON.stringify(await s.eval(`({open: !document.querySelector('.shortcuts-dialog').closest('.dialog-backdrop').hidden, rows: document.querySelectorAll('.shortcut-row').length})`)));
await s.shot('app-level-new-shortcuts.png');
await s.eval(`window.__canvas.ui.closeShortcuts()`);
await s.eval(`window.__canvas.store.setSetting('interactionMode','comfyui')`);
await pause(200);
const z0 = await s.eval('window.__canvas.store.state.viewport.zoom');
await s.mouse('mouseWheel', 700, 400, { deltaX: 0, deltaY: -120, pointerType: 'mouse' });
await pause(200);
const z1 = await s.eval('window.__canvas.store.state.viewport.zoom');
console.log('comfy wheel :', JSON.stringify({ z0, z1, zoomed: z1 > z0 }));
console.log('errors:', JSON.stringify(errs.slice(0, 8), null, 2));
s.close(); process.exit(0);
