const env = require('../config/env');

const PG_MESSAGES = {
  '23505': 'Ya existe un registro con esos datos (valor duplicado)',
  '23P01': 'El horario seleccionado se superpone con otro registro existente',
  '23503': 'La operación hace referencia a un registro inexistente o protegido',
  '23514': 'Los datos no cumplen las reglas de validación',
  '22P02': 'Formato de dato inválido',
  '22007': 'Fecha u hora inválida',
  '22008': 'Fecha u hora fuera de rango',
};

function notFoundHandler(req, res) {
  res.status(404).json({ error: 'Ruta no encontrada' });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'El cuerpo de la solicitud no es JSON válido' });
  }
  if (err.status && err.status < 500) {
    return res.status(err.status).json({ error: err.message, detalles: err.details });
  }
  if (err.code && PG_MESSAGES[err.code]) {
    const status = ['23505', '23P01'].includes(err.code) ? 409 : 400;
    return res.status(status).json({ error: PG_MESSAGES[err.code] });
  }
  console.error('[ERROR]', err);
  res.status(500).json({
    error: 'Error interno del servidor',
    ...(env.isProd ? {} : { debug: err.message }),
  });
}

module.exports = { notFoundHandler, errorHandler };
