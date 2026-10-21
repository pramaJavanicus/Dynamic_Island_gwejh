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
    const args = validUrls.length ? validUrls : ['https://www.google.com'];
    spawn(chromeExe, args, { detached: true, stdio: 'ignore' }).unref();
    return;
  }
  if (validUrls.length === 0) {
    openExternalSafe('https://www.google.com');
  } else {
    for (const u of validUrls) openExternalSafe(u);
  }
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
  if (key.includes('vscode') || key.includes('visual studio code')) {
    spawn('cmd.exe', ['/c', 'code'], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
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
                parts: [{ text: 'Kamu adalah Gemini, asisten AI Google di dalam Dynamic Island Windows. Jawab dengan bahasa Indonesia yang jelas, ringkas, dan membantu.' }],
              },
              contents,
            }),
          },
        );
        const data = await res.json();
        const reply = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
        if (reply) return { ok: true, text: reply.trim() };
        return { ok: false, error: data?.error?.message || 'Gagal memanggil Gemini API Key.' };
      }

      const res = await fetch('https://text.pollinations.ai/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'openai',
          messages: [
            {
              role: 'system',
              content: 'Kamu adalah JARVIS (bertenaga Gemini AI), asisten pintar berbahasa Indonesia di dalam Dynamic Island Windows. Jawab selalu dalam Bahasa Indonesia secara ringkas (maksimal 2-3 kalimat padat kecuali diminta kode), ramah, dan cerdas.',
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
      const key = 'AIzaSyBOti4mM-6x9WDnZIjIeyEU21OpBXqWBgw';
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

  // Jarvis Voice TTS (Text -> Indonesian MP3 data URL)
  ipcMain.handle('jarvis:tts', async (_e, text) => {
    try {
      const clean = String(text || '')
        .replace(/```[\s\S]*?```/g, ' berikut kodenya. ')
        .replace(/[*#_`~>]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 200);
      if (!clean) return { ok: false };
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=id&q=${encodeURIComponent(clean)}`;
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

  ipcMain.handle('jarvis:interpret', async (_e, text) => {
    try {
      const sysPrompt = [
        'Kamu adalah otak perencana aksi JARVIS untuk desktop Windows.',
        'Tugasmu: ubah perintah suara user menjadi JSON murni (TANPA ```json atau teks lain di luar JSON).',
        'Format JSON:',
        '{"actions":[...],"reply":"Kalimat balasan singkat dan ramah ala Jarvis dalam Bahasa Indonesia"}',
        'Jenis object di dalam array "actions" yang didukung:',
        '1. {"type":"open_browser","preferChrome":true,"urls":["https://..."]} -> jika user minta buka Chrome / browser dan/atau membuka situs web (misal Web WhatsApp = https://web.whatsapp.com, YouTube = https://www.youtube.com, Google = https://www.google.com, Instagram = https://www.instagram.com, GitHub = https://github.com, ChatGPT = https://chatgpt.com, Gmail = https://mail.google.com, Drive = https://drive.google.com, dll). Jika user bilang "buka google chrome dan buka web whatsapp", gabungkan jadi 1 aksi {"type":"open_browser","preferChrome":true,"urls":["https://web.whatsapp.com"]}.',
        '2. {"type":"play_spotify","query":"judul lagu dan/atau artis"} -> jika user minta buka Spotify dan putar lagu tertentu, atau minta putar lagu dengan judul tertentu.',
        '3. {"type":"media","cmd":"play|pause|next|prev|open-spotify"} -> kontrol musik umum tanpa judul lagu spesifik.',
        '4. {"type":"open_app","app":"nama aplikasi"} -> misal calculator, notepad, explorer, settings, cmd, vscode, discord, roblox, dll.',
        '5. {"type":"google_search","query":"kata kunci"} -> jika user minta cari sesuatu di Google.',
        '6. {"type":"youtube_search","query":"kata kunci"} -> jika user minta cari video/lagu di YouTube.',
        '7. {"type":"timer","seconds":300} -> pasang timer dalam detik.',
        '8. {"type":"stopwatch","cmd":"start|reset"} -> mulai atau reset stopwatch.',
        '9. {"type":"alarm","time":"07:00","label":"Alarm"} -> pasang alarm format HH:MM.',
        '10. {"type":"volume","level":80} atau {"type":"mute","cmd":"toggle"}.',
        '11. {"type":"tab","tab":"home|media|clock|stash|gemini"} atau {"type":"pin","value":true}.',
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
          reply: String(parsed.reply || 'Siap bos, sudah dijalankan.'),
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
