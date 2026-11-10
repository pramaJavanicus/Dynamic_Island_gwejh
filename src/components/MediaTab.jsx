import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Pause, Play, SkipBack, SkipForward, Music2, MessageSquareQuote, Volume2, Volume1, VolumeX,
} from 'lucide-react';
import { formatTime, useLyrics, useMediaPosition } from '../hooks.js';

const api = window.island;

function CtrlButton({ onClick, disabled, children, big, active }) {
  return (
    <motion.button
      whileTap={{ scale: 0.86 }}
      onClick={onClick}
      disabled={disabled}
      className={`grid place-items-center rounded-full transition-all disabled:opacity-30 ${
        big
          ? 'h-8 w-8 bg-white text-black shadow-md hover:brightness-95'
          : active
            ? 'h-6 w-6 bg-cyan-400/20 text-cyan-300 ring-1 ring-cyan-400/40'
            : 'h-6 w-6 text-white/80 hover:bg-white/10 hover:text-white'
      }`}
    >
      {children}
    </motion.button>
  );
}

export default function MediaTab({ media, sysinfo }) {
  const position = useMediaPosition(media);
  const lyrics = useLyrics(media, position);
  const [showLyrics, setShowLyrics] = useState(true);
  const activeLineRef = useRef(null);
  const playing = media.status === 'Playing';

  const volume = sysinfo?.volume ?? 50;
  const muted = !!sysinfo?.muted;
  const effectiveVol = muted ? 0 : volume;
  const VolIcon = muted || volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2;

  useEffect(() => {
    if (activeLineRef.current) {
      activeLineRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [lyrics.activeIndex]);

  if (!media.active) {
    return (
      <div className="flex h-full items-center justify-between gap-4 rounded-2xl bg-white/[0.04] px-5 py-3 ring-1 ring-white/[0.06]">
        <div className="flex items-center gap-3.5">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#1DB954]/15 text-[#1DB954]">
            <Music2 size={22} />
          </div>
          <div className="text-left">
            <div className="text-[13px] font-bold text-white">Tidak ada musik yang diputar</div>
            <div className="text-[11px] text-white/45">
              Putar lagu di Spotify untuk kontrol &amp; lirik sinkron otomatis.
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => api.media.command('open-spotify')}
          className="shrink-0 rounded-full bg-[#1DB954] px-4 py-1.5 text-[11.5px] font-bold text-black hover:brightness-110"
        >
          Buka Spotify
        </button>
      </div>
    );
  }

  const progress = media.duration ? (position / media.duration) * 100 : 0;

  return (
    <div className="relative flex h-full items-stretch gap-2.5 overflow-hidden rounded-2xl">
      {/* Left: Compact Nusa 1.1 Media Player Card */}
      <div
        className={`relative flex shrink-0 flex-col justify-between rounded-2xl bg-white/[0.05] p-2.5 ring-1 ring-white/[0.06] transition-all ${
          showLyrics ? 'w-[225px]' : 'w-full'
        }`}
      >
        <div className="flex items-center gap-2.5">
          <motion.div
            key={media.thumb}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: playing ? 1 : 0.94, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 280, damping: 24 }}
            className="h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-white/10 shadow-md"
          >
            {media.thumb ? (
              <img src={media.thumb} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="grid h-full w-full place-items-center text-white/30">
                <Music2 size={20} />
              </div>
            )}
          </motion.div>

          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate font-display text-[13px] font-bold text-white" title={media.title}>
              {media.title || 'Unknown title'}
            </div>
            <div className="mt-0.5 truncate text-[11px] text-white/55" title={media.artist}>
              {media.artist || '—'}
            </div>
          </div>
        </div>

        {media.duration > 0 && (
          <div className="flex items-center gap-2 text-[9.5px] tabular-nums text-white/50">
            <span>{formatTime(position)}</span>
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full rounded-full bg-white transition-[width] duration-300 ease-linear"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span>-{formatTime(media.duration - position)}</span>
          </div>
        )}

        <div className="flex items-center justify-between pt-0.5">
          <CtrlButton active={showLyrics} onClick={() => setShowLyrics((v) => !v)}>
            <MessageSquareQuote size={12.5} />
          </CtrlButton>

          <div className="flex items-center gap-1.5">
            <CtrlButton onClick={() => api.media.command('prev')} disabled={media.canPrev === false}>
              <SkipBack size={13.5} fill="currentColor" />
            </CtrlButton>
            <CtrlButton big onClick={() => api.media.command('toggle')}>
              {playing ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" className="ml-0.5" />}
            </CtrlButton>
            <CtrlButton onClick={() => api.media.command('next')} disabled={media.canNext === false}>
              <SkipForward size={13.5} fill="currentColor" />
            </CtrlButton>
          </div>

          <button
            type="button"
            onClick={() => api.sysinfo.toggleMute()}
            className="grid h-6 w-6 place-items-center rounded-full text-white/70 hover:bg-white/10 hover:text-white"
            title={muted ? 'Unmute' : `Volume ${effectiveVol}%`}
          >
            <VolIcon size={12.5} />
          </button>
        </div>
      </div>

      {/* Right: Synced Lyrics in Album's Adaptive Colors */}
      {showLyrics && (
        <div
          className="relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl px-3.5 py-2 ring-1 ring-white/[0.06]"
          style={{
            background:
              'linear-gradient(135deg, rgba(var(--island-accent-rgb), 0.18) 0%, rgba(255, 255, 255, 0.04) 100%)',
          }}
        >
          <div className="no-scrollbar relative flex-1 overflow-y-auto py-2">
            {lyrics.status === 'loading' && (
              <div className="flex h-full items-center justify-center text-[11.5px] text-white/45 animate-pulse">
                Memuat lirik lagu…
              </div>
            )}

            {(lyrics.status === 'not-found' || lyrics.status === 'error') && (
              <div className="flex h-full flex-col items-center justify-center gap-0.5 text-center text-[11.5px] text-white/40">
                <span>Lirik belum tersedia</span>
                <span className="text-[10px] text-white/25">{media.title}</span>
              </div>
            )}

            {lyrics.status === 'ok' && lyrics.lines.length > 0 && (
              <div className="flex flex-col gap-2 py-4">
                {lyrics.lines.map((line, i) => {
                  const active = i === lyrics.activeIndex;
                  const past = i < lyrics.activeIndex;
                  return (
                    <p
                      key={`${i}-${line.time}`}
                      ref={active ? activeLineRef : null}
                      style={
                        active
                          ? { color: '#ffffff' }
                          : {
                              color: past
                                ? 'rgba(var(--island-accent-rgb), 0.45)'
                                : 'rgba(var(--island-accent-rgb), 0.72)',
                            }
                      }
                      className={`origin-left transition-all duration-300 ${
                        active
                          ? 'text-[13.5px] font-bold leading-snug'
                          : 'text-[12px] font-semibold leading-snug opacity-80'
                      }`}
                    >
                      {line.text}
                    </p>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
