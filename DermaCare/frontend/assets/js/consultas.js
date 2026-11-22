/* DermaCare — Consultas dermatológicas */
(function () {
  const tbody = document.getElementById('tbody');
  const form = document.getElementById('consultaForm');
  const diagList = document.getElementById('diagList');
  const viewModal = new bootstrap.Modal(document.getElementById('viewModal'));
  let user;
  let hoy;
  let rows = [];

  const diagRow = (i) => `<div class="diag-row" data-diag>
      <div class="row g-2 align-items-end">
        <div class="col-md-6"><label class="form-label small">Descripción ${i === 0 ? '<span class="req">*</span>' : ''}</label><input class="form-control form-control-sm" data-f="descripcion" maxlength="500" placeholder="Ej.: Dermatitis de contacto" data-testid="diagnosis-description-${i}"></div>
        <div class="col-6 col-md-2"><label class="form-label small">CIE-10</label><input class="form-control form-control-sm" data-f="codigo_cie10" maxlength="10" placeholder="L25.9" data-testid="diagnosis-code-${i}"></div>
        <div class="col-6 col-md-3"><label class="form-label small">Tipo</label><select class="form-select form-select-sm" data-f="tipo" data-testid="diagnosis-type-${i}"><option>${i === 0 ? 'Principal' : 'Secundario'}</option><option>${i === 0 ? 'Secundario' : 'Principal'}</option></select></div>
        <div class="col-md-1 text-end">${i > 0 ? '<button type="button" class="btn btn-soft btn-icon text-danger" data-rm title="Quitar"><i class="bi bi-trash"></i></button>' : ''}</div>
      </div></div>`;

  function detailHtml(c) {
    const block = (l, v) => `<div class="mb-3"><span class="label-caps d-block mb-1">${l}</span><div style="white-space:pre-wrap">${UI.esc(v || '—')}</div></div>`;
    return `<div class="d-flex justify-content-between flex-wrap gap-2 mb-3"><div><h5 class="font-heading mb-0">${UI.esc(c.paciente_nombre)}</h5>
        <div class="text-muted small">${UI.fmtDateTime(c.fecha_atencion)} · ${UI.esc(c.dermatologo_nombre)} · Cita #${c.cita_id}</div></div>
        <a class="btn btn-sm btn-navy align-self-start" href="/pages/historial.html?paciente_id=${c.paciente_id}"><i class="bi bi-journal-medical me-1"></i>Historial</a></div>
      ${block('Motivo', c.motivo)}${block('Síntomas', c.sintomas)}${block('Examen dermatológico', c.examen_dermatologico)}
      <div class="mb-3"><span class="label-caps d-block mb-1">Diagnósticos</span>${c.diagnosticos.map((d) => `<div class="diag-row py-2 mb-1"><span class="badge ${d.tipo === 'Principal' ? 'text-bg-primary' : 'text-bg-secondary'} me-2">${d.tipo}</span>${d.codigo_cie10 ? `<code class="me-2">${UI.esc(d.codigo_cie10)}</code>` : ''}${UI.esc(d.descripcion)}</div>`).join('')}</div>
      ${block('Tratamiento', c.tratamiento)}${block('Observaciones', c.observaciones)}`;
  }

  async function view(id) {
    const body = document.getElementById('viewBody');
    body.innerHTML = '<div class="loading-overlay"><span class="spinner-border spinner-border-sm"></span> Cargando...</div>';
    viewModal.show();
    try {
      body.innerHTML = detailHtml(await API.get(`/consultas/${id}`));
    } catch (err) {
      body.innerHTML = `<div class="text-danger">${UI.esc(err.message)}</div>`;
    }
  }

  async function load() {
    UI.tableLoading(tbody, 6);
    try {
      rows = await API.get('/consultas' + API.qs({ q: document.getElementById('fQ').value.trim(), desde: document.getElementById('fDesde').value, hasta: document.getElementById('fHasta').value }));
      document.getElementById('countInfo').textContent = `${rows.length} consulta(s)`;
      if (!rows.length) return UI.tableEmpty(tbody, 6, 'No hay consultas registradas', 'clipboard2');
      tbody.innerHTML = rows.map((c) => {
        const p = c.diagnosticos.find((d) => d.tipo === 'Principal') || c.diagnosticos[0];
        return `<tr data-testid="consultation-row-${c.id}">
          <td><div class="cell-main">${UI.fmtDate(c.fecha_atencion)}</div><div class="cell-sub">${c.fecha_atencion.slice(11, 16)}</div></td>
          <td>${UI.esc(c.paciente_nombre)}<div class="cell-sub">${UI.esc(c.paciente_cedula || '')}</div></td>
          <td>${UI.esc(c.dermatologo_nombre)}</td>
          <td>${p ? `${p.codigo_cie10 ? `<code class="me-1">${UI.esc(p.codigo_cie10)}</code>` : ''}${UI.esc(p.descripcion)}` : '—'}</td>
          <td class="text-truncate" style="max-width:240px">${UI.esc(c.tratamiento)}</td>
          <td><div class="table-actions"><button class="btn btn-soft btn-icon" data-view="${c.id}" title="Ver detalle" data-testid="consultation-view-btn-${c.id}"><i class="bi bi-eye"></i></button></div></td></tr>`;
      }).join('');
    } catch (err) {
      UI.tableError(tbody, 6, err);
    }
  }

  async function loadPorAtender() {
    const sec = document.getElementById('porAtender');
    const body = document.getElementById('atenderBody');
    sec.classList.remove('d-none');
    try {
      const citas = (await API.get(`/citas?fecha=${hoy}`)).filter((c) => ['Pendiente', 'Confirmada', 'En consulta'].includes(c.estado));
      if (!citas.length) return UI.tableEmpty(body, 5, 'No tiene citas pendientes de atención hoy', 'calendar-check');
      body.innerHTML = citas.map((c) => `<tr><td class="cell-main">${c.hora_inicio}</td><td>${UI.esc(c.paciente_nombre)}</td><td>${UI.esc(c.motivo)}</td><td>${UI.badgeEstado(c.estado)}</td>
        <td class="text-end"><button class="btn btn-success btn-sm" data-atender="${c.id}" data-estado="${c.estado}" data-testid="consultation-attend-btn-${c.id}"><i class="bi bi-play-circle me-1"></i>${c.estado === 'En consulta' ? 'Continuar' : 'Atender'}</button></td></tr>`).join('');
    } catch (err) {
      UI.tableError(body, 5, err);
    }
  }

  async function openRegistro(citaId) {
    const sec = document.getElementById('registroSection');
    try {
      const cita = await API.get(`/citas/${citaId}`);
      if (cita.consulta_id) {
        UI.toast('Esta cita ya tiene una consulta registrada', 'info');
        return view(cita.consulta_id);
      }
      if (!['Confirmada', 'En consulta', 'Pendiente'].includes(cita.estado)) {
        return UI.toast(`La cita está en estado "${cita.estado}" y no puede atenderse`, 'warning');
      }
      if (cita.estado === 'Pendiente') await API.patch(`/citas/${cita.id}/estado`, { estado: 'En consulta' });
      const p = await API.get(`/pacientes/${cita.paciente_id}`);
      sec.classList.remove('d-none');
      document.getElementById('porAtender').classList.add('d-none');
      document.getElementById('histLink').href = `/pages/historial.html?paciente_id=${p.id}`;
      document.getElementById('citaInfo').textContent = `Cita #${cita.id} · ${UI.fmtDate(cita.fecha)} ${cita.hora_inicio}`;
      document.getElementById('pacienteInfo').innerHTML = `
        <div class="d-flex align-items-center gap-2 mb-3"><span class="avatar">${UI.esc(UI.initials(p.nombres + ' ' + p.apellidos))}</span>
          <div><div class="cell-main" data-testid="consultation-patient-name">${UI.esc(p.nombres)} ${UI.esc(p.apellidos)}</div><div class="cell-sub">${p.edad} años · ${UI.SEXO[p.sexo]} · ${UI.esc(p.cedula || 'Sin cédula')}</div></div></div>
        <div class="alert-allergy mb-3" data-testid="consultation-patient-allergies"><i class="bi bi-exclamation-triangle me-1"></i><strong>Alergias:</strong> ${UI.esc(p.alergias || 'No registradas')}</div>
        <div class="info-tile mb-2"><span class="label-caps">Antecedentes médicos</span>${UI.esc(p.antecedentes || 'Sin antecedentes registrados')}</div>
        <div class="info-tile"><span class="label-caps">Motivo de la cita</span>${UI.esc(cita.motivo)}</div>`;
      form.reset();
      UI.fillForm(form, { cita_id: cita.id, motivo: cita.motivo });
      diagList.innerHTML = diagRow(0);
      sec.scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      UI.errorToast(err);
    }
  }

  document.getElementById('addDiag').addEventListener('click', () => {
    const n = diagList.querySelectorAll('[data-diag]').length;
    if (n >= 10) return UI.toast('Máximo 10 diagnósticos', 'warning');
    diagList.insertAdjacentHTML('beforeend', diagRow(n));
  });
  diagList.addEventListener('click', (e) => {
    const rm = e.target.closest('[data-rm]');
    if (rm) rm.closest('[data-diag]').remove();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const diagError = document.getElementById('diagError');
    diagError.classList.add('d-none');
    const ok = UI.validateForm(form);
    const diagnosticos = [...diagList.querySelectorAll('[data-diag]')].map((r) => ({
      descripcion: r.querySelector('[data-f="descripcion"]').value.trim(),
      codigo_cie10: r.querySelector('[data-f="codigo_cie10"]').value.trim(),
      tipo: r.querySelector('[data-f="tipo"]').value,
    })).filter((d) => d.descripcion);
    if (!diagnosticos.length) {
      diagError.textContent = 'Debe registrar al menos un diagnóstico';
      diagError.classList.remove('d-none');
      return;
    }
    if (!ok) return;
    const btn = form.querySelector('[type="submit"]');
    UI.setLoading(btn, true);
    try {
      const data = UI.formData(form);
      data.cita_id = Number(data.cita_id);
      data.diagnosticos = diagnosticos;
      const c = await API.post('/consultas', data);
      UI.toast('Consulta registrada. La cita fue marcada como Completada.');
      setTimeout(() => { window.location.href = `/pages/historial.html?paciente_id=${c.paciente_id}`; }, 900);
    } catch (err) {
      UI.showFormErrors(form, err);
      if (err.detalles && err.detalles.diagnosticos) {
        diagError.textContent = err.detalles.diagnosticos;
        diagError.classList.remove('d-none');
      }
      UI.setLoading(btn, false);
    }
  });

  tbody.addEventListener('click', (e) => {
    const b = e.target.closest('[data-view]');
    if (b) view(Number(b.dataset.view));
  });
  document.getElementById('atenderBody').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-atender]');
    if (!b) return;
    openRegistro(Number(b.dataset.atender));
  });

  App.ready.then((s) => {
    user = s.usuario;
    hoy = s.hoy;
    const citaId = UI.param('cita_id');
    if (user.rol === 'dermatologo') {
      if (citaId) openRegistro(Number(citaId));
      else loadPorAtender();
    }
    if (UI.param('ver')) view(Number(UI.param('ver')));
    document.getElementById('fQ').addEventListener('input', UI.debounce(load, 300));
    ['fDesde', 'fHasta'].forEach((id) => document.getElementById(id).addEventListener('change', load));
    load();
  });
})();
