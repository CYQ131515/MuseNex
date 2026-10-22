#!/usr/bin/env node
/* 基础检查：JS 语法、manifest 引用、工作区产物是否存在 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'muse.config.json'), 'utf8'));
let failed = 0;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.js') || e.name.endsWith('.mjs')) out.push(p);
  }
  return out;
}

const dirs = ['shell', ...config.workspaces.map((w) => path.join(w.dir, w.id === config.mainWorkspace ? 'renderer' : ''))];
for (const d of dirs) {
  const abs = path.join(ROOT, d);
  if (!fs.existsSync(abs)) { console.error('✗ 缺少目录', d); failed++; continue; }
  for (const f of walk(abs)) {
    try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); }
    catch (e) { console.error('✗ 语法错误', path.relative(ROOT, f)); failed++; }
  }
}

for (const w of config.workspaces) {
  const base = path.join(ROOT, w.dir, w.id === config.mainWorkspace ? w.entry : path.join(w.webRoot || '', w.entry));
  if (!fs.existsSync(base)) { console.error('✗ 工作区入口不存在', path.relative(ROOT, base)); failed++; }
  if (w.preload && !fs.existsSync(path.join(ROOT, w.preload))) { console.error('✗ preload 不存在', w.preload); failed++; }
}

if (failed) { console.error(`✗ 检查失败：${failed} 项`); process.exit(1); }
console.log('✓ 检查通过：manifest、工作区入口、preload、JS 语法');
