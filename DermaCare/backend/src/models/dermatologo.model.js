const { query, withTransaction } = require('../config/database');

const FIELDS = `d.id, d.nombres, d.apellidos, d.exequatur, d.especialidad, d.telefono, d.email,
  d.usuario_id, d.activo, d.creado_en, u.email AS usuario_email, u.nombre AS usuario_nombre,
  (SELECT COUNT(*) FROM citas c WHERE c.dermatologo_id = d.id
      AND c.fecha_inicio::date >= CURRENT_DATE AND c.estado <> 'Cancelada')::int AS citas_proximas`;

async function list({ q, estado }) {
  const params = [];
  let where = 'WHERE 1=1';
  if (q) {
    params.push(`%${q}%`);
    const i = params.length;
    where += ` AND (d.nombres ILIKE $${i} OR d.apellidos ILIKE $${i} OR d.exequatur ILIKE $${i} OR d.especialidad ILIKE $${i})`;
  }
  if (estado === 'activo') where += ' AND d.activo = TRUE';
  if (estado === 'inactivo') where += ' AND d.activo = FALSE';
  const sql = `SELECT ${FIELDS} FROM dermatologos d LEFT JOIN usuarios u ON u.id = d.usuario_id ${where} ORDER BY d.apellidos, d.nombres`;
  return (await query(sql, params)).rows;
}

async function findById(id) {
  const { rows } = await query(
    `SELECT ${FIELDS} FROM dermatologos d LEFT JOIN usuarios u ON u.id = d.usuario_id WHERE d.id = $1`,
    [id]
  );
  return rows[0] || null;
}

const COLS = ['nombres', 'apellidos', 'exequatur', 'especialidad', 'telefono', 'email', 'usuario_id'];

async function create(data) {
  const { rows } = await query(
    `INSERT INTO dermatologos (${COLS.join(', ')}) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    COLS.map((c) => data[c])
  );
  return rows[0].id;
}

async function update(id, data) {
  const sets = COLS.map((c, i) => `${c} = $${i + 2}`).join(', ');
  const { rowCount } = await query(
    `UPDATE dermatologos SET ${sets}, actualizado_en = CURRENT_TIMESTAMP WHERE id = $1`,
    [id, ...COLS.map((c) => data[c])]
  );
  return rowCount > 0;
}

async function setActivo(id, activo) {
  const { rowCount } = await query(
    'UPDATE dermatologos SET activo = $2, actualizado_en = CURRENT_TIMESTAMP WHERE id = $1',
    [id, activo]
  );
  return rowCount > 0;
}

async function exequaturTaken(exequatur, excludeId = 0) {
  const { rows } = await query(
    'SELECT 1 FROM dermatologos WHERE upper(exequatur) = upper($1) AND id <> $2',
    [exequatur, excludeId]
  );
  return rows.length > 0;
}

async function validUsuarioDermatologo(usuarioId, excludeId = 0) {
  const { rows } = await query(
    `SELECT u.id, r.codigo,
            (SELECT id FROM dermatologos WHERE usuario_id = u.id AND id <> $2) AS ocupado_por
       FROM usuarios u JOIN roles r ON r.id = u.rol_id WHERE u.id = $1`,
    [usuarioId, excludeId]
  );
  return rows[0] || null;
}

async function getHorarios(dermatologoId) {
  const { rows } = await query(
    `SELECT id, dia_semana, to_char(hora_inicio, 'HH24:MI') AS hora_inicio, to_char(hora_fin, 'HH24:MI') AS hora_fin
       FROM horarios WHERE dermatologo_id = $1 ORDER BY dia_semana, hora_inicio`,
    [dermatologoId]
  );
  return rows;
}

/** Reemplaza el horario semanal completo en una transacción. */
async function replaceHorarios(dermatologoId, bloques) {
  return withTransaction(async (client) => {
    await client.query('DELETE FROM horarios WHERE dermatologo_id = $1', [dermatologoId]);
    for (const b of bloques) {
      await client.query(
        'INSERT INTO horarios (dermatologo_id, dia_semana, hora_inicio, hora_fin) VALUES ($1, $2, $3, $4)',
        [dermatologoId, b.dia_semana, b.hora_inicio, b.hora_fin]
      );
    }
  });
}

module.exports = {
  list, findById, create, update, setActivo, exequaturTaken, validUsuarioDermatologo, getHorarios, replaceHorarios,
};
