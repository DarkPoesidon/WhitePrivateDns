// =======================================================
// STATS POLLING
// =======================================================

// STATS_POLL_MS is the beat of the home tab. Every tile on it — Query Rate, RAM Cache,
// SNI Proxy, CPU Usage, RAM Usage, Live Traffic, Resolver Latency, Upstream Racers — is
// painted from one /api/stats response, so this interval *is* how live the page is. It
// was 2000 while the backend only resampled memory and CPU every fifth second; both
// halves now run at one second, and neither is the bottleneck for the other.
//
// setInterval is deliberately not used, for two reasons that bite at one second and did
// not at two:
//
//   A fetch can outlast the interval. setInterval does not care — it fires again
//   regardless. On a link where /api/stats takes 1.4 s, and an Iranian VPS answering a
//   home connection is exactly that link, polls overlap, queue behind each other, and
//   the tiles end up painted from whichever response happens to land last. Scheduling
//   the next poll only after the previous one settles makes overlap structurally
//   impossible and lets the real cadence degrade to whatever the link sustains, instead
//   of pretending to be 1 Hz while running four requests deep.
//
//   A hidden tab should not poll at all. A dashboard left open in a background tab over
//   an afternoon is fourteen thousand requests nobody looks at, on both ends of the one
//   scarce resource here. Polling stops on hide and resumes with an *immediate* refresh
//   rather than a wait, so coming back to the tab shows current numbers, not a second
//   of stale ones followed by a jump.
const STATS_POLL_MS = 1000;

// While the poll is failing, back off instead of hammering a daemon that is already
// unhappy once a second. The ceiling is low on purpose: a resolver that comes back up
// should light the badge again within a few seconds, not after a minute of silence.
const STATS_POLL_MAX_BACKOFF_MS = 8000;

let statsPollTimer = null;
// Tracked separately from the timer handle because a poll in flight has no timer: the
// handle is cleared on entry and only reassigned after the fetch settles. Without this
// flag, a visibilitychange landing inside that window would see "no timer scheduled",
// start a second chain, and quietly double the request rate for the rest of the session.
let statsPollInFlight = false;

async function pollStatsOnce() {
  if (statsPollInFlight) return;
  statsPollTimer = null;
  // Hidden tabs are resumed by the visibilitychange listener below, not by a timer.
  if (document.visibilityState === 'hidden') return;

  statsPollInFlight = true;
  try {
    await updateStats();
  } finally {
    statsPollInFlight = false;
  }

  // Checked again after the await: the tab may have been hidden while the request was
  // in flight, and arming a timer here would leave a background tab polling on.
  if (document.visibilityState === 'hidden') return;

  // The backoff reads statsFailures, which markStatsHealth already maintains for the
  // LIVE ENGINE badge. Deriving both from one counter keeps the page from claiming to
  // be live while polling every eight seconds, or the reverse.
  const delay = statsFailures > 0
    ? Math.min(STATS_POLL_MS * 2 ** statsFailures, STATS_POLL_MAX_BACKOFF_MS)
    : STATS_POLL_MS;

  statsPollTimer = setTimeout(pollStatsOnce, delay);
}

function startStatsPolling() {
  // Called once, from the post-login boot path. The listener is registered here rather
  // than at module scope so that a page which never logs in never installs it.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      clearTimeout(statsPollTimer);
      statsPollTimer = null;
      return;
    }
    if (statsPollTimer === null) pollStatsOnce();
    // Returning to a visible page while the stream tab is showing: the SSE
    // buffer kept growing hidden (per-query DOM work is skipped then — see
    // pushStreamQuery), so this is where the backlog becomes rows. Without
    // it the table stays stale until the next query happens to arrive.
    if (activeDashTab === 'stream' && !isStreamPaused) renderQueryStream();
  });

  pollStatsOnce();
}

async function updateStats() {
  if (!authToken) return;
  try {
    const res = await fetch(api('/api/stats'), {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (!res.ok) {
      markStatsHealth(false, `The server answered ${res.status}`);
      return;
    }

    const data = await res.json();

    const setTxt = (id, txt) => {
      const el = document.getElementById(id);
      if (el) el.innerText = txt;
    };

    // Every tile below used to read `data.field.toFixed(1)` straight. The endpoint
    // does send all of these today — handleStats builds a map literal with no
    // omitempty — but the failure mode if one ever goes missing is invisible: the
    // TypeError lands in the catch below, and every tile *after* the failing line
    // keeps whatever it showed two seconds ago, forever, while the page looks alive.
    // num() makes one missing field cost one dash instead of the whole update.
    const num = (v, digits) => (typeof v === 'number' && isFinite(v)) ? v.toFixed(digits) : '—';
    const count = (v) => (typeof v === 'number' && isFinite(v)) ? v.toLocaleString() : '—';

    setTxt('stat-qps', num(data.qps, 1));
    setTxt('stat-total-queries', count(data.total_queries));
	setTxt('stat-access-denied', count(data.access_denied));
    setTxt('stat-cache-ratio', typeof data.cache_hit_ratio === 'number' ? num(data.cache_hit_ratio, 1) + '%' : '—');
    setTxt('stat-cache-entries', count(data.cache_entries));
    setTxt('stat-proxy-active', count(data.active_proxy_conns));
    setTxt('stat-proxy-total', count(data.total_proxy_conns));
    setTxt('stat-cpu-percent', typeof data.cpu_usage_percent === 'number' ? num(data.cpu_usage_percent, 1) + '%' : '—');
    setTxt('stat-cpu-cores', count(data.num_cpu));
    setTxt('stat-memory', typeof data.ram_usage_mb === 'number' ? num(data.ram_usage_mb, 1) : '—');
    // Machine-wide load (internal/sysmetrics): the whole server, not just the
    // daemon process. Negative values mean the platform cannot answer — dash.
    const sysCPU = typeof data.system_cpu_percent === 'number' && data.system_cpu_percent >= 0
      ? num(data.system_cpu_percent, 1) + '%' : '—';
    setTxt('stat-cpu-sys', sysCPU);
    const sysMemOK = typeof data.system_mem_used_mb === 'number' && data.system_mem_used_mb >= 0;
    setTxt('stat-mem-sys-used', sysMemOK ? num(data.system_mem_used_mb, 0) : '—');
    setTxt('stat-mem-sys-total', sysMemOK ? num(data.system_mem_total_mb, 0) : '—');
    setTxt('stat-mem-sys-pct', sysMemOK ? num(data.system_mem_percent, 0) : '—');
    setTxt('stat-speed-in', num(data.speed_in_kbps, 1));
    setTxt('stat-speed-out', num(data.speed_out_kbps, 1));
    setTxt('stat-traffic-total', formatBytes(data.total_bytes_transferred));
    renderRateLimit(data.rate_limit_qps, data.rate_limited);
    renderLatency(data.latency_uncached, data.latency);
    renderCacheHealth(data);
    renderProxyDrops(data);

    // Render upstreams list
    renderUpstreams(data.upstreams);

    // Push QPS point to chart
    pushChartData(data.qps);

    markStatsHealth(true);
  } catch (e) {
    // A dropped poll is normal — a reload, a restart, a phone changing networks —
    // so the badge only changes after two in a row. What must not happen is the old
    // behaviour: swallow it and leave the page claiming to be live.
    markStatsHealth(false, 'The dashboard cannot reach the daemon');
  }
}

// statsFailures counts consecutive failed polls so one blip does not repaint the badge.
let statsFailures = 0;

// markStatsHealth is the only thing that makes the numbers on the overview page
// trustworthy: without it a daemon that died two minutes ago is indistinguishable
// from a healthy one, because every tile simply keeps its last value.
function markStatsHealth(ok, reason) {
  const badge = document.getElementById('live-engine-badge');
  const dot = document.getElementById('live-engine-dot');
  const label = document.getElementById('live-engine-label');

  if (ok) {
    statsFailures = 0;
    if (badge) {
      badge.className = 'text-[10px] font-mono text-cyan-400 px-2.5 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center gap-1.5';
      badge.title = 'The dashboard is receiving live telemetry';
    }
    if (dot) dot.className = 'pulse-dot';
    if (label) label.textContent = 'LIVE ENGINE';
    return;
  }

  statsFailures++;
  if (statsFailures < 2) return;

  if (badge) {
    badge.className = 'text-[10px] font-mono text-amber-400 px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center gap-1.5';
    badge.title = `${reason || 'Telemetry stopped'} — every number on this page is from the last successful poll`;
  }
  if (dot) dot.className = 'pulse-dot is-stale';
  if (label) label.textContent = 'STALE — NO TELEMETRY';
}

function formatBytes(bytes) {
  // Called with data.total_bytes_transferred and with a client's traffic counter, and
  // an absent counter used to render "NaN KB" here. Bytes below a kilobyte get their
  // own branch so a subscriber who has used nothing reads "0 B" rather than "0.0 KB".
  if (typeof bytes !== 'number' || !isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return Math.round(bytes) + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

// The per-source rate limiter drops a UDP flood without answering it, so the only
// way an operator can tell it fired is if the panel says so. Both numbers are
// shown together: "42 dropped" means nothing without the limit it was measured
// against, and a limit with no drops is the reassuring case worth displaying.
function renderRateLimit(qps, dropped) {
  const el = document.getElementById('stat-ratelimit');
  if (!el) return;

  if (!qps || qps <= 0) {
    el.textContent = 'Limit: off';
    el.className = 'text-slate-500';
    el.title = 'Per-source rate limiting is disabled (access.rate_limit_qps = 0)';
    return;
  }

  const n = dropped || 0;
  el.textContent = `Limit: ${qps}/s · ${n.toLocaleString()} dropped`;
  el.className = n > 0 ? 'text-amber-400 font-bold' : 'text-slate-400';
  el.title = n > 0
    ? `${n.toLocaleString()} queries dropped or refused for exceeding ${qps} qps per source since start`
    : `Limiting at ${qps} qps per source; nothing dropped so far`;
}

// Latency needs percentiles, not an average: at a healthy hit rate the mean is
// dominated by cache hits and reads under a millisecond while every real
// resolution crawls. `miss` excludes the cache hits — it is the distribution that
// moves when an upstream degrades — and `all` is every answer the resolver served.
function renderLatency(miss, all) {
  const setTxt = (id, txt) => {
    const el = document.getElementById(id);
    if (el) el.innerText = txt;
  };
  // Sub-10 ms readings need two decimals to be worth showing at all; past that
  // the tenth of a millisecond is noise.
  const fmt = (v) => (typeof v === 'number' && isFinite(v))
    ? (v < 10 ? v.toFixed(2) : v.toFixed(1))
    : '—';

  const haveMiss = !!(miss && miss.count > 0);
  setTxt('stat-lat-p50', haveMiss ? fmt(miss.p50_ms) : '—');
  setTxt('stat-lat-p95', haveMiss ? fmt(miss.p95_ms) : '—');
  setTxt('stat-lat-p99', haveMiss ? fmt(miss.p99_ms) : '—');
  setTxt('stat-lat-max', haveMiss ? fmt(miss.max_ms) : '—');

  const badge = document.getElementById('stat-lat-count');
  if (badge) {
    if (haveMiss) {
      badge.textContent = `${miss.count.toLocaleString()} resolved`;
      badge.title = 'Queries answered by an upstream rather than from cache, since the daemon started';
    } else if (all && all.count > 0) {
      // A real and reassuring state, not an error: nothing has needed an upstream.
      badge.textContent = 'every answer from cache';
      badge.title = 'No query has needed an upstream resolver yet';
    } else {
      badge.textContent = 'no data yet';
      badge.title = 'The resolver has not answered a query yet';
    }
  }

  // p50 carries the colour because it is the everyday experience. The thresholds
  // are the resolver's own service time, not a game's ping: past ~60 ms the
  // upstream path is the bottleneck, not this daemon.
  const p50El = document.getElementById('stat-lat-p50');
  if (p50El) {
    let tone = 'text-emerald-400';
    if (haveMiss && miss.p50_ms >= 60) tone = 'text-red-400';
    else if (haveMiss && miss.p50_ms >= 25) tone = 'text-amber-400';
    p50El.className = `text-lg sm:text-xl font-extrabold font-mono ${tone}`;
  }

  const allEl = document.getElementById('stat-lat-all');
  if (allEl) {
    allEl.textContent = (all && all.count > 0)
      ? `p50 ${fmt(all.p50_ms)} · p95 ${fmt(all.p95_ms)} · p99 ${fmt(all.p99_ms)} ms over ${all.count.toLocaleString()}`
      : '—';
  }
}

// Serve-stale answers a dead upstream instantly from an expired entry, which is
// precisely why it hides the outage: clients keep getting fast replies from a
// cache nothing is refilling. stale_served climbing alone is the feature working;
// climbing beside refresh_failed is the warning that names are about to go dark.
// refresh_started is carried in the tooltip rather than the line, because it is
// the denominator: "18 failed" is alarming on its own and unremarkable against
// 40,000 attempts, and the badge has no room for both numbers.
function renderCacheHealth(data) {
  const el = document.getElementById('stat-cache-health');
  if (!el) return;

  const served = data.stale_served || 0;
  const started = data.refresh_started || 0;
  const failed = data.refresh_failed || 0;
  const dropped = data.refresh_dropped || 0;

  if (!served && !started && !failed && !dropped) {
    el.textContent = 'Cache refresh: healthy';
    el.className = 'text-slate-500';
    el.title = 'No background refresh has run yet, no stale answer has been served';
    return;
  }

  // Share of attempts that failed. Only meaningful once something was attempted;
  // a failure with no attempt recorded would be a counter bug, not a bad upstream.
  const failRate = started > 0 ? (failed / started) * 100 : 0;

  el.textContent = `Cache refresh: ${served.toLocaleString()} stale · ${failed.toLocaleString()} failed · ${dropped.toLocaleString()} skipped`;
  el.className = failed > 0 ? 'text-amber-400 font-bold' : 'text-slate-400';
  if (failed > 0) {
    el.title = `${failed.toLocaleString()} of ${started.toLocaleString()} background refreshes failed (${failRate.toFixed(1)}%) while ${served.toLocaleString()} stale answer(s) were served. Clients are getting instant replies from a cache nothing is refilling — check the upstream resolvers before the grace window closes.`;
  } else if (dropped > 0) {
    el.title = `${started.toLocaleString()} background refresh(es) succeeded, ${dropped.toLocaleString()} were skipped because the refresh worker pool was saturated. Skipped renewals are not errors; they simply expire normally.`;
  } else {
    el.title = `${started.toLocaleString()} background refresh(es) run, none failed. ${served.toLocaleString()} expired entry/entries were served instantly while being renewed.`;
  }
}

// A connection can reach the SNI proxy and never become a relay, in which case it
// appears in none of the relay figures on the card above. Two ways that happens:
//
//   refused    — the target was blocked, resolved back to this host, or the relay
//                table was full. Expected, and mostly means the guards work.
//   unreadable — the opening bytes named no destination, so there was nowhere to
//                dial. A port scanner looks exactly like this, so a handful is
//                background noise on any public IP. A number that climbs with
//                real traffic does not: it means a name is being answered with
//                this server's address while the client then speaks something
//                the relay cannot read a destination out of — UDP-only, or TCP on
//                a port this relay does not accept on, or TCP that is not TLS or
//                HTTP. The client sees a connection that opens and dies, and
//                cannot tell why, because the substitution happened in DNS.
//
// So unreadable is shown even at zero-refused, and it is the one that gets the
// warning colour.
function renderProxyDrops(data) {
  const el = document.getElementById('stat-proxy-drops');
  if (!el) return;

  const refused = data.relays_refused || 0;
  const unreadable = data.relays_unreadable || 0;

  if (!refused && !unreadable) {
    el.textContent = 'no drops';
    el.className = 'text-slate-500';
    el.title = 'Every connection that reached the proxy named a destination and was relayed';
    return;
  }

  const parts = [];
  if (refused) parts.push(`${refused.toLocaleString()} refused`);
  if (unreadable) parts.push(`${unreadable.toLocaleString()} unreadable`);
  el.textContent = parts.join(' · ');
  el.className = unreadable > 0 ? 'text-amber-400 font-bold' : 'text-slate-400';
  el.title = unreadable > 0
    ? `${unreadable.toLocaleString()} connection(s) arrived without naming a destination — no TLS SNI and no HTTP Host header. A few are port scans. A rising count means a proxied name is sending clients here for traffic this relay cannot carry; check the server log for the sampled "unreadable destination" lines, which name the port and the first bytes.`
    : `${refused.toLocaleString()} connection(s) dropped for a blocked target, a self-dial, or a full relay table`;
}

// The trash icon as inline SVG. renderUpstreams runs once per stats poll
// (1 Hz), and the old row markup used a data-feather <i> plus a
// document-wide icon sweep — on a 1-core VPS that sweep was the single
// largest recurring cost on the dashboard, walking every element of every
// tab once a second. The SVG is byte-identical to what the icon library
// would substitute, so nothing changes visually.
const FEATHER_TRASH_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';

// Signature of the last rendered upstream set: the poll repaints the list
// unconditionally and most ticks change nothing (latency only moves when the
// racer re-measures). Skipping identical payloads removes the innerHTML
// rebuild + the SVG re-parse for every one of those ticks. Built by
// concatenation because the row template below interpolates the escaped
// address into innerHTML; a bare template here would trip the raw-
// interpolation scan for exactly the value it exists to protect.
let lastUpstreamsSig = '';

function renderUpstreams(upstreams) {
  const container = document.getElementById('upstreams-list');
  if (!container) return;

  if (!upstreams || upstreams.length === 0) {
    if (lastUpstreamsSig !== 'empty') {
      container.innerHTML = '<div class="text-slate-500 text-xs py-2">No upstreams configured</div>';
      lastUpstreamsSig = 'empty';
    }
    return;
  }
  const sig = upstreams.map(u => u.address + ':' + (u.latency || 0)).join('|');
  if (sig === lastUpstreamsSig) return;
  lastUpstreamsSig = sig;

  container.innerHTML = '';

  upstreams.forEach(u => {
    // u.latency is nanoseconds, and it is absent until the racer has actually measured
    // this upstream — a freshly added one, or one that has never answered. The old code
    // did `(u.latency / 1000000).toFixed(1)` unconditionally and then compared the
    // resulting *string* to 40 and 80: for a missing latency that yields "NaN", both
    // comparisons are false, and the row rendered "NaN ms" wearing the green badge that
    // means "fastest". Zero was worse, because "0.0 ms" with a green badge reads as a
    // perfect upstream when it means nobody has timed it yet.
    const latency = Number(u.latency) / 1e6;
    const measured = Number.isFinite(latency) && latency > 0;

    let badgeClass = 'text-slate-400 bg-slate-500/10 border-slate-600/40';
    let dotClass = 'w-2 h-2 rounded-full bg-slate-600';
    if (measured) {
      badgeClass = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
      dotClass = 'w-2 h-2 rounded-full bg-emerald-400';
      if (latency > 40) {
        badgeClass = 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30';
        dotClass = 'w-2 h-2 rounded-full bg-yellow-400';
      }
      if (latency > 80) {
        badgeClass = 'text-red-400 bg-red-500/10 border-red-500/30';
        dotClass = 'w-2 h-2 rounded-full bg-red-400';
      }
    }
    // "not timed yet" and "timed at 0.4 ms" have to look different, and the title is
    // where the distinction is spelled out for whoever hovers it.
    const latText = measured ? `${latency.toFixed(1)} ms` : '—';
    const latTitle = measured ? 'Last measured round-trip' : 'Not measured yet — no answer has been timed from this upstream';

    const row = document.createElement('div');
    row.className = 'flex items-center justify-between py-1.5 px-3 rounded-lg bg-slate-950/70 border border-slate-800 text-xs';
    row.innerHTML = `
      <div class="flex items-center gap-2">
        <span class="${dotClass}" aria-hidden="true"></span>
        <span class="font-mono text-slate-200">${escapeHTML(u.address)}</span>
      </div>
      <div class="flex items-center gap-2">
        <span class="px-2 py-0.5 rounded border ${badgeClass} text-[10px] font-bold font-mono" title="${latTitle}">${latText}</span>
        <!-- 24x24, up from the 16x16 that a p-0.5 box around a 12px icon gave: this
             deletes a resolver from the live racer set and it sat under the WCAG 2.2
             SC 2.5.8 floor on the surface where it is only ever touched. Enlarging a
             one-tap destructive control on its own would trade a target you cannot hit
             for one you hit by mistake, so the handler now asks first — see the
             confirmAction call in the click delegate. -->
        <button class="remove-upstream inline-flex items-center justify-center w-6 h-6 shrink-0 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition" data-addr="${escapeHTML(u.address)}" title="Remove upstream" aria-label="Remove upstream ${escapeHTML(u.address)}">
          ${FEATHER_TRASH_SVG}
        </button>
      </div>
    `;
    container.appendChild(row);
  });
}
