// Sandboxed preload: exposes a minimal, typed-ish API as window.island
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const on = (channel, cb) => {
  const listener = (_e, data) => cb(data);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

// Capture native File paths directly in the preload world on drop before contextBridge
// touches FileList (since FileList is not a plain Array across contextBridge).
let lastDroppedPaths = [];

function extractFilePaths(filesOrPaths) {
  const out = [];
  if (filesOrPaths) {
    try {
      const len = filesOrPaths.length ?? 0;
      for (let i = 0; i < len; i += 1) {
        const item = filesOrPaths[i];
        if (!item) continue;
        if (typeof item === 'string') {
          out.push(item);
        } else {
          try {
            const p = webUtils.getPathForFile(item);
            if (p) out.push(p);
          } catch {
            if (item.path) out.push(item.path);
          }
        }
      }
    } catch { /* ignore */ }
  }
  if (out.length === 0 && lastDroppedPaths.length > 0) {
    out.push(...lastDroppedPaths);
  }
  lastDroppedPaths = [];
  return Array.from(new Set(out.filter(Boolean)));
}

window.addEventListener('dragover', (e) => {
  e.preventDefault();
}, true);

window.addEventListener('drop', (e) => {
  try {
    const dtFiles = e.dataTransfer?.files;
    if (dtFiles && dtFiles.length > 0) {
      const paths = [];
      for (let i = 0; i < dtFiles.length; i += 1) {
        try {
          const p = webUtils.getPathForFile(dtFiles[i]);
          if (p) paths.push(p);
        } catch {
          if (dtFiles[i]?.path) paths.push(dtFiles[i].path);
        }
      }
      lastDroppedPaths = paths.filter(Boolean);
    }
  } catch { /* ignore */ }
}, true);

contextBridge.exposeInMainWorld('island', {
  // window
  setIgnoreMouse: (ignore) => ipcRenderer.send('island:ignore-mouse', ignore),
  setExpanded: (val) => ipcRenderer.send('island:set-expanded', val),
  setShape: (rects) => ipcRenderer.send('island:set-shape', rects),
  lipShape: (width) => ipcRenderer.send('island:lip-shape', width),
  fullShape: () => ipcRenderer.send('island:full-shape'),
  focus: () => ipcRenderer.send('island:focus'),
  onToggle: (cb) => on('island:toggle', cb),
  onBlur: (cb) => on('island:blur', cb),
  onEdgeHover: (cb) => on('island:edge-hover', cb),
  onCursorOutside: (cb) => on('island:cursor-outside', cb),

  // google / calculator / folders & apps
  search: (q) => ipcRenderer.send('open:search', q),
  openUrl: (url) => ipcRenderer.send('open:url', url),
  openFolder: (p) => ipcRenderer.send('open:folder', p),
  openCalc: () => ipcRenderer.send('open:calc'),

  gemini: {
    ask: (payload) => ipcRenderer.invoke('gemini:ask', payload),
    openPopup: () => ipcRenderer.send('gemini:open-popup'),
    openWeb: () => ipcRenderer.send('open:url', 'https://gemini.google.com/app'),
  },

  jarvis: {
    transcribe: (pcmBase64, lang) => ipcRenderer.invoke('jarvis:transcribe', pcmBase64, lang),
    tts: (text) => ipcRenderer.invoke('jarvis:tts', text),
    openBrowser: (opts) => ipcRenderer.invoke('jarvis:open-browser', opts),
    openApp: (appName) => ipcRenderer.invoke('jarvis:open-app', appName),
    playSpotify: (query) => ipcRenderer.invoke('jarvis:play-spotify', query),
    whatsapp: (opts) => ipcRenderer.invoke('jarvis:whatsapp', opts),
    vscode: (opts) => ipcRenderer.invoke('jarvis:vscode', opts),
    power: (opts) => ipcRenderer.invoke('jarvis:power', opts),
    interpret: (text) => ipcRenderer.invoke('jarvis:interpret', text),
    onHotkey: (cb) => on('jarvis:hotkey', cb),
  },

  automation: {
    browser: (payload) => ipcRenderer.invoke('automation:browser', payload),
    formPrepare: (payload) => ipcRenderer.invoke('automation:form-prepare', payload),
    formSubmit: (sessionId) => ipcRenderer.invoke('automation:form-submit', sessionId),
    formCancel: (sessionId) => ipcRenderer.invoke('automation:form-cancel', sessionId),
    code: (payload) => ipcRenderer.invoke('automation:code', payload),
    extensionInfo: () => ipcRenderer.invoke('automation:extension-info'),
    onStatus: (cb) => on('automation:status', cb),
    onFormPreview: (cb) => on('automation:form-preview', cb),
    onToast: (cb) => on('automation:toast', cb),
  },

  config: {
    get: () => ipcRenderer.invoke('config:get'),
    open: () => ipcRenderer.send('config:open'),
    onChange: (cb) => on('config:changed', cb),
  },

  shortcuts: {
    add: (files) => ipcRenderer.invoke('shortcuts:add', extractFilePaths(files)),
    pick: () => ipcRenderer.invoke('shortcuts:pick'),
    remove: (targetPath) => ipcRenderer.invoke('shortcuts:remove', targetPath),
  },

  media: {
    get: () => ipcRenderer.invoke('media:get'),
    command: (cmd) => ipcRenderer.send('media:command', cmd),
    onUpdate: (cb) => on('media:update', cb),
    getLyrics: (track) => ipcRenderer.invoke('lyrics:get', track),
  },

  sysinfo: {
    get: () => ipcRenderer.invoke('sysinfo:get'),
    refresh: () => ipcRenderer.send('sysinfo:refresh'),
    setVolume: (val) => ipcRenderer.send('sysinfo:set-volume', val),
    toggleMute: () => ipcRenderer.send('sysinfo:toggle-mute'),
    onUpdate: (cb) => on('sysinfo:update', cb),
  },

  clipboard: {
    list: () => ipcRenderer.invoke('clipboard:list'),
    copy: (text) => ipcRenderer.invoke('clipboard:copy', text),
    remove: (id) => ipcRenderer.invoke('clipboard:remove', id),
    clear: () => ipcRenderer.invoke('clipboard:clear'),
    onUpdate: (cb) => on('clipboard:update', cb),
  },

  stash: {
    list: () => ipcRenderer.invoke('stash:list'),
    add: (files) => ipcRenderer.invoke('stash:add', extractFilePaths(files)),
    remove: (name) => ipcRenderer.invoke('stash:remove', name),
    clear: () => ipcRenderer.invoke('stash:clear'),
    openDir: () => ipcRenderer.send('stash:open-dir'),
    openItem: (name) => ipcRenderer.send('stash:open-item', name),
    startDrag: (name) => ipcRenderer.send('stash:drag', name),
    onDragEnd: (cb) => on('stash:drag-end', cb),
    onChange: (cb) => on('stash:changed', cb),
  },
});
