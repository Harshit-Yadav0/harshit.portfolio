/* Admin portal: add / edit / reorder / delete projects. Saves to the server so everyone sees the changes. */
(async function () {
  'use strict';
  const $ = function (id) { return document.getElementById(id); };
  const esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); };

  let data = await Store.load();
  let editing = null;   // project id being edited
  let image = '';       // current image URL

  let toastTimer = 0;
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2400);
  }

  /* Save everything to the server (or localStorage if offline). Returns true on success. */
  async function persist(msg) {
    if (!Store.online) {
      try {
        localStorage.setItem('drift_portfolio_data', JSON.stringify(Store.normalize(data)));
        data = Store.normalize(data);
        if (msg) toast(msg + ' (saved locally in browser)');
        return true;
      } catch (e) {
        toast('Local save fail hua');
        return false;
      }
    }
    let r;
    try { r = await Store.save(data); } catch (e) { toast('Server se connect nahi hua'); return false; }
    if (r.status === 401) { Store.logout(); toast('Session khatam, dobara login karo'); setTimeout(function () { location.reload(); }, 900); return false; }
    if (!r.ok) { toast((r.data && r.data.error) || 'Save fail hua'); return false; }
    data = Store.normalize(r.data);
    if (msg) toast(msg);
    return true;
  }

  /* ---------- auth ---------- */
  function showLogin() {
    $('login').classList.remove('hidden'); $('app').classList.add('hidden');
    if (!Store.online) {
      $('loginErr').textContent = 'Offline mode: Server nahi mila ("node server.js"). Koi bhi password daal kar local edit/backup kar sakte ho.';
    }
  }
  function showApp() { $('login').classList.add('hidden'); $('app').classList.remove('hidden'); renderAll(); }

  $('loginForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    $('loginErr').textContent = '';
    if (!Store.online) {
      // Allow offline access so user can still manage projects & export JSON
      $('pw').value = '';
      showApp();
      toast('Opened in local offline mode');
      return;
    }
    const r = await Store.login($('pw').value);
    if (!r.ok) { $('loginErr').textContent = r.error; return; }
    $('pw').value = '';
    data = await Store.load();
    showApp();
  });
  $('btnLogout').addEventListener('click', function () { Store.logout(); location.reload(); });

  /* ---------- rendering ---------- */
  function renderAll() { renderList(); renderProfile(); }
  function renderList() {
    $('pcount').textContent = '(' + data.projects.length + ')';
    const ul = $('list');
    if (!data.projects.length) { ul.innerHTML = '<li class="muted small">No projects yet. Add your first one on the left.</li>'; return; }
    ul.innerHTML = data.projects.map(function (p, i) {
      const th = /^(https?:\/\/|\/|\.|data:image\/)/i.test(p.image) ? '<img src="' + esc(p.image) + '" alt="">' : String(i + 1);
      return '<li class="item" style="--h:' + ((18 + i * 53) % 360) + '"><div class="th">' + th + '</div><div><h3>' + esc(p.title) + '</h3><p>' + esc(p.description) + '</p></div><div class="ctl">' +
        '<button type="button" data-a="up" data-i="' + i + '" title="Move up"' + (i === 0 ? ' disabled' : '') + '>&uarr;</button>' +
        '<button type="button" data-a="down" data-i="' + i + '" title="Move down"' + (i === data.projects.length - 1 ? ' disabled' : '') + '>&darr;</button>' +
        '<button type="button" data-a="edit" data-i="' + i + '" title="Edit">&#9998;</button>' +
        '<button type="button" data-a="del" data-i="' + i + '" title="Delete">&times;</button></div></li>';
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
  $('list').addEventListener('click', async function (e) {
    const b = e.target.closest('button[data-a]'); if (!b) return;
    const i = +b.dataset.i, a = b.dataset.a, arr = data.projects;
    if (a === 'edit') { startEdit(arr[i]); return; }
    const backup = JSON.stringify(data);
    if (a === 'up' && i > 0) { const t = arr[i - 1]; arr[i - 1] = arr[i]; arr[i] = t; }
    else if (a === 'down' && i < arr.length - 1) { const t = arr[i + 1]; arr[i + 1] = arr[i]; arr[i] = t; }
    else if (a === 'del') { if (!confirm('Delete "' + arr[i].title + '"?')) return; arr.splice(i, 1); if (editing) resetForm(); }
    else return;
    if (!(await persist(a === 'del' ? 'Deleted' : 'Order saved'))) data = JSON.parse(backup);
    renderList();
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
    $('fLink').value = p.link; $('fRepo').value = p.repo; $('fImg').value = image;
    $('formTitle').textContent = 'Edit project'; $('btnSave').textContent = 'Save changes'; $('btnCancel').classList.remove('hidden');
    renderPreview(); $('fTitle').focus(); window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  $('btnCancel').addEventListener('click', resetForm);
  $('fImg').addEventListener('input', function () { image = this.value.trim(); renderPreview(); });
  $('btnClearImg').addEventListener('click', function () { image = ''; $('fImg').value = ''; renderPreview(); });

  $('fFile').addEventListener('change', function () {
    const f = this.files && this.files[0]; this.value = '';
    if (!f) return;
    const reader = new FileReader();
    reader.onload = function () {
      const img = new Image();
      img.onload = async function () {
        const max = 720, s = Math.min(1, max / img.width);
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        const dataUrl = c.toDataURL('image/jpeg', 0.82);
        if (!Store.online) {
          image = dataUrl; $('fImg').value = image; renderPreview(); toast('Image ready (local)');
          return;
        }
        toast('Image upload ho rahi hai...');
        let r;
        try { r = await Store.upload(dataUrl); } catch (e) { toast('Upload fail hua'); return; }
        if (r.status === 401) { toast('Session khatam, dobara login karo'); return; }
        if (!r.ok) { toast((r.data && r.data.error) || 'Upload fail hua'); return; }
        image = r.data.url; $('fImg').value = image; renderPreview(); toast('Image ready');
      };
      img.onerror = function () { toast('Ye image padh nahi paye'); };
      img.src = reader.result;
    };
    reader.readAsDataURL(f);
  });

  $('pForm').addEventListener('submit', async function (e) {
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
    const backup = JSON.stringify(data);
    if (editing) {
      const i = data.projects.findIndex(function (x) { return x.id === editing; });
      if (i >= 0) data.projects[i] = p; else data.projects.push(p);
    } else data.projects.push(p);
    if (!(await persist(editing ? 'Project updated, site par live hai' : 'Project added, site par live hai'))) { data = JSON.parse(backup); return; }
    resetForm(); renderList();
  });

  /* ---------- profile / backup ---------- */
  $('profForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    const backup = JSON.stringify(data);
    data.profile = { name: $('pName').value.trim() || 'Your Name', tagline: $('pTag').value.trim(), github: $('pGh').value.trim(), linkedin: $('pLi').value.trim(), email: $('pEm').value.trim() };
    if (!(await persist('Profile saved'))) data = JSON.parse(backup);
    renderProfile();
  });
  $('btnExport').addEventListener('click', function () {
    const blob = new Blob([JSON.stringify(Store.normalize(data), null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'projects.json';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    toast('Backup download ho gaya');
  });
  $('importFile').addEventListener('change', function () {
    const f = this.files && this.files[0]; this.value = '';
    if (!f) return;
    const r = new FileReader();
    r.onload = async function () {
      let d;
      try { d = JSON.parse(r.result); if (!d || !Array.isArray(d.projects)) throw new Error('bad'); } catch (err) { toast('Invalid JSON file'); return; }
      if (!confirm('Replace current data with the imported file?')) return;
      const backup = JSON.stringify(data);
      data = Store.normalize(d);
      if (!(await persist('Imported'))) data = JSON.parse(backup);
      resetForm(); renderAll();
    };
    r.readAsText(f);
  });
  $('btnReset').addEventListener('click', async function () {
    if (!confirm('Replace everything with the sample projects?')) return;
    const backup = JSON.stringify(data);
    data = Store.defaults();
    if (!(await persist('Reset to samples'))) data = JSON.parse(backup);
    resetForm(); renderAll();
  });

  /* ---------- start ---------- */
  if (Store.online && (await Store.check())) showApp(); else showLogin();
})();
