  /* ------------------------------------------------------------------ engine */

  var LANG_KEY = 'whiteprivatedns_lang';
  var THEME_KEY = 'whiteprivatedns_theme';
  var ATTRS = ['placeholder', 'title', 'aria-label'];

  /* Subtrees whose text is not prose. CODE and PRE hold shell and Python snippets an
     operator copies verbatim; translating a word inside one would hand them a command
     that does not run. TEXTAREA content is user data. SVG holds path geometry. */
  var SKIP = { SCRIPT: 1, STYLE: 1, CODE: 1, PRE: 1, TEXTAREA: 1, svg: 1, CANVAS: 1 };

  var lang = 'en';
  var applying = false;
  var observer = null;

  function lookup(raw) {
    var s = raw.trim();
    if (!s) return null;
    var hit = FA[s];
    if (hit !== undefined) return hit;
    for (var i = 0; i < FA_PATTERNS.length; i++) {
      if (FA_PATTERNS[i][0].test(s)) return s.replace(FA_PATTERNS[i][0], FA_PATTERNS[i][1]);
    }
    return null;
  }

  function skipped(node) {
    var p = node.nodeType === 1 ? node : node.parentNode;
    for (; p && p.nodeType === 1; p = p.parentNode) {
      if (SKIP[p.nodeName] || SKIP[p.nodeName.toLowerCase()]) return true;
      if (p.hasAttribute('data-no-i18n')) return true;
    }
    return false;
  }

  /* A translated node keeps its English on itself. The alternative — a Persian→English
     reverse map — cannot work here: several English strings share one Persian rendering
     ('Cancel' and 'CANCEL' both become 'انصراف'), so reversing would be a guess. */
  function textNode(node) {
    var cur = node.nodeValue;
    if (!cur || !cur.trim()) return;
    var orig = node.__i18nOrig;
    var mine = orig !== undefined && cur === node.__i18nOut;

    if (lang === 'en') {
      if (mine) node.nodeValue = orig;
      return;
    }
    /* Already carrying our own output — nothing to do. Anything else means the app
       rewrote this node since we last saw it, so `cur` is the new English source and
       the old cache is stale. */
    if (mine) return;

    var fa = lookup(cur);
    if (fa === null) {
      node.__i18nOrig = undefined;
      node.__i18nOut = undefined;
      return;
    }
    var trimmed = cur.trim();
    node.__i18nOrig = cur;
    node.__i18nOut = cur.replace(trimmed, function () { return fa; });
    node.nodeValue = node.__i18nOut;
  }

  function attrs(el) {
    var cache = el.__i18nAttrs;
    for (var i = 0; i < ATTRS.length; i++) {
      var name = ATTRS[i];
      if (!el.hasAttribute(name)) continue;
      var cur = el.getAttribute(name);
      var slot = cache && cache[name];
      var mine = slot && cur === slot.out;

      if (lang === 'en') {
        if (mine) el.setAttribute(name, slot.src);
        continue;
      }
      if (mine) continue;
      var fa = lookup(cur);
      if (fa === null) continue;
      if (!cache) cache = el.__i18nAttrs = {};
      cache[name] = { src: cur, out: fa };
      el.setAttribute(name, fa);
    }
  }

  function walk(root) {
    if (root.nodeType === 3) { if (!skipped(root)) textNode(root); return; }
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    if (root.nodeType === 1 && skipped(root)) return;
    if (root.nodeType === 1) attrs(root);
    /* One TreeWalker per subtree, filtered in the walker rather than in the callback so
       a skipped element's whole subtree is rejected once instead of re-walked per node. */
    var w = document.createTreeWalker(root, 5 /* ELEMENT | TEXT */, {
      acceptNode: function (n) {
        if (n.nodeType === 1) {
          return (SKIP[n.nodeName] || SKIP[n.nodeName.toLowerCase()] ||
            n.hasAttribute('data-no-i18n')) ? 2 /* REJECT */ : 1 /* ACCEPT */;
        }
        return n.nodeValue && n.nodeValue.trim() ? 1 : 3 /* SKIP */;
      }
    });
    var n;
    while ((n = w.nextNode())) {
      if (n.nodeType === 1) attrs(n); else textNode(n);
    }
  }

  function applyDir() {
    var html = document.documentElement;
    html.setAttribute('lang', lang === 'fa' ? 'fa' : 'en');
    html.setAttribute('dir', lang === 'fa' ? 'rtl' : 'ltr');
  }

  function applyLang(next, persist) {
    lang = next === 'fa' ? 'fa' : 'en';
    if (persist !== false) {
      try { localStorage.setItem(LANG_KEY, lang); } catch (e) { /* private mode */ }
    }
    applying = true;
    try {
      applyDir();
      walk(document.documentElement);
    } finally {
      applying = false;
    }
    syncSwitchLabels();
    document.dispatchEvent(new CustomEvent('whiteprivatedns:lang', { detail: { lang: lang } }));
  }

  /* The panel re-renders the query stream, the client grid and the upstream list on a
     timer, so translation cannot be a one-shot pass. The observer is cheap because the
     filter rejects the numeric stat nodes that change most often — they never match a
     dictionary key, so `lookup` fails on a trim and a hash miss. */
  function startObserver() {
    if (observer || typeof MutationObserver !== 'function') return;
    observer = new MutationObserver(function (records) {
      if (applying || lang === 'en') return;
      applying = true;
      try {
        for (var i = 0; i < records.length; i++) {
          var r = records[i];
          if (r.type === 'characterData') {
            if (!skipped(r.target)) textNode(r.target);
            continue;
          }
          if (r.type === 'attributes') {
            if (r.target.nodeType === 1 && !skipped(r.target)) attrs(r.target);
            continue;
          }
          for (var j = 0; j < r.addedNodes.length; j++) walk(r.addedNodes[j]);
        }
      } finally {
        applying = false;
      }
    });
    observer.observe(document.documentElement, {
      childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ATTRS
    });
  }
  /* ------------------------------------------------------------------- theme */

  var theme = 'dark';

  function applyTheme(next, persist) {
    theme = next === 'light' ? 'light' : 'dark';
    var html = document.documentElement;
    html.setAttribute('data-theme', theme);
    /* Tailwind's own `dark` class is still on the element even though no dark: variant
       is used in this markup — leaving it consistent costs nothing and means a future
       dark:… utility behaves. */
    html.classList.toggle('dark', theme === 'dark');
    if (persist !== false) {
      try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* private mode */ }
    }
    syncSwitchLabels();
    document.dispatchEvent(new CustomEvent('whiteprivatedns:theme', { detail: { theme: theme } }));
  }

  /* --------------------------------------------------------------- switch UI */

  /* Both switches are addressed by attribute rather than by id, and the reason is that
     there are two of each: the sidebar carries one pair for a desktop viewport and the
     mobile header carries another, and only one of the two is ever visible. An id would
     have to be unique, so the second copy would need a second name, and every function
     below would then have to know both. */
  function syncSwitchLabels() {
    var toggles = document.querySelectorAll('[data-theme-toggle]');
    var toLight = theme === 'dark';
    var label = toLight
      ? (lang === 'fa' ? 'تغییر به پوستهٔ روشن' : 'Switch to light theme')
      : (lang === 'fa' ? 'تغییر به پوستهٔ تیره' : 'Switch to dark theme');
    for (var i = 0; i < toggles.length; i++) {
      var t = toggles[i];
      t.setAttribute('title', label);
      t.setAttribute('aria-label', label);
      t.setAttribute('aria-pressed', theme === 'light' ? 'true' : 'false');
      var icon = t.querySelector('[data-feather], svg');
      if (icon && icon.tagName.toLowerCase() === 'i') {
        icon.setAttribute('data-feather', toLight ? 'sun' : 'moon');
      }
      /* The cached original would otherwise fight the label we just wrote. */
      if (t.__i18nAttrs) t.__i18nAttrs = undefined;
    }
    var l = document.querySelectorAll('[data-lang-btn]');
    for (var j = 0; j < l.length; j++) {
      var on = l[j].getAttribute('data-lang-btn') === lang;
      l[j].setAttribute('aria-pressed', on ? 'true' : 'false');
      l[j].classList.toggle('is-active', on);
    }
  }

  function wireSwitches() {
    var toggles = document.querySelectorAll('[data-theme-toggle]');
    for (var i = 0; i < toggles.length; i++) {
      if (toggles[i].__i18nWired) continue;
      toggles[i].__i18nWired = true;
      toggles[i].addEventListener('click', function () {
        applyTheme(theme === 'dark' ? 'light' : 'dark');
        /* The icon name was just swapped by syncSwitchLabels; nothing redraws it but this. */
        if (typeof window.safeFeatherReplace === 'function') window.safeFeatherReplace();
      });
    }
    var l = document.querySelectorAll('[data-lang-btn]');
    for (var j = 0; j < l.length; j++) {
      if (l[j].__i18nWired) continue;
      l[j].__i18nWired = true;
      l[j].addEventListener('click', function () {
        applyLang(this.getAttribute('data-lang-btn'));
      });
    }
    syncSwitchLabels();
  }
  /* -------------------------------------------------------------------- init */

  function stored(key, fallback) {
    try {
      var v = localStorage.getItem(key);
      return v || fallback;
    } catch (e) {
      return fallback;
    }
  }

  function init() {
    /* The inline script in index.html already set data-theme, lang and dir before first
       paint so there is no flash; this only recovers the same values into module state
       and does the DOM pass the inline script cannot do (it runs before <body>). */
    theme = document.documentElement.getAttribute('data-theme') === 'light'
      ? 'light' : stored(THEME_KEY, 'dark') === 'light' ? 'light' : 'dark';
    applyTheme(theme, false);
    applyLang(stored(LANG_KEY, 'en'), false);
    wireSwitches();
    startObserver();
    if (typeof window.safeFeatherReplace === 'function') window.safeFeatherReplace();
  }

  window.HyperI18N = {
    /* t() is here for strings that never reach the DOM as text — a window.confirm, or a
       clipboard payload. Everything rendered into the page is covered by the walker, so
       app.js does not have to call this. */
    t: function (s) {
      if (lang === 'en') return s;
      var fa = lookup(s);
      return fa === null ? s : fa;
    },
    lang: function () { return lang; },
    setLang: applyLang,
    theme: function () { return theme; },
    setTheme: applyTheme,
    refresh: function (root) {
      if (lang === 'en') return;
      applying = true;
      try { walk(root || document.documentElement); } finally { applying = false; }
    },
    wire: wireSwitches
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
