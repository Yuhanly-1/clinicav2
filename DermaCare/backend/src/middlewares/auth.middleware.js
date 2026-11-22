const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { query } = require('../config/database');
const { HttpError } = require('../utils/httpError');

const COOKIE_NAME = 'dermacare_token';

function extractToken(req) {
  if (req.cookies && req.cookies[COOKIE_NAME]) return req.cookies[COOKIE_NAME];
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  return null;
}

/**
 * Verifica el JWT y que el usuario siga activo en la base de datos
 * (si un administrador desactiva una cuenta, su sesión deja de ser válida).
 */
async function authenticate(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) throw new HttpError(401, 'Debe iniciar sesión');
    let payload;
    try {
      payload = jwt.verify(token, env.JWT_SECRET);
    } catch {
      throw new HttpError(401, 'La sesión ha expirado o no es válida');
    }
    const { rows } = await query(
      `SELECT u.id, u.nombre, u.email, u.activo, r.codigo AS rol, r.nombre AS rol_nombre,
              d.id AS dermatologo_id
         FROM usuarios u
         JOIN roles r ON r.id = u.rol_id
         LEFT JOIN dermatologos d ON d.usuario_id = u.id
        WHERE u.id = $1`,
      [payload.sub]
    );
    const user = rows[0];
    if (!user || !user.activo) throw new HttpError(401, 'La cuenta no está disponible');
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { authenticate, COOKIE_NAME };
