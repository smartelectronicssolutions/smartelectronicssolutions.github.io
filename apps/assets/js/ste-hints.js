/* ste-hints.js — Static ASD-STE100 Technical English Hint Checker (SES)
 * Zero-AI, WebKit-safe (no regex lookbehinds), classic script exposing window.SESte
 * (and module.exports for Node parity tests). Never modifies input values or blocks saves.
 */
(function (root) {
  "use strict";

  var META_HEADERS = /^\s*(?:CONTACTS|FILES|EQUIPMENT|DEVICES|PARTS|LINKS|REFERENCES)(?:\s*\([^)]*\))?\s*:?\s*$/;
  var INSTR_HEADERS = /\b(?:STEPS|PROCEDURE|HOW\s+TO|BEFORE\s+YOU\s+GO|CHECKLIST|INSTALLATION|INSTRUCTIONS)\b/i;
  var ALLCAPS_HEADER = /^\s*[A-Z][A-Z0-9 /()&-]{1,44}:?\s*$/;
  var FENCE_RE = /^\s*(`{3,}|~{3,})/;
  var NUMBERED_RE = /^\s*\d{1,2}[.)]\s+/;
  var BULLET_PREFIX_RE = /^\s*(?:\d{1,2}[.)]|[-*\u2022])\s+/;

  var IMPERATIVE_START_RE = /^(?:Check|Verify|Connect|Disconnect|Plug|Unplug|Run|Open|Close|Click|Tap|Press|Select|Enter|Type|Set|Configure|Install|Remove|Delete|Erase|Format|Wipe|Reboot|Restart|Reset|Replace|Swap|Mount|Label|Test|Confirm|Ensure|Make|Use|Copy|Move|Save|Upload|Download|Turn|Switch|Power|Assign|Ping|Update|Upgrade|Disable|Enable|Stop|Start|Kill|Publish|Overwrite|Drop|Cut|Follow|Read|Record|Inspect|Measure|Trace|Patch)\b/;
  var PROHIBITION_RE = /^(?:Do\s+not|Don['\u2019]t|Never)\b/i;
  var RISKY_START_RE = /^(Delete|Erase|Format|Wipe|Disconnect|Unplug|Cut|Remove|Reboot|Reset|Overwrite|Drop|Kill|Publish)\b/i;
  var WARN_LINE_RE = /(?:\b(?:WARNING|CAUTION)\s*:|\[!(?:WARNING|CAUTION)\])/i;

  var VAGUE_STATUS_RE = /\b(confirmed\s+(?:working|good|ok|okay|operational|online|up|fixed)|(?:looks|looked|seems|seemed|appears|appeared)\s+(?:good|fine|ok|okay|normal|working|stable)|should\s+be\s+(?:fine|good|ok|okay|working|all\s+set)|all\s+set\s+now)\b/gi;

  var PHRASAL_SPECS = [
    { rx: /\b(hook(?:s|ed|ing)?\s+up)\b/gi, repl: "connect", grp: 1 },
    { rx: /\b((?:find(?:s|ing)?|found)\s+out)\b/gi, repl: "find / determine", grp: 1 },
    { rx: /\b(swap(?:s|ped|ping)?\s+(?:in|out))\b/gi, repl: "install / replace", grp: 1 },
    { rx: /\b(figure(?:s|d|ing)?\s+out)\b/gi, repl: "determine", grp: 1 },
    { rx: /\b((?:spin(?:s|ning)?|spun)\s+up)\b/gi, repl: "start / create", grp: 1 },
    { rx: /\b(boot(?:s|ed|ing)?\s+up)\b/gi, repl: "start", grp: 1 },
    { rx: /\b(power(?:s|ed|ing)?\s+up)\b/gi, repl: "power on / start", grp: 1 },
    { rx: /\b(track(?:s|ed|ing)?\s+down)\b/gi, repl: "locate", grp: 1 },
    { rx: /(^|[\s,;:(])(set(?:s|ting)?\s+up)\b/gi, repl: "configure / install", grp: 2 }
  ];
  var NOUN_SETUP_PREFIX = /\b(?:a|an|the|this|that|our|your|my|site)\s+$/i;

  var STATE_ADJ = {
    off: 1, on: 1, open: 1, closed: 1, ready: 1, online: 1, offline: 1, up: 1, down: 1,
    good: 1, bad: 1, lit: 1, dark: 1, empty: 1, full: 1, required: 1, needed: 1, expected: 1
  };
  var PASSIVE_RE = /\b((?:is|are|was|were|be|been|being)\s+(?:not\s+|never\s+|already\s+|now\s+)?([a-z]{3,}ed|written|sent|taken|made|run|built|kept|left|put|cut|shut|split|found|held|told|shown|known|given|broken|chosen|driven|fallen|forgotten|frozen|gotten|hidden|spoken|stolen|torn|worn))\b/gi;
  var BY_DOER_RE = /^\s+by\s+[A-Za-z0-9_]/i;
  var MODAL_RE = /\b(should|might|could)\b/gi;
  var NOT_AHEAD_RE = /^(?:\s+not\b|n['\u2019]t\b)/i;

  var INLINE_CODE_RE = /`[^`]+`/g;
  var DQUOTE_RE = /"[^"\n]{1,140}"|\u201c[^\u201d\n]{1,140}\u201d/g;
  var URL_RE = /https?:\/\/[^\s<>)\]]+/g;
  var WO_RE = /\bWO\s*#[A-Za-z0-9_-]+/gi;
  var MAC_RE = /\b(?:[0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}\b/g;
  var IP_RE = /\b\d{1,3}(?:\.\d{1,3}){3}(?:\/\d{1,2})?\b/g;
  var VER_RE = /\b\d+(?:\.\d+)+\b/g;
  var WINPATH_RE = /\b[A-Za-z]:[\\/][^\s,;)]+/g;
  var UNIXPATH_RE = /(^|[\s(])((?:\.{0,2}\/)[A-Za-z0-9_./-]+|[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_./-]+)/g;
  var FILEEXT_RE = /\b[A-Za-z0-9_-]+\.(?:html|js|css|py|ps1|json|md|txt|csv|pdf|png|jpg|jpeg|zip|exe|bat|sh|yml|yaml)\b/gi;
  var PART_RE = /\b(?:[A-Z]{2,}[0-9A-Z-]*-[0-9A-Z-]+|[A-Za-z]+-\d+[A-Za-z0-9-]*)\b/g;
  var WORD_RE = /[A-Za-z0-9'\u2019-]+/g;
  var SENT_SPLIT_RE = /[.!?]+(?:\s+|$)/;

  function repeatQ(n) {
    return new Array(n + 1).join("Q");
  }

  function stripTrailPunct(tok) {
    var trimmed = tok.replace(/[.,;:!?)]+$/, "");
    return [trimmed, tok.slice(trimmed.length)];
  }

  function repTok(label) {
    return function (m) {
      var p = stripTrailPunct(m);
      return label + p[1];
    };
  }

  function maskTechnical(line) {
    var s = line.replace(INLINE_CODE_RE, function (m) { return repeatQ(m.length); });
    s = s.replace(DQUOTE_RE, function (m) { return repeatQ(m.length); });
    s = s.replace(URL_RE, repTok("TECHURL"));
    s = s.replace(WO_RE, "TECHWO");
    s = s.replace(MAC_RE, "TECHMAC");
    s = s.replace(IP_RE, "TECHIP");
    s = s.replace(VER_RE, "TECHVER");
    s = s.replace(WINPATH_RE, repTok("TECHPATH"));
    s = s.replace(UNIXPATH_RE, function (_, pre, path) {
      var p = stripTrailPunct(path);
      return pre + "TECHPATH" + p[1];
    });
    s = s.replace(FILEEXT_RE, "TECHFILE");
    s = s.replace(PART_RE, "TECHPART");
    return s;
  }

  function checkSte(text, opts) {
    if (!text || !String(text).trim()) return [];
    var mode = (opts && opts.mode) || "auto";
    var prefix = (opts && opts.prefix) ? String(opts.prefix) + " " : "";
    var rawLines = String(text).split(/\r?\n/);
    var idx = 0;

    if (rawLines.length && rawLines[0].trim() === "---") {
      for (var j = 1; j < Math.min(rawLines.length, 60); j++) {
        if (rawLines[j].trim() === "---") { idx = j + 1; break; }
      }
    }

    var hints = [];
    var inFence = false, fenceMarker = "";
    var metaSection = false;
    var instrSection = (mode === "steps");

    for (var lineNo = idx + 1; lineNo <= rawLines.length; lineNo++) {
      var raw = rawLines[lineNo - 1];
      var stripped = raw.trim();

      var fm = FENCE_RE.exec(raw);
      if (fm) {
        var marker = fm[1].charAt(0);
        if (!inFence) { inFence = true; fenceMarker = marker; }
        else if (marker === fenceMarker) { inFence = false; fenceMarker = ""; }
        continue;
      }
      if (inFence || !stripped) continue;

      if (stripped.charAt(0) === "#") {
        var htext = stripped.replace(/^#+\s*/, "").trim();
        metaSection = META_HEADERS.test(htext);
        instrSection = (mode === "steps") || INSTR_HEADERS.test(htext);
        continue;
      }

      if (stripped.charAt(0) === ">" || stripped.charAt(0) === "|") continue;

      if (ALLCAPS_HEADER.test(stripped) && stripped.length <= 45 && stripped.charAt(stripped.length - 1) !== ".") {
        metaSection = META_HEADERS.test(stripped);
        instrSection = (mode === "steps") || INSTR_HEADERS.test(stripped);
        continue;
      }

      if (metaSection) continue;

      var masked = maskTechnical(raw);
      var bodyNoMarker = masked.replace(BULLET_PREFIX_RE, "").trim();
      var rawNoMarker = stripped.replace(BULLET_PREFIX_RE, "").trim();
      if (!bodyNoMarker) continue;

      var isNumbered = NUMBERED_RE.test(raw);
      var isProhibition = PROHIBITION_RE.test(rawNoMarker);
      var isImperative = isProhibition || IMPERATIVE_START_RE.test(rawNoMarker);
      var hasYouModal = /\byou\s+(?:should|might|could)\b/i.test(bodyNoMarker);
      var isWarnBanner = /^\s*(?:[-*\u2022]\s*)?(?:WARNING|CAUTION)\s*:/i.test(raw);
      var isStep = ((mode === "steps") || instrSection || isNumbered || isImperative) && !isWarnBanner;
      var isInstr = (isStep || hasYouModal) && !isWarnBanner;

      // 1. Missing WARNING / CAUTION before risky imperative step
      if (isStep && !isProhibition) {
        var rm = RISKY_START_RE.exec(rawNoMarker);
        if (rm && !WARN_LINE_RE.test(raw)) {
          var hasWarn = false, backChecked = 0, k = lineNo - 2;
          while (k >= idx && backChecked < 3) {
            var prev = rawLines[k].trim();
            k--;
            if (!prev) continue;
            backChecked++;
            if (WARN_LINE_RE.test(prev)) { hasWarn = true; break; }
          }
          if (!hasWarn) {
            hints.push({
              line: lineNo,
              rule: "missing_warning",
              match: rm[1],
              message: prefix + 'L' + lineNo + ': Risky step ("' + rm[1] + '...") has no WARNING: or CAUTION: before it.'
            });
          }
        }
      }

      // 2. Vague status claims
      VAGUE_STATUS_RE.lastIndex = 0;
      var vm;
      while ((vm = VAGUE_STATUS_RE.exec(bodyNoMarker)) !== null) {
        hints.push({
          line: lineNo,
          rule: "vague_status",
          match: vm[1],
          message: prefix + 'L' + lineNo + ': Vague status ("' + vm[1] + '") — state exact observation (e.g. "operated correctly when I left").'
        });
      }

      // 3. Phrasal verbs
      for (var psi = 0; psi < PHRASAL_SPECS.length; psi++) {
        var spec = PHRASAL_SPECS[psi];
        spec.rx.lastIndex = 0;
        var pm;
        while ((pm = spec.rx.exec(bodyNoMarker)) !== null) {
          var found = pm[spec.grp];
          if (spec.grp === 2) {
            var leadLen = pm[1] ? pm[1].length : 0;
            var before = bodyNoMarker.slice(0, pm.index + leadLen);
            if (NOUN_SETUP_PREFIX.test(before)) continue;
          }
          hints.push({
            line: lineNo,
            rule: "phrasal_verb",
            match: found,
            message: prefix + 'L' + lineNo + ': Phrasal verb ("' + found + '") — prefer one verb (' + spec.repl + ').'
          });
        }
      }

      // 4. Sentence word-count caps
      var cap = isStep ? 20 : 25;
      var sents = bodyNoMarker.split(SENT_SPLIT_RE);
      for (var si = 0; si < sents.length; si++) {
        var st = sents[si].trim();
        if (!st) continue;
        var words = st.match(WORD_RE) || [];
        if (words.length > cap) {
          hints.push({
            line: lineNo,
            rule: "long_sentence",
            match: words.length + " words",
            message: prefix + "L" + lineNo + ": Long sentence (" + words.length + " words; STE max " + cap + ") — split into two sentences."
          });
        }
      }

      // 5 & 6. Instruction-gated passive voice & weak modals
      if (isInstr) {
        PASSIVE_RE.lastIndex = 0;
        var pmatch;
        while ((pmatch = PASSIVE_RE.exec(bodyNoMarker)) !== null) {
          var phrase = pmatch[1];
          var part = pmatch[2].toLowerCase();
          if (STATE_ADJ[part]) continue;
          var afterP = bodyNoMarker.slice(pmatch.index + pmatch[0].length, pmatch.index + pmatch[0].length + 36);
          if (BY_DOER_RE.test(afterP)) continue;
          hints.push({
            line: lineNo,
            rule: "passive",
            match: phrase,
            message: prefix + 'L' + lineNo + ': Passive voice ("' + phrase + '") without a named doer — use active voice.'
          });
        }

        MODAL_RE.lastIndex = 0;
        var mm;
        while ((mm = MODAL_RE.exec(bodyNoMarker)) !== null) {
          var mw = mm[1];
          var afterM = bodyNoMarker.slice(mm.index + mm[0].length, mm.index + mm[0].length + 12);
          if (mw.toLowerCase() === "could" && NOT_AHEAD_RE.test(afterM)) continue;
          hints.push({
            line: lineNo,
            rule: "weak_modal",
            match: mw,
            message: prefix + 'L' + lineNo + ': Weak modal ("' + mw + '") — write a direct step or an "If ..., <action>" condition.'
          });
        }
      }
    }
    return hints;
  }

  function injectStyles() {
    if (typeof document === "undefined" || document.getElementById("se-ste-style")) return;
    var st = document.createElement("style");
    st.id = "se-ste-style";
    st.textContent =
      ".ste-hint{margin:6px 0 4px;padding:5px 10px;border:1px solid var(--border,#334155);border-radius:8px;background:var(--surface,rgba(255,255,255,.03));font-size:12.5px;line-height:1.4;color:var(--muted,#94a3b8)}" +
      ".ste-hint[hidden]{display:none!important}" +
      ".ste-hint>summary{cursor:pointer;user-select:none;font-weight:600;color:var(--accent,#eab308)}" +
      ".ste-hint>ul{margin:6px 0 2px;padding-left:18px}" +
      ".ste-hint>ul>li{margin:3px 0;color:var(--text,inherit)}";
    document.head.appendChild(st);
  }

  function renderSteHint(detailsEl, hints) {
    if (!detailsEl) return;
    injectStyles();
    if (!hints || !hints.length) {
      detailsEl.hidden = true;
      detailsEl.open = false;
      return;
    }
    var sum = detailsEl.querySelector("summary");
    var ul = detailsEl.querySelector("ul");
    if (!sum) { sum = document.createElement("summary"); detailsEl.appendChild(sum); }
    if (!ul) { ul = document.createElement("ul"); detailsEl.appendChild(ul); }
    var n = hints.length;
    sum.textContent = "STE writing " + (n === 1 ? "hint (1)" : "hints (" + n + ")") + " — non-blocking";
    ul.innerHTML = "";
    var maxShow = Math.min(n, 12);
    for (var i = 0; i < maxShow; i++) {
      var li = document.createElement("li");
      li.textContent = hints[i].message;
      ul.appendChild(li);
    }
    if (n > maxShow) {
      var more = document.createElement("li");
      more.textContent = "… +" + (n - maxShow) + " more";
      ul.appendChild(more);
    }
    detailsEl.hidden = false;
  }

  var api = { check: checkSte, render: renderSteHint };
  if (typeof root !== "undefined" && root) root.SESte = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
