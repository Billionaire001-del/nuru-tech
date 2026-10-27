const express = require('express');
const crypto = require('node:crypto');
const { z } = require('zod');
const pool = require('../db/pool');
const config = require('../config');
const { enqueue } = require('../services/outbox');
const router = express.Router();
function auth(req, res, next) {
  const token = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(token); const b = Buffer.from(config.ADMIN_API_KEY);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.sendStatus(401);
  next();
}
router.use(auth);
const limitQuery = (req) => Math.min(500, Math.max(1, Number.parseInt(req.query.limit, 10) || 100));
router.get('/leads', async (req, res, next) => { try { res.json((await pool.query('SELECT * FROM leads ORDER BY created_at DESC LIMIT $1', [limitQuery(req)])).rows); } catch(e) { next(e); } });
router.patch('/leads/:id', async (req, res, next) => {
  const parsed = z.object({ status: z.enum(['new','contacted','qualified','converted','closed']) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid lead status' });
  try { const r = await pool.query('UPDATE leads SET status=$1,updated_at=now() WHERE id=$2 RETURNING *', [parsed.data.status, req.params.id]); return r.rowCount ? res.json(r.rows[0]) : res.sendStatus(404); } catch(e) { next(e); }
});
router.get('/bookings', async (req, res, next) => { try { res.json((await pool.query('SELECT * FROM bookings ORDER BY booking_at DESC LIMIT $1', [limitQuery(req)])).rows); } catch(e) { next(e); } });
router.patch('/bookings/:id', async (req, res, next) => {
  const parsed = z.object({ status: z.enum(['requested','confirmed','cancelled','completed']) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid booking status' });
  try { const r = await pool.query('UPDATE bookings SET status=$1 WHERE id=$2 RETURNING *', [parsed.data.status, req.params.id]); return r.rowCount ? res.json(r.rows[0]) : res.sendStatus(404); } catch(e) { next(e); }
});
router.get('/orders', async (req, res, next) => { try { res.json((await pool.query('SELECT * FROM orders ORDER BY created_at DESC LIMIT $1', [limitQuery(req)])).rows); } catch(e) { next(e); } });
router.patch('/orders/:id', async (req, res, next) => {
  const parsed = z.object({ status: z.enum(['requested','confirmed','fulfilled','cancelled']) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid order status' });
  try { const r = await pool.query('UPDATE orders SET status=$1,updated_at=now() WHERE id=$2 RETURNING *', [parsed.data.status, req.params.id]); return r.rowCount ? res.json(r.rows[0]) : res.sendStatus(404); } catch(e) { next(e); }
});
router.post('/send-template', async (req, res, next) => {
  const parsed = z.object({ to: z.string().regex(/^\+?[1-9]\d{6,14}$/), name: z.string().regex(/^[a-z0-9_]{1,128}$/), language: z.string().regex(/^[a-z]{2,3}_[A-Z]{2,3}$/), components: z.array(z.unknown()).max(10).default([]) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid template request' });
  try { await enqueue(parsed.data.to.replace(/^\+/, ''), { method: 'template', args: [parsed.data.name, parsed.data.language, parsed.data.components] }); res.status(202).json({ status: 'queued', template: parsed.data.name }); } catch(e) { next(e); }
});
router.get('/conversations', async (req, res, next) => { try { res.json((await pool.query('SELECT c.wa_id,c.state,c.human_requested,c.last_seen_at,c.created_at,(SELECT count(*) FROM messages m WHERE m.wa_id=c.wa_id) AS message_count FROM conversations c ORDER BY c.last_seen_at DESC LIMIT $1', [limitQuery(req)])).rows); } catch(e) { next(e); } });
router.get('/analytics', async (_req, res, next) => {
  try {
    const q = await pool.query(`SELECT (SELECT count(*) FROM messages) AS total_messages,(SELECT count(*) FROM conversations WHERE last_seen_at > now()-interval '30 days') AS active_users,(SELECT count(*) FROM leads WHERE created_at > date_trunc('month',now())) AS new_leads,(SELECT count(*) FROM bookings WHERE created_at > date_trunc('month',now())) AS bookings,(SELECT count(*) FROM orders WHERE created_at > date_trunc('month',now())) AS orders`);
    const common = await pool.query("SELECT lower(left(body,120)) AS question,count(*) AS count FROM messages WHERE direction='in' AND body IS NOT NULL GROUP BY 1 ORDER BY count DESC LIMIT 10");
    res.json({ ...q.rows[0], common_questions: common.rows });
  } catch(e) { next(e); }
});
function csvEscape(v) { let s = v == null ? '' : v instanceof Date ? v.toISOString() : String(v); if (/^[\s]*[=+\-@]/.test(s)) s = `'${s}`; return `"${s.replaceAll('"','""')}"`; }
router.get('/export/:kind', async (req, res, next) => {
  const choices = { leads: 'SELECT id,wa_id,full_name,phone,email,location,request,status,created_at FROM leads ORDER BY created_at DESC', bookings: 'SELECT id,wa_id,full_name,phone,service,booking_at,notes,status,created_at FROM bookings ORDER BY created_at DESC', orders: 'SELECT id,wa_id,full_name,phone,item_description,quantity,status,created_at FROM orders ORDER BY created_at DESC' };
  if (!choices[req.params.kind]) return res.status(400).json({ error: 'kind must be leads, bookings, or orders' });
  try { const rows = (await pool.query(choices[req.params.kind])).rows; const headers = rows.length ? Object.keys(rows[0]) : []; const csv = [headers.map(csvEscape).join(','), ...rows.map((r) => headers.map((h) => csvEscape(r[h])).join(','))].join('\r\n'); res.type('text/csv').attachment(`${req.params.kind}.csv`).send(csv); } catch(e) { next(e); }
});
module.exports = router;
