import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderGuide } from './render-guide.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const assets = {
  'web/js/app.js': ['web/src/app/00-core.js', 'web/src/app/01-auth.js', 'web/src/app/02-config.js', 'web/src/app/03-rules.js', 'web/src/app/04-stats.js', 'web/src/app/05-stream.js', 'web/src/app/06-chart.js', 'web/src/app/07-navigation.js', 'web/src/app/08-forms.js', 'web/src/app/09-diagnostics.js', 'web/src/app/10-clients.js', 'web/src/app/11-feedback.js', 'web/src/app/12-final.js'],
  'web/js/i18n.js': ['web/src/i18n/dictionary.js', 'web/src/i18n/engine.js'],
  'web/css/style.css': ['web/src/css/tokens.css', 'web/src/css/light.css', 'web/src/css/components.css'],
  'web/index.html': ['web/src/html/00-document.html', 'web/src/html/01-modals.html', 'web/src/html/02-sidebar.html', 'web/src/html/03-shell.html', 'web/src/html/04-dashboard.html', 'web/src/html/05-clients.html', 'web/src/html/06-policies.html', 'web/src/html/07-stream.html', 'web/src/html/08-api.html', 'web/src/html/09-rules.html', 'web/src/html/10-connect.html'],
};

const check = process.argv.includes('--check');
if (process.argv.length > (check ? 3 : 2)) {
  console.error('Usage: node tools/build-web-assets.mjs [--check]');
  process.exit(2);
}

let stale = false;
for (const [target, parts] of Object.entries(assets)) {
  const contents = Buffer.concat(await Promise.all(parts.map(part => readFile(join(root, part)))));
  const destination = join(root, target);
  if (check) {
    const current = await readFile(destination);
    if (!current.equals(contents)) {
      console.error(`${target} is out of date; run node tools/build-web-assets.mjs`);
      stale = true;
    }
  } else {
    await writeFile(destination, contents);
    console.log(`Built ${target}`);
  }
}
const guideTarget = join(root, 'web/guide-fa.html');
const guideSource = await readFile(join(root, 'docs/DASHBOARD_GUIDE.fa.md'), 'utf8');
const guideContents = Buffer.from(renderGuide(guideSource));
if (check) {
  const current = await readFile(guideTarget);
  if (!current.equals(guideContents)) {
    console.error('web/guide-fa.html is out of date; run node tools/build-web-assets.mjs');
    stale = true;
  }
} else {
  await writeFile(guideTarget, guideContents);
  console.log('Built web/guide-fa.html');
}
if (stale) process.exitCode = 1;
