// avatar3d.js - 3D (VRM) avatar for onlinechat, same surface as the 2.5D avatar.js instance:
//   const av = await create(canvas, { url | load, onProgress })
//   av.W / av.H / av.rig.fullbody   layout hints (full-body figure in a 1:2 box, like the 2.5D full-body rigs)
//   av.start() / av.stop() / av.destroy()
//   av.useAnalyser(actx, analyser, audioEl)   lip-sync from the TTS <audio> analyser
//   av.pushWord(word, dur) / av.endWords()    text-timed mouth when there is no analyser audio (device voice)
//   av.setExpression(name, amt) / av.setHead(h | null) / av.blinkNow()
//   av.alphaAt(px, py, r)                     max alpha 0-255 of rendered pixels around canvas px (hit-testing)
//   av.getView() / av.setView({yaw, pitch, pan})   camera orbit (radians) + up/down pan (fraction of her height); 0,0,0 = straight on
// The page owns the canvas size (canvas.width/height); this follows it every frame.
// ES module, imported by the page ONLY when the 3D style is chosen. Needs the page importmap for 'three',
// 'three/addons/' and '@pixiv/three-vrm' (three@0.180.0, @pixiv/three-vrm@3.5.5).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (cur, tgt, dt, tau) => cur + (tgt - cur) * (1 - Math.exp(-dt / Math.max(tau, 1e-4)));
const VIS = { A: 'aa', I: 'ih', U: 'ou', E: 'ee', O: 'oh' };
// page expression names -> VRM preset weights (+ a small head offset for 'thinking')
const EXPR_MAP = {
    neutral: {}, happy: { happy: 1 }, surprised: { surprised: 1 },
    thinking: { relaxed: 0.25, sad: 0.15, _yaw: -6, _pitch: 5 }, sad: { sad: 1 }, relaxed: { relaxed: 1 },
};
const VRM_EXPR = ['happy', 'sad', 'surprised', 'relaxed', 'angry'];
// hand-on-hip + gesture pose numbers (radians; normalized VRM bones). Tuned against renders of the live gothic model.
const HIP = { cock: 0.045, cockX: 0.012,
    luaX: 0, luaY: -0.1, luaZ: -0.95, llaX: 0, llaY: -1.1, llaZ: -1.2, lhX: 0, lhY: 0, lhZ: 0.3, lFing: 0.5,
    ruaX: 0.45, ruaY: 0, ruaOut: 0.25, rlaBend: 1.2, rlaTwist: -0.9, rhX: 0, rhZ: 0.25 };

function textVisemes(word) {   // crude letters -> A/I/U/E/O/X for the text-timed mouth
    const out = [];
    for (const ch of String(word || '').toLowerCase()) {
        if (ch === 'a') out.push('A'); else if (ch === 'i' || ch === 'y') out.push('I'); else if (ch === 'u' || ch === 'w') out.push('U');
        else if (ch === 'e') out.push('E'); else if (ch === 'o') out.push('O'); else if ('mbp'.includes(ch)) out.push('X');
    }
    return out.length ? out : ['A'];
}

async function fetchBuf(url, onProgress) {
    const r = await fetch(url); if (!r.ok) throw new Error('VRM HTTP ' + r.status);
    const total = +r.headers.get('content-length') || 0;
    if (!r.body || !total || !onProgress) return r.arrayBuffer();
    const rd = r.body.getReader(), parts = []; let got = 0;
    for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); got += value.length; onProgress(got, total); }
    const ab = new Uint8Array(got); let o = 0; for (const p of parts) { ab.set(p, o); o += p.length; }
    return ab.buffer;
}

class Avatar3D {
    constructor(canvas, opts) {
        this.canvas = canvas; this.opts = opts || {};
        this.W = 1000; this.H = 2000; this.rig = { fullbody: true };
        this.running = false; this.t = 0; this.B = {};
        this.exprTarget = {}; this.expr = {}; this.manual = null;
        this.I = { next: 1.5, ty: 0, tp: 0, y: 0, p: 0, yaw: 0, pitch: 0, blinkNext: 2, blinkPh: -1, blinkDouble: false, force: false };
        this.visW = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 }; this.amp = 0; this.tts = null; this.fbuf = null;
        const LA = window.Live2DAvatar;   // reuse the 2.5D engine's audio classifier (read-only) when it is on the page
        this.lip = LA && LA.LipSync ? new LA.LipSync() : null; this.features = LA && LA.features;
        const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!(opts && opts.preserve) });
        r.setPixelRatio(1); r.outputColorSpace = THREE.SRGBColorSpace; r.setClearColor(0x000000, 0);
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(24, 0.5, 0.05, 50);
        const add = (c, i, x, y, z) => { const l = new THREE.DirectionalLight(c, Math.PI * i); l.position.set(x, y, z); this.scene.add(l); };
        add(0xfff4ea, 0.62, 1.2, 2.2, 2.0); add(0xdfe6ff, 0.14, -1.8, 1.4, 1.2); add(0xffd6e0, 0.3, 0, 2.0, -2.2);
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.12));
        this.fr = { top: 1.6, bot: 0 }; this.size = [0, 0];
    }

    async _load() {
        const o = this.opts;
        const ab = o.load ? await o.load() : await fetchBuf(o.url, o.onProgress);
        const loader = new GLTFLoader(); loader.register(p => new VRMLoaderPlugin(p));
        const gltf = await loader.parseAsync(ab, '');
        const vrm = gltf.userData.vrm; if (!vrm) throw new Error('not a VRM file');
        VRMUtils.removeUnnecessaryVertices(gltf.scene);
        if (VRMUtils.combineSkeletons) VRMUtils.combineSkeletons(gltf.scene);
        VRMUtils.rotateVRM0(vrm);
        vrm.scene.traverse(n => { n.frustumCulled = false; });
        this.scene.add(vrm.scene);
        for (const n of ['hips', 'spine', 'chest', 'upperChest', 'neck', 'head', 'leftUpperArm', 'rightUpperArm', 'leftLowerArm', 'rightLowerArm', 'leftHand', 'rightHand', 'leftShoulder', 'rightShoulder'])
            this.B[n] = vrm.humanoid.getNormalizedBoneNode(n);
        this.F = {};   // finger bones (each optional - a model without them just skips the curl)
        for (const side of ['left', 'right']) for (const f of ['Thumb', 'Index', 'Middle', 'Ring', 'Little'])
            for (const seg of f === 'Thumb' ? ['Metacarpal', 'Proximal', 'Distal'] : ['Proximal', 'Intermediate', 'Distal']) {
                const b = vrm.humanoid.getNormalizedBoneNode(side + f + seg); if (b) this.F[side + f + seg] = b; }
        this.hips0 = this.B.hips ? this.B.hips.position.x : 0;
        try { this.calm = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch { this.calm = false; }
        this._pose(0, 0);
        vrm.update(0); vrm.scene.updateMatrixWorld(true);
        for (let i = 0; i < 60; i++) vrm.update(1 / 60);   // settle hair/cloth springs before the first frame (no sleeve flare on load)
        const wp = n => { const b = vrm.humanoid.getRawBoneNode(n); const v = new THREE.Vector3(); if (b) b.getWorldPosition(v); return v; };
        let feet = 0; try { feet = Math.min(wp('leftFoot').y, wp('rightFoot').y) - 0.08; } catch { }
        this.fr = { top: wp('head').y + 0.24, bot: feet - 0.04 };
        this.vrm = vrm; this.meta = vrm.meta || {};
        this.has = new Set(vrm.expressionManager ? Object.keys(vrm.expressionManager.expressionMap) : []);
        this._fit(true);
        return this;
    }

    // follow the page-set canvas size; full body contain-fit (the page zooms the box for its start view)
    _fit(force) {
        const w = this.canvas.width | 0, h = this.canvas.height | 0; if (!w || !h) return;
        if (!force && w === this.size[0] && h === this.size[1]) return;
        this.size = [w, h];
        this.renderer.setSize(w, h, false);
        const cam = this.camera; cam.aspect = w / h; cam.updateProjectionMatrix();
        const { top, bot } = this.fr, cy = (top + bot) / 2, span = top - bot, vf = THREE.MathUtils.degToRad(cam.fov);
        const hf = 2 * Math.atan(Math.tan(vf / 2) * cam.aspect);
        const dist = Math.max((span / 2) / Math.tan(vf / 2), 0.45 / Math.tan(hf / 2));
        // CAMERA (2026-11-21, L "rotate the camera in the 3D Yuki"): orbit around her at the same distance. yaw = around
        // (any angle), pitch = tilt (clamped), pan = the look point moved up/down as a fraction of her height.
        const V = this.view || { yaw: 0, pitch: 0, pan: 0 }, ty = cy + V.pan * span, cp = Math.cos(V.pitch);
        cam.position.set(dist * Math.sin(V.yaw) * cp, ty + dist * Math.sin(V.pitch), dist * Math.cos(V.yaw) * cp);
        cam.lookAt(0, ty, 0);
    }

    // ---- camera surface (3D only; the page checks av.setView exists) ----
    getView() { const V = this.view || { yaw: 0, pitch: 0, pan: 0 }; return { yaw: V.yaw, pitch: V.pitch, pan: V.pan }; }
    setView(v) {
        v = v || {}; const TAU = Math.PI * 2;
        let yaw = Number(v.yaw) || 0; yaw = ((yaw % TAU) + TAU + Math.PI) % TAU - Math.PI;   // keep it in -PI..PI
        this.view = { yaw, pitch: clamp(Number(v.pitch) || 0, -0.6, 0.75), pan: clamp(Number(v.pan) || 0, -0.45, 0.45) };
        this._fit(true);
    }

    // IDLE (2026-11-21, L "Yuki model looks stiff and rigid"): relaxed arms out of the T-pose + breathing, now with a slow
    // weight shift (hips roll + shift, spine/chest counter-roll, head counter-tilt in step()), arms that lag the body and
    // swing a touch, softly bent elbows and curled fingers. Layered slow sines only (no jitter); small amplitudes so the
    // hair/skirt springs follow without flaring. Reduced motion = a quarter of the sway.
    _pose(breath, t) {
        const B = this.B; t = t || 0;
        const k = this.calm ? 0.25 : 1, TAU = Math.PI * 2;
        const sway = k * (Math.sin(t * TAU / 7.6) + 0.35 * Math.sin(t * TAU / 3.3 + 1.1));    // -1.35..1.35, weight shift
        const lag = k * (Math.sin(t * TAU / 7.6 - 0.7) + 0.35 * Math.sin(t * TAU / 3.3 + 0.4)); // arms trail the body
        const drift = k * Math.sin(t * TAU / 11.3 + 2.0);                                       // very slow lean
        this.sway = sway;
        if (B.hips) { B.hips.rotation.z = 0.034 * sway; B.hips.rotation.x = 0.008 * drift; B.hips.position.x = (this.hips0 || 0) + 0.011 * sway; }
        if (B.spine) B.spine.rotation.set(-0.016 * breath - 0.006 * drift, 0, -0.018 * sway);
        if (B.chest) B.chest.rotation.set(-0.028 * breath, 0, -0.008 * sway);
        if (B.upperChest) { B.upperChest.rotation.x = -0.012 * breath; B.upperChest.rotation.z = -0.004 * sway; }
        // HIP + GESTURES (2026-11-21, L "hand-on-hip idle with talking gestures"): left hand rests on the hip (weight cocked onto that
        // side), right arm hangs relaxed and gestures while she talks (this.G from _gest: raise + palm-open + beats).
        const P = HIP;
        const sw = 0.05 * lag, fw = 0.06 + 0.025 * Math.sin(t * TAU / 5.1 + 0.8) * k;
        if (B.hips) { B.hips.rotation.z += P.cock; B.hips.position.x += P.cockX; }
        if (B.spine) B.spine.rotation.z += -P.cock * 0.7;
        if (B.chest) B.chest.rotation.z += -P.cock * 0.35;
        if (B.leftUpperArm) B.leftUpperArm.rotation.set(P.luaX + 0.01 * breath, P.luaY + 0.01 * lag, P.luaZ + breath * 0.015);
        if (B.leftLowerArm) B.leftLowerArm.rotation.set(P.llaX, P.llaY, P.llaZ);
        if (B.leftHand) B.leftHand.rotation.set(P.lhX, P.lhY, P.lhZ);
        const G = this.G || { w: 0, raise: 0, open: 0, beat: 0, out: 0, fwd: 0 }, gw = G.w;
        const el = 0.30 + 0.03 * Math.sin(t * TAU / 6.2) * k;
        if (B.rightUpperArm) B.rightUpperArm.rotation.set(
            fw + 0.01 * breath - 0.012 * lag + gw * (P.ruaX * G.fwd),
            gw * P.ruaY,
            1.27 - breath * 0.02 - sw - gw * (P.ruaOut * G.out + 0.05 * G.beat));
        if (B.rightLowerArm) B.rightLowerArm.rotation.set(
            gw * P.rlaTwist * G.open,
            el + 0.02 * Math.sin(t * TAU / 6.9 + 1) * k + gw * (P.rlaBend * G.raise + 0.16 * G.beat),
            0);
        if (B.rightHand) B.rightHand.rotation.set(gw * P.rhX * G.open, -0.12 * (1 - gw), 0.2 - 0.03 * lag - gw * (P.rhZ * G.open - 0.12 * G.beat));
        if (B.leftShoulder) B.leftShoulder.rotation.z = 0.035 * breath;
        if (B.rightShoulder) B.rightShoulder.rotation.z = -0.035 * breath;
        // fingers: soft curl, more toward the little finger, each segment a bit more; thumb rests in toward the palm
        const F = this.F || {}, cv = 1 + 0.06 * Math.sin(t * TAU / 4.7) * k;
        for (const side of ['left', 'right']) {
            const s = side === 'left' ? -1 : 1;
            // left = on the hip: fingers flatter, together; right = opens toward a flat palm while gesturing
            const cm = side === 'left' ? P.lFing : 1 - 0.65 * gw * G.open;
            [['Index', 0.18], ['Middle', 0.24], ['Ring', 0.3], ['Little', 0.36]].forEach(([f, a]) => {
                ['Proximal', 'Intermediate', 'Distal'].forEach((seg, i) => { const b = F[side + f + seg]; if (b) b.rotation.set(0, 0, s * a * cv * cm * (1 + i * 0.25)); });
            });
            const th = [F[side + 'ThumbMetacarpal'], F[side + 'ThumbProximal'], F[side + 'ThumbDistal']];
            if (th[0]) th[0].rotation.set(0, -s * 0.25, 0);
            if (th[1]) th[1].rotation.set(0, -s * 0.18, 0);
            if (th[2]) th[2].rotation.set(0, -s * 0.15 * cv, 0);
        }
    }

    // talking gestures: talk level from the mouth (analyser or text-timed queue); while talking, pick a new gesture
    // every 1.3-2.8 s (how high, how open, how far out) and add small beats on the syllable loudness.
    _gest(dt) {
        const G = this.G || (this.G = { w: 0, raise: 0, open: 0, beat: 0, out: 0, fwd: 0, tr: 0, to: 0, tout: 0, tf: 0, next: 0, ampPrev: 0, pulse: 0 });
        const a = this.audioEl, speaking = !!(this.tts || (this.analyser && a && !a.paused && !a.ended) || this.amp > 0.08);
        this.talkHold = speaking ? 0.9 : Math.max(0, (this.talkHold || 0) - dt);   // short pauses between words keep the arm up
        const on = speaking || this.talkHold > 0;
        G.w = ease(G.w, on ? 1 : 0, dt, on ? 0.35 : 0.7);
        G.next -= dt;
        if (on && G.next <= 0) {
            const r = Math.random();
            if (r < 0.45) { G.tr = 0.75 + Math.random() * 0.35; G.to = 0.8 + Math.random() * 0.2; G.tout = 0.2 + Math.random() * 0.4; G.tf = 0.7 + Math.random() * 0.3; }   // open palm, offered
            else if (r < 0.8) { G.tr = 0.55 + Math.random() * 0.25; G.to = 0.35 + Math.random() * 0.3; G.tout = 0.05 + Math.random() * 0.2; G.tf = 0.4 + Math.random() * 0.3; }   // low explain
            else { G.tr = 0.95 + Math.random() * 0.15; G.to = 0.6; G.tout = 0.5 + Math.random() * 0.3; G.tf = 0.9; }   // bigger sweep out
            G.next = 1.3 + Math.random() * 1.5;
        }
        G.raise = ease(G.raise, G.tr, dt, 0.32); G.open = ease(G.open, G.to, dt, 0.3);
        G.out = ease(G.out, G.tout, dt, 0.4); G.fwd = ease(G.fwd, G.tf, dt, 0.35);
        const rise = Math.max(0, (this.amp || 0) - G.ampPrev); G.ampPrev = this.amp || 0;   // syllable onsets -> beat
        G.pulse = Math.min(1, G.pulse + rise * 6) * Math.exp(-dt / 0.18);
        G.beat = ease(G.beat, G.pulse, dt, 0.06) * (this.calm ? 0.3 : 1);
    }

    step(dt) {
        const vrm = this.vrm, B = this.B, I = this.I; this.t += dt; const t = this.t;
        this._gest(dt);
        this._pose(0.5 + 0.5 * Math.sin(t * 2 * Math.PI / 4.2), t);
        // head: manual (setHead, -1..1) or idle look-arounds (pick a look every 4-10 s, ease in, hold, tiny drift)
        const ex = this.exprTarget;
        let ty, tp;
        if (this.manual) { ty = this.manual.yaw * 40; tp = this.manual.pitch * 20; }
        else {
            I.next -= dt;
            if (I.next <= 0) {
                const big = Math.random() < 0.35, home = Math.random() < 0.25;
                I.ty = home ? 0 : (Math.random() - 0.5) * (big ? 36 : 14); I.tp = home ? 0 : (Math.random() - 0.45) * (big ? 14 : 6); I.next = 4 + Math.random() * 6;
            }
            I.y = ease(I.y, I.ty, dt, 0.7); I.p = ease(I.p, I.tp, dt, 0.7);
            ty = I.y + 1.2 * Math.sin(t * 0.37); tp = I.p + 0.8 * Math.sin(t * 0.29 + 2);
        }
        ty += (ex._yaw || 0) * (this.exprAmt || 1); tp += (ex._pitch || 0) * (this.exprAmt || 1);
        I.yaw = ease(I.yaw, ty, dt, 0.16); I.pitch = ease(I.pitch, tp, dt, 0.16);
        const yr = THREE.MathUtils.degToRad(I.yaw), pr = THREE.MathUtils.degToRad(I.pitch);
        if (B.upperChest) B.upperChest.rotation.y = yr * 0.12;
        const sw = this.sway || 0;   // weight shift from _pose: neck/head tilt back against the hips roll so the eyes stay level-ish
        if (B.neck) B.neck.rotation.set(-pr * 0.4, yr * 0.35, -0.009 * sw);
        if (B.head) B.head.rotation.set(-pr * 0.6, yr * 0.53, -yr * 0.04 - 0.018 * sw);
        if (B.hips) B.hips.rotation.y = yr * 0.05;

        const em = vrm.expressionManager; if (!em) return;
        for (const k of VRM_EXPR) { this.expr[k] = ease(this.expr[k] || 0, (ex[k] || 0) * (this.exprAmt || 1), dt, 0.18); if (this.has.has(k)) em.setValue(k, this.expr[k]); }
        // blinks: random 2-6 s, 18 % doubles, ~200 ms close + open
        I.blinkNext -= dt;
        if (I.blinkPh < 0 && (I.blinkNext <= 0 || I.force)) { I.blinkPh = 0; I.blinkDouble = !I.force && Math.random() < 0.18; I.force = false; }
        let bw = 0;
        if (I.blinkPh >= 0) {
            I.blinkPh += dt / 0.2; const ph = I.blinkPh; bw = ph < 0.4 ? ph / 0.4 : 1 - clamp((ph - 0.4) / 0.6, 0, 1);
            if (ph >= 1) { bw = 0; if (I.blinkDouble) { I.blinkDouble = false; I.blinkPh = 0; } else { I.blinkPh = -1; I.blinkNext = 2 + Math.random() * 4; } }
        }
        if (this.has.has('blink')) em.setValue('blink', bw * (1 - (this.expr.happy || 0) * 0.6));
        // mouth: analyser audio (Kokoro clip) first, else the text-timed queue (device voice), else closed
        let vis = 'X', ampT = 0;
        const a = this.audioEl;
        if (this.analyser && a && !a.paused && !a.ended) {
            if (!this.fbuf) this.fbuf = new Float32Array(this.analyser.frequencyBinCount);
            this.analyser.getFloatFrequencyData(this.fbuf);
            if (this.lip && this.features) {
                const r = this.lip.update(this.features(this.fbuf, this.actx.sampleRate, this.analyser.fftSize), dt);
                vis = r.vis; ampT = clamp(0.35 + r.open * 0.8, 0, 1); if (!r.open) ampT = 0;
            } else {   // no classifier: loudness only -> 'aa'
                let m = -Infinity; for (let i = 2; i < 60 && i < this.fbuf.length; i++) m = Math.max(m, this.fbuf[i]);
                ampT = clamp((m + 75) / 40, 0, 1); vis = ampT > 0.1 ? 'A' : 'X';
            }
        } else if (this.tts) {
            const q = this.tts; q.clock += dt;
            const i = Math.floor(q.clock / q.step);
            if (i < q.queue.length) { vis = q.queue[i]; ampT = vis === 'X' ? 0 : 0.8; } else this.tts = null;
        }
        this.amp = ease(this.amp, ampT, dt, 0.045);
        for (const k in this.visW) { this.visW[k] = ease(this.visW[k], VIS[vis] === k ? 1 : 0, dt, 0.055); if (this.has.has(k)) em.setValue(k, this.visW[k] * this.amp * 0.9); }
    }

    draw() { this._fit(); this.renderer.render(this.scene, this.camera); }

    // ---- the page-facing surface (same names as avatar.js) ----
    setExpression(name, amt) { if (EXPR_MAP[name]) this.exprTarget = EXPR_MAP[name]; if (amt != null) this.exprAmt = clamp(amt, 0, 1); }
    setHead(h) { this.manual = h ? { yaw: clamp(h.yaw || 0, -1, 1), pitch: clamp(h.pitch || 0, -1, 1) } : null; }
    blinkNow() { this.I.force = true; }
    useAnalyser(actx, analyser, el) { this.actx = actx; this.analyser = analyser; this.audioEl = el; this.fbuf = null; }
    pushWord(word, dur) { const q = textVisemes(word); this.tts = { queue: q, step: (dur || 0.3) / Math.max(q.length, 1), clock: 0 }; }
    endWords() { this.tts = null; }
    alphaAt(px, py, r) {   // render + read in the same task (no preserveDrawingBuffer needed)
        if (!this.renderer || !this.vrm) return 0;
        this.draw();
        const gl = this.renderer.getContext(), W = this.canvas.width, H = this.canvas.height;
        const x0 = clamp(Math.round(px - r), 0, W - 1), x1 = clamp(Math.round(px + r), 0, W - 1);
        const y0 = clamp(Math.round(py - r), 0, H - 1), y1 = clamp(Math.round(py + r), 0, H - 1);
        const w = x1 - x0 + 1, h = y1 - y0 + 1, buf = new Uint8Array(w * h * 4);
        try { gl.readPixels(x0, H - 1 - y1, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf); } catch { return 0; }
        let m = 0; for (let i = 3; i < buf.length; i += 4) if (buf[i] > m) m = buf[i];
        return m;
    }
    start() {
        if (this.running || !this.renderer) return; this.running = true; let last = performance.now();
        const loop = now => {
            if (!this.running || !this.renderer) return;
            const dt = Math.min(0.05, (now - last) / 1000); last = now;
            if (this.vrm) { this.step(dt); this.vrm.update(dt); }
            this.draw(); requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }
    stop() { this.running = false; }
    destroy() {   // free the GPU: WebGL contexts are scarce on phones
        this.running = false;
        if (this.vrm) { this.scene.remove(this.vrm.scene); VRMUtils.deepDispose(this.vrm.scene); this.vrm = null; }
        if (this.renderer) { this.renderer.dispose(); try { this.renderer.forceContextLoss(); } catch { } this.renderer = null; }
        this.audioEl = this.analyser = this.actx = null;
    }
}

export async function create(canvas, opts) {
    const av = new Avatar3D(canvas, opts);
    try { return await av._load(); } catch (e) { av.destroy(); throw e; }
}
