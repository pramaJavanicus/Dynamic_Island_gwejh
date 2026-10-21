// Sandboxed preload: exposes a minimal, typed-ish API as window.island
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const on = (channel, cb) => {
  const listener = (_e, data) => cb(data);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

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
    power: (opts) => ipcRenderer.invoke('jarvis:power', opts),
    interpret: (text) => ipcRenderer.invoke('jarvis:interpret', text),
  },

  config: {
    get: () => ipcRenderer.invoke('config:get'),
    open: () => ipcRenderer.send('config:open'),
    onChange: (cb) => on('config:changed', cb),
  },

  shortcuts: {
    add: (files) => ipcRenderer.invoke('shortcuts:add', Array.from(files).map((f) => webUtils.getPathForFile(f)).filter(Boolean)),
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
    // File objects -> absolute paths (File.path was removed in Electron 32+)
    add: (files) => ipcRenderer.invoke('stash:add', Array.from(files).map((f) => webUtils.getPathForFile(f)).filter(Boolean)),
    remove: (name) => ipcRenderer.invoke('stash:remove', name),
    clear: () => ipcRenderer.invoke('stash:clear'),
    openDir: () => ipcRenderer.send('stash:open-dir'),
    openItem: (name) => ipcRenderer.send('stash:open-item', name),
    startDrag: (name) => ipcRenderer.send('stash:drag', name),
    onDragEnd: (cb) => on('stash:drag-end', cb),
    onChange: (cb) => on('stash:changed', cb),
  },
});
