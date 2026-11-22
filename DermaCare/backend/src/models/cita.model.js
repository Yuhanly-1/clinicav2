const { query } = require('../config/database');

const SELECT = `
  SELECT c.id, c.paciente_id, c.dermatologo_id, c.fecha_inicio, c.fecha_fin,
         c.fecha_inicio::date::text AS fecha, to_char(c.fecha_inicio, 'HH24:MI') AS hora_inicio,
         to_char(c.fecha_fin, 'HH24:MI') AS hora_fin,
         (EXTRACT(EPOCH FROM (c.fecha_fin - c.fecha_inicio)) / 60)::int AS duracion,
         c.motivo, c.estado, c.motivo_cancelacion, c.creado_en,
         (p.nombres || ' ' || p.apellidos) AS paciente_nombre, p.cedula AS paciente_cedula, p.telefono AS paciente_telefono,
         (d.nombres || ' ' || d.apellidos) AS dermatologo_nombre, d.especialidad,
         con.id AS consulta_id
    FROM citas c
    JOIN pacientes p ON p.id = c.paciente_id
    JOIN dermatologos d ON d.id = c.dermatologo_id
    LEFT JOIN consultas con ON con.cita_id = c.id`;

function buildFilters(user, f) {
  const params = [];
  const where = [];
  const add = (sql, val) => {
    params.push(val);
    where.push(sql.replace('?', `$${params.length}`));
  };
  if (user && user.rol === 'dermatologo') add('c.dermatologo_id = ?', user.dermatologo_id || 0);
  if (f.dermatologo_id) add('c.dermatologo_id = ?', f.dermatologo_id);
  if (f.paciente_id) add('c.paciente_id = ?', f.paciente_id);
  if (f.estado) add('c.estado = ?', f.estado);
  if (f.fecha) add('c.fecha_inicio::date = ?::date', f.fecha);
  if (f.desde) add('c.fecha_inicio::date >= ?::date', f.desde);
  if (f.hasta) add('c.fecha_inicio::date <= ?::date', f.hasta);
  if (f.q) add(`((p.nombres || ' ' || p.apellidos) ILIKE ? )`, `%${f.q}%`);
  return { where: where.length ? 'WHERE ' + where.join(' AND ') : '', params };
}

async function list(user, filters, order = 'ASC') {
  const { where, params } = buildFilters(user, filters);
  params.push(Math.min(Number(filters.limit) || 500, 2000));
  const dir = order === 'DESC' ? 'DESC' : 'ASC';
  return (await query(`${SELECT} ${where} ORDER BY c.fecha_inicio ${dir} LIMIT $${params.length}`, params)).rows;
}

async function findById(id, runner = { query }) {
  const { rows } = await runner.query(`${SELECT} WHERE c.id = $1`, [id]);
  return rows[0] || null;
}

module.exports = { list, findById, buildFilters, SELECT };
