/* DermaCare — Módulo de citas: agenda, disponibilidad, reprogramación y cancelación */
(function () {
  const tbody = document.getElementById('tbody');
  const form = document.getElementById('citaForm');
  const citaModal = new bootstrap.Modal(document.getElementById('citaModal'));
  const cancelModal = new bootstrap.Modal(document.getElementById('cancelModal'));
  const viewModal = new bootstrap.Modal(document.getElementById('viewModal'));
  const availBox = document.getElementById('availBox');
  let user;
  let hoy;
  let view = 'proximas';
  let rows = [];
  let pacientes = [];
  let editing = null;
  let cancelId = null;

  const isStaff = () => ['admin', 'recepcionista'].includes(user.rol);
  const editable = (c) => ['Pendiente', 'Confirmada'].includes(c.estado);

  function filters() {
    const f = {
      q: document.getElementById('fQ').value.trim(),
      estado: document.getElementById('fEstado').value,
      fecha: document.getElementById('fFecha').value,
    };
    const fd = document.getElementById('fDerm');
    if (fd) f.dermatologo_id = fd.value;
    if (!f.fecha) {
      if (view === 'hoy') f.fecha = hoy;
      if (view === 'proximas') f.desde = hoy;
    }
    if (view === 'todas' && !f.fecha) f.orden = 'desc';
    return f;
  }

  function actions(c) {
    const b = [];
    b.push(`<button class="btn btn-soft btn-icon" data-act="view" data-id="${c.id}" title="Ver detalle" data-testid="appointment-view-btn-${c.id}"><i class="bi bi-eye"></i></button>`);
    if (isStaff()) {
      if (c.estado === 'Pendiente') b.push(`<button class="btn btn-soft btn-icon text-primary" data-act="confirm" data-id="${c.id}" title="Confirmar" data-testid="appointment-confirm-btn-${c.id}"><i class="bi bi-check2-square"></i></button>`);
      if (editable(c)) {
        b.push(`<button class="btn btn-soft btn-icon" data-act="edit" data-id="${c.id}" title="Reprogramar" data-testid="appointment-reschedule-btn-${c.id}"><i class="bi bi-arrow-repeat"></i></button>`);
        b.push(`<button class="btn btn-soft btn-icon text-danger" data-act="cancel" data-id="${c.id}" title="Cancelar" data-testid="appointment-cancel-btn-${c.id}"><i class="bi bi-x-circle"></i></button>`);
      }
    }
    if (user.rol === 'dermatologo') {
      b.push(`<a class="btn btn-soft btn-icon" href="/pages/historial.html?paciente_id=${c.paciente_id}" title="Historial del paciente" data-testid="appointment-history-btn-${c.id}"><i class="bi bi-journal-medical"></i></a>`);
      if (editable(c)) b.push(`<button class="btn btn-success btn-sm" data-act="attend" data-id="${c.id}" data-testid="appointment-attend-btn-${c.id}"><i class="bi bi-play-circle me-1"></i>Atender</button>`);
      if (c.estado === 'En consulta') b.push(`<a class="btn btn-primary btn-sm" href="/pages/consultas.html?cita_id=${c.id}" data-testid="appointment-continue-btn-${c.id}"><i class="bi bi-clipboard2-pulse me-1"></i>Registrar consulta</a>`);
    }
    if (c.consulta_id && user.rol !== 'recepcionista') b.push(`<a class="btn btn-soft btn-icon text-success" href="/pages/consultas.html?ver=${c.consulta_id}" title="Ver consulta" data-testid="appointment-consulta-btn-${c.id}"><i class="bi bi-clipboard2-check"></i></a>`);
    return b.join('');
  }

  async function load() {
    UI.tableLoading(tbody, 6);
    try {
      rows = await API.get('/citas' + API.qs(filters()));
      document.getElementById('countInfo').textContent = `${rows.length} cita(s)`;
      if (!rows.length) return UI.tableEmpty(tbody, 6, 'No hay citas para los filtros seleccionados', 'calendar-x');
      tbody.innerHTML = rows.map((c) => `<tr data-testid="appointment-row-${c.id}">
        <td><div class="cell-main">${UI.fmtDate(c.fecha)}${c.fecha === hoy ? ' <span class="badge text-bg-primary ms-1">Hoy</span>' : ''}</div><div class="cell-sub">${c.hora_inicio} – ${c.hora_fin} · ${c.duracion} min</div></td>
        <td><div class="cell-main">${UI.esc(c.paciente_nombre)}</div><div class="cell-sub">${UI.esc(c.paciente_cedula || c.paciente_telefono)}</div></td>
        <td>${UI.esc(c.dermatologo_nombre)}<div class="cell-sub">${UI.esc(c.especialidad)}</div></td>
        <td class="text-truncate" style="max-width:220px" title="${UI.esc(c.motivo)}">${UI.esc(c.motivo)}</td>
        <td>${UI.badgeEstado(c.estado)}</td>
        <td><div class="table-actions">${actions(c)}</div></td></tr>`).join('');
    } catch (err) {
      UI.tableError(tbody, 6, err);
    }
  }

  // ---------- Formulario de cita ----------
  function renderPacientes(selected) {
    const q = document.getElementById('pacFilter').value.trim().toLowerCase();
    const sel = form.querySelector('[name="paciente_id"]');
    const list = pacientes.filter((p) => !q || `${p.nombres} ${p.apellidos} ${p.cedula || ''}`.toLowerCase().includes(q) || String(p.id) === String(selected));
    sel.innerHTML = '<option value="">Seleccione un paciente...</option>' +
      list.map((p) => `<option value="${p.id}">${UI.esc(p.apellidos)}, ${UI.esc(p.nombres)}${p.cedula ? ' · ' + UI.esc(p.cedula) : ''}</option>`).join('');
    if (selected) sel.value = String(selected);
  }

  async function loadDisponibilidad() {
    const derm = form.querySelector('[name="dermatologo_id"]').value;
    const fecha = form.querySelector('[name="fecha"]').value;
    const duracion = form.querySelector('[name="duracion"]').value;
    if (!derm || !fecha) {
      availBox.innerHTML = '<div class="text-muted small"><i class="bi bi-info-circle me-1"></i>Seleccione dermatólogo y fecha para consultar la disponibilidad.</div>';
      return;
    }
    availBox.innerHTML = '<div class="loading-overlay p-3"><span class="spinner-border spinner-border-sm"></span> Consultando disponibilidad...</div>';
    try {
      const d = await API.get('/citas/disponibilidad' + API.qs({ dermatologo_id: derm, fecha, duracion, excluir_cita_id: editing ? editing.id : '' }));
      const horaActual = form.querySelector('[name="hora"]').value;
      const horarios = d.horarios.length
        ? d.horarios.map((h) => `<span class="badge text-bg-light border me-1">${h.hora_inicio} – ${h.hora_fin}</span>`).join('')
        : '<span class="text-danger small">Sin horario de atención configurado para este día</span>';
      const ocupadas = d.ocupadas.length
        ? d.ocupadas.map((o) => `<span class="busy-item">${o.hora_inicio} – ${o.hora_fin}</span>`).join(' ')
        : '<span class="small text-muted">Ninguna</span>';
      const libres = d.libres.length
        ? `<div class="slot-grid">${d.libres.map((s) => `<button type="button" class="slot ${s === horaActual ? 'selected' : ''}" data-slot="${s}" data-testid="appointment-slot-${s.replace(':', '')}">${s}</button>`).join('')}</div>`
        : '<div class="small text-muted"><i class="bi bi-calendar-x me-1"></i>No hay espacios disponibles con esa duración.</div>';
      availBox.innerHTML = `
        <div class="mb-2"><strong>${UI.esc(d.dermatologo.nombre)}</strong> · ${UI.longDate(d.fecha)}</div>
        ${!d.dermatologo.activo ? '<div class="alert alert-warning py-1 small">El dermatólogo está inactivo.</div>' : ''}
        <div class="mb-2"><span class="label-caps d-block mb-1">Horario de atención</span>${horarios}</div>
        <div class="mb-3"><span class="label-caps d-block mb-1">Horarios ocupados</span>${ocupadas}</div>
        <div><span class="label-caps d-block mb-2">Espacios libres (${d.duracion} min)</span>${libres}</div>`;
    } catch (err) {
      availBox.innerHTML = `<div class="text-danger small">${UI.esc(err.message)}</div>`;
    }
  }

  async function openForm(cita, presetPaciente) {
    editing = cita || null;
    form.reset();
    UI.clearFormErrors(form);
    document.getElementById('pacFilter').value = '';
    document.getElementById('citaTitle').textContent = cita ? `Reprogramar cita #${cita.id}` : 'Agendar cita';
    form.querySelector('[name="fecha"]').min = hoy;
    try {
      pacientes = await API.get('/pacientes?estado=activo&limit=1000');
    } catch (err) {
      return UI.errorToast(err);
    }
    renderPacientes(cita ? cita.paciente_id : presetPaciente);
    if (cita) {
      UI.fillForm(form, { dermatologo_id: cita.dermatologo_id, fecha: cita.fecha, hora: cita.hora_inicio, duracion: cita.duracion, motivo: cita.motivo });
      const dur = form.querySelector('[name="duracion"]');
      if (dur.value !== String(cita.duracion)) {
        dur.insertAdjacentHTML('beforeend', `<option value="${cita.duracion}">${cita.duracion} min</option>`);
        dur.value = String(cita.duracion);
      }
    }
    citaModal.show();
    loadDisponibilidad();
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!UI.validateForm(form)) return;
    const btn = form.querySelector('[type="submit"]');
    UI.setLoading(btn, true, 'Validando horario...');
    try {
      const data = UI.formData(form);
      data.paciente_id = Number(data.paciente_id);
      data.dermatologo_id = Number(data.dermatologo_id);
      data.duracion = Number(data.duracion);
      const c = editing ? await API.put(`/citas/${editing.id}`, data) : await API.post('/citas', data);
      citaModal.hide();
      UI.toast(editing ? `Cita reprogramada para el ${UI.fmtDate(c.fecha)} a las ${c.hora_inicio}` : `Cita agendada para el ${UI.fmtDate(c.fecha)} a las ${c.hora_inicio}`);
      load();
    } catch (err) {
      UI.showFormErrors(form, err);
      if (err.status === 409) loadDisponibilidad();
    } finally {
      UI.setLoading(btn, false);
    }
  });

  availBox.addEventListener('click', (e) => {
    const s = e.target.closest('[data-slot]');
    if (!s) return;
    form.querySelector('[name="hora"]').value = s.dataset.slot;
    availBox.querySelectorAll('.slot').forEach((x) => x.classList.toggle('selected', x === s));
  });
  ['dermatologo_id', 'fecha', 'duracion'].forEach((n) => form.querySelector(`[name="${n}"]`).addEventListener('change', loadDisponibilidad));
  document.getElementById('pacFilter').addEventListener('input', () => renderPacientes(form.querySelector('[name="paciente_id"]').value));

  // ---------- Acciones ----------
  function showDetail(c) {
    document.getElementById('viewBody').innerHTML = `
      <div class="d-flex justify-content-between align-items-start mb-3"><div><div class="label-caps">Cita #${c.id}</div>
        <h5 class="font-heading mb-0">${UI.longDate(c.fecha)}</h5><div class="text-muted">${c.hora_inicio} – ${c.hora_fin} (${c.duracion} min)</div></div>${UI.badgeEstado(c.estado)}</div>
      <div class="row g-2">
        <div class="col-6"><div class="info-tile"><span class="label-caps">Paciente</span>${UI.esc(c.paciente_nombre)}<div class="cell-sub">${UI.esc(c.paciente_telefono)}</div></div></div>
        <div class="col-6"><div class="info-tile"><span class="label-caps">Dermatólogo</span>${UI.esc(c.dermatologo_nombre)}<div class="cell-sub">${UI.esc(c.especialidad)}</div></div></div>
        <div class="col-12"><div class="info-tile"><span class="label-caps">Motivo</span>${UI.esc(c.motivo)}</div></div>
        ${c.motivo_cancelacion ? `<div class="col-12"><div class="info-tile"><span class="label-caps">Motivo de cancelación</span>${UI.esc(c.motivo_cancelacion)}</div></div>` : ''}
        <div class="col-12 small text-muted">Registrada el ${UI.fmtDateTime(c.creado_en)}</div>
      </div>`;
    viewModal.show();
  }

  tbody.addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    const c = rows.find((r) => r.id === Number(b.dataset.id));
    if (!c) return;
    const act = b.dataset.act;
    if (act === 'view') return showDetail(c);
    if (act === 'edit') return openForm(c);
    if (act === 'cancel') {
      cancelId = c.id;
      document.getElementById('cancelForm').reset();
      document.getElementById('cancelInfo').innerHTML = `¿Desea cancelar la cita de <strong>${UI.esc(c.paciente_nombre)}</strong> del ${UI.fmtDate(c.fecha)} a las ${c.hora_inicio}?`;
      return cancelModal.show();
    }
    if (act === 'confirm') {
      const ok = await UI.confirm({ title: '¿Confirmar cita?', message: `${UI.esc(c.paciente_nombre)} · ${UI.fmtDate(c.fecha)} ${c.hora_inicio}`, confirmText: 'Confirmar', variant: 'primary', icon: 'check2-square' });
      if (!ok) return;
      try { await API.patch(`/citas/${c.id}/estado`, { estado: 'Confirmada' }); UI.toast('Cita confirmada'); load(); } catch (err) { UI.errorToast(err); }
    }
    if (act === 'attend') {
      const ok = await UI.confirm({ title: '¿Iniciar atención?', message: `La cita de ${UI.esc(c.paciente_nombre)} pasará a "En consulta".`, confirmText: 'Iniciar consulta', variant: 'success', icon: 'play-circle' });
      if (!ok) return;
      try { await API.patch(`/citas/${c.id}/estado`, { estado: 'En consulta' }); window.location.href = `/pages/consultas.html?cita_id=${c.id}`; } catch (err) { UI.errorToast(err); }
    }
  });

  document.getElementById('cancelForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('[type="submit"]');
    UI.setLoading(btn, true, 'Cancelando...');
    try {
      await API.patch(`/citas/${cancelId}/cancelar`, { motivo: e.target.motivo.value.trim() });
      cancelModal.hide();
      UI.toast('Cita cancelada. El horario quedó disponible.', 'warning');
      load();
    } catch (err) {
      UI.errorToast(err);
    } finally {
      UI.setLoading(btn, false);
    }
  });

  document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => {
    view = b.dataset.view;
    document.querySelectorAll('[data-view]').forEach((x) => x.classList.toggle('active', x === b));
    document.getElementById('fFecha').value = '';
    load();
  }));

  App.ready.then(async (s) => {
    user = s.usuario;
    hoy = s.hoy;
    if (user.rol === 'dermatologo') {
      document.getElementById('pageTitle').textContent = 'Mi agenda';
      document.getElementById('pageSubtitle').textContent = 'Citas asignadas a usted. Inicie la atención para registrar la consulta.';
    }
    if (UI.param('fecha') === 'hoy') document.querySelector('[data-view="hoy"]').click();
    if (UI.param('estado')) document.getElementById('fEstado').value = UI.param('estado');

    try {
      const derms = await API.get('/dermatologos?estado=activo');
      const opts = derms.map((d) => `<option value="${d.id}">${UI.esc(d.nombres)} ${UI.esc(d.apellidos)} · ${UI.esc(d.especialidad)}</option>`).join('');
      form.querySelector('[name="dermatologo_id"]').innerHTML = '<option value="">Seleccione un dermatólogo...</option>' + opts;
      const fd = document.getElementById('fDerm');
      if (fd) {
        fd.innerHTML += opts;
        if (UI.param('dermatologo_id')) {
          fd.value = UI.param('dermatologo_id');
          document.querySelector('[data-view="todas"]').click();
        }
      }
    } catch (err) {
      UI.errorToast(err);
    }

    const reload = UI.debounce(load, 300);
    document.getElementById('fQ').addEventListener('input', reload);
    ['fFecha', 'fEstado', 'fDerm'].forEach((id) => { const el = document.getElementById(id); if (el) el.addEventListener('change', load); });
    const newBtn = document.getElementById('newBtn');
    if (newBtn) newBtn.addEventListener('click', () => openForm(null));
    if (!UI.param('fecha') && !UI.param('dermatologo_id')) load();
    if (isStaff() && UI.param('nueva')) openForm(null, UI.param('paciente_id'));
  });
})();
