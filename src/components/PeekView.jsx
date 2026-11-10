import { AnimatePresence, motion } from 'framer-motion';
import {
  Thermometer, Bluetooth, Headphones, Hourglass, Music2, Battery,
} from 'lucide-react';
import { formatMinSec } from '../clockStore.js';
import { AutomationStatusBadge } from './AutomationOverlay.jsx';
import { AppleStatusRings, CyberMascotEyes } from './CyberMascot.jsx';

function MiniEqualizer() {
  return (
    <div className="flex h-3 items-end gap-[1.5px]">
      {[0.55, 1, 0.7].map((h, i) => (
        <motion.span
          key={i}
          className="w-[2px] origin-bottom rounded-full bg-cyan-400"
          style={{ height: '100%' }}
          animate={{ scaleY: [h * 0.35, h, h * 0.5, h * 0.9, h * 0.35] }}
          transition={{ duration: 0.85 + i * 0.12, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}

/**
 * Image 4 Minimal Micro-Notch Lip (when browser is open or idle)
 * + Dynamic Lyrics Notch when music is playing and browser is not in foreground
 */
export function HiddenLipView({
  mediaPlaying,
  media = null,
  timerRunning,
  jarvisStatus = 'idle',
  currentLyric = null,
  lyricIndex = -1,
  minimalLip = false,
}) {
  const showLyric = !!(mediaPlaying && currentLyric);

  // When browser/Google is active AND no song lyric is active, render the ultra-slim micro-notch
  if (minimalLip && !showLyric) {
    return (
      <div className="flex h-full w-full items-center justify-center gap-1.5 px-2">
        {timerRunning && <span className="h-1 w-1 rounded-full bg-amber-400 animate-pulse" />}
        {mediaPlaying && <span className="h-1 w-1 rounded-full bg-emerald-400 animate-pulse" />}
      </div>
    );
  }

  return (
    <div className="relative flex h-full w-full items-center justify-between gap-2 overflow-hidden px-2.5">
      {showLyric ? (
        <>
          <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
            {media?.thumb ? (
              <img
                src={media.thumb}
                alt=""
                className="h-4 w-4 shrink-0 rounded-full object-cover ring-1 ring-cyan-400/50"
              />
            ) : (
              <Music2 size={11.5} className="shrink-0 text-cyan-400" />
            )}
            <div className="relative flex-1 overflow-hidden">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={`${lyricIndex}-${currentLyric}`}
                  initial={{ opacity: 0, y: 7, filter: 'blur(2px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -7, filter: 'blur(2px)' }}
                  transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                  className="truncate text-[11.5px] font-semibold tracking-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
                >
                  {currentLyric}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {timerRunning && (
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
            )}
            <MiniEqualizer />
          </div>
        </>
      ) : (
        <div className="flex w-full items-center justify-center gap-2">
          {timerRunning && (
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
          )}
          <CyberMascotEyes
            jarvisStatus={jarvisStatus}
            musicPlaying={mediaPlaying}
            compact
          />
          {mediaPlaying && <MiniEqualizer />}
        </div>
      )}
    </div>
  );
}

export function BluetoothToastView({ device }) {
  if (!device) return null;
  const hasBatt = device.battery != null && device.battery >= 0;
  return (
    <div className="flex h-full w-full items-center justify-between gap-3 px-4">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-400/40">
          <Headphones size={16} className="text-indigo-300" />
          <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-400 text-black ring-2 ring-black">
            <Bluetooth size={8.5} strokeWidth={3} />
          </span>
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[9.5px] font-semibold uppercase tracking-wider text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Bluetooth Connected
          </div>
          <div className="truncate font-display text-[13px] font-bold text-white">
            {device.name}
          </div>
        </div>
      </div>

      {hasBatt ? (
        <div className="flex shrink-0 items-center gap-1 rounded-full bg-white/[0.08] px-2.5 py-1 text-[11px] font-bold tabular-nums text-white">
          <Battery size={12.5} className="text-emerald-400" />
          {device.battery}%
        </div>
      ) : (
        <div className="shrink-0 rounded-full bg-emerald-400/15 px-2.5 py-1 text-[10px] font-semibold text-emerald-300">
          Active
        </div>
      )}
    </div>
  );
}

export default function PeekView({
  sysinfo,
  clock,
  media,
  currentLyric = null,
  automationStatus,
  jarvisStatus = 'idle',
}) {
  const temp = sysinfo?.temp;
  const timerRunning = !!clock?.timer?.running;
  const swRunning = !!clock?.stopwatch?.running;
  const musicPlaying = !!(media?.active && media?.status === 'Playing');
  const autoActive = !!(automationStatus && automationStatus.active !== false);

  return (
    <div className="flex h-full w-full items-center justify-between gap-2.5 px-3.5 text-[11px] font-semibold">
      <div className="flex min-w-0 items-center gap-2">
        <CyberMascotEyes jarvisStatus={jarvisStatus} musicPlaying={musicPlaying} compact />

        {autoActive && <AutomationStatusBadge status={automationStatus} compact />}

        {(timerRunning || swRunning) && (
          <div className="flex shrink-0 items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-amber-300">
            <Hourglass size={10.5} className="animate-spin text-amber-400" style={{ animationDuration: '4s' }} />
            <span className="tabular-nums">
              {timerRunning
                ? formatMinSec(clock.timer.left)
                : formatMinSec(Math.floor((clock.stopwatch.elapsedMs || 0) / 1000))}
            </span>
          </div>
        )}

        {musicPlaying && (
          <div className="flex min-w-0 items-center gap-1.5">
            {media.thumb ? (
              <img src={media.thumb} alt="" className="h-4 w-4 shrink-0 rounded object-cover" />
            ) : (
              <Music2 size={11} className="shrink-0 text-cyan-400" />
            )}
            <span className="max-w-[160px] truncate text-[11px] font-medium text-white/95">
              {currentLyric || media.title}
            </span>
            <MiniEqualizer />
          </div>
        )}
      </div>

      {/* Right: Apple Circular Status Rings + CPU Temp */}
      <div className="flex shrink-0 items-center gap-2">
        <AppleStatusRings sysinfo={sysinfo} size={20} />
        {temp != null && (
          <div className="flex items-center gap-0.5 text-[10.5px] tabular-nums text-white/75">
            <Thermometer size={11} className="text-emerald-400" />
            <span>{temp}°</span>
          </div>
        )}
      </div>
    </div>
  );
}
