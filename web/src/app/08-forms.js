// =======================================================
// v2.1 HIDDEN ADMIN PATH DISPLAY + REGENERATION
// =======================================================

function initAdminPathControls() {
  const display = document.getElementById('admin-path-display');
  const regenBtn = document.getElementById('regen-admin-path-btn');
  const warn = document.getElementById('admin-path-warn');

  window.renderAdminPath = function () {
    if (!display) return;
    const p = currentConfig?.server?.admin_path;
    display.textContent = p ? `/${p}/dash/` : '/…';
  };

  if (!regenBtn) return;
  regenBtn.addEventListener('click', () => {
    if (warn) warn.classList.remove('hidden');
    // The confirm dialog is the operator's explicit second step on top of the
    // server's {"confirm":true} gate: two independent confirmations for an
    // action that invalidates every session and bookmark at once.
    if (!window.confirm('Regenerate the hidden admin path? Every bookmark, integration and session under the old path stops working immediately, and you will be signed out.')) {
      return;
    }
    regenBtn.disabled = true;
    (async () => {
      try {
        const res = await fetch(api('/api/settings/regenerate-admin-path'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
          body: JSON.stringify({ confirm: true })
        });
        if (!res.ok) {
          showToast(await errorMessage(res, 'Failed to regenerate the admin path'), 'error');
          return;
        }
        const data = await res.json().catch(() => ({}));
        const newPath = (data && data.admin_path) || '';
        // The old token died with the session wipe; carry nothing into the new
        // namespace but the browser itself.
        localStorage.removeItem('whiteprivatedns_token');
        authToken = '';
        if (newPath) {
          showToast('Admin path regenerated. Sign in at the new address.', 'success');
          window.location.href = ADMIN_BASE === `/${newPath}`
            ? `${DASH_BASE}/`
            : `${window.location.origin}/${newPath}/dash/login`;
        } else {
          window.location.reload();
        }
      } catch (err) {
        showToast('Could not reach the server.', 'error');
      } finally {
        regenBtn.disabled = false;
      }
    })();
  });
}

function initEventListeners() {
  // Tabs Navigation (Sidebar & Mobile Bottom Bar)
  document.querySelectorAll('.sidebar-nav-item, .nav-tab, .mobile-nav-item').forEach(tab => {
    tab.onclick = (e) => {
      e.preventDefault();
      const target = tab.dataset.tab;
      if (target) switchTab(target);
    };
  });

  // Copy Server IP Sidebar Button
  const copyBtn = document.getElementById('copy-ip-btn');
  if (copyBtn) {
    copyBtn.onclick = () => {
      const ip = document.getElementById('header-public-ip')?.innerText?.trim();
      if (!ip || ip === '127.0.0.1') {
        showToast('Server public IP is not available yet', 'error');
        return;
      }
      copyText(ip, copyBtn);
    };
  }

  // Restart Core Engine Action
  const triggerRestart = async () => {
    const ok = await confirmAction({
      destructive: true,
      title: 'Restart the Core Engine?',
      hint: 'IN-FLIGHT QUERIES AND RELAYS ARE DROPPED',
      message: 'All policies are reloaded from the database. Listeners go down and come back up, so queries and relays in flight at that moment are lost and clients retry.',
      confirmText: 'RESTART ENGINE',
    });
    if (!ok) return;
    try {
      const res = await fetch(api('/api/server/restart'), {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (res.ok) {
        showToast('Core Engine restarted & rules reloaded!', 'success');
        updateStats();
      } else {
        // A restart that was refused used to look exactly like one that worked:
        // no toast either way.
        showToast(await errorMessage(res, 'Failed to restart engine'), 'error');
      }
    } catch (e) {
      showToast('Failed to restart engine', 'error');
    }
  };

  const restartBtn = document.getElementById('restart-engine-btn');
  if (restartBtn) restartBtn.onclick = triggerRestart;
  const mobileRestartBtn = document.getElementById('mobile-restart-btn');
  if (mobileRestartBtn) mobileRestartBtn.onclick = triggerRestart;

  // Diagnostics Suite Handlers
  const diagModal = document.getElementById('diagnostics-modal');
  const openDiag = () => {
    if (diagModal) {
      diagModal.classList.remove('hidden');
      runFullDiagnostics();
    }
  };

  const openDiagBtn = document.getElementById('open-diagnostics-btn');
  if (openDiagBtn) openDiagBtn.onclick = openDiag;
  const mobileOpenDiagBtn = document.getElementById('mobile-open-diag');
  if (mobileOpenDiagBtn) mobileOpenDiagBtn.onclick = openDiag;

  const closeDiagBtn = document.getElementById('close-diagnostics-btn');
  if (closeDiagBtn) closeDiagBtn.onclick = () => diagModal?.classList.add('hidden');

  const rerunDiagBtn = document.getElementById('rerun-diagnostics-btn');
  if (rerunDiagBtn) rerunDiagBtn.onclick = () => runFullDiagnostics();

  // Mobile Logout Button
  const mobileLogout = document.getElementById('mobile-logout-btn');
  if (mobileLogout) {
    mobileLogout.onclick = () => {
      signOut();
    };
  }

  // Add Custom Upstream
  const addUpstreamBtn = document.getElementById('add-upstream-btn');
  if (addUpstreamBtn) {
    addUpstreamBtn.onclick = async () => {
      const input = document.getElementById('new-upstream-input');
      const addr = input ? input.value.trim() : '';
      if (!addr) return;

      try {
        const res = await fetch(api('/api/upstreams/add'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
          body: JSON.stringify({ address: addr })
        });
        if (res.ok) {
          if (input) input.value = '';
          showToast('Upstream resolver added & tested!', 'success');
          updateStats();
        }
      } catch (e) {
        showToast('Failed to add upstream', 'error');
      }
    };
  }

  // Issue SSL Certificate
  //
  // bindLEButton wires one "Let's Encrypt" button to the shared ACME flow.
  // All three surfaces (panel, subscription, DoH/DoT) drive the same
  // single-flighted issuance; the purpose field tells the daemon which
  // record and listener the certificate belongs to. While a run is in
  // flight the progress bar polls GET /api/tls/acme/status every 500 ms and
  // renders stage + percentage; on completion the config is re-fetched so
  // every section (and the client cards) reflects the new domain, and on
  // failure the error toast carries the daemon's reason.
  window.bindLEButton = function (btn, domainInput, purpose, progressId) {
    if (!btn) return;
    const barWrap = document.getElementById(progressId);
    const bar = document.getElementById(`${progressId}-bar`);
    const barText = document.getElementById(`${progressId}-text`);

    function showProgress(state) {
      if (barWrap) barWrap.classList.remove('hidden');
      if (bar) bar.style.width = `${Math.max(0, Math.min(100, state.progress || 0))}%`;
      if (barText) {
        const stageLine = state.detail || state.stage || 'working…';
        barText.textContent = `${state.progress || 0}% — ${stageLine}`;
      }
    }
    function hideProgress() {
      if (barWrap) barWrap.classList.add('hidden');
    }

    async function pollUntilDone() {
      for (;;) {
        await new Promise(r => setTimeout(r, 500));
        let state = null;
        try {
          const res = await fetch(api('/api/tls/acme/status'), {
            headers: { 'Authorization': `Bearer ${authToken}` }
          });
          if (res.ok) state = await res.json();
        } catch (e) { /* transient poll failure: keep polling */ }
        if (!state || !state.running) return state;
        showProgress(state);
      }
    }

    btn.onclick = async () => {
      const dom = domainInput ? domainInput.value.trim() : '';
      const email = (document.getElementById('ssl-email-input')?.value || '').trim();
      if (!dom && purpose === 'panel') {
        showToast('Please enter a domain name', 'error');
        return;
      }
      btn.disabled = true;
      try {
        const res = await fetch(api('/api/tls/issue'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
          body: JSON.stringify({ domain: dom, email, purpose })
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          showToast((body && body.error) || 'The request was refused.', 'error');
          return;
        }
        if (body.issuing) {
          showToast(body.detail || 'Requesting the certificate…', 'info');
          const final = await pollUntilDone();
          if (final && final.error) {
            showToast('Issuance failed: ' + (final.error || final.last_detail || 'see the daemon log'), 'error');
          } else if (final && final.progress === 100) {
            showToast(body.detail && body.detail.includes('already on this server')
              ? body.detail : 'Certificate issued and applied.', 'success');
          } else {
            showToast(final && final.last_detail ? final.last_detail : 'Issuance finished — check the daemon log.', 'warning');
          }
        } else {
          // Sync apply (cert already on disk) or the clear gesture.
          showToast(body.detail || 'Applied.', 'success');
        }
        // Refresh everything the domain touches: the config (which carries
        // the records and origins), then the sections rendered from it.
        await loadConfig();
        if (typeof window.renderSubscriptionSettings === 'function') window.renderSubscriptionSettings();
        if (typeof loadClients === 'function') loadClients();
        const dotInput = document.getElementById('dot-domain-input');
        if (dotInput && currentConfig && currentConfig.tls) dotInput.value = currentConfig.tls.dot_domain || '';
      } catch (e) {
        showToast('Could not reach the server, so it is not known whether the request was accepted.', 'error');
      } finally {
        hideProgress();
        btn.disabled = false;
      }
    };
  };

  // The panel + DoH/DoT buttons live in app.js's own settings scope; the
  // subscription button binds itself from its module (twofa.js).
  window.bindLEButton(document.getElementById('issue-ssl-btn'), document.getElementById('ssl-domain-input'), 'panel', 'panel-le-progress');
  window.bindLEButton(document.getElementById('issue-dot-ssl-btn'), document.getElementById('dot-domain-input'), 'dot', 'dot-le-progress');
  const dotDomainInput = document.getElementById('dot-domain-input');
  if (dotDomainInput && currentConfig && currentConfig.tls) dotDomainInput.value = currentConfig.tls.dot_domain || '';

  // Quick Action Profiles
  document.getElementById('profile-gaming-btn')?.addEventListener('click', () => {
    ['preset-riot', 'preset-epic', 'preset-steam', 'preset-pubg', 'preset-cod', 'preset-supercell',
     'preset-ea', 'preset-blizzard', 'preset-ubisoft', 'preset-rockstar', 'preset-xbox', 'preset-playstation', 'preset-roblox',
     'preset-shooters-extra', 'preset-anime-gacha', 'preset-sports-racing', 'preset-coop-survival', 'preset-platforms-extra'].forEach(id => {
      setSwitch(id, true);
    });
    saveRules();
    showToast('Pro Gamer Profile (All 171 Games) Activated!', 'success');
  });

  document.getElementById('profile-streamer-btn')?.addEventListener('click', () => {
    ['preset-discord', 'preset-twitch', 'preset-kick', 'preset-spotify'].forEach(id => {
      setSwitch(id, true);
    });
    saveRules();
    showToast('Streamer & Media Profile Activated!', 'success');
  });

  document.getElementById('profile-dev-btn')?.addEventListener('click', () => {
    setSwitch('preset-dev403', true);
    saveRules();
    showToast('Developer 403 Profile Activated!', 'success');
  });

  document.getElementById('profile-privacy-btn')?.addEventListener('click', () => {
    setSwitch('preset-adblock', true);
    setSwitch('preset-familysafe', true);
    saveRules();
    showToast('AdBlock & Safe Profile Activated!', 'success');
  });

  // Preset switches
  const switches = [
    'preset-riot', 'preset-epic', 'preset-steam', 'preset-pubg', 'preset-cod', 'preset-supercell',
    'preset-discord', 'preset-ea', 'preset-blizzard', 'preset-ubisoft', 'preset-rockstar',
    'preset-xbox', 'preset-playstation', 'preset-roblox',
    'preset-shooters-extra', 'preset-anime-gacha', 'preset-sports-racing', 'preset-coop-survival', 'preset-platforms-extra',
    'preset-spotify', 'preset-twitch', 'preset-kick',
    'preset-dev403', 'preset-adblock', 'preset-familysafe',
    // Deliberately absent from every Quick Action profile above: "Pro Gamer" turning
    // this on with one click is the exact bill nobody expects. It is opt-in only.
    'preset-downloads'
  ];
  switches.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.onchange = () => saveRules();
    }
  });

  // Flush Cache
  const flushBtn = document.getElementById('flush-cache-btn');
  if (flushBtn) {
    flushBtn.onclick = async () => {
      try {
        await fetch(api('/api/cache/flush'), {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${authToken}` }
        });
        showToast('DNS cache flushed successfully!', 'success');
        updateStats();
      } catch (e) {
        showToast('Failed to flush cache', 'error');
      }
    };
  }

  // Run Benchmark. The server probes every upstream in the background and answers
  // 202 immediately, so this cannot claim "completed" — it reports that the run
  // started, then refreshes the stats twice as the probes land (they are bounded by
  // the upstream timeout, and they all run in parallel).
  const benchBtn = document.getElementById('run-benchmark-btn');
  if (benchBtn) {
    benchBtn.onclick = async () => {
      benchBtn.disabled = true;
      try {
        const res = await fetch(api('/api/benchmark'), {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (res.status === 409) {
          showToast('A benchmark is already running', 'info');
          return;
        }
        if (!res.ok) {
          showToast('Failed to start benchmark', 'error');
          return;
        }
        showToast('Benchmark started — upstream latencies refresh as probes land', 'info');
        setTimeout(updateStats, 1500);
        setTimeout(updateStats, 4000);
      } catch (e) {
        showToast('Failed to start benchmark', 'error');
      } finally {
        setTimeout(() => { benchBtn.disabled = false; }, 4000);
      }
    };
  }

  // Add Custom Proxied
  document.getElementById('add-proxied-btn')?.addEventListener('click', () => {
    const input = document.getElementById('new-proxied-input');
    const val = input ? input.value.trim().toLowerCase() : '';
    if (!val || !currentConfig) return;
    if (!currentConfig.rules.custom_proxied.includes(val)) {
      currentConfig.rules.custom_proxied.push(val);
      if (input) input.value = '';
      saveRules();
      renderConfig(currentConfig);
    }
  });

  // Add Custom Blocked
  document.getElementById('add-blocked-btn')?.addEventListener('click', () => {
    const input = document.getElementById('new-blocked-input');
    const val = input ? input.value.trim().toLowerCase() : '';
    if (!val || !currentConfig) return;
    if (!currentConfig.rules.custom_blocked.includes(val)) {
      currentConfig.rules.custom_blocked.push(val);
      if (input) input.value = '';
      saveRules();
      renderConfig(currentConfig);
    }
  });

  // Add DoH Token
  document.getElementById('add-token-btn')?.addEventListener('click', async () => {
    const input = document.getElementById('new-token-input');
    const val = input ? input.value.trim() : '';
    if (!val || !currentConfig) return;
    if (!currentConfig.access.doh_tokens.includes(val)) {
      currentConfig.access.doh_tokens.push(val);
      if (input) input.value = '';
      await fetch(api('/api/config/access'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify(currentConfig.access)
      });
      showToast('DoH Token added!', 'success');
      renderConfig(currentConfig);
    }
  });

  // Add Custom Record
  document.getElementById('add-custom-record-btn')?.addEventListener('click', () => {
    const dInput = document.getElementById('custom-record-domain');
    const ipInput = document.getElementById('custom-record-ip');
    const dom = dInput ? dInput.value.trim().toLowerCase() : '';
    const ip = ipInput ? ipInput.value.trim() : '';
    if (!dom || !ip || !currentConfig) return;
    if (!currentConfig.rules.custom_records) currentConfig.rules.custom_records = {};
    currentConfig.rules.custom_records[dom] = ip;
    if (dInput) dInput.value = '';
    if (ipInput) ipInput.value = '';
    saveRules();
    renderConfig(currentConfig);
  });

  // Event Delegation for List Removals
  document.onclick = async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;

    if (btn.classList.contains('remove-upstream')) {
      const addr = btn.dataset.addr;
      // Every other destructive control on this panel asks first; this one deleted a
      // resolver on a single tap, and it is rendered inside a list that re-sorts itself
      // by measured latency on every stats tick — so the row under your thumb is not
      // guaranteed to be the row that was there when you started reaching for it. The
      // dialog also gives the operator the one fact that decides the answer: with the
      // last upstream gone there is nothing left to race, and resolution stops.
      const ok = await confirmAction({
        destructive: true,
        title: 'Remove this upstream?',
        hint: 'THE RACER SET SHRINKS IMMEDIATELY',
        message: `${addr}\n\nQueries stop being raced against this resolver at once. If it is the last one configured, nothing remains to answer from and resolution fails until another is added.`,
        confirmText: 'REMOVE UPSTREAM',
      });
      if (!ok) return;
      try {
        await fetch(api('/api/upstreams/delete'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
          body: JSON.stringify({ address: addr })
        });
        showToast('Upstream removed', 'info');
        updateStats();
      } catch (err) {}
    } else if (btn.classList.contains('remove-proxied')) {
      const val = btn.dataset.val;
      if (currentConfig) {
        currentConfig.rules.custom_proxied = currentConfig.rules.custom_proxied.filter(x => x !== val);
        saveRules();
        renderConfig(currentConfig);
      }
    } else if (btn.classList.contains('remove-blocked')) {
      const val = btn.dataset.val;
      if (currentConfig) {
        currentConfig.rules.custom_blocked = currentConfig.rules.custom_blocked.filter(x => x !== val);
        saveRules();
        renderConfig(currentConfig);
      }
    } else if (btn.classList.contains('remove-token')) {
      const val = btn.dataset.val;
      if (currentConfig) {
        currentConfig.access.doh_tokens = currentConfig.access.doh_tokens.filter(x => x !== val);
        await fetch(api('/api/config/access'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
          body: JSON.stringify(currentConfig.access)
        });
        showToast('DoH Token removed', 'info');
        renderConfig(currentConfig);
      }
    } else if (btn.classList.contains('remove-record')) {
      const dom = btn.dataset.dom;
      if (currentConfig && currentConfig.rules.custom_records) {
        delete currentConfig.rules.custom_records[dom];
        saveRules();
        renderConfig(currentConfig);
      }
    }
  };

  // Live Stream Controls
  //
  // The filter and the search box had no listeners at all: both were read inside the append
  // path, so they applied to arriving queries and never to the rows already on screen. These
  // two lines are the whole of the fix on the control side — renderQueryStream redraws from
  // the buffer, so a change now takes effect on the last STREAM_BUFFER_MAX queries at once.
  document.getElementById('stream-filter')?.addEventListener('change', renderQueryStream);
  document.getElementById('stream-search')?.addEventListener('input', renderQueryStream);

  // Delegated on the table body, because the button lives inside markup that is replaced on
  // every keystroke — a listener bound to the button itself would be discarded by the next
  // render.
  document.getElementById('stream-tbody')?.addEventListener('click', (e) => {
    if (!e.target.closest('.clear-stream-filter-btn')) return;
    const filterEl = document.getElementById('stream-filter');
    const searchEl = document.getElementById('stream-search');
    if (filterEl) filterEl.value = 'ALL';
    if (searchEl) searchEl.value = '';
    renderQueryStream();
  });

  const pauseBtn = document.getElementById('stream-pause-btn');
  if (pauseBtn) {
    pauseBtn.onclick = (e) => {
      isStreamPaused = !isStreamPaused;
      const btn = e.currentTarget;
      btn.innerHTML = isStreamPaused
        ? '<i data-feather="play" class="w-3.5 h-3.5"></i> <span>Resume</span>'
        : '<i data-feather="pause" class="w-3.5 h-3.5"></i> <span>Pause</span>';
      safeFeatherReplace();
    };
  }

  const clearBtn = document.getElementById('stream-clear-btn');
  if (clearBtn) {
    clearBtn.onclick = () => {
      // Empty the buffer and re-render rather than wiping the tbody. Clearing the markup left
      // a blank table with no placeholder and no way back to one — the old placeholder check
      // required exactly one row containing 'Listening', so it never returned, and a cleared
      // stream was indistinguishable from a dead one until the next query arrived.
      streamBuffer = [];
      renderQueryStream();
    };
  }
}
