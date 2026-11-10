import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  FolderOpen, X, Upload, File as FileIcon, Folder, ClipboardList, Check, Plus,
} from 'lucide-react';

const api = window.island;
const NOTE_STORAGE_KEY = 'di_scratchpad_cards_v1';

const formatSize = (b) => {
  if (!b) return 'Folder';
  const u = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(b) / Math.log(1024)), u.length - 1);
  return `${(b / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}`;
};

export default function StashTab({
  items, actions, clipboardItems = [], clipboardActions, dragOver, onDragOut, onInputFocus,
}) {
  // 'files' (folder icon) | 'clips' (clipboard icon)
  const [mode, setMode] = useState(() => (items.length > 0 ? 'files' : 'clips'));
  const prevCountRef = useRef(items.length);
  const [copiedId, setCopiedId] = useState(null);
  const [addingNote, setAddingNote] = useState(false);
  const [noteInput, setNoteInput] = useState('');
  const [pinnedNotes, setPinnedNotes] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(NOTE_STORAGE_KEY) || '[]');
    } catch {
      return [];
    }
  });

  // Automatically switch to 'files' view whenever a new file is dropped/added into Shelf
  useEffect(() => {
    if (items.length > prevCountRef.current) {
      setMode('files');
    }
    prevCountRef.current = items.length;
  }, [items.length]);

  const savePinnedNotes = (next) => {
    setPinnedNotes(next);
    try {
      localStorage.setItem(NOTE_STORAGE_KEY, JSON.stringify(next));
    } catch { /* ignore */ }
  };

  const addQuickCard = (e) => {
    e.preventDefault();
    const t = noteInput.trim();
    if (!t) return;
    const next = [
      { id: `note-${Date.now()}`, text: t, time: 'Just now', isNote: true },
      ...pinnedNotes,
    ].slice(0, 8);
    savePinnedNotes(next);
    setNoteInput('');
    setAddingNote(false);
  };

  const removeNoteCard = (id) => {
    savePinnedNotes(pinnedNotes.filter((n) => n.id !== id));
  };

  const triggerCopied = (id, text) => {
    clipboardActions?.copy(text);
    setCopiedId(id);
    setTimeout(() => {
      setCopiedId((cur) => (cur === id ? null : cur));
    }, 1300);
  };

  const combinedClips = [...pinnedNotes, ...clipboardItems].slice(0, 8);
  const activeMode = dragOver ? 'files' : mode;

  return (
    <div className="flex h-full flex-col justify-between gap-1.5 px-1">
      {/* Top Action Bar with [ Folder | Clipboard ] Pill Switch */}
      <div className="flex items-center justify-between px-0.5">
        <div className="flex items-center gap-2 text-[11px] text-white/45">
          {activeMode === 'clips' ? (
            <>
              <span>{combinedClips.length} items · click to copy</span>
              <button
                type="button"
                onClick={() => setAddingNote((v) => !v)}
                className="flex items-center gap-0.5 rounded-full bg-white/[0.08] px-2 py-0.5 text-[10px] font-semibold text-white/80 hover:bg-white/15"
              >
                <Plus size={10} /> Note
              </button>
              {clipboardItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => clipboardActions?.clear()}
                  className="text-[10px] text-rose-400/80 hover:text-rose-300"
                >
                  Clear
                </button>
              )}
            </>
          ) : (
            <>
              <span>{items.length} files · drag in/out or double-click</span>
              <button
                type="button"
                onClick={() => api.stash.openDir()}
                className="flex items-center gap-1 rounded-full bg-white/[0.08] px-2 py-0.5 text-[10px] font-semibold text-white/80 hover:bg-white/15"
              >
                <FolderOpen size={10} /> Open
              </button>
              {items.length > 0 && (
                <button
                  type="button"
                  onClick={() => actions.clear()}
                  className="rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-semibold text-rose-300 hover:bg-rose-500/30"
                >
                  Clear all
                </button>
              )}
            </>
          )}
        </div>

        {/* Top-Right Toggle: [ Folder | Clipboard ] */}
        <div className="flex items-center rounded-full bg-white/[0.07] p-0.5 ring-1 ring-white/[0.08]">
          <button
            type="button"
            onClick={() => setMode('files')}
            onDragEnter={() => setMode('files')}
            title="File Shelf (Drag & Drop Files)"
            className={`flex h-5 w-7 items-center justify-center rounded-full transition-all ${
              activeMode === 'files'
                ? 'bg-indigo-500 text-white shadow-[0_0_10px_rgba(99,102,241,0.7)]'
                : 'text-white/50 hover:text-white'
            }`}
          >
            <Folder size={11.5} />
          </button>
          <button
            type="button"
            onClick={() => setMode('clips')}
            title="Clipboard & Quick Notes Cards"
            className={`flex h-5 w-7 items-center justify-center rounded-full transition-all ${
              activeMode === 'clips'
                ? 'bg-indigo-500 text-white shadow-[0_0_10px_rgba(99,102,241,0.7)]'
                : 'text-white/50 hover:text-white'
            }`}
          >
            <ClipboardList size={11.5} />
          </button>
        </div>
      </div>

      {/* Optional inline quick-note input */}
      {addingNote && activeMode === 'clips' && (
        <form onSubmit={addQuickCard} className="flex items-center gap-1.5 px-0.5">
          <input
            type="text"
            value={noteInput}
            onChange={(e) => setNoteInput(e.target.value)}
            onFocus={() => { onInputFocus?.(true); api.focus(); }}
            onBlur={() => onInputFocus?.(false)}
            placeholder="Ketik catatan singkat lalu Enter…"
            autoFocus
            className="flex-1 rounded-xl border border-indigo-400/60 bg-white/[0.08] px-2.5 py-1 text-[11.5px] text-white outline-none placeholder:text-white/35"
          />
          <button
            type="submit"
            className="rounded-xl bg-indigo-500 px-2.5 py-1 text-[11px] font-semibold text-white"
          >
            Simpan
          </button>
        </form>
      )}

      {/* Main 4-Card Shelf Grid — padded (p-1) + solid border so outline NEVER gets clipped! */}
      <div className="relative min-h-0 flex-1">
        {activeMode === 'clips' ? (
          combinedClips.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-1 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-center text-[11.5px] text-white/40">
              <span>Belum ada item clipboard atau catatan.</span>
              <span className="text-[10px] text-white/30">Setiap teks yang kamu Ctrl+C atau klik &ldquo;+ Note&rdquo; akan muncul sebagai kartu di sini.</span>
            </div>
          ) : (
            <div className="no-scrollbar grid h-full grid-cols-4 gap-2.5 overflow-x-auto p-1">
              {combinedClips.slice(0, 4).map((item, idx) => {
                const isCopied = copiedId === item.id;
                const isFirst = idx === 0;
                return (
                  <motion.div
                    key={item.id}
                    layout
                    onClick={() => triggerCopied(item.id, item.text)}
                    className={`group relative flex cursor-pointer flex-col justify-between rounded-2xl p-3 transition-all ${
                      isFirst
                        ? 'border-[1.5px] border-indigo-400/90 bg-white/[0.08] shadow-[inset_0_0_14px_rgba(99,102,241,0.18)]'
                        : 'border border-white/10 bg-white/[0.05] hover:border-indigo-400/60 hover:bg-white/[0.08]'
                    }`}
                  >
                    <p className="line-clamp-3 break-words text-[12px] font-medium leading-snug text-white/95">
                      {item.text}
                    </p>
                    <div className="flex items-center justify-between pt-1 text-[10px] text-white/40">
                      <span>{isCopied ? 'Copied!' : (item.time || 'Just now')}</span>
                      {isCopied && <Check size={11} className="text-emerald-400" />}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (item.isNote) removeNoteCard(item.id);
                        else clipboardActions?.remove(item.id);
                      }}
                      className="absolute right-1.5 top-1.5 hidden h-4 w-4 place-items-center rounded-full bg-white/15 text-white/75 hover:bg-rose-500 hover:text-white group-hover:grid"
                    >
                      <X size={9.5} />
                    </button>
                  </motion.div>
                );
              })}
            </div>
          )
        ) : items.length === 0 || dragOver ? (
          <div
            className={`flex h-full flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed transition-all ${
              dragOver
                ? 'border-indigo-400 bg-indigo-500/15'
                : 'border-white/15 bg-white/[0.03]'
            }`}
          >
            <Upload size={18} className="text-indigo-300" />
            <span className="text-[12px] font-semibold text-white/85">
              {dragOver ? 'Drop files into Shelf' : 'Drop files here'}
            </span>
            <span className="text-[10px] text-white/40">
              Drag out anytime · double-click to open
            </span>
          </div>
        ) : (
          <div className="no-scrollbar grid h-full grid-cols-4 gap-2.5 overflow-y-auto p-1">
            <AnimatePresence initial={false}>
              {items.map((it, idx) => (
                <motion.div
                  key={it.name}
                  layout
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  draggable
                  onDragStart={(e) => {
                    e.preventDefault();
                    onDragOut(it.name);
                  }}
                  onDoubleClick={() => api.stash.openItem(it.name)}
                  className={`group relative flex cursor-grab flex-col justify-between rounded-2xl p-3 transition active:cursor-grabbing ${
                    idx === 0
                      ? 'border-[1.5px] border-indigo-400/90 bg-white/[0.08] shadow-[inset_0_0_14px_rgba(99,102,241,0.18)]'
                      : 'border border-white/10 bg-white/[0.05] hover:border-indigo-400/60 hover:bg-white/[0.09]'
                  }`}
                >
                  <div className="flex flex-col gap-1.5">
                    {it.icon ? (
                      <img src={it.icon} alt="" className="h-7 w-7 object-contain" />
                    ) : it.isDir ? (
                      <Folder size={24} className="text-amber-300" />
                    ) : (
                      <FileIcon size={24} className="text-indigo-300" />
                    )}
                    <span className="line-clamp-2 break-all text-[11.5px] font-semibold leading-snug text-white">
                      {it.name}
                    </span>
                  </div>
                  <span className="text-[10px] text-white/40">
                    {it.isDir ? 'Folder' : formatSize(it.size)}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); actions.remove(it.name); }}
                    className="absolute right-1.5 top-1.5 hidden h-4 w-4 place-items-center rounded-full bg-rose-500 text-white group-hover:grid"
                  >
                    <X size={9.5} />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
