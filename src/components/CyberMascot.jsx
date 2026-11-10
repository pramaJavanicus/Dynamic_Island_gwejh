import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Volume2, Volume1, VolumeX } from 'lucide-react';

const api = window.island;

/**
 * Concave top-edge shoulder fillets ("Nusa notch ears") that sit flush at y=0
 * on the left and right outer edges of the notch so it melts into the top bezel.
 */
export function CyberNotchEars({ size = 14, color = '#06070d' }) {
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
 * Expressive glowing Cyber-Nusa eyes that live inside the notch.
 * Features:
 *  - Natural periodic blink + occasional double-blink
 *  - Subtle autonomous eye-gaze shifting left/right/up
 *  - Happy "^ ^" arc eyes when happy/hovered or greeted
 *  - Cyberpunk Jarvis visor state when Jarvis is listening/speaking
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

  // Periodic natural blink
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

  // Subtle autonomous gaze movement + occasional happy "^ ^" expression
  useEffect(() => {
    const id = setInterval(() => {
      const r = Math.random();
      if (r < 0.28) {
        setGaze({ x: -2.2, y: 0 });
      } else if (r < 0.56) {
        setGaze({ x: 2.2, y: 0 });
      } else if (r < 0.72) {
        setGaze({ x: 0, y: -1.2 });
      } else {
        setGaze({ x: 0, y: 0 });
      }

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

  const eyeW = compact ? 5 : 6;
  const eyeH = compact ? 9.5 : 11;

  if (isListening || isSpeaking) {
    const visorColor = isListening ? '#ff2a85' : '#00f0ff';
    return (
      <div className="flex items-center gap-1.5">
        {[0.55, 1, 0.75, 1, 0.55].map((h, i) => (
          <motion.span
            key={i}
            className="w-[3px] rounded-full"
            style={{
              height: compact ? 10 : 12,
              backgroundColor: visorColor,
              boxShadow: `0 0 10px ${visorColor}`,
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
      className="relative flex items-center gap-[6px]"
    >
      {showHappy ? (
        // Happy "^ ^" Nusa arcs (like 00:32 in the video)
        <>
          <svg width={eyeW + 3} height={eyeH - 2} viewBox="0 0 10 8" className="overflow-visible">
            <path
              d="M1.5 6.5 Q5 1.2 8.5 6.5"
              fill="none"
              stroke="#ffffff"
              strokeWidth="2.4"
              strokeLinecap="round"
              style={{ filter: 'drop-shadow(0 0 6px #00f0ff)' }}
            />
          </svg>
          <svg width={eyeW + 3} height={eyeH - 2} viewBox="0 0 10 8" className="overflow-visible">
            <path
              d="M1.5 6.5 Q5 1.2 8.5 6.5"
              fill="none"
              stroke="#ffffff"
              strokeWidth="2.4"
              strokeLinecap="round"
              style={{ filter: 'drop-shadow(0 0 6px #00f0ff)' }}
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
            className=" rounded-full bg-white"
            style={{
              width: eyeW,
              height: eyeH,
              boxShadow: '0 0 8px rgba(255,255,255,0.95), 0 0 14px rgba(0, 240, 255, 0.85)',
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
              boxShadow: '0 0 8px rgba(255,255,255,0.95), 0 0 14px rgba(168, 85, 247, 0.85)',
            }}
          />
        </>
      )}
    </motion.div>
  );
}

/**
 * Glowing Cyber-Nusa Cat Silhouette Badge (from 00:03 & 00:34 of the Nusa 1.1 reel)
 * with Cyberpunk cyan-to-magenta neon rim.
 */
export function CyberCatBadge({ jarvisStatus = 'idle', onClick }) {
  const [hovered, setHovered] = useState(false);

  return (
    <motion.button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      whileTap={{ scale: 0.9 }}
      title="Cyber-Nusa × Jarvis HUD"
      className="group relative flex h-7 w-8 shrink-0 items-center justify-center"
    >
      <svg width="30" height="24" viewBox="0 0 36 28" className="overflow-visible">
        <defs>
          <linearGradient id="cyberCatGlow" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#00f0ff" />
            <stop offset="50%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#ff2bd6" />
          </linearGradient>
        </defs>
        {/* Cat-ear capsule silhouette */}
        <path
          d="M6 10 L9 3.2 Q10.2 1.5 12.2 3 L15 6 H21 L23.8 3 Q25.8 1.5 27 3.2 L30 10 Q33 15 31 21 Q29 25.5 18 25.5 Q7 25.5 5 21 Q3 15 6 10 Z"
          fill="#05060c"
          stroke="url(#cyberCatGlow)"
          strokeWidth="1.6"
          style={{ filter: 'drop-shadow(0 2px 8px rgba(0, 240, 255, 0.45))' }}
        />
        {/* Eyes inside the badge */}
        {hovered ? (
          <>
            <path d="M11.5 16 Q13.8 12.5 16 16" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
            <path d="M20 16 Q22.2 12.5 24.5 16" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
          </>
        ) : (
          <>
            <rect
              x="12.2"
              y="11.5"
              width="3.2"
              height="6.5"
              rx="1.6"
              fill={jarvisStatus === 'listening' ? '#ff2a85' : '#ffffff'}
              style={{ filter: 'drop-shadow(0 0 4px #00f0ff)' }}
            />
            <rect
              x="20.6"
              y="11.5"
              width="3.2"
              height="6.5"
              rx="1.6"
              fill={jarvisStatus === 'listening' ? '#ff2a85' : '#ffffff'}
              style={{ filter: 'drop-shadow(0 0 4px #ff2bd6)' }}
            />
          </>
        )}
      </svg>
    </motion.button>
  );
}

/**
 * Nusa 1.1 "Volume, right in the notch — Hover the speaker, then slide"
 * Inline hover-expandable volume slider that fits right inside the notch header or player.
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
      className="flex items-center gap-1.5 rounded-full bg-white/[0.06] px-2 py-1 ring-1 ring-cyan-400/20 transition-colors hover:bg-white/[0.1] hover:ring-cyan-400/40"
      title="Hover & geser untuk atur volume • Scroll roda mouse • Klik ikon untuk Mute"
    >
      <button
        type="button"
        onClick={() => api.sysinfo.toggleMute()}
        className={`grid h-5 w-5 shrink-0 place-items-center rounded-full transition-colors ${
          muted ? 'text-rose-400' : 'text-cyan-300 hover:text-white'
        }`}
      >
        <VolIcon size={compact ? 12.5 : 13.5} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: compact ? 68 : 84, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            className=" flex items-center gap-1.5 overflow-hidden"
          >
            <div className="relative flex flex-1 items-center py-1">
              <div className="pointer-events-none h-1.5 w-full overflow-hidden rounded-full bg-white/15">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-indigo-400 to-fuchsia-400 transition-[width] duration-75"
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
            <span className="w-6 shrink-0 text-right font-mono text-[9.5px] font-bold tabular-nums text-cyan-200">
              {muted ? '0%' : `${volume}%`}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
