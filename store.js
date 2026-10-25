/* Shared data layer. Projects live in localStorage (admin's browser) and fall back to projects.json. */
(function (root) {
  'use strict';
  const KEY = 'drift_portfolio_v1';

  const DEFAULTS = {
    profile: {
      name: 'Your Name',
      tagline: 'Developer. I build fast things and drift into corners.',
      github: '', linkedin: '', email: ''
    },
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
        link: String(p.link || ''),
        repo: String(p.repo || ''),
        image: String(p.image || '')
      };
    });
    return { profile: prof, projects: projects };
  }

  async function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d && Array.isArray(d.projects)) return normalize(d);
      }
    } catch (e) { /* ignore */ }
    try {
      const r = await fetch('projects.json', { cache: 'no-store' });
      if (r.ok) {
        const d = await r.json();
        if (d && Array.isArray(d.projects)) return normalize(d);
      }
    } catch (e) { /* file:// or missing */ }
    return normalize(clone(DEFAULTS));
  }

  function save(d) {
    try { localStorage.setItem(KEY, JSON.stringify(normalize(d))); return true; }
    catch (e) { return false; }
  }

  function reset() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } return normalize(clone(DEFAULTS)); }

  async function hash(str) {
    const s = 'drift-salt:' + str;
    if (root.crypto && root.crypto.subtle) {
      const buf = await root.crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
      return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    }
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return 'x' + (h >>> 0).toString(16);
  }

  root.Store = { load: load, save: save, reset: reset, normalize: normalize, hash: hash, defaults: function () { return normalize(clone(DEFAULTS)); } };
})(window);
