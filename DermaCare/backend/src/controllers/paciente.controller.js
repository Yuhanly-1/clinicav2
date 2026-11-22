const pacienteModel = require('../models/paciente.model');
const { Validator, parseId } = require('../utils/validators');
const { asyncHandler, notFound, badRequest, conflict } = require('../utils/httpError');
const { query } = require('../config/database');
const { audit } = require('../utils/audit');

function validate(body) {
  const data = new Validator(body)
    .text('nombres', { label: 'Los nombres', required: true, min: 2, max: 80 })
    .text('apellidos', { label: 'Los apellidos', required: true, min: 2, max: 80 })
    .text('cedula', { label: 'La cédula', max: 20 })
    .date('fecha_nacimiento', { label: 'La fecha de nacimiento', required: true, notFuture: true })
    .oneOf('sexo', ['M', 'F', 'O'], { label: 'El sexo', required: true })
    .phone('telefono', { label: 'El teléfono', required: true })
    .email('email', { label: 'El correo' })
    .text('direccion', { label: 'La dirección', max: 255 })
    .text('antecedentes', { label: 'Los antecedentes', max: 3000 })
    .text('alergias', { label: 'Las alergias', max: 1000 })
    .done();
  if (data.cedula && !/^[0-9A-Za-z-]{5,20}$/.test(data.cedula)) {
    throw badRequest('Hay datos inválidos en el formulario', { cedula: 'La cédula solo admite números, letras y guiones' });
  }
  return data;
}

async function checkDuplicate(data, excludeId) {
  const dup = await pacienteModel.findDuplicate(data, excludeId);
  if (!dup) return;
  if (data.cedula && dup.cedula === data.cedula) throw conflict('Ya existe un paciente registrado con esa cédula');
  throw conflict('Ya existe un paciente con los mismos nombres, apellidos y fecha de nacimiento');
}

const list = asyncHandler(async (req, res) => {
  const { q, campo, estado, sexo, limit } = req.query;
  res.json(await pacienteModel.list(req.user, { q: q && String(q).trim(), campo, estado, sexo, limit }));
});

const getOne = asyncHandler(async (req, res) => {
  const p = await pacienteModel.findById(req.user, parseId(req.params.id));
  if (!p) throw notFound('Paciente no encontrado');
  res.json(p);
});

const create = asyncHandler(async (req, res) => {
  const data = validate(req.body);
  await checkDuplicate(data, 0);
  const id = await pacienteModel.create(data);
  await audit(req, 'CREAR', 'pacientes', id, `${data.nombres} ${data.apellidos}`);
  res.status(201).json(await pacienteModel.findById(req.user, id));
});

const update = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const data = validate(req.body);
  await checkDuplicate(data, id);
  if (!(await pacienteModel.update(id, data))) throw notFound('Paciente no encontrado');
  await audit(req, 'EDITAR', 'pacientes', id, `${data.nombres} ${data.apellidos}`);
  res.json(await pacienteModel.findById(req.user, id));
});

const setEstado = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const activo = req.body && req.body.activo;
  if (typeof activo !== 'boolean') throw badRequest('El campo "activo" debe ser verdadero o falso');
  if (!(await pacienteModel.setActivo(id, activo))) throw notFound('Paciente no encontrado');
  await audit(req, activo ? 'ACTIVAR' : 'DESACTIVAR', 'pacientes', id);
  res.json(await pacienteModel.findById(req.user, id));
});

/** Historial médico completo obtenido desde PostgreSQL. */
const historial = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const paciente = await pacienteModel.findById(req.user, id);
  if (!paciente) throw notFound('Paciente no encontrado o sin acceso');

  const citas = (
    await query(
      `SELECT c.id, c.fecha_inicio, to_char(c.fecha_fin, 'HH24:MI') AS hora_fin, c.motivo, c.estado,
              (d.nombres || ' ' || d.apellidos) AS dermatologo_nombre
         FROM citas c JOIN dermatologos d ON d.id = c.dermatologo_id
        WHERE c.paciente_id = $1 ORDER BY c.fecha_inicio DESC`,
      [id]
    )
  ).rows;

  const consultas = (
    await query(
      `SELECT con.id, con.cita_id, con.fecha_atencion, con.motivo, con.sintomas, con.examen_dermatologico,
              con.tratamiento, con.observaciones,
              (d.nombres || ' ' || d.apellidos) AS dermatologo_nombre, d.especialidad,
              COALESCE((SELECT json_agg(json_build_object('descripcion', dg.descripcion, 'codigo_cie10', dg.codigo_cie10, 'tipo', dg.tipo) ORDER BY dg.tipo, dg.id)
                          FROM diagnosticos dg WHERE dg.consulta_id = con.id), '[]'::json) AS diagnosticos
         FROM consultas con JOIN dermatologos d ON d.id = con.dermatologo_id
        WHERE con.paciente_id = $1 ORDER BY con.fecha_atencion DESC`,
      [id]
    )
  ).rows;

  await audit(req, 'VER_HISTORIAL', 'pacientes', id);
  res.json({ paciente, citas, consultas });
});

module.exports = { list, getOne, create, update, setEstado, historial };
