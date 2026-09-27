// =======================================================
// CLIENTS & IP WHITELIST MANAGEMENT (Shelter/Shecan Style)
// =======================================================
let clientsDataCache = null;

// clientsPanelMessage paints a full-width notice into the client grid, in the same shape as the
// two empty states renderClientsList already draws. `body` is markup the caller has escaped —
// there is one caller that interpolates a server string and it wraps it in escapeHTML.
//
// The wrapper carries .clients-placeholder, the same convention the query stream uses for its
// empty row: it is how loadClients tells "the grid is showing a notice" apart from "the grid is
// showing subscriber cards", without inspecting the copy.
function clientsPanelMessage(icon, title, body, titleClass = 'text-slate-300') {
  const listContainer = document.getElementById('clients-list');
  if (!listContainer) return;
  listContainer.innerHTML = `
    <div class="clients-placeholder col-span-1 md:col-span-2 glass-panel p-8 text-center text-slate-400 border border-slate-800">
      <i data-feather="${icon}" class="w-8 h-8 mx-auto text-slate-600 mb-2"></i>
      <div class="font-bold ${titleClass} font-heading">${title}</div>
      <p class="text-xs text-slate-500 mt-1">${body}</p>
    </div>
  `;
  safeFeatherReplace();
}

// loadClients fetches the subscriber list and the access-control mode.
//
// A failure used to be a bare `return` and a console line, and #clients-list used to ship as an
// empty grid holding nothing but an HTML comment — so a 500 or a dropped connection on the first
// load left the operator looking at blank space. Blank space in a list is read as "there is
// nothing here", which for this panel means "my subscribers are gone": the one reading an operator
// would act on, and the one that was never true. The markup now ships a loading notice and every
// failure path below replaces it with what actually happened.
//
// 401 is separated out because it is not a failure of this endpoint, it is an expired session,
// and the answer to it is the login gate rather than an error inside a panel behind it.
async function loadClients() {
  if (!authToken) return;

  // Only when the grid holds no subscriber cards — the first load, or a retry after one that
  // failed. loadClients also runs after every mutation, and flashing the whole grid away each
  // time a client is toggled would be worse than showing nothing.
  const listContainer = document.getElementById('clients-list');
  const showingCards = !!listContainer && listContainer.children.length > 0 &&
    !listContainer.querySelector('.clients-placeholder');
  if (!showingCards) {
    clientsPanelMessage('loader', 'Loading clients…', 'Reading the subscriber list from the server.');
  }

  try {
    const res = await fetch(api('/api/clients'), {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    if (res.status === 401) {
      showLoginModal();
      return;
    }
    if (!res.ok) {
      const msg = await errorMessage(res, 'The server refused the request.');
      clientsPanelMessage('alert-triangle', 'Could not load clients',
        `${escapeHTML(msg)} Nothing has been changed — this is a failed read, not an empty list.`,
        'text-amber-300');
      showToast(msg, 'error');
      return;
    }

    clientsDataCache = await res.json();
    renderClientsView(clientsDataCache);
  } catch (e) {
    console.error('Failed to load clients:', e);
    clientsPanelMessage('wifi-off', 'Could not reach the server',
      'The subscriber list could not be read. Nothing has been changed — this is a failed read, not an empty list.',
      'text-amber-300');
    showToast('Could not reach the server to load the client list.', 'error');
  }
}

function renderClientsView(data) {
  if (!data) return;

  // Access Control Mode Switch & Badges
  const modeSwitch = document.getElementById('access-mode-switch');
  const modeBadge = document.getElementById('access-mode-badge');
  const modeText = document.getElementById('access-mode-status-text');

  const isWhitelistEnforced = !data.allow_all;
  if (modeSwitch) modeSwitch.checked = isWhitelistEnforced;

  // The two badges carry an icon rather than the 🔒/🔓 they used to, and innerHTML rather
  // than innerText because of it. Both names exist in the bundle, and both paths out of this
  // function redraw — the placeholder return below and the tail of the card render — so the
  // <i> never survives as an empty element.
  if (isWhitelistEnforced) {
    if (modeBadge) {
      modeBadge.className = 'badge badge-proxy inline-flex items-center gap-1';
      modeBadge.innerHTML = '<i data-feather="lock" class="w-3 h-3"></i> WHITELIST ENFORCED';
    }
    if (modeText) {
      modeText.innerText = 'Whitelist Mode (Only Registered Clients)';
      modeText.className = 'text-xs font-mono text-cyan-400 font-bold';
    }
  } else {
    if (modeBadge) {
      modeBadge.className = 'badge badge-direct inline-flex items-center gap-1';
      modeBadge.innerHTML = '<i data-feather="unlock" class="w-3 h-3"></i> PUBLIC ACCESS';
    }
    if (modeText) {
      modeText.innerText = 'Public Mode (Anyone can connect)';
      modeText.className = 'text-xs font-mono text-slate-400 font-semibold';
    }
  }

  // Filter clients by search
  const searchInput = document.getElementById('client-search-input');
  const searchVal = searchInput ? searchInput.value.toLowerCase().trim() : '';

  // Kept apart from the filtered list on purpose: "you have no subscribers" and "your
  // search matched none of them" are opposite situations that used to print the same
  // message, and the message was the first one. An operator with fifty paying subscribers
  // who mistyped into the search box was told "No Clients Found — click Add New Client to
  // create client accounts", which reads exactly like a list that has just been wiped.
  const allClients = data.clients || [];
  let clients = allClients;
  if (searchVal) {
    clients = clients.filter(c =>
      c.name.toLowerCase().includes(searchVal) ||
      c.id.includes(searchVal) ||
      // Guarded because allowed_ips is not guaranteed to be an array on the wire: the
      // read path normalises a missing list to [], but POST /api/clients/add answers
      // with the record it just built, and an IP-less create left that field null. An
      // unguarded .some() there would throw on the first keystroke in the search box
      // and take the whole list render with it, so the panel would go blank with only
      // a console error to explain it. Every other allowed_ips reader here already
      // guards; this one was the exception.
      (Array.isArray(c.allowed_ips) && c.allowed_ips.some(ip => ip.includes(searchVal)))
    );
  }

  const listContainer = document.getElementById('clients-list');
  if (!listContainer) return;
  listContainer.innerHTML = '';

  if (clients.length === 0) {
    // Both carry .clients-placeholder for the same reason clientsPanelMessage does: they are
    // notices rather than subscriber cards, and loadClients uses that class to decide whether a
    // reload should show its loading state or leave a populated grid alone.
    listContainer.innerHTML = allClients.length === 0 ? `
      <div class="clients-placeholder col-span-1 md:col-span-2 glass-panel p-8 text-center text-slate-400 border border-slate-800">
        <i data-feather="users" class="w-8 h-8 mx-auto text-slate-600 mb-2"></i>
        <div class="font-bold text-slate-300 font-heading">No Clients Yet</div>
        <p class="text-xs text-slate-500 mt-1">Click "Add New Client" above to create client accounts &amp; registration links.</p>
      </div>
    ` : `
      <div class="clients-placeholder col-span-1 md:col-span-2 glass-panel p-8 text-center text-slate-400 border border-slate-800">
        <i data-feather="search" class="w-8 h-8 mx-auto text-slate-600 mb-2"></i>
        <div class="font-bold text-slate-300 font-heading">No Match</div>
        <p class="text-xs text-slate-500 mt-1">None of your ${allClients.length} client(s) match &ldquo;${escapeHTML(searchVal)}&rdquo;. The search looks at the name, the ID and the registered IPs.</p>
        <button class="clear-client-search-btn mt-3 text-[11px] font-bold text-cyan-400 border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 rounded-lg hover:bg-cyan-500/20 transition">
          Clear search
        </button>
      </div>
    `;
    safeFeatherReplace();
    return;
  }

  // The subscription origin from /api/config wins (Phase 4): links must carry
  // the origin subscribers will actually open, which can differ from the
  // address the panel happens to be viewed at. The scheme arrives with it and
  // is never rebuilt here — a record carrying its own certificate pair is
  // HTTPS even when the panel is plain HTTP, a fact the panel's tls flag
  // cannot express. An empty origin means the daemon has nothing to advertise,
  // and the address the operator is viewing from is the least-bad fallback.
  const subOrigin = currentConfig?.subscription_origin || window.location.origin;
  const currentOrigin = subOrigin || window.location.origin;
  let dnsPrimaryIP = data.public_ip;
  if (!dnsPrimaryIP || dnsPrimaryIP === '127.0.0.1' || dnsPrimaryIP === '0.0.0.0' || dnsPrimaryIP === 'localhost') {
    if (window.location.hostname && window.location.hostname !== '127.0.0.1' && window.location.hostname !== 'localhost') {
      dnsPrimaryIP = window.location.hostname;
    } else {
      dnsPrimaryIP = data.public_ip || '127.0.0.1';
    }
  }

  clients.forEach(c => {
    const isExpired = c.expires_at && c.expires_at !== '0001-01-01T00:00:00Z' && new Date(c.expires_at) < new Date();

    let statusBadge = '<span class="badge badge-direct">ACTIVE</span>';
    if (!c.enabled) {
      statusBadge = '<span class="badge badge-block">DISABLED</span>';
    } else if (isExpired) {
      statusBadge = '<span class="badge badge-block">EXPIRED</span>';
    } else if (c.quota_exceeded === true) {
      // The third reason the resolver refuses an account, and the one the card used to
      // hide: a subscriber whose volume is spent was still badged ACTIVE, so the first
      // the reseller heard of it was the customer complaining that nothing resolves.
      // Red like EXPIRED because the effect is the same, worded differently because the
      // fix is not — this one needs volume, not days.
      statusBadge = '<span class="badge badge-block">NO QUOTA</span>';
    }

    let policyBadge = '';
    if (c.custom_policies && c.custom_policies.length > 0) {
      policyBadge = `<span class="badge bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[9px]" title="${escapeHTML(c.custom_policies.join(', '))}">${c.custom_policies.length} Policies</span>`;
    }

    // Two forms of the same instant, because the card shows it in a 103px column and the
    // Bot Card copies it into a message. expText stays precise — full date, hours, minutes,
    // seconds — and goes to the tooltip and to data-exp. expShort is what the cell renders.
    //
    // The cell used to render expText, and at 360px a `truncate` cut it to
    // "10/5/2026 7:39:…", which is worse than showing less: a half-printed clock reads as
    // corrupted data rather than as an elided one. Dropping the time entirely is the right
    // trade because the line directly underneath already carries the number a reseller
    // actually acts on — "(29d 23h remaining)" — so the clock was never the answer to a
    // question anyone was asking, only the date is, and the date fits in nine characters.
    let expText = 'Lifetime (No Expiry)';
    let expShort = expText;
    let remainingText = '';
    if (c.expires_at && c.expires_at !== '0001-01-01T00:00:00Z') {
      const expDate = new Date(c.expires_at);
      expText = expDate.toLocaleDateString() + ' ' + expDate.toLocaleTimeString();
      expShort = expDate.toLocaleDateString();
      const diffMs = expDate - new Date();
      if (diffMs > 0) {
        const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        remainingText = `(${days}d ${hours}h remaining)`;
      } else {
        remainingText = '(Expired)';
      }
    }

    // Two addresses, two jobs (the operator's own algorithm, Phase B):
    //   /sub/<token> is the subscriber's page — the link you hand out, and it is
    //     read-only by itself, so a leaked link moves nobody's binding.
    //   /ip/<token>  is the registration API — it demands the registration
    //     secret, which travels out-of-band (the Bot Card carries it).
    // Reg Link hands out the page; the Bot Card adds the API URL and the secret
    // so the subscriber can actually move their binding.
    const subUrl = `${currentOrigin}/sub/${c.token}`;
    const regApiUrl = `${currentOrigin}/ip/${c.token}`;
    // The first address on file, for pre-filling the "set IP" dialog. At most one is
    // ever stored — see SetClientIP and registerIP, which both replace rather than
    // append, because a subscriber is identified by the address they are on now.
    const currentIP = (c.allowed_ips && c.allowed_ips.length > 0) ? c.allowed_ips[0] : '';

    // Whitelisted IPs HTML tags.
    //
    // Every server-supplied value below goes through escapeHTML. This card is
    // assigned with innerHTML, and a client's name, note and UUID are free text that
    // the operator — or anything holding the API key, such as the Telegram
    // provisioner — can set to whatever it likes. Records written before the address
    // was validated may also hold arbitrary text where an IP belongs. Without
    // escaping, one such value renders as live markup inside the authenticated panel,
    // and a value in a double-quoted attribute does not even need a `<`: closing the
    // quote is enough to add an event handler.
    // The remove button is a `×` glyph, and a glyph is sized by its own font metrics:
    // this one measured 6.6 x 16.5 CSS px on a phone. WCAG 2.2 SC 2.5.8 puts the floor
    // for a touch target at 24 x 24, so it failed on the shorter axis by a factor of
    // three and a half — and it is the control that un-whitelists a paying subscriber.
    // A `w-6 h-6` inline-flex box is exactly 24 x 24 whatever the glyph inside does,
    // because the size no longer comes from the text; `leading-none` keeps the `×`
    // optically centred once the box stops hugging it. The chip grows to fit, which is
    // the trade being made on purpose: one address chip per line on a 360px screen is
    // better than a delete button nobody can hit without zooming.
    let ipsHtml = '';
    if (c.allowed_ips && c.allowed_ips.length > 0) {
      ipsHtml = c.allowed_ips.map(ip => `
        <span class="inline-flex items-center gap-1 ps-2 pe-0.5 py-0.5 rounded-md bg-slate-950 border border-cyan-500/30 text-[11px] font-mono text-cyan-300">
          <span>${escapeHTML(ip)}</span>
          <button class="remove-client-ip-btn inline-flex items-center justify-center w-6 h-6 rounded hover:text-red-400 hover:bg-red-500/10 transition leading-none" data-id="${escapeHTML(c.id)}" data-ip="${escapeHTML(ip)}" title="Remove IP" aria-label="Remove IP ${escapeHTML(ip)}">×</button>
        </span>
      `).join('');
    } else {
      ipsHtml = '<span class="text-slate-500 text-[11px] italic">No IPs registered yet (Share link below)</span>';
    }

    // Traffic. This card is what a reseller looks at to answer "how much of their plan
    // has this subscriber used", and until now it answered in megabytes only — a 40 GB
    // plan reported "41287.3 MB", which nobody can read against a limit in GB. It also
    // showed the used figure with no relation to the limit at all, so the one number
    // that decides whether to renew had to be worked out by hand every time.
    const usedBytes = (typeof c.traffic_used_bytes === 'number' && isFinite(c.traffic_used_bytes) && c.traffic_used_bytes > 0)
      ? c.traffic_used_bytes
      : 0;
    const limitGB = (typeof c.traffic_limit_gb === 'number' && isFinite(c.traffic_limit_gb) && c.traffic_limit_gb > 0)
      ? c.traffic_limit_gb
      : 0;
    const limitText = limitGB > 0 ? `${limitGB} GB` : 'Unlimited';

    let usedText = `Used: ${formatBytes(usedBytes)}`;
    let usedClass = 'text-slate-500';
    if (limitGB > 0) {
      const pct = Math.min(999, Math.round((usedBytes / (limitGB * 1024 * 1024 * 1024)) * 100));
      usedText = `Used: ${formatBytes(usedBytes)} · ${pct}%`;
      // Amber is the warning a reseller can act on before the subscriber calls. Red is
      // not derived from that percentage: c.quota_exceeded is the daemon's own verdict,
      // the same one the resolver enforces with, and 100% here is a rounded figure that
      // can read as full while the account is still being answered.
      if (pct >= 80) usedClass = 'text-amber-400 font-bold';
      if (c.quota_exceeded === true) usedClass = 'text-red-400 font-bold';
    }

    // When the volume comes back, straight from the server. The cycle name alone is
    // not the answer an operator needs — "monthly" on an account anchored to the 31st
    // means the 28th in February — and working it out here would be a second
    // implementation of the clamped-month arithmetic that only the daemon can settle.
    let cycleHtml = '';
    if (c.next_traffic_reset) {
      const next = new Date(c.next_traffic_reset);
      if (!isNaN(next.getTime())) {
        cycleHtml = `<div class="text-emerald-400/80 text-[9px] inline-flex items-center gap-1" title="Volume resets automatically (${escapeHTML(c.traffic_reset_cycle || '')})"><i data-feather="rotate-cw" class="w-2.5 h-2.5"></i>${escapeHTML(next.toLocaleDateString())}</div>`;
      }
    }

    const queriesText = (typeof c.total_queries === 'number' && isFinite(c.total_queries))
      ? c.total_queries.toLocaleString()
      : '—';

    // Two bugs lived on this one line. Go marshals a never-set time.Time as
    // "0001-01-01T00:00:00Z", which is a perfectly truthy string, so a subscriber who
    // has never sent a query was reported as last seen at midnight — the expiry field
    // right next to it already guarded for exactly this value. And the time was
    // rendered with toLocaleTimeString() alone, so "last seen 3:04 PM" was
    // indistinguishable between this afternoon and three weeks ago.
    let lastSeenText = 'Never';
    if (c.last_seen && c.last_seen !== '0001-01-01T00:00:00Z') {
      const seen = new Date(c.last_seen);
      if (!isNaN(seen.getTime())) {
        const ageMin = Math.floor((Date.now() - seen.getTime()) / 60000);
        if (ageMin < 1) lastSeenText = 'just now';
        else if (ageMin < 60) lastSeenText = `${ageMin}m ago`;
        else if (ageMin < 1440) lastSeenText = `${Math.floor(ageMin / 60)}h ago`;
        else lastSeenText = `${Math.floor(ageMin / 1440)}d ago`;
      }
    }

    const card = document.createElement('div');
    card.className = 'glass-panel p-4 sm:p-5 flex flex-col justify-between space-y-4 border border-slate-800 hover:border-cyan-500/40 transition';
    card.innerHTML = `
      <div>
        <!-- Card Header -->
        <!-- min-w-0/flex-1 on the text block and shrink-0 on the buttons are
             load-bearing on a phone. The Slug is one unbreakable 64-character
             token, so without min-w-0 it sets the block's minimum width at
             ~345px — wider than the whole header on a 375px screen — and the
             flex row pushed the edit/pause/delete group clean off the right
             edge of the viewport, unreachable. The slug line truncates like
             the UUID row below it does, with the full value kept on the title. -->
        <div class="flex items-start justify-between gap-2 mb-2 pb-2 border-b border-slate-800/80">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 flex-wrap">
              <h4 class="text-sm font-bold text-white font-heading">${escapeHTML(c.name)}</h4>
              ${statusBadge}
              ${policyBadge}
            </div>
            <div class="text-[10px] text-slate-400 font-mono mt-0.5 truncate" title="Code: ${escapeHTML(c.id)} · Slug: ${escapeHTML(c.token)}">
              Code: <span class="text-amber-300 font-bold">${escapeHTML(c.id)}</span> · Slug: <span class="text-slate-500">${escapeHTML(c.token)}</span>
            </div>
          </div>

          <div class="flex items-center gap-1 shrink-0">
            <button class="edit-client-btn p-1.5 rounded-lg bg-slate-900 hover:bg-cyan-500/20 text-slate-400 hover:text-cyan-300 border border-slate-800 transition" data-id="${escapeHTML(c.id)}" title="Edit Client">
              <i data-feather="edit-2" class="w-3.5 h-3.5"></i>
            </button>
            <button class="toggle-client-btn p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-cyan-400 border border-slate-800 transition" data-id="${escapeHTML(c.id)}" data-enabled="${!c.enabled}" title="${c.enabled ? 'Disable Client' : 'Enable Client'}">
              <i data-feather="${c.enabled ? 'pause' : 'play'}" class="w-3.5 h-3.5"></i>
            </button>
            <button class="delete-client-btn p-1.5 rounded-lg bg-slate-900 hover:bg-red-500/20 text-slate-400 hover:text-red-400 border border-slate-800 transition" data-id="${escapeHTML(c.id)}" data-name="${escapeHTML(c.name)}" title="Delete Client">
              <i data-feather="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>

        <!-- UUID Row -->
        <!-- shrink-0 on the copy button is load-bearing next to the truncating UUID: the
             row is justify-between with a flexible middle child, so without it the button
             is the first thing the layout takes width from when a long UUID and a narrow
             phone compete. A 6x6 box puts it at exactly the 24px WCAG 2.2 SC 2.5.8 floor,
             up from the 16x16 that p-0.5 around a 12px icon produced — and this is the
             control a reseller uses most, because the UUID is what goes into the
             subscriber's config. -->
        <div class="flex items-center justify-between text-[10px] font-mono bg-slate-950/80 px-2.5 py-1.5 rounded-lg border border-slate-800/80 mb-2.5">
          <span class="text-slate-500 font-semibold">UUID:</span>
          <span class="text-cyan-300 truncate max-w-[180px] sm:max-w-[210px] select-all" title="${escapeHTML(c.uuid)}">${escapeHTML(c.uuid) || 'N/A'}</span>
          <button class="copy-uuid-btn inline-flex items-center justify-center w-6 h-6 shrink-0 rounded text-slate-400 hover:text-cyan-300 hover:bg-cyan-500/10 transition ms-1" data-uuid="${escapeHTML(c.uuid)}" title="Copy UUID" aria-label="Copy UUID">
            <i data-feather="copy" class="w-3 h-3"></i>
          </button>
        </div>

        <!-- Whitelisted IPs Row -->
        <!-- The 10px label gave this button a 15px-tall hit area — wide enough to hit by
             accident, short enough to miss on purpose. A 24px min-height reaches the
             floor without moving the text, and the negative inline-end margin cancels the
             new padding so the label still sits flush with the row's edge; the hit area
             grows outward into the gutter rather than pushing the layout around. -->
        <div class="space-y-1.5 mb-3">
          <div class="flex items-center justify-between text-[11px]">
            <span class="text-slate-400 font-semibold">Registered IP (Max 1):</span>
            <button class="add-ip-prompt-btn text-cyan-400 hover:text-cyan-300 text-[10px] font-mono flex items-center justify-center gap-0.5 min-h-[24px] px-1.5 -me-1.5 rounded hover:bg-cyan-500/10 transition" data-id="${escapeHTML(c.id)}" data-ip="${escapeHTML(currentIP)}">
              + Set IP Manually
            </button>
          </div>
          <div class="flex flex-wrap gap-1.5">
            ${ipsHtml}
          </div>
        </div>

        <!-- Expiration & Metrics -->
        <div class="grid grid-cols-3 gap-2 text-[10px] font-mono bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
          <div>
            <span class="text-slate-500 uppercase">Plan Expiry</span>
            <div class="text-slate-200 font-bold truncate" title="${escapeHTML(expText)}">${escapeHTML(expShort)}</div>
            <div class="text-emerald-400 text-[9px]">${escapeHTML(remainingText)}</div>
          </div>
          <div>
            <span class="text-slate-500 uppercase">Traffic Limit</span>
            <div class="text-amber-300 font-bold">${limitText}</div>
            <div class="${usedClass} text-[9px]">${usedText}</div>
            ${cycleHtml}
          </div>
          <div>
            <span class="text-slate-500 uppercase">Queries</span>
            <div class="text-cyan-300 font-bold">${queriesText}</div>
            <div class="text-slate-500 text-[9px]">Last seen: ${lastSeenText}</div>
          </div>
        </div>
      </div>

      <!-- Quick Action Buttons -->
      <div class="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800/80 text-xs">
        <button class="copy-reg-link-btn py-1.5 px-2 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[11px] font-bold font-heading flex items-center justify-center gap-1 transition truncate" data-url="${escapeHTML(subUrl)}">
          <i data-feather="link" class="w-3 h-3 flex-shrink-0"></i>
          <span>Reg Link</span>
        </button>

        <button class="copy-telegram-card-btn py-1.5 px-2 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[11px] font-bold font-heading flex items-center justify-center gap-1 transition truncate"
          data-id="${escapeHTML(c.id)}" data-name="${escapeHTML(c.name)}" data-exp="${escapeHTML(expText)}" data-url="${escapeHTML(subUrl)}" data-reg-url="${escapeHTML(regApiUrl)}" data-secret="${escapeHTML(c.register_secret || '')}" data-ip="${escapeHTML(dnsPrimaryIP)}" data-uuid="${escapeHTML(c.uuid)}">
          <i data-feather="send" class="w-3 h-3 flex-shrink-0"></i>
          <span>Bot Card</span>
        </button>

        <button class="renew-client-btn py-1.5 px-2 rounded-lg bg-slate-900 hover:bg-emerald-500/20 text-slate-300 hover:text-emerald-400 border border-slate-800 text-[11px] font-bold font-heading flex items-center justify-center gap-1 transition truncate" data-id="${escapeHTML(c.id)}">
          <i data-feather="clock" class="w-3 h-3 flex-shrink-0"></i>
          <span>+30 Days</span>
        </button>
      </div>
    `;

    listContainer.appendChild(card);
  });

  safeFeatherReplace();
}

// Generate the Telegram provisioning card for a subscriber.
//
// The card is the out-of-band channel the Phase B design depends on: the /sub/
// page is read-only on its own, so the registration secret has to reach the
// subscriber somewhere other than the portal link. It used to be a Shelcan-
// style message that named the retired /ip/ link as if it were the subscriber
// page and printed the literal string "دی ان اس اختصاصی شما :" with nothing
// after it — an operator copying it sent a link that has been an API since
// v2.1, next to an empty field.
//
// Four pieces now, each with a job: where to manage the subscription, the
// secret, the address to point their console at, and the API endpoint for a
// scripted client. The secret is printed because this text is written by an
// authenticated operator into a private chat with their customer.
function generateClientTelegramMessage(clientId, clientName, expStr, subUrl, regApiUrl, secret, dnsIP) {
  const serverLine = dnsIP || '(server address not configured)';
  const secretLine = secret ? secret : '(no secret on file — regenerate it in the panel)';
  return `🎮 اکانت SmartDNS شما آماده است

🔹 کد کاربری : ${clientId}
🔹 تاریخ انقضای پلن : ${expStr}

📄 لینک پنل اشتراک شما (وضعیت، حجم و تمدید):
${subUrl}

📶 دی ان اس اختصاصی شما :
🔹 Primary : ${serverLine}
🔹 Secondary : 1.1.1.1

مراحل ثبت آیپی :
1️⃣ گوشی موبایل و کنسول بازی را به یک اینترنت مشترک وصل کنید .
2️⃣ بدون فیلترشکن، لینک پنل اشتراک بالا را باز کنید .
3️⃣ رمز ثبت زیر را وارد کرده و دکمهٔ «ثبت آیپی من» را بزنید .
❌ در صورت عدم ثبت آیپی، DNS برای شما متصل نخواهد شد ❌

🔑 رمز ثبت آیپی (Registration Secret) :
${secretLine}

🔗 آدرس API ثبت آیپی (برای اتوماسیون):
${regApiUrl}`;
}

// Attach Client View Event Listeners
function initClientEventListeners() {
  // Add Client Modal handlers. The form is reset on every open, so a half-filled
  // create attempt abandoned with the × never seeds the next one.
  const addModal = document.getElementById('add-client-modal');
  const openBtn = document.getElementById('open-add-client-btn');
  if (openBtn) {
    openBtn.onclick = () => {
      resetAddClientForm();
      addModal?.classList.remove('hidden');
    };
  }
  const closeBtn = document.getElementById('close-add-client-btn');
  if (closeBtn) {
    closeBtn.onclick = () => addModal?.classList.add('hidden');
  }

  // Add Client Form Submit (Direct onsubmit handler with button debounce)
  const addForm = document.getElementById('add-client-form');
  if (addForm) {
    addForm.onsubmit = async (e) => {
      e.preventDefault();
      const submitBtn = addForm.querySelector('button[type="submit"]');
      if (submitBtn && submitBtn.disabled) return;
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.classList.add('opacity-50');
      }

      const name = document.getElementById('client-name-input')?.value.trim();
      const initIP = document.getElementById('client-initial-ip')?.value.trim();

      // The whole plan in one request. Until these fields were on this form, the
      // volume had to be added afterwards by reopening the account in the edit modal —
      // and between the two steps the subscriber was live with no limit at all, with
      // nothing on screen saying so. The policies are on the form for the same
      // reason: an account created inheriting everything and corrected later is live
      // with the wrong rules for the whole gap between the two writes.
      const trafficGB = parseFloat(document.getElementById('client-traffic-input')?.value) || 0;
      const cycle = document.getElementById('client-traffic-cycle')?.value || '';

      // The exact moment the picker answered, sent as RFC 3339 like the edit form
      // sends its expiry. An empty field is a lifetime plan and omits the key, which
      // the server reads as "not chosen" rather than as the zero time.
      const expiryVal = document.getElementById('add-client-expiry')?.value || '';
      let expiresAtISO = '';
      if (expiryVal) {
        const parsed = new Date(expiryVal);
        if (!isNaN(parsed.getTime())) expiresAtISO = parsed.toISOString();
      }

      try {
        const res = await fetch(api('/api/clients/add'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
          body: JSON.stringify({
            name: name,
            expires_at: expiresAtISO || undefined,
            initial_ip: initIP,
            traffic_limit_gb: trafficGB,
            traffic_reset_cycle: cycle,
            custom_policies: addPolicyPicker.get()
          })
        });

        if (res.ok) {
          const client = await res.json().catch(() => ({}));
          addModal?.classList.add('hidden');
          resetAddClientForm();
          showToast('Client account created!', 'success');
          // The create response is the one moment the register link id and the
          // registration secret are both in hand (Phase B: the link displays,
          // the secret writes). Hand them to the created-modal instead of
          // letting the operator go hunting through the card's Bot Card — the
          // secret field there reads the LIST response, which is fine, but the
          // natural next action after creating a subscriber is sending them
          // their credentials, not navigating away to find them.
          showClientCreatedModal(client);
          await loadClients();
        } else {
          // The server's own reason, not a generic failure. A rejected cycle name and
          // a duplicate IP are both 400 here, and the difference is the whole of what
          // the operator has to fix.
          showToast(await errorMessage(res, 'Failed to create client'), 'error');
        }
      } catch (e) {
        showToast('Network error creating client', 'error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.classList.remove('opacity-50');
        }
      }
    };
  }

  // Access Mode Switch (Public vs Whitelist)
  document.getElementById('access-mode-switch')?.addEventListener('change', async (e) => {
    const isEnforced = e.target.checked;
    const allowAll = !isEnforced;

    try {
      const res = await fetch(api('/api/access/mode'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({ allow_all: allowAll })
      });

      if (res.ok) {
        showToast(isEnforced ? 'Whitelist mode enforced (Only registered clients)' : 'Open public mode activated', 'info');
        loadClients();
      }
    } catch (e) {
      showToast('Failed to update access mode', 'error');
    }
  });

  // Search input live filter. Debounced (v2.2.0 perf pass): every keystroke
  // rebuilt the entire clients grid — one innerHTML card per subscriber plus
  // a document-wide icon sweep — which on a large roster made typing feel
  // like lag. 150 ms collapses a burst of keys into one rebuild.
  let clientSearchTimer = null;
  document.getElementById('client-search-input')?.addEventListener('input', () => {
    if (!clientsDataCache) return;
    clearTimeout(clientSearchTimer);
    clientSearchTimer = setTimeout(() => renderClientsView(clientsDataCache), 150);
  });

  // The "Clear search" button in the no-match state. Delegated on the container, not bound
  // after each render, because the container's innerHTML is replaced on every keystroke —
  // a listener attached to the button itself would be discarded by the next one.
  document.getElementById('clients-list')?.addEventListener('click', (e) => {
    if (!e.target.closest('.clear-client-search-btn')) return;
    const input = document.getElementById('client-search-input');
    if (!input) return;
    input.value = '';
    if (clientsDataCache) renderClientsView(clientsDataCache);
    input.focus();
  });

  // Event Delegation for Client Action Buttons
  document.addEventListener('click', async (e) => {
    // 1. Copy Registration Link
    const regBtn = e.target.closest('.copy-reg-link-btn');
    if (regBtn) {
      const url = regBtn.dataset.url;
      copyText(url, regBtn);
      return;
    }

    // 2. Copy Telegram Bot Card
    const cardBtn = e.target.closest('.copy-telegram-card-btn');
    if (cardBtn) {
      const id = cardBtn.dataset.id;
      const exp = cardBtn.dataset.exp;
      const subUrl = cardBtn.dataset.url;
      const regApiUrl = cardBtn.dataset.regUrl;
      const secret = cardBtn.dataset.secret;
      const ip = cardBtn.dataset.ip;
      const msg = generateClientTelegramMessage(id, cardBtn.dataset.name, exp, subUrl, regApiUrl, secret, ip);
      copyText(msg, cardBtn);
      showToast('Persian client card copied for Telegram!', 'success');
      return;
    }

    // 3. Renew Client (+30 Days)
    const renewBtn = e.target.closest('.renew-client-btn');
    if (renewBtn) {
      await clientAction(
        '/api/clients/renew',
        { id: renewBtn.dataset.id, extend_days: 30 },
        'Client plan extended by 30 days!',
        'success'
      );
      return;
    }

    // 4. Toggle Client
    const toggleBtn = e.target.closest('.toggle-client-btn');
    if (toggleBtn) {
      const enabled = toggleBtn.dataset.enabled === 'true';
      await clientAction(
        '/api/clients/toggle',
        { id: toggleBtn.dataset.id, enabled: enabled },
        `Client ${enabled ? 'enabled' : 'disabled'}`
      );
      return;
    }

    // 5. Delete Client
    const delBtn = e.target.closest('.delete-client-btn');
    if (delBtn) {
      const id = delBtn.dataset.id;
      const name = delBtn.dataset.name;
      const ok = await confirmAction({
        destructive: true,
        title: 'Delete this subscriber?',
        hint: 'PERMANENT — THE ACCOUNT AND ITS TRAFFIC HISTORY ARE GONE',
        // The name is operator-supplied free text and reaches the dialog through
        // textContent, so a name containing markup is shown, not run.
        message: `${name} (${id})\n\nTheir subscription link stops working immediately and their whitelisted address stops resolving. There is no undo — a new account gets a new ID, a new UUID and a new link.`,
        confirmText: 'DELETE SUBSCRIBER',
      });
      if (!ok) return;
      await clientAction('/api/clients/delete', { id: id }, 'Client deleted');
      return;
    }

    // 6. Set the client's whitelisted address
    const addIpBtn = e.target.closest('.add-ip-prompt-btn');
    if (addIpBtn) {
      const id = addIpBtn.dataset.id;
      const current = addIpBtn.dataset.ip || '';
      const ip = await promptForValue({
        title: 'Set the whitelisted address',
        label: 'IPv4 or IPv6 address',
        placeholder: '2.189.86.32',
        value: current,
        // "Set", not "add": the backend stores one address per subscriber and
        // replaces it, because a subscriber is identified by the address they are
        // on right now and their ISP moves it. The old copy said "add", so an
        // operator entering a second address believed they had two.
        message: current
          ? `This replaces the address on file (${current}). A subscriber has one address at a time — the resolver answers whichever one is stored here.`
          : 'A subscriber has one address at a time. The resolver answers the address stored here and refuses every other source.',
        confirmText: 'SAVE ADDRESS',
        validate: (value) => {
          if (!value) return 'Enter an address, or press Cancel to leave it unchanged.';
          if (!isProbablyIP(value)) return 'That is not an IP address. Expected something like 2.189.86.32 or 2001:db8::1.';
          return '';
        },
      });
      if (!ip) return;
      await clientAction('/api/clients/add_ip', { id: id, ip: ip }, `Whitelisted ${ip}`, 'success');
      return;
    }

    // 7. Remove Whitelisted IP
    const remIpBtn = e.target.closest('.remove-client-ip-btn');
    if (remIpBtn) {
      const id = remIpBtn.dataset.id;
      const ip = remIpBtn.dataset.ip;
      const ok = await confirmAction({
        destructive: true,
        title: 'Remove this address?',
        hint: 'THE SUBSCRIBER STOPS RESOLVING IMMEDIATELY',
        message: `${ip}\n\nThis is the only address on file for the account, so removing it leaves nothing whitelisted and every query from them is refused until an address is set again — theirs or one they register from the portal.`,
        confirmText: 'REMOVE ADDRESS',
      });
      if (!ok) return;
      await clientAction('/api/clients/remove_ip', { id: id, ip: ip }, 'IP removed from client');
      return;
    }
  });
}
