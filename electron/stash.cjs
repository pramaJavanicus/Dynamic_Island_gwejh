// Temporary file shelf stored in %TEMP%\DynamicIslandStash
const { app, nativeImage } = require('electron');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');

const STASH_DIR = path.join(os.tmpdir(), 'DynamicIslandStash');
const iconCache = new Map(); // full path -> NativeImage (needed synchronously for startDrag)

// 1x1 transparent PNG fallback (startDrag requires a non-empty icon)
const FALLBACK_ICON = nativeImage.createFromDataURL(
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
);

async function ensure() {
  await fsp.mkdir(STASH_DIR, { recursive: true });
}

function isInside(p) {
  const rel = path.relative(STASH_DIR, path.resolve(p));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** Resolve a stash item name to an absolute path, refusing anything outside the stash. */
function resolve(name) {
  const full = path.join(STASH_DIR, path.basename(String(name || '')));
  return full !== STASH_DIR && fs.existsSync(full) ? full : null;
}

function uniqueName(name) {
  const { name: base, ext } = path.parse(name);
  let candidate = name;
  let i = 1;
  while (fs.existsSync(path.join(STASH_DIR, candidate))) candidate = `${base} (${i++})${ext}`;
  return candidate;
}

/** Copy files/folders into the stash (originals are left untouched). */
async function add(paths = []) {
  await ensure();
  for (const src of paths) {
    if (!src || isInside(src) || !fs.existsSync(src)) continue; // ignore drag-outs dropped back in
    const dest = path.join(STASH_DIR, uniqueName(path.basename(src)));
    try {
      await fsp.cp(src, dest, { recursive: true, errorOnExist: true, force: false });
    } catch (e) {
      console.warn('[stash] copy failed', src, e.message);
    }
  }
}

async function list() {
  await ensure();
  const entries = await fsp.readdir(STASH_DIR, { withFileTypes: true });
  const items = await Promise.all(entries.map(async (d) => {
    const full = path.join(STASH_DIR, d.name);
    try {
      const st = await fsp.stat(full);
      let icon = iconCache.get(full);
      if (!icon) {
        icon = await app.getFileIcon(full, { size: 'large' }).catch(() => null);
        if (icon && !icon.isEmpty()) iconCache.set(full, icon);
      }
      return {
        name: d.name,
        isDir: d.isDirectory(),
        size: st.size,
        mtime: st.mtimeMs,
        icon: icon && !icon.isEmpty() ? icon.toDataURL() : null,
      };
    } catch {
      return null;
    }
  }));
  return items.filter(Boolean).sort((a, b) => b.mtime - a.mtime);
}

async function remove(name) {
  const full = resolve(name);
  if (!full) return;
  iconCache.delete(full);
  await fsp.rm(full, { recursive: true, force: true });
}

async function clear() {
  iconCache.clear();
  await fsp.rm(STASH_DIR, { recursive: true, force: true });
  await ensure();
}

function dragIcon(full) {
  return iconCache.get(full) || FALLBACK_ICON;
}

/** Notify the UI when the stash folder changes externally (e.g. files moved out). */
function watch(onChange) {
  let timer;
  const trigger = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => onChange(await list()), 300);
  };
  try {
    fs.watch(STASH_DIR, trigger);
  } catch (e) {
    console.warn('[stash] watch failed', e.message);
  }
}

module.exports = { STASH_DIR, ensure, resolve, add, list, remove, clear, dragIcon, watch };
