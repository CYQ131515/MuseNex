import { newPage } from './cdp.mjs';
const s = await newPage('about:blank');
await s.send('Page.enable'); await s.send('Runtime.enable');
const errs=[];
s.on('Runtime.exceptionThrown', p=>errs.push(p.exceptionDetails?.exception?.description||p.exceptionDetails?.text));
s.on('Runtime.consoleAPICalled', p=>{ if(p.type==='error') errs.push((p.args||[]).map(a=>a.value??a.description).join(' ')); });
const path = new URL('../dist/infinite-canvas.html', import.meta.url).href;
const url = path + '?fresh=1';
await s.goto(url, 2600);
console.log(JSON.stringify({
  url: await s.eval('location.href'),
  nodes: await s.eval('document.querySelectorAll(".node").length'),
  zoom: await s.eval('document.querySelector("#zoomValue")?.textContent'),
  theme: await s.eval('document.documentElement.dataset.theme'),
  storage: await s.eval('(() => { try { localStorage.setItem("t","1"); return "ok"; } catch(e) { return e.message; } })()'),
  errs
}, null, 2));
await s.shot('file-build.png');
s.close(); process.exit(0);
