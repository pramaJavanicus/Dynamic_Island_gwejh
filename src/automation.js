// ---------------------------------------------------------------------------
// useAutomation -- renderer-side state for Jarvis autonomous automation.
//
// Backend (electron main) pushes three kinds of events through preload:
//   automation:status        -> what Jarvis is currently driving (browser/form/code)
//   automation:form-preview  -> a filled Google Form waiting for user confirmation
//   automation:toast         -> short one-shot notification (e.g. "file updated")
//
// UI components should ONLY consume the object returned by this hook; they do
// not need to talk to window.island.automation directly.
// ---------------------------------------------------------------------------
import { useCallback, useEffect, useRef, useState } from 'react';

const api = typeof window !== 'undefined' ? window.island : undefined;
const TOAST_MS = 4200;

/**
 * @typedef {Object} AutomationStatus
 * @property {'browser'|'form'|'code'} kind
 * @property {string} label    Short text for the capsule, e.g. "Controlling Chrome"
 * @property {string} [detail] Optional secondary text, e.g. tab title / file name
 * @property {'main'|'jarvis'} [backend] Browser backend in use (browser kind only)
 *
 * @typedef {Object} FormField
 * @property {string} id
 * @property {string} label           Question text
 * @property {'text'|'paragraph'|'radio'|'checkbox'|'dropdown'|'scale'|'date'|'time'|'grid'|'unknown'} type
 * @property {boolean} required
 * @property {string[]} [options]
 * @property {string|string[]|null} answer   What Jarvis filled in (null = left empty)
 * @property {'high'|'medium'|'low'} [confidence]
 *
 * @typedef {Object} FormPreview
 * @property {string} sessionId
 * @property {string} title
 * @property {string} url
 * @property {FormField[]} fields
 * @property {number} unansweredRequired  Count of required fields left empty
 *
 * @typedef {Object} AutomationToast
 * @property {number} id
 * @property {'success'|'error'|'info'} tone
 * @property {'browser'|'form'|'code'} kind
 * @property {string} title
 * @property {string} [message]
 */

export function useAutomation() {
  /** @type {[AutomationStatus|null, Function]} */
  const [status, setStatus] = useState(null);
  /** @type {[FormPreview|null, Function]} */
  const [formPreview, setFormPreview] = useState(null);
  /** @type {[AutomationToast|null, Function]} */
  const [toast, setToast] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const toastTimer = useRef(null);

  const dismissToast = useCallback(() => {
    clearTimeout(toastTimer.current);
    setToast(null);
  }, []);

  useEffect(() => {
    const auto = api?.automation;
    if (!auto) return undefined;
    const offs = [
      auto.onStatus((s) => setStatus(s && s.active !== false ? s : null)),
      auto.onFormPreview((p) => setFormPreview(p || null)),
      auto.onToast((t) => {
        if (!t) return;
        clearTimeout(toastTimer.current);
        setToast({ id: Date.now(), tone: 'info', kind: 'code', ...t });
        toastTimer.current = setTimeout(() => setToast(null), t.durationMs || TOAST_MS);
      }),
    ];
    return () => {
      offs.forEach((off) => off?.());
      clearTimeout(toastTimer.current);
    };
  }, []);

  const submitForm = useCallback(async () => {
    if (!formPreview || submitting) return null;
    setSubmitting(true);
    try {
      const res = await api?.automation?.formSubmit(formPreview.sessionId);
      if (res?.ok) setFormPreview(null);
      return res;
    } finally {
      setSubmitting(false);
    }
  }, [formPreview, submitting]);

  const cancelForm = useCallback(async () => {
    if (!formPreview) return;
    const id = formPreview.sessionId;
    setFormPreview(null);
    await api?.automation?.formCancel(id);
  }, [formPreview]);

  return {
    status,
    formPreview,
    toast,
    submitting,
    submitForm,
    cancelForm,
    dismissToast,
  };
}
