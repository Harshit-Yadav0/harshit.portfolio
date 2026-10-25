/* Procedural closed race track: a star-shaped loop with one outer corner per project. */
(function (root) {
  'use strict';

  function rnd(seed) {
    let s = seed;
    return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  }
  function cr(p0, p1, p2, p3, t) {
    const t2 = t * t, t3 = t2 * t;
    const f = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
    return { x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) };
  }
  function wrap(a) {
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a < -Math.PI) a += 2 * Math.PI;
    return a;
  }

  function build(N, ROAD, startGap) {
    const rand = rnd(7);
    const R = Math.max(1250, N * 250);
    const ratio = 0.7 + Math.min(0.1, (N - 6) * 0.01);

    const ctrl = [], outer = [];
    for (let i = 0; i < N; i++) {
      const a0 = -Math.PI / 2 + (i / N) * Math.PI * 2;
      const ro = R * (1 + (rand() - 0.5) * 0.2);
      outer.push(ctrl.length);
      ctrl.push({ x: Math.cos(a0) * ro * 1.3, y: Math.sin(a0) * ro * 0.9 });
      const a1 = a0 + Math.PI / N;
      const ri = R * ratio * (1 + (rand() - 0.5) * 0.14);
      ctrl.push({ x: Math.cos(a1) * ri * 1.3, y: Math.sin(a1) * ri * 0.9 });
    }

    // dense spline
    const M = ctrl.length, dense = [];
    for (let i = 0; i < M; i++) {
      const p0 = ctrl[(i - 1 + M) % M], p1 = ctrl[i], p2 = ctrl[(i + 1) % M], p3 = ctrl[(i + 2) % M];
      for (let k = 0; k < 60; k++) dense.push(cr(p0, p1, p2, p3, k / 60));
    }
    const D = dense.length, cum = [0];
    for (let i = 1; i <= D; i++) {
      const a = dense[i - 1], b = dense[i % D];
      cum.push(cum[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
    }
    const L = cum[D];

    // resample at uniform spacing
    const n = Math.round(L / 10), step = L / n;
    let TX = new Float64Array(n), TY = new Float64Array(n);
    let j = 0;
    for (let i = 0; i < n; i++) {
      const s = i * step;
      while (j < D - 1 && cum[j + 1] < s) j++;
      const a = dense[j], b = dense[(j + 1) % D];
      const f = (s - cum[j]) / ((cum[j + 1] - cum[j]) || 1);
      TX[i] = a.x + (b.x - a.x) * f;
      TY[i] = a.y + (b.y - a.y) * f;
    }

    // heading + smoothed curvature
    let TA = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const p = (i - 1 + n) % n, q = (i + 1) % n;
      TA[i] = Math.atan2(TY[q] - TY[p], TX[q] - TX[p]);
    }
    const raw = new Float64Array(n);
    for (let i = 0; i < n; i++) raw[i] = wrap(TA[(i + 1) % n] - TA[(i - 1 + n) % n]) / (2 * step);
    let TK = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let k = -6; k <= 6; k++) sum += raw[(i + k + n) % n];
      TK[i] = sum / 13;
    }

    // corner slots (outer vertices)
    const slots = outer.map(function (ci) {
      const c = ctrl[ci];
      let best = 1e18, bi = 0;
      for (let i = 0; i < n; i++) {
        const d = (TX[i] - c.x) * (TX[i] - c.x) + (TY[i] - c.y) * (TY[i] - c.y);
        if (d < best) { best = d; bi = i; }
      }
      const sgn = TK[bi] >= 0 ? 1 : -1;
      return { idx: bi, x: TX[bi], y: TY[bi], dx: sgn * Math.sin(TA[bi]), dy: -sgn * Math.cos(TA[bi]) };
    });

    // rotate so index 0 (start line) is startGap units before the first corner
    const shift = (((slots[0].idx - Math.round(startGap / step)) % n) + n) % n;
    const rot = function (a) {
      const o = new Float64Array(n);
      for (let i = 0; i < n; i++) o[i] = a[(i + shift) % n];
      return o;
    };
    TX = rot(TX); TY = rot(TY); TA = rot(TA); TK = rot(TK);
    slots.forEach(function (s) { s.idx = (((s.idx - shift) % n) + n) % n; });

    return { n: n, step: step, L: L, TX: TX, TY: TY, TA: TA, TK: TK, slots: slots };
  }

  const api = { build: build };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Track = api;
})(typeof window !== 'undefined' ? window : globalThis);
