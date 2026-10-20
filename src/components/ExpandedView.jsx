import { AnimatePresence, motion } from 'framer-motion';
import {
  Home, Music2, Clock, Layers, Pin, PinOff, Thermometer, Battery, BatteryCharging, Headphones, Bluetooth, ArrowDown,
} from 'lucide-react';
import { formatNetSpeed, useBattery, useClock } from '../hooks.js';
import { formatMinSec } from '../clockStore.js';
import HomeTab from './HomeTab.jsx';
import MediaTab from './MediaTab.jsx';
import ClockTab from './ClockTab.jsx';
import StashTab from './StashTab.jsx';

const TABS = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'media', label: 'Music', icon: Music2 },
  { id: 'clock', label: 'Clock', icon: Clock },
  { id: 'stash', label: 'Stash', icon: Layers },
];

export default function ExpandedView({
  tab, setTab, pinned, setPinned, config, media, sysinfo, clock,
  stashItems, stashActions, clipboardItems, clipboardActions,
  dragOver, focusToken, onInputFocus, onDragOut,
}) {
  const now = useClock();
  const battery = useBattery();
  const temp = sysinfo?.temp;
  const netDown = sysinfo?.netDown ?? 0;
  const netUp = sysinfo?.netUp ?? 0;
  const primaryBt = sysinfo?.bluetooth?.[0] || null;

  return (
    <div className="flex h-full flex-col px-4 pb-4 pt-3">
      {/* header */}
      <div className="flex items-center justify-between gap-1.5">
        <div className="relative flex rounded-full bg-white/[0.07] p-1">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              onDragEnter={() => {
                if (id === 'home' || id === 'stash') setTab(id);
              }}
              className="relative z-10 flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium text-white/75 transition-colors hover:text-white"
            >
              {tab === id && (
                <motion.span
                  layoutId="tab-pill"
                  className="absolute inset-0 -z-10 rounded-full bg-white/15"
                  transition={{ type: 'spring', stiffness: 460, damping: 36 }}
                />
              )}
              <Icon size={12} />
              {label}
              {id === 'stash' && stashItems.length > 0 && (
                <span className="rounded-full bg-sky-500 px-1.5 text-[9.5px] leading-4 text-white">{stashItems.length}</span>
              )}
              {id === 'media' && media.status === 'Playing' && (
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              )}
              {id === 'clock' && (clock?.ringing || clock?.timer?.running || clock?.stopwatch?.running) && (
                <span className="rounded-full bg-amber-400/25 px-1.5 text-[9px] font-semibold tabular-nums text-amber-300">
                  {clock?.timer?.running ? formatMinSec(clock.timer.left) : '●'}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          {/* Live system status pill (Suhu, Baterai Laptop, Network Speed, Bluetooth) */}
          <div className="flex items-center gap-1.5 rounded-full bg-white/[0.06] px-2 py-1 text-[10px] font-medium text-white/80">
            <span className="flex items-center gap-0.5 tabular-nums" title={`Suhu ~${temp ?? '--'}°C (CPU ${sysinfo?.cpu ?? '--'}%)`}>
              <Thermometer size={11} className={temp >= 75 ? 'text-rose-400' : temp >= 62 ? 'text-amber-300' : 'text-emerald-400'} />
              {temp != null ? `${temp}°C` : '--°C'}
            </span>
            {battery && (
              <span className="flex items-center gap-0.5 tabular-nums" title="Baterai Laptop">
                {battery.charging ? (
                  <BatteryCharging size={11} className="text-emerald-400" />
                ) : (
                  <Battery size={11} className={battery.level <= 20 ? 'text-rose-400' : 'text-sky-300'} />
                )}
                {battery.level}%
              </span>
            )}
            <span
              className="flex items-center gap-0.5 tabular-nums text-cyan-300"
              title={`Download: ${formatNetSpeed(netDown)} • Upload: ${formatNetSpeed(netUp)}`}
            >
              <ArrowDown size={10.5} className="text-cyan-400" />
              {formatNetSpeed(netDown)}
            </span>
            <span
              className="flex items-center gap-0.5 tabular-nums"
              title={primaryBt ? `${primaryBt.name}: ${primaryBt.battery}%` : 'Bluetooth tidak terhubung'}
            >
              {primaryBt ? (
                <>
                  <Headphones size={10.5} className="text-indigo-400" />
                  <span className="text-indigo-300">{primaryBt.battery}%</span>
                </>
              ) : (
                <Bluetooth size={10.5} className="text-white/30" />
              )}
            </span>
          </div>

          <div className="text-right leading-tight">
            <div className="font-display text-[13px] font-semibold tabular-nums">
              {now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
            </div>
            <div className="text-[9px] text-white/45">
              {now.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' })}
            </div>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setPinned((p) => !p);
            }}
            title={pinned ? 'Ter-pin (tetap terbuka saat kerja) — klik untuk lepas pin' : 'Pin Dynamic Island agar tetap terbuka'}
            className={`grid h-7 w-7 place-items-center rounded-full transition-all ${
              pinned
                ? 'bg-emerald-400 text-black shadow-[0_0_12px_rgba(52,211,153,0.45)]'
                : 'bg-white/[0.08] text-white/55 hover:bg-white/15 hover:text-white'
            }`}
          >
            {pinned ? <Pin size={13} /> : <PinOff size={13} />}
          </button>
        </div>
      </div>

      {/* body */}
      <div className="relative mt-3 flex-1">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0"
          >
            {tab === 'home' && (
              <HomeTab
                config={config}
                sysinfo={sysinfo}
                dragOver={dragOver}
                focusToken={focusToken}
                onInputFocus={onInputFocus}
              />
            )}
            {tab === 'media' && <MediaTab media={media} sysinfo={sysinfo} />}
            {tab === 'clock' && <ClockTab clock={clock} onInputFocus={onInputFocus} />}
            {tab === 'stash' && (
              <StashTab
                items={stashItems}
                actions={stashActions}
                clipboardItems={clipboardItems}
                clipboardActions={clipboardActions}
                dragOver={dragOver}
                onDragOut={onDragOut}
                onInputFocus={onInputFocus}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
