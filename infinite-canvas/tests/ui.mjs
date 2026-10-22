import { newPage } from './cdp.mjs';

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

await s.goto((process.env.APP_URL || 'http://127.0.0.1:8099/') + '?fresh=1&api=0', 2600);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const rect = async (sel) => s.eval(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if(!el) return null; const r = el.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}; })()`);
const click = async (sel) => {
  const r = await rect(sel);
  if (!r) throw new Error('missing ' + sel);
  const x = r.x + r.w / 2, y = r.y + r.h / 2;
  await s.mouse('mousePressed', x, y, { button: 'left', buttons: 1, clickCount: 1 });
  await s.mouse('mouseReleased', x, y, { button: 'left', buttons: 0 });
  await new Promise((r) => setTimeout(r, 220));
};

/* add panel */
await click('#addNodeBtn');
const panel = await s.eval(`({ visible: !document.querySelector('#addPanel').hidden, items: document.querySelectorAll('#addPanelBody .add-item').length })`);
console.log('add panel:', JSON.stringify(panel));
await s.shot('/tmp/rh/ui-addpanel.png');
const before = await s.eval('window.__canvas.store.nodes.length');
await click('#addPanelBody .add-item');
const afterAdd = await s.eval('window.__canvas.store.nodes.length');
console.log('add node  :', before, '→', afterAdd);

/* node search */
await s.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'f', code: 'KeyF', modifiers: 4 });
await s.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'f', code: 'KeyF', modifiers: 4 });
await new Promise((r) => setTimeout(r, 200));
console.log('search dlg:', JSON.stringify(await s.eval(`({open: !document.querySelector('#nodeSearch').hidden, results: document.querySelectorAll('#nodeSearchResults .add-item').length})`)));
await s.eval(`(() => { const i = document.querySelector('#nodeSearchInput'); i.value='视频'; i.dispatchEvent(new Event('input')); })()`);
await new Promise((r) => setTimeout(r, 150));
const filtered = await s.eval(`document.querySelectorAll('#nodeSearchResults .add-item').length`);
await s.shot('/tmp/rh/ui-search.png');
await s.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Enter', code: 'Enter' });
await s.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter' });
await new Promise((r) => setTimeout(r, 300));
console.log('search    :', JSON.stringify({ filtered, nodes: await s.eval('window.__canvas.store.nodes.length'), closed: await s.eval(`document.querySelector('#nodeSearch').hidden`) }));

/* align: select two nodes then click align menu */
await s.eval(`(() => {
  const st = window.__canvas.store;
  const ids = st.nodes.filter(n => n.type === 'rh-ai' || n.type === 'preview-output').map(n => n.id);
  st.state.selection = new Set(ids);
  st.emit('selection');
  st.emit('change', { reason: 'test' });
})()`);
await new Promise((r) => setTimeout(r, 120));
const alignSelDebug = await s.eval(`(() => { const st = window.__canvas.store; return {sel: [...st.selection], nodes: st.nodes.filter(n=>['rh-ai','preview-output'].includes(n.type)).map(n=>n.id)}; })()`);
console.log('align debug:', JSON.stringify(alignSelDebug));
await click('#alignBtn');
const alignOpen = await s.eval(`!document.querySelector('#alignMenu').hidden`);
await s.shot('/tmp/rh/ui-align.png');
await click('#alignMenu [data-align="top"]');
const aligned = await s.eval(`(() => {
  const st = window.__canvas.store;
  const sel = st.nodes.filter(n => st.selection.has(n.id));
  return sel.map(n => n.y);
})()`);
console.log('align     :', JSON.stringify({ alignOpen, ys: aligned }));

/* group */
await s.eval(`(() => {
  const st = window.__canvas.store;
  const ids = st.nodes.filter(n => n.type === 'rh-ai' || n.type === 'preview-output').map(n => n.id);
  st.state.selection = new Set(ids); st.emit('selection'); st.emit('change', {reason:'test'});
})()`);
await new Promise((r) => setTimeout(r, 120));
await click('#groupBtn');
console.log('group     :', JSON.stringify({ groups: await s.eval(`window.__canvas.store.nodes.filter(n=>n.type==='group').length`) }));

/* selection toolbar */
await s.eval(`(() => { const st = window.__canvas.store; const n = st.nodes.find(x=>x.type==='rh-ai'); st.state.selection = new Set([n.id]); st.emit('selection'); st.emit('change',{reason:'test'}); })()`);
await new Promise((r) => setTimeout(r, 250));
const tb = await s.eval(`(() => { const el = document.querySelector('.node-toolbar'); return el ? {hidden: el.hidden, buttons: el.querySelectorAll('button').length} : null; })()`);
console.log('node tb   :', JSON.stringify(tb));

/* context menu */
const pane = await rect('#canvasHost');
await s.mouse('mousePressed', pane.x + 700, pane.y + 500, { button: 'right', buttons: 2, clickCount: 1 });
await s.mouse('mouseReleased', pane.x + 700, pane.y + 500, { button: 'right', buttons: 0 });
await new Promise((r) => setTimeout(r, 200));
const menu = await s.eval(`(() => { const el = document.querySelector('#contextMenu'); return {hidden: el.hidden, items: [...el.querySelectorAll('.menu__item')].map(b=>b.textContent.trim().split('\\n')[0])}; })()`);
console.log('ctx menu  :', JSON.stringify(menu));
await s.shot('/tmp/rh/ui-context.png');

/* tidy + theme + zoom buttons */
await s.eval(`document.querySelector('#contextMenu').hidden = true`);
await click('#tidyBtn');
const tidy = await s.eval(`(() => { const st = window.__canvas.store; const n = st.nodes.filter(x=>x.type!=='group'); return n.slice(0,4).map(x=>[x.x,x.y]); })()`);
await s.eval(`(() => { const sl = document.querySelector('#zoomSlider'); sl.value = 120; sl.dispatchEvent(new Event('input')); })()`);
await pause(300);
const zoomIn = await s.eval('window.__canvas.store.state.viewport.zoom');
await click('#themeBtn');
await click('#themeMenu [data-theme="light"]');
const theme = await s.eval('document.documentElement.dataset.theme');
await s.eval(`document.querySelector('#themeMenu').hidden = true`);
console.log('misc      :', JSON.stringify({ tidy, zoomIn, theme }));

/* png export path (no download in headless, just ensure no throw) */
const png = await s.eval(`(() => { try { window.__canvas.ui.exportPNG(); return 'ok'; } catch (e) { return 'err: ' + e.message; } })()`);
console.log('png export:', png);
await s.shot('/tmp/rh/ui-final.png');
console.log('errors:', JSON.stringify(errs.slice(0, 6), null, 2));
s.close();
process.exit(0);
