const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const enabled = Boolean(process.env.TEST_DATABASE_URL);
test('PostgreSQL integration: persists a lead, booking, and order through chatbot turns', { skip: !enabled }, async () => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.META_APP_SECRET ||= 'integration-secret';
  process.env.META_VERIFY_TOKEN ||= 'integration-verify';
  process.env.WHATSAPP_ACCESS_TOKEN ||= 'integration-token';
  process.env.WHATSAPP_PHONE_NUMBER_ID ||= '123456';
  process.env.ADMIN_API_KEY ||= 'integration-admin-key-with-32-chars';
  const pool = require('../src/db/pool');
  const client = await pool.connect();
  const leadsWaId = `1${crypto.randomInt(100000000, 999999999)}`;
  const bookingWaId = `${leadsWaId}1`;
  const orderWaId = `${leadsWaId}2`;
  const chatbot = require('../src/services/chatbot');
  try {
    const migrationsDir = path.join(__dirname, '../migrations');
    for (const file of fs.readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()) await client.query(fs.readFileSync(path.join(migrationsDir, file), 'utf8'));
    const send = (waId, body) => chatbot.reply(waId, { type: 'text', text: { body } });
    await send(leadsWaId, 'lead');
    for (const answer of ['Test Customer', '+15551234567', 'test@example.com', 'Nairobi', 'Integration test request']) await send(leadsWaId, answer);
    const lead = await client.query('SELECT full_name,phone,email,location,request FROM leads WHERE wa_id=$1 ORDER BY id DESC LIMIT 1', [leadsWaId]);
    assert.deepEqual(lead.rows[0], { full_name: 'Test Customer', phone: '+15551234567', email: 'test@example.com', location: 'Nairobi', request: 'Integration test request' });
    await send(bookingWaId, 'booking');
    for (const answer of ['Test consultation', '2026-11-10T14:00:00+03:00', 'Test Booker', '+15557654321']) await send(bookingWaId, answer);
    const booking = await client.query('SELECT full_name,phone,service,booking_at FROM bookings WHERE wa_id=$1 ORDER BY id DESC LIMIT 1', [bookingWaId]);
    assert.equal(booking.rows[0].full_name, 'Test Booker');
    assert.equal(booking.rows[0].phone, '+15557654321');
    assert.equal(booking.rows[0].service, 'Test consultation');
    assert.equal(new Date(booking.rows[0].booking_at).toISOString(), '2026-11-10T11:00:00.000Z');
    await send(orderWaId, 'order');
    for (const answer of ['Automation kit', '2', 'Test Orderer', '+15559876543']) await send(orderWaId, answer);
    const order = await client.query('SELECT full_name,phone,item_description,quantity FROM orders WHERE wa_id=$1 ORDER BY id DESC LIMIT 1', [orderWaId]);
    assert.deepEqual(order.rows[0], { full_name: 'Test Orderer', phone: '+15559876543', item_description: 'Automation kit', quantity: 2 });
  } finally {
    await client.query('DELETE FROM outbox WHERE wa_id = ANY($1)', [[leadsWaId, bookingWaId, orderWaId]]);
    await client.query('DELETE FROM leads WHERE wa_id = ANY($1)', [[leadsWaId, bookingWaId, orderWaId]]);
    await client.query('DELETE FROM bookings WHERE wa_id = ANY($1)', [[leadsWaId, bookingWaId, orderWaId]]);
    await client.query('DELETE FROM orders WHERE wa_id = ANY($1)', [[leadsWaId, bookingWaId, orderWaId]]);
    await client.query('DELETE FROM conversations WHERE wa_id = ANY($1)', [[leadsWaId, bookingWaId, orderWaId]]);
    client.release();
    await pool.end();
  }
});
