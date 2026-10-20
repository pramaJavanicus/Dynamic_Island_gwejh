import { useCallback, useEffect, useRef, useState } from 'react';

const ALARMS_KEY = 'di_alarms_v1';

function loadAlarms() {
  try {
    const raw = JSON.parse(localStorage.getItem(ALARMS_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function saveAlarms(list) {
  try {
    localStorage.setItem(ALARMS_KEY, JSON.stringify(list));
  } catch { /* ignore */ }
}

// Plays a pleasant iOS-style marimba/chime pattern using Web Audio API
function playChimePattern() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.13);
      gain.gain.setValueAtTime(0.001, ctx.currentTime + i * 0.13);
      gain.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + i * 0.13 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.13 + 0.32);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.13);
      osc.stop(ctx.currentTime + i * 0.13 + 0.35);
    });
    setTimeout(() => ctx.close().catch(() => {}), 1200);
  } catch { /* ignore audio errors */ }
}

export function formatMinSec(totalSec) {
  const s = Math.max(0, Math.ceil(totalSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

export function formatStopwatch(ms) {
  const totalCs = Math.floor(ms / 10);
  const cs = totalCs % 100;
  const totalSec = Math.floor(totalCs / 100);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

export function useClockTools({ onRing } = {}) {
  const [subTab, setSubTab] = useState('timer'); // 'timer' | 'stopwatch' | 'alarm'

  // --- 1. TIMER ---
  const [timerTotal, setTimerTotal] = useState(300); // default 5 min (seconds)
  const [timerLeft, setTimerLeft] = useState(300);
  const [timerRunning, setTimerRunning] = useState(false);
  const timerEndRef = useRef(null);

  // --- 2. STOPWATCH ---
  const [swElapsed, setSwElapsed] = useState(0); // ms
  const [swRunning, setSwRunning] = useState(false);
  const [swLaps, setSwLaps] = useState([]);
  const swStartRef = useRef(null);
  const swAccumRef = useRef(0);

  // --- 3. ALARMS ---
  const [alarms, setAlarms] = useState(loadAlarms);
  const lastTriggeredRef = useRef(''); // "id|HH:MM" to prevent re-triggering within same minute

  // --- RINGING ALERT ---
  const [ringing, setRinging] = useState(null); // { type: 'timer'|'alarm', title: string }
  const onRingRef = useRef(onRing);
  useEffect(() => { onRingRef.current = onRing; }, [onRing]);

  // Repeat chime while ringing
  useEffect(() => {
    if (!ringing) return undefined;
    playChimePattern();
    const id = setInterval(playChimePattern, 2000);
    return () => clearInterval(id);
  }, [ringing]);

  const triggerRing = useCallback((payload) => {
    setRinging(payload);
    onRingRef.current?.(payload);
  }, []);

  const dismissRing = useCallback(() => {
    setRinging(null);
  }, []);

  // Timer tick
  useEffect(() => {
    if (!timerRunning) return undefined;
    const id = setInterval(() => {
      const rem = Math.max(0, (timerEndRef.current - Date.now()) / 1000);
      setTimerLeft(rem);
      if (rem <= 0) {
        setTimerRunning(false);
        setTimerLeft(0);
        triggerRing({ type: 'timer', title: 'Timer Selesai!' });
      }
    }, 200);
    return () => clearInterval(id);
  }, [timerRunning, triggerRing]);

  const startTimer = useCallback((customSec) => {
    const sec = typeof customSec === 'number' ? customSec : (timerLeft > 0 ? timerLeft : timerTotal);
    if (sec <= 0) return;
    if (typeof customSec === 'number') {
      setTimerTotal(customSec);
      setTimerLeft(customSec);
    }
    timerEndRef.current = Date.now() + sec * 1000;
    setRinging(null);
    setTimerRunning(true);
  }, [timerLeft, timerTotal]);

  const pauseTimer = useCallback(() => {
    if (!timerRunning) return;
    const rem = Math.max(0, (timerEndRef.current - Date.now()) / 1000);
    setTimerLeft(rem);
    setTimerRunning(false);
  }, [timerRunning]);

  const resetTimer = useCallback((newTotalSec) => {
    setTimerRunning(false);
    const next = typeof newTotalSec === 'number' ? newTotalSec : timerTotal;
    if (typeof newTotalSec === 'number') setTimerTotal(next);
    setTimerLeft(next);
  }, [timerTotal]);

  const addTimerSeconds = useCallback((deltaSec) => {
    if (timerRunning) {
      timerEndRef.current += deltaSec * 1000;
      const rem = Math.max(0, (timerEndRef.current - Date.now()) / 1000);
      setTimerLeft(rem);
      setTimerTotal((t) => Math.max(t, Math.ceil(rem)));
    } else {
      const next = Math.max(10, Math.round(timerLeft + deltaSec));
      setTimerTotal(next);
      setTimerLeft(next);
    }
  }, [timerRunning, timerLeft]);

  // Stopwatch tick (30ms for smooth centiseconds)
  useEffect(() => {
    if (!swRunning) return undefined;
    const id = setInterval(() => {
      setSwElapsed(swAccumRef.current + (Date.now() - swStartRef.current));
    }, 33);
    return () => clearInterval(id);
  }, [swRunning]);

  const toggleStopwatch = useCallback(() => {
    if (swRunning) {
      swAccumRef.current += Date.now() - swStartRef.current;
      setSwElapsed(swAccumRef.current);
      setSwRunning(false);
    } else {
      swStartRef.current = Date.now();
      setSwRunning(true);
    }
  }, [swRunning]);

  const resetStopwatch = useCallback(() => {
    setSwRunning(false);
    swAccumRef.current = 0;
    setSwElapsed(0);
    setSwLaps([]);
  }, []);

  const lapStopwatch = useCallback(() => {
    if (!swRunning && swElapsed === 0) return;
    setSwLaps((prev) => [swElapsed, ...prev].slice(0, 20));
  }, [swRunning, swElapsed]);

  // Alarms check every second
  useEffect(() => {
    saveAlarms(alarms);
  }, [alarms]);

  useEffect(() => {
    if (!alarms.some((a) => a.enabled)) return undefined;
    const id = setInterval(() => {
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const sec = now.getSeconds();
      if (sec > 3) return; // trigger right at the start of the minute
      for (const a of alarms) {
        if (!a.enabled || a.time !== hhmm) continue;
        const key = `${a.id}|${hhmm}`;
        if (lastTriggeredRef.current === key) continue;
        lastTriggeredRef.current = key;
        triggerRing({ type: 'alarm', title: a.label || `Alarm ${a.time}`, time: a.time });
        break;
      }
    }, 1000);
    return () => clearInterval(id);
  }, [alarms, triggerRing]);

  const addAlarm = useCallback((time, label = '') => {
    if (!/^\d{2}:\d{2}$/.test(time)) return;
    setAlarms((prev) => [
      ...prev,
      { id: String(Date.now()), time, label: label.trim() || 'Alarm', enabled: true },
    ].sort((a, b) => a.time.localeCompare(b.time)));
  }, []);

  const toggleAlarm = useCallback((id) => {
    setAlarms((prev) => prev.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a)));
  }, []);

  const removeAlarm = useCallback((id) => {
    setAlarms((prev) => prev.filter((a) => a.id !== id));
  }, []);

  return {
    subTab,
    setSubTab,
    ringing,
    dismissRing,
    timer: {
      total: timerTotal,
      left: timerLeft,
      running: timerRunning,
      start: startTimer,
      pause: pauseTimer,
      reset: resetTimer,
      addSeconds: addTimerSeconds,
    },
    stopwatch: {
      elapsed: swElapsed,
      running: swRunning,
      laps: swLaps,
      toggle: toggleStopwatch,
      reset: resetStopwatch,
      lap: lapStopwatch,
    },
    alarm: {
      list: alarms,
      add: addAlarm,
      toggle: toggleAlarm,
      remove: removeAlarm,
    },
  };
}
