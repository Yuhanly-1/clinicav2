const { query } = require('../config/database');
const { asyncHandler } = require('../utils/httpError');
const citaModel = require('../models/cita.model');

/** KPIs calculados con SQL sobre datos reales. */
const estadisticas = asyncHandler(async (req, res) => {
  const { rows } = await query(`
    SELECT
      (SELECT COUNT(*) FROM pacientes WHERE activo)                                     AS total_pacientes,
      (SELECT COUNT(*) FROM dermatologos WHERE activo)                                  AS dermatologos_activos,
      (SELECT COUNT(*) FROM citas WHERE fecha_inicio::date = CURRENT_DATE AND estado <> 'Cancelada') AS citas_hoy,
      (SELECT COUNT(*) FROM citas WHERE estado = 'Pendiente')                           AS citas_pendientes,
      (SELECT COUNT(*) FROM consultas)                                                  AS consultas_completadas,
      (SELECT COUNT(*) FROM citas WHERE estado = 'Cancelada')                           AS citas_canceladas,
      (SELECT COUNT(*) FROM usuarios WHERE activo)                                      AS usuarios_activos,
      CURRENT_DATE::text AS hoy`);
  res.json(rows[0]);
});

/** Citas por mes (últimos 12 meses), separadas por completadas y canceladas. */
const citasMensuales = asyncHandler(async (req, res) => {
  const { rows } = await query(`
    SELECT to_char(m.mes, 'YYYY-MM') AS mes,
           COUNT(c.id)::int AS total,
           COUNT(c.id) FILTER (WHERE c.estado = 'Completada')::int AS completadas,
           COUNT(c.id) FILTER (WHERE c.estado = 'Cancelada')::int AS canceladas
      FROM generate_series(date_trunc('month', CURRENT_DATE) - INTERVAL '11 months',
                           date_trunc('month', CURRENT_DATE), INTERVAL '1 month') AS m(mes)
      LEFT JOIN citas c ON date_trunc('month', c.fecha_inicio) = m.mes
     GROUP BY m.mes ORDER BY m.mes`);
  res.json(rows);
});

const citasPorEstado = asyncHandler(async (req, res) => {
  const { rows } = await query(`
    SELECT e.estado, COUNT(c.id)::int AS total
      FROM (VALUES ('Pendiente'), ('Confirmada'), ('En consulta'), ('Completada'), ('Cancelada')) AS e(estado)
      LEFT JOIN citas c ON c.estado = e.estado
     GROUP BY e.estado
     ORDER BY array_position(ARRAY['Pendiente','Confirmada','En consulta','Completada','Cancelada'], e.estado)`);
  res.json(rows);
});

/** Consultas por semana (últimas 12 semanas). */
const consultasPeriodo = asyncHandler(async (req, res) => {
  const { rows } = await query(`
    SELECT to_char(s.semana, 'YYYY-MM-DD') AS semana, COUNT(con.id)::int AS total
      FROM generate_series(date_trunc('week', CURRENT_DATE) - INTERVAL '11 weeks',
                           date_trunc('week', CURRENT_DATE), INTERVAL '1 week') AS s(semana)
      LEFT JOIN consultas con ON date_trunc('week', con.fecha_atencion) = s.semana
     GROUP BY s.semana ORDER BY s.semana`);
  res.json(rows);
});

/** Actividad de la clínica: citas agendadas y consultas por día (últimos 14 días) + últimas acciones. */
const actividad = asyncHandler(async (req, res) => {
  const serie = await query(`
    SELECT to_char(d.dia, 'YYYY-MM-DD') AS dia,
           (SELECT COUNT(*) FROM citas c WHERE c.creado_en::date = d.dia)::int AS citas_agendadas,
           (SELECT COUNT(*) FROM consultas con WHERE con.fecha_atencion::date = d.dia)::int AS consultas
      FROM generate_series(CURRENT_DATE - 13, CURRENT_DATE, INTERVAL '1 day') AS d(dia)
     ORDER BY d.dia`);
  const recientes = await query(`
    SELECT a.id, a.accion, a.entidad, a.entidad_id, a.detalle, a.fecha, u.nombre AS usuario
      FROM auditoria a LEFT JOIN usuarios u ON u.id = a.usuario_id
     WHERE a.accion <> 'LOGIN' AND a.accion <> 'VER_HISTORIAL'
     ORDER BY a.fecha DESC LIMIT 8`);
  res.json({ serie: serie.rows, recientes: recientes.rows });
});

const proximasCitas = asyncHandler(async (req, res) => {
  const { rows } = await query('SELECT CURRENT_DATE::text AS hoy');
  const citas = await citaModel.list(null, { desde: rows[0].hoy, limit: 8 });
  res.json(citas.filter((c) => !['Cancelada', 'Completada'].includes(c.estado)));
});

/** Notificaciones del usuario conectado (citas del día pendientes de atención). */
const notificaciones = asyncHandler(async (req, res) => {
  const { rows } = await query('SELECT CURRENT_DATE::text AS hoy');
  const citas = await citaModel.list(req.user, { fecha: rows[0].hoy });
  const items = [];
  const pendientes = citas.filter((c) => c.estado === 'Pendiente');
  const confirmadas = citas.filter((c) => c.estado === 'Confirmada');
  const enConsulta = citas.filter((c) => c.estado === 'En consulta');
  if (pendientes.length) items.push({ tipo: 'warning', texto: `${pendientes.length} cita(s) de hoy pendientes de confirmar` });
  if (confirmadas.length) items.push({ tipo: 'info', texto: `${confirmadas.length} cita(s) confirmadas para hoy` });
  if (enConsulta.length) items.push({ tipo: 'primary', texto: `${enConsulta.length} paciente(s) en consulta ahora` });
  res.json({ total: pendientes.length + enConsulta.length, items });
});

module.exports = { estadisticas, citasMensuales, citasPorEstado, consultasPeriodo, actividad, proximasCitas, notificaciones };
