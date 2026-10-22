import { newPage } from './cdp.mjs';
const s = await newPage('about:blank');
await s.send('Page.enable'); await s.send('Runtime.enable');
await s.send('Network.enable'); await s.send('Network.setCacheDisabled', { cacheDisabled: true });
const errs = [];
s.on('Runtime.exceptionThrown', p => errs.push(p.exceptionDetails?.exception?.description || p.exceptionDetails?.text));
s.on('Runtime.consoleAPICalled', p => { if (p.type === 'error') errs.push((p.args||[]).map(a=>a.value??a.description).join(' ')); });
await s.goto('http://127.0.0.1:8099/?fresh=1', 4000);
const pause = ms => new Promise(r=>setTimeout(r,ms));
const rect = async (sel) => s.eval(`(() => { const el=document.querySelector(${JSON.stringify(sel)}); if(!el) return null; const r=el.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}; })()`);
const click = async (sel) => { const r = await rect(sel); if(!r) throw new Error('missing '+sel); const x=r.x+r.w/2,y=r.y+r.h/2; await s.mouse('mousePressed',x,y,{button:'left',buttons:1,clickCount:1}); await s.mouse('mouseReleased',x,y,{button:'left',buttons:0}); await pause(240); };

/* 1. api status */
const st = await s.eval(`(() => { const a=window.__canvas.api ? window.__canvas.api.state : window.__apiState; return { chip: document.querySelector('#apiBtn')?.className, text: document.querySelector('#apiBtn .api-chip__text')?.textContent }; })()`);
console.log('api chip     :', JSON.stringify(st));
console.log('api state    :', JSON.stringify(await s.eval(`(() => { const a = window.__canvas.api; return a ? {online:a.state.online, models:a.state.models.length, text:a.state.byKind.text.length, image:a.state.byKind.image.length, video:a.state.byKind.video.length, audio:a.state.byKind.audio.length} : null; })()`)));
await s.shot('api-canvas-s6-api-chip.png');

/* 2. api panel */
await click('#apiBtn');
await pause(300);
console.log('api panel    :', JSON.stringify(await s.eval(`(() => ({open: !document.querySelector('#apiPanel').hidden, rows: document.querySelectorAll('#apiPanel .info-row').length, toggles: document.querySelectorAll('#apiPanel [data-api-toggle]').length}))()`)));
await s.shot('api-canvas-s6-api-panel.png');
await s.eval(`window.__canvas.ui.openApiPanel(false)`);

/* 3. param bar model options from API */
await s.eval(`(() => { const st=window.__canvas.store; const n=st.nodes.find(x=>x.type==='image'); st.state.selection=new Set([n.id]); st.emit('selection'); window.__canvas.ui.openParamBar(n.id); })()`);
await pause(300);
const opts = await s.eval(`(() => { const sel=document.querySelector('.param-bar [data-param="model"]'); return {count: sel?.options.length, first: [...(sel?.options||[])].slice(0,5).map(o=>o.value)}; })()`);
console.log('model options:', JSON.stringify(opts));

/* 4. REAL image generation through the canvas */
await s.eval(`window.__canvas.store.setNodeParams ? null : null`);
await s.eval(`(() => { const st=window.__canvas.store; const n=st.nodes.find(x=>x.type==='image');
  st.transaction(s2=>{ const t=s2.nodes.find(x=>x.id===n.id); t.data={...t.data, prompt:'一只戴宇航头盔的柴犬，赛博朋克霓虹背景，电影感'}; },{history:false,reason:'prompt'});
  window.__canvas.canvas.runNode(n.id); })()`);
await pause(1500);
console.log('queue        :', JSON.stringify(await s.eval(`window.__canvas.store.state.queue.map(j=>({s:j.status,p:j.progress}))`)));
await pause(20000);
const img = await s.eval(`(() => { const n=window.__canvas.store.nodes.find(x=>x.type==='image'); return {status:n.data.status, media:(n.data.media||'').slice(0,60), host:(n.data.media||'').includes('http'), versions:n.data.history?.length||0, model:n.data.history?.at(-1)?.model}; })()`);
console.log('image run    :', JSON.stringify(img));
await s.shot('api-canvas-s6-api-image.png');

/* 5. video confirm dialog (do NOT spend) */
await s.eval(`(() => { const st=window.__canvas.store; const n=st.nodes.find(x=>x.type==='video-gen'); window.__canvas.canvas.runNode(n.id); })()`);
await pause(400);
const confirm = await s.eval(`(() => { const d=document.querySelector('.generic-dialog'); return {open: !!d, title: d?.querySelector('h3')?.textContent}; })()`);
console.log('video confirm:', JSON.stringify(confirm));
await s.eval(`document.querySelector('.generic-dialog [data-dlg-act="cancel"]')?.click()`);

/* 6. REAL llm chat via canvas */
await s.eval(`(() => { const st=window.__canvas.store; const n=st.nodes.find(x=>x.type==='llm');
  st.transaction(s2=>{ const t=s2.nodes.find(x=>x.id===n.id); t.data={...t.data, prompt:'用一句话描述雨夜天台的镜头'}; },{history:false,reason:'prompt'});
  window.__canvas.canvas.runNode(n.id); })()`);
await pause(12000);
const llm = await s.eval(`(() => { const n=window.__canvas.store.nodes.find(x=>x.type==='llm'); return {status:n.data.status, text:(n.data.text||'').slice(0,60)}; })()`);
console.log('llm run      :', JSON.stringify(llm));
await s.shot('api-canvas-s6-api-llm.png');
console.log('errors:', JSON.stringify(errs.slice(0,8), null, 2));
s.close(); process.exit(0);
