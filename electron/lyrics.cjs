// Fetches time-synced LRC lyrics (or plain lyrics fallback) from LRCLIB (no API key needed)
const cache = new Map();

function cleanTrackText(str = '') {
  return String(str)
    .replace(/\s*\((?:official|lyric|music|audio|video|visualizer|remaster|feat\.|ft\.)[^)]*\)/gi, '')
    .replace(/\s*\[(?:official|lyric|music|audio|video|visualizer|remaster|feat\.|ft\.)[^\]]*\]/gi, '')
    .replace(/\s*-\s*(?:remastered|single|version|edit|live|mono|stereo).*$/i, '')
    .trim();
}

function parseLrc(lrc = '') {
  const lines = [];
  const reg = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\](.*)/;
  for (const raw of String(lrc).split(/\r?\n/)) {
    const m = raw.match(reg);
    if (!m) continue;
    const min = parseInt(m[1], 10);
    const sec = parseInt(m[2], 10);
    const ms = m[3] ? parseInt(m[3].padEnd(3, '0'), 10) : 0;
    const time = min * 60 + sec + ms / 1000;
    const text = m[4].trim();
    if (text) lines.push({ time, text });
  }
  return lines.sort((a, b) => a.time - b.time);
}

async function queryLrclib(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 7000);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'DynamicIslandWindows/1.0 (https://github.com/zaenal/dynamic-island)' },
      signal: ctrl.signal,
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function pickBest(results, duration) {
  if (!results.length) return null;
  const withLyrics = results.filter((r) => r.syncedLyrics || r.plainLyrics);
  if (!withLyrics.length) return null;

  const synced = withLyrics.filter((r) => r.syncedLyrics);
  const pool = synced.length ? synced : withLyrics;

  if (duration && duration > 0) {
    pool.sort((a, b) => Math.abs((a.duration || 0) - duration) - Math.abs((b.duration || 0) - duration));
  }
  return pool[0];
}

async function getLyrics({ title, artist, duration } = {}) {
  const rawTitle = String(title || '').trim();
  const rawArtist = String(artist || '').trim();
  if (!rawTitle) return { status: 'empty', synced: false, lines: [] };

  const key = `${rawTitle.toLowerCase()}|${rawArtist.toLowerCase()}`;
  if (cache.has(key)) return cache.get(key);

  const cTitle = cleanTrackText(rawTitle);
  const cArtist = cleanTrackText(rawArtist.split(',')[0]);

  let hits = [];
  if (cTitle && cArtist) {
    hits = await queryLrclib(
      `https://lrclib.net/api/search?track_name=${encodeURIComponent(cTitle)}&artist_name=${encodeURIComponent(cArtist)}`,
    );
  }
  if (!hits.length) {
    const q = [cTitle || rawTitle, cArtist || rawArtist].filter(Boolean).join(' ');
    hits = await queryLrclib(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`);
  }

  const best = pickBest(hits, duration);
  let result;
  if (!best) {
    result = { status: 'not-found', synced: false, lines: [] };
  } else if (best.syncedLyrics) {
    const lines = parseLrc(best.syncedLyrics);
    result = { status: 'ok', synced: true, lines, trackName: best.trackName, artistName: best.artistName };
  } else {
    const lines = String(best.plainLyrics || '')
      .split(/\r?\n/)
      .map((t) => t.trim())
      .filter(Boolean)
      .map((text, idx) => ({ time: idx * 4, text }));
    result = { status: 'ok', synced: false, lines, trackName: best.trackName, artistName: best.artistName };
  }

  cache.set(key, result);
  return result;
}

module.exports = { getLyrics };
