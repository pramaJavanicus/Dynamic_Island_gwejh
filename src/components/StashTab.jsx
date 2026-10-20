import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  FolderOpen, Trash2, X, Upload, File as FileIcon, Folder, StickyNote, ClipboardList, Copy, Check, Plus,
} from 'lucide-react';

const api = window.island;
const NOTE_STORAGE_KEY = 'di_scratchpad_v1';

const formatSize = (b) => {
  if (!b) return '';
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
      {/* Left column: Temporary File Shelf */}
      <div className="flex w-[224px] shrink-0 flex-col gap-2">
        <div className="flex items-center justify-between px-0.5">
          <span className="text-[11px] font-medium text-white/60">
            <b className="text-white">{items.length}</b> File Stash
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => api.stash.openDir()}
              title="Buka folder Stash di Explorer"
              className="flex items-center gap-1 rounded-full bg-white/[0.08] px-2 py-0.5 text-[10.5px] text-white/80 hover:bg-white/15"
            >
              <FolderOpen size={11} /> Buka
            </button>
            <button
              type="button"
              onClick={() => actions.clear()}
              disabled={!items.length}
              title="Kosongkan semua file Stash"
              className="flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[10.5px] text-red-300 hover:bg-red-500/25 disabled:opacity-30"
            >
              <Trash2 size={11} /> Clear
            </button>
          </div>
        </div>

        <div
          className={`relative flex-1 overflow-hidden rounded-2xl border-2 border-dashed transition-colors ${
            dragOver ? 'border-sky-400 bg-sky-500/10' : 'border-white/10 bg-white/[0.03]'
          }`}
        >
          {items.length === 0 || dragOver ? (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-3 text-center text-white/45">
              <motion.div
                animate={dragOver ? { y: [0, -5, 0] } : { y: 0 }}
                transition={{ repeat: dragOver ? Infinity : 0, duration: 0.9 }}
              >
                <Upload size={22} className={dragOver ? 'text-sky-300' : ''} />
              </motion.div>
              <span className="text-[11px] leading-snug">
                {dragOver ? 'Lepaskan file di sini' : 'Tarik file/folder sementara ke sini'}
              </span>
            </div>
          ) : (
            <div className="no-scrollbar grid h-full grid-cols-3 content-start gap-1.5 overflow-y-auto p-2">
              <AnimatePresence initial={false}>
                {items.map((it) => (
                  <motion.div
                    key={it.name}
                    layout
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.6 }}
                    draggable
                    onDragStart={(e) => {
                      e.preventDefault();
                      onDragOut(it.name);
                    }}
                    onDoubleClick={() => api.stash.openItem(it.name)}
                    title={`${it.name}${it.isDir ? '' : ` • ${formatSize(it.size)}`}\nTarik keluar • double-click untuk buka`}
                    className="group relative flex cursor-grab flex-col items-center gap-1 rounded-xl p-1.5 hover:bg-white/[0.08] active:cursor-grabbing"
                  >
                    {it.icon ? (
                      <img src={it.icon} alt="" className="h-8 w-8 object-contain" />
                    ) : it.isDir ? (
                      <Folder size={28} className="text-amber-300" />
                    ) : (
                      <FileIcon size={28} className="text-white/70" />
                    )}
                    <span className="line-clamp-2 w-full break-all text-center text-[9.5px] leading-tight text-white/80">
                      {it.name}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); actions.remove(it.name); }}
                      className="absolute right-0.5 top-0.5 hidden h-4 w-4 place-items-center rounded-full bg-white/90 text-black group-hover:grid"
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
          <div className="flex rounded-full bg-white/[0.06] p-0.5">
            <button
              type="button"
              onClick={() => setSubTab('note')}
              className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-all ${
                subTab === 'note' ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white/80'
              }`}
            >
              <StickyNote size={11} />
              Catatan Cepat
            </button>
            <button
              type="button"
              onClick={() => setSubTab('clipboard')}
              className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-all ${
                subTab === 'clipboard' ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white/80'
              }`}
            >
              <ClipboardList size={11} />
              Clipboard
              {clipboardItems.length > 0 && (
                <span className="rounded-full bg-sky-500/25 px-1.5 text-[9.5px] text-sky-300">
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
          <div className="relative flex flex-1 flex-col overflow-hidden rounded-2xl bg-white/[0.04] ring-1 ring-white/[0.07] focus-within:ring-white/20">
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
          <div className="no-scrollbar flex flex-1 flex-col gap-1.5 overflow-y-auto rounded-2xl bg-white/[0.03] p-2 ring-1 ring-white/[0.06]">
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
                    className="group flex cursor-pointer items-center justify-between gap-2 rounded-xl bg-white/[0.05] px-2.5 py-1.5 transition hover:bg-white/[0.1]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="line-clamp-2 break-all text-[11px] leading-snug text-white/85">
                        {item.text}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[9.5px] text-white/35">
                        <span>{item.time}</span>
                        {isCopied && (
                          <span className="font-semibold text-emerald-400">• Tersalin ke Clipboard!</span>
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
                        className="rounded-lg bg-white/[0.07] p-1 text-white/55 hover:bg-sky-500/25 hover:text-sky-300"
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
