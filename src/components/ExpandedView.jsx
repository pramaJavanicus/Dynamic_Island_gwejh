import { AnimatePresence, motion } from 'framer-motion';
import {
  Home, Music2, Clock, Layers, Sparkles, Pin, PinOff, Thermometer, Battery, BatteryCharging,
  Headphones, Bluetooth, ArrowDown, Mic, MicOff, Loader2, Volume2,
} from 'lucide-react';
import { formatNetSpeed, useBattery, useClock } from '../hooks.js';
import { formatMinSec } from '../clockStore.js';
import HomeTab from './HomeTab.jsx';
import MediaTab from './MediaTab.jsx';
import ClockTab from './ClockTab.jsx';
import StashTab from './StashTab.jsx';
import GeminiTab from './GeminiTab.jsx';

const TABS = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'media', label: 'Music', icon: Music2 },
  { id: 'clock', label: 'Clock', icon: Clock },
  { id: 'stash', label: 'Stash', icon: Layers },
  { id: 'gemini', label: 'Gemini', icon: Sparkles },
];

export default function ExpandedView({
  tab, setTab, pinned, setPinned, config, media, sysinfo, clock,
  stashItems, stashActions, clipboardItems, clipboardActions,
  jarvis, voiceTurn,
  dragOver, focusToken, onInputFocus, onDragOut,
}) {
  const now = useClock();
  const battery = useBattery();
  const temp = sysinfo?.temp;
  const netDown = sysinfo?.netDown ?? 0;
  const netUp = sysinfo?.netUp ?? 0;
  const primaryBt = sysinfo?.bluetooth?.[0] || null;

  const isListening = jarvis?.status === 'listening';
  const isProcessing = jarvis?.status === 'processing';
  const isSpeaking = jarvis?.status === 'speaking';

  return (
    <div className="flex h-full flex-col px-4 pb-4 pt-3">
      {/* header */}
      <div className="flex w-full items-center justify-between gap-2">
        <div className="relative flex shrink-0 rounded-full bg-white/[0.07] p-1">
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
              <Icon size={12} className={id === 'gemini' ? 'text-indigo-400' : ''} />
              {label}
              {id === 'stash' && stashItems.length > 0 && (
                <span className="rounded-full bg-sky-500 px-1.5 text-[9px] leading-4 text-white">{stashItems.length}</span>
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

        <div className="flex shrink-0 items-center gap-1.5">
          {/* Live system status pill (Suhu, Baterai Laptop, Network Speed, Bluetooth) */}
          <div className="flex items-center gap-1.5 rounded-full bg-white/[0.06] px-2.5 py-1 text-[10px] font-medium text-white/80">
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

          <div className="shrink-0 text-right leading-tight">
            <div className="font-display text-[12.5px] font-semibold tabular-nums">
              {now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
            </div>
            <div className="text-[9px] text-white/45">
              {now.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' })}
            </div>
          </div>

          {/* Global Jarvis Voice Control Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              jarvis?.toggleListening();
            }}
            title={
              isListening
                ? 'Jarvis sedang mendengarkan… (klik untuk selesai)'
                : isSpeaking
                  ? 'Jarvis sedang berbicara (klik untuk hentikan)'
                  : 'Perintah Suara Jarvis (kontrol Dynamic Island & tanya Gemini via suara)'
            }
            className={`grid h-7 w-7 shrink-0 place-items-center rounded-full transition-all ${
              isListening
                ? 'bg-rose-500 text-white shadow-[0_0_14px_rgba(244,63,94,0.65)] animate-pulse'
                : isProcessing
                  ? 'bg-indigo-500/30 text-indigo-300'
                  : isSpeaking
                    ? 'bg-cyan-400 text-black shadow-[0_0_12px_rgba(34,211,238,0.5)]'
                    : 'bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-400/30 hover:bg-cyan-500/25 hover:text-white'
            }`}
          >
            {isProcessing ? (
              <Loader2 size={13} className="animate-spin" />
            ) : isSpeaking ? (
              <Volume2 size={13} />
            ) : isListening ? (
              <MicOff size={13} />
            ) : (
              <Mic size={13} />
            )}
          </button>

          {/* Pin Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setPinned((p) => !p);
            }}
            title={pinned ? 'Ter-pin (tetap terbuka saat kerja) — klik untuk lepas pin' : 'Pin Dynamic Island agar tetap terbuka'}
            className={`grid h-7 w-7 shrink-0 place-items-center rounded-full transition-all ${
              pinned
                ? 'bg-emerald-400 text-black shadow-[0_0_12px_rgba(52,211,153,0.45)]'
                : 'bg-white/[0.08] text-white/55 hover:bg-white/15 hover:text-white'
            }`}
          >
            {pinned ? <Pin size={13} /> : <PinOff size={13} />}
          </button>
        </div>
      </div>

      {/* Global Jarvis Voice Feedback Pill (when using voice on non-Gemini tabs) */}
      {tab !== 'gemini' && (isListening || isProcessing || isSpeaking) && (
        <div className="mt-2 flex items-center justify-between rounded-xl bg-gradient-to-r from-cyan-500/20 via-indigo-500/20 to-purple-500/20 px-3 py-1 text-[11px] ring-1 ring-cyan-400/35">
          <div className="flex min-w-0 flex-1 items-center gap-2 truncate text-cyan-200">
            <span className="h-2 w-2 shrink-0 rounded-full bg-cyan-400 animate-ping" />
            {isListening && (
              <span className="truncate">
                <b>Jarvis mendengar:</b> Ucapkan perintah (mis: <i>"Buka kalkulator"</i>, <i>"Timer 5 menit"</i>, <i>"Putar musik"</i>, atau tanya Gemini)
              </span>
            )}
            {isProcessing && <span><b>Jarvis:</b> Memproses suaramu…</span>}
            {isSpeaking && (
              <span className="truncate">
                <b>Jarvis:</b> {jarvis.lastReply || 'Berbicara…'}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => jarvis?.toggleListening()}
            className="ml-2 shrink-0 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-white/25"
          >
            {isListening ? 'Selesai' : 'Stop'}
          </button>
        </div>
      )}

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
            {tab === 'gemini' && (
              <GeminiTab jarvis={jarvis} voiceTurn={voiceTurn} onInputFocus={onInputFocus} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
