import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Pause, Play, SkipBack, SkipForward, Music2, Mic2, Volume2, Volume1, VolumeX,
} from 'lucide-react';
import { formatTime, useLyrics, useMediaPosition } from '../hooks.js';

const api = window.island;

function CtrlButton({ onClick, disabled, children, big }) {
  return (
    <motion.button
      whileTap={{ scale: 0.86 }}
      onClick={onClick}
      disabled={disabled}
      className={`grid place-items-center rounded-full transition-colors disabled:opacity-30 ${
        big ? 'h-9 w-9 bg-white text-black hover:bg-white/90 shadow-md' : 'h-7 w-7 text-white/85 hover:bg-white/10'
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
      className="flex items-center gap-2 rounded-xl bg-white/[0.06] px-2.5 py-1.5 ring-1 ring-white/[0.06]"
      title="Geser atau gunakan scroll mouse untuk atur volume • Klik ikon untuk Mute"
    >
      <button
        type="button"
        onClick={() => api.sysinfo.toggleMute()}
        className={`grid h-5 w-5 shrink-0 place-items-center rounded-md transition-colors ${
          muted ? 'bg-rose-500/20 text-rose-400' : 'text-white/75 hover:text-white'
        }`}
      >
        <VolIcon size={13.5} />
      </button>

      <div className="relative flex flex-1 items-center">
        <div className="pointer-events-none h-1.5 w-full overflow-hidden rounded-full bg-white/15">
          <div
            className={`h-full rounded-full transition-[width] duration-75 ${
              muted ? 'bg-rose-400/60' : 'bg-emerald-400'
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

      <span className="w-7 text-right text-[10.5px] font-semibold tabular-nums text-white/70">
        {muted ? 'Mute' : `${volume}%`}
      </span>
    </div>
  );
}

export default function MediaTab({ media, sysinfo }) {
  const position = useMediaPosition(media);
  const lyrics = useLyrics(media, position);
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
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#1DB954]/15 text-[#1DB954]">
            <Music2 size={24} />
          </div>
          <div>
            <div className="text-[13.5px] font-semibold">Tidak ada musik yang diputar</div>
            <div className="text-[11.5px] text-white/50">
              Buka Spotify dan putar lagu untuk menampilkan kontrol & lirik otomatis.
            </div>
          </div>
          <button
            type="button"
            onClick={() => api.media.command('open-spotify')}
            className="rounded-full bg-[#1DB954] px-4 py-1.5 text-[11.5px] font-semibold text-black hover:brightness-110"
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
      {/* blurred artwork backdrop */}
      {media.thumb && (
        <img
          src={media.thumb}
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full scale-150 object-cover opacity-20 blur-3xl"
        />
      )}

      {/* Left: Track Info + Progress + Controls + Volume Slider */}
      <div className="relative flex w-[196px] shrink-0 flex-col justify-between rounded-2xl bg-white/[0.04] p-2.5 ring-1 ring-white/[0.06]">
        <div className="flex items-center gap-2.5">
          <motion.div
            key={media.thumb}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: playing ? 1 : 0.94, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 280, damping: 24 }}
            className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-white/10 shadow-lg"
          >
            {media.thumb ? (
              <img src={media.thumb} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="grid h-full w-full place-items-center text-white/30">
                <Music2 size={22} />
              </div>
            )}
          </motion.div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-[#1DB954]" />
              {media.isSpotify ? 'Spotify' : 'Playing'}
            </div>
            <div className="truncate font-display text-[12.5px] font-semibold leading-snug" title={media.title}>
              {media.title || 'Unknown title'}
            </div>
            <div className="truncate text-[10.5px] text-white/60" title={media.artist}>
              {media.artist || '—'}
            </div>
          </div>
        </div>

        {media.duration > 0 && (
          <div className="flex flex-col gap-0.5">
            <div className="h-1 overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full rounded-full bg-white transition-[width] duration-300 ease-linear"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex justify-between text-[9px] tabular-nums text-white/45">
              <span>{formatTime(position)}</span>
              <span>-{formatTime(media.duration - position)}</span>
            </div>
          </div>
        )}

        <div className="flex items-center justify-center gap-2">
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

        {/* Volume Slider & Quick Mute */}
        <VolumeBar sysinfo={sysinfo} />
      </div>

      {/* Right: Live Synced Lyrics Viewer */}
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl bg-white/[0.04] ring-1 ring-white/[0.06]">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-1.5">
          <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/45">
            <Mic2 size={11} className="text-emerald-400" />
            Lirik Lagu {lyrics.synced ? '• Synced' : ''}
          </span>
          <span className="text-[10px] text-white/35">Pin 📌 agar tetap tampil</span>
        </div>

        <div className="no-scrollbar relative flex-1 overflow-y-auto px-3.5 py-6">
          {lyrics.status === 'loading' && (
            <div className="flex h-full items-center justify-center text-[12px] text-white/45 animate-pulse">
              Memuat lirik lagu…
            </div>
          )}

          {(lyrics.status === 'not-found' || lyrics.status === 'error') && (
            <div className="flex h-full flex-col items-center justify-center gap-1 text-center text-[12px] text-white/40">
              <span>Lirik belum tersedia untuk lagu ini</span>
              <span className="text-[10px] text-white/25">{media.title} — {media.artist}</span>
            </div>
          )}

          {lyrics.status === 'ok' && lyrics.lines.length > 0 && (
            <div className="flex flex-col gap-2.5 py-8">
              {lyrics.lines.map((line, i) => {
                const active = i === lyrics.activeIndex;
                const past = i < lyrics.activeIndex;
                return (
                  <p
                    key={`${i}-${line.time}`}
                    ref={active ? activeLineRef : null}
                    className={`origin-left transition-all duration-300 ${
                      active
                        ? 'scale-[1.02] text-[13.5px] font-semibold leading-snug text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.25)]'
                        : past
                          ? 'text-[12px] font-medium leading-snug text-white/30'
                          : 'text-[12px] font-medium leading-snug text-white/45'
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
    </div>
  );
}
