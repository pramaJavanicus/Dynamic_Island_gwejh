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
          ? 'h-9 w-9 bg-gradient-to-tr from-cyan-400 via-indigo-400 to-fuchsia-400 text-black shadow-[0_0_16px_rgba(0,240,255,0.45)] hover:brightness-110'
          : active
            ? 'h-7 w-7 bg-cyan-400/20 text-cyan-300 ring-1 ring-cyan-400/50'
            : 'h-7 w-7 text-white/85 hover:bg-white/10 hover:text-cyan-300'
      }`}
    >
      {children}
    </motion.button>
  );
}

function VolumeBar({ sysinfo }) {
  const volume = sysinfo?.volume ?? 50;
  const muted = !!sysinfo?.muted;
  const effectiveVol = muted ? 0 : volume;
  const VolIcon = muted || volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2;

  const onWheel = (e) => {
    const step = e.deltaY < 0 ? 4 : -4;
    api.sysinfo.setVolume(Math.max(0, Math.min(100, volume + step)));
  };

  return (
    <div
      onWheel={onWheel}
      className="flex items-center gap-2 rounded-xl bg-white/[0.05] px-2.5 py-1.5 ring-1 ring-cyan-400/15"
      title="Geser atau gunakan scroll mouse untuk atur volume • Klik ikon untuk Mute"
    >
      <button
        type="button"
        onClick={() => api.sysinfo.toggleMute()}
        className={`grid h-5 w-5 shrink-0 place-items-center rounded-md transition-colors ${
          muted ? 'bg-rose-500/20 text-rose-400' : 'text-cyan-300 hover:text-white'
        }`}
      >
        <VolIcon size={13.5} />
      </button>

      <div className="relative flex flex-1 items-center">
        <div className="pointer-events-none h-1.5 w-full overflow-hidden rounded-full bg-white/15">
          <div
            className={`h-full rounded-full transition-[width] duration-75 ${
              muted
                ? 'bg-rose-400/60'
                : 'bg-gradient-to-r from-cyan-400 via-indigo-400 to-fuchsia-400 shadow-[0_0_8px_#00f0ff]'
            }`}
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

      <span className="w-7 text-right font-mono text-[10px] font-bold tabular-nums text-cyan-200">
        {muted ? 'MUTE' : `${volume}%`}
      </span>
    </div>
  );
}

export default function MediaTab({ media, sysinfo }) {
  const position = useMediaPosition(media);
  const lyrics = useLyrics(media, position);
  const [showLyrics, setShowLyrics] = useState(true);
  const activeLineRef = useRef(null);
  const playing = media.status === 'Playing';

  // Auto-scroll active lyric line into the vertical center of the lyrics box
  useEffect(() => {
    if (activeLineRef.current) {
      activeLineRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [lyrics.activeIndex]);

  if (!media.active) {
    return (
      <div className="flex h-full flex-col items-center justify-between py-2 text-center">
        <div className="flex flex-1 flex-col items-center justify-center gap-2.5">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-400/35 shadow-[0_0_20px_rgba(0,240,255,0.2)]">
            <Music2 size={24} />
          </div>
          <div>
            <div className="text-[13.5px] font-semibold">Tidak ada musik yang diputar</div>
            <div className="text-[11.5px] text-white/50">
              Buka Spotify dan putar lagu untuk menampilkan kontrol &amp; lirik sinkron otomatis.
            </div>
          </div>
          <button
            type="button"
            onClick={() => api.media.command('open-spotify')}
            className="rounded-full bg-gradient-to-r from-cyan-400 to-fuchsia-400 px-4 py-1.5 text-[11.5px] font-bold text-black shadow-[0_0_16px_rgba(0,240,255,0.4)] hover:brightness-110"
          >
            Buka Spotify
          </button>
        </div>

        <div className="w-64">
          <VolumeBar sysinfo={sysinfo} />
        </div>
      </div>
    );
  }

  const progress = media.duration ? (position / media.duration) * 100 : 0;

  return (
    <div className="relative flex h-full items-stretch gap-3 overflow-hidden rounded-2xl p-0.5">
      {/* Blurred adaptive album artwork aura */}
      {media.thumb && (
        <img
          src={media.thumb}
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full scale-150 object-cover opacity-25 blur-3xl"
        />
      )}

      {/* Left: Nusa 1.1 x Cyberpunk Track Card + Transport + Volume */}
      <div
        className={`cyber-card relative flex shrink-0 flex-col justify-between rounded-2xl p-3 ring-1 ring-cyan-400/20 transition-all ${
          showLyrics ? 'w-[228px]' : 'w-full'
        }`}
      >
        <div className="flex items-center gap-3">
          <motion.div
            key={media.thumb}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: playing ? 1 : 0.94, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 280, damping: 24 }}
            className="h-13 w-13 shrink-0 overflow-hidden rounded-2xl bg-white/10 ring-1 ring-cyan-400/40 shadow-[0_0_18px_rgba(var(--island-accent-rgb),0.4)]"
          >
            {media.thumb ? (
              <img src={media.thumb} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="grid h-full w-full place-items-center text-cyan-300/40">
                <Music2 size={22} />
              </div>
            )}
          </motion.div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 font-mono text-[9px] font-bold uppercase tracking-widest text-cyan-300">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_#00f0ff]" />
              {media.isSpotify ? 'SPOTIFY // LIVE' : 'AUDIO // STREAM'}
            </div>
            <div className="truncate font-display text-[13.5px] font-bold leading-snug text-white" title={media.title}>
              {media.title || 'Unknown title'}
            </div>
            <div className="truncate text-[11px] text-white/65" title={media.artist}>
              {media.artist || '—'}
            </div>
          </div>
        </div>

        {media.duration > 0 && (
          <div className="flex flex-col gap-1">
            <div className="h-1.5 overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-white to-fuchsia-400 shadow-[0_0_10px_#00f0ff] transition-[width] duration-300 ease-linear"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex justify-between font-mono text-[9.5px] tabular-nums text-white/55">
              <span>{formatTime(position)}</span>
              <span>-{formatTime(media.duration - position)}</span>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between px-1">
          <CtrlButton
            active={showLyrics}
            onClick={() => setShowLyrics((v) => !v)}
          >
            <MessageSquareQuote size={13.5} />
          </CtrlButton>

          <div className="flex items-center gap-2">
            <CtrlButton onClick={() => api.media.command('prev')} disabled={media.canPrev === false}>
              <SkipBack size={15} fill="currentColor" />
            </CtrlButton>
            <CtrlButton big onClick={() => api.media.command('toggle')}>
              {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="ml-0.5" />}
            </CtrlButton>
            <CtrlButton onClick={() => api.media.command('next')} disabled={media.canNext === false}>
              <SkipForward size={15} fill="currentColor" />
            </CtrlButton>
          </div>

          <span className="font-mono text-[9px] uppercase tracking-wider text-cyan-300/60">
            {lyrics.synced ? 'LRC' : 'SYNC'}
          </span>
        </div>

        {/* Volume Slider & Quick Mute */}
        <VolumeBar sysinfo={sysinfo} />
      </div>

      {/* Right: Nusa 1.1 "Lyrics in your album's colors — Synced, line by line" */}
      {showLyrics && (
        <div
          className="cyber-card relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl ring-1 ring-white/[0.08]"
          style={{
            background:
              'linear-gradient(145deg, rgba(var(--island-accent-rgb), 0.16) 0%, rgba(8, 11, 22, 0.88) 78%)',
          }}
        >
          <div className="flex items-center justify-between border-b border-white/[0.07] px-3.5 py-1.5">
            <span className="flex items-center gap-1.5 font-mono text-[9.5px] font-bold uppercase tracking-widest text-cyan-300/80">
              <MessageSquareQuote size={11} className="text-cyan-400" />
              DYNAMIC LYRICS {lyrics.synced ? '// SYNCED' : ''}
            </span>
            <span className="font-mono text-[9.5px] text-white/40">Lirik otomatis tampil di notch saat ditutup</span>
          </div>

          <div className="no-scrollbar relative flex-1 overflow-y-auto px-4 py-5">
            {lyrics.status === 'loading' && (
              <div className="flex h-full items-center justify-center font-mono text-[12px] text-cyan-300/60 animate-pulse">
                MEMUAT LIRIK SINKRON…
              </div>
            )}

            {(lyrics.status === 'not-found' || lyrics.status === 'error') && (
              <div className="flex h-full flex-col items-center justify-center gap-1 text-center text-[12px] text-white/45">
                <span>Lirik belum tersedia untuk lagu ini</span>
                <span className="text-[10px] text-white/30">{media.title} — {media.artist}</span>
              </div>
            )}

            {lyrics.status === 'ok' && lyrics.lines.length > 0 && (
              <div className="flex flex-col gap-2.5 py-6">
                {lyrics.lines.map((line, i) => {
                  const active = i === lyrics.activeIndex;
                  const past = i < lyrics.activeIndex;
                  return (
                    <p
                      key={`${i}-${line.time}`}
                      ref={active ? activeLineRef : null}
                      style={
                        active
                          ? {
                              color: '#ffffff',
                              textShadow: '0 0 16px rgba(var(--island-accent-rgb), 0.9), 0 0 6px rgba(0, 240, 255, 0.6)',
                            }
                          : {
                              color: past
                                ? 'rgba(var(--island-accent-rgb), 0.42)'
                                : 'rgba(var(--island-accent-rgb), 0.72)',
                            }
                      }
                      className={`origin-left transition-all duration-300 ${
                        active
                          ? 'scale-[1.03] font-display text-[14.5px] font-bold leading-snug'
                          : 'text-[12.5px] font-semibold leading-snug opacity-80'
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
