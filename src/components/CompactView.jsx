import { motion } from 'framer-motion';
import { Layers, BatteryCharging, Hourglass, ArrowDown } from 'lucide-react';
import { formatNetSpeed, useBattery, useClock } from '../hooks.js';
import { formatMinSec } from '../clockStore.js';
import { AutomationStatusBadge } from './AutomationOverlay.jsx';
import { CyberMascotEyes } from './CyberMascot.jsx';

function Equalizer({ playing }) {
  return (
    <div className="flex h-3.5 items-end gap-[2px]">
      {[0.55, 1, 0.7, 0.9].map((h, i) => (
        <motion.span
          key={i}
          className="w-[3px] origin-bottom rounded-full bg-cyan-400 shadow-[0_0_8px_#00f0ff]"
          style={{ height: '100%' }}
          animate={playing ? { scaleY: [h * 0.35, h, h * 0.5, h * 0.9, h * 0.35] } : { scaleY: 0.25 }}
          transition={playing ? { duration: 0.9 + i * 0.12, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.3 }}
        />
      ))}
    </div>
  );
}

export default function CompactView({ media, clock, sysinfo, stashCount, automationStatus, jarvisStatus = 'idle' }) {
  const now = useClock();
  const battery = useBattery();
  const time = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  const timerRunning = !!clock?.timer?.running;
  const netDown = sysinfo?.netDown ?? 0;
  const autoActive = !!(automationStatus && automationStatus.active !== false);

  return (
    <div className="flex h-full items-center justify-between gap-2 px-3 text-[13px] font-semibold">
      {/* left */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <CyberMascotEyes jarvisStatus={jarvisStatus} musicPlaying={media.status === 'Playing'} compact />
        {autoActive && <AutomationStatusBadge status={automationStatus} compact />}
        {timerRunning && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-400/20 px-2 py-0.5 font-mono text-[11px] tabular-nums text-amber-300 ring-1 ring-amber-400/30">
            <Hourglass size={11} />
            {formatMinSec(clock.timer.left)}
          </span>
        )}
        {media.active ? (
          <>
            {media.thumb ? (
              <img src={media.thumb} alt="" className="h-6 w-6 shrink-0 rounded-md object-cover ring-1 ring-cyan-400/40 shadow-sm" />
            ) : (
              <div className="h-6 w-6 shrink-0 rounded-md bg-cyan-500/30" />
            )}
            <span className="truncate text-[12px] font-medium text-white/90">{media.title}</span>
          </>
        ) : (
          !timerRunning && !autoActive && <span className="pl-1 font-mono tabular-nums text-cyan-100">{time}</span>
        )}
      </div>

      {/* right */}
      <div className="flex shrink-0 items-center gap-2 pr-1 font-mono">
        <span className="flex items-center gap-0.5 text-[10.5px] tabular-nums text-cyan-300">
          <ArrowDown size={11} />
          {formatNetSpeed(netDown)}
        </span>
        {stashCount > 0 && (
          <span className="flex items-center gap-1 rounded-full bg-fuchsia-500/20 px-1.5 py-0.5 text-[11px] text-fuchsia-300 ring-1 ring-fuchsia-400/30">
            <Layers size={11} /> {stashCount}
          </span>
        )}
        {media.active ? (
          <Equalizer playing={media.status === 'Playing'} />
        ) : (
          battery && (
            <span className={`flex items-center gap-0.5 text-[11px] tabular-nums ${battery.level <= 20 && !battery.charging ? 'text-rose-400' : 'text-white/70'}`}>
              {battery.charging && <BatteryCharging size={12} className="text-emerald-400" />}
              {battery.level}%
            </span>
          )
        )}
      </div>
    </div>
  );
}
