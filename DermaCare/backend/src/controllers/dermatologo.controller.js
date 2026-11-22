const model = require('../models/dermatologo.model');
const { Validator, parseId, TIME_RE } = require('../utils/validators');
const { asyncHandler, notFound, badRequest, conflict } = require('../utils/httpError');
const { audit } = require('../utils/audit');

function validate(body) {
  return new Validator(body)
    .text('nombres', { label: 'Los nombres', required: true, min: 2, max: 80 })
    .text('apellidos', { label: 'Los apellidos', required: true, min: 2, max: 80 })
    .text('exequatur', { label: 'El exequátur', required: true, min: 3, max: 30 })
    .text('especialidad', { label: 'La especialidad', required: true, min: 3, max: 100 })
    .phone('telefono', { label: 'El teléfono', required: true })
    .email('email', { label: 'El correo', required: true })
    .int('usuario_id', { label: 'El usuario asociado', min: 1 })
    .done();
}

async function checkRules(data, excludeId = 0) {
  if (await model.exequaturTaken(data.exequatur, excludeId)) {
    throw conflict('Ya existe un dermatólogo con ese número de exequátur');
  }
  if (data.usuario_id) {
    const u = await model.validUsuarioDermatologo(data.usuario_id, excludeId);
    if (!u) throw badRequest('El usuario asociado no existe');
    if (u.codigo !== 'dermatologo') throw badRequest('El usuario asociado debe tener el rol Dermatólogo');
    if (u.ocupado_por) throw conflict('Ese usuario ya está asociado a otro dermatólogo');
  }
}

const list = asyncHandler(async (req, res) => {
  res.json(await model.list({ q: req.query.q && String(req.query.q).trim(), estado: req.query.estado }));
});

const getOne = asyncHandler(async (req, res) => {
  const d = await model.findById(parseId(req.params.id));
  if (!d) throw notFound('Dermatólogo no encontrado');
  res.json({ ...d, horarios: await model.getHorarios(d.id) });
});

const create = asyncHandler(async (req, res) => {
  const data = validate(req.body);
  await checkRules(data);
  const id = await model.create(data);
  await audit(req, 'CREAR', 'dermatologos', id, `${data.nombres} ${data.apellidos} (${data.exequatur})`);
  res.status(201).json(await model.findById(id));
});

const update = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const data = validate(req.body);
  await checkRules(data, id);
  if (!(await model.update(id, data))) throw notFound('Dermatólogo no encontrado');
  await audit(req, 'EDITAR', 'dermatologos', id, `${data.nombres} ${data.apellidos}`);
  res.json(await model.findById(id));
});

const setEstado = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const activo = req.body && req.body.activo;
  if (typeof activo !== 'boolean') throw badRequest('El campo "activo" debe ser verdadero o falso');
  if (!(await model.setActivo(id, activo))) throw notFound('Dermatólogo no encontrado');
  await audit(req, activo ? 'ACTIVAR' : 'DESACTIVAR', 'dermatologos', id);
  res.json(await model.findById(id));
});

const getHorarios = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  if (!(await model.findById(id))) throw notFound('Dermatólogo no encontrado');
  res.json(await model.getHorarios(id));
});

const setHorarios = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  if (!(await model.findById(id))) throw notFound('Dermatólogo no encontrado');
  const bloques = req.body && req.body.horarios;
  if (!Array.isArray(bloques) || bloques.length > 50) throw badRequest('Debe enviar una lista de bloques de horario');
  const clean = bloques.map((b, i) => {
    const dia = Number(b.dia_semana);
    const ini = String(b.hora_inicio || '').slice(0, 5);
    const fin = String(b.hora_fin || '').slice(0, 5);
    if (!Number.isInteger(dia) || dia < 0 || dia > 6) throw badRequest(`Bloque ${i + 1}: día inválido`);
    if (!TIME_RE.test(ini) || !TIME_RE.test(fin)) throw badRequest(`Bloque ${i + 1}: hora inválida`);
    if (fin <= ini) throw badRequest(`Bloque ${i + 1}: la hora final debe ser posterior a la inicial`);
    return { dia_semana: dia, hora_inicio: ini, hora_fin: fin };
  });
  await model.replaceHorarios(id, clean);
  await audit(req, 'EDITAR_HORARIO', 'dermatologos', id, `${clean.length} bloques`);
  res.json(await model.getHorarios(id));
});

module.exports = { list, getOne, create, update, setEstado, getHorarios, setHorarios };
