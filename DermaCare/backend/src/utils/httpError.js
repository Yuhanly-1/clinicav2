class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const badRequest = (msg, details) => new HttpError(400, msg, details);
const notFound = (msg = 'Recurso no encontrado') => new HttpError(404, msg);
const conflict = (msg) => new HttpError(409, msg);
const forbidden = (msg = 'No tiene permisos para realizar esta acción') => new HttpError(403, msg);

/** Envuelve controladores async para enviar errores al middleware. */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { HttpError, badRequest, notFound, conflict, forbidden, asyncHandler };
