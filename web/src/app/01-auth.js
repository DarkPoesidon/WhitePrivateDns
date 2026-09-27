// =======================================================
// AUTH & BOOTSTRAP
// =======================================================
function checkAuthAndBoot() {
  if (!authToken) {
    showLoginModal();
  } else {
    bootDashboard();
  }
}

function showLoginModal() {
  document.getElementById('login-modal')?.classList.remove('hidden');
}

function hideLoginModal() {
  document.getElementById('login-modal')?.classList.add('hidden');
}

// The credential modal has two modes. Forced is the security nag: the stored
// password fails the policy, so a new one is mandatory and there is nothing safe
// to cancel back to. Voluntary is the operator rotating a compliant password from
// Settings — the escape hatch has to be there, and a username-only change is
// legitimate, so the password field stops being mandatory.
function showChangePwdModal(forced = true) {
  const modal = document.getElementById('change-pwd-modal');
  if (!modal) return;

  const title = document.getElementById('change-pwd-title');
  const badge = document.getElementById('change-pwd-badge');
  const intro = document.getElementById('change-pwd-intro');
  const cancel = document.getElementById('change-pwd-cancel');
  const icon = document.getElementById('change-pwd-icon');
  const newPass = document.getElementById('new-admin-pass');
  const userField = document.getElementById('new-admin-user');

  if (forced) {
    if (title) title.innerText = 'Security Setup';
    if (badge) badge.innerText = 'WEAK ADMIN PASSWORD DETECTED';
    if (intro) {
      intro.innerText = 'This account is still on a password that fails the current policy. '
        + 'Anyone who can reach this dashboard may be able to log in with it. '
        + 'Set a new administrator password now:';
    }
    cancel?.classList.add('hidden');
    newPass?.setAttribute('required', 'required');
    if (newPass) newPass.placeholder = 'At least 10 characters';
  } else {
    if (title) title.innerText = 'Administrator Credentials';
    if (badge) badge.innerText = 'ROTATE YOUR DASHBOARD LOGIN';
    if (intro) {
      intro.innerText = 'Confirm with your current password. Saving a new password signs out '
        + 'every session, including this browser, and issues you a fresh one. '
        + 'Leave the password blank to change only the username.';
    }
    cancel?.classList.remove('hidden');
    // Not required here: the server accepts a username-only change.
    newPass?.removeAttribute('required');
    if (newPass) newPass.placeholder = 'Leave blank to keep the current password';
  }
  if (icon) {
    icon.setAttribute('data-feather', forced ? 'alert-triangle' : 'user-check');
  }
  // The field is prefilled with the live username so that submitting it unchanged
  // is a no-op rather than an accidental rename.
  if (userField) {
    userField.value = currentConfig?.server?.admin_username || userField.value || 'admin';
  }

  modal.classList.remove('hidden');
  // Through the helper rather than a bare window.feather test: the icon above was just swapped
  // by setAttribute, so this call is what draws it, and the helper is the version that also
  // checks the replace function exists and swallows a failure. An exception thrown here would
  // abort showChangePwdModal after the modal is already visible — losing the focus() below, on
  // the one modal that cannot be dismissed when it is forced.
  safeFeatherReplace();
  document.getElementById('current-admin-pass')?.focus();
}

function hideChangePwdModal() {
  document.getElementById('change-pwd-modal')?.classList.add('hidden');
  const cur = document.getElementById('current-admin-pass');
  const np = document.getElementById('new-admin-pass');
  if (cur) cur.value = '';
  if (np) np.value = '';
}

// ── Static modal behaviour ───────────────────────────────────────────────────────────────
//
// index.html carries five modals as static markup and showDialog builds a sixth kind at
// runtime. The runtime one has always been correct — role="dialog", aria-modal, a labelled
// heading, a focus trap, Escape, focus return — and the five static ones had none of it.
// A screen reader announced the login overlay as an ordinary div; Tab walked straight out of
// it into the dashboard's own controls behind the backdrop, before anyone had authenticated;
// and the only way out of the diagnostics panel was to find the small × in its corner.
//
// The dismissible ones declare their own close control with data-modal-close and the handlers
// below click it rather than hiding the modal themselves. Some of those buttons do more than
// remove a class — change-pwd-cancel runs hideChangePwdModal, which also clears both password
// fields so a typed-then-abandoned password is not left sitting in the DOM — and a second,
// parallel way to close would skip that half. The ones that only hide today cost nothing by
// going through the same path, and stop costing nothing the moment one of them grows a reset.
//
// Two modals are not dismissible, on purpose. login-modal is the authentication gate, and
// change-pwd-modal in forced mode is the weak-password gate: there is nothing safe behind
// either. change-pwd-modal does name change-pwd-cancel, but showChangePwdModal hides that
// button whenever the modal is forced, and modalCloseControl below returns null for a hidden
// control — so Escape is a no-op in exactly the mode where cancelling is not offered, and the
// two can never drift apart.
const MODAL_IDS = ['login-modal', 'change-pwd-modal', 'diagnostics-modal', 'edit-client-modal', 'add-client-modal', 'client-created-modal'];

// Every one of these modals is shown and hidden by toggling .hidden, so reading the class is
// both the truth and cheap enough for a keydown handler.
function isShown(el) {
  return !!el && !el.classList.contains('hidden');
}

// The topmost open modal, in document order. Nothing stacks two static modals today, but
// Escape has to pick one, and document order is the right tiebreak: they all carry z-50, and
// with equal z-index the later element paints on top.
function topmostOpenModal() {
  let found = null;
  for (const id of MODAL_IDS) {
    const el = document.getElementById(id);
    if (isShown(el)) found = el;
  }
  return found;
}

// The panel is the single child of the backdrop container in all five.
function modalPanel(modal) {
  return modal.firstElementChild || modal;
}

// The close control the modal declares, or null when it declares none or the one it declares
// is currently hidden.
function modalCloseControl(modal) {
  const id = modal.getAttribute('data-modal-close');
  if (!id) return null;
  const btn = document.getElementById(id);
  return isShown(btn) ? btn : null;
}

// MODAL_FOCUSABLE is showDialog's trap selector with :not([disabled]) extended to select and
// textarea and hidden inputs excluded. The disabled part is not hypothetical: runFullDiagnostics
// disables #rerun-diagnostics-btn for the length of a run, and that button lives inside
// diagnostics-modal — a trap that stopped on it would park the keyboard on a dead control.
const MODAL_FOCUSABLE = 'button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [href]';

function modalFocusables(panel) {
  // offsetParent is null for anything display:none — a collapsed section, a .hidden button —
  // and none of these panels is itself position:fixed, so the check is safe here.
  return [...panel.querySelectorAll(MODAL_FOCUSABLE)].filter((el) => el.offsetParent !== null);
}

// A modal can hold its own popover — the expiry datepicker inside edit-client-modal is the only
// one today — and Escape there means "close the popover", not "throw away the form behind it".
// The popovers are marked in the markup rather than listed here, and each is closed the way its
// own handlers already close it: by putting .hidden back. Before this existed Escape did nothing
// at all in the datepicker, so nothing is being taken away.
function closeNestedPopover(modal) {
  for (const pop of modal.querySelectorAll('[data-modal-popover]')) {
    if (isShown(pop)) {
      pop.classList.add('hidden');
      return true;
    }
  }
  return false;
}

// Escape closes, Tab stays inside. Both are delegated from document once, at parse time, so
// they are live before the login overlay is unhidden — bootDashboard is where the rest of the
// listeners are attached and it only runs once authentication has succeeded.
document.addEventListener('keydown', (e) => {
  // showDialog's own trap runs on the capture phase and calls preventDefault, so a press it
  // has already dealt with arrives here marked. Without this, Escape on a confirm dialog
  // opened over the edit-client modal would close both — the dialog and the modal that asked
  // the question.
  if (e.defaultPrevented) return;
  if (e.key !== 'Escape' && e.key !== 'Tab') return;
  // A showDialog overlay on top owns the keyboard outright. Its own capture-phase trap handles
  // Tab, but it only calls preventDefault on the two wrap cases — so in the middle of its tab
  // order the press arrives here unmarked, and the static modal underneath would pull focus back
  // out of the dialog that is actually in front. defaultPrevented alone is not enough for that.
  if (activeDialog) return;

  const modal = topmostOpenModal();
  if (!modal) return;

  if (e.key === 'Escape') {
    // A popover inside the modal takes the press first, so Escape in the datepicker closes the
    // datepicker rather than discarding the client edit behind it.
    if (closeNestedPopover(modal)) {
      e.preventDefault();
      return;
    }
    const closeBtn = modalCloseControl(modal);
    if (!closeBtn) return;
    e.preventDefault();
    closeBtn.click();
    return;
  }

  // aria-modal="true" tells assistive technology the rest of the page is inert; the trap is
  // what makes that true for the keyboard as well. A real trap, not a wrap: focus that has
  // already escaped — a click on the backdrop, a focus the browser restored across a reload —
  // is pulled back in rather than left outside.
  const panel = modalPanel(modal);
  const focusables = modalFocusables(panel);
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
});

// A press that lands on the backdrop itself, never one that bubbled up from inside the panel.
// mousedown rather than click, matching showDialog: a drag that starts inside a text field and
// releases over the backdrop is a selection, not a dismissal.
document.addEventListener('mousedown', (e) => {
  const el = e.target;
  if (!(el instanceof Element) || !el.id || !MODAL_IDS.includes(el.id) || !isShown(el)) return;
  const closeBtn = modalCloseControl(el);
  if (closeBtn) closeBtn.click();
});

// modalReturnFocus holds, per modal, whatever had focus when it opened.
const modalReturnFocus = new WeakMap();

// Focus in on open, focus back on close, observed rather than wired into each of the thirteen
// places that add or remove .hidden — one behaviour in one place, and no risk of the next
// modal being added without it.
//
// The "only if focus is not already inside" guard is what preserves the deliberate choices the
// show functions make: showChangePwdModal focuses the current-password field and runs
// synchronously, while this callback is a microtask, so it sees that focus and leaves it alone.
function initModalA11y() {
  for (const id of MODAL_IDS) {
    const modal = document.getElementById(id);
    if (!modal) continue;

    let wasOpen = isShown(modal);
    const observer = new MutationObserver(() => {
      const open = isShown(modal);
      if (open === wasOpen) return;
      wasOpen = open;

      if (open) {
        modalReturnFocus.set(modal, document.activeElement);
        const panel = modalPanel(modal);
        if (!panel.contains(document.activeElement)) {
          modalFocusables(panel)[0]?.focus();
        }
        return;
      }

      // Closing drops focus to <body>, which puts the next Tab back at the top of the
      // document — a long walk back to the button the operator had just pressed.
      const back = modalReturnFocus.get(modal);
      modalReturnFocus.delete(modal);
      if (back instanceof HTMLElement && back.isConnected && back.offsetParent !== null) {
        try { back.focus(); } catch (err) { /* went away mid-close */ }
      }
    });
    observer.observe(modal, { attributes: true, attributeFilter: ['class'] });
  }
}

let areEventListenersAttached = false;

async function bootDashboard() {
  if (!areEventListenersAttached) {
    initEventListeners();
    initClientEventListeners();
    initAPIEvents();
    areEventListenersAttached = true;
  }
  const authed = await loadConfig();
  if (!authed) return; // 401 -> login modal is already shown
  await loadClients();
  startStatsPolling();
  startLiveStream();
  handleRouteFromURL();
}
