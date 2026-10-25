/* Drift portfolio: a 2D car laps a track, drifting through corners; each drift unlocks a project card. */
(async function () {
  'use strict';

  const data = await Store.load();
  const projects = data.projects;
  const profile = data.profile;

  const $ = function (id) { return document.getElementById(id); };
  const esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); };
  const clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  const wrap = function (a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  function safeUrl(u) {
    u = String(u || '').trim();
    if (!u) return '';
    if (/^(https?:|mailto:|\/|\.|#)/i.test(u)) return u;
    return 'https://' + u;
  }
  function safeImg(u) {
    u = String(u || '').trim();
    if (!u) return '';
    if (/^(data:image\/|https?:\/\/|\/|\.)/i.test(u)) return u;
    return '';
  }
  const hue = function (i) { return (18 + i * 53) % 360; };

  /* Ensure optional HUD elements exist so missing HTML tags never crash the game */
  const navEl = document.querySelector('header.hud nav');
  if (navEl && !$('btnSound')) {
    const sb = document.createElement('button');
    sb.id = 'btnSound';
    sb.className = 'pill ghost';
    sb.type = 'button';
    sb.textContent = 'Sound: off';
    navEl.insertBefore(sb, navEl.lastElementChild);
  }
  if (!$('score')) {
    const sc = document.createElement('div');
    sc.id = 'score';
    sc.className = 'hud score hidden';
    sc.innerHTML = '<div id="drift"></div><div id="total">SCORE 0</div>';
    document.body.appendChild(sc);
  }

  /* ---------- header ---------- */
  document.title = profile.name + ' · Portfolio';
  $('name').textContent = profile.name;
  $('tagline').textContent = profile.tagline;
  const soc = [];
  if (profile.github) soc.push('<a href="' + esc(safeUrl(profile.github)) + '" target="_blank" rel="noopener">GitHub</a>');
  if (profile.linkedin) soc.push('<a href="' + esc(safeUrl(profile.linkedin)) + '" target="_blank" rel="noopener">LinkedIn</a>');
  if (profile.email) soc.push('<a href="mailto:' + esc(profile.email) + '">Email</a>');
  $('social').innerHTML = soc.join('');

  /* ---------- canvas ---------- */
  const canvas = $('stage'), ctx = canvas.getContext('2d');
  const world = $('world');
  let W = 0, H = 0, DPR = 1;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 1.5);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  }
  window.addEventListener('resize', resize);
  resize();

  /* ---------- track ---------- */
  const ROAD = 180, CAR_L = 76, CAR_W = 38;
  const T = Track.build(Math.max(6, projects.length), ROAD, 900);
  const n = T.n, step = T.step, L = T.L, TX = T.TX, TY = T.TY, TA = T.TA, TK = T.TK, slots = T.slots;

  // Road is split into small chunks so only the ones on screen get stroked each frame.
  const CHUNK = 30;
  const chunks = [];
  for (let a = 0; a < n; a += CHUNK) {
    const p = new Path2D();
    const end = Math.min(a + CHUNK, n);
    let x0 = 1e18, y0 = 1e18, x1 = -1e18, y1 = -1e18;
    p.moveTo(TX[a], TY[a]);
    for (let k = a; k <= end; k++) {
      const x = TX[k % n], y = TY[k % n];
      if (k > a) p.lineTo(x, y);
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    const pad = ROAD / 2 + 30;
    chunks.push({ p: p, x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad, off: a * step });
  }

  const cardPos = slots.map(function (s) {
    const half = 150 * (Math.abs(s.dx) + Math.abs(s.dy));
    const d = ROAD / 2 + 70 + half;
    return { cx: s.x + s.dx * d, cy: s.y + s.dy * d };
  });

  // scenery
  let bounds;
  const trees = (function () {
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (let i = 0; i < n; i++) { minX = Math.min(minX, TX[i]); maxX = Math.max(maxX, TX[i]); minY = Math.min(minY, TY[i]); maxY = Math.max(maxY, TY[i]); }
    cardPos.forEach(function (c) { minX = Math.min(minX, c.cx - 400); maxX = Math.max(maxX, c.cx + 400); minY = Math.min(minY, c.cy - 400); maxY = Math.max(maxY, c.cy + 400); });
    minX -= 500; maxX += 500; minY -= 500; maxY += 500;
    bounds = { minX: minX, maxX: maxX, minY: minY, maxY: maxY };
    let seed = 99;
    const rnd = function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const out = [];
    const target = Math.min(450, Math.floor(((maxX - minX) * (maxY - minY)) / 170000));
    let tries = 0;
    while (out.length < target && tries++ < target * 8) {
      const x = minX + rnd() * (maxX - minX), y = minY + rnd() * (maxY - minY);
      let ok = true;
      for (let i = 0; i < n; i += 2) {
        const dx = TX[i] - x, dy = TY[i] - y;
        if (dx * dx + dy * dy < (ROAD / 2 + 70) * (ROAD / 2 + 70)) { ok = false; break; }
      }
      if (ok) for (let k = 0; k < cardPos.length; k++) { if (Math.abs(cardPos[k].cx - x) < 260 && Math.abs(cardPos[k].cy - y) < 260) { ok = false; break; } }
      if (ok) out.push({ x: x, y: y, r: 22 + rnd() * 34, t: rnd() });
    }
    return out;
  })();

  /* ---------- cards ---------- */
  const slotEls = [], revealed = projects.map(function () { return false; });
  function linksHTML(p) {
    const a = [], l = safeUrl(p.link), r = safeUrl(p.repo);
    if (l) a.push('<a href="' + esc(l) + '" target="_blank" rel="noopener">Live &#8599;</a>');
    if (r) a.push('<a class="alt" href="' + esc(r) + '" target="_blank" rel="noopener">Code</a>');
    return a.join('');
  }
  function tagsHTML(p) { return '<div class="tags">' + p.tags.map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('') + '</div>'; }
  function mediaHTML(p, i) {
    const img = safeImg(p.image);
    return '<div class="media">' + (img ? '<img src="' + esc(img) + '" alt="" loading="lazy">' : '') + '<span class="num">' + String(i + 1).padStart(2, '0') + '</span></div>';
  }
  projects.forEach(function (p, i) {
    const el = document.createElement('div');
    el.className = 'slot';
    el.style.left = cardPos[i].cx + 'px';
    el.style.top = cardPos[i].cy + 'px';
    el.style.setProperty('--h', hue(i));
    el.innerHTML = '<article class="card">' + mediaHTML(p, i) + '<div class="body"><h3>' + esc(p.title) + '</h3><p>' + esc(p.description) + '</p>' + tagsHTML(p) + '<div class="links">' + linksHTML(p) + '</div></div></article>';
    world.appendChild(el);
    slotEls.push(el);
  });

  /* ---------- side panel ---------- */
  const plist = $('plist'), panel = $('panel');
  plist.innerHTML = projects.length ? projects.map(function (p, i) {
    return '<li class="card" style="--h:' + hue(i) + '">' + mediaHTML(p, i) + '<div class="body"><h3>' + esc(p.title) + '</h3><p>' + esc(p.description) + '</p>' + tagsHTML(p) + '<div class="links">' + linksHTML(p) + '<button type="button" class="alt" data-locate="' + i + '">Locate</button></div></div></li>';
  }).join('') : '<li class="empty">No projects yet. Add some in the admin portal.</li>';
  plist.addEventListener('click', function (e) {
    const b = e.target.closest('[data-locate]');
    if (!b) return;
    locate(+b.getAttribute('data-locate'));
    panel.classList.remove('open');
  });
  $('btnProjects').addEventListener('click', function () { panel.classList.toggle('open'); this.blur(); });
  $('btnClose').addEventListener('click', function () { panel.classList.remove('open'); });

  function updateCount() {
    const c = revealed.filter(Boolean).length;
    $('count').textContent = c + '/' + projects.length;
    return c;
  }
  updateCount();

  let toastTimer = 0;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  /* ---------- state ---------- */
  let mode = 'auto', time = 0, focus = null;
  const keys = { up: false, down: false, left: false, right: false, brake: false };
  const auto = { s: 0, v: 250, slip: 0, ox: 0, oy: 0, oh: 0 };
  const man = { x: 0, y: 0, h: 0, vx: 0, vy: 0 };
  const car = { x: TX[0], y: TY[0], h: TA[0], vx: 0, vy: 0, speed: 0, drift: 0, front: 0, braking: false, accel: false };
  const cam = { x: TX[0], y: TY[0], z: 0.8 };

  const smoke = [], skids = [], rings = [];
  const lastSkid = [null, null];
  const sparks = [], flames = [];
  const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let shake = 0, shX = 0, shY = 0, score = 0, driftPts = 0, driftIdle = 0, lastD = '', lastS = -1;
  const dust = [];
  for (let i = 0; i < 48; i++) dust.push({ x: Math.random() * 5000, y: Math.random() * 5000, p: 0.3 + Math.random() * 0.7, r: 1 + Math.random() * 2, t: Math.random() * 6, c: Math.random() < 0.5 ? '255,220,160' : '170,255,215' });

  function baseZoom() { return clamp(Math.min(W, H) / 820, 0.5, 0.95); }
  cam.z = baseZoom();

  function nearest(x, y) {
    let b = 1e18, bi = 0;
    for (let i = 0; i < n; i++) {
      const dx = TX[i] - x, dy = TY[i] - y, d = dx * dx + dy * dy;
      if (d < b) { b = d; bi = i; }
    }
    return { i: bi, d: Math.sqrt(b) };
  }

  /* ---------- autopilot (follows the track, with stylised oversteer) ---------- */
  function stepAuto(dt) {
    const f = auto.s / step, i0 = Math.floor(f) % n, fr = f - Math.floor(f), i1 = (i0 + 1) % n;
    let kmax = 0;
    for (let k = 0; k < 26; k++) { const kk = Math.abs(TK[(i0 + k) % n]); if (kk > kmax) kmax = kk; }
    const tv = clamp(900 / (1 + kmax * 150), 360, 900);
    auto.braking = tv < auto.v - 30;
    auto.v += (tv - auto.v) * Math.min(1, dt * (tv > auto.v ? 1.2 : 3.5));
    const kc = TK[(i0 + 4) % n];
    const st = clamp(kc * auto.v * 0.2, -0.85, 0.85);
    auto.slip += (st - auto.slip) * Math.min(1, dt * 5);
    auto.s = (auto.s + auto.v * dt) % L;

    let px = TX[i0] + (TX[i1] - TX[i0]) * fr, py = TY[i0] + (TY[i1] - TY[i0]) * fr;
    const ang = TA[i0] + wrap(TA[i1] - TA[i0]) * fr;
    const off = Math.min(Math.abs(auto.slip) * 28, 24) * Math.sign(auto.slip);
    px += Math.sin(ang) * off + auto.ox;
    py += -Math.cos(ang) * off + auto.oy;
    const d = Math.exp(-2.5 * dt);
    auto.ox *= d; auto.oy *= d; auto.oh *= d;

    car.x = px; car.y = py;
    car.h = ang + auto.slip + auto.oh;
    car.vx = Math.cos(ang) * auto.v; car.vy = Math.sin(ang) * auto.v;
    car.speed = auto.v;
    car.drift = Math.abs(auto.slip);
    car.front = clamp(-auto.slip * 0.8, -0.6, 0.6);
    car.braking = auto.braking;
    car.accel = tv > auto.v + 15;
  }

  /* ---------- manual driving (arcade drift physics) ---------- */
  function stepManual(dt) {
    const m = man;
    const steer = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    let fx = Math.cos(m.h), fy = Math.sin(m.h);
    let vF = m.vx * fx + m.vy * fy;

    const sf = clamp(Math.abs(vF) / 240, 0, 1) * (vF >= 0 ? 1 : -1);
    m.h += steer * 2.7 * (keys.brake ? 1.45 : 1) * sf * dt;

    fx = Math.cos(m.h); fy = Math.sin(m.h);
    const rx = -fy, ry = fx;
    vF = m.vx * fx + m.vy * fy;
    let vL = m.vx * rx + m.vy * ry;

    if (keys.up) vF += 740 * dt;
    if (keys.down) vF -= (vF > 20 ? 1100 : 480) * dt;
    vF -= vF * 0.8 * dt;
    const g = nearest(m.x, m.y);
    const off = g.d > ROAD / 2 + 12;
    if (off) vF -= vF * 1.1 * dt;
    vF = clamp(vF, -260, 980);

    let grip = keys.brake ? 1.0 : 6.6;
    if (!keys.brake) grip -= Math.abs(steer) * clamp(vF / 900, 0, 1) * 3.3;
    vL *= Math.exp(-grip * dt);
    if (keys.brake) vF *= Math.exp(-0.45 * dt);

    m.vx = fx * vF + rx * vL; m.vy = fy * vF + ry * vL;
    m.x += m.vx * dt; m.y += m.vy * dt;
    if (m.x < bounds.minX) { m.x = bounds.minX; m.vx = 0; }
    if (m.x > bounds.maxX) { m.x = bounds.maxX; m.vx = 0; }
    if (m.y < bounds.minY) { m.y = bounds.minY; m.vy = 0; }
    if (m.y > bounds.maxY) { m.y = bounds.maxY; m.vy = 0; }

    car.x = m.x; car.y = m.y; car.h = m.h; car.vx = m.vx; car.vy = m.vy;
    car.speed = Math.hypot(m.vx, m.vy);
    car.drift = car.speed > 60 ? Math.atan2(Math.abs(vL), Math.abs(vF) + 1) : 0;
    car.front = steer * 0.45;
    car.braking = keys.down || keys.brake;
    car.accel = keys.up;
  }

  function setMode(m) {
    if (m === mode) return;
    if (m === 'manual') {
      man.x = car.x; man.y = car.y; man.h = car.h; man.vx = car.vx; man.vy = car.vy;
      mode = 'manual';
      $('btnDrive').textContent = 'Autopilot';
      if ($('score')) $('score').classList.remove('hidden');
      if (matchMedia('(pointer: coarse)').matches) $('touch').classList.remove('hidden');
    } else {
      const g = nearest(car.x, car.y);
      auto.s = g.i * step;
      auto.v = clamp(car.speed, 260, 600);
      auto.slip = 0;
      auto.ox = car.x - TX[g.i]; auto.oy = car.y - TY[g.i]; auto.oh = wrap(car.h - TA[g.i]);
      mode = 'auto';
      $('btnDrive').textContent = 'Take the wheel';
      if ($('score')) $('score').classList.add('hidden');
      $('touch').classList.add('hidden');
      Object.keys(keys).forEach(function (k) { keys[k] = false; });
    }
    setHint();
  }
  function setHint() {
    const touch = matchMedia('(pointer: coarse)').matches;
    $('hint').textContent = mode === 'auto'
      ? 'Autopilot: every drift unlocks a project' + (touch ? '' : '  ·  press any arrow key to drive')
      : (touch ? 'Drive to the ? markers  ·  hold DRIFT for handbrake slides' : 'WASD / arrows to drive  ·  Space = handbrake drift  ·  M = autopilot');
  }
  $('btnDrive').addEventListener('click', function () { setMode(mode === 'auto' ? 'manual' : 'auto'); this.blur(); });
  setHint();

  const KEYMAP = { ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down', ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right', ' ': 'brake' };
  window.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Escape') { panel.classList.remove('open'); return; }
    if (e.key === 'm' || e.key === 'M') { setMode(mode === 'auto' ? 'manual' : 'auto'); return; }
    const k = KEYMAP[e.key];
    if (!k) return;
    if (panel.classList.contains('open')) return;
    if (mode === 'auto' && k !== 'brake') setMode('manual');
    if (mode === 'manual') { keys[k] = true; e.preventDefault(); }
  });
  window.addEventListener('keyup', function (e) { const k = KEYMAP[e.key]; if (k) keys[k] = false; });
  window.addEventListener('blur', function () { Object.keys(keys).forEach(function (k) { keys[k] = false; }); });
  document.querySelectorAll('#touch button').forEach(function (b) {
    const k = b.getAttribute('data-k');
    const on = function (e) { keys[k] = true; e.preventDefault(); };
    const off = function (e) { keys[k] = false; e.preventDefault(); };
    b.addEventListener('pointerdown', on);
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) { b.addEventListener(ev, off); });
    b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  });

  /* ---------- sound (synthesised, off by default) ---------- */
  const Snd = {
    ctx: null, on: false, eng: null, engGain: null, noiseGain: null,
    start: function () {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        if (!this.ctx) {
          const c = this.ctx = new AC();
          this.eng = c.createOscillator(); this.eng.type = 'sawtooth'; this.eng.frequency.value = 60;
          const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
          this.engGain = c.createGain(); this.engGain.gain.value = 0;
          this.eng.connect(lp); lp.connect(this.engGain); this.engGain.connect(c.destination); this.eng.start();
          const buf = c.createBuffer(1, c.sampleRate, c.sampleRate), d = buf.getChannelData(0);
          for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
          const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
          const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 2.5;
          this.noiseGain = c.createGain(); this.noiseGain.gain.value = 0;
          src.connect(bp); bp.connect(this.noiseGain); this.noiseGain.connect(c.destination); src.start();
        }
        this.ctx.resume(); this.on = true; return true;
      } catch (e) { return false; }
    },
    stop: function () {
      this.on = false;
      try { if (this.ctx) { this.engGain.gain.value = 0; this.noiseGain.gain.value = 0; this.ctx.suspend(); } } catch (e) { /* ignore */ }
    },
    update: function (speed, drift, throttle) {
      if (!this.on || !this.ctx) return;
      const t = this.ctx.currentTime, sp = clamp(speed / 900, 0, 1);
      this.eng.frequency.setTargetAtTime(55 + sp * 150 + (throttle ? 20 : 0), t, 0.08);
      this.engGain.gain.setTargetAtTime(0.05 + sp * 0.05, t, 0.1);
      this.noiseGain.gain.setTargetAtTime(drift > 0.3 && speed > 140 ? clamp(drift, 0, 1) * 0.09 : 0, t, 0.05);
    },
    blip: function (freq) {
      if (!this.on || !this.ctx) return;
      try {
        const c = this.ctx, o = c.createOscillator(), g = c.createGain(), t = c.currentTime;
        o.type = 'triangle'; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(freq * 2, t + 0.12);
        g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
        o.connect(g); g.connect(c.destination); o.start(); o.stop(t + 0.26);
      } catch (e) { /* ignore */ }
    }
  };
  if ($('btnSound')) {
    $('btnSound').addEventListener('click', function () {
      if (Snd.on) { Snd.stop(); this.textContent = 'Sound: off'; }
      else if (Snd.start()) this.textContent = 'Sound: on';
      this.blur();
    });
  }

  /* ---------- reveal ---------- */
  function wheelPos(k) {
    const lx = -CAR_L * 0.3, ly = (k ? 1 : -1) * CAR_W * 0.5;
    return { x: car.x + Math.cos(car.h) * lx - Math.sin(car.h) * ly, y: car.y + Math.sin(car.h) * lx + Math.cos(car.h) * ly };
  }
  function puff(x, y, power) {
    if (smoke.length > 420) smoke.shift();
    smoke.push({ x: x, y: y, vx: (Math.random() - 0.5) * 50, vy: (Math.random() - 0.5) * 50, r: 8 + Math.random() * 8, life: 0, max: 0.9 + Math.random() * 0.7, a: 0.55 * power });
  }
  function reveal(i) {
    if (revealed[i]) return;
    revealed[i] = true;
    slotEls[i].classList.add('show');
    rings.push({ x: slots[i].x, y: slots[i].y, t: 0, h: hue(i) });
    if (!REDUCED) shake = Math.max(shake, 14);
    for (let k = 0; k < 46 && sparks.length < 260; k++) {
      const a = Math.random() * Math.PI * 2, sp = 150 + Math.random() * 450;
      sparks.push({ x: slots[i].x, y: slots[i].y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: 0.8 + Math.random() * 0.6, r: 2.5 + Math.random() * 3, c: 'hsla(' + ((hue(i) + Math.random() * 50) % 360).toFixed(0) + ',95%,62%,' });
    }
    Snd.blip(520 + i * 40);
    for (let k = 0; k < 16; k++) puff(slots[i].x + (Math.random() - 0.5) * 120, slots[i].y + (Math.random() - 0.5) * 120, 1);
    const c = updateCount();
    if (c === projects.length) toast('All ' + c + ' projects unlocked');
    else toast('Unlocked: ' + projects[i].title);
  }
  function locate(i) {
    reveal(i);
    focus = { x: (cardPos[i].cx + slots[i].x) / 2, y: (cardPos[i].cy + slots[i].y) / 2, until: time + 3.2 };
  }

  /* ---------- update ---------- */
  function update(dt) {
    time += dt;
    if (mode === 'auto') stepAuto(dt); else stepManual(dt);

    // camera
    let tx = car.x + car.vx * 0.3, ty = car.y + car.vy * 0.3, k = 4;
    if (focus && time < focus.until) { tx = focus.x; ty = focus.y; k = 3; }
    cam.x += (tx - cam.x) * Math.min(1, dt * k);
    cam.y += (ty - cam.y) * Math.min(1, dt * k);
    const zt = baseZoom();
    cam.z += (zt - cam.z) * Math.min(1, dt * 3);
    if (Math.abs(zt - cam.z) < 0.002) cam.z = zt;

    // drift effects
    const drifting = car.drift > 0.3 && car.speed > 140;
    for (let w = 0; w < 2; w++) {
      if (drifting) {
        const p = wheelPos(w);
        puff(p.x, p.y, clamp(car.drift * 1.4, 0.4, 1));
        const ls = lastSkid[w];
        if (ls) skids.push({ x1: ls.x, y1: ls.y, x2: p.x, y2: p.y, t: time });
        lastSkid[w] = p;
      } else lastSkid[w] = null;
    }
    if (skids.length > 1800) skids.splice(0, skids.length - 1800);
    while (skids.length && time - skids[0].t > 14) skids.shift();

    for (let i = smoke.length - 1; i >= 0; i--) {
      const s = smoke[i];
      s.life += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.r += 38 * dt;
      if (s.life > s.max) smoke.splice(i, 1);
    }
    for (let i = rings.length - 1; i >= 0; i--) { rings[i].t += dt / 0.9; if (rings[i].t >= 1) rings.splice(i, 1); }

    // ---- extra effects: flames, sparks, shake, drift score, sound ----
    const rx = car.x - Math.cos(car.h) * (CAR_L / 2 + 4), ry = car.y - Math.sin(car.h) * (CAR_L / 2 + 4);
    if (car.accel && car.speed > 60 && flames.length < 140) {
      for (let q = 0; q < 2; q++) {
        const sp = 140 + Math.random() * 120, a = car.h + Math.PI + (Math.random() - 0.5) * 0.35;
        flames.push({ x: rx, y: ry, vx: Math.cos(a) * sp + car.vx * 0.6, vy: Math.sin(a) * sp + car.vy * 0.6, life: 0, max: 0.18 + Math.random() * 0.14, r: 5 + Math.random() * 4 });
      }
    }
    if (drifting) {
      for (let w = 0; w < 2 && sparks.length < 260; w++) {
        const p = wheelPos(w), a = car.h + Math.PI + (Math.random() - 0.5) * 1.6, sp = 120 + Math.random() * 260;
        sparks.push({ x: p.x, y: p.y, vx: Math.cos(a) * sp + car.vx * 0.3, vy: Math.sin(a) * sp + car.vy * 0.3, life: 0, max: 0.3 + Math.random() * 0.35, r: 1.5 + Math.random() * 1.8, c: Math.random() < 0.5 ? 'rgba(255,170,60,' : 'rgba(255,230,140,' });
      }
      if (car.speed > 300 && !REDUCED) shake = Math.max(shake, Math.min(4, car.drift * 5));
    }
    for (let i = flames.length - 1; i >= 0; i--) {
      const f = flames[i];
      f.life += dt; f.x += f.vx * dt; f.y += f.vy * dt;
      if (f.life > f.max) flames.splice(i, 1);
    }
    const drag = Math.exp(-2 * dt);
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.life += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= drag; s.vy *= drag;
      if (s.life > s.max) sparks.splice(i, 1);
    }
    shake *= Math.exp(-9 * dt);
    if (shake < 0.05) shake = 0;
    shX = (Math.random() - 0.5) * shake * 2; shY = (Math.random() - 0.5) * shake * 2;

    if (mode === 'manual') {
      if (drifting) { driftPts += dt * car.speed * car.drift * 0.25; driftIdle = 0; }
      else {
        driftIdle += dt;
        if (driftPts > 0 && driftIdle > 0.8) { if (driftPts > 60) { score += Math.round(driftPts); Snd.blip(660); } driftPts = 0; }
      }
      const dTxt = driftPts > 20 ? 'DRIFT +' + Math.round(driftPts) : '';
      if (dTxt !== lastD && $('drift')) { $('drift').textContent = dTxt; lastD = dTxt; }
      if (score !== lastS && $('total')) { $('total').textContent = 'SCORE ' + score; lastS = score; }
    }
    Snd.update(car.speed, car.drift, car.accel);

    // unlock projects
    for (let i = 0; i < projects.length; i++) {
      if (revealed[i]) continue;
      if (mode === 'auto') {
        let di = Math.abs((((slots[i].idx - auto.s / step) % n) + n) % n);
        di = Math.min(di, n - di) * step;
        if (di < 110 && (car.drift > 0.2 || di < 40)) reveal(i);
      } else if (Math.hypot(car.x - cardPos[i].cx, car.y - cardPos[i].cy) < 520 || Math.hypot(car.x - slots[i].x, car.y - slots[i].y) < 300) {
        reveal(i);
      }
    }

    world.style.transform = 'translate(' + (W / 2 - (cam.x + shX) * cam.z) + 'px,' + (H / 2 - (cam.y + shY) * cam.z) + 'px) scale(' + cam.z + ')';
  }

  /* ---------- render ---------- */
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawCar() {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.h);

    // underglow
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const ug = ctx.createRadialGradient(0, 0, 4, 0, 0, 78);
    ug.addColorStop(0, 'rgba(255,110,40,.28)'); ug.addColorStop(1, 'rgba(255,110,40,0)');
    ctx.fillStyle = ug; ctx.beginPath(); ctx.arc(0, 0, 78, 0, 7); ctx.fill();
    ctx.restore();

    // headlight cone
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const lg = ctx.createLinearGradient(CAR_L / 2, 0, CAR_L / 2 + 420, 0);
    lg.addColorStop(0, 'rgba(255,240,190,.26)');
    lg.addColorStop(1, 'rgba(255,240,190,0)');
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.moveTo(CAR_L / 2 - 4, -11); ctx.lineTo(CAR_L / 2 + 420, -130); ctx.lineTo(CAR_L / 2 + 420, 130); ctx.lineTo(CAR_L / 2 - 4, 11);
    ctx.closePath(); ctx.fill();
    ctx.restore();

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,.4)';
    rr(-CAR_L / 2 + 5, -CAR_W / 2 + 7, CAR_L, CAR_W, 11); ctx.fill();

    // wheels
    const wl = [[CAR_L * 0.28, -CAR_W * 0.5, true], [CAR_L * 0.28, CAR_W * 0.5, true], [-CAR_L * 0.3, -CAR_W * 0.5, false], [-CAR_L * 0.3, CAR_W * 0.5, false]];
    ctx.fillStyle = '#08080b';
    wl.forEach(function (w) {
      ctx.save(); ctx.translate(w[0], w[1]); if (w[2]) ctx.rotate(car.front);
      rr(-10, -5, 20, 10, 3); ctx.fill(); ctx.restore();
    });

    // body
    const g = ctx.createLinearGradient(0, -CAR_W / 2, 0, CAR_W / 2);
    g.addColorStop(0, '#ff9440'); g.addColorStop(0.5, '#ff5a1f'); g.addColorStop(1, '#c92d08');
    ctx.fillStyle = g;
    rr(-CAR_L / 2, -CAR_W / 2 + 3, CAR_L, CAR_W - 6, 13); ctx.fill();
    // stripes
    ctx.fillStyle = 'rgba(255,255,255,.88)';
    ctx.fillRect(-CAR_L / 2 + 6, -5, CAR_L - 16, 3.5);
    ctx.fillRect(-CAR_L / 2 + 6, 1.5, CAR_L - 16, 3.5);
    // cabin
    ctx.fillStyle = '#161923';
    rr(-14, -CAR_W / 2 + 7, 30, CAR_W - 14, 8); ctx.fill();
    ctx.fillStyle = 'rgba(150,205,255,.8)';
    rr(9, -CAR_W / 2 + 9, 10, CAR_W - 18, 4); ctx.fill();
    ctx.fillStyle = 'rgba(150,205,255,.35)';
    rr(-12, -CAR_W / 2 + 9, 6, CAR_W - 18, 3); ctx.fill();
    // spoiler
    ctx.fillStyle = '#12141b';
    rr(-CAR_L / 2 - 5, -CAR_W / 2 + 1, 9, CAR_W - 2, 2.5); ctx.fill();
    // lights
    ctx.fillStyle = '#fff6c4';
    rr(CAR_L / 2 - 7, -CAR_W / 2 + 6, 6, 8, 2); ctx.fill();
    rr(CAR_L / 2 - 7, CAR_W / 2 - 14, 6, 8, 2); ctx.fill();
    ctx.fillStyle = car.braking ? '#ff2a2a' : '#8a1212';
    rr(-CAR_L / 2 + 2, -CAR_W / 2 + 6, 4, 8, 1.5); ctx.fill();
    rr(-CAR_L / 2 + 2, CAR_W / 2 - 14, 4, 8, 1.5); ctx.fill();
    if (car.braking) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255,40,40,.25)';
      ctx.beginPath(); ctx.arc(-CAR_L / 2 - 4, 0, 26, 0, 7); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  function render() {
    const z = cam.z;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = '#0e1713';
    ctx.fillRect(0, 0, W, H);
    const camX = cam.x + shX, camY = cam.y + shY;
    ctx.setTransform(DPR * z, 0, 0, DPR * z, DPR * (W / 2 - camX * z), DPR * (H / 2 - camY * z));
    const hw = W / 2 / z, hh = H / 2 / z;
    const x0 = camX - hw, x1 = camX + hw, y0 = camY - hh, y1 = camY + hh;

    // grid
    ctx.strokeStyle = 'rgba(255,255,255,.04)';
    ctx.lineWidth = 1.5 / z;
    ctx.beginPath();
    for (let gx = Math.floor(x0 / 160) * 160; gx < x1; gx += 160) { ctx.moveTo(gx, y0); ctx.lineTo(gx, y1); }
    for (let gy = Math.floor(y0 / 160) * 160; gy < y1; gy += 160) { ctx.moveTo(x0, gy); ctx.lineTo(x1, gy); }
    ctx.stroke();

    // trees
    for (let i = 0; i < trees.length; i++) {
      const t = trees[i];
      if (t.x < x0 - 80 || t.x > x1 + 80 || t.y < y0 - 80 || t.y > y1 + 80) continue;
      ctx.fillStyle = 'rgba(0,0,0,.3)';
      ctx.beginPath(); ctx.arc(t.x + 8, t.y + 10, t.r, 0, 7); ctx.fill();
      ctx.fillStyle = t.t > 0.5 ? '#173d30' : '#1d4a2a';
      ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, 7); ctx.fill();
      ctx.fillStyle = t.t > 0.5 ? '#215a45' : '#2a6a3a';
      ctx.beginPath(); ctx.arc(t.x - t.r * 0.25, t.y - t.r * 0.25, t.r * 0.6, 0, 7); ctx.fill();
    }

    // road
    ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
    const vis = [];
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      if (c.x1 >= x0 && c.x0 <= x1 && c.y1 >= y0 && c.y0 <= y1) vis.push(c);
    }
    ctx.setLineDash([]); ctx.lineDashOffset = 0;
    ctx.strokeStyle = '#cf3b2c'; ctx.lineWidth = ROAD + 26;
    for (let i = 0; i < vis.length; i++) ctx.stroke(vis[i].p);
    ctx.strokeStyle = '#f2f2f2'; ctx.setLineDash([34, 34]);
    for (let i = 0; i < vis.length; i++) { ctx.lineDashOffset = -vis[i].off; ctx.stroke(vis[i].p); }
    ctx.setLineDash([]); ctx.lineDashOffset = 0;
    ctx.strokeStyle = '#262a33'; ctx.lineWidth = ROAD;
    for (let i = 0; i < vis.length; i++) ctx.stroke(vis[i].p);
    ctx.strokeStyle = 'rgba(232,197,71,.85)'; ctx.lineWidth = 5; ctx.setLineDash([36, 34]);
    for (let i = 0; i < vis.length; i++) { ctx.lineDashOffset = -vis[i].off; ctx.stroke(vis[i].p); }
    ctx.setLineDash([]); ctx.lineDashOffset = 0;

    // start line
    ctx.save();
    ctx.translate(TX[0], TY[0]); ctx.rotate(TA[0]);
    const sq = ROAD / 9;
    for (let r = 0; r < 2; r++) for (let c = 0; c < 9; c++) {
      ctx.fillStyle = (r + c) % 2 ? '#fff' : '#111';
      ctx.fillRect(r * sq - sq, -ROAD / 2 + c * sq, sq, sq);
    }
    ctx.restore();

    // skid marks
    ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(4,4,8,.55)'; ctx.beginPath();
    for (let i = 0; i < skids.length; i++) { const s = skids[i]; if (time - s.t < 8) { ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); } }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(4,4,8,.22)'; ctx.beginPath();
    for (let i = 0; i < skids.length; i++) { const s = skids[i]; if (time - s.t >= 8) { ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); } }
    ctx.stroke();
    ctx.lineCap = 'butt';

    // markers + connectors
    for (let i = 0; i < projects.length; i++) {
      const s = slots[i], c = cardPos[i], col = 'hsl(' + hue(i) + ',92%,58%)';
      if (c.cx < x0 - 400 || c.cx > x1 + 400 || c.cy < y0 - 400 || c.cy > y1 + 400) continue;
      if (revealed[i]) {
        ctx.strokeStyle = col; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(s.x + s.dx * (ROAD / 2 + 8), s.y + s.dy * (ROAD / 2 + 8)); ctx.lineTo(s.x + s.dx * (ROAD / 2 + 76), s.y + s.dy * (ROAD / 2 + 76)); ctx.stroke();
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(s.x + s.dx * (ROAD / 2 + 8), s.y + s.dy * (ROAD / 2 + 8), 9, 0, 7); ctx.fill();
      } else {
        const pr = 38 + Math.sin(time * 3 + i) * 5;
        ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.beginPath(); ctx.arc(c.cx, c.cy, pr, 0, 7); ctx.fill();
        ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.setLineDash([10, 8]); ctx.beginPath(); ctx.arc(c.cx, c.cy, pr, 0, 7); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = col; ctx.font = '700 40px "Space Grotesk", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('?', c.cx, c.cy + 2);
      }
    }

    // smoke
    for (let i = 0; i < smoke.length; i++) {
      const s = smoke[i], a = s.a * (1 - s.life / s.max);
      ctx.fillStyle = 'rgba(232,234,244,' + (a * 0.55).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 7); ctx.fill();
    }

    // nitro flames (behind the car, additive)
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < flames.length; i++) {
      const f = flames[i], a = 1 - f.life / f.max;
      ctx.fillStyle = 'rgba(255,' + (120 + Math.round(a * 100)) + ',40,' + (a * 0.8).toFixed(2) + ')';
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.4 + a * 0.8), 0, 7); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    drawCar();

    // unlock rings
    for (let i = 0; i < rings.length; i++) {
      const r = rings[i];
      ctx.strokeStyle = 'hsla(' + r.h + ',95%,62%,' + (1 - r.t).toFixed(3) + ')';
      ctx.lineWidth = 10 * (1 - r.t) + 1;
      ctx.beginPath(); ctx.arc(r.x, r.y, 40 + r.t * 520, 0, 7); ctx.stroke();
    }

    // sparks + confetti (additive, on top)
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < sparks.length; i++) {
      const s = sparks[i], a = 1 - s.life / s.max;
      ctx.fillStyle = s.c + a.toFixed(2) + ')';
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r * (0.5 + a), 0, 7); ctx.fill();
    }

    // screen-space overlays: floating dust + speed lines
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    for (let i = 0; i < dust.length; i++) {
      const d = dust[i];
      const sx = (((d.x - camX * d.p) % W) + W) % W, sy = (((d.y - camY * d.p - time * 10 * d.p) % H) + H) % H;
      ctx.fillStyle = 'rgba(' + d.c + ',' + (0.12 + 0.12 * Math.sin(time * 2 + d.t)).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(sx, sy, d.r, 0, 7); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    if (car.speed > 560 && !REDUCED) {
      const k = clamp((car.speed - 560) / 340, 0, 1), ang = Math.atan2(car.vy, car.vx);
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.1 * k).toFixed(3) + ')';
      ctx.lineWidth = 1.5; ctx.beginPath();
      for (let i = 0; i < 14; i++) {
        const x = Math.random() * W, y = Math.random() * H, len = 50 + Math.random() * 110;
        ctx.moveTo(x, y); ctx.lineTo(x - Math.cos(ang) * len, y - Math.sin(ang) * len);
      }
      ctx.stroke();
    }
  }

  /* ---------- go ---------- */
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    try {
      update(dt);
      render();
    } catch (err) {
      console.error('frame error', err);
      [car, cam, auto, man].forEach(function (o) { for (const k in o) if (typeof o[k] === 'number' && !isFinite(o[k])) o[k] = 0; });
    }
  }
  document.addEventListener('visibilitychange', function () { last = performance.now(); });
  try { update(0.016); } catch (err) { console.error(err); }
  requestAnimationFrame(frame);
})();
