// =======================================================
// WhitePrivateDns Front-End Application Logic (ES6)
// Bulletproof, Offline-Safe, Self-Healing
// =======================================================


// authToken is empty until a real login. Earlier builds seeded the literal
// 'wpdns_session_admin' here and wrote it to localStorage, which the server has
// never accepted — it only produced a guaranteed 401 on first load and made a
// logged-out browser look logged in.
let authToken = localStorage.getItem('whiteprivatedns_token') || '';

// The admin namespace. Since v2.1 the panel is not at the root of the host: the
// SPA lives at /<admin-path>/dash/... and every dashboard API at
// /<admin-path>/api/..., where <admin-path> is a 16-hex-character value drawn
// once per install. The bundle is built without knowing it — the same bytes ship
// to every install, and baking one in would publish the hidden path — so it is
// read from the address bar instead. The shape is exactly what the server
// generates (16 lowercase hex characters, security.go's IsValidAdminPath), so a
// match is reliable, and anything else means the page was reached some other way,
// in which case the empty prefix degrades to the pre-v2.1 root paths.
const ADMIN_BASE = (function () {
  const m = window.location.pathname.match(/^\/([0-9a-f]{16})(?=\/|$)/);
  return m ? '/' + m[1] : '';
})();
const DASH_BASE = ADMIN_BASE + '/dash';

// api() prefixes a server path with the admin namespace. Every dashboard call —
// fetches, the SSE stream, the docs link — goes through this, because the day
// one call site forgets the prefix is the day that call starts answering 404
// while every other tab keeps working.
const api = (path) => ADMIN_BASE + path;
// The bridge the ES modules read shared state through. Modules cannot import
// from this classic script, and a captured copy of any of these would go stale
// across a re-login or a config refresh — so each accessor resolves the live
// value at call time.
window.__wpdns = {
  getToken: () => authToken,
  setToken: (v) => { authToken = v; },
  getConfig: () => currentConfig,
  api: (p) => api(p),
  DASH_BASE: DASH_BASE,
  showToast: (m, t) => showToast(m, t),
  errorMessage: (r, f) => errorMessage(r, f),
};

let sseSource = null;
let qpsChart = null;
let currentConfig = null;
let isStreamPaused = false;

// The live query table is a rendering of this buffer rather than the record itself.
//
// The filter dropdown and the search box used to be read inside the append path — at the
// moment a query arrived and nowhere else — so they only ever applied to arriving rows.
// Selecting BLOCK left every DIRECT row sitting on screen; typing a domain into the search
// box did nothing at all until the next query happened to show up, which on a resolver
// serving one household can be minutes. Neither control has an event listener in this file,
// so there was nothing to re-render with: the operator's only evidence that the filter works
// is that later rows obey it. That reads as a broken control, not a quiet network.
//
// Holding the queries as data makes the filter, the search box, and Clear all cheap and
// exact, and it makes "the last STREAM_BUFFER_MAX queries received" true regardless of what
// the view is currently showing — the old 80-row cap applied to whatever survived the
// filter, so a narrow filter silently discarded history it had already been handed.
const STREAM_BUFFER_MAX = 200;
let streamBuffer = [];

function safeFeatherReplace() {
  try {
    if (typeof feather !== 'undefined' && feather.replace) {
      feather.replace();
    }
  } catch (e) {
    console.warn('Feather icons render notice:', e);
  }
}

// errorMessage pulls the server's explanation out of a failed response. Handlers
// answer with {"error":"..."} and the text is the actionable part — which policy
// rule a password failed, or that the IP is locked out rather than mistyped.
async function errorMessage(res, fallback) {
  try {
    const text = await res.text();
    if (text) {
      try {
        const parsed = JSON.parse(text);
        if (parsed && parsed.error) return String(parsed.error);
      } catch (e) {
        const trimmed = text.trim();
        if (trimmed && trimmed.length < 200) return trimmed;
      }
    }
  } catch (e) { /* fall through to the generic message */ }
  return res.status === 429 ? 'Too many attempts. Try again later.' : fallback;
}

// clientAction posts one subscriber mutation and reports what actually happened.
//
// Each of the five callers used to be its own try/catch that either ignored res.ok
// or swallowed the throw in `catch (err) {}`. So a refused delete showed "Client
// deleted" and the follow-up loadClients() quietly put the row back — which reads
// as the dashboard being out of sync rather than as the server having said no. A
// dropped connection showed nothing at all, and the operator was left looking at a
// row they believed they had just changed.
//
// It returns true only when the server confirmed the change, so a caller can chain
// on the result rather than assume.
async function clientAction(path, payload, successMsg, tone) {
  try {
    const res = await fetch(api(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      showToast(await errorMessage(res, 'The server refused the request'), 'error');
      return false;
    }
    showToast(successMsg, tone || 'info');
    // Only on success: nothing changed on a refusal, so the rows on screen are
    // already correct and a reload would just hide the error toast behind a redraw.
    loadClients();
    return true;
  } catch (err) {
    // fetch rejects only on a transport failure, so this is the daemon being gone or
    // the tab being offline. Worth saying: the row on screen is now unverified.
    showToast('Could not reach the server — the list may be out of date.', 'error');
    return false;
  }
}

// isProbablyIP is a typo catcher, not the authority. The server re-parses with
// net.ParseIP and stores the canonical form, because whitelisting is an exact string
// compare against the address the listener reports — this check only exists so an
// obvious slip is caught while the operator can still see and fix what they typed.
//
// Leading zeros are rejected on purpose: Go's parser refuses them too, since
// "010.1.1.1" is octal to some tools and decimal to others.
function isProbablyIP(value) {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) {
    return value.split('.').every((part) => Number(part) <= 255 && (part === '0' || !part.startsWith('0')));
  }
  // A colon is what separates a v6 attempt from a mistyped v4. Hand-rolling the full
  // v6 grammar here would only find new ways to disagree with Go's parser, so the
  // shape is checked and the verdict is left to the server.
  return value.includes(':') && /^[0-9a-fA-F:.]+$/.test(value) && !value.includes(':::');
}

// Init when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  safeFeatherReplace();
  try { initChart(); } catch (e) {}
  // Before checkAuthAndBoot, which unhides the login overlay synchronously: the observers
  // inside have to be watching already or they miss the modal that is up first.
  initModalA11y();
  checkAuthAndBoot();

  // The API docs live under the admin namespace too, and the anchor's href in
  // index.html is a static "/api/v1/docs" that cannot know the install's path.
  // Rewritten here from the same value every fetch uses, so the page the button
  // opens is the one the server actually serves.
  document.querySelectorAll('a[href="/api/v1/docs"]').forEach((a) => {
    a.href = api('/api/v1/docs');
  });

  // Login form submit
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const u = document.getElementById('login-username').value.trim();
      // Not trimmed: the password is compared byte for byte, and a pre-v1.5.0
      // record can hold any plaintext the operator originally chose.
      const p = document.getElementById('login-password').value;
      // The 2FA row stays hidden until the server says a code is needed; once
      // it has said so once in this tab, the row stays visible so a mistyped
      // code can be corrected without the field vanishing.
      const codeInput = document.getElementById('login-code');
      const code = codeInput ? (codeInput.value || '').trim() : '';
      const errDiv = document.getElementById('login-error');
      if (errDiv) errDiv.classList.add('hidden');

      try {
        const res = await fetch(api('/api/auth/login'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: u, password: p, code })
        });

        if (!res.ok) {
          // The body is parsed exactly once, here, and both the message and the
          // second-factor flag below read that one parse. errorMessage() calls
          // res.text() — it consumes the stream — so any later res.clone() on
          // this response throws "body already used" and the flag check would
          // silently never fire. That ordering bug is why a correct password
          // with 2FA on showed "Invalid credentials" and no code field.
          let errJSON = null;
          try { errJSON = await res.clone().json(); } catch (e) { /* body was not JSON */ }
          if (errDiv) {
            // The server distinguishes bad credentials from a lockout; showing
            // "Invalid credentials" for a 429 sends the operator hunting for a
            // typo when the real answer is "wait fifteen minutes".
            errDiv.innerText = await errorMessage(res, 'Invalid credentials');
            errDiv.classList.remove('hidden');
          }
          // The server flags the one case that needs the code field: the
          // password verified but the second factor did not (twofactor_required
          // in the 401 body). Revealing the row on every bad password — the old
          // behaviour, keyed on the status alone — is how a first-time operator
          // on an install with no 2FA enrolled was greeted by a TWO-FACTOR CODE
          // box. Once genuinely shown the row stays up for this tab, so a
          // mistyped code can be corrected without the field vanishing.
          if (res.status === 401 && p && codeInput) {
            const needs2fa = !!(errJSON && errJSON.twofactor_required);
            if (needs2fa) codeInput.closest('div').classList.remove('hidden');
          }
          return;
        }

        const data = await res.json();
        authToken = data.token;
        localStorage.setItem('whiteprivatedns_token', authToken);
        hideLoginModal();
        bootDashboard();

        if (data.password_weak || data.is_default_password) {
          showChangePwdModal();
        }
      } catch (err) {
        if (errDiv) {
          errDiv.innerText = 'Server connection failed';
          errDiv.classList.remove('hidden');
        }
      }
    });
  }

  // Password change form submit
  const pwdForm = document.getElementById('change-pwd-form');
  if (pwdForm) {
    pwdForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const userField = document.getElementById('new-admin-user');
      const currentField = document.getElementById('current-admin-pass');
      const submitted = userField ? userField.value.trim() : '';
      const newPassword = document.getElementById('new-admin-pass').value;
      const currentPassword = currentField ? currentField.value : '';

      // The username field is prefilled with the live value, so "unchanged" has to
      // be measured against it — otherwise reopening the modal and saving would
      // read as a rename and demand a re-authentication for nothing.
      const liveUser = currentConfig?.server?.admin_username || 'admin';
      const newUsername = submitted && submitted !== liveUser ? submitted : '';
      if (!newPassword && !newUsername) {
        hideChangePwdModal();
        return;
      }
      // The server re-authenticates before touching either credential, so a
      // change without this field can only ever come back 403.
      if (!currentPassword) {
        showToast('Enter your current password to confirm the change', 'error');
        if (currentField) currentField.focus();
        return;
      }

      const payload = { current_password: currentPassword };
      if (newUsername) payload.admin_username = newUsername;
      if (newPassword) payload.admin_password = newPassword;
      // v2.1.0 (B-04 remediation): the second factor rides the same body. The
      // row is revealed when the config shows 2FA enabled; sending it while 2FA
      // is off is harmless (the server ignores it).
      const codeRow = document.getElementById('change-pwd-2fa-row');
      const codeInput = document.getElementById('change-pwd-code');
      if (codeRow) codeRow.classList.toggle('hidden', !currentConfig?.auth?.totp_enabled);
      if (codeInput && codeInput.value.trim()) payload.code = codeInput.value.trim();

      try {
        const res = await fetch(api('/api/config/server'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          // The server explains exactly which policy rule the password failed;
          // a generic "Failed" left the operator guessing.
          showToast(await errorMessage(res, 'Failed to update credentials'), 'error');
          return;
        }

        const data = await res.json().catch(() => ({}));
        // A password change revokes every session, including this one, and hands
        // back a replacement. A username-only change does not, and sends no
        // token — overwriting the stored one with undefined would log us out.
        if (data.token) {
          authToken = data.token;
          localStorage.setItem('whiteprivatedns_token', authToken);
        }
        // Keep the local copy in step so the Settings card and the next open of
        // this modal show the name that is now in force.
        if (currentConfig?.server && data.username) {
          currentConfig.server.admin_username = data.username;
          const adminNameEl = document.getElementById('current-admin-name');
          if (adminNameEl) adminNameEl.innerText = data.username;
        }
        // The nag is satisfied, so a later voluntary open must not be forced.
        if (currentConfig?.server && newPassword) {
          currentConfig.server.admin_password_weak = false;
        }
        hideChangePwdModal();
        showToast(newPassword
          ? 'Credentials updated — other sessions have been signed out'
          : 'Username updated', 'success');
      } catch (err) {
        showToast('Error updating credentials', 'error');
      }
    });
  }

  // Voluntary credential rotation from the Settings tab.
  document.getElementById('open-change-pwd-btn')?.addEventListener('click', () => {
    showChangePwdModal(false);
  });
  document.getElementById('change-pwd-cancel')?.addEventListener('click', () => {
    hideChangePwdModal();
  });

  document.getElementById('logout-btn')?.addEventListener('click', () => {
    signOut();
  });
});

// signOut revokes the session on the daemon, then clears local state.
//
// Removing the token from localStorage is not a logout: the session stayed live
// server-side for the rest of its lifetime, so any copy of it — a shared browser,
// a proxy log, a captured Authorization header — kept working after the operator
// believed they had signed out. The network call revokes exactly this session;
// sibling sessions on other devices are deliberately left alone.
//
// The local state is cleared in `finally` so a daemon that is unreachable, or a
// token already expired, still returns the operator to the login screen instead
// of trapping them in a dashboard they can no longer use.
async function signOut() {
  try {
    await fetch(api('/api/auth/logout'), {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + authToken, 'Content-Type': 'application/json' },
      body: '{}',
    });
  } catch (e) {
    // Nothing to surface: the operator asked to leave, and the only thing left
    // to do either way is drop the local session.
  } finally {
    localStorage.removeItem('whiteprivatedns_token');
    authToken = '';
    showLoginModal();
  }
}
