// avatar3d.js - 3D (VRM) avatar for onlinechat, same surface as the 2.5D avatar.js instance:
//   const av = await create(canvas, { url | load, onProgress })
//   av.W / av.H / av.rig.fullbody   layout hints (full-body figure in a 1:2 box, like the 2.5D full-body rigs)
//   av.start() / av.stop() / av.destroy()
//   av.useAnalyser(actx, analyser, audioEl)   lip-sync from the TTS <audio> analyser
//   av.pushWord(word, dur) / av.endWords()    text-timed mouth when there is no analyser audio (device voice)
//   av.setExpression(name, amt) / av.setHead(h | null) / av.blinkNow()
//   av.alphaAt(px, py, r)                     max alpha 0-255 of rendered pixels around canvas px (hit-testing)
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
        const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance' });
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
        this._pose(0);
        vrm.update(0); vrm.scene.updateMatrixWorld(true);
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
        cam.position.set(0, cy, dist); cam.lookAt(0, cy, 0);
    }

    _pose(breath) {   // relaxed arms out of the T-pose + breathing
        const B = this.B;
        if (B.leftUpperArm) B.leftUpperArm.rotation.set(0.05, 0, -1.3 + breath * 0.015);
        if (B.rightUpperArm) B.rightUpperArm.rotation.set(0.05, 0, 1.3 - breath * 0.015);
        if (B.leftLowerArm) B.leftLowerArm.rotation.set(0, -0.28, 0);
        if (B.rightLowerArm) B.rightLowerArm.rotation.set(0, 0.28, 0);
        if (B.leftHand) B.leftHand.rotation.set(0, 0.1, -0.18);
        if (B.rightHand) B.rightHand.rotation.set(0, -0.1, 0.18);
        if (B.spine) B.spine.rotation.x = -0.012 * breath;
        if (B.chest) B.chest.rotation.x = -0.02 * breath;
        if (B.leftShoulder) B.leftShoulder.rotation.z = 0.025 * breath;
        if (B.rightShoulder) B.rightShoulder.rotation.z = -0.025 * breath;
    }

    step(dt) {
        const vrm = this.vrm, B = this.B, I = this.I; this.t += dt; const t = this.t;
        this._pose(0.5 + 0.5 * Math.sin(t * 2 * Math.PI / 4.2));
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
        if (B.neck) B.neck.rotation.set(-pr * 0.4, yr * 0.35, 0);
        if (B.head) B.head.rotation.set(-pr * 0.6, yr * 0.53, -yr * 0.04);
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
