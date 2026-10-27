const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgres://test:test@127.0.0.1:5432/test';
process.env.META_APP_SECRET ||= 'test-app-secret';
process.env.META_VERIFY_TOKEN ||= 'test-verify-token';
process.env.WHATSAPP_ACCESS_TOKEN ||= 'test-token';
process.env.WHATSAPP_PHONE_NUMBER_ID ||= '123456';
process.env.ADMIN_API_KEY ||= 'x'.repeat(40);
const { verifySignature, verifyChallenge } = require('../src/middleware/metaWebhook');
const wa = require('../src/services/whatsapp');
test('signature middleware accepts an authentic raw-body signature', () => {
  const body = Buffer.from('{"object":"whatsapp_business_account"}');
  const sig = `sha256=${crypto.createHmac('sha256', process.env.META_APP_SECRET).update(body).digest('hex')}`;
  const req = { get: () => sig, body }; let called = false;
  verifySignature(req, { sendStatus: (s) => assert.equal(s, 401) }, () => { called = true; });
  assert.equal(called, true);
});
test('signature middleware rejects tampered payload', () => {
  const req = { get: () => `sha256=${'0'.repeat(64)}`, body: Buffer.from('tampered') }; let called = false; let status;
  verifySignature(req, { sendStatus: (s) => { status = s; } }, () => { called = true; });
  assert.equal(called, false); assert.equal(status, 401);
});
test('Meta GET challenge returns challenge only for matching token', () => {
  let status; let contentType; let body;
  const res = { status(s) { status = s; return this; }, type(t) { contentType = t; return this; }, send(v) { body = v; return this; }, sendStatus(s) { status = s; } };
  verifyChallenge({ query: { 'hub.mode': 'subscribe', 'hub.verify_token': process.env.META_VERIFY_TOKEN, 'hub.challenge': 'abc' } }, res);
  assert.equal(status, 200); assert.equal(contentType, 'text/plain'); assert.equal(body, 'abc');
});
test('Cloud API helpers send buttons, lists, templates, media and read receipts', async () => {
  const requests = []; global.fetch = async (url, options) => { requests.push({ url, body: JSON.parse(options.body) }); return { ok: true, json: async () => ({ messages: [{ id: 'wamid.test' }] }) }; };
  await wa.text('15551234567', 'hello');
  await wa.buttons('15551234567', 'Choose', [{ id: 'yes', title: 'Yes' }]);
  await wa.list('15551234567', 'Options', 'View', [{ id: 'one', title: 'Option 1' }]);
  await wa.template('15551234567', 'order_update', 'en_US');
  await wa.image('15551234567', 'https://example.org/a.png');
  await wa.document('15551234567', 'https://example.org/a.pdf', 'a.pdf');
  await wa.markRead('wamid.in');
  assert.equal(requests.length, 7);
  assert.equal(requests[0].body.type, 'text'); assert.equal(requests[1].body.interactive.type, 'button');
  assert.equal(requests[2].body.interactive.type, 'list'); assert.equal(requests[3].body.type, 'template');
  assert.equal(requests[4].body.type, 'image'); assert.equal(requests[5].body.type, 'document');
  assert.equal(requests[6].body.status, 'read');
});
