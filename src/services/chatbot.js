const pool = require('../db/pool');
const config = require('../config');
const { enqueue } = require('./outbox');
const log = require('../utils/logger');
const aiResponder = require('./aiResponder');
const menu = `Welcome to ${config.BUSINESS_NAME}. How can we help?`;
const menuOptions = [{ id: 'lead', title: 'Request information' }, { id: 'booking', title: 'Book an appointment' }, { id: 'order', title: 'Place an order' }, { id: 'faq', title: 'FAQs' }];
const enqueueText = (to, body) => enqueue(to, { method: 'text', args: [body] });
const enqueueButtons = (to, body, items) => enqueue(to, { method: 'buttons', args: [body, items] });
const enqueueList = (to, body, button, rows) => enqueue(to, { method: 'list', args: [body, button, rows] });
const clean = (v) => String(v || '').trim().slice(0, 1000);
function selected(message) { return message.interactive?.button_reply?.id || message.interactive?.list_reply?.id || message.text?.body || ''; }
async function reply(to, message) {
  const raw = clean(selected(message)); const value = raw.toLowerCase();
  const q = await pool.query('INSERT INTO conversations(wa_id) VALUES($1) ON CONFLICT(wa_id) DO UPDATE SET last_seen_at=now(),updated_at=now() RETURNING state,human_requested', [to]);
  const state = q.rows[0].state || { step: 'menu' };
  const remember = async (next) => pool.query('UPDATE conversations SET state=$2,updated_at=now() WHERE wa_id=$1', [to, next]);
  const answerWithAi = async () => { const answer = await aiResponder.respond(raw); if (!answer) return false; await enqueueText(to, answer); return true; };
  if (q.rows[0].human_requested) { await enqueueText(to, 'Your request is with our team. A team member will follow up as soon as possible. Reply MENU to use the automated menu.'); if (value === 'menu') { await pool.query('UPDATE conversations SET human_requested=false WHERE wa_id=$1', [to]); } else return; }
  if (value === 'menu' || value === 'hi' || value === 'hello' || value === 'start') {
    await remember({ step: 'menu' }); await enqueueList(to, menu, 'View options', menuOptions.concat([{ id: 'human', title: 'Talk to a person' }])); return;
  }
  if (value === 'lead' || value.includes('information') || value === 'contact' || value.includes('quote')) { await remember({ step: 'lead_name', form: {} }); await enqueueText(to, 'I can help with that. What is your full name?'); return; }
  if (value === 'booking' || value.includes('appointment') || value === 'book' || value.includes('schedule') || value.includes('reserve')) { await remember({ step: 'book_service', form: {} }); await enqueueText(to, 'What service would you like to book?'); return; }
  if (value === 'order' || value.includes('place an order') || value === 'purchase' || value.startsWith('buy ')) { await remember({ step: 'order_item', form: {} }); await enqueueText(to, 'What would you like to order? Please describe the item or service.'); return; }
  if (value === 'human' || value.includes('agent') || value.includes('person') || value.includes('support')) { await pool.query("UPDATE conversations SET human_requested=true,state='{" + '"step":"human"' + "}'::jsonb WHERE wa_id=$1", [to]); await enqueueText(to, 'I’ve notified our team. A human agent will follow up shortly.'); return; }
  if (value === 'faq' || value.includes('frequently asked')) { await remember({ step: 'menu' }); await enqueueText(to, 'Frequently asked questions: reply HOURS for opening hours, LOCATION for our location, or PRICE for pricing. Reply MENU to see options.'); return; }
  if (value === 'hours' || /\b(open|opening hours|business hours|close|available)\b/.test(value)) { if (await answerWithAi()) return; await enqueueText(to, 'I do not have verified opening hours yet. Reply MENU and choose Request information or Talk to a person.'); return; }
  if (value === 'location' || /\b(where|address|located)\b/.test(value)) { if (await answerWithAi()) return; await enqueueText(to, 'I do not have a verified location yet. Reply MENU and choose Request information or Talk to a person.'); return; }
  if (value === 'price' || value === 'pricing' || /\b(price|cost|how much)\b/.test(value)) { if (await answerWithAi()) return; await enqueueText(to, 'I do not have verified pricing yet. Reply MENU and choose Request information or Talk to a person.'); return; }
  if (state.step?.startsWith('lead_')) {
    const form = { ...(state.form || {}) };
    const fields = { lead_name: ['full_name', 'What is your phone number?'], lead_phone: ['phone', 'What is your email address? (or type skip)'], lead_email: ['email', 'What city or area are you in?'], lead_location: ['location', 'Please describe what you need.'], lead_request: ['request', null] };
    if (state.step === 'lead_phone' && !/^\+?[1-9]\d{6,14}$/.test(raw.replace(/[\s()-]/g, ''))) { await enqueueText(to, 'Please enter a valid phone number including country code, such as +15551234567.'); return; }
    if (state.step === 'lead_email' && value !== 'skip' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) { await enqueueText(to, 'That email address does not look valid. Please try again or type skip.'); return; }
    const [field, prompt] = fields[state.step]; form[field] = value === 'skip' && field === 'email' ? null : raw;
    if (field === 'phone') form.phone = raw.replace(/[\s()-]/g, '');
    if (state.step === 'lead_request') {
      await pool.query('INSERT INTO leads(wa_id,full_name,phone,email,location,request) VALUES($1,$2,$3,$4,$5,$6)', [to, form.full_name, form.phone || to, form.email, form.location, form.request]);
      await remember({ step: 'menu' }); await enqueueText(to, 'Thank you. Your request has been recorded and our team will follow up soon.'); return;
    }
    await remember({ step: Object.keys(fields)[Object.keys(fields).indexOf(state.step) + 1], form }); await enqueueText(to, prompt); return;
  }
  if (state.step?.startsWith('book_')) {
    const form = { ...(state.form || {}) };
    if (state.step === 'book_service') { if (!raw) { await enqueueText(to, 'Please enter the service you would like to book.'); return; } form.service = raw; await remember({ step: 'book_date', form }); await enqueueText(to, 'What date and time would you prefer? Use ISO format with timezone, e.g. 2026-11-10T14:00:00+03:00.'); return; }
    if (state.step === 'book_date') { if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})$/.test(raw)) { await enqueueText(to, 'Please include a date, time, and timezone, e.g. 2026-11-10T14:00:00+03:00.'); return; } const d = new Date(raw); if (Number.isNaN(d.getTime())) { await enqueueText(to, 'I could not parse that date. Please send a date/time such as 2026-11-10T14:00:00+03:00.'); return; } form.booking_at = d.toISOString(); await remember({ step: 'book_name', form }); await enqueueText(to, 'What is your full name?'); return; }
    if (state.step === 'book_name') { form.full_name = raw; await remember({ step: 'book_phone', form }); await enqueueText(to, 'What phone number should we use to confirm?'); return; }
    if (!/^\+?[1-9]\d{6,14}$/.test(raw.replace(/[\s()-]/g, ''))) { await enqueueText(to, 'Please enter a valid phone number including country code, such as +15551234567.'); return; }
    await pool.query('INSERT INTO bookings(wa_id,full_name,phone,service,booking_at) VALUES($1,$2,$3,$4,$5)', [to, form.full_name, raw.replace(/[\s()-]/g, ''), form.service, form.booking_at]);
    await remember({ step: 'menu' }); await enqueueText(to, `Thanks ${form.full_name}. Your ${form.service} booking request for ${form.booking_at} has been received. We will confirm shortly.`); return;
  }
  if (state.step?.startsWith('order_')) {
    const form = { ...(state.form || {}) };
    if (state.step === 'order_item') { if (!raw) { await enqueueText(to, 'Please describe the item or service you would like to order.'); return; } form.item_description = raw; await remember({ step: 'order_quantity', form }); await enqueueText(to, 'What quantity would you like? Enter a number from 1 to 99.'); return; }
    if (state.step === 'order_quantity') { const quantity = Number.parseInt(raw, 10); if (!/^\d+$/.test(raw) || quantity < 1 || quantity > 99) { await enqueueText(to, 'Please enter a whole number from 1 to 99.'); return; } form.quantity = quantity; await remember({ step: 'order_name', form }); await enqueueText(to, 'What is your full name?'); return; }
    if (state.step === 'order_name') { form.full_name = raw; await remember({ step: 'order_phone', form }); await enqueueText(to, 'What phone number should we use to follow up?'); return; }
    if (!/^\+?[1-9]\d{6,14}$/.test(raw.replace(/[\s()-]/g, ''))) { await enqueueText(to, 'Please enter a valid phone number including country code, such as +15551234567.'); return; }
    const phone = raw.replace(/[\s()-]/g, '');
    await pool.query('INSERT INTO orders(wa_id,full_name,phone,item_description,quantity) VALUES($1,$2,$3,$4,$5)', [to, form.full_name, phone, form.item_description, form.quantity]);
    await remember({ step: 'menu' }); await enqueueText(to, `Thanks ${form.full_name}. Your order request for ${form.quantity} × ${form.item_description} has been received. Our team will confirm availability and follow up.`); return;
  }
  log.info({ wa_id: to, messageType: message.type }, 'Using chatbot fallback');
  if (await answerWithAi()) return;
  await enqueueButtons(to, `Sorry, I didn’t understand that. Choose an option or ask for a person.`, [{ id: 'lead', title: 'Request information' }, { id: 'booking', title: 'Book' }, { id: 'human', title: 'Talk to a person' }]);
}
module.exports = { reply, menu };
