const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const app = readFileSync(resolve(__dirname, '../../web/js/app.js'), 'utf8');
const render = app.slice(app.indexOf('function renderOverviewQueries()'), app.indexOf('let overviewPendingRender'));

test('overview bounds the live preview and keeps wire values as text', () => {
  const tbody = { rows: [], replaceChildren(fragment) { this.rows = fragment.children; } };
  const element = tagName => ({ tagName, children: [], textContent: '', appendChild(child) { this.children.push(child); } });
  const document = {
    getElementById(id) { return id === 'overview-query-tbody' ? tbody : null; },
    createElement: element,
    createDocumentFragment() { return element('fragment'); },
  };
  const queries = Array.from({ length: 8 }, (_, i) => ({
    timestamp: '2026-01-01T12:00:00Z',
    domain: i === 0 ? '<img src=x onerror=alert(1)>' : `domain-${i}.example`,
    client_ip: '192.0.2.1', action: i === 0 ? 'BLOCK' : 'DIRECT', latency_ms: 12.5,
  }));
  vm.runInNewContext(`${render}\nrenderOverviewQueries()`, { document, streamBuffer: queries });
  assert.equal(tbody.rows.length, 5);
  assert.equal(tbody.rows[0].children[1].textContent, '<img src=x onerror=alert(1)>');
  assert.equal(tbody.rows[0].children[3].children[0].textContent, 'BLOCK');
  assert.match(tbody.rows[0].children[3].children[0].className, /is-blocked/);
});
