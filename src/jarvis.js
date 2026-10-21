import { useCallback, useRef, useState } from 'react';

const api = window.island;

const KNOWN_SITES = [
  { keys: ['web whatsapp', 'whatsapp web', 'wa web', 'whatsapp'], name: 'Web WhatsApp', url: 'https://web.whatsapp.com' },
  { keys: ['youtube', 'yt'], name: 'YouTube', url: 'https://www.youtube.com' },
  { keys: ['gmail', 'email', 'google mail'], name: 'Gmail', url: 'https://mail.google.com' },
  { keys: ['google drive', 'drive'], name: 'Google Drive', url: 'https://drive.google.com' },
  { keys: ['google calendar', 'kalender', 'calendar'], name: 'Google Calendar', url: 'https://calendar.google.com' },
  { keys: ['google docs', 'docs'], name: 'Google Docs', url: 'https://docs.google.com' },
  { keys: ['google sheets', 'spreadsheet', 'sheets'], name: 'Google Sheets', url: 'https://sheets.google.com' },
  { keys: ['google maps', 'maps', 'peta'], name: 'Google Maps', url: 'https://maps.google.com' },
  { keys: ['google translate', 'translate', 'terjemahan'], name: 'Google Translate', url: 'https://translate.google.com' },
  { keys: ['github'], name: 'GitHub', url: 'https://github.com' },
  { keys: ['chatgpt', 'chat gpt'], name: 'ChatGPT', url: 'https://chatgpt.com' },
  { keys: ['instagram', 'ig'], name: 'Instagram', url: 'https://www.instagram.com' },
  { keys: ['facebook', 'fb'], name: 'Facebook', url: 'https://www.facebook.com' },
  { keys: ['twitter', 'x.com'], name: 'X (Twitter)', url: 'https://x.com' },
  { keys: ['tiktok', 'tik tok'], name: 'TikTok', url: 'https://www.tiktok.com' },
  { keys: ['netflix'], name: 'Netflix', url: 'https://www.netflix.com' },
  { keys: ['discord'], name: 'Discord Web', url: 'https://discord.com/app' },
  { keys: ['telegram', 'web telegram'], name: 'Telegram Web', url: 'https://web.telegram.org' },
  { keys: ['tokopedia'], name: 'Tokopedia', url: 'https://www.tokopedia.com' },
  { keys: ['shopee'], name: 'Shopee', url: 'https://shopee.co.id' },
  { keys: ['canva'], name: 'Canva', url: 'https://www.canva.com' },
  { keys: ['figma'], name: 'Figma', url: 'https://www.figma.com' },
  { keys: ['linkedin'], name: 'LinkedIn', url: 'https://www.linkedin.com' },
  { keys: ['reddit'], name: 'Reddit', url: 'https://www.reddit.com' },
  { keys: ['wikipedia'], name: 'Wikipedia', url: 'https://id.wikipedia.org' },
];

const WORD_NUMBERS = [
  ['empat puluh lima', '45'],
  ['tiga puluh lima', '35'],
  ['dua puluh lima', '25'],
  ['empat puluh', '40'],
  ['tiga puluh', '30'],
  ['dua puluh', '20'],
  ['sembilan belas', '19'],
  ['delapan belas', '18'],
  ['tujuh belas', '17'],
  ['enam belas', '16'],
  ['lima belas', '15'],
  ['empat belas', '14'],
  ['tiga belas', '13'],
  ['dua belas', '12'],
  ['sebelas', '11'],
  ['sepuluh', '10'],
  ['sembilan', '9'],
  ['delapan', '8'],
  ['tujuh', '7'],
  ['enam', '6'],
  ['lima', '5'],
  ['empat', '4'],
  ['tiga', '3'],
  ['dua', '2'],
  ['satu', '1'],
  ['fifteen', '15'],
  ['twenty', '20'],
  ['thirty', '30'],
  ['forty', '40'],
  ['fifty', '50'],
  ['twelve', '12'],
  ['eleven', '11'],
  ['ten', '10'],
  ['nine', '9'],
  ['eight', '8'],
  ['seven', '7'],
  ['six', '6'],
  ['five', '5'],
  ['four', '4'],
  ['three', '3'],
  ['two', '2'],
  ['one', '1'],
];

function normalizeSpokenNumbers(text) {
  let out = String(text || '')
    .replace(/\bsejam\b/gi, '1 jam')
    .replace(/\bsemenit\b/gi, '1 menit')
    .replace(/\bsedetik\b/gi, '1 detik')
    .replace(/\bsetengah\s+jam\b/gi, '30 menit')
    .replace(/\bhalf\s+an?\s+hour\b/gi, '30 minutes')
    .replace(/\bsetengah\s+menit\b/gi, '30 detik');

  for (const [word, digit] of WORD_NUMBERS) {
    const rx = new RegExp(`\\b${word}\\b`, 'gi');
    out = out.replace(rx, digit);
  }
  return out;
}

function parseDurationSeconds(rawText) {
  const norm = normalizeSpokenNumbers(rawText);
  let totalSec = 0;
  let matched = false;

  const rx = /(\d+(?:[.,]\d+)?)\s*(jam|hours?|hr|hrs|menit|minutes?|mins?|detik|seconds?|secs?)/gi;
  let m;
  while ((m = rx.exec(norm)) !== null) {
    const val = parseFloat(m[1].replace(',', '.'));
    const unit = m[2].toLowerCase();
    if (!Number.isNaN(val) && val > 0) {
      matched = true;
      if (unit.startsWith('jam') || unit.startsWith('h')) {
        totalSec += Math.round(val * 3600);
      } else if (unit.startsWith('det') || unit.startsWith('s')) {
        totalSec += Math.round(val);
      } else {
        totalSec += Math.round(val * 60);
      }
    }
  }
  return matched && totalSec > 0 ? totalSec : 0;
}

function formatDurationEnglish(totalSec) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const parts = [];
  if (h > 0) parts.push(`${h} ${h === 1 ? 'hour' : 'hours'}`);
  if (m > 0) parts.push(`${m} ${m === 1 ? 'minute' : 'minutes'}`);
  if (s > 0) parts.push(`${s} ${s === 1 ? 'second' : 'seconds'}`);
  return parts.join(' and ') || `${totalSec} seconds`;
}

function parseSpokenAlarm(rawLower) {
  const norm = normalizeSpokenNumbers(rawLower);

  // Relative alarm e.g. "alarm 10 menit lagi" / "bangunkan saya 15 menit lagi"
  const relMatch = norm.match(/(?:alarm|bangunkan(?:\s+saya|\s+aku)?)\s+(\d+)\s*(menit|jam|minutes?|hours?)\s+lagi/i);
  if (relMatch) {
    const num = parseInt(relMatch[1], 10);
    const unit = relMatch[2].toLowerCase();
    const addMs = (unit.startsWith('jam') || unit.startsWith('h')) ? num * 3600000 : num * 60000;
    const target = new Date(Date.now() + addMs);
    const hh = String(target.getHours()).padStart(2, '0');
    const mm = String(target.getMinutes()).padStart(2, '0');
    return { time: `${hh}:${mm}`, label: 'Jarvis Alarm' };
  }

  // Indonesian "setengah X" e.g. "alarm jam setengah 7 pagi" -> 06:30
  const setengahMatch = norm.match(/(?:alarm|bangunkan(?:\s+saya|\s+aku)?).*?\bsetengah\s+(\d{1,2})(?:\s*(pagi|siang|sore|malam|am|pm))?/i);
  if (setengahMatch) {
    let h = (parseInt(setengahMatch[1], 10) - 1 + 24) % 24;
    const period = (setengahMatch[2] || '').toLowerCase();
    if ((period === 'siang' || period === 'sore' || period === 'malam' || period === 'pm') && h < 12) {
      h += 12;
    } else if ((period === 'pagi' || period === 'am') && h === 12) {
      h = 0;
    }
    return {
      time: `${String(h).padStart(2, '0')}:30`,
      label: 'Jarvis Alarm',
    };
  }

  // Standard alarm e.g. "alarm jam 07:30", "alarm pukul 6 lewat 15 pagi", "alarm jam 8 malam", "set alarm for 7:30 am"
  const stdMatch = norm.match(/(?:alarm|bangunkan(?:\s+saya|\s+aku)?)\s+(?:untuk\s+|jam\s+|pukul\s+|at\s+|for\s+)?(\d{1,2})(?:\s*(?:[:.]|lewat|lebih)\s*(\d{1,2}))?(?:\s*(pagi|siang|sore|malam|am|pm))?(?:\s+(?:untuk|label|bernama)\s+(.+))?/i);
  if (stdMatch) {
    let h = parseInt(stdMatch[1], 10);
    const m = parseInt(stdMatch[2] || '0', 10);
    const period = (stdMatch[3] || '').toLowerCase();
    const customLabel = (stdMatch[4] || '').trim();

    if (period === 'malam' || period === 'sore' || period === 'pm') {
      if (h < 12) h += 12;
    } else if (period === 'siang') {
      if (h >= 1 && h <= 6) h += 12;
    } else if ((period === 'pagi' || period === 'am') && h === 12) {
      h = 0;
    }

    h = Math.max(0, Math.min(23, h));
    const clampedM = Math.max(0, Math.min(59, m));
    return {
      time: `${String(h).padStart(2, '0')}:${String(clampedM).padStart(2, '0')}`,
      label: customLabel || 'Jarvis Alarm',
    };
  }

  return null;
}

function downsampleTo16kHzPCMBase64(float32Chunks, inputSampleRate) {
  let totalLen = 0;
  for (const c of float32Chunks) totalLen += c.length;
  if (totalLen === 0) return '';

  const merged = new Float32Array(totalLen);
  let offset = 0;
  for (const c of float32Chunks) {
    merged.set(c, offset);
    offset += c.length;
  }

  const targetRate = 16000;
  const ratio = inputSampleRate / targetRate;
  const outLength = Math.floor(merged.length / ratio);
  const pcm16 = new Int16Array(outLength);

  for (let i = 0; i < outLength; i += 1) {
    const idx = Math.floor(i * ratio);
    const s = Math.max(-1, Math.min(1, merged[idx] || 0));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  const bytes = new Uint8Array(pcm16.buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function extractSongQuery(lower) {
  // Never treat pause/stop/resume/next/prev commands as song titles
  if (/\b(pause|jeda|hentikan|berhentikan|stop|matikan|next|skip|prev|previous|selanjutnya|sebelumnya)\b/i.test(lower)) {
    return null;
  }

  const patterns = [
    /(?:putar|putarkan|mainkan|stel|setel|nyalakan|play)\s+(?:lagu|musik|song|track)\s+(?:yang\s+judulnya\s+|berjudul\s+)?(.+?)(?:\s+di\s+spotify|\s+lewat\s+spotify|\s+sekarang|\s+dong|\s+ya)?$/i,
    /spotify\s+(?:dan\s+|lalu\s+|terus\s+)?(?:tolong\s+)?(?:putar|putarkan|mainkan|stel|setel|play)\s+(?:lagu\s+|musik\s+|song\s+)?(.+?)(?:\s+sekarang|\s+dong|\s+ya)?$/i,
    /(?:putar|putarkan|mainkan|stel|setel|play)\s+(.+?)\s+di\s+spotify$/i,
  ];
  for (const rx of patterns) {
    const m = lower.match(rx);
    if (m && m[1]) {
      const q = m[1].trim().replace(/^(lagu|musik|song)\s+/i, '').trim();
      if (q && !['musik', 'musiknya', 'lagu', 'lagunya', 'spotify', 'sekarang'].includes(q.toLowerCase())) {
        return q;
      }
    }
  }
  return null;
}

function extractWhatsAppCommand(lower) {
  // Strip optional leading "buka google chrome dan buka whatsapp web dan tolong..."
  const stripped = lower
    .replace(/^(?:(?:buka|bukain|open|jalankan)\s+(?:google\s+chrome|chrome)\s+(?:dan|lalu|terus|kemudian)\s+(?:tolong\s+)?)?/i, '')
    .replace(/^(?:(?:buka|bukain|open|jalankan)\s+(?:web\s+whatsapp|whatsapp\s+web|wa\s+web|whatsapp|wa)\s+(?:dan|lalu|terus|kemudian)\s+(?:tolong\s+)?)?/i, '')
    .trim();

  // 1. Video Call (e.g. "buka whatsapp web dan video call bagas", "vc bagas di wa")
  const vcMatch = stripped.match(/^(?:video\s*call|vc|panggilan\s+video)\s+(?:sama\s+|ke\s+|dengan\s+)?([a-zA-Z0-9_.\s]{1,35}?)(?:\s+(?:di|lewat|via|pakai|on)\s+(?:web\s+whatsapp|whatsapp\s+web|wa\s+web|whatsapp|wa))?(?:\s+sekarang|\s+dong|\s+ya)?$/i);
  if (vcMatch && vcMatch[1]) {
    return {
      action: 'videocall',
      contact: vcMatch[1].trim(),
      message: '',
    };
  }

  // 2. Voice Call (e.g. "buka whatsapp web dan telfon bagas", "telepon bagas di wa", "telfon bagas")
  const callMatch = stripped.match(/^(?:telfon|telpon|telepon|nelpon|nelfon|call|panggilan\s+suara)\s+(?:sama\s+|ke\s+|dengan\s+)?([a-zA-Z0-9_.\s]{1,35}?)(?:\s+(?:di|lewat|via|pakai|on)\s+(?:web\s+whatsapp|whatsapp\s+web|wa\s+web|whatsapp|wa))?(?:\s+sekarang|\s+dong|\s+ya)?$/i);
  if (callMatch && callMatch[1]) {
    return {
      action: 'call',
      contact: callMatch[1].trim(),
      message: '',
    };
  }

  // 3. Chat <contact> dan kirimkan pesan <message>
  // e.g. "chat kenzie dan kirimkan pesan nanti jam 5 nge gym yuk"
  const chatSendMatch = stripped.match(/^(?:chat|chating|hubungi|wa|whatsapp)\s+(?:ke\s+|sama\s+)?([a-zA-Z0-9_.\s]{1,30}?)(?:\s+(?:di|lewat|via|on)\s+(?:web\s+whatsapp|whatsapp\s+web|wa\s+web|whatsapp|wa))?\s+(?:(?:dan|lalu|terus|kemudian)\s+)?(?:tolong\s+)?(?:kirimkan\s+pesan|kirim\s+pesan|kirimkan\s+chat|kirim\s+chat|kirimkan|kirim|bilang|katakan|ketik|ketikkan|pesan|isinya|dengan\s+pesan|say|send\s+message|send)\s*[:,]?\s*(.+)$/i);
  if (chatSendMatch && chatSendMatch[1] && chatSendMatch[2]) {
    return {
      action: 'send',
      contact: chatSendMatch[1].trim(),
      message: chatSendMatch[2].trim(),
    };
  }

  // 4. Kirim pesan / kirim WA ke <contact> <message>
  // e.g. "kirim pesan ke kenzie nanti jam 5 nge gym yuk"
  const sendToMatch = stripped.match(/^(?:kirimkan\s+pesan|kirim\s+pesan|kirimkan\s+chat|kirim\s+chat|kirim\s+wa|kirim\s+whatsapp|send\s+a?\s*message|send\s+whatsapp)\s+(?:ke|kepada|untuk|sama|to)\s+([a-zA-Z0-9_.\s]{1,30}?)(?:\s+(?:di|lewat|via|on)\s+(?:web\s+whatsapp|whatsapp\s+web|wa\s+web|whatsapp|wa))?\s+(?:(?:dan\s+|lalu\s+)?(?:kirimkan\s+pesan|kirim\s+pesan|bilang|katakan|isinya|pesan|bahwa|ketik|that|saying)\s*[:,]?\s*)?(.+)$/i);
  if (sendToMatch && sendToMatch[1] && sendToMatch[2]) {
    return {
      action: 'send',
      contact: sendToMatch[1].trim(),
      message: sendToMatch[2].trim(),
    };
  }

  // 5. Short form: "chat <singleName> <message>" or "wa <singleName> <message>"
  const shortChatMatch = stripped.match(/^(?:chat|wa|whatsapp)\s+([a-zA-Z0-9_.]{2,22})(?:\s+(?:di|lewat|via)\s+(?:web\s+whatsapp|whatsapp\s+web|wa\s+web|whatsapp|wa))?\s+(.+)$/i);
  if (shortChatMatch && shortChatMatch[1] && shortChatMatch[2]) {
    const contactCandidate = shortChatMatch[1].trim();
    if (!['web', 'di', 'ke', 'dan'].includes(contactCandidate.toLowerCase())) {
      return {
        action: 'send',
        contact: contactCandidate,
        message: shortChatMatch[2].trim(),
      };
    }
  }

  // 6. Open specific contact chat without sending a message (e.g. "buka chat bagas di wa")
  const openChatMatch = stripped.match(/^(?:buka\s+chat|cari\s+kontak|cari\s+chat)\s+([a-zA-Z0-9_.\s]{1,30}?)(?:\s+(?:di|lewat|via)\s+(?:web\s+whatsapp|whatsapp\s+web|wa\s+web|whatsapp|wa))?$/i);
  if (openChatMatch && openChatMatch[1]) {
    return {
      action: 'open_chat',
      contact: openChatMatch[1].trim(),
      message: '',
    };
  }

  return null;
}

export function useJarvis({
  setTab,
  setPinned,
  expand,
  clock,
  sysinfo,
  config,
  onVoiceChatTurn,
}) {
  // status: 'idle' | 'listening' | 'processing' | 'speaking'
  const [status, setStatus] = useState('idle');
  const [level, setLevel] = useState(0);
  const [lastTranscript, setLastTranscript] = useState('');
  const [lastReply, setLastReply] = useState('');
  const [voiceEnabled, setVoiceEnabled] = useState(true);

  const audioRef = useRef(null);
  const recorderRef = useRef(null);
  const voiceEnabledRef = useRef(voiceEnabled);
  voiceEnabledRef.current = voiceEnabled;

  const openIslandTab = useCallback((targetTab) => {
    if (expand) expand(targetTab);
    else if (targetTab) setTab(targetTab);
  }, [expand, setTab]);

  const stopSpeaking = useCallback(() => {
    try {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      window.speechSynthesis?.cancel?.();
    } catch { /* ignore */ }
    setStatus((s) => (s === 'speaking' ? 'idle' : s));
  }, []);

  const speak = useCallback(async (text) => {
    if (!voiceEnabledRef.current || !text) {
      setStatus('idle');
      return;
    }
    stopSpeaking();
    setStatus('speaking');
    try {
      const res = await api.jarvis.tts(text);
      if (res?.ok && res.audioDataUrl) {
        const audio = new Audio(res.audioDataUrl);
        audioRef.current = audio;
        audio.onended = () => setStatus('idle');
        audio.onerror = () => setStatus('idle');
        await audio.play();
        return;
      }
    } catch { /* fallback to browser speechSynthesis */ }

    try {
      if (window.speechSynthesis) {
        const u = new SpeechSynthesisUtterance(String(text).slice(0, 220));
        u.lang = 'en-GB';
        const voices = window.speechSynthesis.getVoices?.() || [];
        const gbVoice = voices.find((v) => v.lang?.startsWith('en-GB')) || voices.find((v) => v.lang?.startsWith('en'));
        if (gbVoice) u.voice = gbVoice;
        u.onend = () => setStatus('idle');
        u.onerror = () => setStatus('idle');
        window.speechSynthesis.speak(u);
      } else {
        setStatus('idle');
      }
    } catch {
      setStatus('idle');
    }
  }, [stopSpeaking]);

  const executeStructuredActions = useCallback(async (actions = []) => {
    for (const act of actions) {
      if (!act || !act.type) continue;
      switch (act.type) {
        case 'open_browser': {
          const urls = Array.isArray(act.urls) ? act.urls : (act.url ? [act.url] : []);
          await api.jarvis.openBrowser({ urls, preferChrome: !!act.preferChrome });
          break;
        }
        case 'open_url': {
          if (act.url) api.openUrl(act.url);
          break;
        }
        case 'open_app': {
          if (act.app) await api.jarvis.openApp(act.app);
          break;
        }
        case 'play_spotify': {
          openIslandTab('media');
          await api.jarvis.playSpotify(act.query || '');
          break;
        }
        case 'media': {
          openIslandTab('media');
          api.media.command(act.cmd || 'play');
          break;
        }
        case 'google_search': {
          if (act.query) api.search(act.query);
          break;
        }
        case 'youtube_search': {
          if (act.query) {
            api.openUrl(`https://www.youtube.com/results?search_query=${encodeURIComponent(act.query)}`);
          }
          break;
        }
        case 'timer': {
          openIslandTab('clock');
          clock?.setSubTab?.('timer');
          const cmd = String(act.cmd || 'start').toLowerCase();
          if (cmd === 'pause') {
            clock?.timer?.pause?.();
          } else if (cmd === 'reset' || cmd === 'stop') {
            clock?.timer?.reset?.();
            clock?.dismissRing?.();
          } else {
            const secs = Number(act.seconds) || 0;
            if (secs > 0) clock?.timer?.start?.(secs);
            else clock?.timer?.start?.();
          }
          break;
        }
        case 'stopwatch': {
          openIslandTab('clock');
          clock?.setSubTab?.('stopwatch');
          const cmd = String(act.cmd || 'start').toLowerCase();
          if (cmd === 'reset') clock?.stopwatch?.reset?.();
          else if (cmd === 'pause' || cmd === 'stop') clock?.stopwatch?.pause?.();
          else if (cmd === 'lap') clock?.stopwatch?.lap?.();
          else clock?.stopwatch?.start?.();
          break;
        }
        case 'alarm': {
          openIslandTab('clock');
          clock?.setSubTab?.('alarm');
          const cmd = String(act.cmd || 'add').toLowerCase();
          if (cmd === 'clear') {
            clock?.alarm?.clearAll?.();
          } else if (cmd === 'remove' && act.time) {
            clock?.alarm?.removeByTime?.(act.time);
          } else if (act.time) {
            clock?.alarm?.add?.(act.time, act.label || 'Jarvis Alarm');
          }
          break;
        }
        case 'volume': {
          if (act.level != null) api.sysinfo.setVolume(Number(act.level));
          break;
        }
        case 'mute': {
          api.sysinfo.toggleMute();
          break;
        }
        case 'tab': {
          if (act.tab) openIslandTab(act.tab);
          break;
        }
        case 'pin': {
          setPinned(act.value !== false);
          break;
        }
        case 'power': {
          await api.jarvis.power({ cmd: act.cmd || 'sleep', delaySec: act.delaySec });
          break;
        }
        case 'whatsapp': {
          api.jarvis.whatsapp({
            action: act.action || 'send',
            contact: act.contact || '',
            message: act.message || '',
          });
          break;
        }
        default:
          break;
      }
    }
  }, [clock, openIslandTab, setPinned]);

  const handleCommand = useCallback(async (rawText, { skipAutoChatSwitch = false } = {}) => {
    const clean = String(rawText || '').trim();
    if (!clean) {
      setStatus('idle');
      return { handled: false };
    }
    setLastTranscript(clean);
    const lower = clean
      .toLowerCase()
      .replace(/^(halo|hai|hey|hei|ok|oke|tolong|coba)?\s*(jarvis|gemini)?\s*(tolong|coba|bisa|minta|dong)?\s*[,.:!-]?\s*/i, '')
      .trim();

    const finishWithAction = async (replyText) => {
      setLastReply(replyText);
      if (!skipAutoChatSwitch) {
        onVoiceChatTurn?.(clean, replyText);
      }
      await speak(replyText);
      return { handled: true, reply: replyText };
    };

    // =========================================================================
    // 0. SYSTEM POWER COMMANDS (Shutdown, Restart, Sleep Mode, Lock Screen, Cancel)
    // =========================================================================

    // Cancel / Abort Shutdown or Restart (e.g. "batalkan shutdown", "cancel shutdown", "batalkan restart")
    if (
      /\b(batalkan|batal|cancel|abort|hentikan|stop)\b.*\b(shutdown|shut down|restart|reboot|sleep|mati|mematikan)\b/i.test(lower)
    ) {
      await api.jarvis.power({ cmd: 'cancel' });
      return finishWithAction('System power sequence has been aborted, sir.');
    }

    // Sleep Mode (e.g. "sleep mode", "mode tidur", "tidurkan laptop", "sleep laptop", "standby laptop")
    if (
      /\b(sleep\s*mode|mode\s*sleep|mode\s*tidur|tidurkan\s*(laptop|komputer|pc)?|sleep\s*(laptop|komputer|pc|sekarang)?|put\s*(the\s*)?(laptop|computer|pc|system)\s*to\s*sleep|standby\s*(laptop|mode)?)\b/i.test(lower)
      || /^(sleep|tidur)$/i.test(lower)
    ) {
      const customDelay = parseDurationSeconds(lower) || 3;
      await api.jarvis.power({ cmd: 'sleep', delaySec: customDelay });
      return finishWithAction('Right away, sir. Putting your laptop into sleep mode now.');
    }

    // Lock Screen (e.g. "kunci layar", "kunci laptop", "lock screen", "lock laptop")
    if (/\b(kunci\s*(layar|laptop|komputer|pc)|lock\s*(screen|laptop|computer|pc|workstation))\b/i.test(lower)) {
      await api.jarvis.power({ cmd: 'lock', delaySec: 2 });
      return finishWithAction('Locking your screen now, sir.');
    }

    // Restart / Reboot Laptop (e.g. "restart laptop", "reboot laptop", "mulai ulang laptop", "restart komputer")
    if (
      /\b(restart|reboot|mulai\s*ulang)\b.*\b(laptop|komputer|pc|sistem|system|sekarang|now)?\b/i.test(lower)
      && !/\b(timer|stopwatch|aplikasi|app|spotify|browser|chrome)\b/i.test(lower)
    ) {
      const delaySec = parseDurationSeconds(lower) || 8;
      await api.jarvis.power({ cmd: 'restart', delaySec });
      return finishWithAction(`Right away, sir. Restarting your laptop in ${delaySec} seconds. Say cancel restart if you wish to abort.`);
    }

    // Shutdown / Turn Off Laptop (e.g. "shutdown laptop", "matikan laptop", "matikan komputer", "turn off laptop")
    if (
      /\b(shutdown|shut\s*down|power\s*off|turn\s*off)\b/i.test(lower)
      || /\b(matikan)\s+(laptop|komputer|pc|sistem|system)\b/i.test(lower)
    ) {
      const delaySec = parseDurationSeconds(lower) || 8;
      await api.jarvis.power({ cmd: 'shutdown', delaySec });
      return finishWithAction(`Right away, sir. Initiating system shutdown in ${delaySec} seconds. Say cancel shutdown if you wish to abort.`);
    }

    // =========================================================================
    // 1. TIMER, STOPWATCH & ALARM (Checked early so "stop/pause timer/stopwatch/alarm" is never confused with music)
    // =========================================================================

    // --- 1A. TIMER ---
    if (/\b(timer|hitung mundur|countdown)\b/i.test(lower)) {
      openIslandTab('clock');
      clock?.setSubTab?.('timer');

      // Add time to timer (e.g. "tambah timer 2 menit")
      if (/\b(tambah|tambahkan|add)\b/i.test(lower)) {
        const addSecs = parseDurationSeconds(lower) || 60;
        clock?.timer?.addSeconds?.(addSecs);
        return finishWithAction(`Added ${formatDurationEnglish(addSecs)} to the timer, sir.`);
      }

      // Pause timer (e.g. "pause timer", "jeda timer", "hentikan sementara timer")
      if (/\b(pause|jeda|tahan|hentikan sementara)\b/i.test(lower)) {
        clock?.timer?.pause?.();
        return finishWithAction('Timer paused, sir.');
      }

      // Stop / Reset / Cancel timer (e.g. "stop timer", "reset timer", "matikan timer", "batalkan timer")
      if (/\b(stop|reset|ulang|matikan|batalkan|hapus|cancel|clear|hentikan)\b/i.test(lower)) {
        clock?.timer?.reset?.();
        clock?.dismissRing?.();
        return finishWithAction('Timer has been reset, sir.');
      }

      // Start timer with duration (e.g. "pasang timer 5 menit", "timer 1 jam 30 menit", "timer 45 detik")
      const secs = parseDurationSeconds(lower);
      if (secs > 0) {
        clock?.timer?.start?.(secs);
        return finishWithAction(`Timer set for ${formatDurationEnglish(secs)}, sir.`);
      }

      // Resume / Start timer without duration (e.g. "mulai timer", "lanjutkan timer", "start timer")
      if (/\b(mulai|jalankan|lanjutkan|lanjut|start|resume|nyalakan|buka)\b/i.test(lower)) {
        clock?.timer?.start?.();
        return finishWithAction('Timer started, sir.');
      }
    }

    // --- 1B. STOPWATCH ---
    if (/\b(stopwatch|stop watch)\b/i.test(lower)) {
      openIslandTab('clock');
      clock?.setSubTab?.('stopwatch');

      // Lap / Split (e.g. "lap stopwatch", "catat putaran stopwatch")
      if (/\b(lap|putaran|split|catat)\b/i.test(lower)) {
        clock?.stopwatch?.lap?.();
        return finishWithAction('Lap recorded on the stopwatch, sir.');
      }

      // Reset (e.g. "reset stopwatch", "ulang stopwatch", "nolkan stopwatch")
      if (/\b(reset|ulang|ulangi|nolkan|clear|hapus)\b/i.test(lower)) {
        clock?.stopwatch?.reset?.();
        return finishWithAction('Stopwatch has been reset to zero, sir.');
      }

      // Pause / Stop (e.g. "pause stopwatch", "jeda stopwatch", "hentikan stopwatch", "stop stopwatch", "matikan stopwatch")
      if (/\b(pause|jeda|stop|hentikan|berhentikan|berhenti|matikan)\b/i.test(lower)) {
        clock?.stopwatch?.pause?.();
        return finishWithAction('Stopwatch paused, sir.');
      }

      // Start / Resume (e.g. "mulai stopwatch", "nyalakan stopwatch", "jalankan stopwatch", "start stopwatch", "lanjutkan stopwatch")
      clock?.stopwatch?.start?.();
      return finishWithAction('Stopwatch started, sir.');
    }

    // --- 1C. ALARM ---
    if (/\b(alarm|bangunkan)\b/i.test(lower)) {
      openIslandTab('clock');
      clock?.setSubTab?.('alarm');

      // Delete all alarms (e.g. "hapus semua alarm", "clear all alarms")
      if (/\b(hapus|delete|clear|bersihkan)\s+(semua|seluruh|all)\s+alarm\b/i.test(lower)) {
        clock?.alarm?.clearAll?.();
        clock?.dismissRing?.();
        return finishWithAction('All alarms have been cleared, sir.');
      }

      // Delete or turn off a specific alarm (e.g. "hapus alarm jam 7", "matikan alarm jam 06:30")
      if (/\b(hapus|delete|remove|matikan|nonaktifkan)\b/i.test(lower)) {
        const parsed = parseSpokenAlarm(lower);
        if (parsed?.time) {
          clock?.alarm?.removeByTime?.(parsed.time);
          clock?.dismissRing?.();
          return finishWithAction(`Alarm for ${parsed.time} has been removed, sir.`);
        }
        clock?.dismissRing?.();
        return finishWithAction('Alarm dismissed, sir.');
      }

      // Stop ringing alarm
      if (/\b(stop|berhentikan|diamkan)\b/i.test(lower)) {
        clock?.dismissRing?.();
        return finishWithAction('Alarm stopped, sir.');
      }

      // Add new alarm (e.g. "pasang alarm jam 7 pagi", "alarm jam 8 malam", "alarm setengah 7 pagi", "alarm 15 menit lagi")
      const parsed = parseSpokenAlarm(lower);
      if (parsed?.time) {
        clock?.alarm?.add?.(parsed.time, parsed.label);
        return finishWithAction(`Alarm set for ${parsed.time}, sir.`);
      }

      return finishWithAction('Opening the Alarm tab, sir.');
    }

    // =========================================================================
    // 2. SPOTIFY & MUSIC CONTROLS (Pause, Resume/Play, Next, Prev, Specific Song)
    // =========================================================================

    // 2A. Pause / Stop Music on Spotify
    const isPauseMusic =
      /\b(pause|jeda|hentikan|berhentikan|berhenti|stop|matikan)\b.*\b(musik|musiknya|lagu|lagunya|spotify|music|song|track|pemutaran)\b/i.test(lower)
      || /\b(musik|musiknya|lagu|lagunya|spotify|music|song)\b.*\b(pause|jeda|hentikan|berhentikan|stop|matikan|dipause|dijeda|dihentikan)\b/i.test(lower)
      || /^(pause|jeda|stop musik|stop lagu|pause music|pause song)$/i.test(lower);

    if (isPauseMusic) {
      openIslandTab('media');
      api.media.command('pause');
      return finishWithAction('Music paused on Spotify, sir.');
    }

    // 2B. Next / Skip Track on Spotify
    if (
      /\b(next|skip|selanjutnya|berikutnya|ganti|lewatkan)\b.*\b(lagu|lagunya|musik|musiknya|spotify|song|track)\b/i.test(lower)
      || /\b(lagu|musik|song|track)\s+(selanjutnya|berikutnya|next)\b/i.test(lower)
      || /^(next|skip|next song|next track)$/i.test(lower)
    ) {
      openIslandTab('media');
      api.media.command('next');
      return finishWithAction('Skipping to the next track on Spotify, sir.');
    }

    // 2C. Previous Track on Spotify
    if (
      /\b(prev|previous|sebelumnya|ulang lagu|kembali ke lagu)\b.*\b(lagu|lagunya|musik|musiknya|spotify|song|track)?\b/i.test(lower)
      && /\b(prev|previous|sebelumnya)\b/i.test(lower)
    ) {
      openIslandTab('media');
      api.media.command('prev');
      return finishWithAction('Going back to the previous track, sir.');
    }

    // 2D. Play a Specific Song on Spotify (e.g. "buka spotify dan putar lagu merry christmas please don't call")
    const songQuery = extractSongQuery(lower);
    if (songQuery) {
      openIslandTab('media');
      const res = await api.jarvis.playSpotify(songQuery);
      const trackTitle = res?.title || songQuery;
      return finishWithAction(`Right away, sir. Opening Spotify and playing ${trackTitle}.`);
    }

    // 2E. Resume / Play Music (without a specific song title)
    if (
      /\b(lanjutkan|lanjut|resume)\b.*\b(musik|musiknya|lagu|lagunya|spotify|music|song)\b/i.test(lower)
      || /\b(putar|play|nyalakan|mainkan)\s+(musik|musiknya|lagu|lagunya|spotify|music)\b/i.test(lower)
      || /^(play|resume|putar musik|putar lagu|lanjutkan musik|lanjutkan lagu)$/i.test(lower)
    ) {
      openIslandTab('media');
      api.media.command('play');
      return finishWithAction('Resuming playback on Spotify, sir.');
    }

    // 2F. Open Spotify app
    if (/\b(buka spotify|open spotify|jalankan spotify)\b/i.test(lower)) {
      openIslandTab('media');
      api.media.command('open-spotify');
      return finishWithAction('Right away, sir. Opening Spotify.');
    }

    // =========================================================================
    // 2G. WHATSAPP WEB AUTOMATION (Send Chat Message, Call, Video Call, Open Chat)
    // =========================================================================
    const waCmd = extractWhatsAppCommand(lower);
    if (waCmd) {
      api.jarvis.whatsapp({
        action: waCmd.action,
        contact: waCmd.contact,
        message: waCmd.message,
      });

      if (waCmd.action === 'send') {
        return finishWithAction(`Right away, sir. Sending your WhatsApp message to ${waCmd.contact}.`);
      }
      if (waCmd.action === 'videocall') {
        return finishWithAction(`Right away, sir. Opening WhatsApp Web and starting a video call with ${waCmd.contact}.`);
      }
      if (waCmd.action === 'call') {
        return finishWithAction(`Right away, sir. Opening WhatsApp Web and calling ${waCmd.contact}.`);
      }
      return finishWithAction(`Right away, sir. Opening ${waCmd.contact}'s chat on WhatsApp Web.`);
    }

    // =========================================================================
    // 3. OPEN BROWSER / GOOGLE CHROME + WEBSITES
    // =========================================================================
    const mentionsChrome = /\b(google chrome|chrome)\b/.test(lower);
    const mentionsOpen = /\b(buka|bukain|open|jalankan|akses|pergi ke|masuk ke)\b/.test(lower);
    if (mentionsOpen) {
      const matchedSites = [];
      for (const site of KNOWN_SITES) {
        if (site.keys.some((k) => lower.includes(k))) {
          matchedSites.push(site);
        }
      }

      // Check YouTube search e.g. "buka youtube dan cari ..."
      const ytSearchMatch = lower.match(/youtube\s+(?:dan\s+|lalu\s+|and\s+)?(?:cari|putar|search)\s+(.+)/i);
      if (ytSearchMatch && ytSearchMatch[1]) {
        const q = ytSearchMatch[1].trim();
        const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
        await api.jarvis.openBrowser({ urls: [url], preferChrome: mentionsChrome });
        return finishWithAction(`Right away, sir. Opening YouTube and searching for ${q}.`);
      }

      // Check Google search e.g. "buka google chrome dan cari ..."
      const gSearchMatch = lower.match(/(?:google|chrome)\s+(?:dan\s+|lalu\s+|and\s+)?(?:cari|search|googling)\s+(.+)/i);
      if (gSearchMatch && gSearchMatch[1] && !gSearchMatch[1].startsWith('buka ')) {
        const q = gSearchMatch[1].trim();
        const url = `https://www.google.com/search?q=${encodeURIComponent(q)}`;
        await api.jarvis.openBrowser({ urls: [url], preferChrome: mentionsChrome });
        return finishWithAction(`Certainly, sir. Searching Google for ${q}.`);
      }

      if (matchedSites.length > 0) {
        const urls = matchedSites.map((s) => s.url);
        const names = matchedSites.map((s) => s.name).join(' and ');
        await api.jarvis.openBrowser({ urls, preferChrome: mentionsChrome });
        return finishWithAction(
          mentionsChrome
            ? `Right away, sir. Opening Google Chrome and launching ${names}.`
            : `Right away, sir. Opening ${names}.`,
        );
      }

      // Just "buka google chrome" or "buka google"
      if (mentionsChrome || /\b(buka|open)\s+google\b/.test(lower)) {
        await api.jarvis.openBrowser({ urls: ['https://www.google.com'], preferChrome: true });
        return finishWithAction('Right away, sir. Google Chrome is now open.');
      }
    }

    // 4. Calculator
    if ((/\b(kalkulator|calculator)\b/.test(lower) && mentionsOpen) || lower === 'kalkulator' || lower === 'calculator') {
      api.openCalc();
      openIslandTab('home');
      return finishWithAction('Right away, sir. Calculator is now open.');
    }

    // 5. Volume & Mute
    const volMatch = lower.match(/volume\s*(?:ke|jadi|di|to|at)?\s*(\d{1,3})/);
    if (volMatch) {
      const v = Math.max(0, Math.min(100, parseInt(volMatch[1], 10)));
      api.sysinfo.setVolume(v);
      return finishWithAction(`Volume set to ${v} percent, sir.`);
    }
    if (/\b(mute|bisukan|matikan suara)\b/.test(lower)) {
      api.sysinfo.toggleMute();
      return finishWithAction('Audio mute toggled, sir.');
    }
    if (/\b(besarkan|naikkan|tambah|increase|raise)\s+(volume|suara)\b/.test(lower)) {
      const nextV = Math.min(100, (sysinfo?.volume ?? 50) + 20);
      api.sysinfo.setVolume(nextV);
      return finishWithAction(`Volume increased to ${nextV} percent, sir.`);
    }
    if (/\b(kecilkan|turunkan|kurangi|decrease|lower)\s+(volume|suara)\b/.test(lower)) {
      const nextV = Math.max(0, (sysinfo?.volume ?? 50) - 20);
      api.sysinfo.setVolume(nextV);
      return finishWithAction(`Volume lowered to ${nextV} percent, sir.`);
    }

    // 6. Saved Shortcuts & Desktop Apps
    const folders = config?.folders || [];
    for (const f of folders) {
      const fname = String(f.name || '').toLowerCase();
      if (fname && mentionsOpen && lower.includes(fname)) {
        api.openFolder(f.path);
        return finishWithAction(`Right away, sir. Opening ${f.name}.`);
      }
    }

    // 7. AI Action Planner (handles ANY flexible/multi-step command or general question!)
    const plan = await api.jarvis.interpret(clean);
    if (plan?.ok) {
      if (Array.isArray(plan.actions) && plan.actions.length > 0) {
        await executeStructuredActions(plan.actions);
        return finishWithAction(plan.reply || 'Right away, sir.');
      }
      if (plan.reply) {
        if (!skipAutoChatSwitch) {
          openIslandTab('gemini');
          setPinned(true);
        }
        return finishWithAction(plan.reply);
      }
    }

    // Fallback to Gemini chat
    if (!skipAutoChatSwitch) {
      openIslandTab('gemini');
      setPinned(true);
    }
    const res = await api.gemini.ask({
      messages: [{ role: 'user', content: clean }],
    });
    const reply = res?.ok && res.text
      ? res.text
      : 'Apologies, sir. I could not reach the server at the moment.';
    return finishWithAction(reply);
  }, [clock, config, executeStructuredActions, onVoiceChatTurn, openIslandTab, setPinned, speak, sysinfo]);

  const stopListening = useCallback(async (cancel = false) => {
    const rec = recorderRef.current;
    if (!rec) return;
    recorderRef.current = null;
    clearTimeout(rec.maxTimer);

    try {
      rec.processor.disconnect();
      rec.source.disconnect();
      rec.stream.getTracks().forEach((t) => t.stop());
      await rec.ctx.close();
    } catch { /* ignore */ }

    setLevel(0);
    if (cancel || !rec.chunks.length) {
      setStatus('idle');
      return;
    }

    setStatus('processing');
    try {
      const b64 = downsampleTo16kHzPCMBase64(rec.chunks, rec.sampleRate);
      const stt = await api.jarvis.transcribe(b64, 'id-ID');
      if (stt?.ok && stt.transcript) {
        await handleCommand(stt.transcript);
      } else {
        setLastReply(stt?.error || 'Could not hear clearly, sir.');
        setStatus('idle');
      }
    } catch {
      setStatus('idle');
    }
  }, [handleCommand]);

  const startListening = useCallback(async () => {
    stopSpeaking();
    if (recorderRef.current) {
      await stopListening(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);

      const chunks = [];
      let hasSpoken = false;
      let silenceMs = 0;
      const startTime = Date.now();

      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        chunks.push(new Float32Array(input));

        let sum = 0;
        for (let i = 0; i < input.length; i += 1) {
          sum += input[i] * input[i];
        }
        const rms = Math.sqrt(sum / input.length);
        const uiLevel = Math.min(100, Math.round(rms * 420));
        setLevel(uiLevel);

        const frameMs = (input.length / ctx.sampleRate) * 1000;
        if (rms > 0.016) {
          hasSpoken = true;
          silenceMs = 0;
        } else if (hasSpoken) {
          silenceMs += frameMs;
          if (silenceMs >= 1250 && Date.now() - startTime > 1000) {
            stopListening(false);
          }
        }
      };

      source.connect(processor);
      processor.connect(ctx.destination);

      const maxTimer = setTimeout(() => {
        stopListening(false);
      }, 10000);

      recorderRef.current = {
        ctx,
        stream,
        source,
        processor,
        chunks,
        sampleRate: ctx.sampleRate,
        maxTimer,
      };
      setLastTranscript('');
      setStatus('listening');
    } catch {
      setLastReply('Microphone access unavailable.');
      setStatus('idle');
    }
  }, [stopListening, stopSpeaking]);

  const toggleListening = useCallback(() => {
    if (status === 'listening') {
      stopListening(false);
    } else if (status === 'speaking') {
      stopSpeaking();
    } else if (status === 'idle') {
      startListening();
    }
  }, [startListening, status, stopListening, stopSpeaking]);

  return {
    status,
    level,
    lastTranscript,
    lastReply,
    voiceEnabled,
    setVoiceEnabled,
    startListening,
    stopListening,
    stopSpeaking,
    toggleListening,
    handleCommand,
    speak,
  };
}
