const { badRequest } = require('./httpError');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?[0-9\s()-]{7,20}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Etiqueta sin artículo y con mayúscula inicial: 'Los nombres' -> 'Nombres'. */
const L = (l) => { const s = String(l).replace(/^(El|La|Los|Las) /, ''); return s.charAt(0).toUpperCase() + s.slice(1); };
const str = (v) => (v === undefined || v === null ? '' : String(v).trim());
const optional = (v) => {
  const s = str(v);
  return s === '' ? null : s;
};

function isValidDate(s) {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/**
 * Validador sencillo basado en reglas. Acumula errores por campo
 * y lanza un 400 con el detalle si alguno falla.
 */
class Validator {
  constructor(body) {
    this.body = body || {};
    this.errors = {};
    this.data = {};
  }

  fail(field, msg) {
    if (!this.errors[field]) this.errors[field] = msg;
    return this;
  }

  text(field, { label, required = false, min = 0, max = 255 } = {}) {
    const v = str(this.body[field]);
    if (!v) {
      if (required) this.fail(field, `${L(label)}: campo obligatorio`);
      this.data[field] = null;
      return this;
    }
    if (v.length < min) this.fail(field, `${L(label)}: debe tener al menos ${min} caracteres`);
    if (v.length > max) this.fail(field, `${L(label)}: no puede superar ${max} caracteres`);
    this.data[field] = v;
    return this;
  }

  email(field, { label = 'El correo', required = false } = {}) {
    const v = str(this.body[field]).toLowerCase();
    if (!v) {
      if (required) this.fail(field, `${L(label)}: campo obligatorio`);
      this.data[field] = null;
      return this;
    }
    if (!EMAIL_RE.test(v) || v.length > 150) this.fail(field, `${L(label)}: no tiene un formato válido`);
    this.data[field] = v;
    return this;
  }

  phone(field, { label = 'El teléfono', required = false } = {}) {
    const v = str(this.body[field]);
    if (!v) {
      if (required) this.fail(field, `${L(label)}: campo obligatorio`);
      this.data[field] = null;
      return this;
    }
    if (!PHONE_RE.test(v) || v.replace(/\D/g, '').length < 7) this.fail(field, `${L(label)}: no es válido`);
    this.data[field] = v;
    return this;
  }

  date(field, { label, required = false, notFuture = false } = {}) {
    const v = str(this.body[field]);
    if (!v) {
      if (required) this.fail(field, `${L(label)}: campo obligatorio`);
      this.data[field] = null;
      return this;
    }
    if (!isValidDate(v)) return this.fail(field, `${L(label)}: no es una fecha válida`);
    if (v < '1900-01-01') this.fail(field, `${L(label)}: no es válida`);
    if (notFuture && v > new Date().toISOString().slice(0, 10)) this.fail(field, `${L(label)}: no puede ser futura`);
    this.data[field] = v;
    return this;
  }

  time(field, { label, required = false } = {}) {
    const v = str(this.body[field]).slice(0, 5);
    if (!v) {
      if (required) this.fail(field, `${L(label)}: campo obligatorio`);
      this.data[field] = null;
      return this;
    }
    if (!TIME_RE.test(v)) this.fail(field, `${L(label)}: no es una hora válida (HH:MM)`);
    this.data[field] = v;
    return this;
  }

  int(field, { label, required = false, min, max } = {}) {
    const raw = this.body[field];
    if (raw === undefined || raw === null || raw === '') {
      if (required) this.fail(field, `${L(label)}: campo obligatorio`);
      this.data[field] = null;
      return this;
    }
    const n = Number(raw);
    if (!Number.isInteger(n)) return this.fail(field, `${L(label)}: debe ser un número entero`);
    if (min !== undefined && n < min) this.fail(field, `${L(label)}: debe ser mayor o igual a ${min}`);
    if (max !== undefined && n > max) this.fail(field, `${L(label)}: debe ser menor o igual a ${max}`);
    this.data[field] = n;
    return this;
  }

  oneOf(field, values, { label, required = false } = {}) {
    const v = str(this.body[field]);
    if (!v) {
      if (required) this.fail(field, `${L(label)}: campo obligatorio`);
      this.data[field] = null;
      return this;
    }
    if (!values.includes(v)) this.fail(field, `${L(label)}: no es válido`);
    this.data[field] = v;
    return this;
  }

  done() {
    if (Object.keys(this.errors).length) {
      throw badRequest('Hay datos inválidos en el formulario', this.errors);
    }
    return this.data;
  }
}

/** Convierte un parámetro de ruta en ID entero o lanza 400. */
function parseId(value, label = 'ID') {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw badRequest(`${label} inválido`);
  return n;
}

module.exports = { Validator, parseId, isValidDate, optional, str, DATE_RE, TIME_RE };
