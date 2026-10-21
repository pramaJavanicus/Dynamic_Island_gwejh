import { useState } from 'react';
import {
  Hourglass, Timer as StopwatchIcon, Bell, Play, Pause, RotateCcw, Flag, Plus, Trash2, BellRing, ChevronUp, ChevronDown,
} from 'lucide-react';
import { formatMinSec, formatStopwatch } from '../clockStore.js';

const api = window.island;

const SUB_TABS = [
  { id: 'timer', label: 'Timer', icon: Hourglass },
  { id: 'stopwatch', label: 'Stopwatch', icon: StopwatchIcon },
  { id: 'alarm', label: 'Alarm', icon: Bell },
];

const TIMER_PRESETS = [
  { label: '1 Menit', sec: 60 },
  { label: '3 Menit', sec: 180 },
  { label: '5 Menit', sec: 300 },
  { label: '10 Menit', sec: 600 },
  { label: '15 Menit', sec: 900 },
  { label: '25m Fokus', sec: 1500 },
  { label: '30 Menit', sec: 1800 },
  { label: '1 Jam', sec: 3600 },
];

function computeTimeUntil(hhmm) {
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return '';
  const [hh, mm] = hhmm.split(':').map(Number);
  const now = new Date();
  const target = new Date(now);
  target.setHours(hh, mm, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  const diffMin = Math.max(1, Math.round((target - now) / 60000));
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  if (h > 0 && m > 0) return `dalam ${h}j ${m}m`;
  if (h > 0) return `dalam ${h} jam`;
  return `dalam ${m} menit`;
}

export default function ClockTab({ clock, onInputFocus }) {
  const { subTab, setSubTab, ringing, dismissRing, timer, stopwatch, alarm } = clock;

  // Custom timer input (minutes & seconds)
  const [customMin, setCustomMin] = useState('5');
  const [customSec, setCustomSec] = useState('0');

  // Custom alarm input (24-hour HH and MM)
  const [alarmHour, setAlarmHour] = useState('07');
  const [alarmMin, setAlarmMin] = useState('00');
  const [alarmLabel, setAlarmLabel] = useState('');

  const handleCustomTimerSubmit = (e) => {
    e.preventDefault();
    const m = Math.max(0, parseInt(customMin || '0', 10) || 0);
    const s = Math.max(0, parseInt(customSec || '0', 10) || 0);
    const total = m * 60 + s;
    if (total > 0) {
      timer.start(total);
    }
  };

  const stepHour = (delta) => {
    const cur = parseInt(alarmHour || '0', 10) || 0;
    const next = (cur + delta + 24) % 24;
    setAlarmHour(String(next).padStart(2, '0'));
  };

  const stepMin = (delta) => {
    const cur = parseInt(alarmMin || '0', 10) || 0;
    const next = (cur + delta + 60) % 60;
    setAlarmMin(String(next).padStart(2, '0'));
  };

  const setAlarmRelativeMinutes = (addMins) => {
    const d = new Date(Date.now() + addMins * 60000);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    setAlarmHour(hh);
    setAlarmMin(mm);
    alarm.add(`${hh}:${mm}`, alarmLabel || `Alarm +${addMins}m`);
  };

  const submitAlarm = (e) => {
    e.preventDefault();
    const hh = String(Math.max(0, Math.min(23, parseInt(alarmHour || '0', 10) || 0))).padStart(2, '0');
    const mm = String(Math.max(0, Math.min(59, parseInt(alarmMin || '0', 10) || 0))).padStart(2, '0');
    setAlarmHour(hh);
    setAlarmMin(mm);
    alarm.add(`${hh}:${mm}`, alarmLabel);
    setAlarmLabel('');
  };

  const progress = timer.total > 0 ? ((timer.total - timer.left) / timer.total) * 100 : 0;

  return (
    <div className="flex h-full flex-col gap-2">
      {/* Ringing alert banner */}
      {ringing && (
        <div className="flex items-center justify-between rounded-2xl bg-amber-400/20 px-3.5 py-1.5 ring-1 ring-amber-400/50">
          <div className="flex items-center gap-2 text-amber-300">
            <BellRing size={15} className="animate-bounce" />
            <span className="text-[12px] font-semibold">{ringing.title}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {ringing.type === 'timer' && (
              <button
                type="button"
                onClick={() => {
                  dismissRing();
                  timer.start(60);
                }}
                className="rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-medium text-white hover:bg-white/25"
              >
                +1 Menit
              </button>
            )}
            <button
              type="button"
              onClick={dismissRing}
              className="rounded-full bg-amber-400 px-3 py-0.5 text-[11px] font-semibold text-black hover:brightness-110"
            >
              Matikan
            </button>
          </div>
        </div>
      )}

      {/* Sub-navigation bar */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 rounded-full bg-white/[0.06] p-1">
          {SUB_TABS.map(({ id, label, icon: Icon }) => {
            const active = subTab === id;
            const hasDot = (id === 'timer' && timer.running)
              || (id === 'stopwatch' && stopwatch.running)
              || (id === 'alarm' && alarm.list.some((a) => a.enabled));
            return (
              <button
                key={id}
                type="button"
                onClick={() => setSubTab(id)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[11.5px] font-medium transition-colors ${
                  active ? 'bg-white/15 text-white' : 'text-white/55 hover:text-white'
                }`}
              >
                <Icon size={12} />
                {label}
                {hasDot && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />}
              </button>
            );
          })}
        </div>

        <span className="text-[10.5px] text-white/45">
          {subTab === 'timer' && (timer.running ? '⏱ Timer sedang berjalan' : 'Pilih durasi atau ketik waktu')}
          {subTab === 'stopwatch' && (stopwatch.running ? '⏱ Stopwatch sedang berjalan' : 'Siap menghitung waktu')}
          {subTab === 'alarm' && `${alarm.list.filter((a) => a.enabled).length} alarm aktif`}
        </span>
      </div>

      {/* Main content area */}
      <div className="min-h-0 flex-1">
        {subTab === 'timer' && (
          <div className="flex h-full gap-3">
            {/* Left: Countdown + controls */}
            <div className="flex w-[240px] shrink-0 flex-col items-center justify-between rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/[0.06]">
              <div className="flex w-full items-center justify-between px-1">
                <button
                  type="button"
                  onClick={() => timer.addSeconds(-30)}
                  className="rounded-lg bg-white/[0.07] px-2 py-0.5 text-[10.5px] font-medium text-white/75 hover:bg-white/15 hover:text-white"
                >
                  -30d
                </button>
                <span className="font-display text-[32px] font-bold tracking-tight tabular-nums text-white">
                  {formatMinSec(timer.left)}
                </span>
                <button
                  type="button"
                  onClick={() => timer.addSeconds(60)}
                  className="rounded-lg bg-white/[0.07] px-2 py-0.5 text-[10.5px] font-medium text-white/75 hover:bg-white/15 hover:text-white"
                >
                  +1m
                </button>
              </div>

              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-amber-400 transition-[width] duration-200 ease-linear"
                  style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                />
              </div>

              {/* Custom min/sec input form */}
              <form onSubmit={handleCustomTimerSubmit} className="flex w-full items-center justify-center gap-1.5">
                <div className="flex items-center gap-1 rounded-lg bg-white/[0.06] px-2 py-1 ring-1 ring-white/[0.08]">
                  <input
                    type="number"
                    min="0"
                    max="999"
                    value={customMin}
                    onChange={(e) => setCustomMin(e.target.value)}
                    onFocus={() => { onInputFocus?.(true); api.focus(); }}
                    onBlur={() => onInputFocus?.(false)}
                    className="w-8 bg-transparent text-center font-mono text-[12px] font-semibold text-white outline-none"
                  />
                  <span className="text-[10px] text-white/45">m</span>
                </div>
                <div className="flex items-center gap-1 rounded-lg bg-white/[0.06] px-2 py-1 ring-1 ring-white/[0.08]">
                  <input
                    type="number"
                    min="0"
                    max="59"
                    value={customSec}
                    onChange={(e) => setCustomSec(e.target.value)}
                    onFocus={() => { onInputFocus?.(true); api.focus(); }}
                    onBlur={() => onInputFocus?.(false)}
                    className="w-7 bg-transparent text-center font-mono text-[12px] font-semibold text-white outline-none"
                  />
                  <span className="text-[10px] text-white/45">d</span>
                </div>
                <button
                  type="submit"
                  className="rounded-lg bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-amber-300 hover:bg-white/20"
                >
                  Set
                </button>
              </form>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => (timer.running ? timer.pause() : timer.start())}
                  className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[12px] font-semibold transition ${
                    timer.running
                      ? 'bg-amber-400 text-black hover:brightness-110'
                      : 'bg-emerald-400 text-black hover:brightness-110'
                  }`}
                >
                  {timer.running ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                  {timer.running ? 'Jeda' : 'Mulai'}
                </button>
                <button
                  type="button"
                  onClick={() => timer.reset()}
                  title="Reset Timer"
                  className="grid h-8 w-8 place-items-center rounded-full bg-white/[0.08] text-white/75 hover:bg-white/15 hover:text-white"
                >
                  <RotateCcw size={14} />
                </button>
              </div>
            </div>

            {/* Right: Presets grid (4x2) */}
            <div className="grid flex-1 grid-cols-4 gap-1.5">
              {TIMER_PRESETS.map((p) => {
                const selected = timer.total === p.sec && timer.running;
                return (
                  <button
                    key={p.sec}
                    type="button"
                    onClick={() => timer.start(p.sec)}
                    className={`flex flex-col items-center justify-center rounded-xl border px-2 py-1.5 transition active:scale-95 ${
                      selected
                        ? 'border-amber-400/50 bg-amber-400/15 text-amber-200'
                        : 'border-white/[0.06] bg-white/[0.04] text-white/85 hover:bg-white/[0.1]'
                    }`}
                  >
                    <span className="text-[12px] font-semibold">{p.label}</span>
                    <span className="text-[9.5px] text-white/40">{selected ? 'Aktif' : 'Mulai'}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {subTab === 'stopwatch' && (
          <div className="flex h-full gap-3">
            {/* Left: Stopwatch counter + controls */}
            <div className="flex w-[240px] shrink-0 flex-col items-center justify-between rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/[0.06]">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
                Waktu Berjalan
              </div>
              <div className="font-display text-[32px] font-bold tracking-tight tabular-nums text-white">
                {formatStopwatch(stopwatch.elapsed)}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={stopwatch.toggle}
                  className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[12px] font-semibold transition ${
                    stopwatch.running
                      ? 'bg-rose-400 text-black hover:brightness-110'
                      : 'bg-emerald-400 text-black hover:brightness-110'
                  }`}
                >
                  {stopwatch.running ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                  {stopwatch.running ? 'Jeda' : (stopwatch.elapsed > 0 ? 'Lanjut' : 'Mulai')}
                </button>
                <button
                  type="button"
                  onClick={stopwatch.lap}
                  disabled={!stopwatch.running && stopwatch.elapsed === 0}
                  title="Catat Putaran (Lap)"
                  className="grid h-8 w-8 place-items-center rounded-full bg-white/[0.08] text-white/80 hover:bg-white/15 disabled:opacity-30"
                >
                  <Flag size={13} />
                </button>
                <button
                  type="button"
                  onClick={stopwatch.reset}
                  disabled={stopwatch.elapsed === 0 && !stopwatch.running}
                  title="Reset Stopwatch"
                  className="grid h-8 w-8 place-items-center rounded-full bg-white/[0.08] text-white/80 hover:bg-white/15 disabled:opacity-30"
                >
                  <RotateCcw size={14} />
                </button>
              </div>
            </div>

            {/* Right: Laps list */}
            <div className="no-scrollbar flex flex-1 flex-col gap-1 overflow-y-auto rounded-2xl bg-white/[0.03] p-2.5 ring-1 ring-white/[0.05]">
              {stopwatch.laps.length === 0 ? (
                <div className="flex h-full items-center justify-center text-center text-[11.5px] text-white/35">
                  Klik tombol 🏳 saat stopwatch berjalan (atau ucapkan &ldquo;Jarvis lap stopwatch&rdquo;) untuk mencatat waktu putaran.
                </div>
              ) : (
                stopwatch.laps.map((lapMs, idx) => {
                  const lapNum = stopwatch.laps.length - idx;
                  const prevLapMs = stopwatch.laps[idx + 1] || 0;
                  const splitMs = Math.max(0, lapMs - prevLapMs);
                  return (
                    <div
                      key={`${lapNum}-${lapMs}`}
                      className="flex items-center justify-between rounded-lg bg-white/[0.05] px-2.5 py-1 text-[11.5px]"
                    >
                      <span className="font-medium text-white/60">Lap {lapNum}</span>
                      <span className="font-mono text-[10.5px] text-emerald-300/80">
                        +{formatStopwatch(splitMs)}
                      </span>
                      <span className="font-mono font-semibold tabular-nums text-white/95">
                        {formatStopwatch(lapMs)}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {subTab === 'alarm' && (
          <div className="flex h-full gap-3">
            {/* Left: Custom 24h Alarm Picker */}
            <form
              onSubmit={submitAlarm}
              className="flex w-[240px] shrink-0 flex-col justify-between rounded-2xl bg-white/[0.04] p-2.5 ring-1 ring-white/[0.06]"
            >
              {/* Hour : Minute stepper */}
              <div className="flex items-center justify-center gap-2">
                <div className="flex flex-col items-center rounded-xl bg-white/[0.06] px-2.5 py-1 ring-1 ring-white/10">
                  <button
                    type="button"
                    onClick={() => stepHour(1)}
                    className="text-white/50 hover:text-white"
                  >
                    <ChevronUp size={13} />
                  </button>
                  <input
                    type="number"
                    min="0"
                    max="23"
                    value={alarmHour}
                    onChange={(e) => setAlarmHour(e.target.value.slice(0, 2))}
                    onFocus={() => { onInputFocus?.(true); api.focus(); }}
                    onBlur={() => {
                      onInputFocus?.(false);
                      const v = Math.max(0, Math.min(23, parseInt(alarmHour || '0', 10) || 0));
                      setAlarmHour(String(v).padStart(2, '0'));
                    }}
                    className="w-10 bg-transparent text-center font-display text-[20px] font-bold tabular-nums text-white outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => stepHour(-1)}
                    className="text-white/50 hover:text-white"
                  >
                    <ChevronDown size={13} />
                  </button>
                </div>

                <span className="font-display text-[20px] font-bold text-white/50">:</span>

                <div className="flex flex-col items-center rounded-xl bg-white/[0.06] px-2.5 py-1 ring-1 ring-white/10">
                  <button
                    type="button"
                    onClick={() => stepMin(5)}
                    className="text-white/50 hover:text-white"
                  >
                    <ChevronUp size={13} />
                  </button>
                  <input
                    type="number"
                    min="0"
                    max="59"
                    value={alarmMin}
                    onChange={(e) => setAlarmMin(e.target.value.slice(0, 2))}
                    onFocus={() => { onInputFocus?.(true); api.focus(); }}
                    onBlur={() => {
                      onInputFocus?.(false);
                      const v = Math.max(0, Math.min(59, parseInt(alarmMin || '0', 10) || 0));
                      setAlarmMin(String(v).padStart(2, '0'));
                    }}
                    className="w-10 bg-transparent text-center font-display text-[20px] font-bold tabular-nums text-white outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => stepMin(-5)}
                    className="text-white/50 hover:text-white"
                  >
                    <ChevronDown size={13} />
                  </button>
                </div>

                {/* Quick relative alarm buttons */}
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => setAlarmRelativeMinutes(5)}
                    className="rounded-lg bg-white/[0.07] px-2 py-0.5 text-[10px] font-medium text-amber-300 hover:bg-white/15"
                    title="Pasang alarm 5 menit dari sekarang"
                  >
                    +5m
                  </button>
                  <button
                    type="button"
                    onClick={() => setAlarmRelativeMinutes(15)}
                    className="rounded-lg bg-white/[0.07] px-2 py-0.5 text-[10px] font-medium text-amber-300 hover:bg-white/15"
                    title="Pasang alarm 15 menit dari sekarang"
                  >
                    +15m
                  </button>
                  <button
                    type="button"
                    onClick={() => setAlarmRelativeMinutes(30)}
                    className="rounded-lg bg-white/[0.07] px-2 py-0.5 text-[10px] font-medium text-amber-300 hover:bg-white/15"
                    title="Pasang alarm 30 menit dari sekarang"
                  >
                    +30m
                  </button>
                </div>
              </div>

              <input
                type="text"
                value={alarmLabel}
                onChange={(e) => setAlarmLabel(e.target.value)}
                onFocus={() => { onInputFocus?.(true); api.focus(); }}
                onBlur={() => onInputFocus?.(false)}
                placeholder="Label (mis: Bangun / Rapat)"
                className="rounded-xl bg-white/[0.06] px-2.5 py-1 text-[11px] text-white outline-none placeholder:text-white/35 focus:ring-1 focus:ring-white/25"
              />

              <button
                type="submit"
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-amber-400 py-1.5 text-[11.5px] font-semibold text-black hover:brightness-110 active:scale-98"
              >
                <Plus size={13} strokeWidth={2.5} /> Pasang Alarm ({alarmHour.padStart(2, '0')}:{alarmMin.padStart(2, '0')})
              </button>
            </form>

            {/* Right: Saved alarms list */}
            <div className="no-scrollbar flex flex-1 flex-col gap-1.5 overflow-y-auto rounded-2xl bg-white/[0.03] p-2 ring-1 ring-white/[0.05]">
              {alarm.list.length === 0 ? (
                <div className="flex h-full items-center justify-center text-center text-[11.5px] text-white/35">
                  Belum ada alarm. Atur jam di kiri atau ucapkan &ldquo;Jarvis pasang alarm jam 7 pagi&rdquo;.
                </div>
              ) : (
                alarm.list.map((item) => (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between rounded-xl px-3 py-1.5 transition ${
                      item.enabled ? 'bg-white/[0.08] text-white' : 'bg-white/[0.03] text-white/40'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="font-display text-[17px] font-bold leading-tight tabular-nums">
                          {item.time}
                        </span>
                        {item.enabled && (
                          <span className="text-[10px] font-medium text-amber-300/80">
                            {computeTimeUntil(item.time)}
                          </span>
                        )}
                      </div>
                      <div className="truncate text-[10.5px] text-white/55">{item.label}</div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => alarm.toggle(item.id)}
                        className={`h-5 w-9 rounded-full p-0.5 transition-colors ${
                          item.enabled ? 'bg-emerald-400' : 'bg-white/15'
                        }`}
                      >
                        <div
                          className={`h-4 w-4 rounded-full bg-black transition-transform ${
                            item.enabled ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() => alarm.remove(item.id)}
                        title="Hapus alarm"
                        className="text-white/40 hover:text-rose-400"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
