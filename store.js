/* Shared data layr. Data lives on the server (/api/data) so every visitor sees what the admin saved. */
(function (root) {
  'use strict';
  const TOKEN_KEY = 'drift_admin_token';

  const DEFAULTS = {
    profile: { name: 'Your Name', tagline: 'Developer. I build fast things and drift into corners.', github: '', linkedin: '', email: '' },
    projects: [
      { id: 'p1', title: 'Neon Notes', description: 'Sample project: a realtime collaborative notes app with offline sync. Replace me from the admin portal.', tags: ['React', 'Node', 'WebSockets'], link: '#', repo: '', image: '' },
      { id: 'p2', title: 'Pit Stop Dashboard', description: 'Sample project: analytics dashboard that turns raw logs into live charts.', tags: ['TypeScript', 'D3'], link: '#', repo: '', image: '' },
      { id: 'p3', title: 'Apex Weather', description: 'Sample project: a minimalist weather PWA with radar and hourly forecast.', tags: ['PWA', 'API'], link: '#', repo: '', image: '' },
      { id: 'p4', title: 'Gearbox UI', description: 'Sample project: an accessible, themeable component library.', tags: ['CSS', 'Storybook'], link: '#', repo: '', image: '' },
      { id: 'p5', title: 'Lap Timer', description: 'Sample project: mobile-first stopwatch for track days with GPS splits.', tags: ['JavaScript', 'GPS'], link: '#', repo: '', image: '' },
      { id: 'p6', title: 'Drift API', description: 'Sample project: a rate-limited REST API with auth and docs.', tags: ['Node', 'PostgreSQL'], link: '#', repo: '', image: '' }
    ]
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function normalize(d) {
    const prof = Object.assign({}, DEFAULTS.profile, (d && d.profile) || {});
    const arr = Array.isArray(d && d.projects) ? d.projects : [];
    const projects = arr.filter(function (p) { return p && p.title; }).map(function (p, i) {
      return {
        id: String(p.id || ('p' + i + Date.now().toString(36))),
        title: String(p.title).slice(0, 80),
        description: String(p.description || '').slice(0, 400),
        tags: (Array.isArray(p.tags) ? p.tags : String(p.tags || '').split(',')).map(function (t) { return String(t).trim(); }).filter(Boolean).slice(0, 8),
        link: String(p.link || ''), repo: String(p.repo || ''), image: String(p.image || '')
      };
    });
    return { profile: prof, projects: projects };
  }

  const Store = { online: false, normalize: normalize, defaults: function () { return normalize(clone(DEFAULTS)); } };

  Store.load = async function () {
    try {
      const r = await fetch('/api/data', { cache: 'no-store' });
      if (r.ok) { Store.online = true; return normalize(await r.json()); }
    } catch (e) { /* no server */ }
    try {
      const r = await fetch('projects.json', { cache: 'no-store' });
      if (r.ok) { const d = await r.json(); if (d && Array.isArray(d.projects)) return normalize(d); }
    } catch (e) { /* ignore */ }
    return Store.defaults();
  };

  Store.token = function () { try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; } };
  Store.logout = function () { try { sessionStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ } };

  async function call(method, url, body) {
    const headers = { 'Content-Type': 'application/json' };
    const t = Store.token();
    if (t) headers.Authorization = 'Bearer ' + t;
    const r = await fetch(url, { method: method, headers: headers, body: body ? JSON.stringify(body) : undefined });
    let j = {};
    try { j = await r.json(); } catch (e) { /* ignore */ }
    return { ok: r.ok, status: r.status, data: j };
  }

  Store.login = async function (password) {
    const r = await call('POST', '/api/login', { password: password });
    if (r.ok && r.data.token) { sessionStorage.setItem(TOKEN_KEY, r.data.token); return { ok: true }; }
    return { ok: false, error: r.data.error || 'Login failed' };
  };
  Store.check = async function () { if (!Store.token()) return false; try { return (await call('GET', '/api/me')).ok; } catch (e) { return false; } };
  Store.save = function (d) { return call('PUT', '/api/data', normalize(d)); };
  Store.upload = function (dataUrl) { return call('POST', '/api/upload', { dataUrl: dataUrl }); };

  root.Store = Store;
})(window);
