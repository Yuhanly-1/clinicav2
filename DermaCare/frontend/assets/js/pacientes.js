/* DermaCare — Módulo de pacientes */
(function () {
  const tbody = document.getElementById('tbody');
  const form = document.getElementById('pacienteForm');
  const formModal = new bootstrap.Modal(document.getElementById('formModal'));
  const viewModal = new bootstrap.Modal(document.getElementById('viewModal'));
  let user = null;
  let editingId = null;
  let rows = [];

  const canEdit = () => ['admin', 'recepcionista'].includes(user.rol);
  const canHistory = () => ['admin', 'dermatologo'].includes(user.rol);

  async function load() {
    UI.tableLoading(tbody, 7);
    try {
      rows = await API.get('/pacientes' + API.qs({
        q: document.getElementById('fQ').value.trim(),
        campo: document.getElementById('fCampo').value,
        estado: document.getElementById('fEstado').value,
        sexo: document.getElementById('fSexo').value,
      }));
      document.getElementById('countInfo').textContent = `${rows.length} paciente(s) encontrado(s)`;
      if (!rows.length) return UI.tableEmpty(tbody, 7, 'No se encontraron pacientes con esos criterios', 'person-x');
      tbody.innerHTML = rows.map((p) => `<tr data-testid="patient-row-${p.id}">
        <td><div class="d-flex align-items-center gap-2"><span class="avatar">${UI.esc(UI.initials(p.nombres + ' ' + p.apellidos))}</span>
          <div><div class="cell-main">${UI.esc(p.nombres)} ${UI.esc(p.apellidos)}</div><div class="cell-sub">ID #${p.id}</div></div></div></td>
        <td>${UI.esc(p.cedula || '—')}</td>
        <td>${p.edad} años<div class="cell-sub">${UI.SEXO[p.sexo]}</div></td>
        <td>${UI.esc(p.telefono)}<div class="cell-sub">${UI.esc(p.email || 'Sin correo')}</div></td>
        <td>${UI.fmtDate(p.fecha_registro)}</td>
        <td>${UI.badgeActivo(p.activo)}</td>
        <td><div class="table-actions">
          <button class="btn btn-soft btn-icon" data-act="view" data-id="${p.id}" title="Ver ficha" data-testid="patient-view-btn-${p.id}"><i class="bi bi-eye"></i></button>
          ${canHistory() ? `<a class="btn btn-soft btn-icon" href="/pages/historial.html?paciente_id=${p.id}" title="Historial médico" data-testid="patient-history-btn-${p.id}"><i class="bi bi-journal-medical"></i></a>` : ''}
          ${canEdit() ? `<a class="btn btn-soft btn-icon" href="/pages/citas.html?nueva=1&paciente_id=${p.id}" title="Agendar cita" data-testid="patient-schedule-btn-${p.id}"><i class="bi bi-calendar-plus"></i></a>
          <button class="btn btn-soft btn-icon" data-act="edit" data-id="${p.id}" title="Editar" data-testid="patient-edit-btn-${p.id}"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-soft btn-icon ${p.activo ? 'text-danger' : 'text-success'}" data-act="toggle" data-id="${p.id}" title="${p.activo ? 'Desactivar' : 'Activar'}" data-testid="patient-toggle-btn-${p.id}"><i class="bi bi-${p.activo ? 'person-dash' : 'person-check'}"></i></button>` : ''}
        </div></td></tr>`).join('');
    } catch (err) {
      UI.tableError(tbody, 7, err);
    }
  }

  function openForm(p) {
    editingId = p ? p.id : null;
    form.reset();
    UI.clearFormErrors(form);
    document.getElementById('formTitle').textContent = p ? `Editar paciente #${p.id}` : 'Registrar paciente';
    if (p) UI.fillForm(form, p);
    form.querySelector('[name="fecha_nacimiento"]').max = window.__hoy;
    formModal.show();
  }

  async function view(id) {
    const body = document.getElementById('viewBody');
    body.innerHTML = '<div class="loading-overlay"><span class="spinner-border spinner-border-sm"></span> Cargando...</div>';
    document.getElementById('viewFooter').innerHTML = '';
    viewModal.show();
    try {
      const p = await API.get(`/pacientes/${id}`);
      const tile = (l, v) => `<div class="col-sm-6 col-md-4"><div class="info-tile"><span class="label-caps">${l}</span>${UI.esc(v || '—')}</div></div>`;
      body.innerHTML = `<div class="d-flex align-items-center gap-3 mb-3"><span class="avatar" style="width:52px;height:52px;font-size:1rem">${UI.esc(UI.initials(p.nombres + ' ' + p.apellidos))}</span>
          <div><h5 class="mb-0 font-heading" data-testid="patient-view-name">${UI.esc(p.nombres)} ${UI.esc(p.apellidos)}</h5><div class="text-muted small">ID #${p.id} · Registrado el ${UI.fmtDate(p.fecha_registro)} · ${UI.badgeActivo(p.activo)}</div></div></div>
        <div class="row g-2 mb-3">${tile('Cédula', p.cedula)}${tile('Nacimiento', `${UI.fmtDate(p.fecha_nacimiento)} (${p.edad} años)`)}${tile('Sexo', UI.SEXO[p.sexo])}
          ${tile('Teléfono', p.telefono)}${tile('Correo', p.email)}${tile('Dirección', p.direccion)}</div>
        ${p.alergias ? `<div class="alert-allergy mb-2"><i class="bi bi-exclamation-triangle me-1"></i><strong>Alergias:</strong> ${UI.esc(p.alergias)}</div>` : ''}
        <div class="info-tile"><span class="label-caps">Antecedentes médicos</span>${UI.esc(p.antecedentes || 'Sin antecedentes registrados')}</div>`;
      document.getElementById('viewFooter').innerHTML =
        (canHistory() ? `<a class="btn btn-navy" href="/pages/historial.html?paciente_id=${p.id}" data-testid="patient-view-history-btn"><i class="bi bi-journal-medical me-1"></i>Ver historial</a>` : '') +
        (canEdit() ? `<a class="btn btn-success" href="/pages/citas.html?nueva=1&paciente_id=${p.id}" data-testid="patient-view-schedule-btn"><i class="bi bi-calendar-plus me-1"></i>Agendar cita</a>` : '');
    } catch (err) {
      body.innerHTML = `<div class="empty-state text-danger">${UI.esc(err.message)}</div>`;
    }
  }

  async function toggle(id) {
    const p = rows.find((r) => r.id === id);
    const ok = await UI.confirm({
      title: p.activo ? '¿Desactivar paciente?' : '¿Activar paciente?',
      message: p.activo
        ? `${UI.esc(p.nombres)} ${UI.esc(p.apellidos)} no podrá recibir nuevas citas. Su historial médico se conserva.`
        : `${UI.esc(p.nombres)} ${UI.esc(p.apellidos)} volverá a estar disponible para agendar citas.`,
      confirmText: p.activo ? 'Desactivar' : 'Activar',
      variant: p.activo ? 'danger' : 'success',
      icon: p.activo ? 'person-dash' : 'person-check',
    });
    if (!ok) return;
    try {
      await API.patch(`/pacientes/${id}/estado`, { activo: !p.activo });
      UI.toast(p.activo ? 'Paciente desactivado' : 'Paciente activado');
      load();
    } catch (err) {
      UI.errorToast(err);
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!UI.validateForm(form)) return;
    const btn = form.querySelector('[type="submit"]');
    UI.setLoading(btn, true);
    try {
      const data = UI.formData(form);
      if (editingId) await API.put(`/pacientes/${editingId}`, data);
      else await API.post('/pacientes', data);
      formModal.hide();
      UI.toast(editingId ? 'Paciente actualizado correctamente' : 'Paciente registrado correctamente');
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
    const id = Number(b.dataset.id);
    if (b.dataset.act === 'view') view(id);
    if (b.dataset.act === 'toggle') toggle(id);
    if (b.dataset.act === 'edit') {
      try { openForm(await API.get(`/pacientes/${id}`)); } catch (err) { UI.errorToast(err); }
    }
  });

  App.ready.then((s) => {
    user = s.usuario;
    window.__hoy = s.hoy;
    if (user.rol === 'dermatologo') document.getElementById('pageSubtitle').textContent = 'Pacientes con citas asignadas a usted.';
    const newBtn = document.getElementById('newBtn');
    if (newBtn) newBtn.addEventListener('click', () => openForm(null));
    const reload = UI.debounce(load, 300);
    document.getElementById('fQ').addEventListener('input', reload);
    ['fCampo', 'fEstado', 'fSexo'].forEach((id) => document.getElementById(id).addEventListener('change', load));
    load();
  });
})();
