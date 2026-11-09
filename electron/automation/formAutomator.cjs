// ---------------------------------------------------------------------------
// FormAutomator -- Autonomous Google Forms parser, LLM reasoner, and natural
// DOM filler with preview-before-submit safeguard.
//
// Relies on semantic ARIA attributes ([role="listitem"], [role="heading"],
// [role="radio"], [role="checkbox"], [role="listbox"], [role="option"],
// [aria-label], [data-value]) rather than obfuscated Closure CSS classes.
// ---------------------------------------------------------------------------
const { EventEmitter } = require('events');

function fuzzyMatchOption(candidate, options = []) {
  if (candidate == null || !Array.isArray(options) || options.length === 0) return null;
  const raw = String(candidate).trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();

  // 1. Exact case-insensitive match
  const exact = options.find((o) => String(o).trim().toLowerCase() === lower);
  if (exact != null) return exact;

  // 2. Prefix or substring match
  const sub = options.find((o) => {
    const ol = String(o).trim().toLowerCase();
    return ol.includes(lower) || lower.includes(ol);
  });
  if (sub != null) return sub;

  // 3. Word-overlap match
  const words = lower.split(/\W+/).filter((w) => w.length >= 2);
  let best = null;
  let bestScore = 0;
  for (const opt of options) {
    const ol = String(opt).toLowerCase();
    const hits = words.filter((w) => ol.includes(w)).length;
    if (hits > bestScore) {
      bestScore = hits;
      best = opt;
    }
  }
  return bestScore > 0 ? best : null;
}

function normalizeFieldAnswer(field, rawAnswer) {
  if (rawAnswer == null) return null;
  const { type, options = [] } = field;

  if (type === 'checkbox') {
    const arr = Array.isArray(rawAnswer)
      ? rawAnswer
      : String(rawAnswer).split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
    if (options.length === 0) return arr;
    const matched = arr.map((item) => fuzzyMatchOption(item, options)).filter(Boolean);
    return [...new Set(matched)];
  }

  if (type === 'radio' || type === 'dropdown' || type === 'scale') {
    const val = Array.isArray(rawAnswer) ? rawAnswer[0] : rawAnswer;
    if (options.length === 0) return String(val ?? '').trim() || null;
    return fuzzyMatchOption(val, options);
  }

  const str = String(Array.isArray(rawAnswer) ? rawAnswer.join(', ') : rawAnswer).trim();
  return str || null;
}

class FormAutomator extends EventEmitter {
  /**
   * @param {{ browser: import('./browserController.cjs').BrowserController, llm: import('./llm.cjs') }} deps
   */
  constructor({ browser, llm }) {
    super();
    this.browser = browser;
    this.llm = llm;
    /** @type {Map<string, { sessionId: string, page: import('puppeteer-core').Page, title: string, url: string, fields: any[] }>} */
    this.sessions = new Map();
  }

  _emitProgress(sessionId, stage, message) {
    this.emit('progress', { sessionId, stage, message });
  }

  /**
   * Extract all visible form questions on the current page and tag each
   * container with `data-jarvis-field-id` for reliable filling.
   */
  async _extractPageFields(page, pageIndex = 0) {
    return page.evaluate((pIdx) => {
      const cleanText = (el) => String(el?.innerText || el?.textContent || '').replace(/\s+/g, ' ').trim();

      const formTitleEl = document.querySelector('[role="heading"][aria-level="1"], .F9yp7e, form h1, h1');
      const formTitle = cleanText(formTitleEl) || document.title || 'Google Form';

      // Candidate question containers: Google Forms uses [role="listitem"] inside [role="list"]
      let containers = Array.from(document.querySelectorAll('form [role="listitem"], [role="list"] > [role="listitem"]'));
      if (containers.length === 0) {
        containers = Array.from(document.querySelectorAll('[data-params], .Qr7Oae, .form-question'));
      }

      const fields = [];
      containers.forEach((box, idx) => {
        if (!box || box.offsetParent === null) return; // skip hidden items

        const headingEl = box.querySelector('[role="heading"], .M7eMe, label, legend');
        let rawLabel = cleanText(headingEl);
        if (!rawLabel) {
          const firstLine = cleanText(box).split('\n')[0] || '';
          rawLabel = firstLine.slice(0, 140);
        }
        if (!rawLabel) return;

        const required = /\*\s*$/.test(rawLabel)
          || !!box.querySelector('[aria-required="true"], [required], [aria-label*="Required"], [aria-label*="Wajib"]');
        const label = rawLabel.replace(/\s*\*\s*$/, '').trim();
        if (!label) return;

        // Detect input type & available options
        const radios = Array.from(box.querySelectorAll('[role="radio"], input[type="radio"]'));
        const checkboxes = Array.from(box.querySelectorAll('[role="checkbox"], input[type="checkbox"]'));
        const listbox = box.querySelector('[role="listbox"], select');
        const dateInput = box.querySelector('input[type="date"]');
        const timeInput = box.querySelector('input[type="time"]');
        const textarea = box.querySelector('textarea');
        const textInput = box.querySelector('input[type="text"], input[type="email"], input[type="number"], input[type="tel"], input[type="url"], input:not([type])');

        let type = 'unknown';
        let options = [];

        const readChoiceOption = (el) => {
          const dv = el.getAttribute('data-value') || el.getAttribute('value');
          if (dv && dv.trim()) return dv.trim();
          const al = el.getAttribute('aria-label');
          if (al && al.trim()) return al.trim();
          const parentLabel = el.closest('label') || el.parentElement?.parentElement;
          return cleanText(parentLabel);
        };

        if (radios.length > 0 && checkboxes.length === 0) {
          options = radios.map(readChoiceOption).filter(Boolean);
          const allNumeric = options.length >= 3 && options.every((o) => /^\d+$/.test(o));
          type = allNumeric ? 'scale' : 'radio';
        } else if (checkboxes.length > 0) {
          options = checkboxes.map(readChoiceOption).filter(Boolean);
          type = 'checkbox';
        } else if (listbox) {
          if (listbox.tagName === 'SELECT') {
            options = Array.from(listbox.querySelectorAll('option'))
              .filter((o) => o.value !== '' && !o.disabled)
              .map((o) => cleanText(o) || o.value)
              .filter(Boolean);
          } else {
            const optEls = Array.from(listbox.querySelectorAll('[role="option"]'));
            options = optEls
              .filter((o) => {
                const dv = o.getAttribute('data-value');
                if (dv === '') return false; // skip "Choose" / "Pilih" placeholder
                const txt = cleanText(o);
                return txt && !/^(choose|pilih)$/i.test(txt);
              })
              .map((o) => o.getAttribute('data-value') || cleanText(o))
              .filter(Boolean);
          }
          type = 'dropdown';
        } else if (dateInput) {
          type = 'date';
        } else if (timeInput) {
          type = 'time';
        } else if (textarea) {
          type = 'paragraph';
        } else if (textInput) {
          type = 'text';
        } else {
          return; // Non-question informational banner/header
        }

        const id = `f_${pIdx}_${idx}`;
        box.setAttribute('data-jarvis-field-id', id);

        fields.push({
          id,
          label,
          type,
          required,
          options: [...new Set(options)],
          answer: null,
          confidence: 'medium',
        });
      });

      return { formTitle, fields };
    }, pageIndex);
  }

  async _reasonAnswers(formTitle, fields, instruction) {
    if (!fields.length) return new Map();

    const system = [
      'You are J.A.R.V.I.S., an intelligent form-filling assistant.',
      'Given a form\'s questions and the user\'s instructions/context, determine the best answer for each question.',
      'Return pure JSON in this exact format:',
      '{"answers":[{"id":"f_0_0","answer":"...","confidence":"high|medium|low"}]}',
      'STRICT RULES:',
      '1. For "radio", "dropdown", or "scale" fields, "answer" MUST exactly match one of the provided "options" strings (or null if you cannot answer).',
      '2. For "checkbox" fields, "answer" MUST be an array of strings chosen from "options".',
      '3. For "date" fields, use "YYYY-MM-DD". For "time" fields, use "HH:MM" (24-hour).',
      '4. If a question asks for specific personal identifiers (like full name, NIM/student ID, email, phone number, address) that are NOT mentioned in the user\'s instruction, set "answer": null and "confidence": "low" unless the user instruction gives a persona or sample data.',
      '5. For general/opinion/feedback/survey questions, craft a helpful, natural answer aligned with the user\'s instruction and language (Indonesian if the form is in Indonesian).',
    ].join('\n');

    const user = JSON.stringify({
      formTitle,
      userInstruction: instruction || 'Fill this form appropriately based on the questions.',
      questions: fields.map((f) => ({
        id: f.id,
        label: f.label,
        type: f.type,
        required: f.required,
        ...(f.options?.length ? { options: f.options } : {}),
      })),
    }, null, 2);

    const parsed = await this.llm.completeJSON({ system, user, temperature: 0.15 });
    const list = Array.isArray(parsed?.answers) ? parsed.answers : (Array.isArray(parsed) ? parsed : []);
    const map = new Map();
    for (const item of list) {
      if (item && item.id) {
        map.set(String(item.id), {
          answer: item.answer,
          confidence: ['high', 'medium', 'low'].includes(item.confidence) ? item.confidence : 'medium',
        });
      }
    }
    return map;
  }

  async _fillPageFields(page, fields) {
    for (const field of fields) {
      if (field.answer == null || field.answer === '' || (Array.isArray(field.answer) && field.answer.length === 0)) {
        continue;
      }

      const selector = `[data-jarvis-field-id="${field.id}"]`;
      try {
        await page.evaluate((sel) => {
          const el = document.querySelector(sel);
          if (el) el.scrollIntoView({ block: 'center', behavior: 'instant' });
        }, selector);

        if (field.type === 'text' || field.type === 'paragraph' || field.type === 'date' || field.type === 'time') {
          const inputSel = field.type === 'paragraph'
            ? `${selector} textarea`
            : `${selector} input`;
          const handle = await page.$(inputSel);
          if (handle) {
            await handle.click({ clickCount: 3 }).catch(() => {});
            await page.keyboard.press('Backspace').catch(() => {});
            const val = String(field.answer);
            if (field.type === 'date' || field.type === 'time') {
              await page.evaluate((el, v) => {
                el.focus();
                el.value = v;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                el.blur();
              }, handle, val);
            } else {
              await handle.type(val, { delay: 8 });
              await page.evaluate((el, v) => {
                if (el.value !== v) {
                  el.value = v;
                  el.dispatchEvent(new Event('input', { bubbles: true }));
                  el.dispatchEvent(new Event('change', { bubbles: true }));
                }
              }, handle, val);
            }
          }
        } else if (field.type === 'radio' || field.type === 'scale') {
          const targetOpt = String(field.answer).trim().toLowerCase();
          await page.evaluate((sel, optLower) => {
            const box = document.querySelector(sel);
            if (!box) return;
            const clean = (el) => String(el?.innerText || el?.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
            const radios = Array.from(box.querySelectorAll('[role="radio"], input[type="radio"]'));
            for (const r of radios) {
              const dv = (r.getAttribute('data-value') || r.getAttribute('value') || '').trim().toLowerCase();
              const al = (r.getAttribute('aria-label') || '').trim().toLowerCase();
              const lbl = clean(r.closest('label') || r.parentElement?.parentElement);
              if (dv === optLower || al === optLower || lbl === optLower || lbl.includes(optLower)) {
                if (r.getAttribute('aria-checked') !== 'true' && !r.checked) {
                  r.click();
                }
                break;
              }
            }
          }, selector, targetOpt);
        } else if (field.type === 'checkbox') {
          const targets = (Array.isArray(field.answer) ? field.answer : [field.answer])
            .map((s) => String(s).trim().toLowerCase());
          await page.evaluate((sel, targetList) => {
            const box = document.querySelector(sel);
            if (!box) return;
            const clean = (el) => String(el?.innerText || el?.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
            const boxes = Array.from(box.querySelectorAll('[role="checkbox"], input[type="checkbox"]'));
            for (const c of boxes) {
              const dv = (c.getAttribute('data-value') || c.getAttribute('value') || '').trim().toLowerCase();
              const al = (c.getAttribute('aria-label') || '').trim().toLowerCase();
              const lbl = clean(c.closest('label') || c.parentElement?.parentElement);
              const shouldCheck = targetList.some((t) => dv === t || al === t || lbl === t || lbl.includes(t));
              const isChecked = c.getAttribute('aria-checked') === 'true' || !!c.checked;
              if (shouldCheck && !isChecked) c.click();
              else if (!shouldCheck && isChecked) c.click();
            }
          }, selector, targets);
        } else if (field.type === 'dropdown') {
          const targetOpt = String(field.answer).trim().toLowerCase();
          const selectEl = await page.$(`${selector} select`);
          if (selectEl) {
            await page.evaluate((el, optLower) => {
              const opts = Array.from(el.options);
              const hit = opts.find((o) => o.text.trim().toLowerCase() === optLower || o.value.trim().toLowerCase() === optLower);
              if (hit) {
                el.value = hit.value;
                el.dispatchEvent(new Event('change', { bubbles: true }));
              }
            }, selectEl, targetOpt);
          } else {
            const listbox = await page.$(`${selector} [role="listbox"]`);
            if (listbox) {
              await listbox.click();
              await new Promise((r) => setTimeout(r, 280));
              await page.evaluate((sel, optLower) => {
                const clean = (el) => String(el?.innerText || el?.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
                // Google Forms renders active dropdown popup options either inside the question or in a floating .exportSelectPopup
                const allOpts = Array.from(document.querySelectorAll(`${sel} [role="option"], [role="listbox"] [role="option"], .OA0qNb [role="option"]`));
                for (const o of allOpts) {
                  if (o.offsetParent === null) continue;
                  const dv = (o.getAttribute('data-value') || '').trim().toLowerCase();
                  const txt = clean(o);
                  if (dv === optLower || txt === optLower) {
                    o.click();
                    return;
                  }
                }
              }, selector, targetOpt);
              await new Promise((r) => setTimeout(r, 200));
            }
          }
        }
      } catch (err) {
        console.warn(`[FormAutomator] Failed filling field ${field.id}:`, err.message);
      }
    }
  }

  async _checkPageNavigation(page) {
    return page.evaluate(() => {
      const clean = (el) => String(el?.innerText || el?.textContent || '').replace(/\s+/g, ' ').trim();
      const buttons = Array.from(document.querySelectorAll('[role="button"], button, input[type="submit"]'));
      let hasSubmit = false;
      let hasNext = false;
      for (const b of buttons) {
        if (b.offsetParent === null) continue;
        const txt = clean(b) || b.value || b.getAttribute('aria-label') || '';
        if (/^(submit|kirim|send|selesai|hantar)$/i.test(txt) || b.getAttribute('jsname') === 'M2UYVd') {
          hasSubmit = true;
        } else if (/^(next|berikutnya|selanjutnya|lanjut)$/i.test(txt) || b.getAttribute('jsname') === 'OCpkoe') {
          hasNext = true;
        }
      }
      return { hasSubmit, hasNext };
    });
  }

  async _clickNextButton(page) {
    return page.evaluate(() => {
      const clean = (el) => String(el?.innerText || el?.textContent || '').replace(/\s+/g, ' ').trim();
      const buttons = Array.from(document.querySelectorAll('[role="button"], button'));
      for (const b of buttons) {
        if (b.offsetParent === null) continue;
        const txt = clean(b) || b.getAttribute('aria-label') || '';
        if (/^(next|berikutnya|selanjutnya|lanjut)$/i.test(txt) || b.getAttribute('jsname') === 'OCpkoe') {
          b.click();
          return true;
        }
      }
      return false;
    });
  }

  /**
   * Open the Google Form, parse all questions, reason with LLM, fill all fields
   * naturally, and stop right before Submit so the user can preview in Dynamic Island.
   */
  async prepare({ url, instruction = '' } = {}) {
    const sessionId = `form-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    if (!url) {
      return { ok: false, error: 'MISSING_URL', reply: 'Please provide the Google Form link you would like me to fill, sir.' };
    }

    this._emitProgress(sessionId, 'opening', 'Opening Google Form in Jarvis Chrome...');
    try {
      const cdp = await this.browser.getCdpBrowser();
      const pages = await cdp.pages();
      let page = pages.find((p) => p.url() === 'about:blank' || p.url().startsWith('chrome://newtab'));
      if (!page) page = await cdp.newPage();

      await page.bringToFront().catch(() => {});
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 }).catch(async () => {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      });
      await new Promise((r) => setTimeout(r, 600));

      const currentUrl = page.url();
      if (/accounts\.google\.com\/(v3\/)?signin|ServiceLogin/i.test(currentUrl)) {
        this._emitProgress(sessionId, 'error', 'Google sign-in required');
        return {
          ok: false,
          error: 'LOGIN_REQUIRED',
          reply: 'This Google Form requires Google sign-in, sir. I have opened the login page in Jarvis Chrome — please sign in once and command me again.',
        };
      }

      const allFields = [];
      let formTitle = 'Google Form';

      for (let pageIdx = 0; pageIdx < 6; pageIdx += 1) {
        this._emitProgress(sessionId, 'parsing', `Scanning form questions (page ${pageIdx + 1})...`);
        const extracted = await this._extractPageFields(page, pageIdx);
        if (pageIdx === 0 && extracted.formTitle) formTitle = extracted.formTitle;

        const pageFields = extracted.fields || [];
        if (pageFields.length > 0) {
          this._emitProgress(sessionId, 'thinking', `Reasoning answers for ${pageFields.length} questions...`);
          let answerMap = new Map();
          try {
            answerMap = await this._reasonAnswers(formTitle, pageFields, instruction);
          } catch (err) {
            console.warn('[FormAutomator] LLM reasoning error:', err.message);
          }

          for (const f of pageFields) {
            const reasoned = answerMap.get(f.id);
            if (reasoned) {
              f.answer = normalizeFieldAnswer(f, reasoned.answer);
              f.confidence = f.answer != null ? reasoned.confidence : 'low';
            }
          }

          this._emitProgress(sessionId, 'filling', `Filling ${pageFields.length} fields on page ${pageIdx + 1}...`);
          await this._fillPageFields(page, pageFields);
          allFields.push(...pageFields);
        }

        const nav = await this._checkPageNavigation(page);
        if (nav.hasSubmit || !nav.hasNext) {
          break;
        }

        const clickedNext = await this._clickNextButton(page);
        if (!clickedNext) break;
        await new Promise((r) => setTimeout(r, 900));
      }

      if (allFields.length === 0) {
        this._emitProgress(sessionId, 'error', 'No form fields detected');
        return {
          ok: false,
          error: 'NO_FIELDS',
          reply: 'I opened the page, sir, but could not detect any fillable form questions on it.',
        };
      }

      const unansweredRequired = allFields.filter(
        (f) => f.required && (f.answer == null || f.answer === '' || (Array.isArray(f.answer) && f.answer.length === 0)),
      ).length;

      const preview = {
        sessionId,
        title: formTitle,
        url: page.url(),
        fields: allFields,
        unansweredRequired,
      };

      this.sessions.set(sessionId, {
        sessionId,
        page,
        title: formTitle,
        url: page.url(),
        fields: allFields,
        createdAt: Date.now(),
      });

      this._emitProgress(sessionId, 'ready', `Form filled (${allFields.length} fields). Ready for your review.`);
      return {
        ok: true,
        preview,
        reply: unansweredRequired > 0
          ? `I have filled ${allFields.length - unansweredRequired} of ${allFields.length} questions in "${formTitle}", sir. ${unansweredRequired} required question needs your review before submitting.`
          : `I have filled all ${allFields.length} questions in "${formTitle}", sir. Please review the preview in Dynamic Island and confirm to submit.`,
      };
    } catch (err) {
      this._emitProgress(sessionId, 'error', err.message || 'Failed to automate form');
      return {
        ok: false,
        error: err.message || 'FORM_ERROR',
        reply: `Apologies, sir. I encountered an error while filling the form: ${err.message}`,
      };
    }
  }

  /**
   * Click the Submit / Kirim button for a prepared form session.
   */
  async submit(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.page) {
      return { ok: false, error: 'SESSION_NOT_FOUND', reply: 'That form session is no longer active, sir.' };
    }
    this._emitProgress(sessionId, 'submitting', 'Submitting form...');
    try {
      const { page } = session;
      await page.bringToFront().catch(() => {});

      const clicked = await page.evaluate(() => {
        const clean = (el) => String(el?.innerText || el?.textContent || '').replace(/\s+/g, ' ').trim();
        const buttons = Array.from(document.querySelectorAll('[role="button"], button, input[type="submit"]'));
        for (const b of buttons) {
          if (b.offsetParent === null) continue;
          const txt = clean(b) || b.value || b.getAttribute('aria-label') || '';
          if (/^(submit|kirim|send|selesai|hantar)$/i.test(txt) || b.getAttribute('jsname') === 'M2UYVd') {
            b.click();
            return true;
          }
        }
        const form = document.querySelector('form');
        if (form) {
          form.submit();
          return true;
        }
        return false;
      });

      if (!clicked) {
        return { ok: false, error: 'SUBMIT_BUTTON_NOT_FOUND', reply: 'I could not locate the Submit button on the form page, sir.' };
      }

      await Promise.race([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 6000 }).catch(() => {}),
        new Promise((r) => setTimeout(r, 2200)),
      ]);

      const confirmation = await page.evaluate(() => {
        const el = document.querySelector('.vHW8K, [role="heading"], main, body');
        return String(el?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 200);
      }).catch(() => 'Form submitted successfully.');

      this.sessions.delete(sessionId);
      this._emitProgress(sessionId, 'done', 'Form submitted successfully!');
      return {
        ok: true,
        confirmation,
        reply: `Done, sir. Your responses for "${session.title}" have been submitted.`,
      };
    } catch (err) {
      this._emitProgress(sessionId, 'error', err.message);
      return { ok: false, error: err.message, reply: `Failed to submit the form, sir: ${err.message}` };
    }
  }

  async cancel(sessionId) {
    this.sessions.delete(sessionId);
    return { ok: true };
  }
}

module.exports = { FormAutomator, fuzzyMatchOption, normalizeFieldAnswer };
