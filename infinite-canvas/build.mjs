#!/usr/bin/env node
/* Build a single-file, double-clickable build of the canvas.
 *
 *   node build.mjs
 *
 * Produces:
 *   dist/infinite-canvas.html  — everything inlined, works from file://
 *   dist/app.js                — unminified ESM bundle (optional debugging)
 *
 * Uses a local esbuild if present (ESBUILD env, PATH, or a known path); falls
 * back to `npx --yes esbuild` when the network is available.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, 'dist');
fs.mkdirSync(dist, { recursive: true });

function findEsbuild() {
  const candidates = [
    process.env.ESBUILD,
    path.join(root, 'node_modules', '.bin', 'esbuild'),
    'esbuild',
    path.join(os.homedir(), '.bun', 'bin', 'esbuild'),
  ].filter(Boolean);
  for (const bin of candidates) {
    try {
      execFileSync(bin, ['--version'], { stdio: 'pipe' });
      return bin;
    } catch {
      /* keep looking */
    }
  }
  return null;
}

let esbuild = findEsbuild();
let run;
if (esbuild) {
  run = (args) => execFileSync(esbuild, args, { stdio: 'inherit', cwd: root });
} else {
  console.warn('[build] esbuild not found locally — falling back to npx (needs network)');
  run = (args) => execFileSync('npx', ['--yes', 'esbuild@0.28.1', ...args], { stdio: 'inherit', cwd: root });
}

const entry = path.join(root, 'src/main.js');
const outJs = path.join(dist, 'app.js');
run([entry, '--bundle', '--format=iife', '--target=chrome110', '--outfile=' + outJs, '--legal-comments=none']);

const js = fs.readFileSync(outJs, 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
// NOTE: replacements must be functions — the inserted CSS/JS contains `$`
// sequences that String.replace would otherwise interpret ($&, $', $`).
html = html
  .replace('<link rel="stylesheet" href="./styles.css" />', () => `<style>\n${css}\n</style>`)
  .replace('<script type="module" src="./src/main.js"></script>', () => `<script>\n${js}\n</script>`)
  .replace('<title>无限画布 · Infinite Canvas</title>', () => '<title>无限画布 · Infinite Canvas（单文件版）</title>');

const outHtml = path.join(dist, 'infinite-canvas.html');
fs.writeFileSync(outHtml, html);
console.log(`[build] ${path.relative(root, outHtml)}  (${(html.length / 1024).toFixed(0)} KB)`);
