'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const UPLOADS = path.join(DATA_DIR, 'uploads');
const DATA_FILE = path.join(DATA_DIR, 'data.json');
const PW_FILE = path.join(DATA_DIR, 'admin-password.txt');
const PORT = +process.env.PORT || 3000;

fs.mkdirSync(UPLOADS, { recursive: true });
if (!fs.existsSync(DATA_FILE)) {
  const seedFile = path.join(ROOT, 'projects.json');
  if (fs.existsSync(seedFile)) {
    fs.copyFileSync(seedFile, DATA_FILE);
  } else {
    fs.writeFileSync(DATA_FILE, JSON.stringify({
      profile: { name: 'Harshit Yadav', tagline: 'Developer. I build fast things and drift into corners.', github: '', linkedin: '', email: '' },
      projects: []
    }, null, 2));
  }
}

let ADMIN_PW = process.env.ADMIN_PASSWORD;
if (!ADMIN_PW) {
  if (fs.existsSync(PW_FILE)) ADMIN_PW = fs.readFileSync(PW_FILE, 'utf8').trim();
  else {
    ADMIN_PW = crypto.randomBytes(9).toString('base64url');
    fs.writeFileSync(PW_FILE, ADMIN_PW, { mode: 0o600 });
    console.log('\n  Admin password generated: ' + ADMIN_PW + '\n  (saved in ' + PW_FILE + '. Set ADMIN_PASSWORD env var to choose your own)\n');
  }
}
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
const pwOk = (p) => crypto.timingSafeEqual(sha(p), sha(ADMIN_PW));

const tokens = new Map();
const attempts = new Map();
const TOKEN_TTL = 12 * 3600 * 1000;

const STATIC = {
  '/': 'index.html', '/index.html': 'index.html', '/admin': 'admin.html', '/admin.html': 'admin.html',
  '/style.css': 'style.css', '/admin.css': 'admin.css', '/track.js': 'track.js', '/store.js': 'store.js',
  '/game.js': 'game.js', '/admin.js': 'admin.js', '/projects.json': 'projects.json'
};
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};

function send(res, code, body, headers, isHead) {
  res.writeHead(code, Object.assign({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' }, headers || {}));
  res.end(isHead ? undefined : body);
}
function json(res, code, obj) { send(res, code, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); }

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
function authed(req) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  if (!m) return false;
  const exp = tokens.get(m[1]);
  if (!exp) return false;
  if (exp < Date.now()) { tokens.delete(m[1]); return false; }
  return true;
}
function clientIp(req) { return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim(); }

const str = (v, max) => String(v == null ? '' : v).slice(0, max);
const cleanUrl = (u) => { u = str(u, 500).trim(); return !u || /^(https?:|mailto:|\/|\.|#)/i.test(u) ? u : 'https://' + u; };
const cleanImg = (u) => {
  u = String(u == null ? '' : u).trim();
  if (/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(u) && u.length < 2 * 1024 * 1024) return u;
  u = u.slice(0, 500);
  return /^(\/?uploads\/[\w.-]+|https?:\/\/.+|\.?\/[\w./-]+)$/i.test(u) ? u : '';
};
function sanitize(d) {
  if (!d || !Array.isArray(d.projects) || d.projects.length > 60) throw new Error('bad data');
  const p = d.profile || {};
  return {
    profile: { name: str(p.name, 80) || 'Your Name', tagline: str(p.tagline, 200), github: cleanUrl(p.github), linkedin: cleanUrl(p.linkedin), email: str(p.email, 120) },
    projects: d.projects.filter((x) => x && x.title).map((x, i) => ({
      id: str(x.id, 40) || ('p' + i + Date.now().toString(36)),
      title: str(x.title, 80), description: str(x.description, 400),
      tags: (Array.isArray(x.tags) ? x.tags : []).map((t) => str(t, 30).trim()).filter(Boolean).slice(0, 8),
      link: cleanUrl(x.link), repo: cleanUrl(x.repo), image: cleanImg(x.image)
    }))
  };
}
function writeAtomic(file, text) { const tmp = file + '.tmp'; fs.writeFileSync(tmp, text); fs.renameSync(tmp, file); }
function cleanupUploads(data) {
  const used = new Set(data.projects.map((p) => path.basename(p.image || '')));
  for (const f of fs.readdirSync(UPLOADS)) {
    const fp = path.join(UPLOADS, f);
    try { if (!used.has(f) && Date.now() - fs.statSync(fp).mtimeMs > 10 * 60 * 1000) fs.unlinkSync(fp); } catch (e) { /* ignore */ }
  }
}

async function api(req, res, url) {
  if (url === '/api/data' && req.method === 'GET') {
    return send(res, 200, fs.readFileSync(DATA_FILE), { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
  }
  if (url === '/api/login' && req.method === 'POST') {
    const ip = clientIp(req), now = Date.now();
    const a = attempts.get(ip) || { n: 0, reset: now + 15 * 60 * 1000 };
    if (a.reset < now) { a.n = 0; a.reset = now + 15 * 60 * 1000; }
    if (a.n >= 10) return json(res, 429, { error: 'Too many attempts. Try again in 15 minutes.' });
    let body; try { body = JSON.parse(await readBody(req, 4096)); } catch (e) { return json(res, 400, { error: 'bad request' }); }
    if (!pwOk(body && body.password || '')) { a.n++; attempts.set(ip, a); return json(res, 401, { error: 'Wrong password' }); }
    attempts.delete(ip);
    const token = crypto.randomBytes(24).toString('hex');
    tokens.set(token, now + TOKEN_TTL);
    return json(res, 200, { token });
  }
  if (!authed(req)) return json(res, 401, { error: 'Not logged in' });
  if (url === '/api/me' && req.method === 'GET') return json(res, 200, { ok: true });
  if (url === '/api/data' && req.method === 'PUT') {
    let d; try { d = sanitize(JSON.parse(await readBody(req, 4 * 1024 * 1024))); } catch (e) { return json(res, 400, { error: 'Invalid data' }); }
    writeAtomic(DATA_FILE, JSON.stringify(d, null, 2));
    cleanupUploads(d);
    return json(res, 200, d);
  }
  if (url === '/api/upload' && req.method === 'POST') {
    let body; try { body = JSON.parse(await readBody(req, 5 * 1024 * 1024)); } catch (e) { return json(res, 400, { error: 'Image too large' }); }
    const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(body && body.dataUrl || '');
    if (!m) return json(res, 400, { error: 'Unsupported image' });
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 3 * 1024 * 1024) return json(res, 400, { error: 'Image too large' });
    const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
    const name = crypto.randomBytes(12).toString('hex') + '.' + ext;
    fs.writeFileSync(path.join(UPLOADS, name), buf);
    return json(res, 200, { url: '/uploads/' + name });
  }
  return json(res, 404, { error: 'not found' });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    if (url.startsWith('/api/')) return await api(req, res, url);
    const isHead = req.method === 'HEAD';
    if (req.method !== 'GET' && !isHead) return send(res, 405, 'Method not allowed');
    if (url.startsWith('/uploads/')) {
      const name = path.basename(url);
      const fp = path.join(UPLOADS, name);
      if (!/^[\w.-]+$/.test(name) || !fs.existsSync(fp)) return send(res, 404, 'Not found', null, isHead);
      return send(res, 200, fs.readFileSync(fp), { 'Content-Type': MIME[path.extname(name)] || 'application/octet-stream', 'Cache-Control': 'public, max-age=31536000, immutable' }, isHead);
    }
    const file = STATIC[url];
    const fullPath = file ? path.join(ROOT, file) : '';
    if (!file || !fs.existsSync(fullPath)) return send(res, 404, 'Not found', null, isHead);
    send(res, 200, fs.readFileSync(fullPath), { 'Content-Type': MIME[path.extname(file)], 'Cache-Control': 'no-cache' }, isHead);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, 500, 'Server error');
  }
});
server.listen(PORT, () => console.log('Portfolio running on http://localhost:' + PORT + '  (admin: /admin)'));
