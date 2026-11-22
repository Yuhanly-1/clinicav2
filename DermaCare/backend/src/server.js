const env = require('./config/env');
const app = require('./app');
const { pool } = require('./config/database');
const { initDatabase } = require('./utils/initDb');

async function start() {
  try {
    if (process.env.SKIP_DB_INIT !== 'true') await initDatabase();
  } catch (err) {
    console.error('[DB] No se pudo inicializar la base de datos:', err.message);
    process.exit(1);
  }
  const server = app.listen(env.PORT, '0.0.0.0', () => {
    console.log(`[DermaCare] Servidor escuchando en el puerto ${env.PORT} (${env.NODE_ENV})`);
  });

  const shutdown = () => {
    server.close(() => pool.end().finally(() => process.exit(0)));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start();
