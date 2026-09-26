/* reveal.js - frost sensitive values until hover/tap (L, 2026-09-25: "I like having to hover over certain things to see
   it, like IP addresses... I wouldn't mind that being the default on all my sites"; 2026-09-26: keep it on as the standard,
   ports and the UID too, and never a clear frame first). Self-contained: injects its own CSS.
   - Automatic: IPv4 (+cidr, :port, docker ->port/tcp), host:port, bare :port, "port N", MAC, email, phone, UID-shaped
     ids (20-39 letters+digits, e.g. a Firebase uid) and long tokens found in page text get wrapped in <span class="rv">.
   - Manual: add class="reveal" to frost a whole element; data-noreveal on an ancestor skips its subtree.
   - Hover clears it; on touch a tap clears it for 6 s (tap again to hide). Skips inputs, code, scripts, editable areas.
   - v3: content rendered later (Firebase lists) is frosted INSIDE the mutation callback - a microtask, before the next
     paint - so nothing is ever drawn clear first (v2 waited 300 ms and a clear frame got into the recordings). */
(function () {
  if (window.__reveal) return;
  var css = document.createElement('style');
  css.textContent = '.rv,.reveal{filter:blur(5px);transition:filter .15s;cursor:pointer;user-select:none;-webkit-user-select:none}' +
                    '.rv:hover,.reveal:hover,.rv.on,.reveal.on{filter:none;user-select:text;-webkit-user-select:text}';
  (document.head || document.documentElement).appendChild(css);
  var IP = '(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)(?:\\.(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)){3}(?:\\/\\d{1,2})?(?::\\d{2,5})?(?:->\\d{2,5})?(?:\\/(?:tcp|udp))?';
  var PARTS = [
    IP,                                                                                 // IPv4 (+ /cidr, :port, ->port/tcp)
    '(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}',                                          // MAC
    '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}',                                   // email
    '(?:\\+1[ .-]?)?\\(?\\d{3}\\)?[ .-]\\d{3}[ .-]\\d{4}',                               // US phone
    '[A-Za-z][A-Za-z0-9.-]*:\\d{4,5}(?![\\d.])',                                          // host:port (se:3060, localhost:8765)
    '(?<![\\w.]):\\d{4,5}(?![\\d.])',                                                     // bare :port ("se :3068", ":3060/:3070")
    '(?<=\\bports?\\s+)\\d{2,5}(?![\\d.])',                                               // "port 22", "port 3060"
    '(?=[A-Za-z0-9]{20,39}(?![A-Za-z0-9]))(?=[A-Za-z]*\\d)(?=\\d*[A-Za-z])[A-Za-z0-9]{20,39}', // UID-shaped (Firebase uid = 28 letters+digits)
    '[A-Za-z0-9_-]{40,}'                                                                // token-shaped
  ];
  var RX;
  try { RX = new RegExp(PARTS.join('|'), 'g'); }
  catch (e) { RX = new RegExp(PARTS.filter(function (p) { return p.indexOf('(?<') < 0; }).join('|'), 'g'); }   // no lookbehind: skip those two
  var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, INPUT: 1, SELECT: 1, OPTION: 1, CODE: 1, PRE: 1, NOSCRIPT: 1 };
  function skip(el) {
    for (var e = el; e && e.nodeType === 1; e = e.parentNode) {
      if (SKIP[e.tagName] || e.isContentEditable || e.hasAttribute('data-noreveal') || e.classList.contains('rv')) return true;
    }
    return false;
  }
  function frostText(t) {
    var text = t.nodeValue; if (!text || text.length < 5) return 0;
    RX.lastIndex = 0;
    if (!RX.test(text)) return 0;
    RX.lastIndex = 0;
    var frag = document.createDocumentFragment(), last = 0, m, count = 0;
    while ((m = RX.exec(text))) {
      var pc = m.index ? text.charAt(m.index - 1) : '';
      // "Chrome/154.0.0.0", "v1.2.3.4", "x.1.2.3.4": a version, not an address - only for matches that start like an IP / phone
      if (/^(\d{1,3}\.|\(?\d{3}[ .-]|\+1)/.test(m[0]) && /[\/A-Za-z0-9.]/.test(pc)) continue;
      frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      var s = document.createElement('span'); s.className = 'rv'; s.textContent = m[0]; frag.appendChild(s);
      last = m.index + m[0].length; count++;
    }
    if (!count) return 0;
    frag.appendChild(document.createTextNode(text.slice(last)));
    if (t.parentNode) t.parentNode.replaceChild(frag, t);
    return count;
  }
  function frost(root) {
    root = root || document.body; if (!root) return 0;
    if (root.nodeType === 3) return skip(root.parentNode) ? 0 : frostText(root);
    if (root.nodeType !== 1 || skip(root)) return 0;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) { return n.nodeValue.length > 4 && !skip(n.parentNode) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT; }
    });
    var nodes = [], n, count = 0;
    while ((n = walker.nextNode())) nodes.push(n);
    for (var i = 0; i < nodes.length; i++) count += frostText(nodes[i]);
    return count;
  }
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('.rv, .reveal');
    if (!el) return;
    if (el.classList.toggle('on')) setTimeout(function () { el.classList.remove('on'); }, 6000);
  });
  function onMutations(muts) {
    // runs as a microtask right after the script that changed the DOM, before the browser paints: no clear frame
    for (var i = 0; i < muts.length; i++) {
      var m = muts[i];
      if (m.type === 'characterData') { if (m.target.parentNode) frost(m.target); continue; }
      for (var j = 0; j < m.addedNodes.length; j++) { var a = m.addedNodes[j]; if (a.parentNode) frost(a); }
    }
  }
  function start() {
    frost(document.body);
    new MutationObserver(onMutations).observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
  window.__reveal = {
    frost: frost, rx: RX,
    off: function () { document.querySelectorAll('.rv').forEach(function (s) { s.classList.add('on'); }); },
    on: function () { document.querySelectorAll('.rv').forEach(function (s) { s.classList.remove('on'); }); }
  };
})();
