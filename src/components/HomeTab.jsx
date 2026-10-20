import { useEffect, useRef, useState } from 'react';
import {
  Search, HardDrive, CalendarDays, Mail, Download, FileText, Monitor, Code2, Folder,
  Image, Music, Video, Settings2, ArrowRight, Plus, X, AppWindow, Volume2, Volume1, VolumeX,
} from 'lucide-react';

const api = window.island;

const GOOGLE_APPS = [
  { name: 'Drive', url: 'https://drive.google.com', icon: HardDrive, color: 'from-yellow-400 via-green-500 to-blue-500' },
  { name: 'Calendar', url: 'https://calendar.google.com', icon: CalendarDays, color: 'from-blue-500 to-blue-600' },
  { name: 'Gmail', url: 'https://mail.google.com', icon: Mail, color: 'from-red-500 to-rose-600' },
];

const FOLDER_ICONS = {
  download: Download, file: FileText, monitor: Monitor, code: Code2,
  folder: Folder, image: Image, music: Music, video: Video, app: AppWindow,
};

export default function HomeTab({ config, sysinfo, dragOver, focusToken, onInputFocus }) {
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (focusToken) inputRef.current?.focus();
  }, [focusToken]);

  const submit = (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    api.search(query);
    setQuery('');
    inputRef.current?.blur();
  };

  const folders = config?.folders ?? [];
  const volume = sysinfo?.volume ?? 50;
  const muted = !!sysinfo?.muted;
  const effectiveVol = muted ? 0 : volume;
  const VolIcon = muted || volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2;

  const onVolumeWheel = (e) => {
    const step = e.deltaY < 0 ? 4 : -4;
    api.sysinfo.setVolume(Math.max(0, Math.min(100, volume + step)));
  };

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Google search */}
      <form onSubmit={submit} className="group flex items-center gap-2 rounded-2xl bg-white/[0.08] px-3 py-2.5 ring-1 ring-white/5 focus-within:ring-white/25">
        <Search size={16} className="text-white/50" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => { onInputFocus(true); api.focus(); }}
          onBlur={() => onInputFocus(false)}
          placeholder="Cari di Google…"
          spellCheck={false}
          className="flex-1 bg-transparent text-[14px] text-white outline-none placeholder:text-white/35"
        />
        {query && (
          <button type="submit" className="grid h-6 w-6 place-items-center rounded-full bg-white text-black">
            <ArrowRight size={14} />
          </button>
        )}
      </form>

      <div className="flex min-h-0 flex-1 gap-3">
        {/* Left: Google apps + Quick Volume Slider */}
        <div className="flex flex-col justify-between">
          <div className="flex flex-col gap-1.5">
            <span className="px-1 text-[10px] font-semibold uppercase tracking-wider text-white/40">Google</span>
            <div className="flex gap-2">
              {GOOGLE_APPS.map(({ name, url, icon: Icon, color }) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => api.openUrl(url)}
                  className="flex w-[58px] flex-col items-center gap-1.5 rounded-2xl py-1.5 transition hover:bg-white/[0.08] active:scale-95"
                >
                  <span className={`grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br ${color} shadow-lg`}>
                    <Icon size={19} />
                  </span>
                  <span className="text-[11px] text-white/70">{name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Quick Volume & Mute Card */}
          <div
            onWheel={onVolumeWheel}
            title="Geser atau scroll untuk atur volume • Klik ikon untuk Mute"
            className="flex flex-col gap-1.5 rounded-2xl bg-white/[0.05] px-3 py-2 ring-1 ring-white/[0.06]"
          >
            <div className="flex items-center justify-between text-[10.5px]">
              <span className="font-semibold uppercase tracking-wider text-white/45">Volume</span>
              <span className="font-semibold tabular-nums text-white/80">
                {muted ? 'Mute' : `${volume}%`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => api.sysinfo.toggleMute()}
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg transition-colors ${
                  muted ? 'bg-rose-500/20 text-rose-400' : 'bg-white/[0.08] text-white/80 hover:bg-white/15 hover:text-white'
                }`}
              >
                <VolIcon size={13.5} />
              </button>
              <div className="relative flex flex-1 items-center py-1">
                <div className="pointer-events-none h-1.5 w-full overflow-hidden rounded-full bg-white/15">
                  <div
                    className={`h-full rounded-full transition-[width] duration-75 ${
                      muted ? 'bg-rose-400/60' : 'bg-sky-400'
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
            </div>
          </div>
        </div>

        <div className="w-px bg-white/10" />

        {/* Folder & Application shortcuts (supports Drag & Drop to save permanently) */}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
              Shortcut
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => api.shortcuts.pick()}
                title="Pilih aplikasi (.exe) atau file untuk ditambahkan ke Shortcut"
                className="flex items-center gap-0.5 rounded-full bg-white/[0.08] px-2 py-0.5 text-[10px] font-medium text-white/75 hover:bg-white/15 hover:text-white"
              >
                <Plus size={11} /> Tambah
              </button>
              <button
                type="button"
                onClick={() => api.config.open()}
                title="Edit daftar shortcut (config.json)"
                className="text-white/40 hover:text-white"
              >
                <Settings2 size={12} />
              </button>
            </div>
          </div>

          <div
            className={`relative flex-1 overflow-hidden rounded-2xl transition-colors ${
              dragOver
                ? 'border-2 border-dashed border-emerald-400 bg-emerald-500/10'
                : 'border border-white/[0.05] bg-white/[0.02]'
            }`}
          >
            {dragOver ? (
              <div className="pointer-events-none flex h-full flex-col items-center justify-center gap-1.5 text-emerald-300">
                <Plus size={22} />
                <span className="text-[11.5px] font-medium">Lepaskan untuk simpan Shortcut permanen</span>
              </div>
            ) : (
              <div className="no-scrollbar grid h-full grid-cols-2 content-start gap-1.5 overflow-y-auto p-1.5">
                {folders.map((f) => {
                  const Icon = FOLDER_ICONS[f.icon] ?? Folder;
                  return (
                    <div
                      key={f.name + f.path}
                      onClick={() => api.openFolder(f.path)}
                      title={`${f.name}\n${f.path}`}
                      className="group relative flex cursor-pointer items-center gap-2 rounded-xl bg-white/[0.06] px-2.5 py-2 text-left text-[12px] transition hover:bg-white/[0.13] active:scale-[.97]"
                    >
                      {f.iconData ? (
                        <img src={f.iconData} alt="" className="h-4 w-4 shrink-0 object-contain" />
                      ) : (
                        <Icon size={14} className={`shrink-0 ${f.kind === 'app' ? 'text-sky-300' : 'text-amber-300'}`} />
                      )}
                      <span className="truncate pr-3">{f.name}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          api.shortcuts.remove(f.path);
                        }}
                        title="Hapus shortcut"
                        className="absolute right-1.5 top-1/2 hidden h-4 w-4 -translate-y-1/2 place-items-center rounded-full bg-white/20 text-white/80 hover:bg-rose-500 hover:text-white group-hover:grid"
                      >
                        <X size={10} strokeWidth={2.5} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
