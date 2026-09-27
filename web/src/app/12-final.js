// =======================================================
// IN-APP DIALOGS (a promise-based confirm / prompt)
// =======================================================
// window.confirm and window.prompt block the event loop, so the live event
// stream and every chart on the page freeze until the operator answers. Worse,
// a browser is allowed to suppress them outright: once Chrome's "prevent this
// page from creating additional dialogs" box is ticked, confirm() returns false
// and prompt() returns null without asking anyone. A suppressed confirm() turned
// "delete this client" into a silent no-op and a suppressed prompt() into "no IP
// entered" — both indistinguishable from the operator pressing Cancel, on a
// panel whose whole job is destructive administrative actions.
//
// showDialog resolves to true/false for a confirm and to the trimmed string or
// null for a prompt. It never rejects, so a caller still reads as
// `if (!await confirmAction({...})) return;`.
let activeDialog = null;
let dialogSeq = 0;

function showDialog(opts) {
  const o = opts || {};
  const isPrompt = o.kind === 'prompt';
  const cancelValue = isPrompt ? null : false;

  return new Promise((resolve) => {
    // One at a time: a second call while one is open cancels the first rather
    // than stacking two backdrops, two focus traps and two Escape handlers.
    if (activeDialog) activeDialog.finish();

    const returnFocusTo = document.activeElement;
    const seq = ++dialogSeq;
    // Both branches spell every class out in full. A composed name like
    // `border-${accent}-500/40` is invisible to Tailwind's content scanner and
    // would simply be absent from the built stylesheet.
    const tone = o.destructive
      ? {
          icon: 'alert-triangle',
          panel: 'glass-panel p-6 w-full max-w-md border border-red-500/40 shadow-2xl shadow-red-500/10',
          badge: 'w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center text-red-400 border border-red-500/30 shrink-0',
          hint: 'text-xs text-red-400 font-mono',
          submit: 'flex-1 py-3 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-onfill font-bold rounded-lg transition duration-200 shadow-lg shadow-red-500/20 text-sm font-heading',
        }
      : {
          icon: 'help-circle',
          panel: 'glass-panel p-6 w-full max-w-md border border-cyan-500/40 shadow-2xl shadow-cyan-500/10',
          badge: 'w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center text-cyan-400 border border-cyan-500/30 shrink-0',
          hint: 'text-xs text-cyan-400 font-mono',
          submit: 'flex-1 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 text-slate-950 font-bold rounded-lg transition duration-200 shadow-lg shadow-cyan-500/20 text-sm font-heading',
        };
    const backdrop = document.createElement('div');
    backdrop.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md px-4';

    const panel = document.createElement('div');
    panel.className = tone.panel;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', `dialog-title-${seq}`);
    panel.setAttribute('aria-describedby', `dialog-msg-${seq}`);

    const header = document.createElement('div');
    header.className = 'flex items-center gap-3 mb-4';
    const badge = document.createElement('div');
    badge.className = tone.badge;
    badge.setAttribute('aria-hidden', 'true');
    badge.innerHTML = `<i data-feather="${tone.icon}"></i>`;
    const headings = document.createElement('div');
    const title = document.createElement('h2');
    title.id = `dialog-title-${seq}`;
    title.className = 'text-lg font-bold text-white tracking-wide font-heading';
    title.textContent = o.title || 'Confirm';
    headings.appendChild(title);
    if (o.hint) {
      const hint = document.createElement('p');
      hint.className = tone.hint;
      hint.textContent = o.hint;
      headings.appendChild(hint);
    }
    header.appendChild(badge);
    header.appendChild(headings);

    // textContent, not innerHTML: these messages name a client, and a client name
    // is free text that an operator or any API-key holder can set.
    const message = document.createElement('p');
    message.id = `dialog-msg-${seq}`;
    message.className = 'text-xs text-slate-300 leading-relaxed mb-5 whitespace-pre-line';
    message.textContent = o.message || '';

    const form = document.createElement('form');
    form.className = 'space-y-4';
    form.noValidate = true;
    let input = null;
    let errorLine = null;
    if (isPrompt) {
      const field = document.createElement('div');
      const label = document.createElement('label');
      label.className = 'block text-xs font-semibold text-slate-400 mb-1';
      label.setAttribute('for', `dialog-input-${seq}`);
      label.textContent = o.label || 'VALUE';
      input = document.createElement('input');
      input.id = `dialog-input-${seq}`;
      input.type = o.mask ? 'password' : 'text';
      input.className = 'w-full px-4 py-2.5 rounded-lg bg-slate-950/80 border border-slate-700 text-white focus:outline-none focus:border-cyan-400 text-sm font-mono';
      input.value = o.value || '';
      input.autocomplete = 'off';
      input.spellcheck = false;
      if (o.placeholder) input.placeholder = o.placeholder;
      if (o.maxlength) input.maxLength = o.maxlength;
      if (o.inputMode) input.inputMode = o.inputMode;
      errorLine = document.createElement('p');
      errorLine.id = `dialog-error-${seq}`;
      errorLine.className = 'mt-1.5 text-[11px] text-red-400 leading-relaxed hidden';
      // assertive, not polite: this text explains why the button the operator
      // just pressed did nothing, and a polite region waits for a quiet moment
      // that a modal with a single input never provides.
      errorLine.setAttribute('role', 'alert');
      errorLine.setAttribute('aria-live', 'assertive');
      input.setAttribute('aria-describedby', errorLine.id);
      field.appendChild(label);
      field.appendChild(input);
      field.appendChild(errorLine);
      form.appendChild(field);
    }

    const row = document.createElement('div');
    row.className = 'flex gap-3';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-lg transition duration-200 text-sm font-heading';
    cancelBtn.textContent = o.cancelText || 'CANCEL';
    const submitBtn = document.createElement('button');
    submitBtn.type = 'submit';
    submitBtn.className = tone.submit;
    submitBtn.textContent = o.confirmText || (isPrompt ? 'SAVE' : 'CONFIRM');
    row.appendChild(cancelBtn);
    row.appendChild(submitBtn);
    form.appendChild(row);
    panel.appendChild(header);
    panel.appendChild(message);
    panel.appendChild(form);
    backdrop.appendChild(panel);
    document.body.appendChild(backdrop);
    // The backdrop is already on screen at this point and none of the handlers below are wired
    // yet, so an exception here would leave a dialog with no working buttons, no Escape and no
    // resolve — a modal the operator cannot get out of. safeFeatherReplace is the same call with
    // that outcome removed.
    safeFeatherReplace();

    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (activeDialog === handle) activeDialog = null;
      document.removeEventListener('keydown', onKeydown, true);
      backdrop.remove();
      // Hand focus back to whatever opened this, or a keyboard operator is
      // returned to the top of the document with no idea which row they were on.
      if (returnFocusTo && document.contains(returnFocusTo) && typeof returnFocusTo.focus === 'function') {
        try { returnFocusTo.focus(); } catch (e) { /* the element went away */ }
      }
      resolve(result === undefined ? cancelValue : result);
    };
    const handle = { finish };
    activeDialog = handle;

    const onKeydown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        finish();
        return;
      }
      if (e.key !== 'Tab') return;
      // A real trap, not just a wrap: focus that has already escaped the panel
      // (a click on the backdrop, a browser-restored focus) is pulled back in.
      const focusables = panel.querySelectorAll('button:not([disabled]), input:not([disabled]), select, textarea, [href]');
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const inside = panel.contains(document.activeElement);
      if (e.shiftKey && (!inside || document.activeElement === first)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (!inside || document.activeElement === last)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeydown, true);
    cancelBtn.addEventListener('click', () => finish());
    // Only a press that lands on the backdrop itself, never one that bubbled up
    // from inside the panel.
    backdrop.addEventListener('mousedown', (e) => {
      if (e.target === backdrop) finish();
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!isPrompt) {
        finish(true);
        return;
      }
      const value = (input.value || '').trim();
      const problem = typeof o.validate === 'function'
        ? o.validate(value)
        : (value ? '' : 'This field cannot be empty.');
      if (problem) {
        // The dialog stays open with the bad value still in it. A native prompt()
        // could only close and be reopened empty, which is why the old IP entry
        // had no validation at all: there was nowhere to put the complaint.
        errorLine.textContent = problem;
        errorLine.classList.remove('hidden');
        input.setAttribute('aria-invalid', 'true');
        input.focus();
        input.select();
        return;
      }
      finish(value);
    });

    if (isPrompt) {
      input.addEventListener('input', () => {
        errorLine.classList.add('hidden');
        input.removeAttribute('aria-invalid');
      });
    }

    // A destructive dialog opens with Cancel focused, so a stray Enter or Space
    // left over from activating the button cannot confirm it.
    if (input) input.focus();
    else if (o.destructive) cancelBtn.focus();
    else submitBtn.focus();
  });
}

function confirmAction(opts) {
  return showDialog(Object.assign({ kind: 'confirm' }, opts));
}

function promptForValue(opts) {
  return showDialog(Object.assign({ kind: 'prompt' }, opts));
}

function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'glass-panel px-4 py-2.5 rounded-xl border flex items-center gap-2.5 shadow-2xl text-xs font-semibold text-white pointer-events-auto transition-all duration-300 transform translate-y-2 opacity-0';

  // The dot and the label are built as nodes, and the label is set with
  // textContent. This used to be `innerHTML = \`...<span>${msg}</span>\``, and msg
  // is very often not a literal: errorMessage() returns whatever string the
  // response carried, so any handler that echoed part of a request back in its
  // error body could put live markup into the authenticated dashboard.
  const dot = document.createElement('span');
  dot.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span');
  label.textContent = msg === null || msg === undefined ? '' : String(msg);

  if (type === 'success') {
    toast.classList.add('border-emerald-500/50', 'bg-slate-950/90');
    dot.className = 'w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0';
  } else if (type === 'error') {
    toast.classList.add('border-red-500/50', 'bg-slate-950/90');
    dot.className = 'w-2 h-2 rounded-full bg-red-400 shrink-0';
  } else if (type === 'warning') {
    // "It worked, but not the part you were hoping for." The TLS endpoint is the case
    // this exists for: the domain is saved and issuance did not start, which is neither
    // a success nor a failed request.
    toast.classList.add('border-amber-500/50', 'bg-slate-950/90');
    dot.className = 'w-2 h-2 rounded-full bg-amber-400 shrink-0';
  } else {
    toast.classList.add('border-cyan-500/50', 'bg-slate-950/90');
    dot.className = 'w-2 h-2 rounded-full bg-cyan-400 shrink-0';
  }

  toast.appendChild(dot);
  toast.appendChild(label);

  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  });

  // 2.5 s is right for "Saved" and far too short for a reason. The TLS endpoint answers
  // with a whole sentence naming something only the operator can fix — certbot is not
  // installed, port 80 is held — and a message that disappears before it can be read is
  // the same as no message. So the linger follows the length of what is being said.
  const linger = label.textContent.length > 70 ? 9000 : 2500;

  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => {
      if (toast.parentElement) toast.parentElement.removeChild(toast);
    }, 300);
  }, linger);
}


  // =======================================================
  // EDIT CLIENT MODAL EVENT LISTENERS (Advanced Client Controls)
  // =======================================================

  // The selectable policies, fetched from the daemon instead of transcribed here.
  //
  // This used to be a 26-entry object literal copied from matcher.PresetRuleKeys by
  // hand, and a copy of a Go map in a JS literal is something no test and no compiler
  // can check. It had already drifted: four labels here were shorter than the ones the
  // resolver uses, so the panel and the daemon named the same category two ways. The
  // worse direction was silence — a preset added on the Go side was invisible to this
  // picker until somebody remembered to retype it, which is how enable_soundcloud
  // spent a release unselectable.
  //
  // Order comes from the server (see matcher.policyCatalogOrder), because a picker
  // filled from a Go map reshuffles on every open.
  let policyCatalog = [];
  let policyLabels = {};
  let policyCatalogError = '';
  let policyCatalogPromise = null;

  // Fetched once per page load, lazily: an operator who never opens the edit modal
  // never pays for it. The promise itself is the cache, so two callers racing on modal
  // open share one request.
  function loadPolicyCatalog() {
    if (policyCatalogPromise) return policyCatalogPromise;
    policyCatalogPromise = (async () => {
      try {
        const res = await fetch(api('/api/policies'), {
          headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (!res.ok) throw new Error(`http ${res.status}`);
        const data = await res.json();
        const list = Array.isArray(data.catalog) ? data.catalog : [];
        // A daemon too old to send a catalogue is the one case where an empty list is
        // not an error worth blocking on — but it is still an empty picker, so say so
        // rather than leave the operator looking at "No matching policies found".
        if (list.length === 0) throw new Error('empty catalog');
        policyCatalog = list.filter(e => e && typeof e.key === 'string' && e.key !== '');
        policyLabels = {};
        policyCatalog.forEach(e => { policyLabels[e.key] = e.label || e.key; });
        policyCatalogError = '';
      } catch (e) {
        // Deliberately not falling back to a bundled list. A stale copy that disagrees
        // with the resolver is what this change removed; showing nothing and saying why
        // is worse for one session and better every session after it.
        policyCatalog = [];
        policyCatalogError = 'Could not load the policy list from the server.';
        policyCatalogPromise = null; // let the next open retry
      }
      return policyCatalog;
    })();
    return policyCatalogPromise;
  }

  // =======================================================
  // ANT-DESIGN MULTI-SELECT & HIGHLIGHTING FOR POLICIES
  // =======================================================
  // One picker per form. The create and the edit modals both offer policy
  // selection now, and a single module-level selection array they both wrote
  // through meant the chips an operator attached while editing one subscriber
  // would be sitting in the create form the next time it opened — and silently
  // sold to whoever was created next.
  //
  // The catalogue itself stays shared: one fetch, lazily, for both pickers.
  function createPolicyMultiselect(ids) {
    const box = document.getElementById(ids.box);
    const dropdown = document.getElementById(ids.dropdown);
    const search = document.getElementById(ids.search);
    const tags = document.getElementById(ids.tags);
    let selected = [];

    const noop = { get: () => [], set: () => {}, reset: () => {} };
    if (!box || !dropdown) return noop;

    function renderTags() {
      if (!tags) return;
      if (selected.length === 0) {
        tags.innerHTML = '<span class="text-slate-500 text-[11px] italic py-0.5">Inheriting all global policies</span>';
      } else {
        tags.innerHTML = selected.map(p => {
          // Every value here is server-supplied now — the label from the catalogue, the
          // raw key from the client record when the catalogue does not know it (a policy
          // stored by a newer build, or one that has since been removed).
          const label = policyLabels[p] || p;
          return `
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-cyan-950/80 border border-cyan-500/40 text-[10px] font-semibold text-cyan-200">
            <span>${escapeHTML(label)}</span>
            <button type="button" class="remove-policy-tag-btn hover:text-red-400 ms-1 text-slate-400" data-policy="${escapeHTML(p)}"
              title="Remove policy" aria-label="Remove policy"><i data-feather="x" class="w-3 h-3"></i></button>
          </span>
        `;
        }).join('');
        // The ✕ this button used to hold was its accessible name as well as its icon; an
        // <i> has neither, so the label moved into title/aria-label — which i18n.js
        // translates — and the glyph has to be drawn, because nothing else in this
        // function redraws.
        safeFeatherReplace();
      }
      renderDropdown(search ? search.value : '');
    }

    function renderDropdown(filterText = '') {
      const q = (filterText || '').toLowerCase().trim();

      if (policyCatalog.length === 0) {
        dropdown.innerHTML = policyCatalogError
          ? `<div class="p-3 text-center text-red-400 text-xs">${escapeHTML(policyCatalogError)}</div>`
          : '<div class="p-3 text-center text-slate-500 text-xs">Loading policies…</div>';
        return;
      }

      const matched = policyCatalog.filter(e => {
        const label = e.label || e.key;
        return label.toLowerCase().includes(q) || e.key.toLowerCase().includes(q);
      });

      if (matched.length === 0) {
        dropdown.innerHTML = '<div class="p-3 text-center text-slate-500 text-xs">No matching policies found</div>';
        return;
      }

      // Every interpolation below is server-supplied, so every one is escaped. The keys
      // and labels are the daemon's, and a policy key reaches the store from the REST API
      // without a charset check — see TestPortalEscapesCustomPolicies, which covers the
      // same value arriving on the subscriber's page.
      dropdown.innerHTML = matched.map(e => {
        const k = e.key;
        const label = e.label || k;
        const isSelected = selected.includes(k);
        // A sinkholing category takes domains away instead of routing them. Marked,
        // because "FamilySafe Protection" beside twenty games reads like one more game.
        const kindDot = e.blocking
          ? '<span class="w-1.5 h-1.5 rounded-full bg-red-400" title="Blocks (sinkholes) these domains"></span>'
          : `<span class="w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-cyan-400' : 'bg-slate-600'}"></span>`;

        if (isSelected) {
          return `
          <button type="button" class="policy-option-item flex w-full items-center justify-between px-3 py-2 bg-blue-600/25 border-s-2 border-blue-400 text-blue-200 cursor-pointer hover:bg-blue-600/35 transition text-xs font-semibold text-start" data-key="${escapeHTML(k)}" aria-pressed="true">
            <span class="flex items-center gap-2">
              ${kindDot}
              <span>${escapeHTML(label)}</span>
            </span>
            <i data-feather="check" class="w-3.5 h-3.5 text-blue-400 shrink-0"></i>
          </button>
        `;
        } else {
          return `
          <button type="button" class="policy-option-item flex w-full items-center justify-between px-3 py-2 text-slate-300 hover:bg-slate-800/80 cursor-pointer transition text-xs text-start" data-key="${escapeHTML(k)}" aria-pressed="false">
            <span class="flex items-center gap-2">
              ${kindDot}
              <span>${escapeHTML(label)}</span>
            </span>
            <i data-feather="plus" class="w-3.5 h-3.5 text-slate-600 shrink-0"></i>
          </button>
        `;
        }
      }).join('');
      // border-s-2 rather than border-l-2, so the marker stays on the reading edge in
      // Persian, and the two glyphs are drawn here because this list is rebuilt on every
      // keystroke in the search box and nothing downstream redraws it.
      safeFeatherReplace();
    }

    box.addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.target === search) return;
      if (e.target.closest('.remove-policy-tag-btn')) return;
      dropdown.classList.toggle('hidden');
      if (!dropdown.classList.contains('hidden')) {
        if (search) search.focus();
        // Renders "Loading policies…" first, then again with the real list. Awaiting
        // before the first render would leave the dropdown blank on a slow request,
        // which reads as "there are no policies".
        renderDropdown(search ? search.value : '');
        loadPolicyCatalog().then(() => {
          renderDropdown(search ? search.value : '');
        });
      }
    });

    if (search) {
      search.addEventListener('input', (e) => {
        dropdown.classList.remove('hidden');
        renderDropdown(e.target.value);
      });
      search.addEventListener('focus', () => {
        dropdown.classList.remove('hidden');
        renderDropdown(search.value);
        loadPolicyCatalog().then(() => {
          renderDropdown(search.value);
        });
      });
    }

    dropdown.addEventListener('click', (e) => {
      e.stopPropagation();
      const option = e.target.closest('.policy-option-item');
      if (!option) return;
      const key = option.getAttribute('data-key');
      if (!key) return;

      if (selected.includes(key)) {
        selected = selected.filter(p => p !== key);
      } else {
        selected.push(key);
      }
      renderTags();
      if (search) search.focus();
    });

    document.addEventListener('click', (e) => {
      if (!box.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.add('hidden');
      }
    });

    const selectAllBtn = document.getElementById(ids.selectAll);
    if (selectAllBtn) {
      selectAllBtn.addEventListener('click', async () => {
        // Awaited, because "select all" on an unloaded catalogue would silently select
        // nothing and then render "Inheriting all global policies" — the exact opposite
        // of what was asked for.
        await loadPolicyCatalog();
        selected = policyCatalog.map(e => e.key);
        if (selected.length === 0) {
          showToast(policyCatalogError || 'No policies available to select', 'error');
        }
        renderTags();
      });
    }

    const clearAllBtn = document.getElementById(ids.clearAll);
    if (clearAllBtn) {
      clearAllBtn.addEventListener('click', () => {
        selected = [];
        renderTags();
      });
    }

    // Delegated, because the tags are re-rendered on every change. Scoped to this
    // picker's own chips container so the instance's document-level listener above
    // is the only other one that sees the click.
    document.addEventListener('click', (e) => {
      const removeTagBtn = e.target.closest('.remove-policy-tag-btn');
      if (removeTagBtn && tags && tags.contains(removeTagBtn)) {
        const p = removeTagBtn.getAttribute('data-policy');
        selected = selected.filter(item => item !== p);
        renderTags();
      }
    });

    return {
      get: () => [...selected],
      // set() also prefetches the catalogue: the tags fall back to the raw key until
      // it arrives, so an operator who only glances at the attached policies should
      // read "Riot Games & Valorant", not "enable_riot".
      set: (arr) => {
        selected = Array.isArray(arr) ? [...arr] : [];
        renderTags();
        loadPolicyCatalog().then(() => renderTags());
      },
      reset: () => {
        selected = [];
        if (search) search.value = '';
        dropdown.classList.add('hidden');
        renderTags();
      }
    };
  }

  const editPolicyPicker = createPolicyMultiselect({
    box: 'policies-multiselect-box',
    dropdown: 'policies-dropdown-list',
    search: 'policies-search-input',
    tags: 'edit-client-policies-tags',
    selectAll: 'edit-client-policies-select-all',
    clearAll: 'edit-client-policies-clear-all'
  });

  const addPolicyPicker = createPolicyMultiselect({
    box: 'add-policies-multiselect-box',
    dropdown: 'add-policies-dropdown-list',
    search: 'add-policies-search-input',
    tags: 'add-client-policies-tags',
    selectAll: 'add-client-policies-select-all',
    clearAll: 'add-client-policies-clear-all'
  });

  // =======================================================
  // ANT-DESIGN STYLE GREGORIAN DATETIME PICKER
  // =======================================================
  // One picker per form, for the same reason the policy multiselect is a factory:
  // the create form and the edit form both carry an expiry now, and a shared set
  // of selection variables would have the calendar in one modal showing the date
  // the other modal last confirmed.
  const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function createExpiryDatePicker(ids) {
    const popup = document.getElementById(ids.popup);
    const openBtn = document.getElementById(ids.openBtn);
    const expiryInput = document.getElementById(ids.expiryInput);
    const monthYearLabel = document.getElementById(ids.monthLabel);
    const daysGrid = document.getElementById(ids.daysGrid);
    const hourSelect = document.getElementById(ids.hourSelect);
    const minuteSelect = document.getElementById(ids.minuteSelect);
    const confirmBtn = document.getElementById(ids.confirmBtn);
    const setNowBtn = document.getElementById(ids.setNowBtn);
    const clearBtn = document.getElementById(ids.clearBtn);

    const noop = { applyDefaultDays: () => {}, clear: () => {} };
    if (!popup || !daysGrid || !hourSelect || !minuteSelect) return noop;

    let selYear = 0;
    let selMonth = 0; // 0-indexed
    let selDay = 0;
    let selHour = 0;
    let selMinute = 0;

    function renderCalendarGrid() {
      if (!monthYearLabel || !daysGrid) return;
      monthYearLabel.innerText = `${MONTH_NAMES[selMonth]} ${selYear}`;

      hourSelect.value = selHour;
      minuteSelect.value = selMinute;

      const firstDayIndex = new Date(selYear, selMonth, 1).getDay();
      const daysInMonth = new Date(selYear, selMonth + 1, 0).getDate();
      const daysInPrevMonth = new Date(selYear, selMonth, 0).getDate();

      let gridHTML = '';

      // Previous month padding days
      for (let i = firstDayIndex - 1; i >= 0; i--) {
        gridHTML += `<div class="p-1.5 text-slate-700 text-[11px] pointer-events-none">${daysInPrevMonth - i}</div>`;
      }

      const today = new Date();
      // Current month days
      for (let d = 1; d <= daysInMonth; d++) {
        const isSelected = (d === selDay);
        const isToday = (today.getFullYear() === selYear && today.getMonth() === selMonth && today.getDate() === d);

        if (isSelected) {
          gridHTML += `<button type="button" class="dp-day-btn p-1.5 rounded-lg bg-blue-600 text-onfill font-bold shadow-md shadow-blue-500/30 text-xs" data-day="${d}">${d}</button>`;
        } else if (isToday) {
          gridHTML += `<button type="button" class="dp-day-btn p-1.5 rounded-lg border border-cyan-400 text-cyan-300 hover:bg-slate-800 text-xs font-bold" data-day="${d}">${d}</button>`;
        } else {
          gridHTML += `<button type="button" class="dp-day-btn p-1.5 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition text-xs" data-day="${d}">${d}</button>`;
        }
      }

      daysGrid.innerHTML = gridHTML;
    }

    // Reads the field this picker owns, or defaults a month out — the same default
    // the create form seeds and the preset select used to ship.
    function parseInputToState() {
      const val = expiryInput ? expiryInput.value.trim() : '';
      if (val) {
        const d = new Date(val.replace(' ', 'T'));
        if (!isNaN(d.getTime())) {
          selYear = d.getFullYear();
          selMonth = d.getMonth();
          selDay = d.getDate();
          selHour = d.getHours();
          selMinute = d.getMinutes();
          return;
        }
      }
      const d = new Date(Date.now() + 30 * 24 * 3600 * 1000);
      selYear = d.getFullYear();
      selMonth = d.getMonth();
      selDay = d.getDate();
      selHour = d.getHours();
      selMinute = d.getMinutes();
    }

    function applyToInput() {
      if (!expiryInput) return;
      const pad = (n) => String(n).padStart(2, '0');
      expiryInput.value = `${selYear}-${pad(selMonth + 1)}-${pad(selDay)} ${pad(selHour)}:${pad(selMinute)}:00`;
    }

    // Populate hours (00-23) and minutes (00-59)
    hourSelect.innerHTML = Array.from({length: 24}, (_, i) => {
      const h = String(i).padStart(2, '0');
      return `<option value="${i}">${h}</option>`;
    }).join('');
    minuteSelect.innerHTML = Array.from({length: 60}, (_, i) => {
      const m = String(i).padStart(2, '0');
      return `<option value="${i}">${m}</option>`;
    }).join('');
    parseInputToState();
    renderCalendarGrid();

    const toggleDatepicker = () => {
      popup.classList.toggle('hidden');
      if (!popup.classList.contains('hidden')) {
        parseInputToState();
        renderCalendarGrid();
      }
    };

    popup.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    if (openBtn) {
      openBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDatepicker();
      });
    }

    if (expiryInput) {
      expiryInput.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDatepicker();
      });
    }

    document.getElementById(ids.prevYear)?.addEventListener('click', () => {
      selYear--;
      renderCalendarGrid();
    });
    document.getElementById(ids.nextYear)?.addEventListener('click', () => {
      selYear++;
      renderCalendarGrid();
    });
    document.getElementById(ids.prevMonth)?.addEventListener('click', () => {
      selMonth--;
      if (selMonth < 0) { selMonth = 11; selYear--; }
      renderCalendarGrid();
    });
    document.getElementById(ids.nextMonth)?.addEventListener('click', () => {
      selMonth++;
      if (selMonth > 11) { selMonth = 0; selYear++; }
      renderCalendarGrid();
    });

    daysGrid.addEventListener('click', (e) => {
      const btn = e.target.closest('.dp-day-btn');
      if (btn) {
        selDay = parseInt(btn.getAttribute('data-day'), 10);
        renderCalendarGrid();
      }
    });

    hourSelect.addEventListener('change', (e) => { selHour = parseInt(e.target.value, 10); });
    minuteSelect.addEventListener('change', (e) => { selMinute = parseInt(e.target.value, 10); });

    setNowBtn?.addEventListener('click', () => {
      const future = new Date(Date.now() + 30 * 24 * 3600 * 1000);
      selYear = future.getFullYear();
      selMonth = future.getMonth();
      selDay = future.getDate();
      selHour = future.getHours();
      selMinute = future.getMinutes();
      renderCalendarGrid();
      applyToInput();
    });

    confirmBtn?.addEventListener('click', () => {
      applyToInput();
      popup.classList.add('hidden');
    });

    clearBtn?.addEventListener('click', () => {
      if (expiryInput) expiryInput.value = '';
      popup.classList.add('hidden');
    });

    document.addEventListener('click', (e) => {
      if (!popup.contains(e.target) && e.target !== openBtn && e.target !== expiryInput) {
        popup.classList.add('hidden');
      }
    });

    return {
      // The create form's opening default: a plan expiring a month out.
      applyDefaultDays(days) {
        const d = new Date(Date.now() + days * 24 * 3600 * 1000);
        selYear = d.getFullYear();
        selMonth = d.getMonth();
        selDay = d.getDate();
        selHour = d.getHours();
        selMinute = d.getMinutes();
        renderCalendarGrid();
        applyToInput();
      },
      clear: () => {
        if (expiryInput) expiryInput.value = '';
        popup.classList.add('hidden');
      }
    };
  }

  const editDatePicker = createExpiryDatePicker({
    popup: 'datepicker-popup',
    openBtn: 'open-datepicker-btn',
    expiryInput: 'edit-client-expiry',
    monthLabel: 'dp-month-year-label',
    daysGrid: 'dp-days-grid',
    hourSelect: 'dp-hour-select',
    minuteSelect: 'dp-minute-select',
    confirmBtn: 'dp-confirm-btn',
    setNowBtn: 'dp-set-now-btn',
    clearBtn: 'edit-client-clear-expiry-btn',
    prevYear: 'dp-prev-year',
    nextYear: 'dp-next-year',
    prevMonth: 'dp-prev-month',
    nextMonth: 'dp-next-month'
  });

  const addDatePicker = createExpiryDatePicker({
    popup: 'add-datepicker-popup',
    openBtn: 'add-open-datepicker-btn',
    expiryInput: 'add-client-expiry',
    monthLabel: 'add-dp-month-year-label',
    daysGrid: 'add-dp-days-grid',
    hourSelect: 'add-dp-hour-select',
    minuteSelect: 'add-dp-minute-select',
    confirmBtn: 'add-dp-confirm-btn',
    setNowBtn: 'add-dp-set-now-btn',
    clearBtn: 'add-client-clear-expiry-btn',
    prevYear: 'add-dp-prev-year',
    nextYear: 'add-dp-next-year',
    prevMonth: 'add-dp-prev-month',
    nextMonth: 'add-dp-next-month'
  });

  // The create form's blank slate: the fields the browser's reset() covers plus
  // the two components that live outside it — the readonly expiry field and the
  // policy picker's chips.
  function resetAddClientForm() {
    const form = document.getElementById('add-client-form');
    if (form) form.reset();
    addDatePicker.applyDefaultDays(30);
    addPolicyPicker.reset();
  }

  // showClientCreatedModal puts the just-minted credentials on screen. The
  // secret lives only in this closure and the readonly input's value — no
  // localStorage, no URL, and the input is type=password until the operator
  // deliberately reveals it, so a screen-share or a passer-by sees a masked
  // field by default. The link is built from the cached subscription origin,
  // the same source the Reg Link button uses, never from window.location.
  function showClientCreatedModal(client) {
    const modal = document.getElementById('client-created-modal');
    const nameEl = document.getElementById('created-client-name');
    const linkEl = document.getElementById('created-register-link');
    const secretEl = document.getElementById('created-register-secret');
    const toggleBtn = document.getElementById('toggle-created-secret-btn');
    if (!modal || !client) return;

    if (nameEl) nameEl.textContent = client.name || client.id || 'client';
    const origin = currentConfig?.subscription_origin || '';
    // /sub/ is the page a subscriber opens (status, quota, IP registration);
    // /ip/ is the API endpoint the portal's register button posts to. The
    // Reg Link button on the client card made this distinction in v2.1 —
    // this popup was still handing out the API URL.
    if (linkEl) linkEl.value = client.token && origin ? `${origin}/sub/${client.token}` : '(no origin configured — set the public address in Settings)';
    if (secretEl) {
      secretEl.value = client.register_secret || '(no secret in response)';
      secretEl.type = 'password';
    }
    if (toggleBtn) toggleBtn.textContent = 'Show';

    const copyLink = document.getElementById('copy-created-link-btn');
    const copySecret = document.getElementById('copy-created-secret-btn');
    if (copyLink) {
      copyLink.onclick = () => copyText(linkEl ? linkEl.value : '', copyLink);
    }
    if (copySecret) {
      copySecret.onclick = () => copyText(secretEl ? secretEl.value : '', copySecret);
    }
    if (toggleBtn) {
      toggleBtn.onclick = () => {
        if (!secretEl) return;
        const masked = secretEl.type === 'password';
        secretEl.type = masked ? 'text' : 'password';
        toggleBtn.textContent = masked ? 'Hide' : 'Show';
      };
    }
    const doneBtn = document.getElementById('close-client-created-done-btn');
    if (doneBtn) doneBtn.onclick = () => modal.classList.add('hidden');
    // The × in the corner: data-modal-close names it, so Escape and a backdrop
    // click reach it — it needs its own handler or those paths click a dead
    // button.
    const closeBtn = document.getElementById('close-client-created-btn');
    if (closeBtn) closeBtn.onclick = () => modal.classList.add('hidden');

    modal.classList.remove('hidden');
    // The modal a11y observer moves focus to the first focusable control when
    // the class flips; nothing to do here but let it.
  }

  function formatToDateTimeString(dateStr) {
    if (!dateStr || dateStr === '0001-01-01T00:00:00Z' || dateStr.startsWith('0001')) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '';
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
    } catch (e) {
      return '';
    }
  }

  const editClientModal = document.getElementById('edit-client-modal');
  const closeEditClientBtn = document.getElementById('close-edit-client-btn');
  const cancelEditClientBtn = document.getElementById('cancel-edit-client-btn');
  const editClientForm = document.getElementById('edit-client-form');
  const regenUUIDBtn = document.getElementById('edit-client-regen-uuid');
  const regenSecretBtn = document.getElementById('edit-client-regen-secret');
  const resetTrafficBtn = document.getElementById('edit-client-reset-traffic-btn');
  const enabledCheckbox = document.getElementById('edit-client-enabled');
  const statusLabel = document.getElementById('edit-client-status-label');

  if (closeEditClientBtn) {
    closeEditClientBtn.addEventListener('click', () => {
      if (editClientModal) editClientModal.classList.add('hidden');
    });
  }

  if (cancelEditClientBtn) {
    cancelEditClientBtn.addEventListener('click', () => {
      if (editClientModal) editClientModal.classList.add('hidden');
    });
  }

  if (enabledCheckbox && statusLabel) {
    enabledCheckbox.addEventListener('change', () => {
      if (enabledCheckbox.checked) {
        statusLabel.innerText = 'ACTIVE';
        statusLabel.className = 'text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold';
      } else {
        statusLabel.innerText = 'DISABLED';
        statusLabel.className = 'text-[10px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 font-bold';
      }
    });
  }

  // Open Edit Client Modal from Card Click
  document.addEventListener('click', (e) => {
    const editBtn = e.target.closest('.edit-client-btn');
    if (editBtn) {
      const clientId = editBtn.getAttribute('data-id');
      if (!clientsDataCache || !clientsDataCache.clients) return;
      const client = clientsDataCache.clients.find(c => c.id === clientId);
      if (!client) return;

      document.getElementById('edit-client-id').value = client.id;
      document.getElementById('edit-client-name').value = client.name || '';
      document.getElementById('edit-client-uuid').value = client.uuid || '';
      document.getElementById('edit-client-secret').value = client.register_secret || '';
      document.getElementById('edit-client-ip').value = (client.allowed_ips && client.allowed_ips.length > 0) ? client.allowed_ips[0] : '';
      document.getElementById('edit-client-traffic').value = client.traffic_limit_gb || '';
      // The stored cycle, normalised to the empty option when the record predates
      // cycles or carries a name this build does not offer. A <select> handed an
      // unknown value silently shows its first option, so reopening the modal on such
      // a record and saving would rewrite the cycle to "never" without being asked.
      const cycleSelect = document.getElementById('edit-client-traffic-cycle');
      if (cycleSelect) {
        const stored = client.traffic_reset_cycle || '';
        const known = Array.prototype.some.call(cycleSelect.options, (o) => o.value === stored);
        cycleSelect.value = known ? stored : '';
      }
      document.getElementById('edit-client-expiry').value = formatToDateTimeString(client.expires_at);
      document.getElementById('edit-client-note').value = client.note || '';

      if (enabledCheckbox) {
        enabledCheckbox.checked = client.enabled !== false;
        enabledCheckbox.dispatchEvent(new Event('change'));
      }

      // set() renders the chips from the raw keys immediately and prefetches the
      // catalogue so they read as labels: an operator who only glances at the
      // attached policies should read "Riot Games & Valorant", not "enable_riot".
      editPolicyPicker.set(Array.isArray(client.custom_policies) ? client.custom_policies : []);

      if (editClientModal) editClientModal.classList.remove('hidden');
      safeFeatherReplace();
    }

    // Copy UUID to clipboard
    const copyUuidBtn = e.target.closest('.copy-uuid-btn');
    if (copyUuidBtn) {
      const uuid = copyUuidBtn.getAttribute('data-uuid');
      if (uuid) {
        navigator.clipboard.writeText(uuid);
        showToast('UUID copied to clipboard!', 'success');
      }
    }
  });

  // Regenerate UUID Button inside Edit Modal
  if (regenUUIDBtn) {
    regenUUIDBtn.addEventListener('click', async () => {
      const clientId = document.getElementById('edit-client-id').value;
      if (!clientId) return;
      try {
        const res = await fetch(api(`/api/clients/${clientId}/regenerate-uuid`), {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (res.ok) {
          const data = await res.json();
          document.getElementById('edit-client-uuid').value = data.uuid;
          showToast('New UUID generated!', 'success');
        }
      } catch (e) {
        showToast('Failed to regenerate UUID', 'error');
      }
    });
  }

  // Regenerate Register Secret inside Edit Modal (Phase B): the out-of-band
  // credential dies with this click, so the subscriber needs the new value
  // through the same channel the original came from.
  if (regenSecretBtn) {
    regenSecretBtn.addEventListener('click', async () => {
      const clientId = document.getElementById('edit-client-id').value;
      if (!clientId) return;
      try {
        const res = await fetch(api(`/api/clients/${clientId}/regenerate-register-secret`), {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (res.ok) {
          const data = await res.json();
          document.getElementById('edit-client-secret').value = data.register_secret;
          showToast('New registration secret generated!', 'success');
        } else {
          showToast(await errorMessage(res, 'Failed to regenerate the secret'), 'error');
        }
      } catch (e) {
        showToast('Failed to regenerate the secret', 'error');
      }
    });
  }

  // Reset Traffic Button inside Edit Modal
  if (resetTrafficBtn) {
    resetTrafficBtn.addEventListener('click', async () => {
      const clientId = document.getElementById('edit-client-id').value;
      if (!clientId) return;
      try {
        const res = await fetch(api(`/api/clients/${clientId}/reset-traffic`), {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (res.ok) {
          showToast('Client traffic counter reset to 0!', 'success');
          loadClients();
        } else {
          showToast('Failed to reset traffic counter', 'error');
        }
      } catch (e) {
        showToast('Network error resetting traffic', 'error');
      }
    });
  }

  // Submit Edit Client Form
  if (editClientForm) {
    editClientForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const clientId = document.getElementById('edit-client-id').value;
      if (!clientId) return;

      const name = document.getElementById('edit-client-name').value.trim();
      const uuid = document.getElementById('edit-client-uuid').value.trim();
      const ip = document.getElementById('edit-client-ip').value.trim();
      const trafficGB = parseFloat(document.getElementById('edit-client-traffic').value) || 0;
      const cycle = document.getElementById('edit-client-traffic-cycle')?.value || '';
      const expiryVal = document.getElementById('edit-client-expiry').value;
      const note = document.getElementById('edit-client-note').value.trim();
      const isEnabled = enabledCheckbox ? enabledCheckbox.checked : true;

      let expiresAtISO = '0001-01-01T00:00:00Z';
      if (expiryVal) {
        const parsed = new Date(expiryVal);
        if (!isNaN(parsed.getTime())) {
          expiresAtISO = parsed.toISOString();
        }
      }

      const payload = {
        name: name,
        uuid: uuid,
        allowed_ip: ip,
        traffic_limit_gb: trafficGB,
        // Sent on every save, including as "" — the field is a pointer on the server,
        // so omitting it means "leave the cycle alone" and there would then be no way
        // to turn a cycle back off from this form.
        traffic_reset_cycle: cycle,
        expires_at: expiresAtISO,
        enabled: isEnabled,
        note: note,
        custom_policies: editPolicyPicker.get()
      };

      try {
        const res = await fetch(api(`/api/clients/${clientId}`), {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          showToast('Client configuration updated successfully!', 'success');
          if (editClientModal) editClientModal.classList.add('hidden');
          loadClients();
        } else {
          // "Invalid traffic reset cycle", "IP already assigned to another client",
          // "UUID already in use" — each of those is 400 with a different fix, and the
          // generic message here used to send the operator back to guess which.
          showToast(await errorMessage(res, 'Failed to update client details'), 'error');
        }
      } catch (err) {
        showToast('Network error updating client', 'error');
      }
    });
  }
