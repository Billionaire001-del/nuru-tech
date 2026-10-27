const crypto = require('node:crypto');
const config = require('../config');
function verifySignature(req, res, next) {
  const supplied = req.get('x-hub-signature-256') || '';
  if (!/^sha256=[a-f0-9]{64}$/i.test(supplied) || !Buffer.isBuffer(req.body)) return res.sendStatus(401);
  const expected = `sha256=${crypto.createHmac('sha256', config.META_APP_SECRET).update(req.body).digest('hex')}`;
  const a = Buffer.from(supplied); const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? next() : res.sendStatus(401);
}
function verifyChallenge(req, res) {
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
  if (mode === 'subscribe' && token === config.META_VERIFY_TOKEN && typeof challenge === 'string') return res.status(200).type('text/plain').send(challenge);
  return res.sendStatus(403);
}
module.exports = { verifySignature, verifyChallenge };
