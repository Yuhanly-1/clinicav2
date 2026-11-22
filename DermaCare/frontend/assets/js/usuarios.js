/* DermaCare — Gestión de usuarios (solo administrador) */
(function () {
  const tbody = document.getElementById('tbody');
  const form = document.getElementById('userForm');
  const modal = new bootstrap.Modal(document.getElementById('formModal'));
  const ROL_ICON = { admin: 'shield-lock', dermatologo: 'person-badge', recepcionista: 'headset' };
  let me;
  let rows = [];
  let editingId = null;

  async function load() {
    UI.tableLoading(tbody, 6);
    try {
      rows = await API.get('/usuarios' + API.qs({ q: document.getElementById('fQ').value.trim(), rol: document.getElementById('fRol').value, estado: document.getElementById('fEstado').value }));
      if (!rows.length) return UI.tableEmpty(tbody, 6, 'No se encontraron usuarios');
      tbody.innerHTML = rows.map((u) => `<tr data-testid="user-row-${u.id}">
        <td><div class="d-flex align-items-center gap-2"><span class="avatar">${UI.esc(UI.initials(u.nombre))}</span><div><div class="cell-main">${UI.esc(u.nombre)}${u.id === me.id ? ' <span class="badge text-bg-light border">Usted</span>' : ''}</div><div class="cell-sub">${UI.esc(u.email)}</div></div></div></td>
        <td><i class="bi bi-${ROL_ICON[u.rol]} me-1 text-primary"></i>${UI.esc(u.rol_nombre)}</td>
        <td>${u.dermatologo_nombre ? UI.esc(u.dermatologo_nombre) : '<span class="text-muted">—</span>'}</td>
        <td>${u.ultimo_acceso ? UI.fmtDateTime(u.ultimo_acceso) : '<span class="text-muted">Nunca</span>'}</td>
        <td>${UI.badgeActivo(u.activo)}</td>
        <td><div class="table-actions">
          <button class="btn btn-soft btn-icon" data-act="edit" data-id="${u.id}" title="Editar" data-testid="user-edit-btn-${u.id}"><i class="bi bi-pencil"></i></button>
          ${u.id !== me.id ? `<button class="btn btn-soft btn-icon ${u.activo ? 'text-danger' : 'text-success'}" data-act="toggle" data-id="${u.id}" title="${u.activo ? 'Desactivar' : 'Activar'}" data-testid="user-toggle-btn-${u.id}"><i class="bi bi-${u.activo ? 'person-dash' : 'person-check'}"></i></button>` : ''}
        </div></td></tr>`).join('');
    } catch (err) {
      UI.tableError(tbody, 6, err);
    }
  }

  function openForm(u) {
    editingId = u ? u.id : null;
    form.reset();
    UI.clearFormErrors(form);
    document.getElementById('formTitle').textContent = u ? 'Editar usuario' : 'Nuevo usuario';
    const pw = form.querySelector('[name="password"]');
    pw.required = !u;
    document.getElementById('pwReq').classList.toggle('d-none', !!u);
    document.getElementById('pwHelp').textContent = u ? 'Déjela vacía para conservar la contraseña actual.' : 'Mínimo 8 caracteres.';
    if (u) UI.fillForm(form, { nombre: u.nombre, email: u.email, rol: u.rol });
    modal.show();
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!UI.validateForm(form)) return;
    const btn = form.querySelector('[type="submit"]');
    UI.setLoading(btn, true);
    try {
      const data = UI.formData(form);
      if (!data.password) delete data.password;
      if (editingId) await API.put(`/usuarios/${editingId}`, data);
      else await API.post('/usuarios', data);
      modal.hide();
      UI.toast(editingId ? 'Usuario actualizado' : 'Usuario creado correctamente');
      load();
    } catch (err) {
      UI.showFormErrors(form, err);
    } finally {
      UI.setLoading(btn, false);
    }
  });

  tbody.addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    const u = rows.find((r) => r.id === Number(b.dataset.id));
    if (b.dataset.act === 'edit') return openForm(u);
    const ok = await UI.confirm({
      title: u.activo ? '¿Desactivar usuario?' : '¿Activar usuario?',
      message: u.activo ? `${UI.esc(u.email)} no podrá iniciar sesión y su sesión actual quedará invalidada.` : `${UI.esc(u.email)} podrá volver a iniciar sesión.`,
      confirmText: u.activo ? 'Desactivar' : 'Activar', variant: u.activo ? 'danger' : 'success', icon: u.activo ? 'person-dash' : 'person-check',
    });
    if (!ok) return;
    try {
      await API.patch(`/usuarios/${u.id}/estado`, { activo: !u.activo });
      UI.toast(u.activo ? 'Usuario desactivado' : 'Usuario activado');
      load();
    } catch (err) {
      UI.errorToast(err);
    }
  });

  App.ready.then((s) => {
    me = s.usuario;
    document.getElementById('newBtn').addEventListener('click', () => openForm(null));
    document.getElementById('fQ').addEventListener('input', UI.debounce(load, 300));
    ['fRol', 'fEstado'].forEach((id) => document.getElementById(id).addEventListener('change', load));
    load();
  });
})();
