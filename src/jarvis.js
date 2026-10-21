import { useCallback, useRef, useState } from 'react';

const api = window.island;

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

  const handleCommand = useCallback(async (rawText) => {
    const clean = String(rawText || '').trim();
    if (!clean) {
      setStatus('idle');
      return;
    }
    setLastTranscript(clean);
    const lower = clean
      .toLowerCase()
      .replace(/^(halo|hai|hey|hei|ok|oke)?\s*(jarvis|gemini)\s*[,.:!-]?\s*/i, '')
      .trim();

    const finishWithAction = async (replyText) => {
      setLastReply(replyText);
      onVoiceChatTurn?.(clean, replyText);
      await speak(replyText);
    };

    // 1. Calculator
    if (/\b(kalkulator|calculator|hitung)\b/.test(lower) && /\b(buka|open|jalankan|nyalakan)\b/.test(lower) || lower === 'kalkulator' || lower === 'calculator') {
      api.openCalc();
      setTab('home');
      await finishWithAction('Siap bos, kalkulator sudah dibuka.');
      return;
    }

    // 2. Spotify / Music controls
    if (/\b(buka spotify|open spotify)\b/.test(lower)) {
      api.media.command('open-spotify');
      setTab('media');
      await finishWithAction('Siap, membuka Spotify.');
      return;
    }
    if (/\b(putar|play|lanjutkan|nyalakan)\s+(musik|lagu|spotify)\b/.test(lower) || lower === 'play' || lower === 'putar musik') {
      api.media.command('play');
      setTab('media');
      await finishWithAction('Siap, memutar musik.');
      return;
    }
    if (/\b(pause|jeda|hentikan|stop|matikan)\s+(musik|lagu|spotify)\b/.test(lower) || lower === 'pause') {
      api.media.command('pause');
      await finishWithAction('Musik sudah dijeda.');
      return;
    }
    if (/\b(next|skip|selanjutnya|berikutnya|ganti)\s*(lagu|musik)?\b/.test(lower) && /\b(lagu|musik|next|skip)\b/.test(lower)) {
      api.media.command('next');
      setTab('media');
      await finishWithAction('Mengganti ke lagu berikutnya.');
      return;
    }
    if (/\b(prev|previous|sebelumnya)\s*(lagu|musik)?\b/.test(lower)) {
      api.media.command('prev');
      setTab('media');
      await finishWithAction('Kembali ke lagu sebelumnya.');
      return;
    }
    if (/\b(lirik|buka musik|menu musik)\b/.test(lower)) {
      setTab('media');
      await finishWithAction('Menampilkan lirik dan pemutar musik.');
      return;
    }

    // 3. Timer / Stopwatch / Alarm
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
        await finishWithAction(`Siap bos, timer ${num} ${unit} sudah dimulai.`);
        return;
      }
    }
    if (/\b(stop|hentikan|reset|matikan)\s+timer\b/.test(lower)) {
      clock?.timer?.reset();
      setTab('clock');
      await finishWithAction('Timer sudah dihentikan.');
      return;
    }
    if (/\b(mulai|jalankan|start)\s+stopwatch\b/.test(lower)) {
      if (!clock?.stopwatch?.running) clock?.stopwatch?.toggle();
      setTab('clock');
      await finishWithAction('Stopwatch dimulai.');
      return;
    }
    if (/\b(stop|hentikan|reset)\s+stopwatch\b/.test(lower)) {
      clock?.stopwatch?.reset();
      setTab('clock');
      await finishWithAction('Stopwatch direset.');
      return;
    }
    const alarmMatch = lower.match(/alarm\s+(?:jam\s+|pukul\s+)?(\d{1,2})(?:[:.](\d{2}))?/i);
    if (alarmMatch) {
      const hh = String(Math.min(23, parseInt(alarmMatch[1], 10))).padStart(2, '0');
      const mm = String(Math.min(59, parseInt(alarmMatch[2] || '0', 10))).padStart(2, '0');
      clock?.alarms?.add(`${hh}:${mm}`, 'Jarvis Alarm');
      setTab('clock');
      await finishWithAction(`Siap, alarm pukul ${hh}:${mm} sudah dipasang.`);
      return;
    }

    // 4. Volume & Mute
    const volMatch = lower.match(/volume\s*(?:ke|jadi|di)?\s*(\d{1,3})/);
    if (volMatch) {
      const v = Math.max(0, Math.min(100, parseInt(volMatch[1], 10)));
      api.sysinfo.setVolume(v);
      await finishWithAction(`Volume diatur ke ${v} persen.`);
      return;
    }
    if (/\b(mute|bisukan|matikan suara)\b/.test(lower)) {
      api.sysinfo.toggleMute();
      await finishWithAction('Status mute suara diubah.');
      return;
    }
    if (/\b(besarkan|naikkan|tambah)\s+(volume|suara)\b/.test(lower)) {
      const nextV = Math.min(100, (sysinfo?.volume ?? 50) + 20);
      api.sysinfo.setVolume(nextV);
      await finishWithAction(`Volume dinaikkan ke ${nextV} persen.`);
      return;
    }
    if (/\b(kecilkan|turunkan|kurangi)\s+(volume|suara)\b/.test(lower)) {
      const nextV = Math.max(0, (sysinfo?.volume ?? 50) - 20);
      api.sysinfo.setVolume(nextV);
      await finishWithAction(`Volume dikecilkan ke ${nextV} persen.`);
      return;
    }

    // 5. Pin / Navigation / Folders / Google Search
    if (/\b(lepas pin|unpin|buka kunci)\b/.test(lower)) {
      setPinned(false);
      await finishWithAction('Pin Dynamic Island dilepas.');
      return;
    }
    if (/\b(pin|kunci layar|tetap buka)\b/.test(lower)) {
      setPinned(true);
      await finishWithAction('Dynamic Island sudah di-pin agar tetap terbuka.');
      return;
    }
    if (/\b(buka|ke)\s+(stash|catatan|clipboard)\b/.test(lower)) {
      setTab('stash');
      await finishWithAction('Membuka tab Stash dan catatan.');
      return;
    }
    if (/\b(buka|ke)\s+(clock|jam|waktu)\b/.test(lower)) {
      setTab('clock');
      await finishWithAction('Membuka menu waktu.');
      return;
    }
    if (/\b(buka|ke)\s+(home|beranda|menu utama)\b/.test(lower)) {
      setTab('home');
      await finishWithAction('Membuka menu utama.');
      return;
    }
    if (/\b(buka)\s+(google drive|drive)\b/.test(lower)) {
      api.openUrl('https://drive.google.com');
      await finishWithAction('Membuka Google Drive.');
      return;
    }
    if (/\b(buka)\s+(gmail|email)\b/.test(lower)) {
      api.openUrl('https://mail.google.com');
      await finishWithAction('Membuka Gmail.');
      return;
    }
    if (/\b(buka)\s+(google calendar|kalender|calendar)\b/.test(lower)) {
      api.openUrl('https://calendar.google.com');
      await finishWithAction('Membuka Google Calendar.');
      return;
    }
    if (/\b(buka)\s+(popup gemini|jendela gemini|aplikasi gemini)\b/.test(lower)) {
      api.gemini.openPopup();
      await finishWithAction('Membuka jendela pop-up Google Gemini.');
      return;
    }

    // Check saved shortcuts by name
    const folders = config?.folders || [];
    for (const f of folders) {
      const fname = String(f.name || '').toLowerCase();
      if (fname && (lower === `buka ${fname}` || lower === `open ${fname}` || lower.includes(`buka folder ${fname}`) || lower.includes(`buka aplikasi ${fname}`))) {
        api.openFolder(f.path);
        await finishWithAction(`Siap, membuka ${f.name}.`);
        return;
      }
    }

    // Google search command
    const searchMatch = lower.match(/^(?:cari di google|cari|search|googling)\s+(?:tentang\s+)?(.+)/i);
    if (searchMatch && searchMatch[1]) {
      const q = searchMatch[1].trim();
      api.search(q);
      await finishWithAction(`Mencari ${q} di Google.`);
      return;
    }

    // 6. General Question -> Send to Gemini AI & Speak back!
    setTab('gemini');
    setPinned(true);
    const res = await api.gemini.ask({
      messages: [{ role: 'user', content: clean }],
    });
    const reply = res?.ok && res.text
      ? res.text
      : `Maaf bos, gagal memproses jawaban: ${res?.error || 'Koneksi terputus.'}`;
    setLastReply(reply);
    onVoiceChatTurn?.(clean, reply);
    await speak(reply);
  }, [clock, config, onVoiceChatTurn, setPinned, setTab, speak, sysinfo]);

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
          if (silenceMs >= 1150 && Date.now() - startTime > 900) {
            stopListening(false);
          }
        }
      };

      source.connect(processor);
      processor.connect(ctx.destination);

      const maxTimer = setTimeout(() => {
        stopListening(false);
      }, 9500);

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
    } catch (err) {
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
    speak,
  };
}
