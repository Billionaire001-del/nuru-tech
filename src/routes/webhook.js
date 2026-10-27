const express = require('express');
const rateLimit = require('express-rate-limit');
const pool = require('../db/pool');
const { verifySignature, verifyChallenge } = require('../middleware/metaWebhook');
const chatbot = require('../services/chatbot');
const wa = require('../services/whatsapp');
const log = require('../utils/logger');
const router = express.Router();
router.use(rateLimit({ windowMs: 60_000, limit: 1000, standardHeaders: true, legacyHeaders: false }));
router.get('/', verifyChallenge);
router.post('/', express.raw({ type: 'application/json', limit: '1mb' }), verifySignature, async (req, res) => {
  let payload;
  try { payload = JSON.parse(req.body.toString('utf8')); } catch { return res.sendStatus(400); }
  // Meta expects a fast 200; processing is scheduled after acknowledgement.
  res.sendStatus(200);
  setImmediate(async () => {
    try {
      if (payload.object !== 'whatsapp_business_account') return;
      for (const entry of payload.entry || []) for (const change of entry.changes || []) {
        for (const msg of change.value?.messages || []) {
          const from = msg.from;
          if (!from || !msg.id) continue;
          const inserted = await pool.query("INSERT INTO messages(wa_message_id,wa_id,direction,message_type,body) VALUES($1,$2,'in',$3,$4) ON CONFLICT(wa_message_id) DO NOTHING RETURNING id", [msg.id, from, msg.type || 'unknown', msg.text?.body || null]);
          if (!inserted.rowCount) continue;
          wa.markRead(msg.id).catch((err) => log.warn({ err }, 'Unable to mark message read'));
          await chatbot.reply(from, msg);
        }
      }
    } catch (err) { log.error({ err }, 'Webhook processing failed after acknowledgement'); }
  });
});
module.exports = router;
