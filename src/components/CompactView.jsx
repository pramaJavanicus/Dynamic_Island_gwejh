import { motion } from 'framer-motion';
import { Layers, BatteryCharging, Hourglass, ArrowDown } from 'lucide-react';
import { formatNetSpeed, useBattery, useClock } from '../hooks.js';
import { formatMinSec } from '../clockStore.js';

function Equalizer({ playing }) {
  return (
    <div className="flex h-3.5 items-end gap-[2px]">
      {[0.55, 1, 0.7, 0.9].map((h, i) => (
        <motion.span
          key={i}
          className="w-[3px] origin-bottom rounded-full bg-emerald-400"
          style={{ height: '100%' }}
          animate={playing ? { scaleY: [h * 0.35, h, h * 0.5, h * 0.9, h * 0.35] } : { scaleY: 0.25 }}
          transition={playing ? { duration: 0.9 + i * 0.12, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.3 }}
        />
      ))}
    </div>
  );
}

export default function CompactView({ media, clock, sysinfo, stashCount }) {
  const now = useClock();
  const battery = useBattery();
  const time = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  const timerRunning = !!clock?.timer?.running;
  const netDown = sysinfo?.netDown ?? 0;

  return (
    <div className="flex h-full items-center justify-between gap-2 px-2.5 text-[13px] font-semibold">
      {/* left */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {timerRunning && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-400/20 px-2 py-0.5 text-[11px] tabular-nums text-amber-300">
            <Hourglass size={11} />
            {formatMinSec(clock.timer.left)}
          </span>
        )}
        {media.active ? (
          <>
            {media.thumb ? (
              <img src={media.thumb} alt="" className="h-6 w-6 shrink-0 rounded-md object-cover" />
            ) : (
              <div className="h-6 w-6 shrink-0 rounded-md bg-emerald-500/30" />
            )}
            <span className="truncate text-[12px] font-medium text-white/80">{media.title}</span>
          </>
        ) : (
          !timerRunning && <span className="pl-1 tabular-nums">{time}</span>
        )}
      </div>

      {/* right */}
      <div className="flex shrink-0 items-center gap-2 pr-1">
        <span className="flex items-center gap-0.5 text-[10.5px] tabular-nums text-cyan-300">
          <ArrowDown size={11} />
          {formatNetSpeed(netDown)}
        </span>
        {stashCount > 0 && (
          <span className="flex items-center gap-1 rounded-full bg-sky-500/20 px-1.5 py-0.5 text-[11px] text-sky-300">
            <Layers size={11} /> {stashCount}
          </span>
        )}
        {media.active ? (
          <Equalizer playing={media.status === 'Playing'} />
        ) : (
          battery && (
            <span className={`flex items-center gap-0.5 text-[11px] tabular-nums ${battery.level <= 20 && !battery.charging ? 'text-red-400' : 'text-white/60'}`}>
              {battery.charging && <BatteryCharging size={12} className="text-emerald-400" />}
              {battery.level}%
            </span>
          )
        )}
      </div>
    </div>
  );
}
