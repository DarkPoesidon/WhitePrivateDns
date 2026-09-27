// =======================================================
// BULLETPROOF COPY & TOAST NOTIFICATIONS
// =======================================================
function fallbackCopy(text) {
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.top = '0';
  textArea.style.left = '0';
  textArea.style.width = '2em';
  textArea.style.height = '2em';
  textArea.style.padding = '0';
  textArea.style.border = 'none';
  textArea.style.outline = 'none';
  textArea.style.boxShadow = 'none';
  textArea.style.background = 'transparent';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  try {
    document.execCommand('copy');
  } catch (err) {}
  document.body.removeChild(textArea);
}

function copyText(text, btnElement) {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text)
      .then(() => {
        showToast(`Copied!`, 'success');
      })
      .catch(() => {
        fallbackCopy(text);
        showToast(`Copied!`, 'success');
      });
  } else {
    fallbackCopy(text);
    showToast(`Copied!`, 'success');
  }

  if (btnElement) {
    btnElement.classList.add('ring-2', 'ring-cyan-400');
    setTimeout(() => {
      btnElement.classList.remove('ring-2', 'ring-cyan-400');
    }, 800);
  }
}

// Copy-to-clipboard, by delegation.
//
// The four copyable boxes in the setup guide used to carry an inline click-handler
// attribute that called copyText with the referenced element's innerText. That works,
// and it is also the reason the Content-Security-Policy still has to allow
// 'unsafe-inline' in script-src — a policy that permits inline script permits any
// inline script an injection manages to place, which is most of what a CSP is there
// to stop. Every inline handler has to go before that can be tightened, so they are
// being converted rather than left alone.
//
// One listener on document is also simply more robust than an attribute per element:
// it keeps working when a view is re-rendered, and a new copyable box becomes markup
// only. The element declares what to copy with data-copy-target="<id>".
function copyFromTarget(host) {
  const id = host.getAttribute('data-copy-target');
  const source = id ? document.getElementById(id) : null;
  // Read the referenced element, not the host: the host also contains the copy icon,
  // and on a box whose text is an IP address a stray glyph is not obvious in the
  // clipboard but is fatal when pasted into a DNS field.
  const text = ((source || host).innerText || '').trim();
  if (text) copyText(text, host);
}

document.addEventListener('click', (e) => {
  const host = e.target.closest('[data-copy-target]');
  if (host) copyFromTarget(host);
});

// The boxes are exposed as buttons, so they have to answer what a button answers.
// Space needs preventDefault or the page scrolls out from under the copy; older
// WebKit reports it as 'Spacebar'.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
  const host = e.target.closest?.('[data-copy-target]');
  if (!host) return;
  e.preventDefault();
  copyFromTarget(host);
});
