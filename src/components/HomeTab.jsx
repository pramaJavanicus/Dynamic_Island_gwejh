import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, HardDrive, CalendarDays, Mail, Calculator, Download, FileText, Monitor, Code2, Folder,
  Image, Music, Video, Settings2, ArrowRight, Plus, X, AppWindow, Check,
} from 'lucide-react';
import { AppleStatusRings } from './CyberMascot.jsx';

const api = window.island;

const DEFAULT_ROWS = [
  { name: 'Gmail', sub: 'Buka kotak masuk email', action: () => api.openUrl('https://mail.google.com'), icon: Mail, bg: 'bg-blue-500' },
  { name: 'Calendar', sub: 'Jadwal & agenda hari ini', action: () => api.openUrl('https://calendar.google.com'), icon: CalendarDays, bg: 'bg-amber-500' },
  { name: 'Google Drive', sub: 'Penyimpanan cloud & dokumen', action: () => api.openUrl('https://drive.google.com'), icon: HardDrive, bg: 'bg-emerald-500' },
  { name: 'Kalkulator', sub: 'Buka aplikasi kalkulator', action: () => api.openCalc(), icon: Calculator, bg: 'bg-indigo-500' },
];

const FOLDER_ICONS = {
  download: Download, file: FileText, monitor: Monitor, code: Code2,
  folder: Folder, image: Image, music: Music, video: Video, app: AppWindow,
};

function evalMathExpression(raw) {
  const s = String(raw || '').trim().replace(/,/g, '.');
  if (!s || !/[+\-*/%^()]/.test(s) || !/\d/.test(s)) return null;
  if (!/^[0-9+\-*/%.^()\s]+$/.test(s)) return null;
  try {
    const normalized = s.replace(/\^/g, '**');
    // eslint-disable-next-line no-new-func
    const val = Function(`"use strict"; return (${normalized});`)();
    if (typeof val === 'number' && Number.isFinite(val)) {
      if (String(val) === s) return null;
      return Number(val.toFixed(8));
    }
  } catch { /* ignore */ }
  return null;
}

function getCurrentWeekDays() {
  const now = new Date();
  const day = now.getDay(); // 0 = Sun, 1 = Mon ...
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  const labels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  return labels.map((lbl, idx) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + idx);
    return {
      key: idx,
      label: lbl,
      dateNum: d.getDate(),
      isToday: d.toDateString() === now.toDateString(),
    };
  });
}

export default function HomeTab({ config, sysinfo, dragOver, focusToken, onInputFocus }) {
  const [query, setQuery] = useState('');
  const [copiedCalc, setCopiedCalc] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (focusToken) inputRef.current?.focus();
  }, [focusToken]);

  const mathResult = useMemo(() => evalMathExpression(query), [query]);
  const weekDays = useMemo(() => getCurrentWeekDays(), []);

  const submit = (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    if (mathResult !== null) {
      api.clipboard?.copy(String(mathResult));
      setCopiedCalc(true);
      setTimeout(() => setCopiedCalc(false), 1200);
      setQuery(String(mathResult));
      return;
    }
    api.search(query);
    setQuery('');
    inputRef.current?.blur();
  };

  const folders = config?.folders ?? [];

  return (
    <div className="flex h-full gap-3.5">
      {/* Left Column: Search + Stacked Today Cards (Image 1 & Image 3 style) */}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {/* Compact Search / Calculator Bar */}
        <form
          onSubmit={submit}
          className="flex items-center gap-2 rounded-xl bg-white/[0.06] px-2.5 py-1.5 ring-1 ring-white/[0.06] focus-within:ring-white/20"
        >
          <Search size={13.5} className="shrink-0 text-white/45" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => { onInputFocus(true); api.focus(); }}
            onBlur={() => onInputFocus(false)}
            placeholder="Cari di Google atau hitung angka…"
            spellCheck={false}
            className="flex-1 bg-transparent text-[12px] text-white outline-none placeholder:text-white/35"
          />
          {mathResult !== null && (
            <button
              type="submit"
              className="flex items-center gap-1 rounded-full bg-amber-400/20 px-2 py-0.5 text-[10.5px] font-semibold tabular-nums text-amber-300"
            >
              {copiedCalc ? <Check size={11} className="text-emerald-400" /> : `= ${mathResult.toLocaleString('id-ID')}`}
            </button>
          )}
          {query && (
            <button type="submit" className="grid h-5 w-5 place-items-center rounded-full bg-white text-black">
              <ArrowRight size={11} />
            </button>
          )}
          <button
            type="button"
            onClick={() => api.shortcuts.pick()}
            title="Tambah aplikasi/folder ke daftar"
            className="text-white/40 transition hover:text-white"
          >
            <Plus size={13} />
          </button>
          <button
            type="button"
            onClick={() => api.config.open()}
            title="Pengaturan (config.json)"
            className="text-white/35 transition hover:text-white"
          >
            <Settings2 size={12} />
          </button>
        </form>

        {/* Stacked Notification-Style Shortcut Rows (exact Image 1 & 3 aesthetic) */}
        <div
          className={`no-scrollbar flex flex-1 flex-col gap-1.5 overflow-y-auto rounded-xl transition-colors ${
            dragOver ? 'border border-dashed border-cyan-400 bg-cyan-500/10 p-2' : ''
          }`}
        >
          {dragOver ? (
            <div className="pointer-events-none flex h-full items-center justify-center gap-1.5 text-[11.5px] font-medium text-cyan-300">
              <Plus size={16} /> Lepaskan untuk simpan ke Today
            </div>
          ) : (
            <>
              {DEFAULT_ROWS.slice(0, 3).map(({ name, sub, action, icon: Icon, bg }) => (
                <button
                  key={name}
                  type="button"
                  onClick={action}
                  className="group flex w-full items-center justify-between gap-2.5 rounded-xl bg-white/[0.06] px-2.5 py-1.5 text-left transition hover:bg-white/[0.11] active:scale-[0.99]"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${bg} text-white shadow-sm`}>
                      <Icon size={14} />
                    </span>
                    <div className="min-w-0 leading-tight">
                      <div className="truncate text-[12px] font-bold text-white">{name}</div>
                      <div className="truncate text-[10.5px] text-white/50">{sub}</div>
                    </div>
                  </div>
                  <span className="shrink-0 text-[10px] text-white/35 group-hover:text-white/65">Open</span>
                </button>
              ))}

              {folders.map((f) => {
                const Icon = FOLDER_ICONS[f.icon] ?? Folder;
                return (
                  <div
                    key={f.name + f.path}
                    onClick={() => api.openFolder(f.path)}
                    className="group relative flex w-full cursor-pointer items-center justify-between gap-2.5 rounded-xl bg-white/[0.06] px-2.5 py-1.5 text-left transition hover:bg-white/[0.11]"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/10 text-cyan-300">
                        {f.iconData ? (
                          <img src={f.iconData} alt="" className="h-4 w-4 object-contain" />
                        ) : (
                          <Icon size={14} />
                        )}
                      </span>
                      <div className="min-w-0 leading-tight">
                        <div className="truncate text-[12px] font-bold text-white">{f.name}</div>
                        <div className="truncate text-[10px] text-white/45">{f.path}</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        api.shortcuts.remove(f.path);
                      }}
                      title="Hapus shortcut"
                      className="hidden h-4 w-4 place-items-center rounded-full bg-white/15 text-white/75 hover:bg-rose-500 hover:text-white group-hover:grid"
                    >
                      <X size={10} />
                    </button>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>

      {/* Right Column: 7-Day Week Strip + Apple Circular Rings Card (Image 1 & 3 style) */}
      <div className="flex w-[205px] shrink-0 flex-col justify-between gap-2">
        {/* 7-Day Week Calendar Strip (M T W T F S S) */}
        <div className="grid grid-cols-7 gap-1 px-1 pt-0.5 text-center">
          {weekDays.map((d) => (
            <div key={d.key} className="flex flex-col items-center gap-1">
              <span className="text-[9.5px] font-semibold text-white/40">{d.label}</span>
              <span
                className={`grid h-6 w-6 place-items-center rounded-full text-[11.5px] font-bold tabular-nums transition ${
                  d.isToday
                    ? 'bg-blue-500 text-white shadow-[0_0_12px_rgba(59,130,246,0.75)]'
                    : 'text-white/75'
                }`}
              >
                {d.dateNum}
              </span>
            </div>
          ))}
        </div>

        {/* Apple-Style Status Rings Card + CPU Telemetry */}
        <div className="flex flex-col gap-2 rounded-2xl bg-white/[0.06] px-3 py-2.5 ring-1 ring-white/[0.05]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
              <span className="text-[11.5px] font-bold text-white">System Rings</span>
            </div>
            <span className="font-mono text-[10px] text-white/50">
              {sysinfo?.temp != null ? `${sysinfo.temp}°C` : 'Ready'}
            </span>
          </div>

          <div className="flex items-center justify-between pt-0.5">
            <AppleStatusRings sysinfo={sysinfo} size={30} />
            <div className="text-right text-[10px] leading-snug text-white/55">
              <div>CPU {sysinfo?.cpu ?? 10}%</div>
              <div className="truncate max-w-[78px]">
                {sysinfo?.bluetooth?.[0]?.name || 'No BT Audio'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
