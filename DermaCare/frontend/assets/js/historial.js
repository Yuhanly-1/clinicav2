/* DermaCare — Historial médico del paciente */
(function () {
  const cont = document.getElementById('historial');
  const input = document.getElementById('buscar');
  const results = document.getElementById('resultados');

  function render(h) {
    const p = h.paciente;
    const tile = (l, v) => `<div class="col-6 col-md-4 col-xl-2"><div class="info-tile"><span class="label-caps">${l}</span>${UI.esc(v || '—')}</div></div>`;
    const citasSinConsulta = h.citas.filter((c) => !h.consultas.some((con) => con.cita_id === c.id));
    const timeline = h.consultas.length
      ? h.consultas.map((c) => `<div class="tl-item" data-testid="history-consultation-${c.id}">
          <div class="dc-card dc-card-body">
            <div class="d-flex justify-content-between flex-wrap gap-2 mb-2"><div><div class="tl-date">${UI.fmtDateTime(c.fecha_atencion)}</div>
              <div class="cell-main">${UI.esc(c.motivo)}</div></div><div class="small text-muted"><i class="bi bi-person-badge me-1"></i>${UI.esc(c.dermatologo_nombre)}</div></div>
            <div class="mb-2">${c.diagnosticos.map((d) => `<span class="badge ${d.tipo === 'Principal' ? 'text-bg-primary' : 'text-bg-secondary'} me-1 mb-1">${d.codigo_cie10 ? UI.esc(d.codigo_cie10) + ' · ' : ''}${UI.esc(d.descripcion)}</span>`).join('')}</div>
            <div class="row g-2 small">
              <div class="col-md-6"><span class="label-caps d-block">Síntomas</span>${UI.esc(c.sintomas)}</div>
              <div class="col-md-6"><span class="label-caps d-block">Examen dermatológico</span>${UI.esc(c.examen_dermatologico)}</div>
              <div class="col-md-6"><span class="label-caps d-block">Tratamiento</span><span class="text-success fw-medium">${UI.esc(c.tratamiento)}</span></div>
              ${c.observaciones ? `<div class="col-md-6"><span class="label-caps d-block">Observaciones</span>${UI.esc(c.observaciones)}</div>` : ''}
            </div></div></div>`).join('')
      : '<div class="empty-state"><i class="bi bi-clipboard2"></i>El paciente aún no tiene consultas registradas.</div>';

    cont.innerHTML = `
      <div class="dc-card dc-card-body mb-3">
        <div class="d-flex align-items-center gap-3 flex-wrap mb-3">
          <span class="avatar" style="width:56px;height:56px;font-size:1.1rem">${UI.esc(UI.initials(p.nombres + ' ' + p.apellidos))}</span>
          <div class="me-auto"><h2 class="h4 mb-0 font-heading" data-testid="history-patient-name">${UI.esc(p.nombres)} ${UI.esc(p.apellidos)}</h2>
            <div class="text-muted small">Paciente #${p.id} · Registrado el ${UI.fmtDate(p.fecha_registro)} · ${UI.badgeActivo(p.activo)}</div></div>
          <div class="d-flex gap-3 text-center">
            <div><div class="kpi-value mt-0 fs-3" data-testid="history-total-consultas">${h.consultas.length}</div><div class="kpi-label">Consultas</div></div>
            <div><div class="kpi-value mt-0 fs-3" data-testid="history-total-citas">${h.citas.length}</div><div class="kpi-label">Citas</div></div>
          </div>
        </div>
        <div class="row g-2 mb-3">${tile('Cédula', p.cedula)}${tile('Edad', p.edad + ' años')}${tile('Sexo', UI.SEXO[p.sexo])}${tile('Nacimiento', UI.fmtDate(p.fecha_nacimiento))}${tile('Teléfono', p.telefono)}${tile('Correo', p.email)}</div>
        <div class="row g-2">
          <div class="col-md-6"><div class="alert-allergy h-100" data-testid="history-allergies"><i class="bi bi-exclamation-triangle me-1"></i><strong>Alergias:</strong> ${UI.esc(p.alergias || 'No registradas')}</div></div>
          <div class="col-md-6"><div class="info-tile" data-testid="history-antecedentes"><span class="label-caps">Antecedentes médicos</span>${UI.esc(p.antecedentes || 'Sin antecedentes registrados')}</div></div>
        </div>
      </div>
      <div class="row g-3">
        <div class="col-xl-8"><h3 class="h5 font-heading mb-3"><i class="bi bi-clipboard2-pulse me-2 text-success"></i>Consultas, diagnósticos y tratamientos</h3><div class="timeline">${timeline}</div></div>
        <div class="col-xl-4"><div class="dc-card"><div class="dc-card-header"><h2><i class="bi bi-calendar2-week me-2 text-primary"></i>Citas sin consulta</h2></div>
          <div class="dc-card-body py-2" data-testid="history-appointments">${citasSinConsulta.length ? citasSinConsulta.map((c) => `<div class="activity-item"><div class="flex-grow-1">
            <div class="d-flex justify-content-between"><strong>${UI.fmtDateTime(c.fecha_inicio)}</strong>${UI.badgeEstado(c.estado)}</div>
            <div class="cell-sub">${UI.esc(c.motivo)} · ${UI.esc(c.dermatologo_nombre)}</div></div></div>`).join('') : '<div class="text-muted small py-2">No hay citas adicionales.</div>'}</div></div></div>
      </div>`;
  }

  async function load(id) {
    cont.innerHTML = '<div class="dc-card"><div class="loading-overlay"><span class="spinner-border spinner-border-sm"></span> Cargando historial...</div></div>';
    try {
      render(await API.get(`/pacientes/${id}/historial`));
      history.replaceState(null, '', `?paciente_id=${id}`);
    } catch (err) {
      cont.innerHTML = `<div class="dc-card"><div class="empty-state text-danger"><i class="bi bi-shield-exclamation"></i>${UI.esc(err.message)}</div></div>`;
    }
  }

  const search = UI.debounce(async () => {
    const q = input.value.trim();
    if (q.length < 2) return results.classList.remove('show');
    try {
      const ps = await API.get('/pacientes' + API.qs({ q, limit: 8 }));
      results.innerHTML = ps.length
        ? ps.map((p) => `<button class="dropdown-item" data-id="${p.id}" data-testid="history-result-${p.id}">${UI.esc(p.nombres)} ${UI.esc(p.apellidos)} <span class="text-muted small">${UI.esc(p.cedula || '')}</span></button>`).join('')
        : '<span class="dropdown-item-text text-muted small">Sin resultados</span>';
      results.classList.add('show');
    } catch (err) {
      UI.errorToast(err);
    }
  }, 250);

  App.ready.then(() => {
    input.addEventListener('input', search);
    results.addEventListener('click', (e) => {
      const b = e.target.closest('[data-id]');
      if (!b) return;
      results.classList.remove('show');
      input.value = '';
      load(Number(b.dataset.id));
    });
    document.addEventListener('click', (e) => { if (!results.contains(e.target) && e.target !== input) results.classList.remove('show'); });
    if (UI.param('paciente_id')) load(Number(UI.param('paciente_id')));
  });
})();
