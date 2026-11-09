// ---------------------------------------------------------------------------
// Shared LLM client for Jarvis automation modules (form filling, code fixing,
// page analysis).
//
// Provider order:
//   1. Google Gemini, if a key is configured (config.json "geminiApiKey" or the
//      GEMINI_API_KEY environment variable) -- much more accurate & reliable.
//   2. Pollinations free endpoint (no key needed) as a fallback.
// ---------------------------------------------------------------------------
const config = require('../config.cjs');

const GEMINI_MODEL = 'gemini-2.5-flash';
const DEFAULT_TIMEOUT_MS = 90000;

function geminiKey() {
  try {
    const k = String(config.get()?.geminiApiKey || process.env.GEMINI_API_KEY || '').trim();
    return k || null;
  } catch {
    return String(process.env.GEMINI_API_KEY || '').trim() || null;
  }
}

async function fetchWithTimeout(url, opts, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function callGemini({ system, user, json, temperature, timeoutMs }) {
  const key = geminiKey();
  const res = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: system ? { parts: [{ text: system }] } : undefined,
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: {
          temperature,
          ...(json ? { responseMimeType: 'application/json' } : {}),
        },
      }),
    },
    timeoutMs,
  );
  const data = await res.json().catch(() => ({}));
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
  if (!res.ok || !text) {
    throw new Error(data?.error?.message || `Gemini HTTP ${res.status}`);
  }
  return text;
}

async function callPollinations({ system, user, json, temperature, timeoutMs }) {
  const res = await fetchWithTimeout(
    'https://text.pollinations.ai/',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'openai',
        temperature,
        ...(json ? { jsonMode: true } : {}),
        messages: [
          ...(system ? [{ role: 'system', content: system }] : []),
          { role: 'user', content: user },
        ],
      }),
    },
    timeoutMs,
  );
  if (!res.ok) throw new Error(`Pollinations HTTP ${res.status}`);
  const text = (await res.text()).trim();
  if (!text) throw new Error('Empty LLM response');
  return text;
}

/**
 * Plain text completion.
 * @param {{system?: string, user: string, json?: boolean, temperature?: number, timeoutMs?: number}} opts
 * @returns {Promise<string>}
 */
async function complete({ system = '', user, json = false, temperature = 0.2, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const args = { system, user: String(user || ''), json, temperature, timeoutMs };
  if (geminiKey()) {
    try {
      return await callGemini(args);
    } catch (err) {
      console.warn('[llm] Gemini failed, falling back to Pollinations:', err.message);
    }
  }
  return callPollinations(args);
}

/** Extract the first JSON object/array from a model response. */
function parseJsonLoose(raw) {
  const text = String(raw || '').trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '');
  try {
    return JSON.parse(text);
  } catch { /* try to locate an embedded JSON block */ }
  const start = text.search(/[[{]/);
  if (start < 0) throw new Error('No JSON found in LLM response');
  const open = text[start];
  const close = open === '{' ? '}' : ']';
  const end = text.lastIndexOf(close);
  if (end <= start) throw new Error('Unterminated JSON in LLM response');
  return JSON.parse(text.slice(start, end + 1));
}

/**
 * JSON completion -- returns the parsed object. Retries once on malformed JSON.
 * @returns {Promise<any>}
 */
async function completeJSON(opts) {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const raw = await complete({ ...opts, json: true });
      return parseJsonLoose(raw);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

function providerName() {
  return geminiKey() ? `gemini (${GEMINI_MODEL})` : 'pollinations (free)';
}

module.exports = { complete, completeJSON, parseJsonLoose, providerName };
