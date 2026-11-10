import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Home, Music2, Clock, Layers, Sparkles, Pin, PinOff, Thermometer, Battery, BatteryCharging,
  Headphones, Bluetooth, ArrowDown, Mic, MicOff, Loader2, Volume2, FileCheck2, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { formatNetSpeed, useBattery, useClock } from '../hooks.js';
import { formatMinSec } from '../clockStore.js';
import HomeTab from './HomeTab.jsx';
import MediaTab from './MediaTab.jsx';
import ClockTab from './ClockTab.jsx';
import StashTab from './StashTab.jsx';
import GeminiTab from './GeminiTab.jsx';
import { AutomationStatusBadge, FormPreviewDrawer } from './AutomationOverlay.jsx';
import { CyberCatBadge, HoverVolumeSlider } from './CyberMascot.jsx';

const TABS = [
  { id: 'home', label: 'Home', icon: Home, accent: 'text-cyan-300' },
  { id: 'media', label: 'Music', icon: Music2, accent: 'text-fuchsia-300' },
  { id: 'clock', label: 'Clock', icon: Clock, accent: 'text-amber-300' },
  { id: 'stash', label: 'Shelf', icon: Layers, accent: 'text-sky-300' },
  { id: 'gemini', label: 'Jarvis', icon: Sparkles, accent: 'text-indigo-300' },
];

export default function ExpandedView({
  tab, setTab, pinned, setPinned, config, media, sysinfo, clock,
  stashItems, stashActions, clipboardItems, clipboardActions,
  jarvis, voiceTurn, automation,
  dragOver, focusToken, onInputFocus, onDragOut,
}) {
  const [bottomDockHover, setBottomDockHover] = useState(false);
  const now = useClock();
  const battery = useBattery();
  const temp = sysinfo?.temp;
  const netDown = sysinfo?.netDown ?? 0;
  const netUp = sysinfo?.netUp ?? 0;
  const primaryBt = sysinfo?.bluetooth?.[0] || null;

  const isListening = jarvis?.status === 'listening';
  const isProcessing = jarvis?.status === 'processing';
  const isSpeaking = jarvis?.status === 'speaking';
  const hasFormPreview = !!automation?.formPreview;

  const currentTabIdx = Math.max(0, TABS.findIndex((t) => t.id === tab));
  const cycleTab = (dir) => {
    const nextIdx = (currentTabIdx + dir + TABS.length) % TABS.length;
    setTab(TABS[nextIdx].id);
  };

  return (
    <div className="relative flex h-full flex-col px-5 pb-3 pt-2.5">
      {/* Cyberpunk top-corner HUD bracket accents */}
      <span className="pointer-events-none absolute left-3 top-2 h-2 w-2 border-l border-t border-cyan-400/50" />
      <span className="pointer-events-none absolute right-3 top-2 h-2 w-2 border-r border-t border-fuchsia-400/50" />
      <span className="pointer-events-none absolute bottom-2.5 left-4 h-2 w-2 border-b border-l border-cyan-400/40" />
      <span className="pointer-events-none absolute bottom-2.5 right-4 h-2 w-2 border-b border-r border-fuchsia-400/40" />

      {/* Left & Right Nusa 1.1 "<" ">" quick page cycle arrows */}
      {!hasFormPreview && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              cycleTab(-1);
            }}
            title="Halaman sebelumnya"
            className="absolute left-1 top-1/2 z-20 flex h-7 w-4 -translate-y-1/2 items-center justify-center rounded-full text-white/30 transition hover:bg-white/[0.08] hover:text-cyan-300"
          >
            <ChevronLeft size={13} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              cycleTab(1);
            }}
            title="Halaman berikutnya"
            className="absolute right-1 top-1/2 z-20 flex h-7 w-4 -translate-y-1/2 items-center justify-center rounded-full text-white/30 transition hover:bg-white/[0.08] hover:text-fuchsia-300"
          >
            <ChevronRight size={13} />
          </button>
        </>
      )}

      {/* Header */}
      <div className="flex w-full items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {/* Nusa 1.1 x Cyberpunk Mascot Cat Badge */}
          <CyberCatBadge
            jarvisStatus={jarvis?.status}
            onClick={(e) => {
              e.stopPropagation();
              setTab('gemini');
            }}
          />

          {/* Top Navigation Bar */}
          <div className="relative flex shrink-0 rounded-full bg-white/[0.05] p-0.5 ring-1 ring-cyan-400/20">
            {TABS.map(({ id, label, icon: Icon, accent }) => {
              const active = tab === id && !hasFormPreview;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  onDragEnter={() => {
                    if (id === 'home' || id === 'stash') setTab(id);
                  }}
                  className={`relative z-10 flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    active ? 'text-white' : 'text-white/65 hover:text-white'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="tab-pill"
                      className="absolute inset-0 -z-10 rounded-full bg-gradient-to-r from-cyan-500/30 via-indigo-500/30 to-fuchsia-500/30 ring-1 ring-cyan-400/50 shadow-[0_0_14px_rgba(0,240,255,0.28)]"
                      transition={{ type: 'spring', stiffness: 440, damping: 34 }}
                    />
                  )}
                  <Icon size={11.5} className={active ? accent : ''} />
                  {label}
                  {id === 'stash' && stashItems.length > 0 && (
                    <span className="rounded-full bg-fuchsia-500 px-1.5 font-mono text-[9px] leading-4 text-white shadow-[0_0_8px_rgba(217,70,239,0.6)]">
                      {stashItems.length}
                    </span>
                  )}
                  {id === 'media' && media.status === 'Playing' && (
                    <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_#00f0ff]" />
                  )}
                  {id === 'clock' && (clock?.ringing || clock?.timer?.running || clock?.stopwatch?.running) && (
                    <span className="rounded-full bg-amber-400/25 px-1.5 font-mono text-[9px] font-semibold tabular-nums text-amber-300">
                      {clock?.timer?.running ? formatMinSec(clock.timer.left) : '●'}
                    </span>
                  )}
                </button>
              );
            })}
            {hasFormPreview && (
              <div className="flex items-center gap-1 rounded-full bg-emerald-400/20 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 ring-1 ring-emerald-400/40">
                <FileCheck2 size={12} />
                Form Preview
              </div>
            )}
          </div>
        </div>

        <div className="flex min-w-0 shrink-0 items-center gap-1.5">
          {/* Live Automation Status Badge */}
          <AnimatePresence>
            {automation?.status && (
              <AutomationStatusBadge status={automation.status} compact />
            )}
          </AnimatePresence>

          {/* Nusa 1.1 Inline Hover Volume Slider ("Volume, right in the notch") */}
          <HoverVolumeSlider sysinfo={sysinfo} compact />

          {/* Cyberpunk HUD System Telemetry Pill */}
          <div className="flex items-center gap-1.5 rounded-full bg-white/[0.05] px-2.5 py-1 font-mono text-[10px] font-semibold text-white/85 ring-1 ring-white/[0.08]">
            <span className="flex items-center gap-0.5 tabular-nums" title={`Suhu ~${temp ?? '--'}°C (CPU ${sysinfo?.cpu ?? '--'}%)`}>
              <Thermometer size={11} className={temp >= 75 ? 'text-rose-400' : temp >= 62 ? 'text-amber-300' : 'text-cyan-400'} />
              {temp != null ? `${temp}°C` : '--°C'}
            </span>
            {battery && (
              <span className="flex items-center gap-0.5 tabular-nums" title="Baterai Laptop">
                {battery.charging ? (
                  <BatteryCharging size={11} className="text-emerald-400" />
                ) : (
                  <Battery size={11} className={battery.level <= 20 ? 'text-rose-400' : 'text-fuchsia-300'} />
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
                  <Headphones size={10.5} className="text-fuchsia-400" />
                  <span className="text-fuchsia-300">{primaryBt.battery}%</span>
                </>
              ) : (
                <Bluetooth size={10.5} className="text-white/30" />
              )}
            </span>
          </div>

          <div className="shrink-0 text-right leading-tight">
            <div className="font-mono text-[12px] font-bold tabular-nums text-cyan-100">
              {now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
            </div>
            <div className="font-mono text-[8.5px] uppercase tracking-wider text-fuchsia-300/60">
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
                  : 'Perintah Suara Jarvis (Ctrl+0 atau ucapkan "Hei Jarvis")'
            }
            className={`grid h-7 w-7 shrink-0 place-items-center rounded-full transition-all ${
              isListening
                ? 'bg-rose-500 text-white shadow-[0_0_16px_rgba(244,63,94,0.8)] animate-pulse'
                : isProcessing
                  ? 'bg-indigo-500/30 text-indigo-300 ring-1 ring-indigo-400/40'
                  : isSpeaking
                    ? 'bg-cyan-400 text-black shadow-[0_0_16px_rgba(0,240,255,0.75)]'
                    : 'bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-400/35 hover:bg-cyan-500/25 hover:text-white'
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
                ? 'bg-cyan-400 text-black shadow-[0_0_14px_rgba(0,240,255,0.6)]'
                : 'bg-white/[0.08] text-white/55 hover:bg-white/15 hover:text-white'
            }`}
          >
            {pinned ? <Pin size={13} /> : <PinOff size={13} />}
          </button>
        </div>
      </div>

      {/* Global Jarvis Voice Feedback Pill (when using voice on non-Gemini tabs) */}
      {tab !== 'gemini' && (isListening || isProcessing || isSpeaking) && (
        <div className="mt-1.5 flex items-center justify-between rounded-xl bg-gradient-to-r from-cyan-500/20 via-indigo-500/20 to-fuchsia-500/20 px-3 py-1 text-[11px] ring-1 ring-cyan-400/45 shadow-[0_0_16px_rgba(0,240,255,0.18)]">
          <div className="flex min-w-0 flex-1 items-center gap-2 truncate text-cyan-200">
            <span className="h-2 w-2 shrink-0 rounded-full bg-cyan-400 animate-ping" />
            {isListening && (
              <span className="truncate">
                <b>JARVIS // LISTENING:</b> Ucapkan perintah (mis: <i>&quot;Isi Google Form ini&quot;</i>, <i>&quot;Benerin error di App.jsx&quot;</i>, <i>&quot;Pindah ke tab YouTube&quot;</i>)
              </span>
            )}
            {isProcessing && <span><b>JARVIS // PROCESSING:</b> Memproses perintahmu…</span>}
            {isSpeaking && (
              <span className="truncate">
                <b>JARVIS:</b> {jarvis.lastReply || 'Berbicara…'}
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

      {/* Main Tab Body */}
      <div className="relative mt-2.5 flex-1">
        <AnimatePresence mode="wait" initial={false}>
          {hasFormPreview ? (
            <motion.div
              key="form-preview"
              initial={{ opacity: 0, y: 6, scale: 0.985, filter: 'blur(4px)' }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -6, scale: 0.985, filter: 'blur(4px)' }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-0"
            >
              <FormPreviewDrawer
                preview={automation.formPreview}
                submitting={automation.submitting}
                onSubmit={automation.submitForm}
                onCancel={automation.cancelForm}
              />
            </motion.div>
          ) : (
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 5, scale: 0.99, filter: 'blur(3px)' }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -5, scale: 0.99, filter: 'blur(3px)' }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
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
          )}
        </AnimatePresence>
      </div>

      {/* Nusa 1.1 Bottom "Every page, one hover away — Hover the dots, pick a page" (00:18 in video) */}
      {!hasFormPreview && (
        <div
          onMouseEnter={() => setBottomDockHover(true)}
          onMouseLeave={() => setBottomDockHover(false)}
          className="mt-1.5 flex h-5 items-center justify-center"
        >
          <motion.div
            layout
            transition={{ type: 'spring', stiffness: 460, damping: 32 }}
            className={`flex items-center justify-center rounded-full transition-colors ${
              bottomDockHover
                ? 'gap-1.5 bg-white/[0.08] px-2.5 py-0.5 ring-1 ring-cyan-400/35 shadow-[0_0_16px_rgba(0,240,255,0.22)]'
                : 'gap-1.5 px-2 py-0.5'
            }`}
          >
            {TABS.map(({ id, label, icon: Icon, accent }) => {
              const active = tab === id;
              return bottomDockHover ? (
                <button
                  key={id}
                  type="button"
                  onMouseEnter={() => setTab(id)}
                  onClick={() => setTab(id)}
                  title={label}
                  className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-all ${
                    active
                      ? 'bg-gradient-to-r from-cyan-500/35 to-fuchsia-500/35 text-white ring-1 ring-cyan-400/50 shadow-[0_0_10px_rgba(0,240,255,0.35)]'
                      : 'text-white/55 hover:text-white'
                  }`}
                >
                  <Icon size={11} className={active ? accent : ''} />
                  <span>{label}</span>
                </button>
              ) : (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  aria-label={label}
                  className={`rounded-full transition-all duration-200 ${
                    active
                      ? 'h-1.5 w-4 bg-gradient-to-r from-cyan-400 to-fuchsia-400 shadow-[0_0_8px_#00f0ff]'
                      : 'h-1.5 w-1.5 bg-white/30 hover:bg-white/60'
                  }`}
                />
              );
            })}
          </motion.div>
        </div>
      )}
    </div>
  );
}
