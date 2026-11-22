/* DermaCare — Descarga de reportes Excel/PDF */
(function () {
  const EXT = { pacientes: 'xlsx', dermatologos: 'xlsx', citas: 'xlsx', consultas: 'pdf', actividad: 'pdf' };

  function params(tipo) {
    const desde = document.getElementById('fDesde').value;
    const hasta = document.getElementById('fHasta').value;
    if (desde && hasta && desde > hasta) throw new Error('La fecha "Desde" no puede ser posterior a "Hasta"');
    const p = {};
    if (tipo !== 'dermatologos') Object.assign(p, { desde, hasta });
    if (tipo === 'citas') p.estado = document.getElementById('fEstadoCita').value;
    if (tipo === 'pacientes' || tipo === 'dermatologos') p.estado = document.getElementById('fEstado').value;
    return p;
  }

  App.ready.then(() => {
    document.querySelectorAll('[data-report]').forEach((btn) => btn.addEventListener('click', async () => {
      const tipo = btn.dataset.report;
      let p;
      try { p = params(tipo); } catch (err) { return UI.toast(err.message, 'warning'); }
      UI.setLoading(btn, true, 'Generando...');
      try {
        await API.download(`/reportes/${tipo}${API.qs(p)}`, `${tipo}.${EXT[tipo]}`);
        UI.toast('Reporte generado y descargado');
      } catch (err) {
        UI.errorToast(err, 'No se pudo generar el reporte');
      } finally {
        UI.setLoading(btn, false);
      }
    }));
  });
})();
