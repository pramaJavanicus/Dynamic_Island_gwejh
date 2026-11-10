import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Volume2, Volume1, VolumeX, Wifi, Headphones, Bluetooth, Zap, Laptop,
} from 'lucide-react';
import { formatNetSpeed, useBattery } from '../hooks.js';

const api = window.island;

/**
 * Concave top-edge shoulder fillets ("Nusa notch ears") that sit flush at y=0
 * on the left and right outer edges of the notch so it melts into the top bezel.
 */
export function CyberNotchEars({ size = 12, color = '#04050a' }) {
  return (
    <>
      <svg
        width={size}
        height={size}
        viewBox="0 0 16 16"
        className="pointer-events-none absolute top-0 select-none"
        style={{ left: -size + 0.5 }}
        aria-hidden="true"
      >
        <path d="M16 0 H0 A16 16 0 0 1 16 16 Z" fill={color} />
      </svg>
      <svg
        width={size}
        height={size}
        viewBox="0 0 16 16"
        className="pointer-events-none absolute top-0 select-none"
        style={{ right: -size + 0.5 }}
        aria-hidden="true"
      >
        <path d="M0 0 H16 A16 16 0 0 0 0 16 Z" fill={color} />
      </svg>
    </>
  );
}

/**
 * Single Apple-style Circular Ring Gauge (like iOS/macOS Battery & Connectivity rings).
 */
export function AppleRingGauge({
  percent = 100,
  color = '#34d399',
  trackColor = 'rgba(255,255,255,0.12)',
  size = 24,
  stroke = 2.6,
  title = '',
  label = null,
  sublabel = null,
  children,
}) {
  const clamped = Math.max(0, Math.min(100, Number(percent) || 0));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (clamped / 100) * c;

  return (
    <div className="group relative flex items-center gap-1.5" title={title}>
      <div className="relative flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90 overflow-visible">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={trackColor}
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            style={{
              transition: 'stroke-dashoffset 450ms cubic-bezier(0.22, 1, 0.36, 1), stroke 300ms ease',
              filter: `drop-shadow(0 0 4px ${color}66)`,
            }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-white/90">
          {children}
        </div>
      </div>
      {(label || sublabel) && (
        <div className="min-w-0 leading-tight">
          {label && <div className="truncate text-[10.5px] font-semibold tabular-nums text-white/90">{label}</div>}
          {sublabel && <div className="truncate text-[9px] text-white/45">{sublabel}</div>}
        </div>
      )}
    </div>
  );
}

/**
 * Apple-style 3 Circular Rings for Laptop Battery, Wi-Fi/Network, and Bluetooth Battery.
 */
export function AppleStatusRings({ sysinfo, size = 23, showLabels = false }) {
  const battery = useBattery();
  const battPct = battery ? battery.level : 85;
  const charging = !!battery?.charging;
  const netDown = sysinfo?.netDown ?? 0;
  const netUp = sysinfo?.netUp ?? 0;
  const primaryBt = sysinfo?.bluetooth?.[0] || null;
  const btPct = primaryBt && primaryBt.battery >= 0 ? primaryBt.battery : (primaryBt ? 100 : 0);

  const battColor = charging
    ? '#34d399'
    : battPct <= 20
      ? '#fb7185'
      : battPct <= 35
        ? '#fbbf24'
        : '#34d399';

  // Wi-Fi ring: 100% base when online, or dynamic ring activity
  const wifiPct = navigator.onLine === false ? 8 : Math.min(100, Math.max(68, Math.round(70 + Math.log10((netDown || 1) + 10) * 5)));
  const wifiColor = navigator.onLine === false ? '#64748b' : '#38bdf8';

  const btColor = primaryBt ? '#a855f7' : 'rgba(255,255,255,0.22)';

  const iconSz = Math.max(9.5, Math.round(size * 0.43));

  return (
    <div className="flex items-center gap-2">
      {/* 1. Laptop Battery Ring */}
      <AppleRingGauge
        percent={battPct}
        color={battColor}
        size={size}
        stroke={size >= 28 ? 3 : 2.5}
        title={`Baterai Laptop: ${battery ? `${battery.level}%` : '--%'}${charging ? ' (Charging)' : ''}`}
        label={showLabels ? `${battPct}%` : null}
        sublabel={showLabels ? (charging ? 'Charging' : 'Laptop') : null}
      >
        {charging ? (
          <Zap size={iconSz} className="text-emerald-300" fill="currentColor" />
        ) : (
          <Laptop size={iconSz} className="text-white/90" />
        )}
      </AppleRingGauge>

      {/* 2. Wi-Fi / Network Ring */}
      <AppleRingGauge
        percent={wifiPct}
        color={wifiColor}
        size={size}
        stroke={size >= 28 ? 3 : 2.5}
        title={`Wi-Fi Terhubung • ↓ ${formatNetSpeed(netDown)} • ↑ ${formatNetSpeed(netUp)}`}
        label={showLabels ? formatNetSpeed(netDown) : null}
        sublabel={showLabels ? 'Wi-Fi' : null}
      >
        <Wifi size={iconSz} className="text-sky-300" />
      </AppleRingGauge>

      {/* 3. Bluetooth Battery Ring */}
      <AppleRingGauge
        percent={btPct}
        color={btColor}
        size={size}
        stroke={size >= 28 ? 3 : 2.5}
        title={
          primaryBt
            ? `Bluetooth: ${primaryBt.name} (${primaryBt.battery >= 0 ? `${primaryBt.battery}%` : 'Connected'})`
            : 'Bluetooth: Tidak ada perangkat audio terhubung'
        }
        label={showLabels ? (primaryBt ? `${btPct}%` : 'Off') : null}
        sublabel={showLabels ? (primaryBt ? primaryBt.name : 'Bluetooth') : null}
      >
        {primaryBt ? (
          <Headphones size={iconSz} className="text-purple-300" />
        ) : (
          <Bluetooth size={iconSz} className="text-white/40" />
        )}
      </AppleRingGauge>
    </div>
  );
}

/**
 * Expressive glowing Cyber-Nusa eyes that live inside the notch.
 */
export function CyberMascotEyes({
  jarvisStatus = 'idle',
  happy = false,
  compact = false,
  musicPlaying = false,
}) {
  const [blinking, setBlinking] = useState(false);
  const [gaze, setGaze] = useState({ x: 0, y: 0 });
  const [greetSmile, setGreetSmile] = useState(false);

  useEffect(() => {
    let timeoutId;
    let doubleTimeoutId;
    const scheduleBlink = () => {
      const nextMs = 2400 + Math.random() * 2800;
      timeoutId = setTimeout(() => {
        setBlinking(true);
        setTimeout(() => {
          setBlinking(false);
          if (Math.random() < 0.28) {
            doubleTimeoutId = setTimeout(() => {
              setBlinking(true);
              setTimeout(() => setBlinking(false), 110);
            }, 140);
          }
          scheduleBlink();
        }, 120);
      }, nextMs);
    };
    scheduleBlink();
    return () => {
      clearTimeout(timeoutId);
      clearTimeout(doubleTimeoutId);
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      const r = Math.random();
      if (r < 0.28) setGaze({ x: -2, y: 0 });
      else if (r < 0.56) setGaze({ x: 2, y: 0 });
      else if (r < 0.72) setGaze({ x: 0, y: -1 });
      else setGaze({ x: 0, y: 0 });

      if (Math.random() < 0.16) {
        setGreetSmile(true);
        setTimeout(() => setGreetSmile(false), 1300);
      }
    }, 3200);
    return () => clearInterval(id);
  }, []);

  const isListening = jarvisStatus === 'listening';
  const isSpeaking = jarvisStatus === 'speaking' || jarvisStatus === 'processing';
  const showHappy = happy || greetSmile;

  const eyeW = compact ? 4.5 : 5.5;
  const eyeH = compact ? 8.5 : 10;

  if (isListening || isSpeaking) {
    const visorColor = isListening ? '#ff2a85' : '#00f0ff';
    return (
      <div className="flex items-center gap-1">
        {[0.55, 1, 0.75, 1, 0.55].map((h, i) => (
          <motion.span
            key={i}
            className="w-[2.5px] rounded-full"
            style={{
              height: compact ? 9 : 11,
              backgroundColor: visorColor,
              boxShadow: `0 0 8px ${visorColor}`,
            }}
            animate={{ scaleY: [0.35, h, 0.45, h * 0.9, 0.35] }}
            transition={{ duration: 0.55 + i * 0.08, repeat: Infinity, ease: 'easeInOut' }}
          />
        ))}
      </div>
    );
  }

  return (
    <motion.div
      animate={{ x: gaze.x, y: gaze.y }}
      transition={{ type: 'spring', stiffness: 260, damping: 20 }}
      className="relative flex items-center gap-[5px]"
    >
      {showHappy ? (
        <>
          <svg width={eyeW + 3} height={eyeH - 2} viewBox="0 0 10 8" className="overflow-visible">
            <path
              d="M1.5 6.5 Q5 1.2 8.5 6.5"
              fill="none"
              stroke="#ffffff"
              strokeWidth="2.2"
              strokeLinecap="round"
              style={{ filter: 'drop-shadow(0 0 5px #00f0ff)' }}
            />
          </svg>
          <svg width={eyeW + 3} height={eyeH - 2} viewBox="0 0 10 8" className="overflow-visible">
            <path
              d="M1.5 6.5 Q5 1.2 8.5 6.5"
              fill="none"
              stroke="#ffffff"
              strokeWidth="2.2"
              strokeLinecap="round"
              style={{ filter: 'drop-shadow(0 0 5px #00f0ff)' }}
            />
          </svg>
        </>
      ) : (
        <>
          <motion.span
            animate={{
              scaleY: blinking ? 0.12 : musicPlaying ? [1, 1.08, 1] : 1,
            }}
            transition={
              blinking
                ? { duration: 0.07 }
                : { duration: 1.4, repeat: musicPlaying ? Infinity : 0, ease: 'easeInOut' }
            }
            className="rounded-full bg-white"
            style={{
              width: eyeW,
              height: eyeH,
              boxShadow: '0 0 6px rgba(255,255,255,0.9), 0 0 12px rgba(0, 240, 255, 0.8)',
            }}
          />
          <motion.span
            animate={{
              scaleY: blinking ? 0.12 : musicPlaying ? [1, 1.08, 1] : 1,
            }}
            transition={
              blinking
                ? { duration: 0.07 }
                : { duration: 1.4, repeat: musicPlaying ? Infinity : 0, ease: 'easeInOut', delay: 0.08 }
            }
            className="rounded-full bg-white"
            style={{
              width: eyeW,
              height: eyeH,
              boxShadow: '0 0 6px rgba(255,255,255,0.9), 0 0 12px rgba(168, 85, 247, 0.8)',
            }}
          />
        </>
      )}
    </motion.div>
  );
}

/**
 * Nusa 1.1 "Volume, right in the notch — Hover the speaker, then slide"
 */
export function HoverVolumeSlider({ sysinfo, compact = false }) {
  const [open, setOpen] = useState(false);
  const volume = sysinfo?.volume ?? 50;
  const muted = !!sysinfo?.muted;
  const effectiveVol = muted ? 0 : volume;
  const VolIcon = muted || volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2;

  const onWheel = (e) => {
    e.stopPropagation();
    const step = e.deltaY < 0 ? 4 : -4;
    api.sysinfo.setVolume(Math.max(0, Math.min(100, volume + step)));
  };

  return (
    <motion.div
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onWheel={onWheel}
      onClick={(e) => e.stopPropagation()}
      className="flex items-center gap-1.5 rounded-full bg-white/[0.06] px-2 py-1 ring-1 ring-white/[0.08] transition-colors hover:bg-white/[0.12]"
      title="Hover & geser untuk atur volume • Scroll roda mouse • Klik ikon untuk Mute"
    >
      <button
        type="button"
        onClick={() => api.sysinfo.toggleMute()}
        className={`grid h-4 w-4 shrink-0 place-items-center rounded-full transition-colors ${
          muted ? 'text-rose-400' : 'text-white/80 hover:text-white'
        }`}
      >
        <VolIcon size={compact ? 12 : 13} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: compact ? 58 : 74, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            className="flex items-center gap-1.5 overflow-hidden"
          >
            <div className="relative flex flex-1 items-center py-1">
              <div className="pointer-events-none h-1 w-full overflow-hidden rounded-full bg-white/20">
                <div
                  className="h-full rounded-full bg-white transition-[width] duration-75"
                  style={{ width: `${effectiveVol}%` }}
                />
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={effectiveVol}
                onChange={(e) => api.sysinfo.setVolume(Number(e.target.value))}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </div>
            <span className="w-6 shrink-0 text-right font-mono text-[9px] font-bold tabular-nums text-white/80">
              {muted ? '0%' : `${volume}%`}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
