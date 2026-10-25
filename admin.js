/* Admin portal: add / edit / reorder / delete projects, stored via Store (localStorage). */
(async function () {
  'use strict';
  const $ = function (id) { return document.getElementById(id); };
  const esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); };
  const HK = 'drift_portfolio_admin_hash';
  const SK = 'drift_portfolio_admin_session';

  let data = await Store.load();
  let editing = null;   // project id being edited
  let image = '';       // current image (URL or data URL)

  let toastTimer = 0;
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }
  function persist(msg) {
    if (!Store.save(data)) { toast('Storage full: use image URLs instead of uploads'); return false; }
    if (msg) toast(msg);
    return true;
  }

  /* ---------- auth (client-side only) ---------- */
  const hasPw = !!localStorage.getItem(HK);
  function showLogin() {
    $('login').classList.remove('hidden'); $('app').classList.add('hidden');
    $('loginTitle').textContent = hasPw ? 'Admin login' : 'Create admin password';
    $('loginHelp').textContent = hasPw ? 'Enter your password to manage projects.' : 'First visit: choose a password (6+ characters) for this browser.';
    $('pw2wrap').classList.toggle('hidden', hasPw);
    $('pw2').required = !hasPw;
  }
  function showApp() { $('login').classList.add('hidden'); $('app').classList.remove('hidden'); renderAll(); }

  $('loginForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    const pw = $('pw').value; $('loginErr').textContent = '';
    if (!hasPw) {
      if (pw.length < 6) { $('loginErr').textContent = 'Use at least 6 characters.'; return; }
      if (pw !== $('pw2').value) { $('loginErr').textContent = 'Passwords do not match.'; return; }
      localStorage.setItem(HK, await Store.hash(pw));
    } else if ((await Store.hash(pw)) !== localStorage.getItem(HK)) {
      $('loginErr').textContent = 'Wrong password.'; return;
    }
    sessionStorage.setItem(SK, '1');
    location.reload();
  });
  $('btnLogout').addEventListener('click', function () { sessionStorage.removeItem(SK); location.reload(); });

  /* ---------- rendering ---------- */
  function renderAll() { renderList(); renderProfile(); }

  function renderList() {
    $('pcount').textContent = '(' + data.projects.length + ')';
    const ul = $('list');
    if (!data.projects.length) { ul.innerHTML = '<li class="muted small">No projects yet. Add your first one on the left.</li>'; return; }
    ul.innerHTML = data.projects.map(function (p, i) {
      const th = /^(data:image\/|https?:\/\/|\/|\.)/i.test(p.image) ? '<img src="' + esc(p.image) + '" alt="">' : String(i + 1);
      return '<li class="item" style="--h:' + ((18 + i * 53) % 360) + '"><div class="th">' + th + '</div><div><h3>' + esc(p.title) + '</h3><p>' + esc(p.description) + '</p></div><div class="ctl">' +
        '<button data-a="up" data-i="' + i + '" title="Move up"' + (i === 0 ? ' disabled' : '') + '>&uarr;</button>' +
        '<button data-a="down" data-i="' + i + '" title="Move down"' + (i === data.projects.length - 1 ? ' disabled' : '') + '>&darr;</button>' +
        '<button data-a="edit" data-i="' + i + '" title="Edit">&#9998;</button>' +
        '<button data-a="del" data-i="' + i + '" title="Delete">&times;</button></div></li>';
    }).join('');
  }
  function renderProfile() {
    const p = data.profile;
    $('pName').value = p.name; $('pTag').value = p.tagline; $('pGh').value = p.github; $('pLi').value = p.linkedin; $('pEm').value = p.email;
  }
  function renderPreview() {
    const box = $('imgPrev');
    if (image) { box.innerHTML = '<img src="' + esc(image) + '" alt="Preview">'; box.classList.remove('hidden'); }
    else { box.innerHTML = ''; box.classList.add('hidden'); }
  }

  /* ---------- list actions ---------- */
  $('list').addEventListener('click', function (e) {
    const b = e.target.closest('button[data-a]'); if (!b) return;
    const i = +b.dataset.i, a = b.dataset.a, arr = data.projects;
    if (a === 'up' && i > 0) { const t = arr[i - 1]; arr[i - 1] = arr[i]; arr[i] = t; persist('Order saved'); renderList(); }
    else if (a === 'down' && i < arr.length - 1) { const t = arr[i + 1]; arr[i + 1] = arr[i]; arr[i] = t; persist('Order saved'); renderList(); }
    else if (a === 'del') { if (confirm('Delete "' + arr[i].title + '"?')) { arr.splice(i, 1); if (editing) resetForm(); persist('Deleted'); renderList(); } }
    else if (a === 'edit') startEdit(arr[i]);
  });

  /* ---------- form ---------- */
  function resetForm() {
    editing = null; image = '';
    $('pForm').reset();
    $('formTitle').textContent = 'Add project'; $('btnSave').textContent = 'Add project'; $('btnCancel').classList.add('hidden');
    renderPreview();
  }
  function startEdit(p) {
    editing = p.id; image = p.image || '';
    $('fTitle').value = p.title; $('fDesc').value = p.description; $('fTags').value = p.tags.join(', ');
    $('fLink').value = p.link; $('fRepo').value = p.repo;
    $('fImg').value = /^data:/i.test(image) ? '' : image;
    $('fImg').placeholder = /^data:/i.test(image) ? '(uploaded image)' : 'https://… (or upload below)';
    $('formTitle').textContent = 'Edit project'; $('btnSave').textContent = 'Save changes'; $('btnCancel').classList.remove('hidden');
    renderPreview(); $('fTitle').focus(); window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  $('btnCancel').addEventListener('click', resetForm);
  $('fImg').addEventListener('input', function () { image = this.value.trim(); renderPreview(); });
  $('btnClearImg').addEventListener('click', function () { image = ''; $('fImg').value = ''; $('fImg').placeholder = 'https://… (or upload below)'; renderPreview(); });

  $('fFile').addEventListener('change', function () {
    const f = this.files && this.files[0]; this.value = '';
    if (!f) return;
    const reader = new FileReader();
    reader.onload = function () {
      const img = new Image();
      img.onload = function () {
        const max = 720, s = Math.min(1, max / img.width);
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        image = c.toDataURL('image/jpeg', 0.82);
        $('fImg').value = ''; $('fImg').placeholder = '(uploaded image)';
        renderPreview();
      };
      img.onerror = function () { toast('Could not read that image'); };
      img.src = reader.result;
    };
    reader.readAsDataURL(f);
  });

  $('pForm').addEventListener('submit', function (e) {
    e.preventDefault();
    const p = {
      id: editing || ('p' + Date.now().toString(36)),
      title: $('fTitle').value.trim(),
      description: $('fDesc').value.trim(),
      tags: $('fTags').value.split(',').map(function (t) { return t.trim(); }).filter(Boolean),
      link: $('fLink').value.trim(),
      repo: $('fRepo').value.trim(),
      image: image
    };
    if (!p.title) return;
    const backup = JSON.stringify(data.projects);
    if (editing) {
      const i = data.projects.findIndex(function (x) { return x.id === editing; });
      if (i >= 0) data.projects[i] = p; else data.projects.push(p);
    } else data.projects.push(p);
    if (!persist(editing ? 'Project updated' : 'Project added')) { data.projects = JSON.parse(backup); return; }
    resetForm(); renderList();
  });

  /* ---------- profile / password / data ---------- */
  $('profForm').addEventListener('submit', function (e) {
    e.preventDefault();
    data.profile = { name: $('pName').value.trim() || 'Your Name', tagline: $('pTag').value.trim(), github: $('pGh').value.trim(), linkedin: $('pLi').value.trim(), email: $('pEm').value.trim() };
    persist('Profile saved');
  });
  $('pwForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    const v = $('newPw').value;
    if (v.length < 6) { toast('Use at least 6 characters'); return; }
    localStorage.setItem(HK, await Store.hash(v)); $('newPw').value = ''; toast('Password changed');
  });
  $('btnExport').addEventListener('click', function () {
    const blob = new Blob([JSON.stringify(Store.normalize(data), null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'projects.json';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    toast('Exported projects.json');
  });
  $('importFile').addEventListener('change', function () {
    const f = this.files && this.files[0]; this.value = '';
    if (!f) return;
    const r = new FileReader();
    r.onload = function () {
      try {
        const d = JSON.parse(r.result);
        if (!d || !Array.isArray(d.projects)) throw new Error('bad');
        if (!confirm('Replace current data with the imported file?')) return;
        data = Store.normalize(d); persist('Imported'); resetForm(); renderAll();
      } catch (err) { toast('Invalid JSON file'); }
    };
    r.readAsText(f);
  });
  $('btnReset').addEventListener('click', function () {
    if (!confirm('Replace everything with the sample projects?')) return;
    data = Store.reset(); resetForm(); renderAll(); toast('Reset to samples');
  });

  /* ---------- start ---------- */
  if (hasPw && sessionStorage.getItem(SK) === '1') showApp(); else showLogin();
})();
