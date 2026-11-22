/* DermaCare — Dashboard administrativo (datos reales vía API) */
(function () {
  const COLORS = { navy: '#0A2540', blue: '#0284C7', sky: '#38BDF8', green: '#059669', amber: '#F59E0B', violet: '#7C3AED', red: '#DC2626' };
  const ESTADO_COLORS = { Pendiente: COLORS.amber, Confirmada: COLORS.blue, 'En consulta': COLORS.violet, Completada: COLORS.green, Cancelada: COLORS.red };
  const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const charts = {};

  Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
  Chart.defaults.color = '#64748B';
  Chart.defaults.plugins.tooltip.backgroundColor = COLORS.navy;
  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.plugins.tooltip.cornerRadius = 8;

  function draw(id, config) {
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(document.getElementById(id), config);
  }

  const grid = { color: '#EEF2F7' };
  const ACCION_ICON = { CREAR: 'plus-circle', EDITAR: 'pencil', CANCELAR: 'x-circle', REPROGRAMAR: 'arrow-repeat', ESTADO: 'flag', DESACTIVAR: 'slash-circle', ACTIVAR: 'check-circle', REPORTE: 'file-earmark-arrow-down', EDITAR_HORARIO: 'clock' };

  async function loadKpis() {
    const s = await API.get('/dashboard/estadisticas');
    document.querySelectorAll('[data-kpi]').forEach((el) => { el.textContent = s[el.dataset.kpi]; });
  }

  async function loadCharts() {
    const [mensual, estados, consultas, actividad] = await Promise.all([
      API.get('/dashboard/citas-mensuales'),
      API.get('/dashboard/citas-estado'),
      API.get('/dashboard/consultas-periodo'),
      API.get('/dashboard/actividad'),
    ]);

    draw('chartMensual', {
      type: 'bar',
      data: {
        labels: mensual.map((m) => `${MESES[Number(m.mes.slice(5)) - 1]} ${m.mes.slice(2, 4)}`),
        datasets: [
          { label: 'Total', data: mensual.map((m) => m.total), backgroundColor: COLORS.blue, borderRadius: 6, maxBarThickness: 26 },
          { label: 'Completadas', data: mensual.map((m) => m.completadas), backgroundColor: COLORS.green, borderRadius: 6, maxBarThickness: 26 },
          { label: 'Canceladas', data: mensual.map((m) => m.canceladas), backgroundColor: '#FCA5A5', borderRadius: 6, maxBarThickness: 26 },
        ],
      },
      options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { precision: 0 }, grid } } },
    });

    draw('chartEstado', {
      type: 'doughnut',
      data: { labels: estados.map((e) => e.estado), datasets: [{ data: estados.map((e) => e.total), backgroundColor: estados.map((e) => ESTADO_COLORS[e.estado]), borderWidth: 2, borderColor: '#fff' }] },
      options: { maintainAspectRatio: false, cutout: '66%', plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } } } },
    });

    draw('chartConsultas', {
      type: 'line',
      data: {
        labels: consultas.map((c) => UI.fmtDate(c.semana).slice(0, 6)),
        datasets: [{ label: 'Consultas', data: consultas.map((c) => c.total), borderColor: COLORS.green, backgroundColor: 'rgba(5,150,105,.12)', fill: true, tension: .35, pointRadius: 3 }],
      },
      options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { precision: 0 }, grid } } },
    });

    draw('chartActividad', {
      type: 'line',
      data: {
        labels: actividad.serie.map((d) => UI.fmtDate(d.dia).slice(0, 6)),
        datasets: [
          { label: 'Citas agendadas', data: actividad.serie.map((d) => d.citas_agendadas), borderColor: COLORS.blue, backgroundColor: COLORS.blue, tension: .35, pointRadius: 3 },
          { label: 'Consultas', data: actividad.serie.map((d) => d.consultas), borderColor: COLORS.green, backgroundColor: COLORS.green, tension: .35, pointRadius: 3 },
        ],
      },
      options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { precision: 0 }, grid } } },
    });

    const rec = document.getElementById('recientes');
    rec.innerHTML = actividad.recientes.length
      ? actividad.recientes.map((a) => `<div class="activity-item"><span class="activity-icon"><i class="bi bi-${ACCION_ICON[a.accion] || 'dot'}"></i></span>
          <div><div><strong>${UI.esc(a.usuario || 'Sistema')}</strong> · ${UI.esc(a.accion.toLowerCase().replace('_', ' '))} en ${UI.esc(a.entidad)}</div>
          <div class="cell-sub">${UI.esc(a.detalle || '')} · ${UI.fmtDateTime(a.fecha)}</div></div></div>`).join('')
      : '<div class="empty-state"><i class="bi bi-inbox"></i>Sin actividad registrada</div>';
  }

  async function loadProximas() {
    const tbody = document.getElementById('proximasBody');
    UI.tableLoading(tbody, 5);
    try {
      const citas = await API.get('/dashboard/proximas-citas');
      if (!citas.length) return UI.tableEmpty(tbody, 5, 'No hay próximas citas', 'calendar-x');
      tbody.innerHTML = citas.map((c) => `<tr data-testid="upcoming-row-${c.id}">
        <td><div class="cell-main">${UI.fmtDate(c.fecha)}</div><div class="cell-sub">${c.hora_inicio} – ${c.hora_fin}</div></td>
        <td>${UI.esc(c.paciente_nombre)}</td><td>${UI.esc(c.dermatologo_nombre)}</td>
        <td class="text-truncate" style="max-width:200px">${UI.esc(c.motivo)}</td><td>${UI.badgeEstado(c.estado)}</td></tr>`).join('');
    } catch (err) {
      UI.tableError(tbody, 5, err);
    }
  }

  async function loadAll() {
    try {
      await Promise.all([loadKpis(), loadCharts(), loadProximas()]);
    } catch (err) {
      UI.errorToast(err, 'No se pudo cargar el dashboard');
    }
  }

  App.ready.then(() => {
    loadAll();
    document.getElementById('refreshBtn').addEventListener('click', loadAll);
  });
})();
