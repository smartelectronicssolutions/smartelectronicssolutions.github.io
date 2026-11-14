/* avatar.js - Live2D-style 2.5D avatar renderer (plain WebGL, no SDK, no CDN). 2026-11-13, testbed.
 *
 *   const av = await Live2DAvatar.create(canvas, { base: './' });   // loads rig.json + parts/*.png
 *   av.attachAudio(audioElement);      // WebAudio analyser -> vowel mouths
 *   av.setExpression('happy', 1);      // neutral | happy | surprised | thinking  (0..1 weight, eased)
 *   av.setHead({ yaw, pitch, roll });  // manual pose (-1..1 each); av.setHead(null) = back to idle motion
 *   av.speakText(text)                 // browser speechSynthesis + text-driven visemes (fallback, no analyser)
 *   av.renderAt(t, feat)               // deterministic step for offline capture (feat = precomputed audio features)
 *   av.useAnalyser(actx, analyser, el) // page-owned WebAudio graph (one <audio> shared across avatar switches)
 *   av.pushWord(word, dur) / av.endWords()   // text-timed mouth for device speech (no audio stream to analyse)
 *   av.destroy()                       // stop + free GL (call before swapping rigs)
 *   opts.rigFile = 'rig@2x.json'       // pick a resolution variant (default rig.json); K = canvas width / 1024 scales all motion
 *   opts.noBg = true                   // skip the room plate (character floats over the page)
 *   opts.focus = [x, y]                // rig point kept in view when the stage crops the art (cover fit)
 *   opts.resolve = file => Promise<url> // optional: where rig/part files come from (default base + file)
 * 2026-11-13 voice build: mouth follows rig.mouth.line (refine_mouth.py) - per-column gap with closed corners, lower lip
 * blends into the jaw drop (no shear/doubled line), visemes crossfade instead of stepping.
 *
 * Model: every head part's vertices get a depth z = zScale * (head-ellipsoid surface) + zOff (from rig.json) and are
 * rotated in 3D (yaw/pitch) then projected with mild perspective -> near parts (glasses, front hair) sweep further than
 * the face, back hair moves the other way, the far cheek compresses. Mouth = upper lip / lower lip / drawn interior
 * driven by (open, form) params + a jaw drop warp on the face mesh. Hair lags head motion on a damped spring.
 */
(function () {
  'use strict';

  // ---------- small utils ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (cur, tgt, dt, tau) => cur + (tgt - cur) * (1 - Math.exp(-dt / Math.max(tau, 1e-4)));
  const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
  function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  const EXPRESSIONS = {   // offsets added on top of the live params, scaled by weight
    neutral: {},
    happy: { brow: 0.35, eye: -0.12, eyeScale: -0.07, smile: 1.4, open: 0.14, form: 0.8, roll: 0.04, pitch: 0.03 },
    surprised: { brow: 1.0, eye: 0.0, eyeScale: 0.08, open: 0.35, form: -0.7, pitch: 0.05 },
    thinking: { browL: 0.55, browR: -0.45, eye: -0.15, eyeX: 0.6, eyeY: -0.7, smile: -0.35, form: -0.25, roll: -0.06, yaw: -0.15, pitch: 0.06 },
  };

  // ---------- audio features (shared by live analyser + offline capture) ----------
  // db: Float32Array of dB per bin (AnalyserNode.getFloatFrequencyData scale), sr: sample rate, n: fftSize
  function bandPow(db, sr, n, f0, f1) {
    const hz = sr / n; let s = 0, c = 0;
    for (let i = Math.max(1, Math.floor(f0 / hz)); i <= Math.ceil(f1 / hz) && i < db.length; i++) { s += Math.pow(10, db[i] / 10); c++; }
    return s / Math.max(c, 1);
  }
  function features(db, sr, n) {
    const b1 = bandPow(db, sr, n, 250, 900);     // F1 zone: jaw opening (A/O high, I/U low)
    const b2 = bandPow(db, sr, n, 900, 1700);    // back-vowel F2 (O/U)
    const b3 = bandPow(db, sr, n, 1700, 3400);   // front-vowel F2/F3 (I/E)
    return { level: 10 * Math.log10(b1 + b2 + b3 + 1e-12), b1, b2, b3 };
  }

  class LipSync {   // adaptive: tracks the speaker's peak level + spectral tilt so no per-voice calibration is needed
    constructor() { this.peak = -40; this.tilt = 0; this.tiltN = 0; this.vis = 'X'; }
    update(f, dt) {
      if (!f) return { open: 0, form: 0, vis: 'X' };
      this.peak = Math.max(f.level, this.peak - dt * 2.5);          // peak decays 2.5 dB/s
      const floor = this.peak - 30;
      let open = clamp((f.level - floor) / 26, 0, 1);
      open = Math.pow(open, 1.3);
      const tilt = 10 * Math.log10((f.b3 + 1e-12) / (f.b1 + 0.6 * f.b2 + 1e-12));
      if (open > 0.15) { this.tiltN = Math.min(this.tiltN + dt, 1.5); this.tilt = lerp(this.tilt, tilt, dt / Math.max(this.tiltN, dt)); }
      const back = 10 * Math.log10((f.b2 + 1e-12) / (f.b1 + 1e-12));
      const d = tilt - this.tilt;
      let vis;
      if (open < 0.12) vis = 'X';
      else if (d > 2.5) vis = open > 0.55 ? 'E' : 'I';
      else if (d < -3.5 || (d < -1.5 && back < -12)) vis = open > 0.5 ? 'O' : 'U';
      else vis = 'A';
      this.vis = vis;
      return { open, form: clamp(d / 6, -1, 1), vis };
    }
  }

  // text -> rough viseme track for speechSynthesis (no audio stream to analyse)
  function textVisemes(word) {
    const out = [];
    const w = word.toLowerCase().replace(/[^a-z]/g, '');
    for (let i = 0; i < w.length; i++) {
      const c = w[i];
      if ('a'.includes(c)) out.push('A'); else if ('ei'.includes(c)) out.push(c === 'e' ? 'E' : 'I');
      else if ('o'.includes(c)) out.push('O'); else if ('uw'.includes(c)) out.push('U');
      else if ('y'.includes(c)) out.push('I'); else if ('mbp'.includes(c)) out.push('X');
    }
    return out.length ? out : ['A'];
  }

  // ---------- WebGL ----------
  const VS = `attribute vec2 aPos; attribute vec2 aUV; uniform vec4 uView; uniform vec2 uOut; varying vec2 vUV;
    void main(){ vec2 p = aPos * uView.xy + uView.zw; vec2 c = p / uOut * 2.0 - 1.0; gl_Position = vec4(c.x, -c.y, 0.0, 1.0); vUV = aUV; }`;
  const FS = `precision mediump float; uniform sampler2D uTex; uniform float uAlpha; uniform vec2 uShift; uniform float uMask; varying vec2 vUV;
    void main(){ vec4 b = texture2D(uTex, vUV);
      if (uMask > 0.5) { vec4 s = texture2D(uTex, vUV + uShift); vec3 rgb = s.a > 0.004 ? s.rgb / s.a : b.rgb / max(b.a, 0.004);
        gl_FragColor = vec4(rgb * b.a, b.a) * uAlpha; }
      else gl_FragColor = b * uAlpha; }`;

  function compile(gl, type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
  function loadImg(url) { return new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('load ' + url)); i.src = url; }); }

  class Avatar {
    static async create(canvas, opts = {}) { const a = new Avatar(canvas, opts); await a._load(); return a; }

    constructor(canvas, opts) {
      this.canvas = canvas; this.base = opts.base || './'; this.opts = opts;
      const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: true, preserveDrawingBuffer: !!opts.preserve });
      if (!gl) throw new Error('WebGL not available');
      this.gl = gl;
      this.rand = rng(opts.seed || 61);
      this.t = 0; this.running = false; this.manual = null; this.lip = new LipSync();
      this.expr = { name: 'neutral', target: {}, w: 0, cur: {} };
      this.exprWeights = {}; for (const k in EXPRESSIONS) this.exprWeights[k] = 0;
      this.exprTarget = 'neutral'; this.exprIntensity = 1;
      this.idle = true;
      this.P = { yaw: 0, pitch: 0, roll: 0, bodyYaw: 0, breath: 0, eyeOpen: 1, eyeX: 0, eyeY: 0, open: 0, form: 0, smile: 0,
                 browL: 0, browR: 0, eyeScale: 0, sx: 0, sy: 0 };
      this.spring = { yaw: 0, pitch: 0, roll: 0, sx: 0, vy: 0, vp: 0, vr: 0, vx: 0 };
      this.blink = { next: 1.5, phase: -1, double: false };
      this.sacc = { next: 1, x: 0, y: 0 };
      this.gest = { next: 1.2, yaw: 0, pitch: 0 };
      this.look = { next: 1.5, ty: 0, tp: 0, tr: 0, tw: 0, y: 0, p: 0, r: 0, w: 0, tau: 0.8 };   // idle 'looks' (turn + hold)
      this.talk = 0; this.vis = 'X'; this.feat = null; this.manualVis = null; this.visW = { X: 1 }; this.amp = 0;
      this.onViseme = opts.onViseme || null;
    }

    async _load() {
      // opts.resolve(file) -> Promise<url> (2026-11-14): lets the page serve a rig from somewhere a plain fetch can't reach
      // (e.g. an account's own Firebase Storage folder, fetched with its login -> blob: URLs). Default = base + file.
      const url = f => this.opts.resolve ? this.opts.resolve(f) : Promise.resolve(this.base + f);
      const rig = await (await fetch(await url(this.opts.rigFile || 'rig.json'), { cache: 'no-cache' })).json();
      this.rig = rig; this.W = rig.canvas[0]; this.H = rig.canvas[1]; this.K = this.W / 1024;   // rig-pixel constants below were tuned at 1024 wide
      const E = rig.head.ellipsoid; this.E = E;
      const gl = this.gl;
      const prog = gl.createProgram();
      gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VS)); gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      this.prog = prog; gl.useProgram(prog);
      this.loc = { aPos: gl.getAttribLocation(prog, 'aPos'), aUV: gl.getAttribLocation(prog, 'aUV'), uView: gl.getUniformLocation(prog, 'uView'),
                   uOut: gl.getUniformLocation(prog, 'uOut'), uTex: gl.getUniformLocation(prog, 'uTex'), uAlpha: gl.getUniformLocation(prog, 'uAlpha'),
                   uShift: gl.getUniformLocation(prog, 'uShift'), uMask: gl.getUniformLocation(prog, 'uMask') };
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      // cache-bust the layers by the rig's own geometry: rig.json is no-cache but PNGs are cached a day, so a rebuilt rig
      // (e.g. bust -> full body, 2026-11-14) used to draw new geometry over OLD cached pictures = torn, floating-head avatar
      let hv = 0; for (const ch of JSON.stringify(rig.parts)) hv = (Math.imul(hv, 31) + ch.charCodeAt(0)) | 0;
      const bust = u => u + (u.indexOf('?') < 0 ? '?' : '&') + 'rv=' + (hv >>> 0).toString(36);
      const imgs = await Promise.all(rig.parts.map(async p => loadImg(bust(await url(p.file)))));
      const so = { closed: 0, half: 1, open: 2 };
      this.parts = rig.parts.map((p, i) => this._mkPart(p, imgs[i]))
        .sort((a, b) => (a.z - b.z) || ((so[a.name.split('_')[2]] || 0) - (so[b.name.split('_')[2]] || 0)));
      this.byName = {}; for (const p of this.parts) this.byName[p.name] = p;
      this.mouthY = rig.head.jaw.mouth_y;
      if (rig.head.cut && rig.head.cut.length > 1) { this.cutX = rig.head.cut.map(q => q[0]); this.cutY = rig.head.cut.map(q => q[1]); }
      const LN = rig.mouth.line;
      if (LN && LN.length > 4) {
        this.lineX = LN.map(q => q[0]); this.lineY = LN.map(q => q[1]);
        this.lineC = (this.lineX[0] + this.lineX[this.lineX.length - 1]) / 2; this.lineHW = (this.lineX[this.lineX.length - 1] - this.lineX[0]) / 2;
      }
    }

    _lineAt(x) {   // lip line y at x (rest space) + corner taper 0..1 (0 = at/beyond a corner)
      if (!this.lineX) return [this.mouthY, clamp(1 - Math.pow((x - 612 * this.K) / (78 * this.K), 2), 0, 1)];
      const X = this.lineX, Y = this.lineY, n = X.length;
      let y; if (x <= X[0]) y = Y[0]; else if (x >= X[n - 1]) y = Y[n - 1];
      else { const i = Math.min(n - 2, Math.floor((x - X[0]) / (X[1] - X[0]))); y = lerp(Y[i], Y[i + 1], (x - X[i]) / (X[i + 1] - X[i])); }
      const u = (x - this.lineC) / (this.lineHW * 0.9);       // taper reaches 0 just inside the traced ends
      return [y, Math.pow(clamp(1 - u * u, 0, 1), 0.75)];
    }
    _cutAt(x) {   // head/body cut polyline y at x (rig.head.cut)
      const X = this.cutX, Y = this.cutY, n = X.length;
      if (x <= X[0]) return Y[0]; if (x >= X[n - 1]) return Y[n - 1];
      let i = 0; while (i < n - 2 && X[i + 1] < x) i++;
      return lerp(Y[i], Y[i + 1], (x - X[i]) / Math.max(X[i + 1] - X[i], 1e-6));
    }
    _ellZ(x, y) { const E = this.E; const u = (x - E.c[0]) / E.r[0], v = (y - E.c[1]) / E.r[1]; return E.r[2] * Math.sqrt(Math.max(0, 1 - u * u - v * v)); }

    _mkPart(p, img) {
      const gl = this.gl;
      const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fine = p.name === 'mouth_inner' ? 3 : /mouth|eye|brow/.test(p.name) ? 8 : /face|front_hair|glasses/.test(p.name) ? 16 : 32;
      const cols = clamp(Math.ceil(p.w / fine), 2, 64), rows = clamp(Math.ceil(p.h / fine), 2, 80);
      const n = (cols + 1) * (rows + 1);
      const rest = new Float32Array(n * 2), uv = new Float32Array(n * 2), z = new Float32Array(n);
      const key = p.group || p.name; const D = this.rig.depth[key] || { zScale: 1, zOff: 0 };
      let k = 0;
      for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
        const u = i / cols, v = j / rows, x = p.x + u * p.w, y = p.y + v * p.h;
        rest[k * 2] = x; rest[k * 2 + 1] = y; uv[k * 2] = u; uv[k * 2 + 1] = v;
        z[k] = D.zScale * this._ellZ(x, y) + D.zOff; k++;
      }
      const idx = new Uint16Array(cols * rows * 6); let q = 0;
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const a = j * (cols + 1) + i, b = a + 1, c = a + cols + 1, d = c + 1;
        idx.set([a, b, c, b, d, c], q); q += 6;
      }
      const pos = new Float32Array(n * 2);
      const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, pos, gl.DYNAMIC_DRAW);
      const ub = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, ub); gl.bufferData(gl.ARRAY_BUFFER, uv, gl.STATIC_DRAW);
      const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
      const head = this.rig.head_parts.includes(key);
      return { ...p, key, tex, rest, uv, z, pos, vb, ub, ib, count: idx.length, D, head, spring: D.spring || 0, alpha: 1 };
    }

    // ---------- public API ----------
    setExpression(name, intensity) { if (EXPRESSIONS[name]) this.exprTarget = name; if (intensity != null) this.exprIntensity = clamp(intensity, 0, 1); }
    get expressions() { return Object.keys(EXPRESSIONS); }
    setHead(h) { this.manual = h ? { yaw: h.yaw || 0, pitch: h.pitch || 0, roll: h.roll || 0 } : null; }
    setViseme(v) { this.manualVis = v; }
    useAnalyser(actx, analyser, el) { this.actx = actx; this.analyser = analyser; this.fbuf = new Float32Array(analyser.frequencyBinCount); this.audioEl = el; }
    pushWord(word, dur) { const q = textVisemes(word); this.tts = { queue: q.map(v => ({ v })), step: (dur || 0.3) / Math.max(q.length, 1), clock: 0 }; }
    endWords() { this.tts = null; }
    alphaAt(px, py, r) {   // max alpha (0-255) of her rendered pixels in a (2r+1) box around canvas px (px, py); draws + reads in the same task
      const gl = this.gl, c = this.canvas; if (!gl) return 0;
      const x0 = Math.max(0, Math.floor(px - r)), y0 = Math.max(0, Math.floor(py - r));
      const w = Math.min(c.width, Math.ceil(px + r) + 1) - x0, h = Math.min(c.height, Math.ceil(py + r) + 1) - y0;
      if (w <= 0 || h <= 0) return 0;
      this.draw();
      const buf = new Uint8Array(w * h * 4);
      gl.readPixels(x0, c.height - y0 - h, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      let m = 0; for (let i = 3; i < buf.length; i += 4) if (buf[i] > m) m = buf[i];
      return m;
    }
    destroy() {
      this.stop(); const gl = this.gl; if (!gl) return;
      try { for (const p of this.parts || []) { gl.deleteTexture(p.tex); gl.deleteBuffer(p.vb); gl.deleteBuffer(p.ub); gl.deleteBuffer(p.ib); }
            const ext = gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); } catch (e) { }
      this.parts = []; this.gl = null;
    }
    attachAudio(el) {
      if (!this.actx) this.actx = new (window.AudioContext || window.webkitAudioContext)();
      if (!this.analyser) {
        this.analyser = this.actx.createAnalyser(); this.analyser.fftSize = 1024; this.analyser.smoothingTimeConstant = 0.5;
        this.analyser.connect(this.actx.destination); this.fbuf = new Float32Array(this.analyser.frequencyBinCount);
      }
      if (!el._l2dSrc) { el._l2dSrc = this.actx.createMediaElementSource(el); el._l2dSrc.connect(this.analyser); }
      this.audioEl = el;
      return this.actx;
    }
    speakText(text, voicePick) {   // fallback path: browser TTS + text-driven visemes (word boundary events)
      if (!('speechSynthesis' in window)) return false;
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const vs = speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang));
      u.voice = (voicePick && vs.find(v => voicePick.test(v.name))) || vs.find(v => /male|david|guy|daniel|alex/i.test(v.name)) || vs[0] || null;
      this.tts = { queue: [], until: 0, speaking: true };
      u.onboundary = (e) => {
        if (e.name && e.name !== 'word') return;
        const w = text.slice(e.charIndex, e.charIndex + (e.charLength || 8)).split(/\s/)[0];
        this.tts.queue = textVisemes(w).map(v => ({ v })); this.tts.step = 0.32 / Math.max(this.tts.queue.length, 1); this.tts.clock = 0;
      };
      u.onend = u.onerror = () => { this.tts = null; };
      speechSynthesis.speak(u);
      return true;
    }
    start() { if (this.running) return; this.running = true; let last = performance.now(); const loop = (now) => { if (!this.running || !this.gl) return; const dt = Math.min(0.05, (now - last) / 1000); last = now; this._liveFeat(); this.step(dt); this.draw(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); }
    stop() { this.running = false; }
    renderAt(dt, feat) { this.feat = feat; this.step(dt); this.draw(); }

    _liveFeat() {
      if (this.analyser && this.audioEl && !this.audioEl.paused) {
        this.analyser.getFloatFrequencyData(this.fbuf);
        this.feat = features(this.fbuf, this.actx.sampleRate, this.analyser.fftSize);
      } else this.feat = null;
    }

    // ---------- simulation ----------
    step(dt) {
      const P = this.P, R = this.rand; this.t += dt; const t = this.t;
      // expression weights ease toward the target (one at a time, crossfading)
      for (const k in this.exprWeights) this.exprWeights[k] = ease(this.exprWeights[k], k === this.exprTarget ? this.exprIntensity : 0, dt, 0.18);
      const X = {}; for (const k in this.exprWeights) { const w = this.exprWeights[k], e = EXPRESSIONS[k]; for (const p in e) X[p] = (X[p] || 0) + e[p] * w; }
      const xv = (k) => X[k] || 0;

      // mouth: analyser -> viseme -> (open, form) with attack/release smoothing
      let mOpen = 0, mForm = 0, vis = 'X', ampT = 0, rForm = null;
      if (this.feat) {
        const r = this.lip.update(this.feat, dt); vis = r.vis; ampT = clamp(0.45 + r.open * 0.75, 0, 1.1); rForm = r.form;
      } else if (this.tts) {
        this.tts.clock = (this.tts.clock || 0) + dt;
        const i = Math.floor(this.tts.clock / (this.tts.step || 0.1));
        const q = this.tts.queue[i]; vis = q ? q.v : 'X'; ampT = 0.85;
      }
      if (this.manualVis) { vis = this.manualVis; ampT = 1; }
      // crossfade viseme shapes (~55 ms) instead of stepping between them -> no flap/pop between sounds
      const VIS = this.rig.mouth.visemes;
      for (const k in VIS) { const w = ease(this.visW[k] || 0, k === vis ? 1 : 0, dt, 0.055); this.visW[k] = w; mOpen += w * VIS[k][0]; mForm += w * VIS[k][1]; }
      this.amp = ease(this.amp, ampT, dt, 0.045);
      mOpen *= this.amp; if (rForm != null) mForm = lerp(mForm, rForm, 0.25);
      if (vis !== this.vis) { this.vis = vis; if (this.onViseme) this.onViseme(vis); }
      const oT = clamp(mOpen + xv('open'), 0, 1.1);
      P.open = ease(P.open, oT, dt, oT > P.open ? 0.045 : 0.085);
      P.form = ease(P.form, clamp(mForm + xv('form'), -1, 1), dt, 0.07);
      P.smile = ease(P.smile, xv('smile'), dt, 0.12);
      this.talk = ease(this.talk, P.open, dt, 0.5);
      const talking = this.talk > 0.08;

      // head: idle sway (layered sines) + talk gestures + expression offsets, or manual
      let yaw, pitch, roll;
      if (this.manual) { yaw = this.manual.yaw; pitch = this.manual.pitch; roll = this.manual.roll; }
      else {
        // 2026-11-14 turns (L: "small realistic turns/twists"): every 4-10 s pick a new look - often small, sometimes a
        // bigger turn, sometimes back to centre - ease into it slowly (two chained eases = an S-curve) and HOLD it.
        // A tiny drift on top keeps the hold alive. Never constant, never jittery.
        const k = this.idle ? 1 : 0, LK = this.look;
        LK.next -= dt;
        if (LK.next <= 0) {
          const big = R() < 0.35, home = R() < 0.25;
          LK.ty = home ? 0 : (R() - 0.5) * (big ? 1.5 : 0.6);        // P.yaw units (+-0.75 ~ the rig's max turn)
          LK.tp = home ? 0 : (R() - 0.45) * (big ? 0.9 : 0.4);
          LK.tr = (R() - 0.5) * (big ? 0.7 : 0.3);
          LK.tw = (R() - 0.5) * 2;                                     // weight shift side (-1..1)
          LK.next = 4 + R() * 6; LK.tau = 0.55 + R() * 0.5;
        }
        LK.y = ease(LK.y, LK.ty, dt, LK.tau); LK.p = ease(LK.p, LK.tp, dt, LK.tau); LK.r = ease(LK.r, LK.tr, dt, LK.tau * 1.2); LK.w = ease(LK.w, LK.tw, dt, 1.4);
        yaw = k * (LK.y + 0.02 * Math.sin(t * 0.37));
        pitch = k * (LK.p + 0.015 * Math.sin(t * 0.29 + 2.0));
        roll = k * (LK.r * 0.12 + 0.012 * Math.sin(t * 0.41 + 0.5));
        this.gest.next -= dt;
        if (this.gest.next <= 0) { this.gest.next = talking ? 0.9 + R() * 1.6 : 2.5 + R() * 3; this.gest.yaw = talking ? (R() - 0.5) * 0.32 : (R() - 0.5) * 0.12; this.gest.pitch = talking ? (R() - 0.3) * 0.14 : 0; }
        this.gest.y = ease(this.gest.y || 0, this.gest.yaw, dt, 0.35); this.gest.p = ease(this.gest.p || 0, this.gest.pitch, dt, 0.3);
        yaw += this.gest.y; pitch += this.gest.p + (P.open - this.talk) * 0.18;   // little nods on stressed syllables
      }
      yaw += xv('yaw'); pitch += xv('pitch'); roll += xv('roll');
      const mk = this.rig.motion != null ? this.rig.motion : 1; yaw *= mk; pitch *= mk; roll *= mk;   // rig.motion: calmer heads (full-body long hair crosses the head/body cut)
      P.yaw = ease(P.yaw, yaw, dt, 0.12); P.pitch = ease(P.pitch, pitch, dt, 0.12); P.roll = ease(P.roll, roll, dt, 0.15);
      P.bodyYaw = P.yaw * 0.3; P.breath = 0.5 + 0.5 * Math.sin(t * 2 * Math.PI / 4.2);
      P.sx = this.manual ? 0 : (this.look.w * 9 + 2 * Math.sin(t * 0.23 + 0.7)) * this.K;   // weight shift (eased, held) + tiny sway

      // hair spring (damped, underdamped -> a little overshoot)
      const S = this.spring, k = 70, c = 7.5;
      for (const [a, v] of [['yaw', 'vy'], ['pitch', 'vp'], ['roll', 'vr'], ['sx', 'vx']]) {
        const acc = k * (P[a] - S[a]) - c * S[v]; S[v] += acc * dt; S[a] += S[v] * dt;
      }

      // blink: open -> half -> closed -> half -> open (continuous; drawn as crossfades of the 3 eye states)
      const B = this.blink; B.next -= dt;
      if (B.phase < 0 && B.next <= 0) { B.phase = 0; B.double = R() < 0.18; }
      let bo = 1;
      if (B.phase >= 0) {
        B.phase += dt / 0.34; const ph = B.phase;   // 340 ms blink: ~60-110 ms per state
        bo = ph < 0.4 ? 1 - ph / 0.4 : clamp((ph - 0.4) / 0.6, 0, 1);
        if (ph >= 1) { if (B.double) { B.double = false; B.phase = 0; } else { B.phase = -1; B.next = 2 + R() * 4; } }
      }
      P.eyeOpen = clamp(Math.min(bo, 1 + xv('eye')), 0, 1);
      P.eyeScale = xv('eyeScale');
      // eye drift: saccades + counter-roll against head yaw (keeps eye contact)
      const SC = this.sacc; SC.next -= dt;
      if (SC.next <= 0) { SC.next = 1.2 + R() * 2.6; SC.x = (R() - 0.5) * 1.4; SC.y = (R() - 0.5) * 0.8; }
      P.eyeX = ease(P.eyeX, clamp(SC.x - P.yaw * 2.5 + xv('eyeX'), -1.2, 1.2), dt, 0.05);
      P.eyeY = ease(P.eyeY, clamp(SC.y + P.pitch * 2 + xv('eyeY'), -1, 1), dt, 0.05);
      P.browL = ease(P.browL, xv('brow') + xv('browL') + P.open * 0.12 * (talking ? 1 : 0), dt, 0.1);
      P.browR = ease(P.browR, xv('brow') + xv('browR') + P.open * 0.12 * (talking ? 1 : 0), dt, 0.1);
    }

    // ---------- deformation ----------
    _rot(x, y, z, yaw, pitch) {   // 3D rotate about the ellipsoid centre + mild perspective; returns screen x,y
      const cx = this.E.c[0], cy = this.E.c[1];
      const dx = x - cx, dy = y - cy;
      const cY = Math.cos(yaw), sY = Math.sin(yaw), cP = Math.cos(pitch), sP = Math.sin(pitch);
      const x1 = dx * cY + z * sY, z1 = -dx * sY + z * cY;
      const y2 = dy * cP - z1 * sP, z2 = dy * sP + z1 * cP;
      const D = 2400 * this.K, f = D / (D - (z2 - this.E.r[2] * 0.6));
      return [cx + x1 * f, cy + y2 * f];
    }

    _deform(p) {
      const P = this.P, S = this.spring, n = p.z.length, rest = p.rest, out = p.pos, z = p.z, name = p.name;
      const piv = this.rig.head.pivot;
      const K = this.K, TN = this.rig.turn;
      // rig.turn {yaw, pitch} = max radians at P.yaw/P.pitch = +-1 (front-facing art); without it the 3/4-view rule:
      // toward-camera turns are short
      const yawA = TN ? P.yaw * TN.yaw : P.yaw * (P.yaw < 0 ? 0.2 : 0.34), pitA = P.pitch * (TN ? TN.pitch : 0.3);
      const pz = this._ellZ(piv[0], piv[1]) * 0.6;
      const pv = this._rot(piv[0], piv[1], pz, yawA, pitA), pdx = pv[0] - piv[0], pdy = pv[1] - piv[1];
      const cr = Math.cos(P.roll * 0.35), sr = Math.sin(P.roll * 0.35);
      const breathLift = -P.breath * 5 * K;
      const mo = P.open * this.rig.mouth.max_open, my = this.mouthY, mcx = this.lineC || 612 * K;
      const MR = this.rig.mouth, tuck = MR.inner_tuck || 3, teeth = MR.teeth || 7, depth = MR.inner_depth || 46;
      const faceDrop = (x, y, ly) => mo * 0.62 * smooth(ly - 4 * K, ly + 46 * K, y) * clamp(1 - Math.pow((x - mcx) / (170 * K), 2), 0, 1);
      const bpx = (this.rig.body && this.rig.body.pivot) ? this.rig.body.pivot[0] : 520 * K;
      const headXY = (x, y, zz, ya, pa, rl, sx) => {          // the head transform for one rest point (shared by the seam blend)
        const r = this._rot(x, y, zz, ya, pa); let X2 = r[0] - pdx, Y2 = r[1] - pdy;
        const c2 = Math.cos(rl * 0.35), s2 = Math.sin(rl * 0.35), ox = X2 - piv[0], oy = Y2 - piv[1];
        return [piv[0] + ox * c2 - oy * s2 + sx + P.bodyYaw * 14 * K, piv[1] + ox * s2 + oy * c2 + breathLift];
      };
      const BH = this.rig.depth.front_hair || { zScale: 1, zOff: 22 * K };   // hair crossing the cut is front hair: blend at its depth
      const form = P.form, smile = P.smile;
      for (let i = 0; i < n; i++) {
        let x = rest[i * 2], y = rest[i * 2 + 1];
        if (p.key === 'bg') {
          const cx = this.W / 2, cy = this.H / 2;
          x = cx + (x - cx) * 1.04 - P.yaw * 18 * K - P.sx * 0.3; y = cy + (y - cy) * 1.04 + P.pitch * 10 * K;
          out[i * 2] = x; out[i * 2 + 1] = y; continue;
        }
        if (p.key === 'body' || p.key === 'neck') {
          const by = this.H, x0 = x, y0 = y;
          const top = clamp((by - y) / (720 * K), 0, 1.2);
          y = by - (by - y) * (1 + P.breath * 0.012);
          // body twist: shoulders follow the head a little, with a slight horizontal squash toward the turn; weight shift
          // (P.sx) leans the upper body more than the legs
          x = bpx + (x - bpx) * (1 + P.breath * 0.006) * (1 - Math.abs(P.bodyYaw) * 0.05 * top) + P.bodyYaw * 40 * K * top + P.sx * 0.6 * top;
          if (p.key === 'neck') { x += (pdx * 0.25 + P.yaw * 10 * K); y += breathLift * 0.6; }
          // seam hiding: the band just under the head/body cut (where long hair crosses it) blends into the head's motion,
          // so hair stays continuous during turns instead of tearing at the cut line
          if (this.cutX) {
            const cy = this._cutAt(x0), wgt = 1 - smooth(cy - 6 * K, cy + 70 * K, y0);
            if (wgt > 0.001) {
              const h = headXY(x0, y0, BH.zScale * this._ellZ(x0, y0) + BH.zOff, yawA, pitA, P.roll, P.sx);
              x = x + (h[0] - x) * wgt; y = y + (h[1] - y) * wgt;
            }
          }
          out[i * 2] = x; out[i * 2 + 1] = y; continue;
        }
        // ---- local feature deformers (rest space) ----
        if (name === 'face') {   // jaw drop: chin + stubble follow the lower lip down
          y += faceDrop(x, y, this.lineX ? this._lineAt(x)[0] : my);
        } else if (name === 'mouth_lower') {
          // lip edge drops by the per-column gap (corners stay shut); the rest of the layer (skin, chin shadow) rides
          // the same jaw drop as the face underneath -> no shear, no doubled lip line, no seam at the soft edges
          const LA = this._lineAt(x), ly = LA[0], cf = LA[1], u = (x - mcx) / (70 * K);
          const lipW = 1 - smooth(ly + 5 * K, ly + 28 * K, y);
          const lipD = mo * cf * (0.95 + Math.max(0, -form) * 0.08), fd = faceDrop(x, y, ly);
          x = mcx + (x - mcx) * (1 + 0.16 * form);
          y += fd + (lipD - fd) * lipW - smile * 5 * K * u * u * lipW;
        } else if (name === 'mouth_upper') {
          const cf = this._lineAt(x)[1], u = (x - mcx) / (70 * K);
          x = mcx + (x - mcx) * (1 + 0.12 * form);
          y += -mo * 0.08 * cf - smile * 7 * K * u * u - Math.max(0, form) * 1.5 * K * cf;
        } else if (name === 'mouth_inner') {
          // interior hugs the lip line: texture rows [0, tuck+teeth] = under the upper lip + teeth (teeth show only as
          // the mouth opens), the rest stretches down to just under the lowered lower lip. Per column -> exact fit.
          // fix2 (L 11-13 on his phone: "big black line"): the fixed 3 px tuck above + 3 px under the lips used to run all
          // the way into the corners, where no lip covers it -> a dark line past each corner while talking. Now the WHOLE
          // column (tuck, teeth, throat) scales with the corner taper g, so the interior collapses to nothing at the corners.
          const LA = this._lineAt(x), cf = LA[1], g = smooth(0.04, 0.5, cf), yy = y - (LA[0] - tuck), lt = LA[0] - tuck * g;
          if (yy > 0) {
            const lipD = mo * cf * (0.95 + Math.max(0, -form) * 0.08);
            const T = tuck + teeth, span = tuck * g + lipD + Math.min(2 * K, lipD) * g, tS = Math.min(T, tuck + lipD * 0.35) * g;
            const uu = (x - mcx) / Math.max(this.lineHW || 70, 1), colD = tuck + depth * (1 - 0.55 * uu * uu);
            y = lt + (yy <= T ? yy * (tS / T) : tS + (yy - T) * Math.max(span - tS, 0) / Math.max(colD - T, 1));
          } else y = lt + yy * g;
          x = mcx + (x - mcx) * (1 + 0.16 * form);
        } else if (p.key === 'brow_L' || p.key === 'brow_R') {
          const b = p.key === 'brow_L' ? P.browL : P.browR, pc = p.pivot;
          const inner = p.key === 'brow_L' ? (x - pc[0]) / (90 * K) : -(x - pc[0]) / (60 * K);   // +1 at the inner end (toward the nose)
          y += (-b * 11 + (1 - P.eyeOpen) * 4 + b * inner * 2.5) * K;
        } else if (p.group === 'eye_L' || p.group === 'eye_R') {
          const pc = p.pivot; y = pc[1] + (y - pc[1]) * (1 + P.eyeScale); x = pc[0] + (x - pc[0]) * (1 + P.eyeScale * 0.6);
        }
        // ---- head 3D rotation (+ hair spring lag) ----
        let ya = yawA, pa = pitA, rl = P.roll, sx = P.sx;
        if (p.spring) {
          const w = p.spring * Math.pow(clamp((this.E.c[1] + 90 * K - rest[i * 2 + 1]) / (420 * K), 0, 1), 1.2) * 1.7;
          ya += (S.yaw - P.yaw) * 0.3 * w; pa += (S.pitch - P.pitch) * 0.3 * w; rl += (S.roll - P.roll) * w; sx += (S.sx - P.sx) * w;
        }
        let r = this._rot(x, y, z[i], ya, pa);
        let X2 = r[0] - pdx, Y2 = r[1] - pdy;
        const cr2 = rl === P.roll ? cr : Math.cos(rl * 0.35), sr2 = rl === P.roll ? sr : Math.sin(rl * 0.35);
        const ox = X2 - piv[0], oy = Y2 - piv[1];
        X2 = piv[0] + ox * cr2 - oy * sr2; Y2 = piv[1] + ox * sr2 + oy * cr2;
        out[i * 2] = X2 + sx + P.bodyYaw * 14 * K; out[i * 2 + 1] = Y2 + breathLift;
      }
    }

    // ---------- draw ----------
    draw() {
      const gl = this.gl, c = this.canvas, L = this.loc, P = this.P;
      gl.viewport(0, 0, c.width, c.height);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(L.uOut, c.width, c.height);
      const sc = Math.max(c.width / this.W, c.height / this.H);           // cover
      let ox = (c.width - this.W * sc) / 2, oy = (c.height - this.H * sc) / 2;
      const F = this.opts.focus;                                          // keep the face in view when the stage crops
      if (F) { ox = clamp(c.width / 2 - F[0] * sc, c.width - this.W * sc, 0); oy = clamp(c.height / 2 - F[1] * sc, c.height - this.H * sc, 0); }
      gl.uniform4f(L.uView, sc, sc, ox, oy);
      // eye state crossfade weights
      const o = P.eyeOpen;
      // 2026-11-14 blink fix (L: "eyebrow still shows when blinking"): a clean SWAP, one state at a time (half/closed layers now
      // cover the whole open-eye footprint, fix_blink.py) - the old crossfade drew open over half, so two lash lines showed
      const eyeA = { open: o > 0.7 ? 1 : 0, half: o > 0.3 && o <= 0.7 ? 1 : 0, closed: o <= 0.3 ? 1 : 0 };
      for (const p of this.parts) {
        let alpha = 1, mask = 0, shx = 0, shy = 0;
        if (p.group) {
          const st = p.name.split('_')[2]; alpha = eyeA[st];
          if (st === 'closed' && alpha > 0) { /* closed drawn under half */ }
          if (st !== 'closed') { mask = 1; shx = -P.eyeX * 3.5 * this.K / p.w; shy = -P.eyeY * 2.0 * this.K / p.h; }
          if (alpha <= 0.001) continue;
        }
        if (this.opts.noBg && p.kind === 'bg') continue;          // backdrop mode: character only, page shows through
        if (p.name === 'mouth_inner') { if (P.open < 0.02) continue; alpha = smooth(0.03, 0.14, P.open); }   // fix2: fade in, no slit between words
        this._deform(p);
        gl.bindBuffer(gl.ARRAY_BUFFER, p.vb); gl.bufferSubData(gl.ARRAY_BUFFER, 0, p.pos);
        gl.enableVertexAttribArray(L.aPos); gl.vertexAttribPointer(L.aPos, 2, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, p.ub); gl.enableVertexAttribArray(L.aUV); gl.vertexAttribPointer(L.aUV, 2, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, p.ib);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, p.tex); gl.uniform1i(L.uTex, 0);
        gl.uniform1f(L.uAlpha, alpha); gl.uniform1f(L.uMask, mask); gl.uniform2f(L.uShift, shx, shy);
        gl.drawElements(gl.TRIANGLES, p.count, gl.UNSIGNED_SHORT, 0);
      }
    }
  }

  window.Live2DAvatar = { create: (c, o) => Avatar.create(c, o), features, LipSync, EXPRESSIONS };
})();
