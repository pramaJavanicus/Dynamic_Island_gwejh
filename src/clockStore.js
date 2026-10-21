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
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + i * 0.13 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.13 + 0.34);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.13);
      osc.stop(ctx.currentTime + i * 0.13 + 0.36);
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
  const timerTotalRef = useRef(300);
  const timerLeftRef = useRef(300);
  const timerRunningRef = useRef(false);

  useEffect(() => { timerTotalRef.current = timerTotal; }, [timerTotal]);
  useEffect(() => { timerLeftRef.current = timerLeft; }, [timerLeft]);
  useEffect(() => { timerRunningRef.current = timerRunning; }, [timerRunning]);

  // --- 2. STOPWATCH ---
  const [swElapsed, setSwElapsed] = useState(0); // ms
  const [swRunning, setSwRunning] = useState(false);
  const [swLaps, setSwLaps] = useState([]);
  const swStartRef = useRef(null);
  const swAccumRef = useRef(0);
  const swRunningRef = useRef(false);
  const swElapsedRef = useRef(0);

  useEffect(() => { swRunningRef.current = swRunning; }, [swRunning]);
  useEffect(() => { swElapsedRef.current = swElapsed; }, [swElapsed]);

  // --- 3. ALARMS ---
  const [alarms, setAlarms] = useState(loadAlarms);
  const lastTriggeredRef = useRef(''); // "id|YYYY-MM-DD|HH:MM" to prevent re-triggering within same minute

  // --- RINGING ALERT ---
  const [ringing, setRinging] = useState(null); // { type: 'timer'|'alarm', title: string, time?: string }
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
    setSubTab(payload?.type === 'alarm' ? 'alarm' : 'timer');
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
      timerLeftRef.current = rem;
      setTimerLeft(rem);
      if (rem <= 0) {
        timerRunningRef.current = false;
        setTimerRunning(false);
        timerLeftRef.current = 0;
        setTimerLeft(0);
        triggerRing({ type: 'timer', title: 'Timer Selesai!' });
      }
    }, 150);
    return () => clearInterval(id);
  }, [timerRunning, triggerRing]);

  const startTimer = useCallback((customSec) => {
    setSubTab('timer');
    const hasCustom = typeof customSec === 'number' && !Number.isNaN(customSec) && customSec > 0;
    const fallbackSec = timerLeftRef.current > 0 ? timerLeftRef.current : timerTotalRef.current;
    const sec = hasCustom ? Math.round(customSec) : Math.max(1, fallbackSec);
    if (hasCustom) {
      timerTotalRef.current = sec;
      timerLeftRef.current = sec;
      setTimerTotal(sec);
      setTimerLeft(sec);
    } else if (timerLeftRef.current <= 0) {
      timerLeftRef.current = sec;
      setTimerLeft(sec);
    }
    timerEndRef.current = Date.now() + sec * 1000;
    setRinging(null);
    timerRunningRef.current = true;
    setTimerRunning(true);
  }, []);

  const pauseTimer = useCallback(() => {
    setSubTab('timer');
    if (!timerRunningRef.current) return;
    const rem = Math.max(0, (timerEndRef.current - Date.now()) / 1000);
    timerLeftRef.current = rem;
    setTimerLeft(rem);
    timerRunningRef.current = false;
    setTimerRunning(false);
  }, []);

  const resetTimer = useCallback((newTotalSec) => {
    setSubTab('timer');
    timerRunningRef.current = false;
    setTimerRunning(false);
    setRinging((r) => (r?.type === 'timer' ? null : r));
    const hasNew = typeof newTotalSec === 'number' && !Number.isNaN(newTotalSec) && newTotalSec > 0;
    const next = hasNew ? Math.round(newTotalSec) : timerTotalRef.current;
    if (hasNew) {
      timerTotalRef.current = next;
      setTimerTotal(next);
    }
    timerLeftRef.current = next;
    setTimerLeft(next);
  }, []);

  const addTimerSeconds = useCallback((deltaSec) => {
    setSubTab('timer');
    const d = Number(deltaSec) || 0;
    if (!d) return;
    if (timerRunningRef.current) {
      timerEndRef.current = Math.max(Date.now() + 1000, timerEndRef.current + d * 1000);
      const rem = Math.max(0, (timerEndRef.current - Date.now()) / 1000);
      timerLeftRef.current = rem;
      setTimerLeft(rem);
      setTimerTotal((t) => {
        const nextT = Math.max(t, Math.ceil(rem));
        timerTotalRef.current = nextT;
        return nextT;
      });
    } else {
      const base = timerLeftRef.current > 0 ? timerLeftRef.current : timerTotalRef.current;
      const next = Math.max(5, Math.round(base + d));
      timerTotalRef.current = next;
      timerLeftRef.current = next;
      setTimerTotal(next);
      setTimerLeft(next);
    }
  }, []);

  // Stopwatch tick (30ms for smooth centiseconds)
  useEffect(() => {
    if (!swRunning) return undefined;
    const id = setInterval(() => {
      const next = swAccumRef.current + (Date.now() - swStartRef.current);
      swElapsedRef.current = next;
      setSwElapsed(next);
    }, 33);
    return () => clearInterval(id);
  }, [swRunning]);

  const startStopwatch = useCallback(() => {
    setSubTab('stopwatch');
    if (swRunningRef.current) return;
    swStartRef.current = Date.now();
    swRunningRef.current = true;
    setSwRunning(true);
  }, []);

  const pauseStopwatch = useCallback(() => {
    setSubTab('stopwatch');
    if (!swRunningRef.current) return;
    swAccumRef.current += Date.now() - swStartRef.current;
    swElapsedRef.current = swAccumRef.current;
    setSwElapsed(swAccumRef.current);
    swRunningRef.current = false;
    setSwRunning(false);
  }, []);

  const toggleStopwatch = useCallback(() => {
    if (swRunningRef.current) {
      pauseStopwatch();
    } else {
      startStopwatch();
    }
  }, [pauseStopwatch, startStopwatch]);

  const resetStopwatch = useCallback(() => {
    setSubTab('stopwatch');
    swRunningRef.current = false;
    setSwRunning(false);
    swAccumRef.current = 0;
    swElapsedRef.current = 0;
    setSwElapsed(0);
    setSwLaps([]);
  }, []);

  const lapStopwatch = useCallback(() => {
    setSubTab('stopwatch');
    const cur = swRunningRef.current
      ? swAccumRef.current + (Date.now() - swStartRef.current)
      : swElapsedRef.current;
    if (cur <= 0) return;
    setSwLaps((prev) => [cur, ...prev].slice(0, 25));
  }, []);

  // Alarms persistence & check every second
  useEffect(() => {
    saveAlarms(alarms);
  }, [alarms]);

  useEffect(() => {
    if (!alarms.some((a) => a.enabled)) return undefined;
    const id = setInterval(() => {
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const dateStamp = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
      for (const a of alarms) {
        if (!a.enabled || a.time !== hhmm) continue;
        // If the alarm was created during this exact same minute, wait until next occurrence unless created at sec 0
        if (a.skipKey === `${dateStamp}|${hhmm}`) continue;
        const key = `${a.id}|${dateStamp}|${hhmm}`;
        if (lastTriggeredRef.current === key) continue;
        lastTriggeredRef.current = key;
        triggerRing({ type: 'alarm', title: `${a.label || 'Alarm'} (${a.time})`, time: a.time });
        break;
      }
    }, 1000);
    return () => clearInterval(id);
  }, [alarms, triggerRing]);

  const addAlarm = useCallback((time, label = '') => {
    const cleanTime = String(time || '').trim();
    if (!/^\d{2}:\d{2}$/.test(cleanTime)) return null;
    setSubTab('alarm');
    const now = new Date();
    const curHhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const dateStamp = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
    const skipKey = cleanTime === curHhmm ? `${dateStamp}|${curHhmm}` : '';
    const cleanLabel = String(label || '').trim() || 'Alarm';

    setAlarms((prev) => {
      const existingIdx = prev.findIndex((a) => a.time === cleanTime);
      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx] = {
          ...updated[existingIdx],
          label: cleanLabel || updated[existingIdx].label,
          enabled: true,
          skipKey,
        };
        return updated.sort((a, b) => a.time.localeCompare(b.time));
      }
      return [
        ...prev,
        { id: String(Date.now() + Math.random()), time: cleanTime, label: cleanLabel, enabled: true, skipKey },
      ].sort((a, b) => a.time.localeCompare(b.time));
    });
    return cleanTime;
  }, []);

  const toggleAlarm = useCallback((id) => {
    setAlarms((prev) => prev.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a)));
  }, []);

  const removeAlarm = useCallback((id) => {
    setAlarms((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const removeAlarmByTime = useCallback((time) => {
    setSubTab('alarm');
    setAlarms((prev) => prev.filter((a) => a.time !== time));
  }, []);

  const clearAllAlarms = useCallback(() => {
    setSubTab('alarm');
    setAlarms([]);
  }, []);

  const alarmObj = {
    list: alarms,
    add: addAlarm,
    toggle: toggleAlarm,
    remove: removeAlarm,
    removeByTime: removeAlarmByTime,
    clearAll: clearAllAlarms,
  };

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
      startPreset: startTimer,
      pause: pauseTimer,
      reset: resetTimer,
      addSeconds: addTimerSeconds,
    },
    stopwatch: {
      elapsed: swElapsed,
      running: swRunning,
      laps: swLaps,
      start: startStopwatch,
      pause: pauseStopwatch,
      toggle: toggleStopwatch,
      reset: resetStopwatch,
      lap: lapStopwatch,
    },
    alarm: alarmObj,
    alarms: alarmObj,
  };
}
