// =======================================================
// CHART.JS TELEMETRY GRAPH
// =======================================================
// QPS_CHART_POINTS is both the number of samples the chart holds and, because
// pushChartData is called exactly once per poll, the width of its window in seconds.
// It is tied to STATS_POLL_MS: change one and the other stops meaning what it says.
const QPS_CHART_POINTS = 60;

// Chart.js paints onto a canvas, and a canvas is the one surface in this panel that CSS
// cannot re-colour: every stroke is a literal string baked in at construction time. So the
// four colours here used to be the four places light mode had no effect at all. Three were
// merely wrong — neon #00f0ff on a white card is a bright smear rather than a line — and one
// was a genuine defect: grid lines of rgba(255,255,255,0.05) are white on white, so the y
// axis in light mode had no gridlines whatsoever and the graph read as a shape with no scale.
//
// The values come from the same custom properties the rest of the panel is built on, read off
// <html> after [data-theme] has changed, so there is one definition of "cyan" per theme rather
// than a canvas-shaped copy of it. The channel tokens hold space-separated RGB — `0 240 255` —
// which is what lets one read serve both an opaque rgb() and the two translucent stops.
function cssVar(name, fallback) {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  } catch (e) {
    return fallback;
  }
}

// chartPalette resolves the four colours for the theme in force right now. The gradient needs
// the 2d context because a CanvasGradient belongs to the context that made it — it cannot be
// built once and reused after a theme flip, which is why this returns a factory rather than a
// value and why applyChartTheme has to call it again rather than mutating a stored stop.
function chartPalette(ctx) {
  const cyan = cssVar('--c-cyan-400', '0 240 255');
  const gradient = ctx.createLinearGradient(0, 0, 0, 220);
  gradient.addColorStop(0, 'rgba(' + cyan.replace(/\s+/g, ',') + ', 0.45)');
  gradient.addColorStop(1, 'rgba(' + cyan.replace(/\s+/g, ',') + ', 0)');
  return {
    line: 'rgb(' + cyan + ')',
    fill: gradient,
    // --border-color is already a full rgba() and already flips: a translucent sky in dark,
    // a translucent slate in light. Reusing it means the gridlines match the hairline on
    // every card around the chart instead of approximating it.
    grid: cssVar('--border-color', 'rgba(255,255,255,0.05)'),
    tick: 'rgb(' + cssVar('--c-slate-400', '100 116 139') + ')'
  };
}

// Re-colour in place on a theme change. update('none') skips the animation, which matters
// here: the whole chart's colours change at once, and animating that reads as a flash.
//
// The context is looked up from the DOM rather than off qpsChart.ctx — Chart.js does expose
// it, but the canvas is the thing that is actually needed and initChart already proves that
// lookup works, so there is no version-specific property standing between a theme flip and a
// legible graph.
function applyChartTheme() {
  if (!qpsChart) return;
  try {
    const canvas = document.getElementById('qpsChart');
    if (!canvas) return;
    const pal = chartPalette(canvas.getContext('2d'));
    const ds = qpsChart.data.datasets[0];
    ds.borderColor = pal.line;
    ds.backgroundColor = pal.fill;
    qpsChart.options.scales.y.grid.color = pal.grid;
    qpsChart.options.scales.y.ticks.color = pal.tick;
    qpsChart.update('none');
  } catch (e) { /* a chart that fails to re-colour is still a readable chart */ }
}

document.addEventListener('whiteprivatedns:theme', applyChartTheme);

function initChart() {
  try {
    const canvas = document.getElementById('qpsChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (typeof Chart === 'undefined') {
      console.warn('Chart.js not yet available');
      return;
    }

    const pal = chartPalette(ctx);

    // One point per poll, and the poll is now 1 Hz — so the point count is the chart's
    // window in seconds. 25 points was a fifty-second window while polling every two
    // seconds; keeping 25 would have silently halved it to twenty-five. Sixty is a
    // minute, which is a span worth reading and is what the panel's subtitle claims.
    const labels = Array.from({ length: QPS_CHART_POINTS }, () => '');
    const data = Array.from({ length: QPS_CHART_POINTS }, () => 0);

    qpsChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'QPS',
          data: data,
          borderColor: pal.line,
          borderWidth: 2,
          backgroundColor: pal.fill,
          fill: true,
          tension: 0.4,
          pointRadius: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        // update('none') already skips the tween, but the option is what
        // keeps Chart.js from arming its animator at all — the cheaper of
        // the two on the 1-core VPS this dashboard runs on.
        animation: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { display: false },
          y: {
            beginAtZero: true,
            grid: { color: pal.grid },
            ticks: { color: pal.tick, font: { size: 10, family: 'JetBrains Mono' } }
          }
        }
      }
    });
  } catch (e) {
    console.warn('Chart init error:', e);
  }
}

function pushChartData(val) {
  // The chart lives on the Dash view; painting it while another tab is
  // showing spends a canvas render per second on a picture nobody sees.
  // The poll keeps running (the tiles read the same response), so the
  // chart simply resumes on return.
  if (activeDashTab !== 'dashboard') return;
  if (!qpsChart) {
    initChart();
    if (!qpsChart) return;
  }
  // Chart.js draws no point for null and keeps the line's scale honest; pushing an
  // undefined or a NaN instead makes the axis collapse and the last few seconds of
  // real load disappear with it.
  const point = (typeof val === 'number' && isFinite(val) && val >= 0) ? val : null;
  try {
    const d = qpsChart.data.datasets[0].data;
    d.shift();
    d.push(point);
    qpsChart.update('none');
  } catch (e) {}
}
