import { motion } from 'framer-motion';
import {
  Thermometer, Battery, BatteryCharging, Bluetooth, Headphones, Hourglass, ArrowDown, Music2,
} from 'lucide-react';
import { formatNetSpeed, useBattery } from '../hooks.js';
import { formatMinSec } from '../clockStore.js';

function MiniEqualizer() {
  return (
    <div className="flex h-3 items-end gap-[1.5px]">
      {[0.55, 1, 0.7].map((h, i) => (
        <motion.span
          key={i}
          className="w-[2px] origin-bottom rounded-full bg-emerald-400"
          style={{ height: '100%' }}
          animate={{ scaleY: [h * 0.35, h, h * 0.5, h * 0.9, h * 0.35] }}
          transition={{ duration: 0.85 + i * 0.12, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}

export function HiddenLipView({ mediaPlaying, timerRunning, stashCount }) {
  return (
    <div className="flex h-full w-full items-center justify-center gap-1.5 px-3">
      {timerRunning && <span className="h-1 w-1 rounded-full bg-amber-400 animate-pulse" />}
      {mediaPlaying && <span className="h-1 w-1 rounded-full bg-emerald-400 animate-pulse" />}
      <span className="h-[2.5px] w-10 rounded-full bg-white/35" />
      {stashCount > 0 && <span className="h-1 w-1 rounded-full bg-sky-400" />}
    </div>
  );
}

export default function PeekView({ sysinfo, clock, media }) {
  const battery = useBattery();
  const temp = sysinfo?.temp;
  const cpu = sysinfo?.cpu;
  const netDown = sysinfo?.netDown ?? 0;
  const netUp = sysinfo?.netUp ?? 0;
  const btList = sysinfo?.bluetooth || [];
  const primaryBt = btList[0] || null;

  const timerRunning = !!clock?.timer?.running;
  const swRunning = !!clock?.stopwatch?.running;
  const musicPlaying = !!(media?.active && media?.status === 'Playing');

  const tempColor = temp == null
    ? 'text-white/60'
    : temp >= 75
      ? 'text-rose-400'
      : temp >= 62
        ? 'text-amber-300'
        : 'text-emerald-400';

  const battColor = !battery
    ? 'text-white/60'
    : battery.charging
      ? 'text-emerald-400'
      : battery.level <= 20
        ? 'text-rose-400'
        : 'text-sky-300';

  return (
    <div className="flex h-full w-full items-center justify-between gap-2 px-3 text-[11.5px] font-semibold">
      {/* Live Timer / Stopwatch (if running) */}
      {(timerRunning || swRunning) && (
        <>
          <div className="flex shrink-0 items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-amber-300">
            <Hourglass size={11} className="animate-spin text-amber-400" style={{ animationDuration: '4s' }} />
            <span className="tabular-nums">
              {timerRunning
                ? formatMinSec(clock.timer.left)
                : formatMinSec(Math.floor((clock.stopwatch.elapsedMs || 0) / 1000))}
            </span>
          </div>
          <span className="h-3 w-px shrink-0 bg-white/15" />
        </>
      )}

      {/* Live Playing Song (if playing) */}
      {musicPlaying && (
        <>
          <div className="flex min-w-0 items-center gap-1.5 text-emerald-300">
            {media.thumb ? (
              <img src={media.thumb} alt="" className="h-4 w-4 shrink-0 rounded object-cover" />
            ) : (
              <Music2 size={11.5} className="shrink-0 text-emerald-400" />
            )}
            <span className="max-w-[82px] truncate text-[11px] font-medium text-white/85">
              {media.title}
            </span>
            <MiniEqualizer />
          </div>
          <span className="h-3 w-px shrink-0 bg-white/15" />
        </>
      )}

      {/* 1. Suhu Laptop */}
      <div className="flex shrink-0 items-center gap-1" title={cpu != null ? `Suhu ~${temp ?? '--'}°C • CPU ${cpu}%` : 'Suhu Laptop'}>
        <Thermometer size={12.5} className={tempColor} />
        <span className="tabular-nums text-white/90">{temp != null ? `${temp}°C` : '--°C'}</span>
      </div>

      <span className="h-3 w-px shrink-0 bg-white/15" />

      {/* 2. Baterai Laptop */}
      <div className="flex shrink-0 items-center gap-1" title="Baterai Laptop">
        {battery?.charging ? (
          <BatteryCharging size={12.5} className="text-emerald-400" />
        ) : (
          <Battery size={12.5} className={battColor} />
        )}
        <span className="tabular-nums text-white/90">
          {battery ? `${battery.level}%` : '--%'}
        </span>
      </div>

      <span className="h-3 w-px shrink-0 bg-white/15" />

      {/* 3. Kecepatan Internet (Network Speed) */}
      <div
        className="flex shrink-0 items-center gap-0.5 text-cyan-300"
        title={`Download: ${formatNetSpeed(netDown)} • Upload: ${formatNetSpeed(netUp)}`}
      >
        <ArrowDown size={11.5} className="text-cyan-400" />
        <span className="tabular-nums text-[11px]">{formatNetSpeed(netDown)}</span>
      </div>

      <span className="h-3 w-px shrink-0 bg-white/15" />

      {/* 4. Baterai Bluetooth */}
      <div
        className="flex min-w-0 shrink-0 items-center gap-1"
        title={primaryBt ? `${primaryBt.name}: ${primaryBt.battery}%` : 'Tidak ada perangkat Bluetooth aktif'}
      >
        {primaryBt ? (
          <>
            <Headphones size={11.5} className="shrink-0 text-indigo-400" />
            <span className="max-w-[54px] truncate text-[10.5px] font-medium text-white/75">
              {primaryBt.name}
            </span>
            <span className="tabular-nums text-indigo-300">{primaryBt.battery}%</span>
          </>
        ) : (
          <Bluetooth size={11.5} className="shrink-0 text-white/35" />
        )}
      </div>
    </div>
  );
}
