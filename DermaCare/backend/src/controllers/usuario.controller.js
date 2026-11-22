const bcrypt = require('bcrypt');
const usuarioModel = require('../models/usuario.model');
const { Validator, parseId } = require('../utils/validators');
const { asyncHandler, notFound, badRequest, conflict } = require('../utils/httpError');
const { query } = require('../config/database');
const { audit } = require('../utils/audit');

const ROLES = ['admin', 'dermatologo', 'recepcionista'];

function validate(body, isNew) {
  const v = new Validator(body)
    .text('nombre', { label: 'El nombre', required: true, min: 3, max: 120 })
    .email('email', { label: 'El correo', required: true })
    .oneOf('rol', ROLES, { label: 'El rol', required: true })
    .text('password', { label: 'La contraseña', required: isNew, min: 8, max: 72 });
  return v.done();
}

async function emailTaken(email, excludeId = 0) {
  const { rows } = await query('SELECT 1 FROM usuarios WHERE lower(email) = lower($1) AND id <> $2', [email, excludeId]);
  return rows.length > 0;
}

const list = asyncHandler(async (req, res) => {
  const { q, rol, estado, sin_dermatologo } = req.query;
  res.json(await usuarioModel.list({ q, rol, estado, sinDermatologo: sin_dermatologo === 'true' }));
});

const getOne = asyncHandler(async (req, res) => {
  const u = await usuarioModel.findById(parseId(req.params.id));
  if (!u) throw notFound('Usuario no encontrado');
  res.json(u);
});

const create = asyncHandler(async (req, res) => {
  const data = validate(req.body, true);
  if (await emailTaken(data.email)) throw conflict('Ya existe un usuario con ese correo');
  const passwordHash = await bcrypt.hash(data.password, 12);
  const u = await usuarioModel.create({ ...data, passwordHash });
  await audit(req, 'CREAR', 'usuarios', u.id, `Usuario ${u.email} (${u.rol})`);
  res.status(201).json(u);
});

const update = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const data = validate(req.body, false);
  if (await emailTaken(data.email, id)) throw conflict('Ya existe un usuario con ese correo');
  if (id === req.user.id && data.rol !== 'admin') throw badRequest('No puede quitarse a sí mismo el rol de administrador');
  const current = await usuarioModel.findById(id);
  if (!current) throw notFound('Usuario no encontrado');
  if (current.dermatologo_id && data.rol !== 'dermatologo') {
    throw badRequest('El usuario está asociado a un dermatólogo; desvincúlelo antes de cambiar el rol');
  }
  const passwordHash = data.password ? await bcrypt.hash(data.password, 12) : null;
  const u = await usuarioModel.update(id, { ...data, passwordHash });
  await audit(req, 'EDITAR', 'usuarios', id, data.password ? 'Datos y contraseña actualizados' : 'Datos actualizados');
  res.json(u);
});

const setEstado = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const activo = req.body && req.body.activo;
  if (typeof activo !== 'boolean') throw badRequest('El campo "activo" debe ser verdadero o falso');
  if (id === req.user.id && !activo) throw badRequest('No puede desactivar su propia cuenta');
  const u = await usuarioModel.setActivo(id, activo);
  if (!u) throw notFound('Usuario no encontrado');
  await audit(req, activo ? 'ACTIVAR' : 'DESACTIVAR', 'usuarios', id, u.email);
  res.json(u);
});

module.exports = { list, getOne, create, update, setEstado };
