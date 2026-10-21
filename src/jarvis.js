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
  // Matches phrases like:
  // "buka spotify dan putar lagu merry christmas please don't call"
  // "putar lagu merry christmas please don't call di spotify"
  // "stel lagu ...", "mainkan lagu ...", "play lagu ...", "play song ..."
  const patterns = [
    /(?:putar|putarkan|mainkan|stel|setel|nyalakan|play)\s+(?:lagu|musik|song|track)\s+(?:yang\s+judulnya\s+|berjudul\s+)?(.+?)(?:\s+di\s+spotify|\s+lewat\s+spotify|\s+sekarang|\s+dong|\s+ya)?$/i,
    /spotify\s+(?:dan\s+|lalu\s+|terus\s+)?(?:tolong\s+)?(?:putar|putarkan|mainkan|stel|setel|play)\s+(?:lagu\s+|musik\s+|song\s+)?(.+?)(?:\s+sekarang|\s+dong|\s+ya)?$/i,
    /(?:putar|putarkan|mainkan|stel|setel|play)\s+(.+?)\s+di\s+spotify$/i,
  ];
  for (const rx of patterns) {
    const m = lower.match(rx);
    if (m && m[1]) {
      const q = m[1].trim().replace(/^(lagu|musik|song)\s+/i, '').trim();
      if (q && !['musik', 'lagu', 'spotify', 'sekarang'].includes(q.toLowerCase())) {
        return q;
      }
    }
  }
  return null;
}

export function useJarvis({
  setTab,
  setPinned,
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
        u.lang = 'id-ID';
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
          setTab('media');
          await api.jarvis.playSpotify(act.query || '');
          break;
        }
        case 'media': {
          if (act.cmd === 'open-spotify') setTab('media');
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
          const secs = Number(act.seconds) || 0;
          if (secs > 0) {
            clock?.timer?.startPreset(secs);
            setTab('clock');
          }
          break;
        }
        case 'stopwatch': {
          if (act.cmd === 'reset') clock?.stopwatch?.reset();
          else if (!clock?.stopwatch?.running) clock?.stopwatch?.toggle();
          setTab('clock');
          break;
        }
        case 'alarm': {
          if (act.time) {
            clock?.alarms?.add(act.time, act.label || 'Jarvis Alarm');
            setTab('clock');
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
          if (act.tab) setTab(act.tab);
          break;
        }
        case 'pin': {
          setPinned(act.value !== false);
          break;
        }
        default:
          break;
      }
    }
  }, [clock, setPinned, setTab]);

  const handleCommand = useCallback(async (rawText, { skipAutoChatSwitch = false } = {}) => {
    const clean = String(rawText || '').trim();
    if (!clean) {
      setStatus('idle');
      return { handled: false };
    }
    setLastTranscript(clean);
    const lower = clean
      .toLowerCase()
      .replace(/^(halo|hai|hey|hei|ok|oke)?\s*(jarvis|gemini)?\s*(tolong|coba|bisa|minta)?\s*[,.:!-]?\s*/i, '')
      .trim();

    const finishWithAction = async (replyText) => {
      setLastReply(replyText);
      if (!skipAutoChatSwitch) {
        onVoiceChatTurn?.(clean, replyText);
      }
      await speak(replyText);
      return { handled: true, reply: replyText };
    };

    // 1. Specific Song on Spotify (e.g. "buka spotify dan putar lagu merry christmas please don't call")
    const songQuery = extractSongQuery(lower);
    if (songQuery) {
      setTab('media');
      const res = await api.jarvis.playSpotify(songQuery);
      const trackTitle = res?.title || songQuery;
      return finishWithAction(`Siap bos, membuka Spotify dan memutar lagu ${trackTitle}.`);
    }

    // 2. Open Browser / Google Chrome + Websites (e.g. "buka google chrome dan buka web whatsapp")
    const mentionsChrome = /\b(google chrome|chrome)\b/.test(lower);
    const mentionsOpen = /\b(buka|bukain|open|jalankan|akses|pergi ke|masuk ke)\b/.test(lower);
    if (mentionsOpen) {
      const matchedSites = [];
      for (const site of KNOWN_SITES) {
        if (site.keys.some((k) => lower.includes(k))) {
          matchedSites.push(site);
        }
      }

      // Check Youtube search e.g. "buka youtube dan cari ..."
      const ytSearchMatch = lower.match(/youtube\s+(?:dan\s+|lalu\s+)?(?:cari|putar|search)\s+(.+)/i);
      if (ytSearchMatch && ytSearchMatch[1]) {
        const q = ytSearchMatch[1].trim();
        const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
        await api.jarvis.openBrowser({ urls: [url], preferChrome: mentionsChrome });
        return finishWithAction(`Siap bos, membuka YouTube dan mencari ${q}.`);
      }

      // Check Google search e.g. "buka google chrome dan cari ..."
      const gSearchMatch = lower.match(/(?:google|chrome)\s+(?:dan\s+|lalu\s+)?(?:cari|search|googling)\s+(.+)/i);
      if (gSearchMatch && gSearchMatch[1] && !gSearchMatch[1].startsWith('buka ')) {
        const q = gSearchMatch[1].trim();
        const url = `https://www.google.com/search?q=${encodeURIComponent(q)}`;
        await api.jarvis.openBrowser({ urls: [url], preferChrome: mentionsChrome });
        return finishWithAction(`Siap bos, mencari ${q} di Google.`);
      }

      if (matchedSites.length > 0) {
        const urls = matchedSites.map((s) => s.url);
        const names = matchedSites.map((s) => s.name).join(' dan ');
        await api.jarvis.openBrowser({ urls, preferChrome: mentionsChrome });
        return finishWithAction(
          mentionsChrome
            ? `Siap bos, membuka Google Chrome dan menuju ke ${names}.`
            : `Siap bos, membuka ${names}.`,
        );
      }

      // Just "buka google chrome" or "buka google"
      if (mentionsChrome || /\bbuka\s+google\b/.test(lower)) {
        await api.jarvis.openBrowser({ urls: ['https://www.google.com'], preferChrome: true });
        return finishWithAction('Siap bos, Google Chrome sudah dibuka.');
      }
    }

    // 3. Calculator
    if ((/\b(kalkulator|calculator)\b/.test(lower) && mentionsOpen) || lower === 'kalkulator' || lower === 'calculator') {
      api.openCalc();
      setTab('home');
      return finishWithAction('Siap bos, kalkulator sudah dibuka.');
    }

    // 4. General Spotify / Music controls (without a specific song title)
    if (/\b(buka spotify|open spotify)\b/.test(lower)) {
      api.media.command('open-spotify');
      setTab('media');
      return finishWithAction('Siap, membuka Spotify.');
    }
    if (/\b(putar|play|lanjutkan|nyalakan)\s+(musik|lagu|spotify)\b/.test(lower) || lower === 'play' || lower === 'putar musik') {
      api.media.command('play');
      setTab('media');
      return finishWithAction('Siap, memutar musik.');
    }
    if (/\b(pause|jeda|hentikan|stop|matikan)\s+(musik|lagu|spotify)\b/.test(lower) || lower === 'pause') {
      api.media.command('pause');
      return finishWithAction('Musik sudah dijeda.');
    }
    if (/\b(next|skip|selanjutnya|berikutnya|ganti)\s*(lagu|musik)?\b/.test(lower) && /\b(lagu|musik|next|skip)\b/.test(lower)) {
      api.media.command('next');
      setTab('media');
      return finishWithAction('Mengganti ke lagu berikutnya.');
    }
    if (/\b(prev|previous|sebelumnya)\s*(lagu|musik)?\b/.test(lower)) {
      api.media.command('prev');
      setTab('media');
      return finishWithAction('Kembali ke lagu sebelumnya.');
    }

    // 5. Timer / Stopwatch / Alarm
    const timerMatch = lower.match(/timer\s+(\d+)\s*(menit|detik|jam|minute|second)/i);
    if (timerMatch) {
      const num = parseInt(timerMatch[1], 10);
      const unit = timerMatch[2].toLowerCase();
      const secs = unit.startsWith('jam')
        ? num * 3600
        : unit.startsWith('det') || unit.startsWith('sec')
          ? num
          : num * 60;
      if (secs > 0) {
        clock?.timer?.startPreset(secs);
        setTab('clock');
        return finishWithAction(`Siap bos, timer ${num} ${unit} sudah dimulai.`);
      }
    }
    if (/\b(stop|hentikan|reset|matikan)\s+timer\b/.test(lower)) {
      clock?.timer?.reset();
      setTab('clock');
      return finishWithAction('Timer sudah dihentikan.');
    }
    if (/\b(mulai|jalankan|start)\s+stopwatch\b/.test(lower)) {
      if (!clock?.stopwatch?.running) clock?.stopwatch?.toggle();
      setTab('clock');
      return finishWithAction('Stopwatch dimulai.');
    }
    if (/\b(stop|hentikan|reset)\s+stopwatch\b/.test(lower)) {
      clock?.stopwatch?.reset();
      setTab('clock');
      return finishWithAction('Stopwatch direset.');
    }
    const alarmMatch = lower.match(/alarm\s+(?:jam\s+|pukul\s+)?(\d{1,2})(?:[:.](\d{2}))?/i);
    if (alarmMatch) {
      const hh = String(Math.min(23, parseInt(alarmMatch[1], 10))).padStart(2, '0');
      const mm = String(Math.min(59, parseInt(alarmMatch[2] || '0', 10))).padStart(2, '0');
      clock?.alarms?.add(`${hh}:${mm}`, 'Jarvis Alarm');
      setTab('clock');
      return finishWithAction(`Siap, alarm pukul ${hh}:${mm} sudah dipasang.`);
    }

    // 6. Volume & Mute
    const volMatch = lower.match(/volume\s*(?:ke|jadi|di)?\s*(\d{1,3})/);
    if (volMatch) {
      const v = Math.max(0, Math.min(100, parseInt(volMatch[1], 10)));
      api.sysinfo.setVolume(v);
      return finishWithAction(`Volume diatur ke ${v} persen.`);
    }
    if (/\b(mute|bisukan|matikan suara)\b/.test(lower)) {
      api.sysinfo.toggleMute();
      return finishWithAction('Status mute suara diubah.');
    }
    if (/\b(besarkan|naikkan|tambah)\s+(volume|suara)\b/.test(lower)) {
      const nextV = Math.min(100, (sysinfo?.volume ?? 50) + 20);
      api.sysinfo.setVolume(nextV);
      return finishWithAction(`Volume dinaikkan ke ${nextV} persen.`);
    }
    if (/\b(kecilkan|turunkan|kurangi)\s+(volume|suara)\b/.test(lower)) {
      const nextV = Math.max(0, (sysinfo?.volume ?? 50) - 20);
      api.sysinfo.setVolume(nextV);
      return finishWithAction(`Volume dikecilkan ke ${nextV} persen.`);
    }

    // 7. Saved Shortcuts & Desktop Apps
    const folders = config?.folders || [];
    for (const f of folders) {
      const fname = String(f.name || '').toLowerCase();
      if (fname && mentionsOpen && lower.includes(fname)) {
        api.openFolder(f.path);
        return finishWithAction(`Siap, membuka ${f.name}.`);
      }
    }

    // 8. AI Action Planner (handles ANY flexible/multi-step command or general question!)
    const plan = await api.jarvis.interpret(clean);
    if (plan?.ok) {
      if (Array.isArray(plan.actions) && plan.actions.length > 0) {
        await executeStructuredActions(plan.actions);
        return finishWithAction(plan.reply || 'Siap bos, perintah sudah dijalankan.');
      }
      if (plan.reply) {
        if (!skipAutoChatSwitch) {
          setTab('gemini');
          setPinned(true);
        }
        return finishWithAction(plan.reply);
      }
    }

    // Fallback to Gemini chat
    if (!skipAutoChatSwitch) {
      setTab('gemini');
      setPinned(true);
    }
    const res = await api.gemini.ask({
      messages: [{ role: 'user', content: clean }],
    });
    const reply = res?.ok && res.text
      ? res.text
      : `Maaf bos, gagal memproses jawaban: ${res?.error || 'Koneksi terputus.'}`;
    return finishWithAction(reply);
  }, [clock, config, executeStructuredActions, onVoiceChatTurn, setPinned, setTab, speak, sysinfo]);

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
        setLastReply(stt?.error || 'Suara tidak terdengar jelas.');
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
      setLastReply('Tidak dapat mengakses mikrofon.');
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
