// ---------------------------------------------------------------------------
// J.A.R.V.I.S. Dynamic Island Bridge -- Chrome MV3 Background Service Worker
// Connects to ws://127.0.0.1:47321 to allow Jarvis to list, switch, open,
// reload, close, and read tabs in your main Chrome profile.
// ---------------------------------------------------------------------------
const WS_URL = 'ws://127.0.0.1:47321';
const ALARM_NAME = 'jarvis-bridge-keepalive';

let ws = null;
let reconnectTimer = null;
let retryCount = 0;

function scheduleReconnect() {
  if (reconnectTimer) return;
  const delay = Math.min(15000, 1000 * Math.pow(1.6, Math.min(retryCount, 6)));
  retryCount += 1;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }
  try {
    const socket = new WebSocket(WS_URL);
    ws = socket;

    socket.onopen = () => {
      retryCount = 0;
      try {
        socket.send(JSON.stringify({ type: 'hello', agent: 'chrome-mv3', ts: Date.now() }));
      } catch { /* ignore */ }
    };

    socket.onmessage = async (event) => {
      let msg;
      try { msg = JSON.parse(String(event.data || '')); } catch { return; }
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'keepalive' || msg.type === 'pong') return;
      if (msg.id == null || !msg.method) return;

      try {
        const result = await handleRpc(msg.method, msg.params || {});
        socket.send(JSON.stringify({ id: msg.id, result }));
      } catch (err) {
        socket.send(JSON.stringify({
          id: msg.id,
          error: { message: err?.message || String(err) },
        }));
      }
    };

    socket.onclose = () => {
      if (ws === socket) ws = null;
      scheduleReconnect();
    };

    socket.onerror = () => {
      try { socket.close(); } catch { /* ignore */ }
    };
  } catch {
    scheduleReconnect();
  }
}

async function formatTab(t) {
  return {
    id: String(t.id),
    windowId: t.windowId,
    index: t.index,
    title: t.title || '',
    url: t.url || t.pendingUrl || '',
    active: !!t.active,
     audible: !!t.audible,
    backend: 'main',
  };
}

async function handleRpc(method, params) {
  switch (method) {
    case 'tabs.list': {
      const tabs = await chrome.tabs.query({});
      const out = [];
      for (const t of tabs) out.push(await formatTab(t));
      return out;
    }

    case 'tabs.open': {
      const url = String(params.url || 'https://www.google.com');
      const newTab = params.newTab !== false;
      if (!newTab) {
        const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (active?.id != null) {
          const updated = await chrome.tabs.update(active.id, { url, active: true });
          if (updated?.windowId != null) {
            await chrome.windows.update(updated.windowId, { focused: true }).catch(() => {});
          }
          return formatTab(updated);
        }
      }
      const created = await chrome.tabs.create({ url, active: true });
      if (created?.windowId != null) {
        await chrome.windows.update(created.windowId, { focused: true }).catch(() => {});
      }
      return formatTab(created);
    }

    case 'tabs.activate': {
      const tabId = Number(params.tabId);
      if (!Number.isFinite(tabId)) throw new Error('Invalid tabId');
      const updated = await chrome.tabs.update(tabId, { active: true });
      if (updated?.windowId != null) {
        await chrome.windows.update(updated.windowId, { focused: true }).catch(() => {});
      }
      return formatTab(updated);
    }

    case 'tabs.close': {
      const tabId = Number(params.tabId);
      if (!Number.isFinite(tabId)) throw new Error('Invalid tabId');
      const tab = await chrome.tabs.get(tabId).catch(() => null);
      await chrome.tabs.remove(tabId);
      return tab ? formatTab(tab) : { id: String(tabId), backend: 'main' };
    }

    case 'tabs.reload': {
      let tabId = params.tabId != null ? Number(params.tabId) : null;
      if (!Number.isFinite(tabId)) {
        const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        tabId = active?.id;
      }
      if (!Number.isFinite(tabId)) throw new Error('No active tab to reload');
      await chrome.tabs.reload(tabId);
      const tab = await chrome.tabs.get(tabId).catch(() => ({ id: tabId }));
      return formatTab(tab);
    }

    case 'page.read': {
      let tabId = params.tabId != null ? Number(params.tabId) : null;
      let targetTab = null;
      if (Number.isFinite(tabId)) {
        targetTab = await chrome.tabs.get(tabId).catch(() => null);
      }
      if (!targetTab) {
        const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        targetTab = active || (await chrome.tabs.query({ active: true }))[0];
      }
      if (!targetTab || targetTab.id == null) {
        throw new Error('Tidak ada tab aktif yang dapat dibaca');
      }
      const maxChars = Math.max(500, Math.min(40000, Number(params.maxChars) || 12000));
      const url = targetTab.url || '';
      if (/^(chrome|edge|brave|about|chrome-extension):/i.test(url)) {
        return {
          title: targetTab.title || '',
          url,
          text: `[Halaman internal browser: ${targetTab.title || url}]`,
          backend: 'main',
        };
      }
      const injected = await chrome.scripting.executeScript({
        target: { tabId: targetTab.id },
        func: (limit) => {
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
        },
        args: [maxChars],
      });
      const res = injected?.[0]?.result || {};
      return {
        title: res.title || targetTab.title || '',
        url: res.url || url,
        text: res.text || '',
        backend: 'main',
      };
    }

    default:
      throw new Error(`Unknown method: ${method}`);
  }
}

// Keep service worker awake & connected
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: 0.5 });
  connect();
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: 0.5 });
  connect();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      connect();
    } else {
      try { ws.send(JSON.stringify({ type: 'ping', ts: Date.now() })); } catch { connect(); }
    }
  }
});

connect();
