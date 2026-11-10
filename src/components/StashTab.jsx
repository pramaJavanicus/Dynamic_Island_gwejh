import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  FolderOpen, Trash2, X, Upload, File as FileIcon, Folder, StickyNote, ClipboardList, Copy, Check, Plus,
} from 'lucide-react';

const api = window.island;
const NOTE_STORAGE_KEY = 'di_scratchpad_v1';

const formatSize = (b) => {
  if (!b) return 'Folder';
  const u = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(b) / Math.log(1024)), u.length - 1);
  return `${(b / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}`;
};

export default function StashTab({
  items, actions, clipboardItems = [], clipboardActions, dragOver, onDragOut, onInputFocus,
}) {
  const [subTab, setSubTab] = useState('note'); // 'note' | 'clipboard'
  const [note, setNote] = useState(() => {
    try {
      return localStorage.getItem(NOTE_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });
  const [copiedId, setCopiedId] = useState(null);

  useEffect(() => {
    try {
      localStorage.setItem(NOTE_STORAGE_KEY, note);
    } catch { /* ignore */ }
  }, [note]);

  const triggerCopied = (id) => {
    setCopiedId(id);
    setTimeout(() => {
      setCopiedId((cur) => (cur === id ? null : cur));
    }, 1400);
  };

  const copyNote = () => {
    if (!note.trim()) return;
    clipboardActions?.copy(note);
    triggerCopied('note');
  };

  const copyClipItem = (item) => {
    clipboardActions?.copy(item.text);
    triggerCopied(item.id);
  };

  const appendToNote = (text) => {
    setNote((prev) => (prev.trim() ? `${prev}\n${text}` : text));
    setSubTab('note');
  };

  return (
    <div className="flex h-full gap-3">
      {/* Left column: Nusa 1.1 "Drop it on the Shelf" */}
      <div className="flex w-[256px] shrink-0 flex-col gap-2">
        <div className="flex items-center justify-between px-0.5">
          <div className="flex items-center gap-1.5">
            <span className="font-display text-[13px] font-bold text-white">Shelf</span>
            <span className="rounded-full bg-cyan-500/20 px-1.5 font-mono text-[10px] font-bold text-cyan-300 ring-1 ring-cyan-400/30">
              {items.length}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => api.stash.openDir()}
              title="Buka folder Shelf di Explorer"
              className="flex items-center gap-1 rounded-full bg-white/[0.07] px-2 py-0.5 text-[10px] font-semibold text-white/80 hover:bg-white/15"
            >
              <FolderOpen size={11} /> Folder
            </button>
            <button
              type="button"
              onClick={() => actions.clear()}
              disabled={!items.length}
              title="Kosongkan semua file di Shelf (Clear all)"
              className="flex items-center gap-1 rounded-full bg-rose-500/20 px-2.5 py-0.5 text-[10.5px] font-bold text-rose-400 ring-1 ring-rose-500/35 transition hover:bg-rose-500/30 disabled:opacity-30"
            >
              Clear all
            </button>
          </div>
        </div>

        <div
          className={`cyber-card relative flex-1 overflow-hidden rounded-2xl border-2 border-dashed transition-all ${
            dragOver
              ? 'border-cyan-400 bg-cyan-500/15 shadow-[0_0_24px_rgba(0,240,255,0.28)]'
              : 'border-white/15 hover:border-cyan-400/35'
          }`}
        >
          {items.length === 0 || dragOver ? (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 px-4 text-center">
              <motion.div
                animate={dragOver ? { y: [0, -5, 0], scale: 1.08 } : { y: 0, scale: 1 }}
                transition={{ repeat: dragOver ? Infinity : 0, duration: 0.9 }}
                className="mb-1 grid h-9 w-9 place-items-center rounded-xl bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-400/30"
              >
                <Upload size={18} />
              </motion.div>
              <span className="font-display text-[12px] font-bold text-white/90">
                {dragOver ? 'Lepaskan file ke Shelf' : 'Drop files here'}
              </span>
              <span className="text-[10px] text-white/45">
                Drag out anytime · double-click to open
              </span>
            </div>
          ) : (
            <div className="no-scrollbar grid h-full grid-cols-3 content-start gap-1.5 overflow-y-auto p-2">
              <AnimatePresence initial={false}>
                {items.map((it) => (
                  <motion.div
                    key={it.name}
                    layout
                    initial={{ opacity: 0, scale: 0.65 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.65 }}
                    draggable
                    onDragStart={(e) => {
                      e.preventDefault();
                      onDragOut(it.name);
                    }}
                    onDoubleClick={() => api.stash.openItem(it.name)}
                    title={`${it.name}\nTarik keluar • double-click untuk buka`}
                    className="group relative flex cursor-grab flex-col items-center gap-1 rounded-xl bg-white/[0.04] p-1.5 ring-1 ring-white/[0.06] transition hover:bg-cyan-500/10 hover:ring-cyan-400/35 active:cursor-grabbing"
                  >
                    {it.icon ? (
                      <img src={it.icon} alt="" className="h-8 w-8 object-contain drop-shadow" />
                    ) : it.isDir ? (
                      <Folder size={28} className="text-amber-300" />
                    ) : (
                      <FileIcon size={28} className="text-cyan-300" />
                    )}
                    <span className="line-clamp-1 w-full break-all text-center text-[10px] font-semibold leading-tight text-white/90">
                      {it.name}
                    </span>
                    <span className="font-mono text-[8.5px] text-white/45">
                      {it.isDir ? 'Folder' : formatSize(it.size)}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); actions.remove(it.name); }}
                      className="absolute right-1 top-1 hidden h-4 w-4 place-items-center rounded-full bg-rose-500 text-white shadow group-hover:grid"
                    >
                      <X size={10} strokeWidth={3} />
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      {/* Right column: Quick Notes (Scratchpad) & Clipboard History */}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex rounded-full bg-white/[0.05] p-0.5 ring-1 ring-white/[0.08]">
            <button
              type="button"
              onClick={() => setSubTab('note')}
              className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-all ${
                subTab === 'note'
                  ? 'bg-gradient-to-r from-cyan-500/30 to-fuchsia-500/30 text-white ring-1 ring-cyan-400/40'
                  : 'text-white/50 hover:text-white/80'
              }`}
            >
              <StickyNote size={11} />
              Catatan Cepat
            </button>
            <button
              type="button"
              onClick={() => setSubTab('clipboard')}
              className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-all ${
                subTab === 'clipboard'
                  ? 'bg-gradient-to-r from-cyan-500/30 to-fuchsia-500/30 text-white ring-1 ring-cyan-400/40'
                  : 'text-white/50 hover:text-white/80'
              }`}
            >
              <ClipboardList size={11} />
              Clipboard
              {clipboardItems.length > 0 && (
                <span className="rounded-full bg-cyan-500/25 px-1.5 font-mono text-[9.5px] text-cyan-300">
                  {clipboardItems.length}
                </span>
              )}
            </button>
          </div>

          {subTab === 'note' ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={copyNote}
                disabled={!note.trim()}
                className="flex items-center gap-1 rounded-full bg-white/[0.08] px-2 py-0.5 text-[10.5px] text-white/80 hover:bg-white/15 disabled:opacity-30"
              >
                {copiedId === 'note' ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                {copiedId === 'note' ? 'Tersalin' : 'Salin'}
              </button>
              <button
                type="button"
                onClick={() => setNote('')}
                disabled={!note}
                title="Bersihkan catatan"
                className="rounded-full bg-white/[0.06] p-1 text-white/45 hover:bg-rose-500/20 hover:text-rose-300 disabled:opacity-25"
              >
                <Trash2 size={11} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => clipboardActions?.clear()}
              disabled={!clipboardItems.length}
              className="flex items-center gap-1 rounded-full bg-white/[0.06] px-2 py-0.5 text-[10.5px] text-white/55 hover:bg-rose-500/20 hover:text-rose-300 disabled:opacity-30"
            >
              <Trash2 size={10.5} /> Hapus
            </button>
          )}
        </div>

        {subTab === 'note' ? (
          <div className="cyber-card relative flex flex-1 flex-col overflow-hidden rounded-2xl ring-1 ring-white/[0.08] focus-within:ring-cyan-400/40">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onFocus={() => { onInputFocus?.(true); api.focus(); }}
              onBlur={() => onInputFocus?.(false)}
              placeholder="Tulis catatan singkat, link, atau potongan kode di sini… (tersimpan otomatis)"
              spellCheck={false}
              className="no-scrollbar flex-1 resize-none bg-transparent p-2.5 text-[11.5px] leading-relaxed text-white/90 outline-none placeholder:text-white/30"
            />
          </div>
        ) : (
          <div className="cyber-card no-scrollbar flex flex-1 flex-col gap-1.5 overflow-y-auto rounded-2xl p-2 ring-1 ring-white/[0.08]">
            {clipboardItems.length === 0 ? (
              <div className="flex h-full items-center justify-center px-3 text-center text-[11px] text-white/35">
                Belum ada teks yang di-copy. Setiap teks yang kamu Ctrl+C akan muncul di sini otomatis.
              </div>
            ) : (
              clipboardItems.map((item) => {
                const isCopied = copiedId === item.id;
                return (
                  <div
                    key={item.id}
                    onClick={() => copyClipItem(item)}
                    title="Klik untuk menyalin kembali teks ini"
                    className="group flex cursor-pointer items-center justify-between gap-2 rounded-xl bg-white/[0.05] px-2.5 py-1.5 ring-1 ring-white/[0.05] transition hover:bg-cyan-500/10 hover:ring-cyan-400/30"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="line-clamp-2 break-all text-[11px] leading-snug text-white/85">
                        {item.text}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[9.5px] text-white/35">
                        <span>{item.time}</span>
                        {isCopied && (
                          <span className="font-semibold text-cyan-400">• COPIED</span>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          appendToNote(item.text);
                        }}
                        title="Masukkan ke Catatan Cepat"
                        className="rounded-lg bg-white/[0.07] p-1 text-white/55 hover:bg-cyan-500/25 hover:text-cyan-300"
                      >
                        <Plus size={11} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          clipboardActions?.remove(item.id);
                        }}
                        title="Hapus dari riwayat"
                        className="rounded-lg bg-white/[0.07] p-1 text-white/45 hover:bg-rose-500/25 hover:text-rose-300"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
