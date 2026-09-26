/* reveal.js - frost sensitive values until hover/tap (L, 2026-09-25: "I like having to hover over certain things to see
   it, like IP addresses... I wouldn't mind that being the default on all my sites"). Self-contained: injects its own CSS.
   - Automatic: IPv4, MAC, email, phone numbers and long tokens found in page text get wrapped in <span class="rv">.
   - Manual: add class="reveal" to frost a whole element; data-noreveal on an ancestor skips its subtree.
   - Hover clears it; on touch a tap clears it for 6 s (tap again to hide). Skips inputs, code, scripts, editable areas.
   - Watches the page for content rendered later (Firebase lists), 300 ms debounce. Idempotent. */
(function () {
  if (window.__reveal) return;
  var css = document.createElement('style');
  css.textContent = '.rv,.reveal{filter:blur(5px);transition:filter .15s;cursor:pointer;user-select:none;-webkit-user-select:none}' +
                    '.rv:hover,.reveal:hover,.rv.on,.reveal.on{filter:none;user-select:text;-webkit-user-select:text}';
  (document.head || document.documentElement).appendChild(css);
  var RX = new RegExp([
    '(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)(?:\\.(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)){3}(?:\\/\\d{1,2})?',   // IPv4 (+ optional /cidr)
    '(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}',                                               // MAC
    '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}',                                        // email
    '(?:\\+1[ .-]?)?\\(?\\d{3}\\)?[ .-]\\d{3}[ .-]\\d{4}',                                    // US phone
    '[A-Za-z0-9_-]{40,}'                                                                      // token-shaped
  ].join('|'), 'g');
  var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, INPUT: 1, SELECT: 1, OPTION: 1, CODE: 1, PRE: 1, NOSCRIPT: 1 };
  function skip(el) {
    for (var e = el; e && e.nodeType === 1; e = e.parentNode) {
      if (SKIP[e.tagName] || e.isContentEditable || e.hasAttribute('data-noreveal') || e.classList.contains('rv')) return true;
    }
    return false;
  }
  function frost(root) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) { return n.nodeValue.length > 6 && !skip(n.parentNode) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT; }
    });
    var nodes = [], n;
    while ((n = walker.nextNode())) nodes.push(n);
    var count = 0;
    nodes.forEach(function (t) {
      RX.lastIndex = 0;
      if (!RX.test(t.nodeValue)) return;
      RX.lastIndex = 0;
      var frag = document.createDocumentFragment(), text = t.nodeValue, last = 0, m;
      while ((m = RX.exec(text))) {
        var pc = m.index ? text.charAt(m.index - 1) : '';
        if (/[\/A-Za-z0-9.]/.test(pc)) continue;   // "Chrome/154.0.0.0", "v1.2.3.4", "x.1.2.3.4": a version, not an address
        frag.appendChild(document.createTextNode(text.slice(last, m.index)));
        var s = document.createElement('span'); s.className = 'rv'; s.textContent = m[0]; frag.appendChild(s);
        last = m.index + m[0].length; count++;
      }
      if (!count) return;
      frag.appendChild(document.createTextNode(text.slice(last)));
      t.parentNode.replaceChild(frag, t);
    });
    return count;
  }
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('.rv, .reveal');
    if (!el) return;
    if (el.classList.toggle('on')) setTimeout(function () { el.classList.remove('on'); }, 6000);
  });
  var timer = null;
  function schedule() { clearTimeout(timer); timer = setTimeout(function () { frost(document.body); }, 300); }
  function start() {
    frost(document.body);
    new MutationObserver(function (muts) { for (var i = 0; i < muts.length; i++) if (muts[i].addedNodes.length) { schedule(); break; } })
      .observe(document.body, { childList: true, subtree: true });
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
  window.__reveal = { frost: frost, off: function () { document.querySelectorAll('.rv').forEach(function (s) { s.classList.add('on'); }); } };
})();
