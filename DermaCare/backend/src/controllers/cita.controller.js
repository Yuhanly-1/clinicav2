const citaModel = require('../models/cita.model');
const citaService = require('../services/cita.service');
const { withTransaction } = require('../config/database');
const { Validator, parseId, isValidDate } = require('../utils/validators');
const { asyncHandler, notFound, badRequest, forbidden } = require('../utils/httpError');
const { audit } = require('../utils/audit');

const ESTADOS = ['Pendiente', 'Confirmada', 'En consulta', 'Completada', 'Cancelada'];

function validate(body) {
  return new Validator(body)
    .int('paciente_id', { label: 'El paciente', required: true, min: 1 })
    .int('dermatologo_id', { label: 'El dermatólogo', required: true, min: 1 })
    .date('fecha', { label: 'La fecha', required: true })
    .time('hora', { label: 'La hora', required: true })
    .int('duracion', { label: 'La duración', required: true, min: 15, max: 240 })
    .text('motivo', { label: 'El motivo', required: true, min: 3, max: 500 })
    .done();
}

function parseFilters(q) {
  const f = {};
  for (const k of ['dermatologo_id', 'paciente_id']) if (q[k]) f[k] = parseId(q[k], k);
  for (const k of ['fecha', 'desde', 'hasta']) {
    if (q[k]) {
      if (!isValidDate(q[k])) throw badRequest(`Filtro ${k} inválido`);
      f[k] = q[k];
    }
  }
  if (q.estado) {
    if (!ESTADOS.includes(q.estado)) throw badRequest('Estado inválido');
    f.estado = q.estado;
  }
  if (q.q) f.q = String(q.q).trim().slice(0, 80);
  if (q.limit) f.limit = q.limit;
  return f;
}

async function loadForUser(req, id) {
  const cita = await citaModel.findById(id);
  if (!cita) throw notFound('Cita no encontrada');
  if (req.user.rol === 'dermatologo' && cita.dermatologo_id !== req.user.dermatologo_id) throw forbidden('Esta cita no está asignada a usted');
  return cita;
}

const list = asyncHandler(async (req, res) => {
  res.json(await citaModel.list(req.user, parseFilters(req.query), req.query.orden === 'desc' ? 'DESC' : 'ASC'));
});

const getOne = asyncHandler(async (req, res) => {
  res.json(await loadForUser(req, parseId(req.params.id)));
});

const disponibilidad = asyncHandler(async (req, res) => {
  const dermatologoId = parseId(req.query.dermatologo_id, 'Dermatólogo');
  if (!isValidDate(req.query.fecha || '')) throw badRequest('Fecha inválida');
  const duracion = Number(req.query.duracion || 30);
  if (!Number.isInteger(duracion) || duracion < 15 || duracion > 240) throw badRequest('Duración inválida (15 a 240 minutos)');
  const excluir = req.query.excluir_cita_id ? parseId(req.query.excluir_cita_id) : 0;
  res.json(await citaService.disponibilidad(dermatologoId, req.query.fecha, duracion, excluir));
});

const create = asyncHandler(async (req, res) => {
  const data = validate(req.body);
  const cita = await citaService.guardarCita(data, req.user);
  await audit(req, 'CREAR', 'citas', cita.id, `${cita.paciente_nombre} con ${cita.dermatologo_nombre} el ${cita.fecha} ${cita.hora_inicio}`);
  res.status(201).json(cita);
});

/** Reprogramar / editar: solo citas Pendientes o Confirmadas. */
const update = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const actual = await loadForUser(req, id);
  if (!['Pendiente', 'Confirmada'].includes(actual.estado)) {
    throw badRequest(`No se puede reprogramar una cita en estado "${actual.estado}"`);
  }
  const data = validate(req.body);
  const cita = await citaService.guardarCita(data, req.user, id);
  await audit(req, 'REPROGRAMAR', 'citas', id, `De ${actual.fecha} ${actual.hora_inicio} a ${cita.fecha} ${cita.hora_inicio}`);
  res.json(cita);
});

const cancelar = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const actual = await loadForUser(req, id);
  if (!['Pendiente', 'Confirmada'].includes(actual.estado)) {
    throw badRequest(`No se puede cancelar una cita en estado "${actual.estado}"`);
  }
  const motivo = req.body && req.body.motivo ? String(req.body.motivo).trim().slice(0, 500) : null;
  const cita = await withTransaction(async (client) => {
    await client.query(
      "UPDATE citas SET estado = 'Cancelada', motivo_cancelacion = $2, actualizado_en = CURRENT_TIMESTAMP WHERE id = $1",
      [id, motivo]
    );
    return citaModel.findById(id, client);
  });
  await audit(req, 'CANCELAR', 'citas', id, motivo);
  res.json(cita);
});

/**
 * Cambios de estado permitidos:
 *  - Pendiente -> Confirmada (administrador / recepcionista)
 *  - Pendiente|Confirmada -> En consulta (dermatólogo asignado)
 * "Completada" se asigna automáticamente al registrar la consulta.
 */
const cambiarEstado = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const actual = await loadForUser(req, id);
  const nuevo = req.body && req.body.estado;
  const rol = req.user.rol;
  let permitido = false;
  if (nuevo === 'Confirmada') permitido = ['admin', 'recepcionista'].includes(rol) && actual.estado === 'Pendiente';
  if (nuevo === 'En consulta') permitido = rol === 'dermatologo' && ['Pendiente', 'Confirmada'].includes(actual.estado);
  if (!permitido) throw badRequest(`No se puede cambiar la cita de "${actual.estado}" a "${nuevo || '?'}"`);
  const cita = await withTransaction(async (client) => {
    await client.query('UPDATE citas SET estado = $2, actualizado_en = CURRENT_TIMESTAMP WHERE id = $1', [id, nuevo]);
    return citaModel.findById(id, client);
  });
  await audit(req, 'ESTADO', 'citas', id, `${actual.estado} -> ${nuevo}`);
  res.json(cita);
});

module.exports = { list, getOne, disponibilidad, create, update, cancelar, cambiarEstado, parseFilters, ESTADOS };
