const { query } = require('../config/database');

/** Registra una acción importante. Nunca interrumpe la operación principal. */
async function audit(req, accion, entidad, entidadId = null, detalle = null, client = null) {
  try {
    const runner = client || { query };
    await runner.query(
      'INSERT INTO auditoria (usuario_id, accion, entidad, entidad_id, detalle) VALUES ($1, $2, $3, $4, $5)',
      [req.user ? req.user.id : null, accion, entidad, entidadId, detalle ? String(detalle).slice(0, 500) : null]
    );
  } catch (err) {
    console.error('[AUDITORIA]', err.message);
  }
}

module.exports = { audit };
