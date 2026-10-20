// Runs a long-lived PowerShell script that speaks line-delimited JSON over stdio.
// Used for: media.ps1 (Spotify / SMTC) and sysinfo.ps1 (temperature + Bluetooth battery).
const { spawn } = require('child_process');
const { EventEmitter } = require('events');

class PsBridge extends EventEmitter {
  constructor(scriptPath, { args = [], commands = [] } = {}) {
    super();
    this.scriptPath = scriptPath;
    this.args = args;
    this.allowed = new Set(commands);
    this.proc = null;
    this.stopped = false;
    this.buffer = '';
  }

  start() {
    this.stopped = false;
    this.proc = spawn('powershell.exe', [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', this.scriptPath, ...this.args,
    ], { windowsHide: true });

    this.proc.stdout.setEncoding('utf8');
    this.proc.stdout.on('data', (chunk) => {
      this.buffer += chunk;
      let idx;
      while ((idx = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, idx).trim();
        this.buffer = this.buffer.slice(idx + 1);
        if (!line) continue;
        try { this.emit('update', JSON.parse(line)); } catch { /* partial / non-json line */ }
      }
    });
    this.proc.stderr.on('data', (d) => console.warn('[ps]', d.toString().trim()));
    this.proc.on('exit', () => {
      this.proc = null;
      this.buffer = '';
      if (!this.stopped) setTimeout(() => this.start(), 3000); // auto-restart
    });
  }

  send(cmd) {
    const verb = String(cmd || '').split(':')[0];
    if (!this.allowed.has(verb) || !this.proc) return;
    this.proc.stdin.write(`${cmd}\n`);
  }

  stop() {
    this.stopped = true;
    if (this.proc) {
      this.proc.stdin.end(); // scripts exit when stdin closes
      const p = this.proc;
      setTimeout(() => { if (p.exitCode === null) p.kill(); }, 1000);
    }
  }
}

module.exports = { PsBridge };
