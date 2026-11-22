const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { query } = require('../config/database');
const usuarioModel = require('../models/usuario.model');
const { Validator } = require('../utils/validators');
const { HttpError, asyncHandler } = require('../utils/httpError');
const { COOKIE_NAME } = require('../middlewares/auth.middleware');
const { audit } = require('../utils/audit');

// Hash de referencia para igualar tiempos cuando el usuario no existe
const DUMMY_HASH = bcrypt.hashSync('dermacare-referencia', 12);

const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'strict',
  secure: env.isProd,
  path: '/',
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = new Validator(req.body)
    .email('email', { label: 'El correo', required: true })
    .text('password', { label: 'La contraseña', required: true, max: 128 })
    .done();

  const user = await usuarioModel.findByEmailWithHash(email);
  const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok) throw new HttpError(401, 'Correo o contraseña incorrectos');
  if (!user.activo) throw new HttpError(403, 'Su cuenta está desactivada. Contacte al administrador.');

  const token = jwt.sign({ sub: user.id, rol: user.rol }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });
  await usuarioModel.touchLogin(user.id);
  req.user = user;
  await audit(req, 'LOGIN', 'usuarios', user.id, 'Inicio de sesión');

  res.cookie(COOKIE_NAME, token, { ...cookieOptions(), maxAge: 8 * 60 * 60 * 1000 });
  res.json({
    mensaje: 'Sesión iniciada correctamente',
    usuario: { id: user.id, nombre: user.nombre, email: user.email, rol: user.rol, rol_nombre: user.rol_nombre },
  });
});

const logout = asyncHandler(async (req, res) => {
  res.clearCookie(COOKIE_NAME, cookieOptions());
  res.json({ mensaje: 'Sesión cerrada' });
});

const me = asyncHandler(async (req, res) => {
  const { rows } = await query("SELECT CURRENT_DATE::text AS hoy, to_char(LOCALTIMESTAMP, 'HH24:MI') AS ahora");
  const u = req.user;
  res.json({
    usuario: {
      id: u.id, nombre: u.nombre, email: u.email, rol: u.rol, rol_nombre: u.rol_nombre,
      dermatologo_id: u.dermatologo_id,
    },
    hoy: rows[0].hoy,
    ahora: rows[0].ahora,
  });
});

module.exports = { login, logout, me };
