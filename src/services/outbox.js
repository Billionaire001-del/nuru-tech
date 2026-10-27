const pool = require('../db/pool');
const log = require('../utils/logger');
const wa = require('./whatsapp');
async function enqueue(waId, payload) { await pool.query('INSERT INTO outbox(wa_id,payload) VALUES($1,$2)', [waId, payload]); }
async function processOne() {
  const client = await pool.connect();
  let row;
  try {
    await client.query('BEGIN');
    const found = await client.query("SELECT * FROM outbox WHERE sent_at IS NULL AND next_attempt_at <= now() AND attempts < 8 ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1");
    if (!found.rowCount) { await client.query('COMMIT'); return false; }
    row = found.rows[0];
    // Lease the row while the API call is in flight so another worker cannot send it concurrently.
    await client.query("UPDATE outbox SET attempts=attempts+1,next_attempt_at=now()+interval '90 seconds' WHERE id=$1", [row.id]);
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  try {
    const p = row.payload;
    await wa[p.method](row.wa_id, ...p.args);
    await pool.query('UPDATE outbox SET sent_at=now(),last_error=NULL WHERE id=$1', [row.id]);
    await pool.query("INSERT INTO messages(wa_id,direction,message_type,body,status) VALUES($1,'out',$2,$3,'sent')", [row.wa_id, p.method, p.args[0] || null]);
  } catch (e) {
    const waitSeconds = Math.min(3600, 2 ** Math.min(row.attempts, 10) * 5);
    await pool.query('UPDATE outbox SET last_error=$2,next_attempt_at=now()+($3 * interval \'1 second\') WHERE id=$1', [row.id, String(e.detail || e.message).slice(0, 500), waitSeconds]);
    log.error({ err: e, outboxId: row.id }, 'WhatsApp send failed; queued for retry');
  }
  return true;
}
module.exports = { enqueue, processOne };
