#!/usr/bin/env node
/* MuseNex 构建脚本
 *
 * 用法：
 *   node scripts/build-app.mjs             # 只重建 .runtime/MuseNex.app/Contents/Resources/app 并签名
 *   node scripts/build-app.mjs --install   # 同时安装到 /Applications 并刷新启动服务
 *
 * 运行时来源：.runtime/MuseNex.app（已经重命名好的 Electron 运行时，隐藏目录不参与搜索）。
 * 构建只替换 Resources/app 与图标，不复制体积庞大的 Electron Framework。
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(ROOT, '.runtime', 'MuseNex.app');
const LEGACY_APP = path.join(ROOT, 'MuseNex.app');
const RES = path.join(APP, 'Contents', 'Resources');
const TARGET = path.join(RES, 'app');
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'muse.config.json'), 'utf8'));
const INSTALL = process.argv.includes('--install');

function log(msg) { console.log('[build] ' + msg); }
function fail(msg) { console.error('[build] ✗ ' + msg); process.exit(1); }
function run(cmd, args, opts = {}) { return execFileSync(cmd, args, { stdio: 'inherit', ...opts }); }

// 兼容旧布局：根目录还有 MuseNex.app 时自动收进 .runtime/
if (!fs.existsSync(APP) && fs.existsSync(LEGACY_APP)) {
  fs.mkdirSync(path.dirname(APP), { recursive: true });
  fs.renameSync(LEGACY_APP, APP);
  fs.writeFileSync(path.join(path.dirname(APP), '.metadata_never_index'), '');
}
if (!fs.existsSync(APP)) {
  console.log('[build] 未找到构建运行时，先执行 scripts/bootstrap-runtime.mjs …');
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'bootstrap-runtime.mjs')], { stdio: 'inherit' });
}
if (!fs.existsSync(APP)) fail(`未找到构建运行时 ${APP}（应位于隐藏目录 .runtime/）`);

log('停止运行中的实例…');
try { execFileSync('pkill', ['-f', path.join(APP, 'Contents', 'MacOS', 'MuseNex')], { stdio: 'ignore' }); } catch {}
await new Promise((r) => setTimeout(r, 400));

log('组装 Resources/app …');
fs.rmSync(TARGET, { recursive: true, force: true });
fs.mkdirSync(TARGET, { recursive: true });

const copy = (rel) => {
  const from = path.join(ROOT, rel);
  const to = path.join(TARGET, rel);
  if (!fs.existsSync(from)) fail(`缺少 ${rel}`);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true, filter: (src) => !src.includes('node_modules') });
};

// 外壳
copy('package.json');
copy('muse.config.json');
fs.mkdirSync(path.join(TARGET, 'shell'), { recursive: true });
for (const f of fs.readdirSync(path.join(ROOT, 'shell'))) {
  if (f.endsWith('.js')) fs.copyFileSync(path.join(ROOT, 'shell', f), path.join(TARGET, 'shell', f));
}

// 各工作区运行时资源（由 manifest 决定）
for (const ws of CONFIG.workspaces) {
  const dir = path.join(ROOT, ws.dir);
  if (!fs.existsSync(dir)) fail(`工作区目录不存在：${ws.dir}`);
  if (ws.id === CONFIG.mainWorkspace) {
    copy(path.join(ws.dir, 'renderer'));
    const pkg = path.join(dir, 'package.json');
    if (fs.existsSync(pkg)) copy(path.join(ws.dir, 'package.json'));
  } else {
    const base = path.join(ws.dir, ws.webRoot || '');
    if (!fs.existsSync(base)) fail(`工作区产物不存在：${ws.dir}/${ws.webRoot || ''}（先构建该工作区）`);
    const rel = path.join(ws.dir, ws.webRoot || '');
    fs.mkdirSync(path.join(TARGET, rel), { recursive: true });
    fs.cpSync(base, path.join(TARGET, rel), { recursive: true });
  }
}

log('生成图标 …');
const iconSrc = path.join(ROOT, CONFIG.app.icon || 'assets/app-icon-1024.png');
if (fs.existsSync(iconSrc)) {
  const iconsetRoot = fs.mkdtempSync('/tmp/musenex-iconset-');
  const iconset = path.join(iconsetRoot, 'icon.iconset');
  fs.mkdirSync(iconset);
  const sizes = [16, 32, 64, 128, 256, 512];
  for (const s of sizes) {
    execFileSync('sips', ['-z', String(s), String(s), iconSrc, '--out', path.join(iconset, `icon_${s}x${s}.png`)], { stdio: 'ignore' });
    execFileSync('sips', ['-z', String(s * 2), String(s * 2), iconSrc, '--out', path.join(iconset, `icon_${s}x${s}@2x.png`)], { stdio: 'ignore' });
  }
  execFileSync('iconutil', ['-c', 'icns', iconset, '-o', path.join(RES, 'MuseNex.icns')], { stdio: 'ignore' });
  fs.rmSync(iconsetRoot, { recursive: true, force: true });
}

log('更新 Info.plist …');
const plist = path.join(APP, 'Contents', 'Info.plist');
try {
  execFileSync('/usr/libexec/PlistBuddy', ['-c', `Set :CFBundleShortVersionString ${CONFIG.app.version}`, plist], { stdio: 'ignore' });
  execFileSync('/usr/libexec/PlistBuddy', ['-c', `Set :CFBundleVersion ${CONFIG.app.version}`, plist], { stdio: 'ignore' });
  execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Set :CFBundleIconFile MuseNex.icns', plist], { stdio: 'ignore' });
  try { execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Set :CFBundleDocumentTypes:0:CFBundleTypeName MuseNex Scene', plist], { stdio: 'ignore' }); } catch {}
  try { execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Set :LSApplicationCategoryType public.app-category.graphics-design', plist], { stdio: 'ignore' }); } catch {}
} catch {}

log('签名（ad-hoc）…');
run('codesign', ['--force', '--deep', '--sign', '-', APP]);
execFileSync('codesign', ['--verify', '--deep', '--strict', APP], { stdio: 'inherit' });
log('✓ 构建完成：' + APP);

if (INSTALL) {
  const dest = '/Applications/MuseNex.app';
  log('安装到 ' + dest + ' …');
  try { execFileSync('pkill', ['-f', path.join(dest, 'Contents', 'MacOS', 'MuseNex')], { stdio: 'ignore' }); } catch {}
  fs.rmSync(dest, { recursive: true, force: true });
  execFileSync('ditto', [APP, dest], { stdio: 'inherit' });
  try {
    execFileSync('/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister', ['-f', dest], { stdio: 'ignore' });
  } catch {}
  try { execFileSync('killall', ['Dock'], { stdio: 'ignore' }); } catch {}
  log('✓ 已安装：' + dest);
}
