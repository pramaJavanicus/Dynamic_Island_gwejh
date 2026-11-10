import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Home, Music2, Clock, Layers, Sparkles, Pin, PinOff,
  Mic, MicOff, Loader2, Volume2, FileCheck2, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { useClock } from '../hooks.js';
import HomeTab from './HomeTab.jsx';
import MediaTab from './MediaTab.jsx';
import ClockTab from './ClockTab.jsx';
import StashTab from './StashTab.jsx';
import GeminiTab from './GeminiTab.jsx';
import { AutomationStatusBadge, FormPreviewDrawer } from './AutomationOverlay.jsx';
import { AppleStatusRings, HoverVolumeSlider } from './CyberMascot.jsx';

const TABS = [
  { id: 'home', label: 'Today', icon: Home, accent: 'text-cyan-300' },
  { id: 'media', label: 'Music', icon: Music2, accent: 'text-pink-400' },
  { id: 'clock', label: 'Clock', icon: Clock, accent: 'text-amber-300' },
  { id: 'stash', label: 'Shelf', icon: Layers, accent: 'text-indigo-300' },
  { id: 'gemini', label: 'Jarvis', icon: Sparkles, accent: 'text-cyan-300' },
];

export default function ExpandedView({
  tab, setTab, pinned, setPinned, config, media, sysinfo, clock,
  stashItems, stashActions, clipboardItems, clipboardActions,
  jarvis, voiceTurn, automation,
  dragOver, focusToken, onInputFocus, onDragOut,
}) {
  const [bottomDockHover, setBottomDockHover] = useState(false);
  const now = useClock();

  const isListening = jarvis?.status === 'listening';
  const isProcessing = jarvis?.status === 'processing';
  const isSpeaking = jarvis?.status === 'speaking';
  const hasFormPreview = !!automation?.formPreview;

  const currentTabIdx = Math.max(0, TABS.findIndex((t) => t.id === tab));
  const activeTabMeta = TABS[currentTabIdx] || TABS[0];

  const cycleTab = (dir) => {
    const nextIdx = (currentTabIdx + dir + TABS.length) % TABS.length;
    setTab(TABS[nextIdx].id);
  };

  const formattedDate = now.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const formattedTime = now.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="relative flex h-full flex-col px-5 pb-2.5 pt-2.5">
      {/* Subtle left & right "<" ">" quick page cycle arrows */}
      {!hasFormPreview && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              cycleTab(-1);
            }}
            title="Halaman sebelumnya"
            className="absolute left-1 top-1/2 z-20 flex h-7 w-4 -translate-y-1/2 items-center justify-center rounded-full text-white/25 transition hover:bg-white/[0.08] hover:text-white"
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
            className="absolute right-1 top-1/2 z-20 flex h-7 w-4 -translate-y-1/2 items-center justify-center rounded-full text-white/25 transition hover:bg-white/[0.08] hover:text-white"
          >
            <ChevronRight size={13} />
          </button>
        </>
      )}

      {/* Clean Minimal Header (like Image 1, 2, 3: Title on left, Apple Rings + Date/Time on right) */}
      <div className="flex w-full items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-[17px] font-bold tracking-tight text-white">
            {hasFormPreview ? 'Form Preview' : activeTabMeta.label}
          </h2>
          {hasFormPreview && (
            <span className="flex items-center gap-1 rounded-full bg-emerald-400/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 ring-1 ring-emerald-400/35">
              <FileCheck2 size={11} />
              Auto-Fill
            </span>
          )}
          <AnimatePresence>
            {automation?.status && (
              <AutomationStatusBadge status={automation.status} compact />
            )}
          </AnimatePresence>
        </div>

        <div className="flex min-w-0 shrink-0 items-center gap-2.5">
          {/* Apple-Style Circular Rings: Laptop Battery, Wi-Fi, Bluetooth Battery */}
          <AppleStatusRings sysinfo={sysinfo} size={22} />

          {/* Inline Hover Volume Slider */}
          <HoverVolumeSlider sysinfo={sysinfo} compact />

          {/* Clean Date & Time ("Wed 4 Nov 16:43" style from Image 1 & 3) */}
          <div className="flex items-baseline gap-1.5 text-[12.5px] tabular-nums">
            <span className="font-medium text-white/75">{formattedDate}</span>
            <span className="font-display font-bold text-white">{formattedTime}</span>
          </div>

          {/* Jarvis Voice Button */}
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
            className={`grid h-6 w-6 shrink-0 place-items-center rounded-full transition-all ${
              isListening
                ? 'bg-rose-500 text-white shadow-[0_0_12px_rgba(244,63,94,0.8)] animate-pulse'
                : isProcessing
                  ? 'bg-indigo-500/30 text-indigo-300'
                  : isSpeaking
                    ? 'bg-cyan-400 text-black shadow-[0_0_12px_rgba(0,240,255,0.7)]'
                    : 'bg-white/[0.08] text-white/75 hover:bg-white/15 hover:text-white'
            }`}
          >
            {isProcessing ? (
              <Loader2 size={12} className="animate-spin" />
            ) : isSpeaking ? (
              <Volume2 size={12} />
            ) : isListening ? (
              <MicOff size={12} />
            ) : (
              <Mic size={12} />
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
            className={`grid h-6 w-6 shrink-0 place-items-center rounded-full transition-all ${
              pinned
                ? 'bg-cyan-400 text-black shadow-[0_0_10px_rgba(0,240,255,0.5)]'
                : 'bg-white/[0.08] text-white/50 hover:bg-white/15 hover:text-white'
            }`}
          >
            {pinned ? <Pin size={11.5} /> : <PinOff size={11.5} />}
          </button>
        </div>
      </div>

      {/* Global Jarvis Voice Feedback Pill (when using voice on non-Gemini tabs) */}
      {tab !== 'gemini' && (isListening || isProcessing || isSpeaking) && (
        <div className="mt-1.5 flex items-center justify-between rounded-xl bg-gradient-to-r from-cyan-500/20 via-indigo-500/20 to-fuchsia-500/20 px-3 py-1 text-[10.5px] ring-1 ring-cyan-400/40">
          <div className="flex min-w-0 flex-1 items-center gap-2 truncate text-cyan-200">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400 animate-ping" />
            {isListening && (
              <span className="truncate">
                <b>Jarvis mendengar:</b> Ucapkan perintahmu…
              </span>
            )}
            {isProcessing && <span><b>Jarvis:</b> Memproses perintahmu…</span>}
            {isSpeaking && (
              <span className="truncate">
                <b>Jarvis:</b> {jarvis.lastReply || 'Berbicara…'}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => jarvis?.toggleListening()}
            className="ml-2 shrink-0 rounded-full bg-white/15 px-2 py-0.5 text-[9.5px] font-semibold text-white hover:bg-white/25"
          >
            {isListening ? 'Selesai' : 'Stop'}
          </button>
        </div>
      )}

      {/* Main Body */}
      <div className="relative mt-2 flex-1">
        <AnimatePresence mode="wait" initial={false}>
          {hasFormPreview ? (
            <motion.div
              key="form-preview"
              initial={{ opacity: 0, y: 5, scale: 0.985, filter: 'blur(4px)' }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -5, scale: 0.985, filter: 'blur(4px)' }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
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
              initial={{ opacity: 0, y: 4, scale: 0.99, filter: 'blur(3px)' }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -4, scale: 0.99, filter: 'blur(3px)' }}
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
          )}
        </AnimatePresence>
      </div>

      {/* Bottom Navigation Dots -> Hover to Expand Icon Bar ("Every page, one hover away") */}
      {!hasFormPreview && (
        <div
          onMouseEnter={() => setBottomDockHover(true)}
          onMouseLeave={() => setBottomDockHover(false)}
          onDragOver={(e) => e.preventDefault()}
          className="mt-1.5 flex h-5 items-center justify-center"
        >
          <motion.div
            layout
            transition={{ type: 'spring', stiffness: 460, damping: 32 }}
            className={`flex items-center justify-center rounded-full transition-colors ${
              bottomDockHover
                ? 'gap-1 bg-white/[0.08] px-2.5 py-0.5 ring-1 ring-white/15 shadow-lg'
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
                  onDragEnter={() => {
                    if (id === 'home' || id === 'stash') setTab(id);
                  }}
                  onClick={() => setTab(id)}
                  title={label}
                  className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold transition-all ${
                    active
                      ? 'bg-white/15 text-white ring-1 ring-white/25'
                      : 'text-white/50 hover:text-white'
                  }`}
                >
                  <Icon size={11.5} className={active ? accent : ''} />
                  <span>{label}</span>
                </button>
              ) : (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  onDragEnter={() => {
                    if (id === 'home' || id === 'stash') setTab(id);
                  }}
                  aria-label={label}
                  className={`rounded-full transition-all duration-200 ${
                    active
                      ? 'h-1.5 w-4 bg-white shadow-[0_0_8px_rgba(255,255,255,0.7)]'
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
