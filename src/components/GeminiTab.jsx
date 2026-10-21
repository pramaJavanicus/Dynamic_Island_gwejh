import { useEffect, useRef, useState } from 'react';
import {
  Sparkles, Send, ExternalLink, AppWindow, Trash2, Copy, Check, Loader2,
} from 'lucide-react';

const api = window.island;
const CHAT_STORAGE_KEY = 'di_gemini_chat_v1';

const QUICK_PROMPTS = [
  'Bantu jelaskan konsep coding singkat',
  'Perbaiki kalimat bahasa Inggris ini:',
  'Buatkan ide fitur menarik untuk aplikasi',
  'Buatkan rumus regex untuk validasi email',
];

export default function GeminiTab({ onInputFocus }) {
  const [messages, setMessages] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(CHAT_STORAGE_KEY) || '[]');
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState(null);
  const listRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages.slice(-16)));
    } catch { /* ignore */ }
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const sendPrompt = async (textToSend) => {
    const prompt = String(textToSend ?? input).trim();
    if (!prompt || loading) return;
    setInput('');
    const nextMsgs = [...messages, { role: 'user', content: prompt }];
    setMessages(nextMsgs);
    setLoading(true);
    try {
      const res = await api.gemini.ask({ messages: nextMsgs });
      if (res?.ok && res.text) {
        setMessages((prev) => [...prev, { role: 'assistant', content: res.text }]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `Maaf, gagal memuat respons: ${res?.error || 'Koneksi terputus.'}` },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Gagal terhubung ke layanan AI. Pastikan internet aktif.' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const onCopy = (text, idx) => {
    api.clipboard?.copy(text);
    setCopiedIdx(idx);
    setTimeout(() => {
      setCopiedIdx((cur) => (cur === idx ? null : cur));
    }, 1300);
  };

  return (
    <div className="flex h-full flex-col gap-2">
      {/* Top action bar: Open personal Google Gemini (Popup Window or Browser) */}
      <div className="flex items-center justify-between px-0.5">
        <div className="flex items-center gap-1.5">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-tr from-blue-500 via-indigo-400 to-purple-400 text-black">
            <Sparkles size={11.5} />
          </span>
          <span className="text-[11.5px] font-semibold text-white/90">Gemini AI</span>
          <span className="text-[10px] text-white/40">• Chat Cepat & Akun Google</span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => api.gemini.openPopup()}
            title="Buka akun Google Gemini kamu di jendela pop-up mengambang"
            className="flex items-center gap-1 rounded-full bg-gradient-to-r from-blue-500/25 to-purple-500/25 px-2.5 py-1 text-[10.5px] font-medium text-indigo-200 ring-1 ring-indigo-400/30 transition hover:from-blue-500/35 hover:to-purple-500/35 hover:text-white"
          >
            <AppWindow size={11} /> Pop-up Gemini
          </button>
          <button
            type="button"
            onClick={() => api.gemini.openWeb()}
            title="Buka gemini.google.com di browser"
            className="flex items-center gap-1 rounded-full bg-white/[0.08] px-2.5 py-1 text-[10.5px] font-medium text-white/80 transition hover:bg-white/15 hover:text-white"
          >
            <ExternalLink size={11} /> Web
          </button>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => setMessages([])}
              title="Bersihkan obrolan"
              className="rounded-full bg-white/[0.06] p-1 text-white/45 hover:bg-rose-500/20 hover:text-rose-300"
            >
              <Trash2 size={11} />
            </button>
          )}
        </div>
      </div>

      {/* Chat messages or quick starters */}
      <div
        ref={listRef}
        className="no-scrollbar flex flex-1 flex-col gap-2 overflow-y-auto rounded-2xl bg-white/[0.03] p-2.5 ring-1 ring-white/[0.06]"
      >
        {messages.length === 0 && !loading ? (
          <div className="flex h-full flex-col justify-between py-1">
            <div className="text-[11px] text-white/55">
              Tanya langsung di bawah, atau klik <b>Pop-up Gemini</b> / <b>Web</b> di kanan atas untuk membuka akun Google Gemini pribadimu.
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {QUICK_PROMPTS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => {
                    setInput(q);
                    inputRef.current?.focus();
                  }}
                  className="truncate rounded-xl bg-white/[0.05] px-2.5 py-1.5 text-left text-[10.5px] text-white/75 ring-1 ring-white/[0.05] transition hover:bg-white/[0.1] hover:text-white"
                >
                  ✨ {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, idx) => {
            const isUser = m.role === 'user';
            return (
              <div
                key={idx}
                className={`flex flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`group relative max-w-[90%] whitespace-pre-wrap break-words rounded-2xl px-3 py-1.5 text-[11.5px] leading-relaxed ${
                    isUser
                      ? 'bg-indigo-500/30 text-white ring-1 ring-indigo-400/30'
                      : 'bg-white/[0.07] text-white/90 ring-1 ring-white/[0.06]'
                  }`}
                >
                  {m.content}
                  {!isUser && (
                    <button
                      type="button"
                      onClick={() => onCopy(m.content, idx)}
                      title="Salin jawaban"
                      className="mt-1 flex items-center gap-1 text-[9.5px] text-white/40 hover:text-white/80"
                    >
                      {copiedIdx === idx ? (
                        <>
                          <Check size={10} className="text-emerald-400" />
                          <span className="text-emerald-400">Tersalin</span>
                        </>
                      ) : (
                        <>
                          <Copy size={10} />
                          <span>Salin</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}

        {loading && (
          <div className="flex items-center gap-1.5 self-start rounded-2xl bg-white/[0.06] px-3 py-1.5 text-[11px] text-indigo-300">
            <Loader2 size={12} className="animate-spin" />
            <span>Gemini sedang berpikir…</span>
          </div>
        )}
      </div>

      {/* Prompt input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendPrompt();
        }}
        className="flex items-center gap-2 rounded-2xl bg-white/[0.08] px-3 py-1.5 ring-1 ring-white/[0.07] focus-within:ring-indigo-400/40"
      >
        <Sparkles size={13.5} className="shrink-0 text-indigo-400" />
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={() => { onInputFocus?.(true); api.focus(); }}
          onBlur={() => onInputFocus?.(false)}
          placeholder="Tanya Gemini di sini lalu tekan Enter…"
          spellCheck={false}
          className="flex-1 bg-transparent text-[12px] text-white outline-none placeholder:text-white/35"
        />
        <button
          type="submit"
          disabled={!input.trim() || loading}
          className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 text-white transition hover:brightness-110 disabled:opacity-30"
        >
          <Send size={11.5} />
        </button>
      </form>
    </div>
  );
}
