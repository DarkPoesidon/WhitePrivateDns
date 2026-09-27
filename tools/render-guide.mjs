// Render the checked-in Persian operator guide as an offline dashboard asset.
// This deliberately supports only the Markdown constructs used by that document.
// Escape all source text before adding our own markup.
const escapeHTML = value => value.replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);

function inline(source) {
  let value = escapeHTML(source);
  value = value.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, rawURL) => {
    const url = rawURL.endsWith('.md')
      ? 'https://github.com/DarkPoesidon/WhitePrivateDns/blob/main/docs/' + rawURL
      : rawURL;
    if (!/^https:\/\/[A-Za-z0-9./_?=&%-]+$/.test(url)) return label;
    return '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + label + '</a>';
  });
  value = value.replace(/`([^`]+)`/g, '<code>$1</code>');
  value = value.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  return value;
}

function tableRow(line, tag) {
  const cells = line.slice(1, -1).split('|').map(cell => cell.trim());
  return '<tr>' + cells.map(cell => '<' + tag + '>' + inline(cell) + '</' + tag + '>').join('') + '</tr>';
}

export function renderGuide(markdown) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const body = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (line.startsWith('```')) {
      const code = [];
      while (++i < lines.length && !lines[i].trim().startsWith('```')) code.push(lines[i]);
      body.push('<pre><code>' + escapeHTML(code.join('\n')) + '</code></pre>');
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      body.push('<h' + level + '>' + inline(heading[2]) + '</h' + level + '>');
      continue;
    }
    if (line.startsWith('|') && lines[i + 1]?.trim().match(/^\|\s*:?-{3,}/)) {
      const rows = ['<div class="table-wrap"><table><thead>', tableRow(line, 'th'), '</thead><tbody>'];
      i += 2; // Skip the Markdown alignment row.
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(tableRow(lines[i].trim(), 'td'));
        i++;
      }
      i--;
      rows.push('</tbody></table></div>');
      body.push(rows.join(''));
      continue;
    }
    if (/^(\d+\.|-)\s/.test(line)) {
      const ordered = /^\d+\./.test(line);
      const tag = ordered ? 'ol' : 'ul';
      const items = [];
      while (i < lines.length && (ordered ? /^\d+\.\s/.test(lines[i].trim()) : /^-\s/.test(lines[i].trim()))) {
        items.push('<li>' + inline(lines[i].trim().replace(/^(\d+\.|-)\s+/, '')) + '</li>');
        i++;
      }
      i--;
      body.push('<' + tag + '>' + items.join('') + '</' + tag + '>');
      continue;
    }
    body.push('<p>' + inline(line) + '</p>');
  }

  return '<!doctype html>\n<html lang="fa" dir="rtl"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>راهنمای پنل WhitePrivateDns</title><style>' +
    '@font-face{font-family:Vazirmatn;src:url("fonts/vazirmatn-var.woff2") format("woff2");font-display:swap}' +
    ':root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0c1210;color:#eef5f0;font-family:Vazirmatn,system-ui,sans-serif;line-height:1.9}' +
    'main{max-width:1100px;margin:auto;padding:28px 20px 80px}nav{margin-bottom:32px}a{color:#55d997;text-underline-offset:4px}a:hover{color:#86f0b7}' +
    'h1,h2,h3{line-height:1.4;color:#fff}h1{font-size:2rem;margin:0 0 26px}h2{font-size:1.4rem;margin:44px 0 16px;border-bottom:1px solid #294638;padding-bottom:9px}h3{font-size:1.1rem;margin-top:30px}' +
    'p,li{font-size:1rem}li{padding-inline-start:4px;margin:4px 0}ul,ol{padding-inline-start:25px}' +
    '.table-wrap{overflow-x:auto;border:1px solid #294638;border-radius:12px;margin:22px 0}table{width:100%;border-collapse:collapse;min-width:620px}th,td{text-align:start;vertical-align:top;padding:11px 14px;border-bottom:1px solid #294638}th{background:#173125;color:#b7efce}tr:last-child td{border-bottom:0}' +
    'code,pre{font-family:ui-monospace,Consolas,monospace;direction:ltr;unicode-bidi:embed}code{background:#183126;color:#9cf2bf;padding:1px 5px;border-radius:4px;overflow-wrap:anywhere}' +
    'pre{background:#101e17;border:1px solid #294638;border-radius:12px;padding:18px;overflow:auto;line-height:1.6}pre code{background:none;padding:0;color:#e7f6ec}' +
    '@media(max-width:640px){main{padding:20px 14px 56px}h1{font-size:1.55rem}h2{font-size:1.2rem}p,li{font-size:.94rem}}' +
    '</style></head><body><main><nav><a href="./">← بازگشت به پنل</a></nav>' +
    body.join('\n') + '</main></body></html>\n';
}
