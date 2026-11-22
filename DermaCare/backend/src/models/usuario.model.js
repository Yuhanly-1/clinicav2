const { query } = require('../config/database');

const BASE = `
  SELECT u.id, u.nombre, u.email, u.activo, u.ultimo_acceso, u.creado_en,
         r.codigo AS rol, r.nombre AS rol_nombre,
         d.id AS dermatologo_id, (d.nombres || ' ' || d.apellidos) AS dermatologo_nombre
    FROM usuarios u
    JOIN roles r ON r.id = u.rol_id
    LEFT JOIN dermatologos d ON d.usuario_id = u.id`;

async function findByEmailWithHash(email) {
  const { rows } = await query(
    `SELECT u.id, u.nombre, u.email, u.activo, u.password_hash, r.codigo AS rol, r.nombre AS rol_nombre
       FROM usuarios u JOIN roles r ON r.id = u.rol_id
      WHERE lower(u.email) = lower($1)`,
    [email]
  );
  return rows[0] || null;
}

async function list({ q, rol, estado, sinDermatologo }) {
  const where = [];
  const params = [];
  if (q) {
    params.push(`%${q}%`);
    where.push(`(u.nombre ILIKE $${params.length} OR u.email ILIKE $${params.length})`);
  }
  if (rol) {
    params.push(rol);
    where.push(`r.codigo = $${params.length}`);
  }
  if (estado === 'activo') where.push('u.activo = TRUE');
  if (estado === 'inactivo') where.push('u.activo = FALSE');
  if (sinDermatologo) where.push('d.id IS NULL');
  const sql = `${BASE} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY u.nombre`;
  return (await query(sql, params)).rows;
}

async function findById(id) {
  const { rows } = await query(`${BASE} WHERE u.id = $1`, [id]);
  return rows[0] || null;
}

async function create({ nombre, email, passwordHash, rol }) {
  const { rows } = await query(
    `INSERT INTO usuarios (nombre, email, password_hash, rol_id)
     VALUES ($1, $2, $3, (SELECT id FROM roles WHERE codigo = $4)) RETURNING id`,
    [nombre, email, passwordHash, rol]
  );
  return findById(rows[0].id);
}

async function update(id, { nombre, email, rol, passwordHash }) {
  const { rowCount } = await query(
    `UPDATE usuarios SET nombre = $2, email = $3,
            rol_id = (SELECT id FROM roles WHERE codigo = $4),
            password_hash = COALESCE($5, password_hash),
            actualizado_en = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [id, nombre, email, rol, passwordHash || null]
  );
  return rowCount ? findById(id) : null;
}

async function setActivo(id, activo) {
  const { rowCount } = await query(
    'UPDATE usuarios SET activo = $2, actualizado_en = CURRENT_TIMESTAMP WHERE id = $1',
    [id, activo]
  );
  return rowCount ? findById(id) : null;
}

async function touchLogin(id) {
  await query('UPDATE usuarios SET ultimo_acceso = CURRENT_TIMESTAMP WHERE id = $1', [id]);
}

module.exports = { findByEmailWithHash, list, findById, create, update, setActivo, touchLogin };
