/**
 * 交互改版验证：
 *   1. 双击节点生成内容才打开预览（单击不打开）
 *   2. Shift + 拖拽框选，且只选「完整框住」的节点
 *   3. 点击画布空白关闭所有弹窗（参数面板等）
 *   4. 标注可二次编辑：箭头选中/移动/拖端点、文字单击移动/双击改字/改字号/单独删除
 */
import { newPage } from './cdp.mjs';

const s = await newPage('about:blank');
await s.send('Page.enable');
await s.send('Runtime.enable');
await s.send('Network.enable');
await s.send('Network.setCacheDisabled', { cacheDisabled: true });
const errs = [];
s.on('Runtime.exceptionThrown', (p) => errs.push(p.exceptionDetails?.exception?.description || p.exceptionDetails?.text));
await s.goto('http://127.0.0.1:8099/?fresh=1&api=0', 3800);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const down = (x, y, mod = 0) => s.mouse('mousePressed', x, y, { button: 'left', buttons: 1, clickCount: 1, modifiers: mod });
const mv = (x, y, mod = 0) => s.mouse('mouseMoved', x, y, { button: 'left', buttons: 1, modifiers: mod });
const up = (x, y, mod = 0) => s.mouse('mouseReleased', x, y, { button: 'left', buttons: 0, modifiers: mod });
const click = async (x, y, mod = 0) => {
  await down(x, y, mod);
  await up(x, y, mod);
  await pause(250);
};
const dbl = async (x, y) => {
  await s.mouse('mousePressed', x, y, { button: 'left', buttons: 1, clickCount: 1 });
  await s.mouse('mouseReleased', x, y, { button: 'left', buttons: 0, clickCount: 1 });
  await pause(60);
  await s.mouse('mousePressed', x, y, { button: 'left', buttons: 1, clickCount: 2 });
  await s.mouse('mouseReleased', x, y, { button: 'left', buttons: 0, clickCount: 2 });
  await pause(400);
};
const rectOf = async (sel) => s.eval(`(() => { const el=document.querySelector(${JSON.stringify(sel)}); if(!el) return null; const b=el.getBoundingClientRect(); return {x:b.x,y:b.y,w:b.width,h:b.height}; })()`);
const anns = () => s.eval(`window.__canvas.store.state.annotations.map(a=>({...a}))`);

/* 1. 空白点击关闭参数面板 */
await s.eval(`(() => { const st=window.__canvas.store; const n=st.nodes.find(x=>x.type==='image'); st.state.selection=new Set([n.id]); st.emit('selection'); window.__canvas.ui.openParamBar(n.id); })()`);
await pause(350);
const panelOpen = await s.eval(`!document.querySelector('.param-bar').hidden`);
await click(900, 110);
await pause(300);
const panelClosed = await s.eval(`document.querySelector('.param-bar').hidden`);
console.log('blank closes :', JSON.stringify({ panelOpen, panelClosed }));

/* 2. 单击不打开预览，双击才打开 */
const img = await rectOf('.node[data-type="image"]');
const mx = img.x + img.w / 2;
const my = img.y + img.h * 0.45;
await click(mx, my);
await pause(350);
const single = await s.eval(`!!document.querySelector('.preview-overlay')`);
await dbl(mx, my);
const double = await s.eval(`!!document.querySelector('.preview-overlay')`);
console.log('preview dbl  :', JSON.stringify({ singleClick: single, doubleClick: double }));
await s.eval(`window.__canvas.ui.closePreview()`);
await pause(200);

/* 3. Shift 框选：完整框住才算 */
const n1 = await rectOf('.node[data-type="llm"]');
const n2 = await rectOf('.node[data-type="image"]');
await s.eval(`window.__canvas.store.clearSelection()`);
await pause(150);
const bx1 = 80, by1 = 60;
const bx2 = Math.max(n1.x + n1.w, n2.x + n2.w) + 30;
const by2 = Math.max(n1.y + n1.h, n2.y + n2.h) + 30;
await down(bx1, by1, 8);
await mv((bx1 + bx2) / 2, (by1 + by2) / 2, 8);
await mv(bx2, by2, 8);
await up(bx2, by2, 8);
await pause(400);
const fullSel = await s.eval(`[...window.__canvas.store.selection]`);
/* 部分覆盖：只框住右侧一半 → 不应选中 */
await s.eval(`window.__canvas.store.clearSelection()`);
await pause(150);
await down(n2.x + n2.w * 0.5, n2.y - 25, 8);
await mv(n2.x + n2.w * 0.8, n2.y + 90, 8);
await mv(n2.x + n2.w * 0.95, n2.y + 160, 8);
await up(n2.x + n2.w * 0.95, n2.y + 160, 8);
await pause(400);
const partialSel = await s.eval(`window.__canvas.store.selection.size`);
console.log('shift box    :', JSON.stringify({ fullSel: fullSel.length, partialSel }));

/* 4. 标注二次编辑 */
await s.eval(`window.__canvas.store.setSetting('annotateMode', true)`);
await pause(300);
await down(200, 430);
await mv(280, 460);
await mv(360, 490);
await up(360, 490);
await pause(350);
let a = (await anns()).find((x) => x.type === 'arrow');
await click(
  await s.eval(`(() => { const a=window.__canvas.store.state.annotations.find(x=>x.type==='arrow'); const p=window.__canvas.canvas.vp.flowToLocal((a.x1+a.x2)/2,(a.y1+a.y2)/2); return p.x; })()`),
  await s.eval(`(() => { const a=window.__canvas.store.state.annotations.find(x=>x.type==='arrow'); const p=window.__canvas.canvas.vp.flowToLocal((a.x1+a.x2)/2,(a.y1+a.y2)/2); return p.y; })()`),
);
const handles = await s.eval(`document.querySelectorAll('.annotation-handle').length`);
const headLocal = await s.eval(`(() => { const a=window.__canvas.store.state.annotations.find(x=>x.type==='arrow'); const p=window.__canvas.canvas.vp.flowToLocal(a.x2,a.y2); return {x:p.x,y:p.y}; })()`);
await down(headLocal.x, headLocal.y);
await mv(headLocal.x + 60, headLocal.y - 40);
await up(headLocal.x + 60, headLocal.y - 40);
await pause(350);
const arrowAfter = (await anns()).find((x) => x.type === 'arrow');
const headMoved = arrowAfter.x2 !== a.x2 || arrowAfter.y2 !== a.y2;
await s.eval(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Delete',bubbles:true}))`);
await pause(300);
const afterDelete = (await anns()).filter((x) => x.type === 'arrow').length;
console.log('arrow edit   :', JSON.stringify({ handled: handles, headMoved, afterDelete }));

/* 文字：创建 → 单击移动 → 双击改字 → 字号 → 删除 */
await s.eval(`window.__canvas.store.setSetting('annotateTool','text')`);
await pause(200);
console.log('pre-text dbg:', JSON.stringify(await s.eval(`({mode:window.__canvas.store.state.settings.annotateMode, tool:window.__canvas.store.state.settings.annotateTool, target:(()=>{const el=document.elementFromPoint(220,320); return el?.className?.baseVal||el?.className;})()})`)));
await click(220, 320);
await pause(600);
console.log('post-click dbg:', JSON.stringify(await s.eval(`({input: !!document.querySelector('.annotation-input'), mode:window.__canvas.store.state.settings.annotateMode})`)));
await s.eval(`(() => { const i=document.querySelector('.annotation-input'); i.value='标注文字'; i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); })()`);
await pause(450);
let t = (await anns()).find((x) => x.type === 'text');
const before = { x: t.x, y: t.y };
const tp = await s.eval(`(() => { const a=window.__canvas.store.state.annotations.find(x=>x.type==='text'); const p=window.__canvas.canvas.vp.flowToLocal(a.x,a.y-6); return {x:p.x,y:p.y}; })()`);
await click(tp.x, tp.y);
const textSelected = await s.eval(`!!document.querySelector('.annotation-select-box')`);
await down(tp.x, tp.y);
await mv(tp.x + 40, tp.y + 20);
await up(tp.x + 40, tp.y + 20);
await pause(350);
t = (await anns()).find((x) => x.type === 'text');
const moved = t.x !== before.x || t.y !== before.y;
const tp2 = await s.eval(`(() => { const a=window.__canvas.store.state.annotations.find(x=>x.type==='text'); const p=window.__canvas.canvas.vp.flowToLocal(a.x,a.y-6); return {x:p.x,y:p.y}; })()`);
await dbl(tp2.x, tp2.y);
const editValue = await s.eval(`document.querySelector('.annotation-input')?.value`);
await s.eval(`(() => { const i=document.querySelector('.annotation-input'); i.value='改过的文字'; i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); })()`);
await pause(400);
await s.eval(`(() => { const sel=document.querySelector('.annotate-bar [data-asize]'); sel.value='32'; sel.dispatchEvent(new Event('change',{bubbles:true})); })()`);
await pause(350);
t = (await anns()).find((x) => x.type === 'text');
console.log('text edit    :', JSON.stringify({ textSelected, moved, editValue, text: t.text, size: t.size }));
await s.eval(`window.__canvas.store.setSetting('annotateMode', false)`);

console.log('errors:', JSON.stringify(errs.slice(0, 6), null, 2));
s.close();
process.exit(0);
