const { query } = require('../config/database');

const FIELDS = `p.id, p.nombres, p.apellidos, p.cedula, p.fecha_nacimiento, p.sexo, p.telefono, p.email,
  p.direccion, p.antecedentes, p.alergias, p.fecha_registro, p.activo,
  date_part('year', age(CURRENT_DATE, p.fecha_nacimiento))::int AS edad`;

/** Restricción de visibilidad: un dermatólogo solo ve pacientes con citas asignadas a él. */
function scope(user, params) {
  if (user.rol !== 'dermatologo') return '';
  params.push(user.dermatologo_id || 0);
  return ` AND EXISTS (SELECT 1 FROM citas c WHERE c.paciente_id = p.id AND c.dermatologo_id = $${params.length})`;
}

async function list(user, { q, campo, estado, sexo, limit }) {
  const params = [];
  let where = 'WHERE 1=1';
  if (q) {
    params.push(`%${q}%`);
    const i = params.length;
    const map = {
      nombre: `p.nombres ILIKE $${i}`,
      apellido: `p.apellidos ILIKE $${i}`,
      cedula: `p.cedula ILIKE $${i}`,
    };
    where += ` AND (${map[campo] || `p.nombres ILIKE $${i} OR p.apellidos ILIKE $${i} OR p.cedula ILIKE $${i} OR (p.nombres || ' ' || p.apellidos) ILIKE $${i}`})`;
  }
  if (estado === 'activo') where += ' AND p.activo = TRUE';
  if (estado === 'inactivo') where += ' AND p.activo = FALSE';
  if (sexo) {
    params.push(sexo);
    where += ` AND p.sexo = $${params.length}`;
  }
  where += scope(user, params);
  params.push(Math.min(Number(limit) || 500, 1000));
  const sql = `SELECT ${FIELDS} FROM pacientes p ${where} ORDER BY p.apellidos, p.nombres LIMIT $${params.length}`;
  return (await query(sql, params)).rows;
}

async function findById(user, id) {
  const params = [id];
  const sql = `SELECT ${FIELDS} FROM pacientes p WHERE p.id = $1 ${scope(user, params)}`;
  const { rows } = await query(sql, params);
  return rows[0] || null;
}

async function findDuplicate({ cedula, nombres, apellidos, fecha_nacimiento }, excludeId = 0) {
  const { rows } = await query(
    `SELECT id, cedula FROM pacientes
      WHERE id <> $5 AND (
        ($1::text IS NOT NULL AND cedula = $1)
        OR (lower(nombres) = lower($2) AND lower(apellidos) = lower($3) AND fecha_nacimiento = $4)
      ) LIMIT 1`,
    [cedula, nombres, apellidos, fecha_nacimiento, excludeId]
  );
  return rows[0] || null;
}

const COLS = ['nombres', 'apellidos', 'cedula', 'fecha_nacimiento', 'sexo', 'telefono', 'email', 'direccion', 'antecedentes', 'alergias'];

async function create(data) {
  const { rows } = await query(
    `INSERT INTO pacientes (${COLS.join(', ')}) VALUES (${COLS.map((_, i) => '$' + (i + 1)).join(', ')}) RETURNING id`,
    COLS.map((c) => data[c])
  );
  return rows[0].id;
}

async function update(id, data) {
  const sets = COLS.map((c, i) => `${c} = $${i + 2}`).join(', ');
  const { rowCount } = await query(
    `UPDATE pacientes SET ${sets}, actualizado_en = CURRENT_TIMESTAMP WHERE id = $1`,
    [id, ...COLS.map((c) => data[c])]
  );
  return rowCount > 0;
}

async function setActivo(id, activo) {
  const { rowCount } = await query(
    'UPDATE pacientes SET activo = $2, actualizado_en = CURRENT_TIMESTAMP WHERE id = $1',
    [id, activo]
  );
  return rowCount > 0;
}

module.exports = { list, findById, findDuplicate, create, update, setActivo };
