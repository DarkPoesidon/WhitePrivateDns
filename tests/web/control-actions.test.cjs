const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const rulesSource = readFileSync(resolve(__dirname, '../../web/src/app/03-rules.js'), 'utf8');
const formsSource = readFileSync(resolve(__dirname, '../../web/src/app/08-forms.js'), 'utf8');
const accessHelper = formsSource.slice(formsSource.indexOf('async function saveAccessConfig('), formsSource.indexOf('function initEventListeners()'));

test('rejected policy save reports the server error and restores server state', async () => {
  const notices = [];
  let reloads = 0;
  const context = {
    currentConfig: { rules: { custom_proxied: [], custom_blocked: ['local-only.example'], custom_direct: [], custom_records: {} } },
    authToken: 'token',
    api: path => path,
    getSwitch: () => false,
    fetch: async () => ({ ok: false, status: 400 }),
    errorMessage: async () => 'The policy was rejected',
    showToast: (message, kind) => notices.push({ message, kind }),
    loadConfig: async () => {
      reloads++;
      context.currentConfig.rules.custom_blocked = ['saved.example'];
      return true;
    },
  };
  vm.runInNewContext(rulesSource, context);

  assert.equal(await context.saveRules(), false);
  assert.equal(reloads, 1);
  assert.equal(context.currentConfig.rules.custom_blocked[0], 'saved.example');
  assert.deepEqual(notices, [{ message: 'The policy was rejected', kind: 'error' }]);
});

test('policy profile success is reported only after a successful save', async () => {
  const notices = [];
  const context = {
    currentConfig: { rules: { custom_proxied: [], custom_blocked: [], custom_direct: [], custom_records: {} } },
    authToken: 'token',
    api: path => path,
    getSwitch: () => true,
    fetch: async () => ({ ok: true }),
    showToast: (message, kind) => notices.push({ message, kind }),
  };
  vm.runInNewContext(rulesSource, context);

  assert.equal(await context.saveRules('Profile activated'), true);
  assert.deepEqual(notices, [{ message: 'Profile activated', kind: 'success' }]);
});

test('rejected DoH token save leaves the displayed access config unchanged', async () => {
  const notices = [];
  let renders = 0;
  const oldAccess = { doh_tokens: ['existing'], whitelist_mode: true };
  const context = {
    currentConfig: { access: oldAccess },
    authToken: 'token',
    api: path => path,
    fetch: async () => ({ ok: false, status: 500 }),
    errorMessage: async () => 'Cannot update tokens',
    showToast: (message, kind) => notices.push({ message, kind }),
    renderConfig: () => renders++,
  };
  vm.runInNewContext(accessHelper, context);

  const nextAccess = { doh_tokens: ['existing', 'new'], whitelist_mode: true };
  assert.equal(await context.saveAccessConfig(nextAccess, 'Token added'), false);
  assert.equal(context.currentConfig.access, oldAccess);
  assert.equal(renders, 0);
  assert.deepEqual(notices, [{ message: 'Cannot update tokens', kind: 'error' }]);
});
