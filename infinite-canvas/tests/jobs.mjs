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
const click = async (sel) => { const r = await rect(sel); if(!r) throw new Error('missing '+sel); const x=r.x+r.w/2,y=r.y+r.h/2; await s.mouse('mousePressed',x,y,{button:'left',buttons:1,clickCount:1}); await s.mouse('mouseReleased',x,y,{button:'left',buttons:0}); await pause(220); };

/* 1. queue: enqueue 3 nodes, badge, panel, run sequentially */
await s.eval(`(() => { const st=window.__canvas.store; const names=['image','video-gen','rh-ai'];
  for (const t of names) { const n=st.nodes.find(x=>x.type===t); if (n) window.__canvas.canvas.runNode(n.id); } })()`);
await pause(300);
let q = await s.eval(`({ jobs: window.__canvas.store.state.queue.length, badge: document.querySelector('#queueBadge')?.textContent, hidden: document.querySelector('#queueBadge')?.hidden })`);
console.log('queue enqueue:', JSON.stringify(q));
await click('#queueBtn');
await pause(300);
q = await s.eval(`(() => ({ open: !document.querySelector('.queue-panel').hidden, rows: document.querySelectorAll('.queue-job').length, statuses: [...document.querySelectorAll('.queue-job__status')].map(e=>e.textContent) }))()`);
console.log('queue panel  :', JSON.stringify(q));
await s.shot('jobs-s5-queue.png');
await pause(3500);
const q2 = await s.eval(`window.__canvas.store.state.queue.map(j=>j.status)`);
console.log('queue after  :', JSON.stringify(q2));

/* 2. crop: image node via media toolbar */
await s.eval(`window.__canvas.ui.toggleQueuePanel(false)`);
const img = await rect('.node[data-type="image"]');
await s.mouse('mouseMoved', img.x + img.w/2, img.y + 40, { buttons: 0 });
await pause(350);
await click('.media-toolbar [data-mt="crop"]');
await pause(300);
const cropOpen = await s.eval(`!!document.querySelector('.crop-overlay')`);
const stage = await rect('#cropStage');
const ir = await rect('#cropImg');
await s.mouse('mousePressed', ir.x + ir.w*0.2, ir.y + ir.h*0.2, {button:'left',buttons:1,clickCount:1});
await s.mouse('mouseMoved', ir.x + ir.w*0.7, ir.y + ir.h*0.7, {button:'left',buttons:1});
await pause(80);
await s.mouse('mouseReleased', ir.x + ir.w*0.7, ir.y + ir.h*0.7, {button:'left',buttons:0});
await pause(200);
await s.shot('jobs-s5-crop.png');
await click('.crop-overlay [data-crop="apply"]');
await pause(500);
const cropped = await s.eval(`(() => { const n=window.__canvas.store.nodes.find(x=>x.type==='image'); return {versions:n.data.history?.length||0, model:n.data.history?.at(-1)?.model, mediaLen:(n.data.media||'').length}; })()`);
console.log('crop         :', JSON.stringify({ cropOpen, ...cropped }));

/* 3. precision edit on video node */
await s.eval(`window.__canvas.canvas.vp.fitView({padding:120,maxZoom:0.85})`);
await pause(500);
const vid = await rect('.node[data-type="video-gen"]');
await s.mouse('mouseMoved', vid.x + vid.w/2, vid.y + 40, { buttons: 0 });
await pause(350);
await click('.media-toolbar [data-mt="precision"]');
await pause(400);
const peOpen = await s.eval(`!!document.querySelector('.pe-overlay')`);
const pv = await rect('#peStage');
await s.mouse('mousePressed', pv.x + pv.w*0.3, pv.y + pv.h*0.3, {button:'left',buttons:1,clickCount:1});
await s.mouse('mouseMoved', pv.x + pv.w*0.6, pv.y + pv.h*0.6, {button:'left',buttons:1});
await pause(60);
await s.mouse('mouseReleased', pv.x + pv.w*0.6, pv.y + pv.h*0.6, {button:'left',buttons:0});
await pause(200);
await s.shot('jobs-s5-precision.png');
await click('.pe-panel [data-pe="addPrompt"]');
await click('.pe-panel [data-pe="submit"]');
await pause(400);
const pe = await s.eval(`(() => { const n=window.__canvas.store.nodes.find(x=>x.type==='video-gen'); return {edits:n.data.edits?.length||0, prompt:(n.data.prompt||'').slice(-30), rendered: !!document.querySelector('.node[data-type="video-gen"] .node__edits')}; })()`);
console.log('precision    :', JSON.stringify({ peOpen, ...pe }));

/* 4. global history */
await s.eval(`window.__canvas.ui.openGlobalHistory()`);
await pause(400);
const gh = await s.eval(`(() => ({ open: !!document.querySelector('.history-overlay'), cards: document.querySelectorAll('.history-card').length, tabs: document.querySelectorAll('[data-gh-tab]').length }))()`);
await s.shot('jobs-s5-global-history.png');
await s.eval(`document.querySelector('[data-gh-tab="image"]').click()`);
await pause(250);
const ghImg = await s.eval(`document.querySelectorAll('.history-card').length`);
await s.eval(`document.querySelector('.history-overlay [data-gh="close"]').click()`);
console.log('global hist  :', JSON.stringify({ ...gh, imageTab: ghImg }));
console.log('errors:', JSON.stringify(errs.slice(0,6), null, 2));
s.close(); process.exit(0);
