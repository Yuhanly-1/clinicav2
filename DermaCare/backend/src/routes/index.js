const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorize } = require('../middlewares/role.middleware');

const auth = require('../controllers/auth.controller');
const usuarios = require('../controllers/usuario.controller');
const pacientes = require('../controllers/paciente.controller');
const dermatologos = require('../controllers/dermatologo.controller');
const citas = require('../controllers/cita.controller');
const consultas = require('../controllers/consulta.controller');
const diagnosticos = require('../controllers/diagnostico.controller');
const dashboard = require('../controllers/dashboard.controller');
const reportes = require('../controllers/reporte.controller');

const ADMIN = 'admin';
const DERM = 'dermatologo';
const RECEP = 'recepcionista';

const router = Router();

// Limitar intentos de inicio de sesión (fuerza bruta)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Demasiados intentos de inicio de sesión. Intente nuevamente en 15 minutos.' },
});

router.get('/salud', (req, res) => res.json({ estado: 'ok', servicio: 'DermaCare API' }));

// ---- Autenticación
router.post('/auth/login', loginLimiter, auth.login);
router.post('/auth/logout', auth.logout);
router.get('/auth/me', authenticate, auth.me);

// A partir de aquí todas las rutas requieren sesión
router.use(authenticate);

// ---- Usuarios (solo administrador)
router.get('/usuarios', authorize(ADMIN), usuarios.list);
router.get('/usuarios/:id', authorize(ADMIN), usuarios.getOne);
router.post('/usuarios', authorize(ADMIN), usuarios.create);
router.put('/usuarios/:id', authorize(ADMIN), usuarios.update);
router.patch('/usuarios/:id/estado', authorize(ADMIN), usuarios.setEstado);

// ---- Pacientes
router.get('/pacientes', authorize(ADMIN, RECEP, DERM), pacientes.list);
router.get('/pacientes/:id', authorize(ADMIN, RECEP, DERM), pacientes.getOne);
router.get('/pacientes/:id/historial', authorize(ADMIN, DERM), pacientes.historial);
router.post('/pacientes', authorize(ADMIN, RECEP), pacientes.create);
router.put('/pacientes/:id', authorize(ADMIN, RECEP), pacientes.update);
router.patch('/pacientes/:id/estado', authorize(ADMIN, RECEP), pacientes.setEstado);

// ---- Dermatólogos
router.get('/dermatologos', authorize(ADMIN, RECEP, DERM), dermatologos.list);
router.get('/dermatologos/:id', authorize(ADMIN, RECEP, DERM), dermatologos.getOne);
router.get('/dermatologos/:id/horarios', authorize(ADMIN, RECEP, DERM), dermatologos.getHorarios);
router.put('/dermatologos/:id/horarios', authorize(ADMIN), dermatologos.setHorarios);
router.post('/dermatologos', authorize(ADMIN), dermatologos.create);
router.put('/dermatologos/:id', authorize(ADMIN), dermatologos.update);
router.patch('/dermatologos/:id/estado', authorize(ADMIN), dermatologos.setEstado);

// ---- Citas
router.get('/citas/disponibilidad', authorize(ADMIN, RECEP, DERM), citas.disponibilidad);
router.get('/citas', authorize(ADMIN, RECEP, DERM), citas.list);
router.get('/citas/:id', authorize(ADMIN, RECEP, DERM), citas.getOne);
router.post('/citas', authorize(ADMIN, RECEP), citas.create);
router.put('/citas/:id', authorize(ADMIN, RECEP), citas.update);
router.patch('/citas/:id/cancelar', authorize(ADMIN, RECEP), citas.cancelar);
router.patch('/citas/:id/estado', authorize(ADMIN, RECEP, DERM), citas.cambiarEstado);

// ---- Consultas e historial médico (información clínica protegida)
router.get('/consultas', authorize(ADMIN, DERM), consultas.list);
router.get('/consultas/:id', authorize(ADMIN, DERM), consultas.getOne);
router.post('/consultas', authorize(DERM), consultas.create);
router.get('/diagnosticos', authorize(ADMIN, DERM), diagnosticos.list);
router.get('/diagnosticos/frecuentes', authorize(ADMIN, DERM), diagnosticos.frecuentes);
router.get('/diagnosticos/:id', authorize(ADMIN, DERM), diagnosticos.getOne);

// ---- Dashboard
router.get('/dashboard/notificaciones', dashboard.notificaciones);
router.get('/dashboard/estadisticas', authorize(ADMIN), dashboard.estadisticas);
router.get('/dashboard/citas-mensuales', authorize(ADMIN), dashboard.citasMensuales);
router.get('/dashboard/citas-estado', authorize(ADMIN), dashboard.citasPorEstado);
router.get('/dashboard/consultas-periodo', authorize(ADMIN), dashboard.consultasPeriodo);
router.get('/dashboard/actividad', authorize(ADMIN), dashboard.actividad);
router.get('/dashboard/proximas-citas', authorize(ADMIN), dashboard.proximasCitas);

// ---- Reportes (solo administrador)
router.get('/reportes/pacientes', authorize(ADMIN), reportes.pacientes);
router.get('/reportes/dermatologos', authorize(ADMIN), reportes.dermatologos);
router.get('/reportes/citas', authorize(ADMIN), reportes.citas);
router.get('/reportes/consultas', authorize(ADMIN), reportes.consultas);
router.get('/reportes/actividad', authorize(ADMIN), reportes.actividad);

module.exports = router;
