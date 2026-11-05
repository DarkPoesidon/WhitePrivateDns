// Update notification and one-click self-update.
//
// The daemon checks GitHub releases on its own; this file only reads the cached
// result from /api/update/status, shows the banner, and asks the server to start
// the updater. The server runs scripts/update.sh (backup, health check, rollback),
// restarts the service and wipes sessions, so after "Update now" the panel waits
// for the daemon to go away and come back, then reloads to the login page.

let updateTimer = null;
let updateBusy = false;
let latestUpdateStatus = null;

async function fetchUpdateStatus(force) {
  try {
    const res = await fetch(api('/api/update/status'), {
      method: force ? 'POST' : 'GET',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

function renderUpdateBanner(st) {
  const banner = document.getElementById('update-banner');
  if (!banner) return;
  latestUpdateStatus = st;
  let dismissed = false;
  try { dismissed = !!st && sessionStorage.getItem('wpdns_update_dismissed') === st.latest; } catch (e) { /* storage blocked */ }
  const show = !!st && st.available && !dismissed;
  banner.classList.toggle('hidden', !show);
  if (!show) return;
  document.getElementById('update-versions').textContent = `${st.current} → ${st.latest}`;
  const link = document.getElementById('update-notes-link');
  if (link) {
    link.classList.toggle('hidden', !st.url);
    if (st.url) link.href = st.url;
  }
  const btn = document.getElementById('update-now-btn');
  if (btn) {
    btn.disabled = updateBusy || st.in_progress;
    // An install that cannot update itself (Docker, non-standard path) still gets
    // the notification; the button explains why instead of silently doing nothing.
    btn.title = st.can_apply ? '' : (st.blocked_reason || '');
  }
}

async function refreshUpdateStatus(force) {
  const st = await fetchUpdateStatus(force);
  if (st) renderUpdateBanner(st);
  return st;
}

function initUpdateCheck() {
  if (updateTimer) clearInterval(updateTimer);
  refreshUpdateStatus(false);
  // The server re-checks GitHub every 6 hours; this only re-reads its answer.
  updateTimer = setInterval(() => { if (!updateBusy) refreshUpdateStatus(false); }, 10 * 60 * 1000);
}

async function startUpdate() {
  const st = latestUpdateStatus;
  if (!st || !st.available || updateBusy) return;
  if (!st.can_apply) {
    showToast(st.blocked_reason || 'This install cannot update itself', 'error');
    return;
  }
  const password = await promptForValue({
    title: 'Update WhitePrivateDns',
    label: 'Current password',
    message: 'The service restarts and the panel is unavailable for about a minute. A backup is taken first and restored automatically if the update fails. Enter your current password to continue.',
    confirmText: 'UPDATE',
    mask: true
  });
  if (!password) return;
  let code = '';
  if (currentConfig?.auth?.totp_enabled) {
    code = await promptForValue({
      title: 'Two-factor code',
      label: 'Two-factor code',
      confirmText: 'UPDATE',
      inputMode: 'numeric',
      maxlength: 6
    });
    if (!code) return;
  }

  setUpdateBusy(true, 'Starting update…');
  try {
    const res = await fetch(api('/api/update/apply'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
      body: JSON.stringify({ version: st.latest, current_password: password, code })
    });
    if (!res.ok) {
      setUpdateBusy(false);
      showToast(await errorMessage(res, 'Update could not be started'), 'error');
      return;
    }
  } catch (e) {
    setUpdateBusy(false);
    showToast('Network error starting the update', 'error');
    return;
  }
  setUpdateBusy(true, 'Updating — the panel will reload when it is back');
  waitForUpdateRestart();
}

function setUpdateBusy(busy, text) {
  updateBusy = busy;
  const title = document.getElementById('update-banner-title');
  if (title) title.textContent = busy ? text : 'Update available';
  const now = document.getElementById('update-now-btn');
  const later = document.getElementById('update-later-btn');
  if (now) now.disabled = busy;
  if (later) later.disabled = busy;
}

// Poll until the daemon has gone down and come back. After a restart every session
// is gone, so the first answer is a 401 (or a 200 if the poll raced the restart);
// either way the page must reload to reach the login screen on the new version.
function waitForUpdateRestart() {
  const started = Date.now();
  let sawDown = false;
  const tick = async () => {
    let up = false;
    try {
      const res = await fetch(api('/api/update/status'), { headers: { 'Authorization': `Bearer ${authToken}` } });
      up = res.status > 0;
    } catch (e) {
      sawDown = true;
    }
    if (up && sawDown) {
      location.reload();
      return;
    }
    const elapsed = Date.now() - started;
    // Never went down: the updater failed before touching the service.
    if (!sawDown && elapsed > 120000) {
      setUpdateBusy(false);
      refreshUpdateStatus(false);
      showToast('The update did not start. Check: journalctl -u whiteprivatedns-update', 'error');
      return;
    }
    if (elapsed > 600000) {
      setUpdateBusy(false);
      showToast('The update is taking longer than expected. Check: journalctl -u whiteprivatedns-update', 'error');
      return;
    }
    setTimeout(tick, 3000);
  };
  setTimeout(tick, 3000);
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('update-now-btn')?.addEventListener('click', startUpdate);
  document.getElementById('update-later-btn')?.addEventListener('click', () => {
    try { sessionStorage.setItem('wpdns_update_dismissed', latestUpdateStatus?.latest || ''); } catch (e) { /* storage blocked */ }
    renderUpdateBanner(latestUpdateStatus);
  });
});
