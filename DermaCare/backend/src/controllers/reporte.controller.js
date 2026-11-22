const { query } = require('../config/database');
const { asyncHandler, badRequest } = require('../utils/httpError');
const { isValidDate, parseId } = require('../utils/validators');
const citaModel = require('../models/cita.model');
const consultaModel = require('../models/consulta.model');
const R = require('../services/reporte.service');
const { audit } = require('../utils/audit');
const { ESTADOS } = require('./cita.controller');

function rango(q) {
  const out = {};
  for (const k of ['desde', 'hasta']) {
    if (q[k]) {
      if (!isValidDate(q[k])) throw badRequest(`Fecha "${k}" inválida`);
      out[k] = q[k];
    }
  }
  if (out.desde && out.hasta && out.desde > out.hasta) throw badRequest('La fecha inicial no puede ser posterior a la final');
  return out;
}

const describe = (f) =>
  Object.entries(f).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(' · ') || 'Sin filtros';

const SEXO = { M: 'Masculino', F: 'Femenino', O: 'Otro' };

const pacientes = asyncHandler(async (req, res) => {
  const f = rango(req.query);
  const params = [];
  const where = [];
  if (f.desde) { params.push(f.desde); where.push(`fecha_registro::date >= $${params.length}`); }
  if (f.hasta) { params.push(f.hasta); where.push(`fecha_registro::date <= $${params.length}`); }
  if (req.query.estado === 'activo') where.push('activo = TRUE');
  if (req.query.estado === 'inactivo') where.push('activo = FALSE');
  const { rows } = await query(
    `SELECT id, nombres, apellidos, cedula, fecha_nacimiento, sexo, telefono, email, direccion, alergias,
            to_char(fecha_registro, 'YYYY-MM-DD') AS fecha_registro, CASE WHEN activo THEN 'Activo' ELSE 'Inactivo' END AS estado
       FROM pacientes ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY apellidos, nombres`,
    params
  );
  rows.forEach((r) => { r.sexo = SEXO[r.sexo]; });
  const wb = await R.buildExcel({
    titulo: 'Reporte de pacientes',
    filtros: describe({ ...f, estado: req.query.estado }),
    usuario: req.user.nombre,
    rows,
    columns: [
      { header: 'ID', key: 'id', width: 7 }, { header: 'Nombres', key: 'nombres', width: 18 },
      { header: 'Apellidos', key: 'apellidos', width: 20 }, { header: 'Cédula', key: 'cedula', width: 16 },
      { header: 'Nacimiento', key: 'fecha_nacimiento', width: 13 }, { header: 'Sexo', key: 'sexo', width: 11 },
      { header: 'Teléfono', key: 'telefono', width: 15 }, { header: 'Correo', key: 'email', width: 28 },
      { header: 'Dirección', key: 'direccion', width: 30 }, { header: 'Alergias', key: 'alergias', width: 20 },
      { header: 'Registro', key: 'fecha_registro', width: 12 }, { header: 'Estado', key: 'estado', width: 10 },
    ],
  });
  await audit(req, 'REPORTE', 'pacientes', null, `${rows.length} registros`);
  await R.sendExcel(res, `pacientes_${await R.serverToday()}.xlsx`, wb);
});

const dermatologos = asyncHandler(async (req, res) => {
  const where = [];
  if (req.query.estado === 'activo') where.push('d.activo = TRUE');
  if (req.query.estado === 'inactivo') where.push('d.activo = FALSE');
  const { rows } = await query(
    `SELECT d.id, d.nombres, d.apellidos, d.exequatur, d.especialidad, d.telefono, d.email,
            COALESCE(u.email, '—') AS usuario,
            CASE WHEN d.activo THEN 'Activo' ELSE 'Inactivo' END AS estado,
            (SELECT COUNT(*) FROM citas c WHERE c.dermatologo_id = d.id)::int AS total_citas,
            (SELECT COUNT(*) FROM consultas con WHERE con.dermatologo_id = d.id)::int AS total_consultas
       FROM dermatologos d LEFT JOIN usuarios u ON u.id = d.usuario_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY d.apellidos`
  );
  const wb = await R.buildExcel({
    titulo: 'Reporte de dermatólogos',
    filtros: describe({ estado: req.query.estado }),
    usuario: req.user.nombre,
    rows,
    columns: [
      { header: 'ID', key: 'id', width: 7 }, { header: 'Nombres', key: 'nombres' }, { header: 'Apellidos', key: 'apellidos', width: 20 },
      { header: 'Exequátur', key: 'exequatur', width: 14 }, { header: 'Especialidad', key: 'especialidad', width: 26 },
      { header: 'Teléfono', key: 'telefono', width: 15 }, { header: 'Correo', key: 'email', width: 30 },
      { header: 'Usuario', key: 'usuario', width: 30 }, { header: 'Estado', key: 'estado', width: 10 },
      { header: 'Citas', key: 'total_citas', width: 8 }, { header: 'Consultas', key: 'total_consultas', width: 10 },
    ],
  });
  await audit(req, 'REPORTE', 'dermatologos', null, `${rows.length} registros`);
  await R.sendExcel(res, `dermatologos_${await R.serverToday()}.xlsx`, wb);
});

const citas = asyncHandler(async (req, res) => {
  const f = rango(req.query);
  if (req.query.estado) {
    if (!ESTADOS.includes(req.query.estado)) throw badRequest('Estado inválido');
    f.estado = req.query.estado;
  }
  if (req.query.dermatologo_id) f.dermatologo_id = parseId(req.query.dermatologo_id);
  const rows = await citaModel.list(null, { ...f, limit: 2000 });
  const wb = await R.buildExcel({
    titulo: 'Reporte de citas',
    filtros: describe(f),
    usuario: req.user.nombre,
    rows,
    columns: [
      { header: 'ID', key: 'id', width: 7 }, { header: 'Fecha', key: 'fecha', width: 12 },
      { header: 'Inicio', key: 'hora_inicio', width: 8 }, { header: 'Fin', key: 'hora_fin', width: 8 },
      { header: 'Paciente', key: 'paciente_nombre', width: 28 }, { header: 'Cédula', key: 'paciente_cedula', width: 16 },
      { header: 'Dermatólogo', key: 'dermatologo_nombre', width: 26 }, { header: 'Motivo', key: 'motivo', width: 32 },
      { header: 'Estado', key: 'estado', width: 13 }, { header: 'Motivo cancelación', key: 'motivo_cancelacion', width: 26 },
    ],
  });
  await audit(req, 'REPORTE', 'citas', null, `${rows.length} registros`);
  await R.sendExcel(res, `citas_${await R.serverToday()}.xlsx`, wb);
});

const consultas = asyncHandler(async (req, res) => {
  const f = rango(req.query);
  if (req.query.dermatologo_id) f.dermatologo_id = parseId(req.query.dermatologo_id);
  const rows = await consultaModel.list(null, { ...f, limit: 2000 });
  const doc = R.startPdf(res, `consultas_${await R.serverToday()}.pdf`, 'Reporte de consultas dermatológicas',
    `Generado por ${req.user.nombre} · ${describe(f)} · Total: ${rows.length}`);

  if (!rows.length) doc.font('Helvetica').fontSize(11).fillColor('#475569').text('No hay consultas para los filtros seleccionados.', 40);
  rows.forEach((c) => {
    R.ensureSpace(doc, 120);
    const top = doc.y;
    doc.roundedRect(40, top, doc.page.width - 80, 2, 1).fill('#E2E8F0');
    doc.moveDown(0.4);
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#0A2540')
      .text(`#${c.id} · ${c.paciente_nombre}`, 40, doc.y, { continued: true })
      .font('Helvetica').fillColor('#64748B').text(`   ${c.fecha_atencion.slice(0, 16)} · ${c.dermatologo_nombre}`);
    const diag = c.diagnosticos.map((d) => `${d.codigo_cie10 ? d.codigo_cie10 + ' ' : ''}${d.descripcion} (${d.tipo})`).join('; ');
    const line = (label, value) => {
      if (!value) return;
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#0F172A').text(`${label}: `, 50, doc.y, { continued: true, width: doc.page.width - 100 })
        .font('Helvetica').fillColor('#334155').text(value);
    };
    line('Motivo', c.motivo);
    line('Diagnóstico', diag);
    line('Tratamiento', c.tratamiento);
    line('Observaciones', c.observaciones);
    doc.moveDown(0.6);
  });
  await audit(req, 'REPORTE', 'consultas', null, `${rows.length} registros`);
  R.finishPdf(doc);
});

/** Reporte general de actividad en PDF (indicadores agregados con SQL). */
const actividad = asyncHandler(async (req, res) => {
  const f = rango(req.query);
  const desde = f.desde || '1900-01-01';
  const hasta = f.hasta || '2999-12-31';
  const p = [desde, hasta];
  const tot = (await query(
    `SELECT
       (SELECT COUNT(*) FROM pacientes WHERE fecha_registro::date BETWEEN $1 AND $2) AS pacientes_nuevos,
       (SELECT COUNT(*) FROM pacientes WHERE activo) AS pacientes_activos,
       (SELECT COUNT(*) FROM dermatologos WHERE activo) AS dermatologos_activos,
       (SELECT COUNT(*) FROM citas WHERE fecha_inicio::date BETWEEN $1 AND $2) AS citas,
       (SELECT COUNT(*) FROM consultas WHERE fecha_atencion::date BETWEEN $1 AND $2) AS consultas`, p)).rows[0];
  const porEstado = (await query(
    `SELECT estado, COUNT(*)::int AS total FROM citas WHERE fecha_inicio::date BETWEEN $1 AND $2 GROUP BY estado ORDER BY total DESC`, p)).rows;
  const porDerm = (await query(
    `SELECT (d.nombres || ' ' || d.apellidos) AS nombre,
            COUNT(c.id)::int AS citas,
            COUNT(con.id)::int AS consultas
       FROM dermatologos d
       LEFT JOIN citas c ON c.dermatologo_id = d.id AND c.fecha_inicio::date BETWEEN $1 AND $2
       LEFT JOIN consultas con ON con.cita_id = c.id
      GROUP BY d.id ORDER BY citas DESC`, p)).rows;
  const diags = (await query(
    `SELECT dg.descripcion, COUNT(*)::int AS total FROM diagnosticos dg JOIN consultas con ON con.id = dg.consulta_id
      WHERE con.fecha_atencion::date BETWEEN $1 AND $2 GROUP BY dg.descripcion ORDER BY total DESC LIMIT 8`, p)).rows;

  const doc = R.startPdf(res, `actividad_${await R.serverToday()}.pdf`, 'Reporte general de actividad',
    `Generado por ${req.user.nombre} · Período: ${f.desde || 'inicio'} a ${f.hasta || 'hoy'}`);
  R.sectionTitle(doc, 'Indicadores generales');
  R.kvTable(doc, [
    ['Pacientes registrados en el período', tot.pacientes_nuevos],
    ['Pacientes activos (total)', tot.pacientes_activos],
    ['Dermatólogos activos', tot.dermatologos_activos],
    ['Citas en el período', tot.citas],
    ['Consultas realizadas en el período', tot.consultas],
  ]);
  R.sectionTitle(doc, 'Citas por estado');
  R.kvTable(doc, porEstado.length ? porEstado.map((e) => [e.estado, e.total]) : [['Sin citas', 0]]);
  R.sectionTitle(doc, 'Actividad por dermatólogo (citas / consultas)');
  R.kvTable(doc, porDerm.map((d) => [d.nombre, `${d.citas} / ${d.consultas}`]));
  R.sectionTitle(doc, 'Diagnósticos más frecuentes');
  R.kvTable(doc, diags.length ? diags.map((d) => [d.descripcion, d.total]) : [['Sin diagnósticos', 0]]);
  await audit(req, 'REPORTE', 'actividad', null, describe(f));
  R.finishPdf(doc);
});

module.exports = { pacientes, dermatologos, citas, consultas, actividad };
