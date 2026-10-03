// canvasview.js - THE canvas viewport + input engine (L 2026-10-03: "there's a lot of code that is similar" - the radar
// map, the Spending Galaxy and the Louverse code map each carried their own copy of the same zoom / pan / touch rules,
// and every fix was done three times). Now one copy: a map mounts this on its <canvas> and only draws its own stars.
//
//   const cvw = mountCanvasView(cv, { world, draw, hit, hold, grab, onDrag, onDragEnd, onTap, onFit, sliders, ... })
//
// THE MAP RULES (all of them, the way L settled them 2026-10-02/03):
//   - fit(keep): size the canvas to its CSS box (device pixels); the "base" view fits the world with `pad`. keep = true
//     (resizes, the iPad toolbar collapsing mid-scroll) holds the zoom and the world point under the centre.
//   - Shift + wheel (or Ctrl = trackpad pinch) zooms at the pointer; a plain wheel scrolls the PAGE.
//   - one finger scrolls the page natively (touch-action pan-y); two fingers pinch-zoom AND pan (midpoint follow);
//     hold ~0.5 s then drag moves the map (empty space) or an object (what `hold` says); a drag never counts as a tap.
//   - mouse: drag pans; middle button or Shift + left ALWAYS pans (never grabs / taps); double-click resets the view.
//   - edge sliders mirror the view over `slExtent` (default: the world) and move it when dragged; hidden until zoomed.
//   - draws are coalesced to one per animation frame (requestDraw); a full frame is drawn once the fingers lift.
//   - a ResizeObserver re-fits when the canvas gets real size (a section that was display:none when mounted).
//
// options (all optional except world + draw):
//   world()            -> {x0, y0, x1, y1} in world units, or null when there is nothing to show yet
//   flipY              world y grows UP (floor plans); default false (y grows down, like the screen)
//   pad / minZoom / maxZoom   fit padding in CSS px (14) and zoom limits as multiples of the base scale (0.8 / 160)
//   draw()             the map's own drawing; read cvw.view / cvw.base / cvw.world / cvw.moving inside it
//   hit(mx, my, e)     -> what is under the pointer (any value) or null; feeds hold / grab / onTap
//   grab(target, e)    -> true = drag that target right away, no hold (the code map's stars at deep zoom)
//   hold(target, e)    -> "drag" (drag the target) | "pan" (move the map) | a function(target) (the code map's ring)
//                         | null (no hold). Default: "pan" on empty space for touch, nothing otherwise.
//   onDrag(target, dxWorld, dyWorld)   onDragEnd(target, moved)   onTap(target, mx, my, e)   onFit()
//   sliders {x, y}     the two <input type=range> (0..1000); slVar = the CSS var the y slider's length is written to
//   holdMs (480)       dblclickReset (true)   resize (true: window resize + ResizeObserver re-fit)
// returns { view, base, world, fitted, moving, held, fit, draw, requestDraw, zoomAt, centerOn, reset, toC, P, unP,
//           syncSliders, destroy }. view / base are mutated in place, so a map may keep a reference to them.
export function mountCanvasView(cv, opts) {
  const o = Object.assign({ pad: 14, minZoom: 0.8, maxZoom: 160, flipY: false, sliders: null, slVar: "--sl-h", holdMs: 480, dblclickReset: true, resize: true }, opts);
  const view = { s: 1, ox: 0, oy: 0, dpr: 1 }, base = { s: 1, ox: 0, oy: 0, dpr: 1 };
  let W = null, fitted = false, raf = 0, slHeld = null;
  const ptr = new Map(); let drag = null, pinch = null, mid = null, moved = false, press = null, mov = null;   // mov = {kind:"pan"} | {kind:"drag", target}

  const draw = () => { o.draw(); syncSliders(); };
  const requestDraw = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); };
  const toC = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * view.dpr, (e.clientY - r.top) * view.dpr]; };
  const P = (wx, wy) => [view.ox + (wx - W.x0) * view.s, view.oy + (o.flipY ? W.y1 - wy : wy - W.y0) * view.s];
  const unP = (sx, sy) => { const t = (sy - view.oy) / view.s; return [W.x0 + (sx - view.ox) / view.s, o.flipY ? W.y1 - t : W.y0 + t]; };

  function fit(keep = true) {
    const prev = keep && fitted && W && view.s > base.s * 1.01 ? (c => ({ zoom: view.s / base.s, cx: c[0], cy: c[1] }))(unP(cv.width / 2, cv.height / 2)) : null;
    const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    if (o.sliders?.y) o.sliders.y.style.setProperty(o.slVar, Math.max(60, r.height - 40) + "px");
    W = o.world() || null; view.dpr = base.dpr = dpr;
    if (!W) { fitted = false; o.onFit?.(); draw(); return; }
    const pad = o.pad * dpr, ww = W.x1 - W.x0 || 1, wh = W.y1 - W.y0 || 1, s = Math.min((cv.width - 2 * pad) / ww, (cv.height - 2 * pad) / wh);
    Object.assign(base, { s, dpr, ox: (cv.width - ww * s) / 2, oy: (cv.height - wh * s) / 2 }); Object.assign(view, base); fitted = true;
    if (prev) { view.s = base.s * prev.zoom; centerOn(prev.cx, prev.cy); }
    o.onFit?.(); draw();
  }
  function centerOn(wx, wy, minZoom) {
    if (!fitted) return; if (minZoom) view.s = Math.max(view.s, base.s * minZoom);
    view.ox = cv.width / 2 - (wx - W.x0) * view.s; view.oy = cv.height / 2 - (o.flipY ? W.y1 - wy : wy - W.y0) * view.s;
  }
  function zoomAt(px, py, f) {
    if (!fitted) return; const ns = Math.max(base.s * o.minZoom, Math.min(base.s * o.maxZoom, view.s * f)); f = ns / view.s;
    view.ox = px - (px - view.ox) * f; view.oy = py - (py - view.oy) * f; view.s = ns; requestDraw();
  }
  function reset() { if (!fitted) return; Object.assign(view, base); draw(); }

  // ---- edge sliders: t = 0 puts the extent's left/top edge at the box edge, t = 1 its right/bottom edge ----
  function slInfo() {
    if (!fitted) return null; const E = (o.slExtent && o.slExtent()) || W; if (!E) return null;
    return { ex: (E.x1 - E.x0) * view.s - cv.width, ey: (E.y1 - E.y0) * view.s - cv.height,
      left: (E.x0 - W.x0) * view.s, top: (o.flipY ? W.y1 - E.y1 : E.y0 - W.y0) * view.s };
  }
  function syncSliders() {
    const sl = o.sliders; if (!sl?.x || !sl?.y) return; const i = slInfo(); if (!i) return; const zoomed = view.s > base.s * 1.05;
    sl.x.hidden = !(zoomed || i.ex > 1); sl.y.hidden = !(zoomed || i.ey > 1); sl.x.disabled = i.ex <= 1; sl.y.disabled = i.ey <= 1;
    if (i.ex > 1 && slHeld !== "x") sl.x.value = Math.round(Math.max(0, Math.min(1, (-view.ox - i.left) / i.ex)) * 1000);
    if (i.ey > 1 && slHeld !== "y") sl.y.value = Math.round(Math.max(0, Math.min(1, (-view.oy - i.top) / i.ey)) * 1000);
  }
  if (o.sliders) for (const [axis, el] of [["x", o.sliders.x], ["y", o.sliders.y]]) {
    if (!el) continue;
    el.addEventListener("pointerdown", () => { slHeld = axis; }); el.addEventListener("pointerup", () => { slHeld = null; }); el.addEventListener("pointercancel", () => { slHeld = null; });
    el.addEventListener("input", () => { const i = slInfo(); if (!i) return; const t = Number(el.value) / 1000;
      if (axis === "x") { if (i.ex > 1) view.ox = -i.left - t * i.ex; } else if (i.ey > 1) view.oy = -i.top - t * i.ey; requestDraw(); });
  }

  // ---- input ----
  cv.style.touchAction = "pan-y";
  // a press-and-hold must never turn into the phone's text selection / callout over the map (L 2026-10-03: "when I press
  // and hold I'll sometimes highlight the map window") - no selection on the canvas or its box, no long-press menu
  for (const el of [cv, cv.parentElement]) if (el) { el.style.userSelect = "none"; el.style.webkitUserSelect = "none"; el.style.webkitTouchCallout = "none"; }
  cv.addEventListener("contextmenu", e => e.preventDefault());
  cv.addEventListener("selectstart", e => e.preventDefault());
  const buzz = () => { if (navigator.vibrate) try { navigator.vibrate(15); } catch (_) {} };
  cv.addEventListener("wheel", e => { if (!e.shiftKey && !e.ctrlKey) return; e.preventDefault(); const [x, y] = toC(e); zoomAt(x, y, Math.exp(-(e.deltaY || e.deltaX) * 0.0015)); }, { passive: false });
  cv.addEventListener("touchstart", e => { if (e.touches.length >= 2) e.preventDefault(); }, { passive: false });
  cv.addEventListener("touchmove", e => { if (e.touches.length >= 2 || mov) e.preventDefault(); }, { passive: false });
  cv.addEventListener("mousedown", e => { if (e.button === 1) e.preventDefault(); }); cv.addEventListener("auxclick", e => { if (e.button === 1) e.preventDefault(); });
  cv.addEventListener("pointerdown", e => {
    try { cv.setPointerCapture(e.pointerId); } catch (_) {} ptr.set(e.pointerId, toC(e)); moved = false;
    if (ptr.size === 1) {
      drag = toC(e); clearTimeout(press); press = null; mov = null;
      if (e.button === 1 || e.shiftKey) { e.preventDefault(); moved = true; mov = { kind: "pan" }; return; }
      const target = fitted && o.hit ? o.hit(drag[0], drag[1], e) : null;
      if (target != null && o.grab && o.grab(target, e)) { mov = { kind: "drag", target }; cv.style.cursor = "grabbing"; return; }
      const what = o.hold ? o.hold(target, e) : (target == null && e.pointerType === "touch" ? "pan" : null);
      if (what) press = setTimeout(() => { press = null; if (moved) return; moved = true; buzz();
        if (what === "pan") { mov = { kind: "pan" }; cv.style.cursor = "grabbing"; }
        else if (what === "drag") { mov = { kind: "drag", target }; cv.style.cursor = "grabbing"; }
        else if (typeof what === "function") { drag = null; what(target); }
        requestDraw(); }, o.holdMs);
    }
    if (ptr.size === 2) { clearTimeout(press); press = null; mov = null; cv.style.cursor = ""; const [a, b] = [...ptr.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }
  });
  cv.addEventListener("pointermove", e => {
    if (!ptr.has(e.pointerId)) return; const p = toC(e); ptr.set(e.pointerId, p);
    if (ptr.size === 2 && pinch) { const [a, b] = [...ptr.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      if (mid) { view.ox += m[0] - mid[0]; view.oy += m[1] - mid[1]; } zoomAt(m[0], m[1], d / pinch); pinch = d; mid = m; moved = true; return; }
    if (!drag) return; const dx = p[0] - drag[0], dy = p[1] - drag[1];
    if (mov) { moved = true;
      if (mov.kind === "pan") { view.ox += dx; view.oy += dy; } else o.onDrag?.(mov.target, dx / view.s, (o.flipY ? -dy : dy) / view.s);
      drag = p; requestDraw(); return; }
    if (Math.abs(dx) + Math.abs(dy) > 6) { moved = true; clearTimeout(press); press = null; }
    if (e.pointerType === "touch") { drag = p; return; }   // one finger without a hold: the browser scrolls the page, the map stays put
    if (!moved) return; view.ox += dx; view.oy += dy; drag = p; requestDraw();   // a mouse drag pans
  });
  const up = e => {
    ptr.delete(e.pointerId); clearTimeout(press); press = null;
    if (ptr.size < 2) { pinch = null; mid = null; drag = ptr.size ? [...ptr.values()][0] : null; }
    if (!ptr.size) { const m = mov; mov = null; cv.style.cursor = ""; if (m?.kind === "drag") o.onDragEnd?.(m.target, moved); requestDraw(); }
  };
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
  if (o.dblclickReset) cv.addEventListener("dblclick", reset);
  cv.addEventListener("click", e => { if (moved) { moved = false; return; } if (!fitted) return; const [mx, my] = toC(e); o.onTap?.(o.hit ? o.hit(mx, my, e) : null, mx, my, e); });

  // ---- size changes ----
  const onResize = () => fit(true); if (o.resize) addEventListener("resize", onResize);
  let lastW = 0, lastH = 0;
  const ro = o.resize && typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => { const r = cv.getBoundingClientRect(); if (r.width && (r.width !== lastW || r.height !== lastH)) { lastW = r.width; lastH = r.height; fit(true); } }) : null;
  ro?.observe(cv);

  return { view, base, get world() { return W; }, get fitted() { return fitted; }, get moving() { return ptr.size > 0; }, get held() { return mov; },
    fit, draw, requestDraw, zoomAt, centerOn, reset, toC, P, unP, syncSliders,
    destroy() { ro?.disconnect(); removeEventListener("resize", onResize); } };
}
