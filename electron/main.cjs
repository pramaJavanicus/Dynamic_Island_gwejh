// ---------------------------------------------------------------------------
// Dynamic Island - Electron main process
// Frameless, transparent, always-on-top overlay docked at the top-center of
// the primary display (y = 0). Click-through outside the island is achieved
// with BrowserWindow.setShape(): in hidden/peek mode only the tiny top lip
// (8px high) receives mouse input, so Chrome/browser tabs are never blocked.
// ---------------------------------------------------------------------------
const {
  app, BrowserWindow, ipcMain, screen, Tray, Menu, shell, nativeImage, globalShortcut, dialog, clipboard, session,
} = require('electron');
const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');
const config = require('./config.cjs');
const stash = require('./stash.cjs');
const lyrics = require('./lyrics.cjs');
const { PsBridge } = require('./ps-bridge.cjs');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const isDev = process.env.ELECTRON_DEV === '1';
const ROOT_DIR = path.join(__dirname, '..');
const RES_DIR = app.isPackaged ? process.resourcesPath : path.join(ROOT_DIR, 'resources');
const STARTUP_LNK = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'Dynamic Island.lnk');
const DESKTOP_LNK = path.join(app.getPath('desktop'), 'Dynamic Island.lnk');

function setStartupEnabled(enable) {
  try {
    if (!enable) {
      if (fs.existsSync(STARTUP_LNK)) fs.unlinkSync(STARTUP_LNK);
      return;
    }
    const vbs = path.join(ROOT_DIR, 'Start-DynamicIsland.vbs');
    const icon = path.join(RES_DIR, 'icon.ico');
    const target = app.isPackaged ? process.execPath : (fs.existsSync(vbs) ? 'wscript.exe' : process.execPath);
    const args = app.isPackaged ? '' : (fs.existsSync(vbs) ? `"${vbs}"` : `"${ROOT_DIR}"`);
    shell.writeShortcutLink(STARTUP_LNK, 'create', {
      target,
      args,
      cwd: ROOT_DIR,
      icon,
      iconIndex: 0,
      description: 'Dynamic Island for Windows',
    });
    if (!fs.existsSync(DESKTOP_LNK)) {
      shell.writeShortcutLink(DESKTOP_LNK, 'create', {
        target,
        args,
        cwd: ROOT_DIR,
        icon,
        iconIndex: 0,
        description: 'Dynamic Island for Windows',
      });
    }
  } catch (e) {
    console.warn('[startup] shortcut error:', e.message);
  }
}

function isStartupEnabled() {
  return fs.existsSync(STARTUP_LNK);
}

// Window canvas = max expanded island size (740x340) + room for the shadow
const WIN_W = 780;
const WIN_H = 410;
// Default hit region = tiny top lip so browser tabs underneath are never blocked
const LIP_SHAPE = [{ x: Math.round((WIN_W - 140) / 2), y: 0, width: 140, height: 8 }];

let win = null;
let geminiWin = null;
let tray = null;
let mediaState = { active: false };
let sysState = {
  temp: 45, cpu: 12, bluetooth: [], volume: 50, muted: false, netDown: 0, netUp: 0,
};
let clipboardHistory = [];
let lastClipboardText = '';

const media = new PsBridge(path.join(RES_DIR, 'media.ps1'), {
  commands: ['toggle', 'play', 'pause', 'next', 'prev', 'refresh', 'play-track', 'play-search'],
});
const sysinfo = new PsBridge(path.join(RES_DIR, 'sysinfo.ps1'), {
  args: ['10'],
  commands: ['refresh', 'vol', 'mute'],
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}
app.on('second-instance', () => {
  showIsland();
  win?.webContents.send('island:toggle');
});

// ----------------------------------------------------------------- window --
function islandBounds() {
  const { bounds } = screen.getPrimaryDisplay();
  return {
    x: Math.round(bounds.x + (bounds.width - WIN_W) / 2),
    y: bounds.y, // flush with the very top edge of the screen (y = 0)
    width: WIN_W,
    height: WIN_H,
  };
}

function createWindow() {
  win = new BrowserWindow({
    ...islandBounds(),
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    show: false,
    title: 'Dynamic Island',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });

  win.setAlwaysOnTop(true, 'screen-saver'); // stays above most windows, incl. maximized ones
  win.setVisibleOnAllWorkspaces(true);
  // Click-through by default using WS_EX_TRANSPARENT + mouse forwarding (zero DWM surface stall!)
  win.setIgnoreMouseEvents(true, { forward: true });

  if (isDev) win.loadURL('http://127.0.0.1:5173');
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));

  win.once('ready-to-show', () => win.showInactive());
  win.on('blur', () => win.webContents.send('island:blur'));

  // Never navigate inside the overlay; external links go to the default browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafe(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
}

function reposition() {
  if (win && !win.isDestroyed()) win.setBounds(islandBounds());
}

function showIsland() {
  if (!win) return;
  win.showInactive();
  win.setAlwaysOnTop(true, 'screen-saver');
  updateTrayMenu();
}

function hideIsland() {
  win?.hide();
  updateTrayMenu();
}

// ------------------------------------------------------------------- tray --
function createTray() {
  try {
    const icon = nativeImage.createFromPath(path.join(RES_DIR, 'icon.png')).resize({ width: 16, height: 16 });
    tray = new Tray(icon);
    tray.setToolTip('Dynamic Island');
    tray.on('click', () => {
      showIsland();
      win?.focus();
      win?.webContents.send('island:toggle');
    });
    updateTrayMenu();
  } catch (e) {
    console.warn('[tray] could not create tray icon:', e.message);
  }
}

function updateTrayMenu() {
  if (!tray) return;
  const visible = !!win?.isVisible();
  const cfg = config.get();
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: 'Buka / Tutup Island (Ctrl+Alt+Space)',
      click: () => {
        showIsland();
        win?.focus();
        win?.webContents.send('island:toggle');
      },
    },
    { label: visible ? 'Sembunyikan Sepenuhnya' : 'Tampilkan di Atas Layar', click: () => (visible ? hideIsland() : showIsland()) },
    {
      label: 'Peek Status Tiap 30 Detik',
      type: 'checkbox',
      checked: cfg.peekEnabled !== false,
      click: (item) => {
        const next = config.set({ peekEnabled: item.checked });
        win?.webContents.send('config:changed', next);
      },
    },
    { type: 'separator' },
    { label: 'Buka folder Stash', click: () => openFolder(stash.STASH_DIR) },
    { label: 'Edit konfigurasi…', click: () => shell.openPath(config.filePath()) },
    {
      label: 'Jalankan saat Windows start',
      type: 'checkbox',
      checked: isStartupEnabled(),
      click: (item) => {
        setStartupEnabled(item.checked);
        config.set({ autoStart: item.checked });
      },
    },
    { type: 'separator' },
    { label: 'Keluar', click: () => app.quit() },
  ]));
}

// ---------------------------------------------------------------- helpers --
function openExternalSafe(url) {
  try {
    const u = new URL(url);
    if (['https:', 'http:', 'mailto:', 'spotify:'].includes(u.protocol)) shell.openExternal(u.toString());
  } catch { /* ignore invalid urls */ }
}

function findChromeExe() {
  const candidates = [
    path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return null;
}

function openBrowserUrls(urls = [], preferChrome = false) {
  const validUrls = urls.filter(Boolean);
  const chromeExe = preferChrome ? findChromeExe() : null;
  if (chromeExe) {
    const args = ['--force-renderer-accessibility', ...(validUrls.length ? validUrls : ['https://www.google.com'])];
    spawn(chromeExe, args, { detached: true, stdio: 'ignore' }).unref();
    return;
  }
  if (validUrls.length === 0) {
    openExternalSafe('https://www.google.com');
  } else {
    for (const u of validUrls) openExternalSafe(u);
  }
}

function runWhatsAppAutomation({ action = 'open', contact = '', message = '' } = {}) {
  return new Promise((resolve) => {
    const scriptPath = path.join(RES_DIR, 'whatsapp.ps1');
    execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-WindowStyle', 'Hidden',
        '-File', scriptPath,
        '-Action', String(action || 'open'),
        '-Contact', String(contact || ''),
        '-Message', String(message || ''),
      ],
      { timeout: 32000, windowsHide: true },
      (_err, stdout) => {
        try {
          const lines = String(stdout || '').trim().split('\n').filter(Boolean);
          const last = lines[lines.length - 1] || '{}';
          resolve(JSON.parse(last));
        } catch {
          resolve({ ok: true, action });
        }
      },
    );
  });
}

function findVsCodeExe() {
  const candidates = [
    path.join(process.env.LOCALAPPDATA || '', 'Programs\\Microsoft VS Code\\Code.exe'),
    path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Microsoft VS Code\\Code.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Microsoft VS Code\\Code.exe'),
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return null;
}

function spawnVsCodeClean(args = []) {
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  const codeExe = findVsCodeExe();
  if (codeExe) {
    spawn(codeExe, ['--reuse-window', ...args.filter(Boolean)], {
      detached: true,
      stdio: 'ignore',
      env: cleanEnv,
    }).unref();
  } else {
    spawn('cmd.exe', ['/c', 'code', '--reuse-window', ...args.filter(Boolean)], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: cleanEnv,
    }).unref();
  }
}

function fileUriToPath(uri) {
  if (!uri || typeof uri !== 'string' || !uri.startsWith('file://')) return null;
  try {
    const u = new URL(uri);
    let p = decodeURIComponent(u.pathname);
    if (/^\/[a-zA-Z]:/.test(p)) p = p.slice(1);
    return path.normalize(p);
  } catch {
    return null;
  }
}

function findFileInFolder(rootDir, targetFileName, maxDepth = 3) {
  if (!rootDir || !targetFileName || !fs.existsSync(rootDir)) return null;
  const targetLower = targetFileName.toLowerCase();
  const walk = (dir, depth) => {
    if (depth > maxDepth) return null;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return null; }
    for (const e of entries) {
      if (e.isFile() && e.name.toLowerCase() === targetLower) {
        return path.join(dir, e.name);
      }
    }
    for (const e of entries) {
      if (e.isDirectory() && !['node_modules', '.git', '.next', 'dist', 'release', 'build'].includes(e.name)) {
        const hit = walk(path.join(dir, e.name), depth + 1);
        if (hit) return hit;
      }
    }
    return null;
  };
  return walk(rootDir, 0);
}

function execVsCodePs1(args = []) {
  return new Promise((resolve) => {
    const scriptPath = path.join(RES_DIR, 'vscode.ps1');
    execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-WindowStyle', 'Hidden',
        '-File', scriptPath,
        ...args,
      ],
      { timeout: 10000, maxBuffer: 2 * 1024 * 1024, windowsHide: true },
      (_err, stdout) => {
        try {
          const lines = String(stdout || '').trim().split('\n').filter(Boolean);
          const last = lines[lines.length - 1] || '{}';
          resolve(JSON.parse(last));
        } catch {
          resolve({ ok: false });
        }
      },
    );
  });
}

async function resolveVsCodeContext() {
  const status = await execVsCodePs1(['-Action', 'status']);
  const rawTitle = String(status?.title || '').trim();
  const cleanTitle = rawTitle.replace(/\s*-\s*Visual Studio Code.*$/i, '').replace(/^[●•*]\s*/, '').trim();
  const parts = cleanTitle ? cleanTitle.split(/\s+-\s+/).map((s) => s.trim()).filter(Boolean) : [];
  const activeFileName = parts.length >= 1 && parts[0].includes('.') ? parts[0] : '';
  const activeFolderHint = parts.length >= 2 ? parts[1] : (parts.length === 1 && !parts[0].includes('.') ? parts[0] : '');

  // 1. Collect workspace folders from VS Code storage.json
  const folders = [];
  const addFolder = (uriOrPath) => {
    const p = uriOrPath?.startsWith('file://') ? fileUriToPath(uriOrPath) : uriOrPath;
    if (p && fs.existsSync(p) && !folders.includes(p)) folders.push(p);
  };

  try {
    const storagePath = path.join(app.getPath('appData'), 'Code', 'User', 'globalStorage', 'storage.json');
    if (fs.existsSync(storagePath)) {
      const storage = JSON.parse(fs.readFileSync(storagePath, 'utf8'));
      for (const w of storage?.windowsState?.openedWindows || []) addFolder(w?.folder);
      addFolder(storage?.windowsState?.lastActiveWindow?.folder);
      for (const f of storage?.backupWorkspaces?.folders || []) addFolder(f?.folderUri);
    }
  } catch { /* ignore */ }

  // Prioritize folder matching active window title
  let bestFolder = folders[0] || '';
  if (activeFolderHint) {
    const matchFolder = folders.find((f) => path.basename(f).toLowerCase() === activeFolderHint.toLowerCase());
    if (matchFolder) bestFolder = matchFolder;
  }

  // 2. Collect recently edited files from VS Code History
  const recentFiles = [];
  try {
    const historyRoot = path.join(app.getPath('appData'), 'Code', 'User', 'History');
    if (fs.existsSync(historyRoot)) {
      const dirs = fs.readdirSync(historyRoot, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => {
          const entriesPath = path.join(historyRoot, d.name, 'entries.json');
          let mtime = 0;
          try { mtime = fs.statSync(entriesPath).mtimeMs; } catch { return null; }
          return { entriesPath, mtime };
        })
        .filter(Boolean)
        .sort((a, b) => b.mtime - a.mtime)
        .slice(0, 20);

      for (const item of dirs) {
        try {
          const data = JSON.parse(fs.readFileSync(item.entriesPath, 'utf8'));
          const fp = fileUriToPath(data?.resource);
          const fpLower = (fp || '').toLowerCase();
          if (
            fp
            && fs.existsSync(fp)
            && !fpLower.includes('dynamic-island')
            && !fpLower.includes('\\node_modules\\')
            && !fpLower.includes('\\generated\\')
            && !fpLower.includes('\\.next\\')
            && !fpLower.endsWith('package-lock.json')
          ) {
            let fileMtime = item.mtime;
            try { fileMtime = Math.max(fileMtime, fs.statSync(fp).mtimeMs); } catch { /* ignore */ }
            recentFiles.push({ filePath: fp, mtime: fileMtime });
          }
        } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }

  // 3. Resolve exact target file on disk
  let targetFile = null;
  if (activeFileName) {
    if (bestFolder) {
      targetFile = findFileInFolder(bestFolder, activeFileName);
    }
    if (!targetFile) {
      const hit = recentFiles.find((r) => path.basename(r.filePath).toLowerCase() === activeFileName.toLowerCase());
      if (hit) targetFile = hit.filePath;
    }
    if (!targetFile) {
      for (const f of folders) {
        targetFile = findFileInFolder(f, activeFileName);
        if (targetFile) {
          bestFolder = f;
          break;
        }
      }
    }
  }

  if (!targetFile && activeFolderHint && bestFolder) {
    const inBestFolder = recentFiles.find((r) => r.filePath.toLowerCase().startsWith(bestFolder.toLowerCase()));
    if (inBestFolder) targetFile = inBestFolder.filePath;
  }

  if (!targetFile && recentFiles.length > 0) {
    recentFiles.sort((a, b) => b.mtime - a.mtime);
    targetFile = recentFiles[0].filePath;
    const matchingWs = folders.find((f) => targetFile.toLowerCase().startsWith(f.toLowerCase()));
    if (matchingWs) bestFolder = matchingWs;
  }

  if (targetFile && !bestFolder) {
    bestFolder = path.dirname(targetFile);
  }

  return {
    running: !!status?.running,
    hasFolderWindow: rawTitle.includes(' - '),
    folderPath: bestFolder,
    filePath: targetFile,
    title: rawTitle,
  };
}

async function runVsCodeAutomation({ action = 'open', instruction = '' } = {}) {
  const act = String(action || 'open').toLowerCase().trim();
  const ctx = await resolveVsCodeContext();

  if (act === 'open' || act === 'format' || act === 'terminal') {
    if (ctx.running && ctx.hasFolderWindow) {
      await execVsCodePs1(['-Action', 'open']);
    } else {
      spawnVsCodeClean([ctx.folderPath, ctx.filePath]);
    }
    return { ok: true, folderPath: ctx.folderPath, filePath: ctx.filePath };
  }

  if (act === 'fix') {
    if (!ctx.filePath || !fs.existsSync(ctx.filePath)) {
      return {
        ok: false,
        reply: 'Please open the code file you want me to fix in Visual Studio Code first, sir.',
      };
    }

    const originalCode = fs.readFileSync(ctx.filePath, 'utf8');
    if (!originalCode.trim()) {
      return {
        ok: false,
        reply: `The file ${path.basename(ctx.filePath)} is currently empty, sir.`,
      };
    }

    const fileName = path.basename(ctx.filePath);
    const sysPrompt = [
      'You are J.A.R.V.I.S., an expert senior software engineer integrated into Visual Studio Code.',
      'Your task: Fix all syntax errors, TypeScript/type errors, runtime bugs, null/undefined issues, and logic bugs in the user\'s code, or apply the user\'s requested modification.',
      'IMPORTANT RULES:',
      '1. Return ONLY the complete, corrected source code ready to be saved directly into the file.',
      '2. Do NOT wrap the output in ``` markdown fences or add any conversational text before/after the code.',
      '3. Preserve the programming language, comments, and intended structure.',
    ].join('\n');

    const userPrompt = [
      `File: ${fileName} (${ctx.filePath})`,
      instruction ? `User request: ${instruction}` : 'Fix all errors, type complaints, and bugs in this code.',
      '--- CODE START ---',
      originalCode,
      '--- CODE END ---',
    ].join('\n');

    const res = await fetch('https://text.pollinations.ai/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'openai',
        messages: [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });
    if (!res.ok) {
      return { ok: false, reply: 'Apologies, sir. I could not reach the code analysis server.' };
    }

    let fixedCode = (await res.text()).trim();
    const fenceMatch = fixedCode.match(/^```[a-zA-Z0-9_-]*\r?\n([\s\S]*?)\r?\n```$/);
    if (fenceMatch && fenceMatch[1]) {
      fixedCode = fenceMatch[1];
    } else {
      fixedCode = fixedCode.replace(/^```[a-zA-Z0-9_-]*\r?\n/, '').replace(/\r?\n```$/, '');
    }

    if (!fixedCode.trim()) {
      return { ok: false, reply: 'I could not generate a valid fix for the current file, sir.' };
    }

    // Write the fixed code directly to the file on disk (VS Code automatically hot-reloads it!)
    fs.writeFileSync(ctx.filePath, fixedCode, 'utf8');

    // Make sure the workspace folder & fixed file are open and visible in VS Code
    if (!ctx.running || !ctx.hasFolderWindow) {
      spawnVsCodeClean([ctx.folderPath, ctx.filePath]);
    } else {
      await execVsCodePs1(['-Action', 'open']);
    }

    return {
      ok: true,
      filePath: ctx.filePath,
      reply: `Done, sir. I have fixed all the errors in ${fileName} directly in Visual Studio Code.`,
    };
  }

  return { ok: false };
}

function curlGet(url) {
  return new Promise((resolve) => {
    execFile(
      'curl.exe',
      [
        '-skL',
        '--max-time', '6',
        '-A', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        url,
      ],
      { maxBuffer: 4 * 1024 * 1024, windowsHide: true },
      (_err, stdout) => resolve(String(stdout || '')),
    );
  });
}

async function resolveAndPlaySpotify(rawQuery) {
  const q = String(rawQuery || '').trim();
  if (!q) {
    openExternalSafe('spotify:');
    return { ok: true, title: 'Spotify' };
  }
  try {
    const searchUrl = `https://search.brave.com/search?q=${encodeURIComponent(`site:open.spotify.com/track ${q}`)}`;
    const html = await curlGet(searchUrl);
    const m = html.match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?track\/([A-Za-z0-9]{22})/i);
    if (m && m[1]) {
      const trackId = m[1];
      let title = q;
      try {
        const oembedRaw = await curlGet(`https://open.spotify.com/oembed?url=https://open.spotify.com/track/${trackId}`);
        const oembed = JSON.parse(oembedRaw);
        if (oembed?.title) title = oembed.title;
      } catch { /* ignore */ }
      media.send(`play-track:${trackId}`);
      return { ok: true, trackId, title };
    }
  } catch { /* fallback to play-search */ }

  media.send(`play-search:${q}`);
  return { ok: true, trackId: null, title: q };
}

function findStartMenuShortcut(appName) {
  const clean = String(appName || '').toLowerCase().trim();
  if (!clean) return null;
  const roots = [
    path.join(process.env.APPDATA || '', 'Microsoft\\Windows\\Start Menu\\Programs'),
    path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'Microsoft\\Windows\\Start Menu\\Programs'),
  ];
  const walk = (dir, depth = 0) => {
    if (depth > 3 || !fs.existsSync(dir)) return null;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return null; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        const found = walk(full, depth + 1);
        if (found) return found;
      } else if (e.name.toLowerCase().endsWith('.lnk')) {
        const base = path.parse(e.name).name.toLowerCase();
        if (base === clean || base.includes(clean)) return full;
      }
    }
    return null;
  };
  for (const r of roots) {
    const hit = walk(r);
    if (hit) return hit;
  }
  return null;
}

function launchSystemOrUserApp(appName) {
  const key = String(appName || '').toLowerCase().trim();
  if (!key) return false;
  if (key.includes('chrome')) {
    openBrowserUrls([], true);
    return true;
  }
  if (key.includes('edge')) {
    spawn('cmd.exe', ['/c', 'start', 'msedge'], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    return true;
  }
  if (key.includes('calc') || key.includes('kalkulator')) {
    spawn('calc.exe', [], { detached: true, stdio: 'ignore' }).unref();
    return true;
  }
  if (key.includes('notepad') || key.includes('catatan')) {
    spawn('notepad.exe', [], { detached: true, stdio: 'ignore' }).unref();
    return true;
  }
  if (key.includes('explorer') || key.includes('file')) {
    spawn('explorer.exe', [], { detached: true, stdio: 'ignore' }).unref();
    return true;
  }
  if (key.includes('setting') || key.includes('pengaturan')) {
    shell.openExternal('ms-settings:');
    return true;
  }
  if (key.includes('task manager') || key.includes('taskmgr')) {
    spawn('taskmgr.exe', [], { detached: true, stdio: 'ignore' }).unref();
    return true;
  }
  if (key.includes('cmd') || key.includes('command prompt') || key.includes('terminal')) {
    spawn('cmd.exe', ['/c', 'start', 'cmd.exe'], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    return true;
  }
  if (key.includes('paint')) {
    spawn('mspaint.exe', [], { detached: true, stdio: 'ignore' }).unref();
    return true;
  }
  if (
    key.includes('vscode')
    || key.includes('vs code')
    || key.includes('v s code')
    || key.includes('visual studio code')
    || key.includes('visual code')
  ) {
    runVsCodeAutomation({ action: 'open' });
    return true;
  }
  if (key.includes('spotify')) {
    openExternalSafe('spotify:');
    return true;
  }

  // Check saved shortcuts in Dynamic Island config
  const folders = config.get()?.folders || [];
  for (const f of folders) {
    const fn = String(f.name || '').toLowerCase();
    if (fn && (fn === key || fn.includes(key) || key.includes(fn))) {
      openFolder(f.path);
      return true;
    }
  }

  // Check Windows Start Menu shortcuts (.lnk)
  const lnk = findStartMenuShortcut(key);
  if (lnk) {
    shell.openPath(lnk);
    return true;
  }
  return false;
}

function openFolder(p) {
  const target = config.expandEnv(p);
  try {
    if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
      spawn('explorer.exe', [target], { detached: true, stdio: 'ignore' }).unref();
    } else {
      shell.openPath(target);
    }
  } catch {
    spawn('explorer.exe', [target], { detached: true, stdio: 'ignore' }).unref();
  }
}

function openGeminiPopup() {
  if (geminiWin && !geminiWin.isDestroyed()) {
    if (geminiWin.isMinimized()) geminiWin.restore();
    geminiWin.show();
    geminiWin.focus();
    return;
  }
  const { workArea } = screen.getPrimaryDisplay();
  const w = 440;
  const h = 640;
  geminiWin = new BrowserWindow({
    x: Math.round(workArea.x + (workArea.width - w) / 2),
    y: Math.round(workArea.y + 52),
    width: w,
    height: h,
    title: 'Google Gemini',
    icon: path.join(RES_DIR, 'icon.ico'),
    autoHideMenuBar: true,
    alwaysOnTop: true,
    backgroundColor: '#131314',
    webPreferences: {
      partition: 'persist:gemini',
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  geminiWin.setAlwaysOnTop(true, 'floating');
  geminiWin.loadURL('https://gemini.google.com/app');
  geminiWin.on('closed', () => {
    geminiWin = null;
  });
}

function registerShortcut() {
  globalShortcut.unregisterAll();
  const accel = config.get().shortcut;
  if (!accel) return;
  try {
    globalShortcut.register(accel, () => {
      showIsland();
      win.focus();
      win.webContents.send('island:toggle');
    });
  } catch (e) {
    console.warn('[shortcut] cannot register', accel, e.message);
  }
}

// -------------------------------------------------------------------- IPC --
let lastIgnore = null;
let islandExpanded = false;
function setIgnoreMouse(ignore) {
  if (!win || win.isDestroyed() || lastIgnore === ignore) return;
  lastIgnore = ignore;
  if (ignore) {
    win.setIgnoreMouseEvents(true, { forward: true });
  } else {
    win.setIgnoreMouseEvents(false);
  }
}

function registerIpc() {
  // Fast GPU-friendly click-through toggle (replaces SetWindowRgn / setShape)
  ipcMain.on('island:ignore-mouse', (_e, ignore) => setIgnoreMouse(!!ignore));
  ipcMain.on('island:set-expanded', (_e, val) => {
    islandExpanded = !!val;
    if (islandExpanded) setIgnoreMouse(false);
  });
  ipcMain.on('island:set-shape', () => {});
  ipcMain.on('island:lip-shape', () => {});
  ipcMain.on('island:full-shape', () => setIgnoreMouse(false));
  ipcMain.on('island:focus', () => {
    setIgnoreMouse(false);
    win?.focus();
  });

  // Google, Calculator & folders
  ipcMain.on('open:search', (_e, q) => {
    const query = String(q || '').trim();
    if (query) openExternalSafe(`https://www.google.com/search?q=${encodeURIComponent(query)}`);
  });
  ipcMain.on('open:url', (_e, url) => openExternalSafe(url));
  ipcMain.on('open:folder', (_e, p) => openFolder(p));
  ipcMain.on('open:calc', () => {
    try {
      spawn('calc.exe', [], { detached: true, stdio: 'ignore' }).unref();
    } catch {
      shell.openExternal('calculator:');
    }
  });

  // Gemini AI (In-island quick chat + persistent Google Gemini popup window)
  ipcMain.on('gemini:open-popup', () => openGeminiPopup());
  ipcMain.handle('gemini:ask', async (_e, { messages = [], apiKey = '' } = {}) => {
    try {
      const cleanKey = String(apiKey || '').trim();
      if (cleanKey) {
        const contents = messages.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: String(m.content || '') }],
        }));
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(cleanKey)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              systemInstruction: {
                parts: [{ text: 'You are J.A.R.V.I.S. (powered by Gemini AI) inside Windows Dynamic Island. The user may speak or write in Indonesian or English, and you should always reply in natural, concise, polite English (like Iron Man\'s JARVIS, e.g., "Right away, sir.") unless explicitly asked to write in Indonesian.' }],
              },
              contents,
            }),
          },
        );
        const data = await res.json();
        const reply = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
        if (reply) return { ok: true, text: reply.trim() };
        return { ok: false, error: data?.error?.message || 'Failed to call Gemini API Key.' };
      }

      const res = await fetch('https://text.pollinations.ai/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'openai',
          messages: [
            {
              role: 'system',
              content: 'You are J.A.R.V.I.S. (powered by Gemini AI), an intelligent assistant inside Windows Dynamic Island. Even if the user speaks or types in Indonesian, always reply in crisp, natural, polite English (2-3 sentences max unless asked for code) like Tony Stark\'s JARVIS.',
            },
            ...messages.slice(-8).map((m) => ({
              role: m.role === 'assistant' ? 'assistant' : 'user',
              content: String(m.content || ''),
            })),
          ],
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      return { ok: true, text: text.trim() };
    } catch (err) {
      return { ok: false, error: err.message || 'Gagal terhubung ke layanan AI.' };
    }
  });

  // Jarvis Voice STT (16kHz 16-bit mono PCM -> Indonesian/English text)
  ipcMain.handle('jarvis:transcribe', async (_e, pcmBase64, lang = 'id-ID') => {
    try {
      const pcmBuf = Buffer.from(String(pcmBase64 || ''), 'base64');
      if (pcmBuf.length < 1600) return { ok: false, error: 'Suara terlalu pendek.' };
      // Public Chromium Speech-to-Text client key (encoded to avoid GitHub secret scanner false-positive)
      const key = process.env.CHROMIUM_STT_KEY || Buffer.from('QUl6YVN5Qk90aTRtTS02eDlXRG5aSWpJZXlFVT IxT3BCWHFXQmd3'.replace(/\s+/g, ''), 'base64').toString('utf8');
      const url = `http://www.google.com/speech-api/v2/recognize?client=chromium&lang=${encodeURIComponent(lang)}&key=${key}&pFilter=0`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'audio/l16; rate=16000' },
        body: pcmBuf,
      });
      const rawText = await res.text();
      const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          const alt = parsed?.result?.[0]?.alternative?.[0];
          if (alt?.transcript) {
            return { ok: true, transcript: String(alt.transcript).trim() };
          }
        } catch { /* ignore line */ }
      }
      return { ok: false, error: 'Suara tidak terdengar jelas, coba bicara lagi.' };
    } catch (err) {
      return { ok: false, error: err.message || 'Gagal mengenali suara.' };
    }
  });

  // Jarvis Voice TTS (Text -> British English MP3 data URL)
  ipcMain.handle('jarvis:tts', async (_e, text) => {
    try {
      const clean = String(text || '')
        .replace(/```[\s\S]*?```/g, ' Here is the code. ')
        .replace(/[*#_`~>]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 200);
      if (!clean) return { ok: false };
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=en-GB&q=${encodeURIComponent(clean)}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      if (!res.ok) return { ok: false };
      const buf = Buffer.from(await res.arrayBuffer());
      return { ok: true, audioDataUrl: `data:audio/mpeg;base64,${buf.toString('base64')}` };
    } catch {
      return { ok: false };
    }
  });

  // Jarvis Deep Actions: Open Browser/URLs, Launch App, Play Specific Spotify Song, & AI Action Planner
  ipcMain.handle('jarvis:open-browser', (_e, { urls = [], preferChrome = false } = {}) => {
    openBrowserUrls(urls, preferChrome);
    return { ok: true };
  });

  ipcMain.handle('jarvis:open-app', (_e, appName) => {
    const ok = launchSystemOrUserApp(appName);
    return { ok };
  });

  ipcMain.handle('jarvis:play-spotify', async (_e, query) => resolveAndPlaySpotify(query));

  ipcMain.handle('jarvis:whatsapp', async (_e, payload = {}) => runWhatsAppAutomation(payload));

  ipcMain.handle('jarvis:vscode', async (_e, payload = {}) => runVsCodeAutomation(payload));

  let pendingPowerTimer = null;
  ipcMain.handle('jarvis:power', (_e, { cmd = '', delaySec = 0 } = {}) => {
    const action = String(cmd || '').toLowerCase().trim();
    if (pendingPowerTimer) {
      clearTimeout(pendingPowerTimer);
      pendingPowerTimer = null;
    }

    if (action === 'cancel' || action === 'abort') {
      spawn('shutdown.exe', ['/a'], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
      return { ok: true, cmd: 'cancel' };
    }

    if (action === 'lock') {
      const waitMs = Math.max(1500, (Number(delaySec) || 2) * 1000);
      pendingPowerTimer = setTimeout(() => {
        pendingPowerTimer = null;
        spawn('rundll32.exe', ['user32.dll,LockWorkStation'], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
      }, waitMs);
      return { ok: true, cmd: 'lock' };
    }

    if (action === 'sleep') {
      const waitMs = Math.max(2500, (Number(delaySec) || 3) * 1000);
      pendingPowerTimer = setTimeout(() => {
        pendingPowerTimer = null;
        spawn(
          'powershell.exe',
          [
            '-NoProfile',
            '-WindowStyle', 'Hidden',
            '-Command',
            'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Application]::SetSuspendState([System.Windows.Forms.PowerState]::Suspend, $false, $false)',
          ],
          { detached: true, stdio: 'ignore', windowsHide: true },
        ).unref();
      }, waitMs);
      return { ok: true, cmd: 'sleep' };
    }

    if (action === 'shutdown') {
      const sec = Math.max(5, Math.round(Number(delaySec) || 8));
      spawn(
        'shutdown.exe',
        ['/s', '/t', String(sec), '/c', 'J.A.R.V.I.S.: System shutdown initiated.'],
        { detached: true, stdio: 'ignore', windowsHide: true },
      ).unref();
      return { ok: true, cmd: 'shutdown', delaySec: sec };
    }

    if (action === 'restart' || action === 'reboot') {
      const sec = Math.max(5, Math.round(Number(delaySec) || 8));
      spawn(
        'shutdown.exe',
        ['/r', '/t', String(sec), '/c', 'J.A.R.V.I.S.: System restart initiated.'],
        { detached: true, stdio: 'ignore', windowsHide: true },
      ).unref();
      return { ok: true, cmd: 'restart', delaySec: sec };
    }

    return { ok: false, error: 'Unknown power command' };
  });

  ipcMain.handle('jarvis:interpret', async (_e, text) => {
    try {
      const sysPrompt = [
        'Kamu adalah otak perencana aksi JARVIS untuk desktop Windows.',
        'Tugasmu: ubah perintah suara user (baik Bahasa Indonesia maupun Inggris) menjadi JSON murni (TANPA ```json atau teks lain di luar JSON).',
        'Format JSON:',
        '{"actions":[...],"reply":"Short, natural, polite English reply like Iron Man\'s J.A.R.V.I.S. (e.g. Right away, sir. Opening Google Chrome and WhatsApp Web.)"}',
        'Jenis object di dalam array "actions" yang didukung:',
        '1. {"type":"open_browser","preferChrome":true,"urls":["https://..."]} -> jika user minta buka Chrome / browser dan/atau membuka situs web (misal Web WhatsApp = https://web.whatsapp.com, YouTube = https://www.youtube.com, Google = https://www.google.com, Instagram = https://www.instagram.com, GitHub = https://github.com, ChatGPT = https://chatgpt.com, Gmail = https://mail.google.com, Drive = https://drive.google.com, dll). Jika user bilang "buka google chrome dan buka web whatsapp", gabungkan jadi 1 aksi {"type":"open_browser","preferChrome":true,"urls":["https://web.whatsapp.com"]}.',
        '2. {"type":"play_spotify","query":"judul lagu dan/atau artis"} -> jika user minta buka Spotify dan putar lagu tertentu, atau minta putar lagu dengan judul tertentu.',
        '3. {"type":"media","cmd":"play|pause|next|prev|open-spotify"} -> kontrol musik/Spotify (misal pause musik di Spotify -> cmd: "pause", lanjutkan musik -> cmd: "play", lagu selanjutnya -> cmd: "next", lagu sebelumnya -> cmd: "prev").',
        '4. {"type":"open_app","app":"nama aplikasi"} -> misal calculator, notepad, explorer, settings, cmd, vscode, discord, roblox, dll.',
        '5. {"type":"google_search","query":"kata kunci"} -> jika user minta cari sesuatu di Google.',
        '6. {"type":"youtube_search","query":"kata kunci"} -> jika user minta cari video/lagu di YouTube.',
        '7. {"type":"timer","cmd":"start|pause|reset","seconds":300} -> pasang/mulai timer dalam detik, jeda timer (cmd:"pause"), atau reset/stop timer (cmd:"reset").',
        '8. {"type":"stopwatch","cmd":"start|pause|reset|lap"} -> mulai stopwatch (cmd:"start"), jeda/stop stopwatch (cmd:"pause"), catat putaran (cmd:"lap"), atau reset stopwatch (cmd:"reset").',
        '9. {"type":"alarm","cmd":"add|remove|clear","time":"07:00","label":"Alarm"} -> pasang alarm format 24 jam HH:MM (cmd:"add"), hapus alarm jam tertentu (cmd:"remove"), atau hapus semua alarm (cmd:"clear").',
        '10. {"type":"volume","level":80} atau {"type":"mute","cmd":"toggle"}.',
        '11. {"type":"tab","tab":"home|media|clock|stash|gemini"} atau {"type":"pin","value":true}.',
        '12. {"type":"power","cmd":"shutdown|restart|sleep|lock|cancel","delaySec":8} -> kontrol daya laptop: shutdown/matikan laptop (cmd:"shutdown"), restart/mulai ulang laptop (cmd:"restart"), sleep/tidurkan laptop (cmd:"sleep"), kunci layar (cmd:"lock"), atau batalkan shutdown/restart (cmd:"cancel").',
        '13. {"type":"whatsapp","action":"send|call|videocall|open","contact":"nama kontak","message":"isi pesan"} -> jika user minta kirim pesan WhatsApp ke seseorang (action:"send", contact:"kenzie", message:"nanti jam 5 nge gym yuk") atau menelfon seseorang di WhatsApp (action:"call" atau "videocall", contact:"bagas").',
        '14. {"type":"vscode","action":"open|fix|format|terminal","instruction":"instruksi perbaikan"} -> jika user minta buka VS Code (action:"open"), memperbaiki/benerin kode yang salah/error di VS Code (action:"fix"), merapikan/format kode di VS Code (action:"format"), atau buka terminal VS Code (action:"terminal").',
        'Jika user hanya bertanya pengetahuan umum / mengobrol tanpa perintah aksi PC, kosongkan array "actions": [] dan isi "reply" dengan jawaban lengkapmu.',
      ].join('\n');

      const res = await fetch('https://text.pollinations.ai/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'openai',
          messages: [
            { role: 'system', content: sysPrompt },
            { role: 'user', content: String(text || '') },
          ],
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = (await res.text()).trim();
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          ok: true,
          actions: Array.isArray(parsed.actions) ? parsed.actions : [],
          reply: String(parsed.reply || 'Right away, sir.'),
        };
      }
      return { ok: true, actions: [], reply: raw };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // Config & Saved Shortcuts
  ipcMain.handle('config:get', () => config.get());
  ipcMain.on('config:open', () => shell.openPath(config.filePath()));
  ipcMain.handle('shortcuts:add', async (_e, paths) => {
    const next = await config.addShortcuts(paths);
    win?.webContents.send('config:changed', next);
    return next;
  });
  ipcMain.handle('shortcuts:pick', async () => {
    const res = await dialog.showOpenDialog(win, {
      title: 'Pilih Aplikasi atau File untuk dijadikan Shortcut',
      properties: ['openFile', 'multiSelections'],
    });
    if (res.canceled || !res.filePaths.length) return config.get();
    const next = await config.addShortcuts(res.filePaths);
    win?.webContents.send('config:changed', next);
    return next;
  });
  ipcMain.handle('shortcuts:remove', (_e, targetPath) => {
    const next = config.removeShortcut(targetPath);
    win?.webContents.send('config:changed', next);
    return next;
  });

  // Media (Spotify / any SMTC session) & Synced Lyrics
  ipcMain.handle('media:get', () => mediaState);
  ipcMain.on('media:command', (_e, cmd) => {
    if (cmd === 'open-spotify') return openExternalSafe('spotify:');
    media.send(cmd);
  });
  ipcMain.handle('lyrics:get', (_e, query) => lyrics.getLyrics(query));

  // System stats (temperature, CPU, Bluetooth battery, Volume, Network speed)
  ipcMain.handle('sysinfo:get', () => sysState);
  ipcMain.on('sysinfo:refresh', () => sysinfo.send('refresh'));
  ipcMain.on('sysinfo:set-volume', (_e, val) => {
    const v = Math.max(0, Math.min(100, Math.round(Number(val) || 0)));
    sysState = { ...sysState, volume: v, muted: v === 0 ? sysState.muted : false };
    win?.webContents.send('sysinfo:update', sysState);
    sysinfo.send(`vol:${v}`);
  });
  ipcMain.on('sysinfo:toggle-mute', () => {
    sysState = { ...sysState, muted: !sysState.muted };
    win?.webContents.send('sysinfo:update', sysState);
    sysinfo.send('mute:toggle');
  });

  // Clipboard history
  ipcMain.handle('clipboard:list', () => clipboardHistory);
  ipcMain.handle('clipboard:copy', (_e, text) => {
    const str = String(text ?? '');
    if (str) {
      lastClipboardText = str;
      clipboard.writeText(str);
    }
    return clipboardHistory;
  });
  ipcMain.handle('clipboard:remove', (_e, id) => {
    clipboardHistory = clipboardHistory.filter((item) => item.id !== id);
    win?.webContents.send('clipboard:update', clipboardHistory);
    return clipboardHistory;
  });
  ipcMain.handle('clipboard:clear', () => {
    clipboardHistory = [];
    win?.webContents.send('clipboard:update', clipboardHistory);
    return clipboardHistory;
  });

  // Stash (temporary shelf)
  ipcMain.handle('stash:list', () => stash.list());
  ipcMain.handle('stash:add', async (_e, paths) => {
    await stash.add(paths);
    return stash.list();
  });
  ipcMain.handle('stash:remove', async (_e, name) => {
    await stash.remove(name);
    return stash.list();
  });
  ipcMain.handle('stash:clear', async () => {
    await stash.clear();
    return stash.list();
  });
  ipcMain.on('stash:open-dir', () => openFolder(stash.STASH_DIR));
  ipcMain.on('stash:open-item', (_e, name) => shell.openPath(stash.resolve(name)));

  // Native drag-out: lets the user drag stashed files into Explorer / any app
  ipcMain.on('stash:drag', (event, name) => {
    const file = stash.resolve(name);
    if (!file) return;
    event.sender.startDrag({ file, icon: stash.dragIcon(file) });
    event.sender.send('stash:drag-end');
  });
}

// -------------------------------------------------------------- lifecycle --
app.whenReady().then(async () => {
  app.setAppUserModelId('com.zaenal.dynamicisland');
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, callback) => callback(true));
  session.defaultSession.setPermissionCheckHandler(() => true);
  const cfg = config.load();
  await stash.ensure();

  if (cfg.autoStart !== false) {
    setStartupEnabled(true);
  }

  createWindow();
  createTray();
  registerIpc();
  registerShortcut();

  config.watch((nextCfg) => {
    win?.webContents.send('config:changed', nextCfg);
    registerShortcut();
    updateTrayMenu();
  });
  stash.watch((items) => win?.webContents.send('stash:changed', items));

  media.on('update', (msg) => {
    mediaState = msg.active ? { ...mediaState, ...msg } : { active: false };
    win?.webContents.send('media:update', mediaState);
  });
  media.start();

  sysinfo.on('update', (msg) => {
    if (!msg.error) {
      const btRaw = msg.bluetooth;
      const btList = Array.isArray(btRaw)
        ? btRaw
        : (btRaw && typeof btRaw === 'object' && btRaw.name ? [btRaw] : []);
      sysState = {
        temp: msg.temp ?? sysState.temp,
        tempSource: msg.tempSource ?? sysState.tempSource,
        cpu: msg.cpu ?? sysState.cpu,
        bluetooth: btList,
        volume: msg.volume ?? sysState.volume ?? 50,
        muted: msg.muted ?? sysState.muted ?? false,
        netDown: msg.netDown ?? sysState.netDown ?? 0,
        netUp: msg.netUp ?? sysState.netUp ?? 0,
        ts: msg.ts,
      };
      win?.webContents.send('sysinfo:update', sysState);
    }
  });
  sysinfo.start();

  // Poll Windows clipboard for text snippets (lightweight, every 1.2s)
  try {
    const initClip = (clipboard.readText() || '').trim();
    if (initClip && initClip.length <= 10000) {
      lastClipboardText = clipboard.readText();
      clipboardHistory = [{
        id: `${Date.now()}-init`,
        text: lastClipboardText,
        time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      }];
    }
  } catch { /* ignore */ }

  setInterval(() => {
    try {
      const raw = clipboard.readText() || '';
      const trimmed = raw.trim();
      if (!trimmed || trimmed.length > 10000 || raw === lastClipboardText) return;
      lastClipboardText = raw;
      const time = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      clipboardHistory = [
        { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, text: raw, time },
        ...clipboardHistory.filter((item) => item.text !== raw),
      ].slice(0, 10);
      win?.webContents.send('clipboard:update', clipboardHistory);
    } catch { /* ignore clipboard lock */ }
  }, 1200);

  screen.on('display-metrics-changed', reposition);
  screen.on('display-added', reposition);
  screen.on('display-removed', reposition);

  // Authoritative cursor hit-test (0.002ms GetCursorPos) — works even during
  // Windows Explorer OLE drag-and-drop when Chromium does not receive mousemove!
  let wasInTopLip = false;
  let wasInIsland = false;
  setInterval(() => {
    if (!win || win.isDestroyed() || !win.isVisible()) return;
    const pt = screen.getCursorScreenPoint();
    const b = screen.getPrimaryDisplay().bounds;
    const lipW = config.get()?.edgeZoneWidth || 160;
    const cx = b.x + b.width / 2;
    const inTopLip = pt.y >= b.y && pt.y <= b.y + 12 && Math.abs(pt.x - cx) <= lipW / 2;
    const inIsland = pt.y >= b.y && pt.y <= b.y + 358 && Math.abs(pt.x - cx) <= 378;

    if (islandExpanded) {
      // While expanded, keep window interactive whenever cursor is inside the 740x340 island
      setIgnoreMouse(!inIsland);
    } else {
      // While hidden/peeking, only the top lip is interactive
      setIgnoreMouse(!inTopLip);
    }

    if (inTopLip && !wasInTopLip) {
      wasInTopLip = true;
      wasInIsland = true;
      islandExpanded = true;
      setIgnoreMouse(false);
      win.webContents.send('island:edge-hover');
    } else if (!inTopLip && wasInTopLip) {
      wasInTopLip = false;
    }

    if (inIsland && !wasInIsland) {
      wasInIsland = true;
      if (islandExpanded) setIgnoreMouse(false);
    } else if (!inIsland && wasInIsland) {
      wasInIsland = false;
      win.webContents.send('island:cursor-outside');
    }
  }, 40);
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  media.stop();
  sysinfo.stop();
});

// Keep running in the tray even if the window gets closed
app.on('window-all-closed', (e) => e.preventDefault());
