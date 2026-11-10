import { AnimatePresence, motion } from 'framer-motion';
import {
  Thermometer, Battery, BatteryCharging, Bluetooth, Headphones, Hourglass, ArrowDown, Music2,
} from 'lucide-react';
import { formatNetSpeed, useBattery } from '../hooks.js';
import { formatMinSec } from '../clockStore.js';
import { AutomationStatusBadge } from './AutomationOverlay.jsx';
import { CyberMascotEyes } from './CyberMascot.jsx';

function MiniEqualizer() {
  return (
    <div className="flex h-3 items-end gap-[1.5px]">
      {[0.55, 1, 0.7].map((h, i) => (
        <motion.span
          key={i}
          className="w-[2px] origin-bottom rounded-full bg-cyan-400 shadow-[0_0_6px_#00f0ff]"
          style={{ height: '100%' }}
          animate={{ scaleY: [h * 0.35, h, h * 0.5, h * 0.9, h * 0.35] }}
          transition={{ duration: 0.85 + i * 0.12, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}

/**
 * Nusa 1.1 Idle Mascot Notch + Dynamic Lyrics Notch (00:04-00:07 & 00:15-00:17)
 */
export function HiddenLipView({
  mediaPlaying,
  timerRunning,
  stashCount,
  jarvisStatus = 'idle',
  currentLyric = null,
}) {
  const showLyric = mediaPlaying && currentLyric;

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden px-3.5">
      <AnimatePresence mode="wait" initial={false}>
        {showLyric ? (
          <motion.div
            key={currentLyric}
            initial={{ opacity: 0, y: 5, filter: 'blur(3px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -5, filter: 'blur(3px)' }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-center gap-2 whitespace-nowrap text-[11.5px] font-semibold tracking-wide text-white"
          >
            <Music2 size={12} className="shrink-0 text-cyan-400 drop-shadow-[0_0_6px_#00f0ff]" />
            <span className="truncate drop-shadow-[0_1px_6px_rgba(0,240,255,0.35)]">
              {currentLyric}
            </span>
          </motion.div>
        ) : (
          <motion.div
            key="mascot-eyes"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={{ duration: 0.16 }}
            className="flex items-center justify-center gap-2.5"
          >
            {timerRunning && (
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shadow-[0_0_8px_#fbbf24] animate-pulse" />
            )}
            <CyberMascotEyes
              jarvisStatus={jarvisStatus}
              musicPlaying={mediaPlaying}
              compact
            />
            {mediaPlaying && <MiniEqualizer />}
            {stashCount > 0 && !mediaPlaying && (
              <span className="h-1.5 w-1.5 rounded-full bg-fuchsia-400 shadow-[0_0_8px_#e879f9]" />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function BluetoothToastView({ device }) {
  if (!device) return null;
  const hasBatt = device.battery != null && device.battery >= 0;
  return (
    <div className="flex h-full w-full items-center justify-between gap-3 px-4">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cyan-500/20 text-cyan-300 ring-1 ring-cyan-400/50 shadow-[0_0_14px_rgba(0,240,255,0.3)]">
          <Headphones size={17} className="text-cyan-300" />
          <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-fuchsia-400 text-black ring-2 ring-black">
            <Bluetooth size={9} strokeWidth={3} />
          </span>
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 font-mono text-[9.5px] font-bold uppercase tracking-widest text-cyan-400">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_#00f0ff] animate-pulse" />
            BT // LINKED
          </div>
          <div className="truncate font-display text-[13.5px] font-bold text-white">
            {device.name}
          </div>
        </div>
      </div>

      {hasBatt ? (
        <div className="flex shrink-0 items-center gap-1 rounded-full bg-cyan-500/15 px-2.5 py-1 font-mono text-[11.5px] font-bold tabular-nums text-cyan-200 ring-1 ring-cyan-400/35">
          <Battery size={13} className="text-cyan-400" />
          {device.battery}%
        </div>
      ) : (
        <div className="shrink-0 rounded-full bg-cyan-400/15 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-cyan-300 ring-1 ring-cyan-400/35">
          ONLINE
        </div>
      )}
    </div>
  );
}

export default function PeekView({ sysinfo, clock, media, automationStatus, jarvisStatus = 'idle' }) {
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
  const autoActive = !!(automationStatus && automationStatus.active !== false);

  const tempColor = temp == null
    ? 'text-white/60'
    : temp >= 75
      ? 'text-rose-400'
      : temp >= 62
        ? 'text-amber-300'
        : 'text-cyan-400';

  const battColor = !battery
    ? 'text-white/60'
    : battery.charging
      ? 'text-emerald-400'
      : battery.level <= 20
        ? 'text-rose-400'
        : 'text-fuchsia-300';

  return (
    <div className="flex h-full w-full items-center justify-between gap-2 px-3.5 text-[11.5px] font-semibold">
      {/* Cyber-Nusa Mascot Eyes */}
      <div className="flex shrink-0 items-center gap-2 pr-0.5">
        <CyberMascotEyes jarvisStatus={jarvisStatus} musicPlaying={musicPlaying} compact />
        <span className="h-3 w-px shrink-0 bg-cyan-400/20" />
      </div>

      {/* Live Jarvis Automation Capsule Indicator */}
      {autoActive && (
        <>
          <AutomationStatusBadge status={automationStatus} compact />
          <span className="h-3 w-px shrink-0 bg-white/15" />
        </>
      )}

      {/* Live Timer / Stopwatch (if running) */}
      {(timerRunning || swRunning) && (
        <>
          <div className="flex shrink-0 items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 font-mono text-amber-300 ring-1 ring-amber-400/30">
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
          <div className="flex min-w-0 items-center gap-1.5 text-cyan-300">
            {media.thumb ? (
              <img src={media.thumb} alt="" className="h-4 w-4 shrink-0 rounded object-cover ring-1 ring-cyan-400/40" />
            ) : (
              <Music2 size={11.5} className="shrink-0 text-cyan-400" />
            )}
            <span className="max-w-[86px] truncate text-[11px] font-medium text-white/90">
              {media.title}
            </span>
            <MiniEqualizer />
          </div>
          <span className="h-3 w-px shrink-0 bg-white/15" />
        </>
      )}

      {/* 1. Suhu Laptop */}
      <div className="flex shrink-0 items-center gap-1 font-mono" title={cpu != null ? `Suhu ~${temp ?? '--'}°C • CPU ${cpu}%` : 'Suhu Laptop'}>
        <Thermometer size={12} className={tempColor} />
        <span className="tabular-nums text-white/90">{temp != null ? `${temp}°C` : '--°C'}</span>
      </div>

      <span className="h-3 w-px shrink-0 bg-white/15" />

      {/* 2. Baterai Laptop */}
      <div className="flex shrink-0 items-center gap-1 font-mono" title="Baterai Laptop">
        {battery?.charging ? (
          <BatteryCharging size={12} className="text-emerald-400" />
        ) : (
          <Battery size={12} className={battColor} />
        )}
        <span className="tabular-nums text-white/90">
          {battery ? `${battery.level}%` : '--%'}
        </span>
      </div>

      <span className="h-3 w-px shrink-0 bg-white/15" />

      {/* 3. Kecepatan Internet (Network Speed) */}
      <div
        className="flex shrink-0 items-center gap-0.5 font-mono text-cyan-300"
        title={`Download: ${formatNetSpeed(netDown)} • Upload: ${formatNetSpeed(netUp)}`}
      >
        <ArrowDown size={11} className="text-cyan-400" />
        <span className="tabular-nums text-[10.5px]">{formatNetSpeed(netDown)}</span>
      </div>

      <span className="h-3 w-px shrink-0 bg-white/15" />

      {/* 4. Baterai Bluetooth */}
      <div
        className="flex min-w-0 shrink-0 items-center gap-1 font-mono"
        title={primaryBt ? `${primaryBt.name}: ${primaryBt.battery}%` : 'Tidak ada perangkat Bluetooth aktif'}
      >
        {primaryBt ? (
          <>
            <Headphones size={11.5} className="shrink-0 text-fuchsia-400" />
            <span className="max-w-[54px] truncate font-sans text-[10.5px] font-medium text-white/80">
              {primaryBt.name}
            </span>
            <span className="tabular-nums text-fuchsia-300">{primaryBt.battery}%</span>
          </>
        ) : (
          <Bluetooth size={11.5} className="shrink-0 text-white/35" />
        )}
      </div>
    </div>
  );
}
