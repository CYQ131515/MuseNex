#!/usr/bin/env node
/* MuseNex 运行时引导
 *
 * 仓库不提交 Electron 运行时（约 280MB）。首次构建/开发时自动准备：
 *   node scripts/bootstrap-runtime.mjs
 *
 * 来源优先级：
 *   1. 环境变量 ELECTRON_ZIP 指向本地 electron-v*-darwin-*.zip
 *   2. ~/Library/Caches/electron 下同名 zip
 *   3. 从 GitHub Releases 下载对应版本
 *
 * 可选环境变量：
 *   MUSENEX_RUNTIME_DIR  运行时输出目录（默认 <repo>/.runtime）
 *   ELECTRON_ARCH        arm64 / x64（默认当前 Node 架构）
 *   ELECTRON_MIRROR      下载镜像前缀（默认 GitHub）
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'muse.config.json'), 'utf8'));
const NAME = cfg.app.name || 'MuseNex';
const ELECTRON_VERSION = cfg.app.electronVersion || '43.7.9';
const ARCH = process.env.ELECTRON_ARCH || process.arch || 'arm64';
const RUNTIME_DIR = process.env.MUSENEX_RUNTIME_DIR || path.join(ROOT, '.runtime');
const TARGET = path.join(RUNTIME_DIR, `${NAME}.app`);
const ZIP_NAME = `electron-v${ELECTRON_VERSION}-darwin-${ARCH}.zip`;
const MIRROR = (process.env.ELECTRON_MIRROR || 'https://github.com/electron/electron/releases/download').replace(/\/$/, '');

function log(m) { console.log('[runtime] ' + m); }
function fail(m) { console.error('[runtime] ✗ ' + m); process.exit(1); }
function run(cmd, args, opts = {}) { return execFileSync(cmd, args, { stdio: 'inherit', ...opts }); }
function pb(args, plist) { try { execFileSync('/usr/libexec/PlistBuddy', ['-c', args, plist], { stdio: 'ignore' }); } catch (e) { console.warn('[runtime] PlistBuddy 失败:', args); } }

if (fs.existsSync(TARGET)) { log('运行时已存在：' + TARGET); process.exit(0); }
if (process.platform !== 'darwin') fail('当前只支持 macOS（运行时为 darwin 包）');

function findCachedZip() {
  if (process.env.ELECTRON_ZIP && fs.existsSync(process.env.ELECTRON_ZIP)) return process.env.ELECTRON_ZIP;
  const roots = [path.join(os.homedir(), 'Library', 'Caches', 'electron'), path.join(os.tmpdir(), 'electron-cache')];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    const stack = [root];
    while (stack.length) {
      const dir = stack.pop();
      let entries = [];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
      for (const e of entries) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { stack.push(p); continue; }
        if (e.name === ZIP_NAME) return p;
      }
    }
  }
  return null;
}

function downloadZip(dest) {
  const url = `${MIRROR}/v${ELECTRON_VERSION}/${ZIP_NAME}`;
  log('下载 ' + url);
  run('curl', ['-L', '--fail', '--progress-bar', '-o', dest, url]);
  if (!fs.existsSync(dest) || fs.statSync(dest).size < 1024) fail('下载失败');
  return dest;
}

log(`准备 Electron ${ELECTRON_VERSION} (darwin-${ARCH}) → ${TARGET}`);
fs.mkdirSync(RUNTIME_DIR, { recursive: true });
let zip = findCachedZip();
if (!zip) zip = downloadZip(path.join(os.tmpdir(), `musenex-${ZIP_NAME}`));

const tmp = fs.mkdtempSync('/tmp/musenex-runtime-');
try {
  log('解压运行时…');
  run('ditto', ['-x', '-k', zip, tmp]);
  const src = path.join(tmp, 'Electron.app');
  if (!fs.existsSync(src)) fail('zip 中未找到 Electron.app');

  try { fs.renameSync(src, TARGET); }
  catch { fs.cpSync(src, TARGET, { recursive: true }); }

  const contents = path.join(TARGET, 'Contents');
  const macos = path.join(contents, 'MacOS');

  // 主可执行文件
  const electronBin = path.join(macos, 'Electron');
  if (fs.existsSync(electronBin)) fs.renameSync(electronBin, path.join(macos, NAME));

  // Helper 进程
  const frameworks = path.join(contents, 'Frameworks');
  if (fs.existsSync(frameworks)) {
    for (const entry of fs.readdirSync(frameworks)) {
      if (!entry.startsWith('Electron Helper') || !entry.endsWith('.app')) continue;
      const oldPath = path.join(frameworks, entry);
      const newName = entry.replace(/^Electron Helper/, `${NAME} Helper`);
      const newPath = path.join(frameworks, newName);
      fs.renameSync(oldPath, newPath);
      const helperMac = path.join(newPath, 'Contents', 'MacOS');
      const oldExe = entry.replace(/\.app$/, '');
      const newExe = newName.replace(/\.app$/, '');
      const exePath = path.join(helperMac, oldExe);
      if (fs.existsSync(exePath)) fs.renameSync(exePath, path.join(helperMac, newExe));
      const plist = path.join(newPath, 'Contents', 'Info.plist');
      pb(`Set :CFBundleName "${newName.replace(/\.app$/, '')}"`, plist);
      pb(`Set :CFBundleIdentifier ${cfg.app.bundleId || 'com.musenex.app'}.helper`, plist);
    }
  }

  // 主 Info.plist
  const plist = path.join(contents, 'Info.plist');
  pb(`Set :CFBundleExecutable ${NAME}`, plist);
  pb(`Set :CFBundleName ${NAME}`, plist);
  pb(`Set :CFBundleDisplayName ${NAME}`, plist);
  pb(`Set :CFBundleIdentifier ${cfg.app.bundleId || 'com.musenex.app'}`, plist);
  pb(`Set :CFBundleShortVersionString ${cfg.app.version || '1.0.0'}`, plist);
  pb(`Set :CFBundleVersion ${cfg.app.version || '1.0.0'}`, plist);
  pb('Set :CFBundleIconFile MuseNex.icns', plist);

  // 图标
  const iconSrc = path.join(ROOT, cfg.app.icon || 'assets/app-icon-1024.png');
  if (fs.existsSync(iconSrc)) {
    const iconsetRoot = fs.mkdtempSync('/tmp/musenex-iconset-');
    const iconset = path.join(iconsetRoot, 'icon.iconset');
    fs.mkdirSync(iconset);
    for (const s of [16, 32, 64, 128, 256, 512]) {
      execFileSync('sips', ['-z', String(s), String(s), iconSrc, '--out', path.join(iconset, `icon_${s}x${s}.png`)], { stdio: 'ignore' });
      execFileSync('sips', ['-z', String(s * 2), String(s * 2), iconSrc, '--out', path.join(iconset, `icon_${s}x${s}@2x.png`)], { stdio: 'ignore' });
    }
    execFileSync('iconutil', ['-c', 'icns', iconset, '-o', path.join(contents, 'Resources', 'MuseNex.icns')], { stdio: 'ignore' });
    fs.rmSync(iconsetRoot, { recursive: true, force: true });
  }

  fs.writeFileSync(path.join(RUNTIME_DIR, '.metadata_never_index'), '');
  log('签名（ad-hoc）…');
  try { run('codesign', ['--force', '--deep', '--sign', '-', TARGET]); } catch { log('签名失败，构建时会重试'); }
  log('✓ 完成：' + TARGET);
} finally {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
}
