const { Pool } = require('pg');
const config = require('../config');
const pool = new Pool({ connectionString: config.DATABASE_URL, ssl: config.DATABASE_SSL ? { rejectUnauthorized: true } : false, max: 15, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 });
pool.on('error', (err) => require('../utils/logger').error({ err }, 'Unexpected idle PostgreSQL client error'));
module.exports = pool;
