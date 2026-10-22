import { newPage } from './cdp.mjs';

const URL = process.env.APP_URL || 'http://127.0.0.1:8099/';
const s = await newPage('about:blank');
await s.send('Page.enable');
await s.send('Runtime.enable');
await s.send('Network.enable');
await s.send('Network.setCacheDisabled', { cacheDisabled: true });
const errors = [];
s.on('Runtime.exceptionThrown', (p) => errors.push(p.exceptionDetails?.exception?.description || p.exceptionDetails?.text));
s.on('Runtime.consoleAPICalled', (p) => {
  if (p.type === 'error') errors.push((p.args || []).map((a) => a.value ?? a.description).join(' '));
});

await s.goto(URL + '?fresh=1&api=0', 2400);
const boot = await s.eval(`({ nodes: window.__canvas.store.nodes.length, edges: window.__canvas.store.edges.length, vp: window.__canvas.store.state.viewport })`);
console.log('boot state:', JSON.stringify(boot));

const rectOf = async (sel) => s.eval(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if(!el) return null; const r = el.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}; })()`);
const vpState = async () => s.eval(`(() => { const st = window.__canvas.store.state.viewport; return {...st}; })()`);

console.log('initial viewport:', JSON.stringify(await vpState()));

/* 1. wheel pan */
const before = await vpState();
await s.mouse('mouseWheel', 700, 400, { deltaX: 0, deltaY: 120, pointerType: 'mouse' });
await new Promise((r) => setTimeout(r, 120));
const afterPan = await vpState();
console.log('wheel pan  :', JSON.stringify({ before, after: afterPan, moved: Math.abs(afterPan.x - before.x) + Math.abs(afterPan.y - before.y) }));

/* 2. ctrl+wheel zoom anchored at pointer */
const zoomBefore = await vpState();
await s.mouse('mouseWheel', 700, 400, { deltaX: 0, deltaY: -180, modifiers: 2 });
await new Promise((r) => setTimeout(r, 120));
const zoomAfter = await vpState();
console.log('ctrl+wheel zoom:', JSON.stringify({ z0: zoomBefore.zoom, z1: zoomAfter.zoom }));

/* re-fit so all interaction targets are on screen */
await s.eval('window.__canvas.canvas.vp.fitView({ padding: 120, maxZoom: 0.9 })');
await new Promise((r) => setTimeout(r, 500));

/* 3. node drag */
const nodeSel = '.node[data-type="image"]';
const nr = await rectOf(nodeSel);
const id = await s.eval(`document.querySelector('${nodeSel}').dataset.id`);
const posBefore = await s.eval(`(() => { const n = window.__canvas.store.getNode('${id}'); return {x:n.x,y:n.y}; })()`);
console.log('drag rect:', JSON.stringify(nr), 'id', id);
await s.mouse('mousePressed', nr.x + nr.w / 2, nr.y + 40, { button: 'left', buttons: 1, clickCount: 1 });
for (let i = 1; i <= 6; i++) {
  await s.mouse('mouseMoved', nr.x + nr.w / 2 + i * 12, nr.y + 40 + i * 6, { button: 'left', buttons: 1 });
  await new Promise((r) => setTimeout(r, 16));
}
await s.mouse('mouseReleased', nr.x + nr.w / 2 + 72, nr.y + 76, { button: 'left', buttons: 0 });
await new Promise((r) => setTimeout(r, 260));
const posAfter = await s.eval(`(() => { const n = window.__canvas.store.getNode('${id}'); return {x:n.x,y:n.y}; })()`);
console.log('node drag  :', JSON.stringify({ id, posBefore, posAfter }));

/* 4. box select over two nodes */
await s.eval('window.__canvas.canvas.vp.fitView({ padding: 120, maxZoom: 0.9 })');
await new Promise((r) => setTimeout(r, 450));
await s.eval('window.__canvas.store.clearSelection()');
const llmRect = await rectOf('.node[data-type="llm"]');
const scriptRect = await rectOf('.node[data-type="script"]');
const bx1 = Math.max(90, Math.min(llmRect.x, scriptRect.x) - 60);
const by1 = Math.max(64, Math.min(llmRect.y, scriptRect.y) - 60);
const bx2 = Math.max(llmRect.x + llmRect.w, scriptRect.x + scriptRect.w) + 20;
const by2 = Math.max(llmRect.y + llmRect.h, scriptRect.y + scriptRect.h) + 20;
const SHIFT = 8;
await s.mouse('mousePressed', bx1, by1, { button: 'left', buttons: 1, clickCount: 1, modifiers: SHIFT });
await s.mouse('mouseMoved', (bx1 + bx2) / 2, (by1 + by2) / 2, { button: 'left', buttons: 1, modifiers: SHIFT });
await s.mouse('mouseMoved', bx2, by2, { button: 'left', buttons: 1, modifiers: SHIFT });
await s.mouse('mouseReleased', bx2, by2, { button: 'left', buttons: 0, modifiers: SHIFT });
await new Promise((r) => setTimeout(r, 150));
const selCount = await s.eval('window.__canvas.store.selection.size');
console.log('box select :', selCount, 'nodes');

/* 5. connect image -> app (rh-ai) by dragging from output port */
const outPort = await rectOf('.node[data-type="image"] .node__handle--out');
const appRect = await rectOf('.node[data-type="rh-ai"]');
const edgesBefore = await s.eval('window.__canvas.store.edges.length');
await s.mouse('mousePressed', outPort.x + outPort.w / 2, outPort.y + outPort.h / 2, { button: 'left', buttons: 1, clickCount: 1 });
for (const t of [0.25, 0.5, 0.75, 1]) {
  await s.mouse('mouseMoved', outPort.x + (appRect.x + appRect.w / 2 - outPort.x) * t, outPort.y + (appRect.y + appRect.h / 2 - outPort.y) * t, { button: 'left', buttons: 1 });
  await new Promise((r) => setTimeout(r, 30));
}
const snapState = await s.eval(`({ pending: document.querySelector('#edgePending').className.baseVal, target: !!document.querySelector('.port.is-target') })`);
await s.mouse('mouseReleased', appRect.x + appRect.w / 2, appRect.y + appRect.h / 2, { button: 'left', buttons: 0 });
await new Promise((r) => setTimeout(r, 200));
const edgesAfter = await s.eval('window.__canvas.store.edges.length');
console.log('connect    :', JSON.stringify({ snapState, edgesBefore, edgesAfter }));

/* 6. edge scissors hover + delete */
const mid = await s.eval(`(() => { const p = document.querySelector('.edge-group .edge-path'); const len = p.getTotalLength(); const pt = p.getPointAtLength(len/2); const svg = p.ownerSVGElement; const m = p.getScreenCTM(); const sp = new DOMPoint(pt.x, pt.y).matrixTransform(m); return {x: sp.x, y: sp.y}; })()`);
await s.mouse('mouseMoved', mid.x, mid.y, { buttons: 0 });
await new Promise((r) => setTimeout(r, 700));
const scissors = await s.eval(`!!document.querySelector('.edge-scissors')`);
console.log('edge hover :', JSON.stringify({ mid, scissors }));
if (scissors) {
  const scRect = await rectOf('.edge-scissors');
  await s.mouse('mousePressed', scRect.x + 14, scRect.y + 14, { button: 'left', buttons: 1, clickCount: 1 });
  await s.mouse('mouseReleased', scRect.x + 14, scRect.y + 14, { button: 'left', buttons: 0 });
  await new Promise((r) => setTimeout(r, 200));
  console.log('edge delete:', JSON.stringify({ before: edgesAfter, after: await s.eval('window.__canvas.store.edges.length') }));
}

/* 7. keyboard: select all, copy, paste, undo */
await s.eval(`document.querySelector('#canvasHost').focus()`);
await s.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', text: 'a', modifiers: 4 });
await s.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 4 });
await new Promise((r) => setTimeout(r, 100));
const allSel = await s.eval('window.__canvas.store.selection.size');
await s.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'c', code: 'KeyC', modifiers: 4 });
await s.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'c', code: 'KeyC', modifiers: 4 });
await s.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'v', code: 'KeyV', modifiers: 4 });
await s.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'v', code: 'KeyV', modifiers: 4 });
await new Promise((r) => setTimeout(r, 200));
const nodesAfterPaste = await s.eval('window.__canvas.store.nodes.length');
await s.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'z', code: 'KeyZ', modifiers: 4 });
await s.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'z', code: 'KeyZ', modifiers: 4 });
await new Promise((r) => setTimeout(r, 250));
const nodesAfterUndo = await s.eval('window.__canvas.store.nodes.length');
console.log('keyboard   :', JSON.stringify({ allSel, nodesAfterPaste, nodesAfterUndo }));

await s.shot('/tmp/rh/app-02.png');
console.log('errors:', JSON.stringify(errors.slice(0, 8), null, 2));
s.close();
process.exit(0);
