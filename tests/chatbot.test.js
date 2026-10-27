const test = require('node:test');
const assert = require('node:assert/strict');
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgres://test:test@127.0.0.1:5432/test';
process.env.META_APP_SECRET ||= 'test-app-secret';
process.env.META_VERIFY_TOKEN ||= 'test-verify-token';
process.env.WHATSAPP_ACCESS_TOKEN ||= 'test-token';
process.env.WHATSAPP_PHONE_NUMBER_ID ||= '123456';
process.env.ADMIN_API_KEY ||= 'x'.repeat(40);
process.env.AI_API_KEY ||= 'test-ai-key';
process.env.AI_BASE_URL ||= 'https://ai.example.test/v1';
process.env.AI_MODEL ||= 'test-chat-model';
process.env.BUSINESS_KNOWLEDGE ||= 'We provide automation consulting.';
const pool = require('../src/db/pool');
const chatbot = require('../src/services/chatbot');
const states = new Map(); const records = { leads: [], bookings: [], orders: [], outbound: [] };
pool.query = async (sql, values = []) => {
  if (sql.includes('INSERT INTO conversations')) {
    const waId = values[0]; if (!states.has(waId)) states.set(waId, { step: 'menu' });
    return { rows: [{ state: states.get(waId), human_requested: false }] };
  }
  if (sql.includes('UPDATE conversations SET state=$2')) { states.set(values[0], values[1]); return { rows: [] }; }
  if (sql.includes('UPDATE conversations SET human_requested=false')) return { rows: [] };
  if (sql.includes('UPDATE conversations SET human_requested=true')) return { rows: [] };
  if (sql.includes('INSERT INTO leads')) { records.leads.push(values); return { rows: [] }; }
  if (sql.includes('INSERT INTO bookings')) { records.bookings.push(values); return { rows: [] }; }
  if (sql.includes('INSERT INTO orders')) { records.orders.push(values); return { rows: [] }; }
  if (sql.includes('INSERT INTO outbox')) { records.outbound.push(values); return { rows: [] }; }
  throw new Error(`Unexpected test query: ${sql}`);
};
test('lead capture progresses through requested fields and saves a lead', async () => {
  const user = '15550000001';
  await chatbot.reply(user, { type: 'text', text: { body: 'lead' } });
  await chatbot.reply(user, { type: 'text', text: { body: 'Ada Lovelace' } });
  await chatbot.reply(user, { type: 'text', text: { body: '+15551234567' } });
  await chatbot.reply(user, { type: 'text', text: { body: 'ada@example.com' } });
  await chatbot.reply(user, { type: 'text', text: { body: 'Nairobi' } });
  await chatbot.reply(user, { type: 'text', text: { body: 'Automation consultation' } });
  assert.equal(records.leads.length, 1);
  assert.deepEqual(records.leads[0], [user, 'Ada Lovelace', '+15551234567', 'ada@example.com', 'Nairobi', 'Automation consultation']);
  assert.equal(states.get(user).step, 'menu');
});
test('booking flow validates date and records a booking request', async () => {
  const user = '15550000002';
  await chatbot.reply(user, { type: 'text', text: { body: 'booking' } });
  await chatbot.reply(user, { type: 'text', text: { body: 'Workflow review' } });
  await chatbot.reply(user, { type: 'text', text: { body: '2026-11-10T14:00:00+03:00' } });
  await chatbot.reply(user, { type: 'text', text: { body: 'Grace Hopper' } });
  await chatbot.reply(user, { type: 'text', text: { body: '+15557654321' } });
  assert.equal(records.bookings.length, 1);
  assert.equal(records.bookings[0][1], 'Grace Hopper');
  assert.equal(records.bookings[0][3], 'Workflow review');
  assert.equal(new Date(records.bookings[0][4]).toISOString(), '2026-11-10T11:00:00.000Z');
  assert.equal(states.get(user).step, 'menu');
});
test('human request sends a handoff response and sets handoff state', async () => {
  const user = '15550000003';
  await chatbot.reply(user, { type: 'text', text: { body: 'human' } });
  assert.equal(records.outbound.at(-1)[0], user);
  assert.match(records.outbound.at(-1)[1].args[0], /notified our team/i);
});
test('order flow rejects invalid quantity and stores a customer order request', async () => {
  const user = '15550000004';
  await chatbot.reply(user, { type: 'text', text: { body: 'order' } });
  await chatbot.reply(user, { type: 'text', text: { body: 'Automation starter kit' } });
  await chatbot.reply(user, { type: 'text', text: { body: '0' } });
  assert.equal(states.get(user).step, 'order_quantity');
  await chatbot.reply(user, { type: 'text', text: { body: '2' } });
  await chatbot.reply(user, { type: 'text', text: { body: 'Katherine Johnson' } });
  await chatbot.reply(user, { type: 'text', text: { body: '+15553456789' } });
  assert.deepEqual(records.orders.at(-1), [user, 'Katherine Johnson', '+15553456789', 'Automation starter kit', 2]);
  assert.equal(states.get(user).step, 'menu');
});
test('unmatched customer text gets a contextual AI reply instead of the fallback menu', async () => {
  const oldFetch = global.fetch;
  global.fetch = async (_url, options) => {
    const request = JSON.parse(options.body);
    assert.equal(request.messages[1].content, 'Can you explain what automation consulting is?');
    return { ok: true, json: async () => ({ choices: [{ message: { content: 'We help businesses streamline repetitive workflows.' } }] }) };
  };
  try {
    await chatbot.reply('15550000005', { type: 'text', text: { body: 'Can you explain what automation consulting is?' } });
    assert.equal(records.outbound.at(-1)[1].args[0], 'We help businesses streamline repetitive workflows.');
  } finally { global.fetch = oldFetch; }
});
