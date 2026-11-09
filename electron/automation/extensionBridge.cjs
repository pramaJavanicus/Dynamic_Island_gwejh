// ---------------------------------------------------------------------------
// ExtensionBridge -- Local WebSocket RPC server (127.0.0.1:47321) that connects
// Dynamic Island's Electron main process to the Chrome MV3 extension running in
// the user's main Chrome profile.
// ---------------------------------------------------------------------------
const { EventEmitter } = require('events');
const { WebSocketServer, WebSocket } = require('ws');

const DEFAULT_PORT = 47321;
const PING_INTERVAL_MS = 20000;

class ExtensionBridge extends EventEmitter {
  /**
   * @param {{ port?: number, allowNonExtensionOrigin?: boolean }} [opts]
   */
  constructor({ port = DEFAULT_PORT, allowNonExtensionOrigin = false } = {}) {
    super();
    this.port = port;
    this.allowNonExtensionOrigin = allowNonExtensionOrigin;
    this.wss = null;
    this.client = null;
    this.pingTimer = null;
    this.seq = 1;
    /** @type {Map<number, { resolve: Function, reject: Function, timer: NodeJS.Timeout }>} */
    this.pending = new Map();
  }

  async start() {
    if (this.wss) return;
    await new Promise((resolve) => {
      try {
        const wss = new WebSocketServer({
          host: '127.0.0.1',
          port: this.port,
          verifyClient: ({ origin, req }) => {
            if (this.allowNonExtensionOrigin) return true;
            const orig = String(origin || req?.headers?.origin || '');
            // Accept Chrome/Edge/Brave unpacked extensions
            return orig.startsWith('chrome-extension://') || orig.startsWith('moz-extension://');
          },
        });

        wss.once('listening', () => {
          this.wss = wss;
          this._startHeartbeat();
          resolve();
        });

        wss.on('error', (err) => {
          console.warn(`[ExtensionBridge] WebSocket server error on 127.0.0.1:${this.port}:`, err.message);
          this._cleanupServer();
          resolve();
        });

        wss.on('connection', (ws) => {
          this._attachClient(ws);
        });
      } catch (err) {
        console.warn('[ExtensionBridge] Failed to start:', err.message);
        resolve();
      }
    });
  }

  _attachClient(ws) {
    if (this.client && this.client !== ws) {
      try { this.client.close(1000, 'Replaced by newer extension connection'); } catch { /* ignore */ }
    }
    this.client = ws;
    ws.isAlive = true;

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(String(raw)); } catch { return; }
      if (!msg || typeof msg !== 'object') return;

      if (msg.type === 'hello') {
        this.emit('hello', msg);
        return;
      }
      if (msg.type === 'ping') {
        try { ws.send(JSON.stringify({ type: 'pong', ts: Date.now() })); } catch { /* ignore */ }
        return;
      }

      if (msg.id != null && this.pending.has(msg.id)) {
        const entry = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        clearTimeout(entry.timer);
        if (msg.error) {
          entry.reject(new Error(typeof msg.error === 'string' ? msg.error : (msg.error.message || 'Extension RPC error')));
        } else {
          entry.resolve(msg.result);
        }
      }
    });

    ws.on('close', () => {
      if (this.client === ws) {
        this.client = null;
        this._rejectAllPending('Extension disconnected');
        this.emit('disconnected');
      }
    });

    ws.on('error', () => {
      // Handled by close
    });

    this.emit('connected');
  }

  _startHeartbeat() {
    clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      const ws = this.client;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      if (ws.isAlive === false) {
        try { ws.terminate(); } catch { /* ignore */ }
        this.client = null;
        this.emit('disconnected');
        return;
      }
      ws.isAlive = false;
      try {
        ws.ping();
        ws.send(JSON.stringify({ type: 'keepalive', ts: Date.now() }));
      } catch { /* ignore */ }
    }, PING_INTERVAL_MS);
    if (this.pingTimer.unref) this.pingTimer.unref();
  }

  _rejectAllPending(reason) {
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(new Error(reason));
    }
    this.pending.clear();
  }

  _cleanupServer() {
    clearInterval(this.pingTimer);
    this.pingTimer = null;
    this._rejectAllPending('Bridge stopped');
    if (this.client) {
      try { this.client.close(); } catch { /* ignore */ }
      this.client = null;
    }
    if (this.wss) {
      try { this.wss.close(); } catch { /* ignore */ }
      this.wss = null;
    }
  }

  isConnected() {
    return !!(this.client && this.client.readyState === WebSocket.OPEN);
  }

  /**
   * Call a method on the Chrome extension service worker.
   * @param {string} method
   * @param {Record<string, any>} [params]
   * @param {number} [timeoutMs]
   * @returns {Promise<any>}
   */
  request(method, params = {}, timeoutMs = 8000) {
    if (!this.isConnected()) {
      return Promise.reject(new Error('Jarvis Chrome extension is not connected'));
    }
    const id = this.seq++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Extension request "${method}" timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timer });
      try {
        this.client.send(JSON.stringify({ id, method, params }));
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(err);
      }
    });
  }

  async stop() {
    this._cleanupServer();
  }
}

module.exports = { ExtensionBridge, DEFAULT_PORT };
