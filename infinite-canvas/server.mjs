#!/usr/bin/env node
/**
 * 无限画布本地服务：静态站点 + APIMart 代理
 *
 * - 静态资源：index.html / src / styles.css / dist
 * - /api/health                代理健康 + 模型数量
 * - /api/models                GET  {base}/models
 * - /api/balance               GET  {base}/user/balance
 * - /api/chat                  POST {base}/chat/completions
 * - /api/images                POST {base}/images/generations
 * - /api/videos                POST {base}/videos/generations
 * - /api/tasks/:id             GET  {base}/tasks/:id
 * - /api/audio/speech          POST {base}/audio/speech（二进制透传）
 * - /api/uploads/images        POST {base}/uploads/images（multipart 透传）
 *
 * API Key 只从环境变量或 config.local.json 读取，永远不下发到浏览器。
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8099);
const HOST = process.env.HOST || '127.0.0.1';

function loadConfig() {
  let cfg = {};
  try {
    cfg = JSON.parse(fs.readFileSync(path.join(root, 'config.local.json'), 'utf8'));
  } catch {}
  return {
    apiKey: process.env.APIMART_API_KEY || cfg.apiKey || '',
    baseUrl: (process.env.APIMART_BASE_URL || cfg.baseUrl || 'https://api.apimart.ai/v1').replace(/\/$/, ''),
  };
}
let config = loadConfig();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const json = (res, status, obj) => {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  res.end(body);
};

function readBody(req, limit = 64 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** generic JSON passthrough to APIMart */
async function proxyJson(res, method, apiPath, body) {
  if (!config.apiKey) return json(res, 500, { error: { message: '本地服务未配置 APIMART_API_KEY' } });
  try {
    const r = await fetch(`${config.baseUrl}${apiPath}`, {
      method,
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(180_000),
    });
    const text = await r.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: { message: text.slice(0, 500) || `HTTP ${r.status}`, status: r.status } };
    }
    json(res, r.status, data);
  } catch (err) {
    json(res, 502, { error: { message: `上游请求失败：${err.message}` } });
  }
}

async function proxyBinary(req, res, apiPath) {
  if (!config.apiKey) return json(res, 500, { error: { message: '本地服务未配置 APIMART_API_KEY' } });
  const contentType = req.headers['content-type'] || 'application/octet-stream';
  const body = await readBody(req);
  try {
    const r = await fetch(`${config.baseUrl}${apiPath}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${config.apiKey}`, 'content-type': contentType },
      body,
      signal: AbortSignal.timeout(180_000),
    });
    const ab = await r.arrayBuffer();
    const outType = r.headers.get('content-type') || 'application/octet-stream';
    if ((outType.includes('json') || r.status >= 400) && ab.byteLength < 1024 * 1024) {
      res.writeHead(r.status, { 'content-type': outType, 'cache-control': 'no-store' });
      return res.end(Buffer.from(ab));
    }
    res.writeHead(r.status, {
      'content-type': outType,
      'content-length': ab.byteLength,
      'cache-control': 'no-store',
    });
    res.end(Buffer.from(ab));
  } catch (err) {
    json(res, 502, { error: { message: `上游请求失败：${err.message}` } });
  }
}

async function handleApi(req, res, url) {
  const p = url.pathname;
  try {
    if (p === '/api/health') {
      let models = 0;
      let ok = false;
      try {
        const r = await fetch(`${config.baseUrl}/models`, {
          headers: config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {},
          signal: AbortSignal.timeout(15000),
        });
        ok = r.ok;
        if (r.ok) {
          const d = await r.json();
          models = Array.isArray(d.data) ? d.data.length : 0;
        }
      } catch {}
      return json(res, 200, {
        ok,
        hasKey: !!config.apiKey,
        base: config.baseUrl,
        models,
        keySource: process.env.APIMART_API_KEY ? 'env' : config.apiKey ? 'config.local.json' : 'none',
      });
    }
    if (p === '/api/models') {
      const qs = new URLSearchParams();
      for (const key of ['expand', 'category']) {
        const v = url.searchParams.get(key);
        if (v) qs.set(key, v);
      }
      const suffix = qs.toString() ? `?${qs}` : '';
      const r = await fetch(`${config.baseUrl}/models${suffix}`, {
        headers: { authorization: `Bearer ${config.apiKey}` },
        signal: AbortSignal.timeout(30000),
      });
      return json(res, r.status, await r.json());
    }
    if (p === '/api/balance') return proxyJson(res, 'GET', '/user/balance');
    if (p === '/api/chat') return proxyJson(res, 'POST', '/chat/completions', JSON.parse((await readBody(req)).toString() || '{}'));
    if (p === '/api/images') return proxyJson(res, 'POST', '/images/generations', JSON.parse((await readBody(req)).toString() || '{}'));
    if (p === '/api/videos') return proxyJson(res, 'POST', '/videos/generations', JSON.parse((await readBody(req)).toString() || '{}'));
    if (p === '/api/audio/speech') return proxyBinary(req, res, '/audio/speech');
    if (p === '/api/uploads/images') return proxyBinary(req, res, '/uploads/images');
    const task = p.match(/^\/api\/tasks\/([\w.-]+)$/);
    if (task) return proxyJson(res, 'GET', `/tasks/${task[1]}`);
    return json(res, 404, { error: { message: `unknown api path ${p}` } });
  } catch (err) {
    return json(res, 500, { error: { message: err.message } });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) return handleApi(req, res, url);

  // static files
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const filePath = path.normalize(path.join(root, rel));
  if (!filePath.startsWith(root)) return json(res, 403, { error: { message: 'forbidden' } });
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      return res.end('404');
    }
    res.writeHead(200, {
      'content-type': MIME[path.extname(filePath)] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(data);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`无限画布 → http://${HOST}:${PORT}/`);
  console.log(`API 代理  → 已配置 ${config.baseUrl}（key: ${config.apiKey ? '已设置' : '未设置'}）`);
});
