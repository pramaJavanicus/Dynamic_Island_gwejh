// Simple JSON config stored at %APPDATA%\<app>\config.json
const { app, shell } = require('electron');
const fs = require('fs');
const path = require('path');

let current = null;

const filePath = () => path.join(app.getPath('userData'), 'config.json');

function defaults() {
  return {
    // Folder & aplikasi favorit - bisa ditambah dengan drag & drop langsung ke tab Home
    folders: [
      { name: 'Downloads', path: app.getPath('downloads'), icon: 'download', kind: 'dir' },
      { name: 'Documents', path: app.getPath('documents'), icon: 'file', kind: 'dir' },
      { name: 'Desktop', path: app.getPath('desktop'), icon: 'monitor', kind: 'dir' },
      { name: 'Projects', path: '%USERPROFILE%\\Projects', icon: 'code', kind: 'dir' },
    ],
    shortcut: 'Control+Alt+Space', // global hotkey to toggle the island
    autoStart: true, // jalan otomatis saat Windows start

    // Mode tersembunyi: island hanya berupa tonjolan kecil di tepi atas layar
    edgeZoneWidth: 360, // lebar area pemicu (px) di tepi paling atas, di tengah layar
    edgeHoverDelay: 140, // ms kursor harus diam di tepi atas sebelum island muncul
    collapseDelay: 450, // ms sebelum island bersembunyi lagi setelah kursor pergi

    // Peek status (suhu, baterai laptop, baterai Bluetooth)
    peekEnabled: true,
    peekInterval: 30000, // tampilkan status tiap N ms (30 detik)
    peekDuration: 3000, // berapa lama status ditampilkan
  };
}

function expandEnv(p) {
  return String(p || '').replace(/%([^%]+)%/g, (m, name) => process.env[name] ?? m);
}

function write(cfg) {
  fs.mkdirSync(path.dirname(filePath()), { recursive: true });
  fs.writeFileSync(filePath(), JSON.stringify(cfg, null, 2), 'utf8');
}

function load() {
  const def = defaults();
  try {
    const raw = JSON.parse(fs.readFileSync(filePath(), 'utf8'));
    current = { ...def, ...raw };
  } catch {
    current = def;
    write(def);
  }
  return current;
}

const get = () => current || load();

/** Merge a patch into config.json. */
function set(patch) {
  current = { ...get(), ...patch };
  write(current);
  return current;
}

/** Add one or more folders / applications / .lnk shortcuts to config.folders */
async function addShortcuts(paths = []) {
  const cfg = get();
  const list = Array.isArray(cfg.folders) ? [...cfg.folders] : [];
  const norm = (p) => path.resolve(expandEnv(p)).toLowerCase();

  for (const rawPath of paths) {
    if (!rawPath) continue;
    const resolved = path.resolve(expandEnv(rawPath));
    if (!fs.existsSync(resolved)) continue;
    if (list.some((item) => norm(item.path) === resolved.toLowerCase())) continue;

    let isDir = false;
    try {
      isDir = fs.statSync(resolved).isDirectory();
    } catch { /* ignore */ }

    const parsed = path.parse(resolved);
    const cleanName = isDir
      ? (parsed.base || resolved)
      : (['.lnk', '.exe', '.url', '.bat', '.cmd'].includes(parsed.ext.toLowerCase()) ? parsed.name : parsed.base);

    let iconData = null;
    if (!isDir) {
      try {
        let iconTarget = resolved;
        if (parsed.ext.toLowerCase() === '.lnk') {
          try {
            const lnk = shell.readShortcutLink(resolved);
            if (lnk?.target && fs.existsSync(lnk.target)) iconTarget = lnk.target;
          } catch { /* fallback to .lnk path */ }
        }
        const nativeIcon = await app.getFileIcon(iconTarget, { size: 'large' });
        if (nativeIcon && !nativeIcon.isEmpty()) iconData = nativeIcon.toDataURL();
      } catch { /* ignore */ }
    }

    list.push({
      name: cleanName,
      path: resolved,
      icon: isDir ? 'folder' : 'app',
      kind: isDir ? 'dir' : 'app',
      iconData,
    });
  }

  return set({ folders: list });
}

function removeShortcut(targetPath) {
  const cfg = get();
  const normTarget = path.resolve(expandEnv(targetPath)).toLowerCase();
  const list = (cfg.folders || []).filter(
    (item) => path.resolve(expandEnv(item.path)).toLowerCase() !== normTarget && item.path !== targetPath,
  );
  return set({ folders: list });
}

/** Hot-reload when the user edits config.json */
function watch(onChange) {
  let timer;
  fs.watchFile(filePath(), { interval: 1000 }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => onChange(load()), 200);
  });
}

module.exports = { filePath, load, get, set, addShortcuts, removeShortcut, watch, expandEnv };
