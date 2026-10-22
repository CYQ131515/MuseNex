// Minimal CDP client for a page target. Usage: node cdp.mjs <script.mjs>
// Exports helpers via global `cdp` object inside the script.
import fs from 'node:fs';

const PORT = process.env.CDP_PORT || '9333';

async function listTargets() {
  const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  return r.json();
}

export class Session {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    this.listeners = new Map();
  }
  static async connect(pageTargetId) {
    const targets = await listTargets();
    const t = pageTargetId ? targets.find((x) => x.id === pageTargetId) : targets.find((x) => x.type === 'page');
    if (!t) throw new Error('no page target');
    const ws = new WebSocket(t.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const s = new Session(ws);
    s.target = t;
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && s.pending.has(msg.id)) {
        const { resolve, reject } = s.pending.get(msg.id);
        s.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      } else if (msg.method) {
        s.events.push(msg);
        const ls = s.listeners.get(msg.method) || [];
        ls.forEach((f) => f(msg.params));
      }
    };
    return s;
  }
  on(method, fn) { const a = this.listeners.get(method) || []; a.push(fn); this.listeners.set(method, a); }
  send(method, params = {}, timeoutMs = 60000) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('timeout ' + method)); } }, timeoutMs);
    });
  }
  async eval(expression, opts = {}) {
    const r = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true,
      ...opts,
    });
    if (r.exceptionDetails) throw new Error('eval: ' + JSON.stringify(r.exceptionDetails).slice(0, 800));
    return r.result?.value;
  }
  async goto(url, waitMs = 4000) {
    await this.send('Page.navigate', { url });
    await new Promise((r) => setTimeout(r, waitMs));
  }
  async shot(path) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path, Buffer.from(data, 'base64'));
    return path;
  }
  async mouse(type, x, y, extra = {}) {
    return this.send('Input.dispatchMouseEvent', { type, x, y, ...extra });
  }
  async wheel(x, y, deltaY, deltaX = 0) {
    await this.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel', x, y, deltaX, deltaY, modifiers: 0,
      pointerType: 'mouse',
    });
  }
  async key(text) {
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', text, unmodifiedText: text, key: text });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key: text });
  }
  close() { this.ws.close(); }
}

export async function newPage(url = 'about:blank') {
  const r = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  if (!r.ok) throw new Error('new page failed ' + r.status);
  const t = await r.json();
  const s = await Session.connect(t.id);
  // deterministic viewport for tests & screenshots (fresh Chrome defaults are tiny)
  try {
    await s.send('Emulation.setDeviceMetricsOverride', {
      width: 1440, height: 757, deviceScaleFactor: 1, mobile: false,
    });
  } catch {}
  return s;
}
