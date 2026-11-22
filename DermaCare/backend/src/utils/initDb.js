const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const { pool, query } = require('../config/database');
const env = require('../config/env');

const DB_DIR = path.join(__dirname, '..', '..', '..', 'database');
const BCRYPT_ROUNDS = 12;

/** Ejecuta el esquema (idempotente). */
async function runSchema() {
  const sql = fs.readFileSync(path.join(DB_DIR, 'dermacare.sql'), 'utf8');
  await pool.query(sql);
  console.log('[DB] Esquema verificado');
}

async function upsertUser(nombre, email, password, rolCodigo) {
  const exists = await query('SELECT id FROM usuarios WHERE lower(email) = lower($1)', [email]);
  if (exists.rows.length) return { id: exists.rows[0].id, created: false };
  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const { rows } = await query(
    `INSERT INTO usuarios (nombre, email, password_hash, rol_id)
     VALUES ($1, lower($2), $3, (SELECT id FROM roles WHERE codigo = $4)) RETURNING id`,
    [nombre, email, hash, rolCodigo]
  );
  return { id: rows[0].id, created: true };
}

/** Inicialización segura del administrador desde variables de entorno. */
async function ensureAdmin() {
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
    const { rows } = await query(
      "SELECT COUNT(*)::int AS n FROM usuarios u JOIN roles r ON r.id = u.rol_id WHERE r.codigo = 'admin'"
    );
    if (!rows[0].n) console.warn('[DB] No hay administrador. Defina ADMIN_EMAIL y ADMIN_PASSWORD.');
    return;
  }
  if (env.ADMIN_PASSWORD.length < 8) {
    console.warn('[DB] ADMIN_PASSWORD debe tener al menos 8 caracteres. No se creó el administrador.');
    return;
  }
  const r = await upsertUser(env.ADMIN_NAME, env.ADMIN_EMAIL, env.ADMIN_PASSWORD, 'admin');
  if (r.created) console.log(`[DB] Administrador inicial creado: ${env.ADMIN_EMAIL}`);
}

/** Crea usuarios demo y carga seeds.sql (solo si no hay pacientes). */
async function seedDemo({ force = false } = {}) {
  const { rows } = await query('SELECT COUNT(*)::int AS n FROM pacientes');
  if (rows[0].n > 0 && !force) {
    console.log('[DB] Ya existen datos; se omiten los datos de demostración');
    return;
  }
  if (!env.DEMO_PASSWORD || env.DEMO_PASSWORD.length < 8) {
    console.warn('[DB] Defina DEMO_PASSWORD (mín. 8 caracteres) para crear los usuarios demo.');
    return;
  }
  await upsertUser('Dra. Laura Martínez', 'dra.martinez@dermacare.demo', env.DEMO_PASSWORD, 'dermatologo');
  await upsertUser('Dr. Carlos Santos', 'dr.santos@dermacare.demo', env.DEMO_PASSWORD, 'dermatologo');
  await upsertUser('Recepción Principal', 'recepcion@dermacare.demo', env.DEMO_PASSWORD, 'recepcionista');
  const sql = fs.readFileSync(path.join(DB_DIR, 'seeds.sql'), 'utf8');
  await pool.query(sql);
  console.log('[DB] Datos ficticios de demostración cargados');
}

async function initDatabase() {
  await runSchema();
  await ensureAdmin();
  if (env.SEED_DEMO_DATA) await seedDemo();
}

module.exports = { initDatabase, runSchema, ensureAdmin, seedDemo };

// Uso por CLI: node src/utils/initDb.js [--seed]
if (require.main === module) {
  (async () => {
    try {
      await runSchema();
      await ensureAdmin();
      if (process.argv.includes('--seed')) await seedDemo();
    } catch (err) {
      console.error('[DB] Error:', err.message);
      process.exitCode = 1;
    } finally {
      await pool.end();
    }
  })();
}
