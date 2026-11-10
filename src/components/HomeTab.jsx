import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, HardDrive, CalendarDays, Mail, Calculator, Download, FileText, Monitor, Code2, Folder,
  Image, Music, Video, Settings2, ArrowRight, Plus, X, AppWindow, Check, CheckSquare, Square, Activity,
} from 'lucide-react';
import { AppleStatusRings } from './CyberMascot.jsx';

const api = window.island;
const REMINDER_STORAGE_KEY = 'di_calendar_reminders_v1';

const DEFAULT_ROWS = [
  { name: 'Gmail', sub: 'Kotak masuk email', action: () => api.openUrl('https://mail.google.com'), icon: Mail, bg: 'bg-blue-500' },
  { name: 'Calendar', sub: 'Google Calendar web', action: () => api.openUrl('https://calendar.google.com'), icon: CalendarDays, bg: 'bg-amber-500' },
  { name: 'Google Drive', sub: 'Penyimpanan cloud', action: () => api.openUrl('https://drive.google.com'), icon: HardDrive, bg: 'bg-emerald-500' },
  { name: 'Kalkulator', sub: 'Aplikasi kalkulator', action: () => api.openCalc(), icon: Calculator, bg: 'bg-indigo-500' },
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

function toDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getCurrentWeekDays() {
  const now = new Date();
  const todayKey = toDateKey(now);
  const day = now.getDay(); // 0 = Sun, 1 = Mon ...
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  const labels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  return labels.map((lbl, idx) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + idx);
    const dateKey = toDateKey(d);
    return {
      key: dateKey,
      label: lbl,
      dateNum: d.getDate(),
      shortLabel: d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' }),
      isToday: dateKey === todayKey,
    };
  });
}

export default function HomeTab({ config, sysinfo, dragOver, focusToken, onInputFocus }) {
  const [query, setQuery] = useState('');
  const [copiedCalc, setCopiedCalc] = useState(false);
  const inputRef = useRef(null);

  const weekDays = useMemo(() => getCurrentWeekDays(), []);
  const todayKey = useMemo(() => toDateKey(new Date()), []);

  // Selected date in the calendar strip (null = show System Rings card, string = show Checklist card for that date)
  const [selectedDateKey, setSelectedDateKey] = useState(null);
  const [taskInput, setTaskInput] = useState('');
  const [remindersByDate, setRemindersByDate] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(REMINDER_STORAGE_KEY) || '{}');
    } catch {
      return {};
    }
  });

  const saveReminders = (next) => {
    setRemindersByDate(next);
    try {
      localStorage.setItem(REMINDER_STORAGE_KEY, JSON.stringify(next));
    } catch { /* ignore */ }
  };

  const activeDateKey = selectedDateKey || todayKey;
  const activeDateMeta = weekDays.find((d) => d.key === activeDateKey) || weekDays[0];
  const activeTasks = remindersByDate[activeDateKey] || [];
  const todayTasks = remindersByDate[todayKey] || [];
  const pendingTodayTasks = todayTasks.filter((t) => !t.done);

  const addTask = (e) => {
    e.preventDefault();
    const text = taskInput.trim();
    if (!text) return;
    const list = remindersByDate[activeDateKey] || [];
    const nextItem = {
      id: `task-${Date.now()}`,
      text,
      done: false,
      createdAt: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
    };
    saveReminders({
      ...remindersByDate,
      [activeDateKey]: [nextItem, ...list],
    });
    setTaskInput('');
  };

  const toggleTask = (dateKey, taskId) => {
    const list = remindersByDate[dateKey] || [];
    saveReminders({
      ...remindersByDate,
      [dateKey]: list.map((t) => (t.id === taskId ? { ...t, done: !t.done } : t)),
    });
  };

  const removeTask = (dateKey, taskId) => {
    const list = remindersByDate[dateKey] || [];
    saveReminders({
      ...remindersByDate,
      [dateKey]: list.filter((t) => t.id !== taskId),
    });
  };

  useEffect(() => {
    if (focusToken) inputRef.current?.focus();
  }, [focusToken]);

  const mathResult = useMemo(() => evalMathExpression(query), [query]);

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
    <div className="flex h-full gap-3 px-1">
      {/* Left Column: Search + Today Reminders + User Shortcuts + Default Apps */}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {/* Compact Search / Calculator Bar */}
        <form
          onSubmit={submit}
          className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.06] px-2.5 py-1.5 focus-within:border-white/25"
        >
          <Search size={13} className="shrink-0 text-white/45" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => { onInputFocus(true); api.focus(); }}
            onBlur={() => onInputFocus(false)}
            placeholder="Cari di Google atau hitung angka…"
            spellCheck={false}
            className="flex-1 bg-transparent text-[11.5px] text-white outline-none placeholder:text-white/35"
          />
          {mathResult !== null && (
            <button
              type="submit"
              className="flex items-center gap-1 rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-amber-300"
            >
              {copiedCalc ? <Check size={10.5} className="text-emerald-400" /> : `= ${mathResult.toLocaleString('id-ID')}`}
            </button>
          )}
          {query && (
            <button type="submit" className="grid h-4.5 w-4.5 place-items-center rounded-full bg-white text-black">
              <ArrowRight size={10.5} />
            </button>
          )}
          <button
            type="button"
            onClick={() => api.shortcuts.pick()}
            title="Tambah aplikasi/file ke Shortcut"
            className="text-white/45 transition hover:text-white"
          >
            <Plus size={13} />
          </button>
          <button
            type="button"
            onClick={() => api.config.open()}
            title="Pengaturan (config.json)"
            className="text-white/35 transition hover:text-white"
          >
            <Settings2 size={11.5} />
          </button>
        </form>

        {/* Stacked Today Cards (Drop Zone for Shortcuts + Reminders + Apps) */}
        <div
          className={`no-scrollbar flex flex-1 flex-col gap-1.5 overflow-y-auto rounded-xl transition-all ${
            dragOver
              ? 'border-2 border-dashed border-cyan-400 bg-cyan-500/15 p-2'
              : 'pr-0.5'
          }`}
        >
          {dragOver ? (
            <div className="pointer-events-none flex h-full flex-col items-center justify-center gap-1 text-center text-cyan-300">
              <Plus size={18} />
              <span className="text-[11.5px] font-semibold">Lepaskan file/aplikasi untuk buat Shortcut baru</span>
            </div>
          ) : (
            <>
              {/* Today's active reminders/checklists appear right at the top of Today! */}
              {pendingTodayTasks.slice(0, 2).map((t) => (
                <div
                  key={t.id}
                  onClick={() => toggleTask(todayKey, t.id)}
                  className="group flex w-full cursor-pointer items-center justify-between gap-2.5 rounded-xl border border-indigo-400/35 bg-indigo-500/15 px-2.5 py-1.5 text-left transition hover:bg-indigo-500/25"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-indigo-500 text-white">
                      <CheckSquare size={12.5} />
                    </span>
                    <div className="min-w-0 leading-tight">
                      <div className="truncate text-[11.5px] font-bold text-white">{t.text}</div>
                      <div className="text-[9.5px] text-indigo-200/70">Reminder hari ini • klik selesai</div>
                    </div>
                  </div>
                  <span className="shrink-0 text-[9.5px] text-indigo-300">{t.createdAt}</span>
                </div>
              ))}

              {/* User's custom shortcuts FIRST so newly dropped shortcuts are immediately visible! */}
              {folders.map((f) => {
                const Icon = FOLDER_ICONS[f.icon] ?? Folder;
                return (
                  <div
                    key={f.name + f.path}
                    onClick={() => api.openFolder(f.path)}
                    className="group relative flex w-full cursor-pointer items-center justify-between gap-2.5 rounded-xl bg-white/[0.06] px-2.5 py-1.5 text-left transition hover:bg-white/[0.11]"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="grid h-6.5 w-6.5 shrink-0 place-items-center rounded-lg bg-white/10 text-cyan-300">
                        {f.iconData ? (
                          <img src={f.iconData} alt="" className="h-4 w-4 object-contain" />
                        ) : (
                          <Icon size={13.5} />
                        )}
                      </span>
                      <div className="min-w-0 leading-tight">
                        <div className="truncate text-[11.5px] font-bold text-white">{f.name}</div>
                        <div className="truncate text-[9.5px] text-white/45">{f.path}</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        api.shortcuts.remove(f.path);
                      }}
                      title="Hapus shortcut"
                      className="hidden h-4 w-4 shrink-0 place-items-center rounded-full bg-white/15 text-white/75 hover:bg-rose-500 hover:text-white group-hover:grid"
                    >
                      <X size={9.5} />
                    </button>
                  </div>
                );
              })}

              {/* Default quick web/system apps */}
              {DEFAULT_ROWS.map(({ name, sub, action, icon: Icon, bg }) => (
                <button
                  key={name}
                  type="button"
                  onClick={action}
                  className="group flex w-full items-center justify-between gap-2.5 rounded-xl bg-white/[0.06] px-2.5 py-1.5 text-left transition hover:bg-white/[0.11] active:scale-[0.99]"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className={`grid h-6.5 w-6.5 shrink-0 place-items-center rounded-lg ${bg} text-white shadow-sm`}>
                      <Icon size={13.5} />
                    </span>
                    <div className="min-w-0 leading-tight">
                      <div className="truncate text-[11.5px] font-bold text-white">{name}</div>
                      <div className="truncate text-[9.5px] text-white/50">{sub}</div>
                    </div>
                  </div>
                  <span className="shrink-0 text-[9.5px] text-white/35 group-hover:text-white/65">Open</span>
                </button>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Right Column: Interactive 7-Day Calendar Strip + Reminder/Checklist OR System Rings Card */}
      <div className="flex w-[212px] shrink-0 flex-col justify-between gap-1.5">
        {/* Interactive 7-Day Week Calendar Strip — Click any date to open/add Reminders & Checklist! */}
        <div className="grid grid-cols-7 gap-1 px-0.5 pt-0.5 text-center">
          {weekDays.map((d) => {
            const count = (remindersByDate[d.key] || []).filter((t) => !t.done).length;
            const isSelected = selectedDateKey === d.key;
            return (
              <button
                key={d.key}
                type="button"
                onClick={() => setSelectedDateKey((cur) => (cur === d.key ? null : d.key))}
                title={`${d.shortLabel} • Klik untuk tambah/lihat reminder & checklist`}
                className="group flex flex-col items-center gap-0.5 rounded-lg py-0.5 transition hover:bg-white/[0.06]"
              >
                <span className="text-[9px] font-semibold text-white/45 group-hover:text-white/75">{d.label}</span>
                <span
                  className={`relative grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold tabular-nums transition-all ${
                    isSelected
                      ? 'bg-indigo-500 text-white ring-2 ring-cyan-300 shadow-[0_0_12px_rgba(99,102,241,0.8)]'
                      : d.isToday
                        ? 'bg-blue-500 text-white shadow-[0_0_10px_rgba(59,130,246,0.7)]'
                        : 'text-white/75 group-hover:bg-white/10 group-hover:text-white'
                  }`}
                >
                  {d.dateNum}
                  {count > 0 && (
                    <span className="absolute -bottom-0.5 h-1 w-1 rounded-full bg-emerald-400 shadow-[0_0_4px_#34d399]" />
                  )}
                </span>
              </button>
            );
          })}
        </div>

        {/* Below Calendar: Either Interactive Checklist/Reminder Card (when date clicked) OR System Rings + Tasks Summary */}
        {selectedDateKey ? (
          <div className="flex flex-1 flex-col justify-between gap-1.5 rounded-2xl border border-indigo-400/35 bg-white/[0.06] p-2.5">
            <div className="flex items-center justify-between">
              <span className="truncate text-[10.5px] font-bold text-indigo-200">
                📅 {activeDateMeta.shortLabel}
              </span>
              <button
                type="button"
                onClick={() => setSelectedDateKey(null)}
                title="Kembali ke System Rings"
                className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[9.5px] font-semibold text-white/80 hover:bg-white/20"
              >
                <Activity size={9.5} /> Rings
              </button>
            </div>

            {/* Add Reminder / Checklist Input */}
            <form onSubmit={addTask} className="flex items-center gap-1">
              <input
                type="text"
                value={taskInput}
                onChange={(e) => setTaskInput(e.target.value)}
                onFocus={() => { onInputFocus?.(true); api.focus(); }}
                onBlur={() => onInputFocus?.(false)}
                placeholder="Tambah reminder / jadwal…"
                autoFocus
                className="min-w-0 flex-1 rounded-lg bg-black/40 px-2 py-1 text-[10.5px] text-white outline-none ring-1 ring-white/15 focus:ring-indigo-400"
              />
              <button
                type="submit"
                className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-indigo-500 text-white hover:bg-indigo-400"
              >
                <Plus size={12} />
              </button>
            </form>

            {/* Checklist Items for Selected Date */}
            <div className="no-scrollbar flex max-h-[60px] flex-1 flex-col gap-1 overflow-y-auto">
              {activeTasks.length === 0 ? (
                <div className="flex h-full items-center justify-center text-center text-[9.5px] text-white/40">
                  Belum ada jadwal di tanggal ini.
                </div>
              ) : (
                activeTasks.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => toggleTask(activeDateKey, t.id)}
                    className="group flex cursor-pointer items-center justify-between gap-1.5 rounded-lg bg-white/[0.05] px-2 py-1 text-[10.5px] hover:bg-white/[0.1]"
                  >
                    <div className="flex min-w-0 items-center gap-1.5">
                      {t.done ? (
                        <CheckSquare size={11.5} className="shrink-0 text-emerald-400" />
                      ) : (
                        <Square size={11.5} className="shrink-0 text-white/45" />
                      )}
                      <span className={`truncate ${t.done ? 'line-through text-white/40' : 'text-white/90'}`}>
                        {t.text}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeTask(activeDateKey, t.id);
                      }}
                      className="hidden text-white/40 hover:text-rose-400 group-hover:block"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col justify-between rounded-2xl border border-white/[0.06] bg-white/[0.06] px-3 py-2">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setSelectedDateKey(todayKey)}
                title="Klik untuk buka Checklist & Reminder hari ini"
                className="flex items-center gap-1.5 text-left transition hover:opacity-85"
              >
                <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
                <span className="text-[11px] font-bold text-white">
                  {pendingTodayTasks.length > 0
                    ? `${pendingTodayTasks.length} jadwal hari ini`
                    : 'System Rings'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedDateKey(todayKey)}
                className="rounded-full bg-white/[0.08] px-2 py-0.5 text-[9px] font-semibold text-indigo-300 hover:bg-white/15"
              >
                + Reminder
              </button>
            </div>

            <div className="flex items-center justify-between py-0.5">
              <AppleStatusRings sysinfo={sysinfo} size={28} />
              <div className="text-right text-[9.5px] leading-snug text-white/55">
                <div>{sysinfo?.temp != null ? `${sysinfo.temp}°C • ` : ''}CPU {sysinfo?.cpu ?? 10}%</div>
                <div className="max-w-[78px] truncate">
                  {pendingTodayTasks[0]?.text || sysinfo?.bluetooth?.[0]?.name || 'Klik tgl = jadwal'}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
