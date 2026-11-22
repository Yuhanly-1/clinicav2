const consultaModel = require('../models/consulta.model');
const { withTransaction } = require('../config/database');
const { Validator, parseId, isValidDate } = require('../utils/validators');
const { asyncHandler, notFound, badRequest, conflict, forbidden } = require('../utils/httpError');
const { audit } = require('../utils/audit');

function validate(body) {
  const data = new Validator(body)
    .int('cita_id', { label: 'La cita', required: true, min: 1 })
    .text('motivo', { label: 'El motivo de consulta', required: true, min: 3, max: 2000 })
    .text('sintomas', { label: 'Los síntomas', required: true, min: 3, max: 4000 })
    .text('examen_dermatologico', { label: 'El examen dermatológico', required: true, min: 3, max: 4000 })
    .text('tratamiento', { label: 'El tratamiento', required: true, min: 3, max: 4000 })
    .text('observaciones', { label: 'Las observaciones', max: 4000 })
    .done();
  const diags = Array.isArray(body.diagnosticos) ? body.diagnosticos : [];
  const clean = diags
    .map((d) => ({
      descripcion: String((d && d.descripcion) || '').trim(),
      codigo_cie10: String((d && d.codigo_cie10) || '').trim().toUpperCase() || null,
      tipo: d && d.tipo === 'Secundario' ? 'Secundario' : 'Principal',
    }))
    .filter((d) => d.descripcion);
  if (!clean.length) throw badRequest('Hay datos inválidos en el formulario', { diagnosticos: 'Debe registrar al menos un diagnóstico' });
  if (clean.length > 10) throw badRequest('Máximo 10 diagnósticos por consulta');
  for (const d of clean) {
    if (d.descripcion.length < 3 || d.descripcion.length > 500) throw badRequest('Cada diagnóstico debe tener entre 3 y 500 caracteres');
    if (d.codigo_cie10 && !/^[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$/.test(d.codigo_cie10)) throw badRequest(`Código CIE-10 inválido: ${d.codigo_cie10}`);
  }
  data.diagnosticos = clean;
  return data;
}

const list = asyncHandler(async (req, res) => {
  const f = {};
  for (const k of ['paciente_id', 'dermatologo_id']) if (req.query[k]) f[k] = parseId(req.query[k]);
  for (const k of ['desde', 'hasta']) {
    if (req.query[k]) {
      if (!isValidDate(req.query[k])) throw badRequest(`Filtro ${k} inválido`);
      f[k] = req.query[k];
    }
  }
  if (req.query.q) f.q = String(req.query.q).trim().slice(0, 80);
  res.json(await consultaModel.list(req.user, f));
});

const getOne = asyncHandler(async (req, res) => {
  const c = await consultaModel.findById(req.user, parseId(req.params.id));
  if (!c) throw notFound('Consulta no encontrada');
  res.json(c);
});

/**
 * Registra la consulta de una cita en una transacción:
 * bloquea la cita, valida, inserta consulta + diagnósticos y marca la cita como Completada.
 */
const create = asyncHandler(async (req, res) => {
  const data = validate(req.body || {});
  if (!req.user.dermatologo_id) throw forbidden('Su usuario no está asociado a un dermatólogo');

  const id = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT c.id, c.estado, c.paciente_id, c.dermatologo_id, p.activo AS paciente_activo, d.activo AS derm_activo
         FROM citas c JOIN pacientes p ON p.id = c.paciente_id JOIN dermatologos d ON d.id = c.dermatologo_id
        WHERE c.id = $1 FOR UPDATE OF c`,
      [data.cita_id]
    );
    const cita = rows[0];
    if (!cita) throw notFound('La cita indicada no existe');
    if (cita.dermatologo_id !== req.user.dermatologo_id) throw forbidden('Esta cita no está asignada a usted');
    if (!cita.paciente_activo) throw badRequest('El paciente de la cita está inactivo');
    if (!cita.derm_activo) throw badRequest('El dermatólogo de la cita está inactivo');
    const existe = await client.query('SELECT id FROM consultas WHERE cita_id = $1', [cita.id]);
    if (existe.rows.length) throw conflict('Esta cita ya tiene una consulta registrada');
    if (!['Confirmada', 'En consulta'].includes(cita.estado)) {
      throw badRequest(`Solo se pueden atender citas Confirmadas o En consulta (estado actual: ${cita.estado})`);
    }
    const ins = await client.query(
      `INSERT INTO consultas (cita_id, paciente_id, dermatologo_id, motivo, sintomas, examen_dermatologico, tratamiento, observaciones, creado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [cita.id, cita.paciente_id, cita.dermatologo_id, data.motivo, data.sintomas, data.examen_dermatologico, data.tratamiento, data.observaciones, req.user.id]
    );
    const consultaId = ins.rows[0].id;
    for (const d of data.diagnosticos) {
      await client.query(
        'INSERT INTO diagnosticos (consulta_id, descripcion, codigo_cie10, tipo) VALUES ($1, $2, $3, $4)',
        [consultaId, d.descripcion, d.codigo_cie10, d.tipo]
      );
    }
    await client.query("UPDATE citas SET estado = 'Completada', actualizado_en = CURRENT_TIMESTAMP WHERE id = $1", [cita.id]);
    await audit(req, 'CREAR', 'consultas', consultaId, `Cita #${cita.id} completada`, client);
    return consultaId;
  });
  res.status(201).json(await consultaModel.findById(req.user, id));
});

module.exports = { list, getOne, create };
