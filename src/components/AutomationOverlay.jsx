import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Globe, FileCheck2, Code2, CheckCircle2, AlertTriangle, Info, Send, X, Loader2, Sparkles,
} from 'lucide-react';

const thumbColorCache = new Map();

function extractDominantRgb(src) {
  return new Promise((resolve) => {
    if (!src) {
      resolve(null);
      return;
    }
    if (thumbColorCache.has(src)) {
      resolve(thumbColorCache.get(src));
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const size = 18;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        let rSum = 0;
        let gSum = 0;
        let bSum = 0;
        let weightSum = 0;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const sat = max === 0 ? 0 : (max - min) / max;
          const lum = (r + g + b) / 3;
          // Prefer colorful mid-tone pixels over near-black or near-white
          const w = (sat + 0.18) * (lum > 28 && lum < 235 ? 1.4 : 0.3);
          rSum += r * w;
          gSum += g * w;
          bSum += b * w;
          weightSum += w;
        }
        if (weightSum <= 0) {
          resolve(null);
          return;
        }
        let r = Math.round(rSum / weightSum);
        let g = Math.round(gSum / weightSum);
        let b = Math.round(bSum / weightSum);
        // Gently boost dim colors so the glass glow stays visible
        const max = Math.max(r, g, b, 1);
        if (max < 150) {
          const boost = 150 / max;
          r = Math.min(255, Math.round(r * boost));
          g = Math.min(255, Math.round(g * boost));
          b = Math.min(255, Math.round(b * boost));
        }
        const rgb = `${r}, ${g}, ${b}`;
        thumbColorCache.set(src, rgb);
        resolve(rgb);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * Computes an adaptive RGB accent string ("R, G, B") driven by current activity:
 * Jarvis voice state -> active automation -> album art -> subtle default glass.
 */
export function useAdaptiveAccent({ media, jarvisStatus, automationStatus, formPreview }) {
  const [albumRgb, setAlbumRgb] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (media?.active && media?.thumb) {
      extractDominantRgb(media.thumb).then((rgb) => {
        if (!cancelled) setAlbumRgb(rgb);
      });
    } else {
      setAlbumRgb(null);
    }
    return () => { cancelled = true; };
  }, [media?.active, media?.thumb]);

  if (jarvisStatus === 'listening') return '244, 63, 94'; // rose
  if (jarvisStatus === 'speaking' || jarvisStatus === 'processing') return '34, 211, 238'; // cyan
  if (formPreview || automationStatus?.kind === 'form') return '52, 211, 153'; // emerald
  if (automationStatus?.kind === 'code') return '168, 85, 247'; // violet
  if (automationStatus?.kind === 'browser') return '56, 189, 248'; // sky
  if (media?.active && media?.status === 'Playing' && albumRgb) return albumRgb;
  if (media?.active && media?.status === 'Playing') return '0, 240, 255';
  return '0, 240, 255'; // Cyberpunk x Nusa Electric Cyan default
}

export function AutomationStatusBadge({ status, compact = false }) {
  if (!status || status.active === false) return null;

  const Icon = status.kind === 'form'
    ? FileCheck2
    : status.kind === 'code'
      ? Code2
      : Globe;

  const colorCls = status.kind === 'form'
    ? 'bg-emerald-500/20 text-emerald-200 ring-emerald-400/35'
    : status.kind === 'code'
      ? 'bg-purple-500/20 text-purple-200 ring-purple-400/35'
      : 'bg-sky-500/20 text-sky-200 ring-sky-400/35';

  const dotCls = status.kind === 'form'
    ? 'bg-emerald-400'
    : status.kind === 'code'
      ? 'bg-purple-400'
      : 'bg-sky-400';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold ring-1 ${colorCls}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotCls} animate-ping`} />
      <Icon size={11.5} className="shrink-0" />
      <span className="max-w-[140px] truncate">{status.label}</span>
      {!compact && status.detail && (
        <span className="max-w-[120px] truncate text-[10px] font-normal opacity-75">
          • {status.detail}
        </span>
      )}
    </motion.div>
  );
}

export function AutomationToastView({ toast, onDismiss }) {
  if (!toast) return null;

  const Icon = toast.tone === 'success'
    ? CheckCircle2
    : toast.tone === 'error'
      ? AlertTriangle
      : Info;

  const accentCls = toast.tone === 'success'
    ? 'bg-emerald-500/20 text-emerald-300 ring-emerald-400/40'
    : toast.tone === 'error'
      ? 'bg-rose-500/20 text-rose-300 ring-rose-400/40'
      : 'bg-sky-500/20 text-sky-300 ring-sky-400/40';

  const badgeLabel = toast.kind === 'code'
    ? 'VS Code Assistant'
    : toast.kind === 'form'
      ? 'Google Form Automator'
      : 'Jarvis Browser';

  return (
    <div className="flex h-full w-full items-center justify-between gap-3 px-4">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-1 ${accentCls}`}>
          <Icon size={17} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/60">
            <Sparkles size={10} className="text-cyan-400" />
            {badgeLabel}
          </div>
          <div className="truncate font-display text-[13px] font-bold text-white">
            {toast.title}
          </div>
          {toast.message && (
            <div className="truncate text-[11px] text-white/75">
              {toast.message}
            </div>
          )}
        </div>
      </div>

      {onDismiss && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white/10 text-white/60 hover:bg-white/20 hover:text-white"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}

export function FormPreviewDrawer({ preview, submitting, onSubmit, onCancel }) {
  if (!preview) return null;
  const fields = Array.isArray(preview.fields) ? preview.fields : [];
  const answeredCount = fields.filter(
    (f) => f.answer != null && f.answer !== '' && (!Array.isArray(f.answer) || f.answer.length > 0),
  ).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 6, scale: 0.98 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className="flex h-full flex-col justify-between rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/12"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
            <FileCheck2 size={12} className="text-emerald-400" />
            Konfirmasi Auto-Fill Google Form ({answeredCount}/{fields.length} Terisi)
          </div>
          <div className="truncate font-display text-[13.5px] font-bold text-white">
            {preview.title || 'Google Form'}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {preview.unansweredRequired > 0 && (
            <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-300 ring-1 ring-amber-400/30">
              {preview.unansweredRequired} wajib belum terisi
            </span>
          )}
          <button
            type="button"
            disabled={submitting}
            onClick={() => onCancel?.()}
            className="flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white/80 transition hover:bg-white/20 hover:text-white disabled:opacity-50"
          >
            <X size={12} />
            Batal
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => onSubmit?.()}
            className="flex items-center gap-1.5 rounded-full bg-emerald-400 px-3 py-1 text-[11px] font-bold text-black shadow-[0_0_16px_rgba(52,211,153,0.45)] transition hover:bg-emerald-300 disabled:opacity-60"
          >
            {submitting ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
            {submitting ? 'Mengirim…' : 'Submit Form'}
          </button>
        </div>
      </div>

      {/* Scrollable field list */}
      <div className="no-scrollbar my-2 flex-1 space-y-1.5 overflow-y-auto pr-1">
        {fields.map((f, idx) => {
          const val = Array.isArray(f.answer) ? f.answer.join(', ') : (f.answer ?? '');
          const isEmpty = !val;
          return (
            <div
              key={f.id || idx}
              className={`flex items-start justify-between gap-3 rounded-xl px-2.5 py-1.5 text-[11.5px] ring-1 ${
                isEmpty && f.required
                  ? 'bg-amber-500/10 ring-amber-400/30'
                  : 'bg-white/[0.04] ring-white/[0.07]'
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 font-medium text-white/90">
                  <span className="text-[10px] text-white/40">{idx + 1}.</span>
                  <span className="truncate">{f.label}</span>
                  {f.required && <span className="text-rose-400">*</span>}
                </div>
                <div className={`mt-0.5 truncate text-[11px] ${isEmpty ? 'italic text-amber-300/80' : ' font-semibold text-emerald-300'}`}>
                  {isEmpty ? '— Dikosongkan (cek di browser bila perlu)' : val}
                </div>
              </div>
              <span className="shrink-0 rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[9.5px] uppercase tracking-wider text-white/50">
                {f.type}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between text-[10px] text-white/45">
        <span>Jawaban sudah diisikan di jendela Jarvis Chrome. Klik <b>Submit Form</b> atau ucapkan <i>&quot;Jarvis kirim form&quot;</i>.</span>
      </div>
    </motion.div>
  );
}
