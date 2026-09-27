// =======================================================
// RUN FULL DIAGNOSTICS
// =======================================================
// One run at a time. The endpoint dials eight TCP endpoints with a 2.5 s timeout each, so a
// run against a blocked network takes the full 2.5 s — a wide window in which the Run Test
// button sat live and enabled. Clicking it fired a second concurrent POST, and the results
// list was written by whichever response *finished* first rather than whichever started last:
// the older run could land second and overwrite the newer one's numbers, with nothing on
// screen to say which run the operator was looking at. Opening the modal starts a run too, so
// close-and-reopen did the same thing.
let diagRunning = false;

async function runFullDiagnostics() {
  if (diagRunning) return;
  diagRunning = true;

  const container = document.getElementById('diag-items-list');
  const scoreEl = document.getElementById('diag-score');
  const qualEl = document.getElementById('diag-quality');
  const rerunBtn = document.getElementById('rerun-diagnostics-btn');

  // The banner used to keep the previous run's score for the whole of the next run and, if
  // that run then failed, for good — so the panel showed "88% / EXCELLENT (A+)" directly above
  // "The diagnostic run was refused", and nothing distinguished a fresh grade from a stale
  // one. A run in progress has no score; clear it before asking.
  if (scoreEl) scoreEl.innerText = '--%';
  if (qualEl) qualEl.innerText = 'Testing routes...';
  if (rerunBtn) {
    rerunBtn.disabled = true;
    rerunBtn.classList.add('opacity-50', 'cursor-not-allowed');
  }
  if (container) {
    container.innerHTML = '<div class="text-center py-8 text-cyan-400 font-mono text-xs"><span class="pulse-dot inline-block me-2"></span> Testing VPS connectivity to Riot, Epic, Steam, Discord, EA, Battle.net, PUBG, Spotify...</div>';
  }

  const fail = (msg) => {
    showToast(msg, 'error');
    if (qualEl) qualEl.innerText = 'Test failed';
    if (container) {
      container.innerHTML = `<div class="text-center py-6 text-red-400 text-xs">${escapeHTML(msg)}</div>`;
    }
  };

  try {
    const res = await fetch(api('/api/diagnostics/run'), {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    // A refusal used to `return` straight out, leaving the "Testing VPS
    // connectivity…" spinner on screen for good. An expired session answers 401
    // here, so the most likely reading of a permanent spinner was "the diagnostic
    // hangs", not "log in again".
    if (!res.ok) {
      fail(await errorMessage(res, 'The diagnostic run was refused'));
      return;
    }

    let report = null;
    try {
      report = await res.json();
    } catch (e) {
      // A 200 carrying something that is not JSON means a proxy answered, not the panel's
      // own server. Reporting that as "could not reach the server" named the one thing that
      // had demonstrably just worked.
      fail('The server answered the diagnostic run with a response that is not JSON.');
      return;
    }
    renderDiagnosticsReport(report);
  } catch (e) {
    fail('Could not reach the server to run diagnostics.');
  } finally {
    diagRunning = false;
    if (rerunBtn) {
      rerunBtn.disabled = false;
      rerunBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    }
  }
}

// renderDiagnosticsReport draws one report and must not throw: it runs inside the try above,
// so an exception here would surface as the catch's "could not reach the server" — a message
// about the network, for a bug in the renderer.
//
// It also shows reachable/total and avg_latency_ms, which the server has always computed and
// sent and the panel has always discarded. The grade alone cannot tell "all eight endpoints
// answered, slowly" from "seven answered instantly and one is unreachable", and average
// handshake time is the number this panel exists to report.
function renderDiagnosticsReport(rep) {
  const report = rep || {};
  const results = Array.isArray(report.results) ? report.results : [];

  const scoreEl = document.getElementById('diag-score');
  if (scoreEl) {
    scoreEl.innerText = Number.isFinite(report.overall_score) ? `${report.overall_score}%` : '--%';
  }

  const qualEl = document.getElementById('diag-quality');
  if (qualEl) {
    const bits = [];
    if (report.overall_quality) bits.push(String(report.overall_quality));
    if (Number.isFinite(report.reachable) && Number.isFinite(report.total)) {
      bits.push(`${report.reachable}/${report.total} reachable`);
    }
    // Guarded on reachable, because the average is over successful dials only: with none, the
    // server sends 0 and "0 ms avg" would read as a perfect result on a fully blocked network.
    if (Number.isFinite(report.avg_latency_ms) && report.reachable > 0) {
      bits.push(`${report.avg_latency_ms} ms avg`);
    }
    // innerText, so the separator and the server's grade string are text either way.
    qualEl.innerText = bits.length ? bits.join(' · ') : 'No result';
  }

  const container = document.getElementById('diag-items-list');
  if (!container) return;

  if (results.length === 0) {
    container.innerHTML = '<div class="text-center py-6 text-slate-500 text-xs">The server reported no diagnostic targets.</div>';
    return;
  }

  const frag = document.createDocumentFragment();
  for (const r of results) {
    const row = document.createElement('div');
    row.className = 'flex items-center justify-between py-2 px-3 rounded-lg bg-slate-950/70 border border-slate-800 text-xs';

    // latency_ms is 0 on a failed dial and absent from nothing the server sends — but
    // toFixed on a missing field throws, and that throw used to be reported as a network
    // error.
    const ms = Number.isFinite(r.latency_ms) ? r.latency_ms.toFixed(1) : '?';
    const badge = r.success
      ? `<span class="text-emerald-400 font-bold font-mono">${ms} ms</span>`
      : '<span class="text-red-400 font-bold font-mono">BLOCKED</span>';

    row.innerHTML = `
      <div class="flex items-center gap-2">
        <span class="w-2 h-2 rounded-full ${r.success ? 'bg-emerald-400' : 'bg-red-400'}"></span>
        <div>
          <span class="font-bold text-white">${escapeHTML(r.name)}</span>
          <span class="text-[10px] text-slate-500 font-mono ms-1.5">(${escapeHTML(r.target)})</span>
        </div>
      </div>
      <div>${badge}</div>
    `;
    frag.appendChild(row);
  }
  container.innerHTML = '';
  container.appendChild(frag);
}
