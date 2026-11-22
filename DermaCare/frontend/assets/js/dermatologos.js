/* DermaCare — Módulo de dermatólogos y horarios */
(function () {
  const tbody = document.getElementById('tbody');
  const form = document.getElementById('dermForm');
  const formModal = new bootstrap.Modal(document.getElementById('formModal'));
  const horarioModal = new bootstrap.Modal(document.getElementById('horarioModal'));
  const horarioBody = document.getElementById('horarioBody');
  const ORDEN_DIAS = [1, 2, 3, 4, 5, 6, 0];
  let user;
  let rows = [];
  let editingId = null;
  let horarioDerm = null;

  const isAdmin = () => user.rol === 'admin';

  async function load() {
    UI.tableLoading(tbody, 8);
    try {
      rows = await API.get('/dermatologos' + API.qs({ q: document.getElementById('fQ').value.trim(), estado: document.getElementById('fEstado').value }));
      if (!rows.length) return UI.tableEmpty(tbody, 8, 'No se encontraron dermatólogos', 'person-x');
      tbody.innerHTML = rows.map((d) => `<tr data-testid="dermatologist-row-${d.id}">
        <td><div class="d-flex align-items-center gap-2"><span class="avatar">${UI.esc(UI.initials(d.nombres + ' ' + d.apellidos))}</span><div class="cell-main">${UI.esc(d.nombres)} ${UI.esc(d.apellidos)}</div></div></td>
        <td><code>${UI.esc(d.exequatur)}</code></td>
        <td>${UI.esc(d.especialidad)}</td>
        <td>${UI.esc(d.telefono)}<div class="cell-sub">${UI.esc(d.email)}</div></td>
        <td>${d.usuario_email ? `<i class="bi bi-person-check text-success me-1"></i>${UI.esc(d.usuario_email)}` : '<span class="text-muted">Sin usuario</span>'}</td>
        <td><span class="badge text-bg-light border">${d.citas_proximas}</span></td>
        <td>${UI.badgeActivo(d.activo)}</td>
        <td><div class="table-actions">
          <a class="btn btn-soft btn-icon" href="/pages/citas.html?dermatologo_id=${d.id}" title="Ver agenda" data-testid="dermatologist-agenda-btn-${d.id}"><i class="bi bi-calendar-week"></i></a>
          <button class="btn btn-soft btn-icon" data-act="horario" data-id="${d.id}" title="Horario" data-testid="dermatologist-schedule-btn-${d.id}"><i class="bi bi-clock"></i></button>
          ${isAdmin() ? `<button class="btn btn-soft btn-icon" data-act="edit" data-id="${d.id}" title="Editar" data-testid="dermatologist-edit-btn-${d.id}"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-soft btn-icon ${d.activo ? 'text-danger' : 'text-success'}" data-act="toggle" data-id="${d.id}" title="${d.activo ? 'Desactivar' : 'Activar'}" data-testid="dermatologist-toggle-btn-${d.id}"><i class="bi bi-${d.activo ? 'person-dash' : 'person-check'}"></i></button>` : ''}
        </div></td></tr>`).join('');
    } catch (err) {
      UI.tableError(tbody, 8, err);
    }
  }

  async function openForm(d) {
    editingId = d ? d.id : null;
    form.reset();
    UI.clearFormErrors(form);
    document.getElementById('formTitle').textContent = d ? 'Editar dermatólogo' : 'Registrar dermatólogo';
    const sel = form.querySelector('[name="usuario_id"]');
    try {
      const libres = await API.get('/usuarios?rol=dermatologo&estado=activo&sin_dermatologo=true');
      const opts = libres.map((u) => `<option value="${u.id}">${UI.esc(u.nombre)} · ${UI.esc(u.email)}</option>`);
      if (d && d.usuario_id) opts.unshift(`<option value="${d.usuario_id}">${UI.esc(d.usuario_nombre)} · ${UI.esc(d.usuario_email)}</option>`);
      sel.innerHTML = '<option value="">Sin usuario asociado</option>' + opts.join('');
    } catch (err) {
      return UI.errorToast(err);
    }
    if (d) UI.fillForm(form, d);
    formModal.show();
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!UI.validateForm(form)) return;
    const btn = form.querySelector('[type="submit"]');
    UI.setLoading(btn, true);
    try {
      const data = UI.formData(form);
      data.usuario_id = data.usuario_id ? Number(data.usuario_id) : null;
      if (editingId) await API.put(`/dermatologos/${editingId}`, data);
      else await API.post('/dermatologos', data);
      formModal.hide();
      UI.toast(editingId ? 'Dermatólogo actualizado' : 'Dermatólogo registrado. Configure su horario de atención.');
      load();
    } catch (err) {
      UI.showFormErrors(form, err);
    } finally {
      UI.setLoading(btn, false);
    }
  });

  // ---------- Horario semanal ----------
  const blockRow = (dia, b = {}) => `<div class="d-flex gap-2 align-items-center mb-2" data-block data-dia="${dia}">
      <input type="time" class="form-control form-control-sm" value="${b.hora_inicio || '08:00'}" data-ini ${isAdmin() ? '' : 'disabled'} data-testid="schedule-start-${dia}">
      <span class="text-muted">a</span>
      <input type="time" class="form-control form-control-sm" value="${b.hora_fin || '12:00'}" data-fin ${isAdmin() ? '' : 'disabled'} data-testid="schedule-end-${dia}">
      ${isAdmin() ? '<button type="button" class="btn btn-soft btn-icon text-danger" data-remove title="Quitar bloque"><i class="bi bi-trash"></i></button>' : ''}
    </div>`;

  async function openHorario(d) {
    horarioDerm = d;
    document.getElementById('horarioTitle').textContent = `Horario semanal · ${d.nombres} ${d.apellidos}`;
    document.getElementById('saveHorario').classList.toggle('d-none', !isAdmin());
    horarioBody.innerHTML = '<div class="loading-overlay"><span class="spinner-border spinner-border-sm"></span> Cargando...</div>';
    horarioModal.show();
    try {
      const hs = await API.get(`/dermatologos/${d.id}/horarios`);
      horarioBody.innerHTML = ORDEN_DIAS.map((dia) => {
        const bloques = hs.filter((h) => h.dia_semana === dia);
        return `<div class="schedule-day" data-day="${dia}">
          <div class="d-flex justify-content-between align-items-center mb-2"><strong>${UI.DIAS[dia]}</strong>
            ${isAdmin() ? `<button type="button" class="btn btn-sm btn-soft" data-add="${dia}" data-testid="schedule-add-${dia}"><i class="bi bi-plus"></i> Bloque</button>` : ''}</div>
          <div data-blocks>${bloques.length ? bloques.map((b) => blockRow(dia, b)).join('') : '<div class="small text-muted" data-none>Sin atención</div>'}</div></div>`;
      }).join('');
    } catch (err) {
      horarioBody.innerHTML = `<div class="text-danger">${UI.esc(err.message)}</div>`;
    }
  }

  horarioBody.addEventListener('click', (e) => {
    const add = e.target.closest('[data-add]');
    if (add) {
      const cont = add.closest('.schedule-day').querySelector('[data-blocks]');
      const none = cont.querySelector('[data-none]');
      if (none) none.remove();
      cont.insertAdjacentHTML('beforeend', blockRow(add.dataset.add, { hora_inicio: '14:00', hora_fin: '18:00' }));
    }
    const rm = e.target.closest('[data-remove]');
    if (rm) rm.closest('[data-block]').remove();
  });

  document.getElementById('saveHorario').addEventListener('click', async (e) => {
    const horarios = [...horarioBody.querySelectorAll('[data-block]')].map((b) => ({
      dia_semana: Number(b.dataset.dia), hora_inicio: b.querySelector('[data-ini]').value, hora_fin: b.querySelector('[data-fin]').value,
    }));
    UI.setLoading(e.currentTarget, true);
    try {
      await API.put(`/dermatologos/${horarioDerm.id}/horarios`, { horarios });
      horarioModal.hide();
      UI.toast('Horario de atención guardado');
    } catch (err) {
      UI.errorToast(err);
    } finally {
      UI.setLoading(document.getElementById('saveHorario'), false);
    }
  });

  tbody.addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    const d = rows.find((r) => r.id === Number(b.dataset.id));
    if (b.dataset.act === 'edit') openForm(d);
    if (b.dataset.act === 'horario') openHorario(d);
    if (b.dataset.act === 'toggle') {
      const ok = await UI.confirm({
        title: d.activo ? '¿Desactivar dermatólogo?' : '¿Activar dermatólogo?',
        message: d.activo ? 'No se podrán agendar nuevas citas con este especialista. Su historial se conserva.' : 'El especialista volverá a estar disponible para citas.',
        confirmText: d.activo ? 'Desactivar' : 'Activar', variant: d.activo ? 'danger' : 'success', icon: d.activo ? 'person-dash' : 'person-check',
      });
      if (!ok) return;
      try {
        await API.patch(`/dermatologos/${d.id}/estado`, { activo: !d.activo });
        UI.toast(d.activo ? 'Dermatólogo desactivado' : 'Dermatólogo activado');
        load();
      } catch (err) {
        UI.errorToast(err);
      }
    }
  });

  App.ready.then((s) => {
    user = s.usuario;
    const nb = document.getElementById('newBtn');
    if (nb) nb.addEventListener('click', () => openForm(null));
    document.getElementById('fQ').addEventListener('input', UI.debounce(load, 300));
    document.getElementById('fEstado').addEventListener('change', load);
    load();
  });
})();
