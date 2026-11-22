const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env'), quiet: true });

const required = ['DATABASE_URL', 'JWT_SECRET'];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`[CONFIG] Falta la variable de entorno obligatoria: ${key}`);
    process.exit(1);
  }
}

const tz = process.env.APP_TIMEZONE || 'America/Santo_Domingo';
if (!/^[A-Za-z_]+(\/[A-Za-z_]+)*$/.test(tz)) {
  console.error('[CONFIG] APP_TIMEZONE no es válida');
  process.exit(1);
}

module.exports = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '3000', 10),
  DATABASE_URL: process.env.DATABASE_URL,
  DATABASE_SSL: String(process.env.DATABASE_SSL || 'false').toLowerCase() === 'true',
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '8h',
  APP_TIMEZONE: tz,
  CORS_ORIGIN: process.env.CORS_ORIGIN || '',
  ADMIN_NAME: process.env.ADMIN_NAME || 'Administrador DermaCare',
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || '',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || '',
  DEMO_PASSWORD: process.env.DEMO_PASSWORD || '',
  SEED_DEMO_DATA: String(process.env.SEED_DEMO_DATA || 'false').toLowerCase() === 'true',
  get isProd() {
    return this.NODE_ENV === 'production';
  },
};
