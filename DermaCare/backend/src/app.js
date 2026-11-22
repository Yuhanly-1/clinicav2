const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const env = require('./config/env');
const apiRoutes = require('./routes');
const { notFoundHandler, errorHandler } = require('./middlewares/error.middleware');

const app = express();
const FRONTEND_DIR = path.join(__dirname, '..', '..', 'frontend');
const NODE_MODULES = path.join(__dirname, '..', 'node_modules');

app.set('trust proxy', 1); // detrás del proxy HTTPS de Render
app.disable('x-powered-by');

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'self'"],
        upgradeInsecureRequests: null,
      },
    },
  })
);

// CORS solo si el frontend se publica en otro dominio (por defecto, mismo origen)
if (env.CORS_ORIGIN) {
  app.use(cors({ origin: env.CORS_ORIGIN.split(',').map((s) => s.trim()), credentials: true }));
}

app.use(express.json({ limit: '200kb' }));
app.use(cookieParser());

// API REST
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
app.use('/api', apiRoutes);
app.use('/api', notFoundHandler);

// Librerías del frontend servidas localmente (sin CDN)
const vendor = {
  bootstrap: 'bootstrap/dist',
  'bootstrap-icons': 'bootstrap-icons/font',
  chartjs: 'chart.js/dist',
  poppins: '@fontsource/poppins',
  inter: '@fontsource/inter',
};
for (const [route, dir] of Object.entries(vendor)) {
  app.use(`/vendor/${route}`, express.static(path.join(NODE_MODULES, dir), { maxAge: '7d' }));
}

// Frontend estático (HTML, CSS y JavaScript puro)
app.use(express.static(FRONTEND_DIR, { extensions: ['html'], maxAge: env.isProd ? '1h' : 0 }));
app.get('/', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'index.html')));
app.use((req, res) => res.status(404).sendFile(path.join(FRONTEND_DIR, 'index.html')));

app.use(errorHandler);

module.exports = app;
