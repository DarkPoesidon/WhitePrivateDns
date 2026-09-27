// =======================================================
// CONFIG & POLICIES SYNC
// =======================================================
// loadConfig fetches the account probe and the configuration, and renders the Settings and
// Policies panels from them.
//
// Both fetches used to be checked for 401 and nothing else, and both bodies were parsed with
// res.json() regardless of the status. That failed in two directions on any other error status.
//
// The /api/config half was the damaging one. A 500 returns a JSON error body, so `currentConfig`
// became {error: "…"} — truthy, which is all `saveRules` guards on — and renderConfig then read
// cfg.rules?.enable_riot off it and got undefined for every preset, painting the whole policy
// grid as OFF. Press Save on that screen and getSwitch reads those unchecked boxes and writes
// them back: every game preset disabled on the server because one fetch returned 500. The
// operator sees a plausible screen and one click destroys the configuration.
//
// The /api/auth/me half failed quietly instead. meData.password_weak is undefined in an error
// body, so `weak` came out false and the forced credential-change modal was skipped — the weak
// password gate opening because its probe broke, which is the wrong direction for a gate.
//
// So: neither body is parsed unless the response is ok, and nothing is rendered from a config
// that did not arrive. Failing with the old screen still on display and a toast that says why is
// strictly better than replacing it with a confident, wrong one.
async function loadConfig() {
  if (!authToken) {
    showLoginModal();
    return false;
  }
  try {
    const res = await fetch(api('/api/auth/me'), {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    if (res.status === 401) {
      showLoginModal();
      return false;
    }
    if (!res.ok) {
      showToast(await errorMessage(res, 'Could not read the account state.'), 'error');
      return false;
    }

    const meData = await res.json();
    const weak = !!(meData.password_weak || meData.is_default_password);

    const cfgRes = await fetch(api('/api/config'), {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (cfgRes.status === 401) {
      showLoginModal();
      return false;
    }
    if (!cfgRes.ok) {
      showToast(await errorMessage(cfgRes, 'Could not load the configuration.'), 'error');
      return false;
    }
    currentConfig = await cfgRes.json();
    renderConfig(currentConfig);
    // Raised after the config lands so the modal can prefill the real username
    // rather than the markup's placeholder.
    if (weak) showChangePwdModal();
    return true;
  } catch (e) {
    console.error('Failed to load config:', e);
    showToast('Could not reach the server to load the configuration.', 'error');
    return false;
  }
}

let isAPIKeyMasked = true;

function renderConfig(cfg) {
  if (!cfg) return;
  currentConfig = cfg;

  // Normalize config structures to prevent runtime crashes on missing fields
  if (!cfg.rules || typeof cfg.rules !== 'object') cfg.rules = {};
  ['custom_proxied', 'custom_blocked', 'custom_direct'].forEach(k => {
    if (!Array.isArray(cfg.rules[k])) cfg.rules[k] = [];
  });
  if (!cfg.rules.custom_records || typeof cfg.rules.custom_records !== 'object' || Array.isArray(cfg.rules.custom_records)) {
    cfg.rules.custom_records = {};
  }
  if (!cfg.access || typeof cfg.access !== 'object') cfg.access = {};
  if (!Array.isArray(cfg.access.doh_tokens)) cfg.access.doh_tokens = [];

  // The subscription record may be absent on a pre-v2.1 config response; an
  // empty object keeps the renderers below total.
  if (!cfg.subscription || typeof cfg.subscription !== 'object') cfg.subscription = {};

  // The two v2.1 panels read straight from the config they were handed.
  if (typeof window.renderSubscriptionSettings === 'function') window.renderSubscriptionSettings();
  if (typeof window.renderAdminPath === 'function') window.renderAdminPath();
  if (typeof window.renderTwoFactor === 'function') window.renderTwoFactor();
  if (typeof window.renderLdap === 'function') window.renderLdap();

  // Version badge (single source of truth: version.json embedded in the binary).
  //
  // The mobile header deliberately gets the version *without* the commit hash. The two strings
  // differ by eleven characters — "v1.5.0-beta" against "v1.5.0-beta [3585f9bf]" — and at 9px
  // mono in a 56px sticky header that is the difference between a badge sitting beside the
  // wordmark and one that wraps, taking the brand line out through the top border. The hash
  // still reaches both places it is actually used from: the desktop sidebar badge, which has
  // Version badge displays: header and mobile show only version (e.g. "v2.0.0-beta"),
  // footer shows version + hash for bug reports (e.g. "v2.0.0-beta [3585f9bf]").
  if (cfg.version && cfg.version.display) {
    const versionOnly = cfg.version.display;
    const versionWithHash = `${cfg.version.display} [${cfg.version.hash}]`;

    const headerBadge = document.getElementById('app-version-badge');
    if (headerBadge) headerBadge.innerText = versionOnly;

    const footer = document.getElementById('app-version-footer');
    if (footer) footer.innerText = versionWithHash;

    const mobileBadge = document.getElementById('app-version-badge-mobile');
    if (mobileBadge) {
      mobileBadge.innerText = versionOnly;
      mobileBadge.title = versionWithHash;
    }
  }

  // Header & guide public IP
  const pubIP = cfg.server.public_ip || '127.0.0.1';
  const relayIPEl = document.getElementById('relay-public-ip');
  if (relayIPEl && document.activeElement !== relayIPEl) relayIPEl.value = pubIP;
  const publicDoHEl = document.getElementById('public-doh-url');
  if (publicDoHEl && document.activeElement !== publicDoHEl) publicDoHEl.value = cfg.public_doh_url || '';
  const headerIPEl = document.getElementById('header-public-ip');
  if (headerIPEl) headerIPEl.innerText = pubIP;

  // Administrator Credentials card. The password verifier is deliberately not in
  // this payload any more, so the username is all there is to show.
  const adminNameEl = document.getElementById('current-admin-name');
  if (adminNameEl) adminNameEl.innerText = cfg.server.admin_username || 'admin';
  const guideWinEl = document.getElementById('guide-win-ip');
  if (guideWinEl) guideWinEl.innerText = pubIP;
  const guideConsoleEl = document.getElementById('guide-console-ip');
  if (guideConsoleEl) guideConsoleEl.innerText = pubIP;
  const guideDohEl = document.getElementById('guide-doh-url');
  if (guideDohEl) {
    // The daemon's own URL builder: domain over IP, https scheme, the DoH
    // listener's own port. The old line guessed http://IP:web_port and got
    // the scheme, the port and the host wrong in one string.
    const doh = (typeof cfg.doh_url === 'string' && cfg.doh_url)
      ? cfg.doh_url
      : `http://${pubIP}:${(cfg.dns && cfg.dns.doh_port) || 8443}/dns-query`;
    guideDohEl.innerText = doh;
    guideDohEl.title = doh;
  }

  // The guide's DoT hostname prefers the dedicated DoH/DoT domain when one
  // is set — it is the only name the 853 certificate is guaranteed to cover.
  const dotHost = (cfg.tls && cfg.tls.dot_domain) || (cfg.tls && cfg.tls.domain) || '';
  if (dotHost) {
    const guideDotEl = document.getElementById('guide-dot-hostname');
    if (guideDotEl) guideDotEl.innerText = dotHost;
  }
  if (cfg.tls && cfg.tls.domain) {
    const sslDomInput = document.getElementById('ssl-domain-input');
    if (sslDomInput) sslDomInput.value = cfg.tls.domain;
  }
  if (cfg.tls) {
    const dotDomainInput = document.getElementById('dot-domain-input');
    if (dotDomainInput) dotDomainInput.value = cfg.tls.dot_domain || '';
  }

  // The registration contact is prefilled for the same reason the domain is, and not
  // only for convenience: /api/tls/issue stores both fields from one request, so an
  // operator who fixes a typo in the domain while this box sits empty sends an empty
  // email, and the stored contact — the address Let's Encrypt sends expiry warnings to
  // — is overwritten with nothing.
  if (cfg.tls && cfg.tls.email) {
    const sslEmailInput = document.getElementById('ssl-email-input');
    if (sslEmailInput) sslEmailInput.value = cfg.tls.email;
  }

  // Render API Key & Bind
  renderAPIKeyDisplay();

  const apiBind = (cfg.server && cfg.server.api_bind) ? cfg.server.api_bind : '127.0.0.1';
  // Phase D: reflect the live idle window (the accessor clamps; 0 here means
  // the default 15 the server applies).
  const idleEl = document.getElementById('session-idle-minutes');
  if (idleEl) {
    const live = Number(cfg.server?.session_idle_minutes);
    idleEl.value = Number.isFinite(live) && live > 0 ? live : 15;
  }
  const apiBindBadge = document.getElementById('api-bind-badge');
  const togglePublicAPI = document.getElementById('toggle-public-api');

  if (apiBindBadge) {
    if (apiBind === '0.0.0.0') {
      apiBindBadge.innerText = '0.0.0.0 (Public HTTPS)';
      apiBindBadge.className = 'px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30';
    } else {
      apiBindBadge.innerText = '127.0.0.1 (Localhost Only)';
      apiBindBadge.className = 'px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
    }
  }
  if (togglePublicAPI) {
    togglePublicAPI.checked = (apiBind === '0.0.0.0');
  }

  updateCodeSnippets(pubIP, cfg.server?.api_key || 'wpdns_live_your_key_here');

  // Preset Switches
  setSwitch('preset-riot', cfg.rules.enable_riot);
  setSwitch('preset-epic', cfg.rules.enable_epic);
  setSwitch('preset-steam', cfg.rules.enable_steam);
  setSwitch('preset-pubg', cfg.rules.enable_pubg);
  setSwitch('preset-cod', cfg.rules.enable_call_of_duty);
  setSwitch('preset-supercell', cfg.rules.enable_supercell);
  setSwitch('preset-discord', cfg.rules.enable_discord);
  setSwitch('preset-ea', cfg.rules.enable_ea);
  setSwitch('preset-blizzard', cfg.rules.enable_blizzard);
  setSwitch('preset-ubisoft', cfg.rules.enable_ubisoft);
  setSwitch('preset-rockstar', cfg.rules.enable_rockstar);
  setSwitch('preset-xbox', cfg.rules.enable_xbox);
  setSwitch('preset-playstation', cfg.rules.enable_playstation);
  setSwitch('preset-roblox', cfg.rules.enable_roblox);
  setSwitch('preset-shooters-extra', cfg.rules.enable_shooters_extra);
  setSwitch('preset-anime-gacha', cfg.rules.enable_anime_gacha);
  setSwitch('preset-sports-racing', cfg.rules.enable_sports_racing);
  setSwitch('preset-coop-survival', cfg.rules.enable_coop_survival);
  setSwitch('preset-platforms-extra', cfg.rules.enable_platforms_extra);
  // One switch drives both music presets: the card is labelled "Spotify &
  // SoundCloud" and its copy promises SoundCloud CDN streams, but only
  // enable_spotify was ever sent, so SoundCloud could not be toggled from the
  // dashboard at all. Shown as on when either category is on.
  setSwitch('preset-spotify', cfg.rules.enable_spotify || cfg.rules.enable_soundcloud);
  setSwitch('preset-twitch', cfg.rules.enable_twitch);
  setSwitch('preset-kick', cfg.rules.enable_kick);
  setSwitch('preset-google', cfg.rules.enable_google);
  setSwitch('preset-ai', cfg.rules.enable_ai);
  setSwitch('preset-social', cfg.rules.enable_social);
  setSwitch('preset-dev403', cfg.rules.enable_dev403);
  setSwitch('preset-adblock', cfg.rules.enable_adblock);
  setSwitch('preset-familysafe', cfg.rules.enable_familysafe);
  // Off by default, unlike every switch above it. The server sends the value, so a
  // missing key means an older config.json that predates the category — treat that
  // as off rather than letting `undefined` read as "leave it wherever the DOM was",
  // which on a re-render after a save is whatever the operator last clicked.
  setSwitch('preset-downloads', cfg.rules.enable_downloads === true);

  // Render Custom Rules Lists (with safe optional chaining)
  renderList('custom-proxied-list', cfg.rules?.custom_proxied || [], 'remove-proxied');
  renderList('custom-blocked-list', cfg.rules?.custom_blocked || [], 'remove-blocked');
  renderList('tokens-list', cfg.access?.doh_tokens || [], 'remove-token');
  renderCustomRecords(cfg.rules?.custom_records || {});
}

function setSwitch(id, val) {
  const el = document.getElementById(id);
  if (el) el.checked = !!val;
}

function getSwitch(id) {
  const el = document.getElementById(id);
  return el ? el.checked : false;
}

function renderList(containerId, items, removeClass) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  if (!items || items.length === 0) {
    container.innerHTML = '<div class="text-slate-500 text-xs py-1">No custom entries yet</div>';
    return;
  }
  items.forEach(item => {
    const row = document.createElement('div');
    row.className = 'flex items-center justify-between py-1.5 px-3 rounded-lg bg-slate-950/60 border border-slate-800 text-xs';
    // The list entries are operator-supplied strings that arrive back from the
    // settings API, and the row is built with innerHTML — so they are escaped like
    // every other stored value the dashboard renders. data-val survives escaping
    // unchanged: the parser decodes the entities before dataset reads it.
    row.innerHTML = `
      <span class="font-mono text-cyan-300">${escapeHTML(item)}</span>
      <button class="${removeClass} inline-flex items-center justify-center w-6 h-6 shrink-0 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition" data-val="${escapeHTML(item)}" aria-label="Remove ${escapeHTML(item)}">
        <i data-feather="x" class="w-3.5 h-3.5"></i>
      </button>
    `;
    container.appendChild(row);
  });
  safeFeatherReplace();
}

function renderCustomRecords(records) {
  const container = document.getElementById('custom-records-list');
  if (!container) return;
  container.innerHTML = '';
  if (!records || Object.keys(records).length === 0) {
    container.innerHTML = '<div class="text-slate-500 text-xs py-1">No static records yet</div>';
    return;
  }
  for (const [dom, ip] of Object.entries(records)) {
    const row = document.createElement('div');
    row.className = 'flex items-center justify-between py-1.5 px-3 rounded-lg bg-slate-950/60 border border-slate-800 text-xs';
    row.innerHTML = `
      <span class="font-mono text-emerald-300">${escapeHTML(dom)} &rarr; ${escapeHTML(ip)}</span>
      <button class="remove-record inline-flex items-center justify-center w-6 h-6 shrink-0 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition" data-dom="${escapeHTML(dom)}" aria-label="Remove record ${escapeHTML(dom)}">
        <i data-feather="x" class="w-3.5 h-3.5"></i>
      </button>
    `;
    container.appendChild(row);
  }
  safeFeatherReplace();
}
