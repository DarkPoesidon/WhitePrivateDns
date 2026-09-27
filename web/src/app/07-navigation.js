// =======================================================
// EVENT LISTENERS & SPA ROUTING
// =======================================================
const tabRoutes = {
  'dashboard': '/home',
  'clients': '/clients',
  'policy': '/rules',
  'stream': '/logs',
  'api': '/api',
  'rules': '/settings',
  'connect': '/guide'
};

const routeTabs = {
  '/home': 'dashboard',
  '/dashboard': 'dashboard',
  '/panel': 'dashboard',
  '/login': 'dashboard',
  '/clients': 'clients',
  '/rules': 'policy',
  '/policy': 'policy',
  '/logs': 'stream',
  '/stream': 'stream',
  '/api': 'api',
  '/settings': 'rules',
  '/guide': 'connect',
  '/connect': 'connect'
};

function switchTab(target, updateUrl = true) {
  activeDashTab = target;
  document.querySelectorAll('.sidebar-nav-item, .nav-tab').forEach(t => {
    if (t.dataset.tab === target) {
      t.classList.add('active');
    } else {
      t.classList.remove('active');
    }
  });

  document.querySelectorAll('.mobile-nav-item').forEach(t => {
    if (t.dataset.tab === target) {
      t.classList.add('active', 'text-cyan-400');
      t.classList.remove('text-slate-400');
    } else {
      t.classList.remove('active', 'text-cyan-400');
      t.classList.add('text-slate-400');
    }
  });

  document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
  const targetEl = document.getElementById(`tab-${target}`);
  if (targetEl) {
    targetEl.classList.remove('hidden');
    if (target === 'clients') {
      loadClients();
    }
    // Returning to the Logs view repaints the stream from the buffer: the
    // per-query DOM work was skipped while another tab was showing (see
    // pushStreamQuery), so this is where the queued history becomes rows.
    if (target === 'stream') {
      renderQueryStream();
    }
    if (target === 'dashboard') {
      renderOverviewQueries();
    }
  }

  if (updateUrl && tabRoutes[target]) {
    // The path pushed to history lives below the admin namespace, so the URL a
    // bookmark or a reload comes back with is one the server actually serves
    // (BuildHandler strips <admin-path>/dash before matching it here).
    const newPath = DASH_BASE + tabRoutes[target];
    if (window.location.pathname !== newPath) {
      window.history.pushState({ tab: target }, '', newPath);
    }
  }

  safeFeatherReplace();
}

function handleRouteFromURL() {
  // The admin prefix and the /dash mount point are stripped before the table is
  // consulted, so the same keys work whatever path the install was given. A path
  // that matches nothing falls back to the dashboard, which is the pre-v2.1
  // behaviour for an unknown route and still the least surprising one.
  const stripped = window.location.pathname.toLowerCase().replace(/\/$/, '');
  const withoutBase = ADMIN_BASE && stripped.toLowerCase().startsWith(ADMIN_BASE + '/dash')
    ? stripped.slice((ADMIN_BASE + '/dash').length) || '/'
    : stripped;
  const path = withoutBase || '/home';
  const targetTab = routeTabs[path] || 'dashboard';
  switchTab(targetTab, false);
}

window.addEventListener('popstate', () => {
  handleRouteFromURL();
});

function renderAPIKeyDisplay() {
  const apiKeyDisp = document.getElementById('api-key-display');
  if (!apiKeyDisp || !currentConfig?.server?.api_key) return;
  const rawKey = currentConfig.server.api_key;
  if (isAPIKeyMasked) {
    apiKeyDisp.innerText = '•'.repeat(36);
  } else {
    apiKeyDisp.innerText = rawKey;
  }
}

function updateCodeSnippets(pubIP, apiKey) {
  // v2.1.0 (B-02/B-18 remediation): the snippets are generated from the live
  // configuration — real web port and scheme, not hardcoded 8080/http — and
  // they speak the API's actual contract: the create field is `days`
  // (`expires_days` was never read, silently producing lifetime accounts) and
  // the response is the bare client view, whose `token` is what a subscriber's
  // register link is built from. No `success`/`data.register_url` wrapper —
  // the old snippets treated a successful provisioning as a failure.
  const tls = currentConfig?.tls || {};
  const scheme = tls.panel_https ? 'https' : 'http';
  const port = currentConfig?.server?.web_port || window.location.port || 8080;
  // Domain first: with a configured domain the API is addressed by the name the
  // certificate covers, never the bare IP — an integration copy-pasted from
  // here has to keep working the day the server moves. The IP remains the
  // no-domain fallback, matching dashLoginURL on the Go side.
  const host = (tls.domain && String(tls.domain).trim()) || pubIP;
  const isDefaultPort = (scheme === 'https' && Number(port) === 443) || (scheme === 'http' && Number(port) === 80);
  const origin = `${scheme}://${host}${isDefaultPort ? '' : ':' + port}`;
  // v2 is the contract new integrations are documented against; v1 keeps
  // working behind a Deprecation header but the copy-paste examples a
  // reseller starts from should not begin life deprecated.
  const apiBase = `${origin}${ADMIN_BASE}/api/v2`;

  const curlEl = document.getElementById('snippet-curl');
  if (curlEl) {
    curlEl.innerText = `# 1. Check Engine Health
curl -s "${apiBase}/status" \\
  -H "X-API-Key: ${apiKey}"

# 2. Create User Account (30 Days). v2 answers 201 with the client object;
#    unknown fields are refused (a typo errors instead of being dropped).
curl -s -X POST "${apiBase}/clients" \\
  -H "X-API-Key: ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"display_name":"Gamer-VIP","validity_days":30}'`;
  }

  const pyEl = document.getElementById('snippet-python');
  if (pyEl) {
    pyEl.innerText = `import requests

API_URL = "${apiBase}"
ORIGIN = "${origin}"
HEADERS = {"X-API-Key": "${apiKey}"}

# Create subscriber account on plan purchase
def create_smartdns_user(username, days=30):
    res = requests.post(f"{API_URL}/clients", headers=HEADERS, json={
        "display_name": username,
        "validity_days": days
    })
    res.raise_for_status()          # 201 with the client object
    client = res.json()
    return f"{ORIGIN}/ip/{client['token']}"`;
  }

  const nodeEl = document.getElementById('snippet-nodejs');
  if (nodeEl) {
    nodeEl.innerText = `const axios = require('axios');

const ORIGIN = '${origin}';
const client = axios.create({
  baseURL: '${apiBase}',
  headers: { 'X-API-Key': '${apiKey}' }
});

// Example Telegram Bot Handler
async function onBuySubscription(ctx, username) {
  // 201 Created answers the client object; its token builds the 1-click
  // register link. ORIGIN is the const above — this runs in Node, where
  // window.location does not exist.
  const { data, status } = await client.post('/clients', { display_name: username, validity_days: 30 });
  if (status === 201) {
    ctx.reply(\`SmartDNS Created! Register IP: \${ORIGIN}/ip/\${data.token}\`);
  }
}`;
  }
}
function initAPIEvents() {
  // Show / Hide Key Toggle
  const toggleKeyBtn = document.getElementById('toggle-api-key-visibility');
  if (toggleKeyBtn) {
    toggleKeyBtn.onclick = () => {
      isAPIKeyMasked = !isAPIKeyMasked;
      renderAPIKeyDisplay();
      toggleKeyBtn.innerHTML = isAPIKeyMasked ? '<i data-feather="eye" class="w-4 h-4"></i>' : '<i data-feather="eye-off" class="w-4 h-4 text-cyan-400"></i>';
      safeFeatherReplace();
    };
  }

  // Copy API Key Button
  const copyKeyBtn = document.getElementById('copy-api-key-btn');
  if (copyKeyBtn) {
    copyKeyBtn.onclick = () => {
      if (currentConfig?.server?.api_key) {
        copyText(currentConfig.server.api_key, copyKeyBtn);
      }
    };
  }

  // Regenerate Key Button
  const regenKeyBtn = document.getElementById('regenerate-api-key-btn');
  if (regenKeyBtn) {
    regenKeyBtn.onclick = async () => {
      const ok = await confirmAction({
        destructive: true,
        title: 'Regenerate Master API Key?',
        hint: 'EVERY INTEGRATION BREAKS IMMEDIATELY',
        message: 'The current key stops working the moment the new one is issued. Every external bot, billing hook and script still holding the old key will start getting 401s until you update it by hand.',
        confirmText: 'REGENERATE KEY',
      });
      if (!ok) return;
      // Rotation is a credential change, so the current password is asked for
      // unconditionally — a hijacked session must not be able to rotate the
      // master key, whether or not 2FA is on.
      const currentPassword = await promptForValue({
        title: 'Current Password',
        message: 'Confirm your current admin password to authorise the rotation.',
        label: 'CURRENT PASSWORD',
        placeholder: 'current password',
        mask: true,
      });
      if (!currentPassword) return;
      // When 2FA is on the rotation also requires a current code (B-03
      // remediation): the server reads both from this JSON body.
      let totpCode = '';
      if (currentConfig?.auth?.totp_enabled) {
        totpCode = await promptForValue({
          title: 'Two-Factor Code',
          message: 'Enter the 6-digit code from your authenticator app to authorise the rotation.',
          placeholder: '6-digit code',
        });
        if (!totpCode) return;
      }
      try {
        const res = await fetch(api('/api/settings/regenerate-api-key'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          body: JSON.stringify({ regenerate: true, current_password: currentPassword, code: (totpCode || '').trim() })
        });
        if (res.ok) {
          const data = await res.json();
          const newKey = data.api_key || data.data?.api_key;
          if (newKey) {
            if (!currentConfig) currentConfig = { server: {} };
            if (!currentConfig.server) currentConfig.server = {};
            currentConfig.server.api_key = newKey;
            isAPIKeyMasked = false; // unmask on fresh regeneration so user can see it
            renderAPIKeyDisplay();
            updateCodeSnippets(currentConfig.server.public_ip || '127.0.0.1', newKey);
            showToast('Master API Key regenerated successfully!', 'success');
          } else {
            showToast('Failed to regenerate API key', 'error');
          }
        } else {
          showToast(await errorMessage(res, 'Failed to regenerate API key'), 'error');
        }
      } catch (err) {
        showToast('Error regenerating API key', 'error');
      }
    };
  }

  // Public API Toggle (0.0.0.0 bind)
  const togglePublic = document.getElementById('toggle-public-api');
  if (togglePublic) {
    togglePublic.onchange = async () => {
      const willBePublic = togglePublic.checked;

      // If attempting to expose publicly without HTTPS domain
      if (willBePublic && (!currentConfig?.tls?.domain || !currentConfig.tls.domain.trim())) {
        togglePublic.checked = false;
        showToast('Cannot expose API to 0.0.0.0: Public API requires an active custom domain and HTTPS configured in Settings to protect credentials.', 'error');
        return;
      }

      const targetBind = willBePublic ? '0.0.0.0' : '127.0.0.1';
      try {
        // /api/settings owns api_bind. This used to post to /api/config/server,
        // which has never read the field — the toggle reported success while
        // nothing was persisted, and reverted on the next page load.
        const res = await fetch(api('/api/settings'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          body: JSON.stringify({ api_bind: targetBind })
        });

        if (!res.ok) {
          togglePublic.checked = !willBePublic;
          showToast(await errorMessage(res, 'Failed to update API bind configuration'), 'error');
          return;
        }

        const data = await res.json().catch(() => null);
        if (currentConfig?.server) {
          currentConfig.server.api_bind = (data && data.api_bind) || targetBind;
        }
        renderConfig(currentConfig);
        showToast(willBePublic
          ? 'Public REST API enabled — external callers with a valid key are now accepted (0.0.0.0)'
          : 'REST API restricted to localhost (127.0.0.1)', 'success');
      } catch (err) {
        togglePublic.checked = !willBePublic;
        showToast('Error communicating with server', 'error');
      }
    };
  }

  // Dashboard session idle window (Phase D): load + save through /api/settings.
  const relayInput = document.getElementById('relay-public-ip');
  const relaySave = document.getElementById('relay-public-ip-save');
  if (relayInput && relaySave) {
    relaySave.addEventListener('click', async () => {
      const address = relayInput.value.trim();
      relaySave.disabled = true;
      try {
        const res = await fetch(api('/api/settings'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
          body: JSON.stringify({ public_ip: address })
        });
        if (!res.ok) {
          showToast(await errorMessage(res, 'Could not change the relay address'), 'error');
          return;
        }
        const data = await res.json();
        if (currentConfig?.server && data?.public_ip) {
          currentConfig.server.public_ip = data.public_ip;
          renderConfig(currentConfig);
        }
        showToast('Relay address applied to new DNS answers', 'success');
      } catch (err) {
        showToast('Could not reach the server', 'error');
      } finally {
        relaySave.disabled = false;
      }
    });
  }

  const publicDoHInput = document.getElementById('public-doh-url');
  const publicDoHSave = document.getElementById('public-doh-url-save');
  if (publicDoHInput && publicDoHSave) {
    publicDoHSave.addEventListener('click', async () => {
      publicDoHSave.disabled = true;
      try {
        const res = await fetch(api('/api/settings/doh-url'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
          body: JSON.stringify({ url: publicDoHInput.value.trim() })
        });
        if (!res.ok) {
          showToast(await errorMessage(res, 'Could not save the DoH URL'), 'error');
          return;
        }
        const data = await res.json();
        if (currentConfig) {
          currentConfig.public_doh_url = data.public_doh_url;
          currentConfig.doh_url = data.doh_url;
          renderConfig(currentConfig);
        }
        showToast('Public DoH URL saved', 'success');
      } catch (err) {
        showToast('Could not reach the server', 'error');
      } finally {
        publicDoHSave.disabled = false;
      }
    });
  }

  // Dashboard session idle window (Phase D): load + save through /api/settings.
  const idleInput = document.getElementById('session-idle-minutes');
  const idleSave = document.getElementById('session-idle-save');
  if (idleInput && idleSave) {
    idleSave.addEventListener('click', async () => {
      const raw = Number(idleInput.value);
      if (!Number.isFinite(raw) || raw < 5 || raw > 1440) {
        showToast('Enter a value between 5 and 1440 minutes', 'error');
        return;
      }
      idleSave.disabled = true;
      try {
        const res = await fetch(api('/api/settings'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          body: JSON.stringify({ session_idle_minutes: Math.round(raw) })
        });
        if (!res.ok) {
          showToast(await errorMessage(res, 'Failed to save the session timeout'), 'error');
          return;
        }
        const data = await res.json().catch(() => null);
        if (currentConfig?.server && data?.server) {
          currentConfig.server.session_idle_minutes = data.server.session_idle_minutes;
        }
        if (data?.server?.session_idle_minutes) {
          idleInput.value = data.server.session_idle_minutes;
        }
        showToast('Dashboard session timeout applied', 'success');
      } catch (err) {
        showToast('Error communicating with server', 'error');
      } finally {
        idleSave.disabled = false;
      }
    });
  }

  // Snippet Tabs Switching
  document.querySelectorAll('.api-snippet-tab').forEach(tab => {
    tab.onclick = () => {
      const snip = tab.dataset.snippet;
      document.querySelectorAll('.api-snippet-tab').forEach(t => {
        t.className = 'api-snippet-tab px-3 py-1.5 rounded-lg text-xs font-bold font-heading bg-slate-900 text-slate-400 hover:text-white';
      });
      tab.className = 'api-snippet-tab px-3 py-1.5 rounded-lg text-xs font-bold font-heading bg-cyan-500/20 text-cyan-300 border border-cyan-500/30';

      document.querySelectorAll('.api-snippet-content').forEach(c => c.classList.add('hidden'));
      document.getElementById(`snippet-${snip}`)?.classList.remove('hidden');
    };
  });

  window.initSubscriptionSettings?.();
  initAdminPathControls();
  // The 2FA/LDAP panel lives in its own ES module (js/modules/twofa.js);
  // it registers these two hooks on window when the module executes.
  window.initTwoFactorControls?.();
  window.initLdapControls?.();
}
