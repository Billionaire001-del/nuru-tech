const fs = require('node:fs');
const path = require('node:path');
const pool = require('./pool');
(async () => {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(9042026)');
    for (const file of fs.readdirSync(path.join(__dirname, '../../migrations')).filter((f) => f.endsWith('.sql')).sort()) {
      await client.query(fs.readFileSync(path.join(__dirname, '../../migrations', file), 'utf8'));
      console.log(`Applied ${file}`);
    }
  } finally { await client.query('SELECT pg_advisory_unlock(9042026)'); client.release(); await pool.end(); }
})().catch((e) => { console.error(e); process.exit(1); });
