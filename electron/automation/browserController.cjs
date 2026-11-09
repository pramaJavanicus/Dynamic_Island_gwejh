// ---------------------------------------------------------------------------
// BrowserController -- Hybrid controller for Chrome tabs:
//   1. Main Chrome profile via ExtensionBridge (WebSocket to MV3 extension)
//   2. Dedicated "Jarvis Chrome" profile via CDP (puppeteer-core on port 9333)
//
// Emits 'status' events so Dynamic Island can display a live capsule indicator
// whenever Jarvis is actively controlling the browser.
// ---------------------------------------------------------------------------
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');

const DEFAULT_CDP_PORT = 9333;
const STATUS_HOLD_MS = 1800;

function findDefaultChromeExe() {
  const candidates = [
    path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Microsoft\\Edge\\Application\\msedge.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Microsoft\\Edge\\Application\\msedge.exe'),
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return null;
}

function normalizeUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return 'https://www.google.com';
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(s) || s.startsWith('about:')) return s;
  if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(s)) return `https://${s}`;
  return `https://www.google.com/search?q=${encodeURIComponent(s)}`;
}

function parseSpokenIndex(q, total) {
  const s = String(q || '').toLowerCase().trim()
    .replace(/^(tab|jendela|halaman)\s+(nomor|ke-?|number)?\s*/i, '')
    .trim();
  if (/^(terakhir|last|ujung)$/i.test(s)) return total > 0 ? total - 1 : -1;
  if (/^(pertama|first| kesatu|satu)$/i.test(s)) return 0;
  if (/^(kedua|second|dua)$/i.test(s)) return 1;
  if (/^(ketiga|third|tiga)$/i.test(s)) return 2;
  if (/^(keempat|fourth|empat)$/i.test(s)) return 3;
  if (/^(kelima|fifth|lima)$/i.test(s)) return 4;
  if (/^\d+$/.test(s)) {
    const idx = parseInt(s, 10) - 1;
    return idx >= 0 && idx < total ? idx : -1;
  }
  return -1;
}

function matchTab(tabs, query) {
  if (!Array.isArray(tabs) || tabs.length === 0) return null;
  const q = String(query || '').trim();
  if (!q || /^(active|current|ini|aktif|sekarang|itu)$/i.test(q)) {
    return tabs.find((t) => t.active) || tabs[tabs.length - 1];
  }

  // Exact ID match
  const exactId = tabs.find((t) => String(t.id) === q);
  if (exactId) return exactId;

  // 1-based spoken or numeric index
  const idx = parseSpokenIndex(q, tabs.length);
  if (idx >= 0 && idx < tabs.length) return tabs[idx];

  // Fuzzy match on title & URL
  const needle = q.toLowerCase()
    .replace(/^(tab|website|web|halaman|situs)\s+/i, '')
    .trim();
  if (!needle) return tabs.find((t) => t.active) || tabs[0];

  let best = null;
  let bestScore = 0;
  for (const t of tabs) {
    const title = String(t.title || '').toLowerCase();
    const url = String(t.url || '').toLowerCase();
    let score = 0;
    if (title === needle) score += 100;
    else if (title.startsWith(needle)) score += 75;
    else if (title.includes(needle)) score += 55;

    if (url.includes(needle)) score += 45;

    // Multi-word partial match
    const words = needle.split(/\s+/).filter((w) => w.length >= 2);
    if (words.length > 1) {
      const matchedWords = words.filter((w) => title.includes(w) || url.includes(w));
      if (matchedWords.length === words.length) score += 50;
      else score += matchedWords.length * 15;
    }

    if (score > 0 && t.active) score += 5;
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return best;
}

class BrowserController extends EventEmitter {
  /**
   * @param {{
   *   bridge?: import('./extensionBridge.cjs').ExtensionBridge,
   *   userDataDir: string,
   *   chromePath?: string,
   *   extensionPath?: string,
   *   cdpPort?: number,
   * }} opts
   */
  constructor({ bridge = null, userDataDir, chromePath = null, extensionPath = '', cdpPort = DEFAULT_CDP_PORT }) {
    super();
    this.bridge = bridge;
    this.userDataDir = userDataDir;
    this.chromePath = chromePath || findDefaultChromeExe();
    this.extensionPath = extensionPath;
    this.cdpPort = cdpPort;
    /** @type {import('puppeteer-core').Browser|null} */
    this.cdpBrowser = null;
    this.cdpConnecting = null;
    this.statusTimer = null;
    /** @type {Map<string, import('puppeteer-core').Page>} */
    this.cdpPageMap = new Map();
    this.lastActiveCdpId = null;
  }

  _emitStatus(backend, label, detail = '') {
    clearTimeout(this.statusTimer);
    this.emit('status', {
      kind: 'browser',
      active: true,
      backend,
      label: label || (backend === 'main' ? 'Controlling Chrome' : 'Controlling Jarvis Chrome'),
      detail: String(detail || '').slice(0, 80),
    });
  }

  _scheduleIdleStatus() {
    clearTimeout(this.statusTimer);
    this.statusTimer = setTimeout(() => {
      this.emit('status', { kind: 'browser', active: false });
    }, STATUS_HOLD_MS);
    if (this.statusTimer.unref) this.statusTimer.unref();
  }

  _resolveTarget(target = 'auto') {
    if (target === 'main') {
      if (this.bridge?.isConnected()) return 'main';
      return 'jarvis';
    }
    if (target === 'jarvis') return 'jarvis';
    return this.bridge?.isConnected() ? 'main' : 'jarvis';
  }

  extensionStatus() {
    return {
      connected: !!this.bridge?.isConnected(),
      extensionPath: this.extensionPath,
    };
  }

  async _isCdpPortOpen() {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 1200);
      const res = await fetch(`http://127.0.0.1:${this.cdpPort}/json/version`, { signal: ctrl.signal });
      clearTimeout(t);
      return res.ok;
    } catch {
      return false;
    }
  }

  async getCdpBrowser() {
    if (this.cdpBrowser && this.cdpBrowser.connected) {
      return this.cdpBrowser;
    }
    if (this.cdpConnecting) return this.cdpConnecting;

    this.cdpConnecting = (async () => {
      try {
        const exe = this.chromePath || findDefaultChromeExe();
        if (!exe) throw new Error('Google Chrome executable was not found on this system');

        let ready = await this._isCdpPortOpen();
        if (!ready) {
          fs.mkdirSync(this.userDataDir, { recursive: true });
          const args = [
            `--remote-debugging-port=${this.cdpPort}`,
            `--user-data-dir=${this.userDataDir}`,
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
          ];
          const child = spawn(exe, args, {
            detached: true,
            stdio: 'ignore',
            windowsHide: false,
          });
          child.unref();

          for (let i = 0; i < 30; i += 1) {
            await new Promise((r) => setTimeout(r, 300));
            ready = await this._isCdpPortOpen();
            if (ready) break;
          }
        }

        if (!ready) {
          throw new Error(`Jarvis Chrome CDP port ${this.cdpPort} did not respond`);
        }

        const browser = await puppeteer.connect({
          browserURL: `http://127.0.0.1:${this.cdpPort}`,
          defaultViewport: null,
        });

        browser.on('disconnected', () => {
          if (this.cdpBrowser === browser) {
            this.cdpBrowser = null;
            this.cdpPageMap.clear();
          }
        });

        this.cdpBrowser = browser;
        return browser;
      } finally {
        this.cdpConnecting = null;
      }
    })();

    return this.cdpConnecting;
  }

  async _listCdpTabs() {
    const browser = await this.getCdpBrowser();
    const pages = await browser.pages();
    this.cdpPageMap.clear();
    const out = [];

    let activeId = this.lastActiveCdpId;
    for (let i = 0; i < pages.length; i += 1) {
      const p = pages[i];
      // Use target ID for stable tab identification
      const rawId = p.target()?._targetId || p.target()?._targetInfo?.targetId || `cdp-${i + 1}`;
      const id = String(rawId);
      this.cdpPageMap.set(id, p);

      let title = '';
      let isVisible = false;
      try {
        title = await p.title();
        isVisible = await p.evaluate(() => document.visibilityState === 'visible').catch(() => false);
      } catch { /* ignore */ }
      if (isVisible && !activeId) activeId = id;

      out.push({
        id,
        index: i,
        title: title || p.url() || 'New Tab',
        url: p.url() || 'about:blank',
        active: false,
        backend: 'jarvis',
      });
    }

    if (out.length > 0) {
      const chosen = out.find((t) => t.id === activeId) || out[out.length - 1];
      chosen.active = true;
      this.lastActiveCdpId = chosen.id;
    }
    return out;
  }

  async listTabs({ target = 'auto' } = {}) {
    const backend = this._resolveTarget(target);
    this._emitStatus(backend, backend === 'main' ? 'Scanning Chrome Tabs' : 'Scanning Jarvis Chrome');
    try {
      if (backend === 'main') {
        const tabs = await this.bridge.request('tabs.list');
        return Array.isArray(tabs) ? tabs : [];
      }
      return await this._listCdpTabs();
    } finally {
      this._scheduleIdleStatus();
    }
  }

  async openUrl(rawUrl, { target = 'auto', newTab = true } = {}) {
    const url = normalizeUrl(rawUrl);
    const backend = this._resolveTarget(target);
    this._emitStatus(backend, 'Opening URL', url);
    try {
      if (backend === 'main') {
        return await this.bridge.request('tabs.open', { url, newTab });
      }
      const browser = await this.getCdpBrowser();
      const pages = await browser.pages();
      let page = null;
      if (!newTab && pages.length > 0) {
        page = pages[pages.length - 1];
      } else if (pages.length === 1 && (pages[0].url() === 'about:blank' || pages[0].url().startsWith('chrome://newtab'))) {
        page = pages[0];
      } else {
        page = await browser.newPage();
      }
      await page.bringToFront().catch(() => {});
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
      const tabs = await this._listCdpTabs();
      const id = String(page.target()?._targetId || page.target()?._targetInfo?.targetId || '');
      const found = tabs.find((t) => t.id === id) || tabs[tabs.length - 1];
      if (found) {
        this.lastActiveCdpId = found.id;
        found.active = true;
      }
      return found || { id: id || 'cdp-1', title: await page.title().catch(() => url), url: page.url(), active: true, backend: 'jarvis' };
    } finally {
      this._scheduleIdleStatus();
    }
  }

  async findTab(query, { target = 'auto' } = {}) {
    const tabs = await this.listTabs({ target });
    return matchTab(tabs, query);
  }

  async switchTab(query, { target = 'auto' } = {}) {
    const backend = this._resolveTarget(target);
    this._emitStatus(backend, 'Switching Tab', query);
    try {
      const tabs = backend === 'main'
        ? await this.bridge.request('tabs.list')
        : await this._listCdpTabs();
      const hit = matchTab(tabs, query);
      if (!hit) return null;

      if (backend === 'main') {
        return await this.bridge.request('tabs.activate', { tabId: Number(hit.id) });
      }
      const page = this.cdpPageMap.get(hit.id);
      if (!page) return null;
      await page.bringToFront();
      this.lastActiveCdpId = hit.id;
      return { ...hit, active: true };
    } finally {
      this._scheduleIdleStatus();
    }
  }

  async closeTab(query = 'active', { target = 'auto' } = {}) {
    const backend = this._resolveTarget(target);
    this._emitStatus(backend, 'Closing Tab', query);
    try {
      const tabs = backend === 'main'
        ? await this.bridge.request('tabs.list')
        : await this._listCdpTabs();
      const hit = matchTab(tabs, query);
      if (!hit) return null;

      if (backend === 'main') {
        await this.bridge.request('tabs.close', { tabId: Number(hit.id) });
        return hit;
      }
      const page = this.cdpPageMap.get(hit.id);
      if (!page) return null;
      await page.close().catch(() => {});
      this.cdpPageMap.delete(hit.id);
      if (this.lastActiveCdpId === hit.id) this.lastActiveCdpId = null;
      return hit;
    } finally {
      this._scheduleIdleStatus();
    }
  }

  async reloadTab(query = 'active', { target = 'auto' } = {}) {
    const backend = this._resolveTarget(target);
    this._emitStatus(backend, 'Reloading Tab', query);
    try {
      const tabs = backend === 'main'
        ? await this.bridge.request('tabs.list')
        : await this._listCdpTabs();
      const hit = matchTab(tabs, query);
      if (!hit) return null;

      if (backend === 'main') {
        return await this.bridge.request('tabs.reload', { tabId: Number(hit.id) });
      }
      const page = this.cdpPageMap.get(hit.id);
      if (!page) return null;
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
      return { ...hit, title: await page.title().catch(() => hit.title), url: page.url() };
    } finally {
      this._scheduleIdleStatus();
    }
  }

  async readActivePage({ target = 'auto', query = '', maxChars = 12000 } = {}) {
    const backend = this._resolveTarget(target);
    this._emitStatus(backend, 'Reading Active Web Page', query);
    try {
      if (backend === 'main') {
        let tabId = null;
        if (query) {
          const tabs = await this.bridge.request('tabs.list');
          const hit = matchTab(tabs, query);
          if (hit) tabId = Number(hit.id);
        }
        return await this.bridge.request('page.read', { tabId, maxChars });
      }

      const tabs = await this._listCdpTabs();
      const hit = matchTab(tabs, query || 'active');
      if (!hit) throw new Error('No browser tab is currently open');
      const page = this.cdpPageMap.get(hit.id);
      if (!page) throw new Error('Could not access the target tab');

      const data = await page.evaluate((limit) => {
        const title = document.title || '';
        const href = location.href || '';
        const mainEl = document.querySelector('main, article, [role="main"]') || document.body;
        const rawText = (mainEl?.innerText || document.body?.innerText || '')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
        return {
          title,
          url: href,
          text: rawText.slice(0, limit),
        };
      }, Math.max(500, Math.min(40000, Number(maxChars) || 12000)));

      return { ...data, backend: 'jarvis' };
    } finally {
      this._scheduleIdleStatus();
    }
  }

  async dispose() {
    clearTimeout(this.statusTimer);
    if (this.cdpBrowser) {
      try { this.cdpBrowser.disconnect(); } catch { /* ignore */ }
      this.cdpBrowser = null;
    }
    this.cdpPageMap.clear();
  }
}

module.exports = { BrowserController, findDefaultChromeExe, matchTab, normalizeUrl };
