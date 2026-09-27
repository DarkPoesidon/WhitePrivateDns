// =======================================================
// LIVE QUERY STREAM (SSE)
// =======================================================
async function startLiveStream() {
  if (sseSource) {
    try { sseSource.close(); } catch(e) {}
  }

  // v2.1.0: the long-lived token no longer rides the query string. The
  // dashboard exchanges it (POST, authenticated) for a one-time, 60-second
  // ticket that the EventSource URL carries; the ticket is consumed on first
  // use, so a leaked URL authorises nothing afterwards.
  let ticketParam = '';
  if (authToken) {
    try {
      const tr = await fetch(api('/api/auth/sse-ticket'), {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (tr.ok) {
        const tj = await tr.json();
        ticketParam = `?ticket=${encodeURIComponent(tj.ticket)}`;
      }
    } catch (e) { /* fall through: stream will answer 401 and the UI retries on next tick */ }
  }
  sseSource = new EventSource(`${api('/api/stream/queries')}${ticketParam}`);

  // Handle single query event
  sseSource.addEventListener('query', (event) => {
    if (isStreamPaused) return;
    try {
      pushStreamQuery(JSON.parse(event.data));
    } catch (e) {
      console.error('Error parsing live query:', e);
    }
  });

  // Handle initial history batch
  sseSource.addEventListener('history', (event) => {
    try {
      const list = JSON.parse(event.data);
      if (Array.isArray(list)) seedStreamQueries(list);
    } catch (e) {
      console.error('Error parsing query history:', e);
    }
  });

  // Fallback for default messages
  sseSource.onmessage = (event) => {
    if (isStreamPaused) return;
    try {
      const q = JSON.parse(event.data);
      if (Array.isArray(q)) {
        seedStreamQueries(q);
      } else {
        pushStreamQuery(q);
      }
    } catch (e) {}
  };

  sseSource.onerror = (err) => {
    console.warn('SSE stream status update (reconnecting if interrupted)...');
  };
}

function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// streamFilterState reads the two controls once per render rather than once per row.
function streamFilterState() {
  const filterEl = document.getElementById('stream-filter');
  const searchEl = document.getElementById('stream-search');
  return {
    action: filterEl ? filterEl.value : 'ALL',
    search: searchEl ? searchEl.value.toLowerCase().trim() : '',
  };
}

// queryMatchesStream decides whether one query belongs in the current view. CACHED is handled
// apart from the others because it is not an action — it is a flag that can accompany any of
// them, so comparing it against q.action would match nothing.
function queryMatchesStream(q, f) {
  if (f.action !== 'ALL') {
    if (f.action === 'CACHED') {
      if (!q.cached) return false;
    } else if (q.action !== f.action) {
      return false;
    }
  }
  if (!f.search) return true;
  const domain = (q.domain || '').toLowerCase();
  const clientIP = q.client_ip || '';
  const accountName = (q.account_name || 'Public').toLowerCase();
  return domain.includes(f.search) || clientIP.includes(f.search) || accountName.includes(f.search);
}

// Every action string the resolver can log, mapped to the badge that stands for it. This is
// a table and not a chain of ifs because the previous chain defaulted to a green DIRECT
// badge: a query that was rate limited, was refused for a blown traffic quota, or had its
// AAAA sunk to keep a proxied domain off IPv6 all read as "resolved normally, straight out to
// the internet" — the opposite of what the engine did. The values are whole literal spans
// rather than a class plus a label so that nothing is interpolated into an attribute here.
// An action the frontend has never heard of is shown verbatim in a neutral badge instead of
// being dressed up as DIRECT.
// Keep in sync with the logQuery call sites in internal/core/dns/handler.go.
const STREAM_ACTION_BADGES = {
  PROXY: '<span class="badge badge-proxy">PROXY</span>',
  PROXY_IPV6_SINK: '<span class="badge badge-proxy">PROXY · IPv6 SINK</span>',
  BLOCK: '<span class="badge badge-block">BLOCK</span>',
  RATELIMIT: '<span class="badge badge-block">RATE LIMITED</span>',
  QUOTA: '<span class="badge badge-block">QUOTA</span>',
  CUSTOM: '<span class="badge badge-custom">CUSTOM</span>',
  CACHED: '<span class="badge badge-direct">DIRECT</span>',
  STALE: '<span class="badge badge-cached">STALE</span>',
  DIRECT: '<span class="badge badge-direct">DIRECT</span>',
};

// queryRowHTML renders one query into the seven cells of the stream table. Everything that
// came off the wire is escaped — the row reaches the DOM through innerHTML, and a domain is
// whatever a client asked this resolver to look up.
//
// The third and fifth cells (PROTO, RULE MATCHED) carry `hidden sm:table-cell` to match the
// two <th> in index.html that do the same. The pair has to stay in sync: hide a header
// without its cell and every column after it shifts one place left on a phone.
function queryRowHTML(q) {
  const domain = q.domain || '';
  const clientIP = q.client_ip || '';
  const accountName = q.account_name || 'Public';

  const action = q.action || 'DIRECT';
  const actBadge = STREAM_ACTION_BADGES[action]
    || `<span class="badge badge-unknown">${escapeHTML(action)}</span>`;

  let cacheBadge = q.cached ? '<span class="badge badge-cached ms-1">RAM</span>' : '';
  const timeStr = q.timestamp ? new Date(q.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();
  const latVal = (typeof q.latency_ms === 'number') ? q.latency_ms : ((typeof q.latency === 'number') ? q.latency / 1000000 : 0.0);
  const latStr = latVal.toFixed(1) + ' ms';
  const ruleStr = q.rule_name || q.rule_matched || q.rule || 'Default Direct';
  const protoStr = q.protocol || 'UDP';

  // clientIP is escaped like the domain beside it. It is normally a parsed address,
  // but on DoH it can originate from a forwarding header, and the row is written with
  // innerHTML — so the value is treated as data, not markup, rather than relying on
  // every producer upstream to have parsed it first.
  let clientDisplay = `<div class="flex flex-col"><span class="text-cyan-400 font-bold font-mono text-xs leading-tight">${escapeHTML(accountName)}</span><span class="text-[10px] text-slate-400 font-mono">${escapeHTML(clientIP)}</span></div>`;
  if (accountName === 'Public') {
    clientDisplay = `<div class="flex flex-col"><span class="text-slate-300 font-mono text-xs leading-tight">${escapeHTML(clientIP)}</span><span class="text-[10px] text-slate-500 font-mono">Public / Direct</span></div>`;
  }

  return `
    <td class="py-2.5 px-2 sm:px-3 text-slate-400 whitespace-nowrap">${timeStr}</td>
    <td class="py-2.5 px-2 sm:px-3">${clientDisplay}</td>
    <td class="py-2.5 px-2 sm:px-3 text-purple-400 font-bold hidden sm:table-cell">${escapeHTML(protoStr)}</td>
    <td class="py-2.5 px-2 sm:px-3 text-cyan-300 font-semibold max-w-[120px] sm:max-w-xs truncate" title="${escapeHTML(domain)}">${escapeHTML(domain)}</td>
    <td class="py-2.5 px-2 sm:px-3 text-slate-400 hidden sm:table-cell">${escapeHTML(ruleStr)}</td>
    <td class="py-2.5 px-2 sm:px-3">${actBadge}${cacheBadge}</td>
    <td class="py-2.5 px-2 sm:px-3 text-end text-emerald-400 font-mono">${latStr}</td>
  `;
}

// newQueryRow builds the <tr> for one query. The class list is shared by every data row, and
// the absence of stream-placeholder on it is what tells renderQueryStream and the append path
// apart from the two placeholder states.
function newQueryRow(q) {
  const row = document.createElement('tr');
  row.className = 'hover:bg-slate-800/40 transition border-b border-slate-800/40';
  row.innerHTML = queryRowHTML(q);
  return row;
}

// The two placeholder rows. Both carry stream-placeholder, which is how they are recognised —
// the old code matched tbody.children[0].innerText against the string 'Listening', so
// rewording the copy in index.html would have left the placeholder stuck above the first real
// query forever, with nothing anywhere to say why.
const STREAM_LISTENING_ROW = `
  <tr class="stream-placeholder">
    <td colspan="7" class="py-12 text-center text-slate-500">
      <div class="flex flex-col items-center gap-2">
        <div class="pulse-dot"></div>
        <span>Listening for live DNS queries...</span>
      </div>
    </td>
  </tr>`;

// The no-match state names the term and the number of queries held, because "no queries have
// arrived" and "none of the 200 I am holding match this" are opposite situations: the first is
// a resolver nobody is using, the second is a filter to clear. They used to look identical —
// an empty table — and a filtered-out arrival even consumed the Listening placeholder on its
// way to being dropped, so the panel went blank and stayed blank.
function streamNoMatchRow(f) {
  const bits = [];
  if (f.action !== 'ALL') bits.push(`action <span class="text-slate-300">${escapeHTML(f.action)}</span>`);
  if (f.search) bits.push(`&ldquo;<span class="text-slate-300">${escapeHTML(f.search)}</span>&rdquo;`);
  // Unreachable today — with neither control set, every query matches and this row is not
  // rendered — but it keeps the sentence grammatical if that ever stops being true.
  const what = bits.length ? bits.join(' and ') : 'the current filter';
  const held = streamBuffer.length;
  const lead = held === 1
    ? 'The one query received so far does not match'
    : `None of the last ${held} queries match`;
  return `
    <tr class="stream-placeholder">
      <td colspan="7" class="py-12 text-center text-slate-500">
        <div class="flex flex-col items-center gap-1.5">
          <div class="font-bold text-slate-400 font-heading">No Match</div>
          <p class="text-xs">${lead} ${what}.</p>
          <button class="clear-stream-filter-btn mt-1.5 text-[11px] font-bold text-cyan-400 border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 rounded-lg hover:bg-cyan-500/20 transition">
            Show all queries
          </button>
        </div>
      </td>
    </tr>`;
}

// renderQueryStream redraws the table from the buffer. This is what the filter and the search
// box call, so a change applies to the queries already received instead of only to the next
// one to arrive.
function renderQueryStream() {
  const tbody = document.getElementById('stream-tbody');
  if (!tbody) return;

  if (streamBuffer.length === 0) {
    tbody.innerHTML = STREAM_LISTENING_ROW;
    return;
  }

  const f = streamFilterState();
  const rows = streamBuffer.filter((q) => queryMatchesStream(q, f));
  if (rows.length === 0) {
    tbody.innerHTML = streamNoMatchRow(f);
    return;
  }

  // One reflow rather than one per row: on a busy resolver this runs on every keystroke.
  const frag = document.createDocumentFragment();
  for (const q of rows) {
    frag.appendChild(newQueryRow(q));
  }
  tbody.innerHTML = '';
  tbody.appendChild(frag);
}

// The active dashboard tab, set by switchTab. The perf pass (v2.2.0) gates
// per-second DOM work on it: the SSE stream keeps buffering on every tab,
// but its rows are only painted while the stream view (the sidebar's Logs tab, id "stream") is actually showing.
let activeDashTab = 'dashboard';

// The overview shows a small, bounded preview. Build cells as text nodes so DNS names
// and client labels from the wire cannot become markup.
function renderOverviewQueries() {
  const tbody = document.getElementById('overview-query-tbody');
  if (!tbody) return;
  if (streamBuffer.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="console-empty">Waiting for the first query</td></tr>';
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const q of streamBuffer.slice(0, 5)) {
    const row = document.createElement('tr');
    const parsedTime = q.timestamp ? new Date(q.timestamp) : new Date();
    const time = Number.isNaN(parsedTime.getTime()) ? '—' : parsedTime.toLocaleTimeString();
    const latency = typeof q.latency_ms === 'number' ? q.latency_ms
      : (typeof q.latency === 'number' ? q.latency / 1000000 : null);
    const values = [time, q.domain || '—', q.account_name || q.client_ip || 'Public',
      q.action || 'DIRECT', latency === null ? '—' : `${latency.toFixed(1)} ms`];
    values.forEach((value, index) => {
      const cell = document.createElement('td');
      if (index === 3) {
        const badge = document.createElement('span');
        badge.className = 'query-decision' + (['BLOCK', 'RATELIMIT', 'QUOTA'].includes(value) ? ' is-blocked' : '');
        badge.textContent = value;
        cell.appendChild(badge);
      } else {
        cell.textContent = value;
      }
      row.appendChild(cell);
    });
    fragment.appendChild(row);
  }
  tbody.replaceChildren(fragment);
}

let overviewPendingRender = false;
function scheduleOverviewRender() {
  if (overviewPendingRender || document.visibilityState === 'hidden' || activeDashTab !== 'dashboard') return;
  overviewPendingRender = true;
  setTimeout(() => {
    overviewPendingRender = false;
    if (document.visibilityState !== 'hidden' && activeDashTab === 'dashboard') renderOverviewQueries();
  }, 250);
}

// pushStreamQuery records one arriving query and, if it belongs in the current view, puts it
// on top without redrawing the rest.
//
// Perf (v2.2.0): the buffer write is cheap and always runs; the DOM work is
// what made the dashboard crawl on a 1-core VPS — one <tr> build + insert per
// DNS query at wire rate, from every tab, in every foreground state. Two
// gates now stand before it: the Logs tab must be the active tab (buffering
// continues elsewhere, and the view repaints from the buffer on switch), and
// the document must be visible. A rAF coalescer collapses bursts that arrive
// inside one frame into a single renderQueryStream pass.
let streamPendingRender = false;
function pushStreamQuery(q) {
  if (!q) return;

  streamBuffer.unshift(q);
  if (streamBuffer.length > STREAM_BUFFER_MAX) streamBuffer.pop();

  scheduleOverviewRender();

  if (document.visibilityState === 'hidden' || activeDashTab !== 'stream') return;
  if (isStreamPaused) return;

  if (streamPendingRender) return;
  streamPendingRender = true;
  requestAnimationFrame(() => {
    streamPendingRender = false;
    if (document.visibilityState === 'hidden' || activeDashTab !== 'stream' || isStreamPaused) return;
    const tbody = document.getElementById('stream-tbody');
    // The placeholder (listening / no-match row) is replaced wholesale by a
    // full render; a table still holding one must not have rows inserted
    // above it, which is why the class is looked up before the repaint.
    if (tbody && tbody.querySelector('.stream-placeholder')) tbody.innerHTML = '';
    renderQueryStream();
  });
}

// seedStreamQueries replaces the buffer with a history batch. The server sends newest first,
// which is the order the buffer keeps.
function seedStreamQueries(list) {
  streamBuffer = list.slice(0, STREAM_BUFFER_MAX);
  renderQueryStream();
  scheduleOverviewRender();
}
