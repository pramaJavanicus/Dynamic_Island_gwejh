// ---------------------------------------------------------------------------
// Jarvis Code Assistant -- reads a file from the user's workspace, asks the LLM
// to fix errors / apply a requested change, validates the result, writes it to
// disk (with a backup for undo) and highlights the changed line in VS Code via
// `code --goto <file>:<line>`.
// ---------------------------------------------------------------------------
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const MAX_FILE_BYTES = 220 * 1024;
const MAX_BACKUPS = 20;
const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'release', 'build', 'out', '.venv', 'venv', '__pycache__', '.cache', 'coverage']);
const JS_EXTS = new Set(['.js', '.cjs', '.mjs']);

// ------------------------------------------------------------- helpers --

function walkFind(rootDir, matcher, maxDepth = 6, limit = 25) {
  const hits = [];
  const walk = (dir, depth) => {
    if (depth > maxDepth || hits.length >= limit) return;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.isFile() && matcher(e.name)) hits.push(path.join(dir, e.name));
    }
    for (const e of entries) {
      if (e.isDirectory() && !SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) {
        walk(path.join(dir, e.name), depth + 1);
      }
    }
  };
  if (rootDir && fs.existsSync(rootDir)) walk(rootDir, 0);
  return hits;
}

/** Turn a spoken file hint ("app jsx", "main.cjs", "jarvis") into a matcher. */
function hintMatcher(hint) {
  const h = String(hint || '').toLowerCase().trim()
    .replace(/\s+(dot|titik)\s+/g, '.')
    .replace(/\s+/g, '');
  if (!h) return null;
  return (name) => {
    const n = name.toLowerCase();
    if (n === h) return true;
    const stem = n.replace(/\.[^.]+$/, '');
    return stem === h || n.replace(/\./g, '') === h.replace(/\./g, '');
  };
}

function newestFirst(files) {
  return files
    .map((f) => {
      let m = 0;
      try { m = fs.statSync(f).mtimeMs; } catch { /* ignore */ }
      return { f, m };
    })
    .sort((a, b) => b.m - a.m)
    .map((x) => x.f);
}

function stripFences(text) {
  let out = String(text || '').trim();
  const fence = out.match(/^```[\w+-]*\r?\n([\s\S]*?)\r?\n```\s*$/);
  if (fence) return fence[1];
  // A single fenced block surrounded by chatter
  const inner = out.match(/```[\w+-]*\r?\n([\s\S]*?)\r?\n```/);
  if (inner && inner[1].length > out.length * 0.6) return inner[1];
  return out.replace(/^```[\w+-]*\r?\n/, '').replace(/\r?\n```\s*$/, '');
}

function looksLikeJsx(code) {
  return /<\/?[A-Za-z][\w.:-]*(\s[^<>]*)?\/?>/.test(code) && /return\s*\(|=>\s*\(?\s*</.test(code);
}

function nodeCheck(code, ext) {
  return new Promise((resolve) => {
    const tmp = path.join(os.tmpdir(), `jarvis-check-${process.pid}-${Date.now()}${ext}`);
    try { fs.writeFileSync(tmp, code, 'utf8'); } catch (err) {
      resolve({ ok: true, supported: false, error: err.message });
      return;
    }
    // ELECTRON_RUN_AS_NODE lets the Electron binary act as plain Node.
    const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' };
    execFile(process.execPath, ['--check', tmp], { timeout: 8000, windowsHide: true, env }, (err, _out, stderr) => {
      try { fs.unlinkSync(tmp); } catch { /* ignore */ }
      if (!err) { resolve({ ok: true, supported: true }); return; }
      const msg = String(stderr || err.message || '')
        .split(/\r?\n/)
        .filter((l) => l.trim() && !l.includes('jarvis-check-') && !/^\s+at /.test(l))
        .slice(0, 4)
        .join(' | ');
      resolve({ ok: false, supported: true, error: msg || 'Syntax error' });
    });
  });
}

/** Syntax validation for languages we can check cheaply. */
async function validate(code, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.json') {
    try { JSON.parse(code); return { ok: true, supported: true }; } catch (err) {
      return { ok: false, supported: true, error: err.message };
    }
  }
  if (JS_EXTS.has(ext) && !looksLikeJsx(code)) {
    return nodeCheck(code, ext === '.js' ? '.js' : ext);
  }
  return { ok: true, supported: false };
}

function firstChangedLine(before, after) {
  const a = before.split(/\r?\n/);
  const b = after.split(/\r?\n/);
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    if (a[i] !== b[i]) return i + 1;
  }
  return a.length === b.length ? 1 : n + 1;
}

function countChangedLines(before, after) {
  const a = before.split(/\r?\n/);
  const b = after.split(/\r?\n/);
  const setA = new Map();
  a.forEach((l) => setA.set(l, (setA.get(l) || 0) + 1));
  let common = 0;
  for (const l of b) {
    const c = setA.get(l);
    if (c) { common += 1; setA.set(l, c - 1); }
  }
  return Math.max(a.length, b.length) - common;
}

function matchEol(original, updated) {
  const crlf = /\r\n/.test(original);
  let out = updated.replace(/\r\n/g, '\n');
  if (crlf) out = out.replace(/\n/g, '\r\n');
  const eol = crlf ? '\r\n' : '\n';
  const hadTrailing = /\r?\n$/.test(original);
  if (hadTrailing && !/\r?\n$/.test(out)) out += eol;
  return out;
}

// ---------------------------------------------------------- controller --

/**
 * @param {{
 *   llm: { complete: Function },
 *   backupDir: string,
 *   contextResolver: () => Promise<{folderPath?: string, filePath?: string, folders?: string[]}>,
 *   openAtLine: (filePath: string, line: number, folderPath?: string) => void,
 * }} deps
 */
function createVsCodeController({ llm, backupDir, contextResolver, openAtLine }) {
  /** @type {{filePath: string, backupPath: string, line: number}[]} */
  const history = [];

  async function resolveTarget(fileHint) {
    const ctx = (await contextResolver().catch(() => null)) || {};
    const roots = [...new Set([ctx.folderPath, ...(ctx.folders || [])].filter(Boolean))];

    if (fileHint) {
      // Absolute / relative path spoken or typed directly
      const asPath = path.isAbsolute(fileHint) ? fileHint : null;
      if (asPath && fs.existsSync(asPath)) return { filePath: asPath, folderPath: ctx.folderPath };

      const matcher = hintMatcher(fileHint);
      if (matcher) {
        for (const root of roots) {
          const hits = newestFirst(walkFind(root, matcher));
          if (hits.length) return { filePath: hits[0], folderPath: root, alternatives: hits.slice(1, 4) };
        }
      }
      return { error: `I could not find a file named "${fileHint}" in your open VS Code workspace, sir.` };
    }

    if (ctx.filePath && fs.existsSync(ctx.filePath)) {
      return { filePath: ctx.filePath, folderPath: ctx.folderPath };
    }
    return { error: 'Please open the file you want me to work on in Visual Studio Code, or tell me its name, sir.' };
  }

  async function fixFile({ fileHint = '', instruction = '' } = {}) {
    const target = await resolveTarget(fileHint);
    if (target.error) return { ok: false, reply: target.error };
    const { filePath, folderPath } = target;
    const fileName = path.basename(filePath);

    let stat;
    try { stat = fs.statSync(filePath); } catch {
      return { ok: false, reply: `I cannot access ${fileName}, sir.` };
    }
    if (stat.size > MAX_FILE_BYTES) {
      return { ok: false, reply: `${fileName} is too large for me to rewrite safely (${Math.round(stat.size / 1024)} KB), sir.` };
    }

    const original = fs.readFileSync(filePath, 'utf8');
    if (original.includes('\u0000')) return { ok: false, reply: `${fileName} looks like a binary file, sir.` };
    if (!original.trim()) return { ok: false, reply: `${fileName} is empty, sir.` };

    const before = await validate(original, filePath);
    const diagnostics = before.supported && !before.ok ? `Detected syntax error: ${before.error}` : '';

    const system = [
      'You are J.A.R.V.I.S., an expert senior software engineer editing a file in the user\'s workspace.',
      'Apply the user\'s request (fix errors/bugs, or add/modify functionality) with minimal, focused changes.',
      'RULES:',
      '1. Output ONLY the complete updated file content, ready to save. No markdown fences, no explanations.',
      '2. Keep everything unrelated to the request exactly as it is: imports, comments, docstrings, formatting, naming.',
      '3. Never truncate or abbreviate (no "... rest unchanged"). Output the entire file.',
      '4. Keep the same language and module style (CommonJS vs ESM, JSX, TypeScript, etc.).',
    ].join('\n');

    const user = [
      `File: ${fileName}`,
      `Path: ${filePath}`,
      instruction ? `User request: ${instruction}` : 'User request: Fix all errors and bugs in this file.',
      diagnostics,
      '--- FILE START ---',
      original,
      '--- FILE END ---',
    ].filter(Boolean).join('\n');

    let updated;
    try {
      updated = stripFences(await llm.complete({ system, user, temperature: 0.1, timeoutMs: 120000 }));
    } catch (err) {
      return { ok: false, reply: `I could not reach the code analysis model, sir. (${err.message})` };
    }
    if (!updated.trim()) return { ok: false, reply: 'The model returned an empty result, so I left the file untouched, sir.' };

    // Guard against truncated output silently deleting code
    const wantsRemoval = /\b(hapus|remove|delete|buang|kurangi|hilangkan|simplify|sederhanakan)\b/i.test(instruction);
    if (!wantsRemoval && updated.length < original.length * 0.55) {
      return { ok: false, reply: `The proposed change to ${fileName} looked truncated, so I did not save it, sir.` };
    }

    updated = matchEol(original, updated);

    const after = await validate(updated, filePath);
    if (after.supported && !after.ok) {
      return { ok: false, reply: `My fix for ${fileName} still had a syntax error, so I did not save it, sir. (${after.error})` };
    }

    if (updated === original) {
      return { ok: true, filePath, line: 1, changedLines: 0, reply: `I reviewed ${fileName} and found nothing that needs changing, sir.` };
    }

    // Backup, then write
    fs.mkdirSync(backupDir, { recursive: true });
    const backupPath = path.join(backupDir, `${Date.now()}-${fileName}`);
    fs.writeFileSync(backupPath, original, 'utf8');
    fs.writeFileSync(filePath, updated, 'utf8');

    const line = firstChangedLine(original, updated);
    const changedLines = countChangedLines(original, updated);
    history.push({ filePath, backupPath, line });
    while (history.length > MAX_BACKUPS) {
      const old = history.shift();
      try { fs.unlinkSync(old.backupPath); } catch { /* ignore */ }
    }

    try { openAtLine(filePath, line, folderPath); } catch { /* editor open is best-effort */ }

    return {
      ok: true,
      filePath,
      line,
      changedLines,
      backupPath,
      validated: after.supported,
      reply: `Done, sir. I updated ${fileName}: ${changedLines} line${changedLines === 1 ? '' : 's'} changed, starting at line ${line}.`,
    };
  }

  async function undoLast() {
    const last = history.pop();
    if (!last) return { ok: false, reply: 'There is no recent change of mine to undo, sir.' };
    try {
      fs.copyFileSync(last.backupPath, last.filePath);
      fs.unlinkSync(last.backupPath);
    } catch (err) {
      return { ok: false, reply: `I could not restore the previous version, sir. (${err.message})` };
    }
    try { openAtLine(last.filePath, last.line); } catch { /* ignore */ }
    return {
      ok: true,
      filePath: last.filePath,
      line: last.line,
      reply: `Reverted my last change to ${path.basename(last.filePath)}, sir.`,
    };
  }

  return { fixFile, undoLast, resolveTarget };
}

module.exports = { createVsCodeController, _internals: { hintMatcher, stripFences, firstChangedLine, matchEol, validate, looksLikeJsx } };
