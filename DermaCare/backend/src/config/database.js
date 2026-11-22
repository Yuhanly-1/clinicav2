const { Pool, types } = require('pg');
const env = require('./env');

// Devolver DATE y TIMESTAMP como texto: evita conversiones de zona horaria en Node
types.setTypeParser(1082, (v) => v); // date
types.setTypeParser(1114, (v) => v); // timestamp without time zone
types.setTypeParser(20, (v) => parseInt(v, 10)); // bigint (COUNT)

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  // Cada conexión trabaja en la zona horaria de la clínica
  options: `-c timezone=${env.APP_TIMEZONE}`,
});

pool.on('error', (err) => {
  console.error('[DB] Error inesperado en el pool:', err.message);
});

const query = (text, params) => pool.query(text, params);

/** Ejecuta una función dentro de una transacción (BEGIN/COMMIT/ROLLBACK). */
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, withTransaction };
