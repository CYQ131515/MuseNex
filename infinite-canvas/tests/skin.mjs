import { newPage } from './cdp.mjs';
const s = await newPage('about:blank');
await s.send('Page.enable'); await s.send('Runtime.enable');
await s.send('Network.enable'); await s.send('Network.setCacheDisabled', { cacheDisabled: true });
const errs = [];
s.on('Runtime.exceptionThrown', p => errs.push(p.exceptionDetails?.exception?.description || p.exceptionDetails?.text));
s.on('Runtime.consoleAPICalled', p => { if (p.type === 'error') errs.push((p.args||[]).map(a=>a.value??a.description).join(' ')); });
await s.goto((process.env.APP_URL || 'http://127.0.0.1:8099/') + '?fresh=1&api=0', 2600);
const rect = async (sel) => s.eval(`(() => { const el=document.querySelector(${JSON.stringify(sel)}); if(!el) return null; const r=el.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}; })()`);
const click = async (sel) => { const r = await rect(sel); if(!r) throw new Error('missing '+sel); const x=r.x+r.w/2, y=r.y+r.h/2; await s.mouse('mousePressed',x,y,{button:'left',buttons:1,clickCount:1}); await s.mouse('mouseReleased',x,y,{button:'left',buttons:0}); await new Promise(r=>setTimeout(r,220)); };
const pause = ms => new Promise(r=>setTimeout(r,ms));

console.log('chrome:', JSON.stringify(await s.eval(`({
  rail: !!document.querySelector('.canvas-toolbar'),
  addBtnColor: getComputedStyle(document.querySelector('#addNodeBtn')).backgroundColor,
  railBtns: document.querySelectorAll('.canvas-toolbar__btn').length,
  pill: !!document.querySelector('#zoomSlider'),
  minimapPos: (() => { const r = document.querySelector('#minimap').getBoundingClientRect(); return {left: Math.round(r.left), bottom: Math.round(innerHeight - r.bottom), w: Math.round(r.width), h: Math.round(r.height)}; })(),
  gridCanvas: !!document.querySelector('#gridCanvas'),
})`)));

// selection border check
await s.eval(`(() => { const st = window.__canvas.store; const n = st.nodes.find(x=>x.type==='image'); st.state.selection = new Set([n.id]); st.emit('selection'); st.emit('change',{reason:'t'}); })()`);
await pause(250);
const selBorder = await s.eval(`(() => { const c = document.querySelector('.node[data-type="image"] .node__card'); const cs = getComputedStyle(c); return {color: cs.borderTopColor, width: cs.borderTopWidth}; })()`);
console.log('selected card border:', JSON.stringify(selBorder));
await s.shot('/tmp/rh/skin-selected.png');

// hover plus
const imgRect = await rect('.node[data-type="image"]');
await s.mouse('mouseMoved', imgRect.x + imgRect.w - 8, imgRect.y + imgRect.h/2, { buttons: 0 });
await pause(300);
const plus = await s.eval(`(() => { const el = document.querySelector('.node[data-type="image"] .node__plus'); const cs = el && getComputedStyle(el); return el ? {opacity: cs.opacity, visibility: cs.visibility, w: el.offsetWidth, h: el.offsetHeight} : null; })()`);
console.log('plus button:', JSON.stringify(plus));

// click plus opens the add panel with a pending connection
const plusRect = await rect('.node[data-type="image"] .node__plus');
await s.mouse('mousePressed', plusRect.x + plusRect.w/2, plusRect.y + plusRect.h/2, {button:'left',buttons:1,clickCount:1});
await s.mouse('mouseReleased', plusRect.x + plusRect.w/2, plusRect.y + plusRect.h/2, {button:'left',buttons:0});
await pause(300);
const panel = await s.eval(`(() => { const p = window.__canvas.ui; return {open: !document.querySelector('#addPanel').hidden, pending: !!p.pendingAdd, connectFrom: p.pendingAdd?.connectFrom || null}; })()`);
console.log('plus → panel:', JSON.stringify(panel));
await s.shot('/tmp/rh/skin-addpanel.png');
await s.eval(`window.__canvas.ui.closeAddPanel()`);

// connect via right-edge handle
const before = await s.eval('window.__canvas.store.edges.length');
const handleRect = await s.eval(`(() => { const el = document.querySelector('.node[data-type="preview-output"] .node__handle--in') || document.querySelector('.node[data-type="rh-ai"] .node__handle--in'); const r = el.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}; })()`);
const genRect = await rect('.node[data-type="video-gen"]');
await s.eval(`document.querySelector('.node[data-type="video-gen"]').dispatchEvent(new PointerEvent('pointerenter',{bubbles:true}))`);
await pause(120);
const outRect = await rect('.node[data-type="video-gen"] .node__handle--out');
await s.mouse('mousePressed', outRect.x + outRect.w/2, outRect.y + outRect.h/2, {button:'left',buttons:1,clickCount:1});
for (const t of [0.3,0.6,1]) { await s.mouse('mouseMoved', outRect.x + (handleRect.x-outRect.x)*t, outRect.y + (handleRect.y-outRect.y)*t, {button:'left',buttons:1}); await pause(30); }
const snapped = await s.eval(`document.querySelector('#edgePending').classList.contains('is-snapped')`);
await s.mouse('mouseReleased', handleRect.x, handleRect.y, {button:'left',buttons:0});
await pause(250);
console.log('connect:', JSON.stringify({ snapped, before, after: await s.eval('window.__canvas.store.edges.length') }));

// zoom slider
await s.eval(`(() => { const sl = document.querySelector('#zoomSlider'); sl.value = 150; sl.dispatchEvent(new Event('input')); })()`);
await pause(300);
console.log('slider zoom:', JSON.stringify({ zoom: await s.eval('window.__canvas.store.state.viewport.zoom'), label: await s.eval('document.querySelector("#zoomValue").textContent') }));

// themes
for (const theme of ['light','eyeCare','dark']) {
  await s.eval(`window.__canvas.store.setSetting('theme','${theme}')`);
  await pause(350);
  await s.shot(`/tmp/rh/skin-${theme}.png`);
}
console.log('errors:', JSON.stringify(errs.slice(0,8), null, 2));
s.close(); process.exit(0);
